import puppeteer from 'puppeteer';
import postcss from 'postcss';
import { applyStealthEvasions } from './stealth.js';
import { detectBlock } from './block-detector.js';
import { sanitizeCss } from './css-sanitizer.js';

const LAUNCH_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-blink-features=AutomationControlled',
  '--disable-dev-shm-usage',
];

// Stylesheets never fed to critical CSS generation (sprite/icon libraries,
// print sheets, third-party widgets). Matched against the sheet's source URL.
export const IGNORED_STYLESHEETS = [
  'library-svgs', // library-svgs.css, library-svgs-login.css
  'print.css',
  'jquery-ui.css',
  'ln_tint_global.css',
  'ln_tint_connector_styles',
  'ln_srh_menuiq',
  'mmiq-new.css',
];

function isIgnoredStylesheet(sourceURL) {
  return (
    !!sourceURL && IGNORED_STYLESHEETS.some((file) => sourceURL.includes(file))
  );
}

function ruleKey(rule) {
  const decls = rule.nodes
    .filter((n) => n.type === 'decl')
    .map((d) => `${d.prop}:${d.value.replace(/\s+/g, ' ').trim()}`)
    .join(';');
  return `${rule.selector.replace(/\s+/g, ' ').trim()}{${decls}}`;
}

function collectRuleKeys(cssTexts) {
  const keys = new Set();
  for (const css of cssTexts) {
    try {
      postcss.parse(css).walkRules((rule) => keys.add(ruleKey(rule)));
    } catch {
      // unparsable sheet: nothing to collect
    }
  }
  return keys;
}

function removeRules(css, keys) {
  if (keys.size === 0) return css;
  try {
    const root = postcss.parse(css);
    let removed = 0;
    root.walkRules((rule) => {
      if (keys.has(ruleKey(rule))) {
        rule.remove();
        removed++;
      }
    });
    return removed > 0 ? root.toString() : css;
  } catch {
    return css;
  }
}

// Once every sheet is merged into one inline <style>, relative url()s would
// resolve against the page instead of the CSS file they came from
// (e.g. `url(../img/svgs/x.svg)` from /css/main.css). Make them absolute
// against the sheet's own URL while we still know it.
function rebaseCssUrls(css, sourceURL) {
  if (!sourceURL || !/^https?:/i.test(sourceURL)) return css;
  return css.replace(
    /url\(\s*(['"]?)([^'")]+?)\1\s*\)/gi,
    (match, quote, ref) => {
      if (/^(data:|blob:|#|[a-z][a-z0-9+.-]*:)/i.test(ref.trim())) return match;
      try {
        return `url(${quote}${new URL(ref.trim(), sourceURL).href}${quote})`;
      } catch {
        return match;
      }
    },
  );
}

const DEFAULT_VIEWPORT = { width: 1366, height: 768 };
const SENSOR_WARMUP_DELAY_MS = 800;
const SCROLL_STEPS = 3;
const SCROLL_STEP_DELAY_MS = 350;

let browserInstance = null;
let launchPromise = null;
const proxyBrowsers = new Map(); // proxyUrl -> { browser, auth }

function launchBrowser(extraArgs = []) {
  return puppeteer.launch({
    headless: true,
    args: [...LAUNCH_ARGS, ...extraArgs],
    ignoreHTTPSErrors: true,
  });
}

// Shared across the whole batch job: one real, current-Chromium browser
// instance (with cookies persisted in its default context) instead of
// letting critical/penthouse spin up their own bundled, years-out-of-date one.
export async function getSharedBrowser() {
  if (browserInstance && browserInstance.connected) {
    return browserInstance;
  }

  if (!launchPromise) {
    launchPromise = launchBrowser()
      .then((browser) => {
        browserInstance = browser;
        browser.once('disconnected', () => {
          browserInstance = null;
        });
        return browser;
      })
      .finally(() => {
        launchPromise = null;
      });
  }

  return launchPromise;
}

function parseProxyUrl(proxyUrl) {
  const parsed = new URL(proxyUrl);
  return {
    server: `${parsed.protocol}//${parsed.host}`,
    auth: parsed.username ? { username: parsed.username, password: parsed.password } : null,
  };
}

// A domain-specific proxy needs its own browser instance: puppeteer applies
// --proxy-server at launch time, not per page. Kept one per distinct proxy
// URL and reused across visits in the same run.
async function getBrowserForProxy(proxyUrl) {
  const existing = proxyBrowsers.get(proxyUrl);
  if (existing && existing.browser.connected) {
    return existing;
  }

  const { server, auth } = parseProxyUrl(proxyUrl);
  const browser = await launchBrowser([`--proxy-server=${server}`]);
  browser.once('disconnected', () => proxyBrowsers.delete(proxyUrl));
  const entry = { browser, auth };
  proxyBrowsers.set(proxyUrl, entry);
  return entry;
}

// penthouse defaults to the UA string "Penthouse Critical Path CSS Generator"
// when none is given, which is just as much of a giveaway as a custom bot UA.
// Use the real browser's own Chromium UA instead.
export async function getRealUserAgent(browser) {
  const targetBrowser = browser || (await getSharedBrowser());
  const userAgent = await targetBrowser.userAgent();
  // Chrome's "new" headless mode still self-reports as "HeadlessChrome" in the
  // UA string even though it otherwise behaves like regular Chrome; strip that
  // one word rather than fabricate a UA that could mismatch real capabilities.
  return userAgent.replace('HeadlessChrome', 'Chrome');
}

export async function closeSharedBrowser() {
  if (browserInstance) {
    await browserInstance.close().catch(() => {});
    browserInstance = null;
  }
  for (const { browser } of proxyBrowsers.values()) {
    await browser.close().catch(() => {});
  }
  proxyBrowsers.clear();
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Best-effort pass to surface content/CSS that only appears after scrolling
// (lazy-loaded sections, code-split CSS chunks, infinite-scroll widgets).
// Any stylesheet this triggers still gets picked up because the
// CSS.styleSheetAdded listener stays attached for the whole visit.
async function triggerLazyContent(page) {
  try {
    const scrollHeight = await page.evaluate(() => document.body.scrollHeight);
    for (let step = 1; step <= SCROLL_STEPS; step += 1) {
      await page.evaluate(
        (y) => window.scrollTo(0, y),
        Math.round((scrollHeight / SCROLL_STEPS) * step),
      );
      await delay(SCROLL_STEP_DELAY_MS);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await delay(SCROLL_STEP_DELAY_MS);
  } catch {
    // non-fatal: some pages block scrolling or navigate away on scroll
  }
}

/**
 * Visits `url` with a stealth-patched browser: checks the response for
 * WAF/bot-challenge signals, and — when the page isn't blocked — also
 * captures a fully self-contained snapshot of it (HTML with every stylesheet
 * the browser actually loaded, including anything revealed by scrolling,
 * inlined as <style>).
 *
 * This matters because `critical` (the CSS extraction library) never lets a
 * browser touch the live URL: it fetches the HTML and every linked CSS file
 * itself via `got`, a plain Node HTTP client with no real browser TLS/HTTP2
 * fingerprint, then hands penthouse a local temp file to render. A WAF that
 * blocks `got`'s request (even though a real browser passes fine) never shows
 * up as a "generate() failed" error — it just silently feeds penthouse the
 * WAF's block/challenge page instead of the real one. Rendering the page
 * ourselves and handing `critical` the already-fetched result sidesteps that
 * `got` request entirely for the parts that matter (HTML + CSS).
 *
 * Cookies set during this visit (e.g. Akamai's _abck/bm_sz) stay in the
 * browser's default context for subsequent visits in the same run.
 *
 * Pass `proxyUrl` to route this specific visit through a domain-dedicated
 * proxy (its own browser instance) instead of the shared no-proxy one.
 */
export async function visitUrl(
  url,
  { timeout = 30000, viewport = DEFAULT_VIEWPORT, proxyUrl = null } = {},
) {
  const proxyEntry = proxyUrl ? await getBrowserForProxy(proxyUrl) : null;
  const browser = proxyEntry ? proxyEntry.browser : await getSharedBrowser();
  const proxyAuth = proxyEntry ? proxyEntry.auth : null;

  const page = await browser.newPage();
  const client = await page.createCDPSession();
  const styleSheetHeaders = new Map();

  client.on('CSS.styleSheetAdded', (event) => {
    styleSheetHeaders.set(event.header.styleSheetId, event.header);
  });

  try {
    if (proxyAuth) await page.authenticate(proxyAuth);

    await client.send('DOM.enable');
    await client.send('CSS.enable');

    await applyStealthEvasions(page);
    await page.setViewport(viewport);
    await page.setUserAgent(await getRealUserAgent(browser));
    await page.setExtraHTTPHeaders({
      'accept-language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
    });

    const response = await page.goto(url, { waitUntil: 'networkidle2', timeout });
    await delay(SENSOR_WARMUP_DELAY_MS);

    const [html, title] = await Promise.all([page.content(), page.title()]);
    const status = response ? response.status() : 0;
    const headers = response ? response.headers() : {};

    const blockResult = detectBlock({ status, headers, html, title });

    if (blockResult.blocked) {
      return { blockResult, html: null, css: null };
    }

    await triggerLazyContent(page);

    const sheets = [];
    for (const header of styleSheetHeaders.values()) {
      try {
        const { text } = await client.send('CSS.getStyleSheetText', {
          styleSheetId: header.styleSheetId,
        });
        if (text && text.trim()) {
          const sanitized = sanitizeCss(text);
          if (sanitized && sanitized.trim()) {
            sheets.push({ header, text: sanitized });
          }
        }
      } catch {
        // some stylesheets (e.g. the browser's own UA stylesheet) can't be
        // read back this way; skip them rather than fail the whole page
      }
    }

    // Rules from ignored stylesheets can also show up copied into other
    // sheets — typically a previously inlined critical CSS <style>, whose
    // relative url()s then resolve against the page and 404. Collect them so
    // those copies are dropped too.
    const ignoredRules = collectRuleKeys(
      sheets
        .filter(({ header }) => isIgnoredStylesheet(header.sourceURL))
        .map(({ text }) => text),
    );

    // Likewise, an inline <style> repeating rules from an external sheet has
    // lost that sheet's base URL; keep only the external (correctly rebased)
    // copy.
    const externalRules = collectRuleKeys(
      sheets
        .filter(({ header }) => !header.isInline)
        .map(({ text }) => text),
    );

    const cssChunks = [];
    const criticalCssChunks = [];
    for (const { header, text } of sheets) {
      const sourceURL = header.sourceURL || url;
      cssChunks.push(rebaseCssUrls(text, sourceURL));
      if (!isIgnoredStylesheet(header.sourceURL)) {
        let critical = removeRules(text, ignoredRules);
        if (header.isInline) critical = removeRules(critical, externalRules);
        criticalCssChunks.push(rebaseCssUrls(critical, sourceURL));
      }
    }

    // Strip the original <link>/<style> tags and replace them with a single
    // <style> holding everything we just read via CDP, so `critical` finds
    // all the page's real CSS inline and never tries to (re-)fetch it itself.
    // Ignored stylesheets (IGNORED_STYLESHEETS) are left out of the snapshot
    // so they never reach the critical CSS, but stay in the full CSS export.
    await page.evaluate((css) => {
      document
        .querySelectorAll('link[rel="stylesheet"], link[rel="preload"][as="style"], style')
        .forEach((el) => el.remove());
      const style = document.createElement('style');
      style.textContent = css;
      document.head.prepend(style);
    }, criticalCssChunks.join('\n'));

    const selfContainedHtml = await page.content();

    return { blockResult, html: selfContainedHtml, css: cssChunks.join('\n') };
  } catch (error) {
    return {
      blockResult: {
        blocked: true,
        confidence: 'medium',
        provider: null,
        reason: `Falha ao carregar a página: ${error.message}`,
        matchedSignals: ['navigation_error'],
        status: 0,
      },
      html: null,
      css: null,
    };
  } finally {
    await client.detach().catch(() => {});
    await page.close().catch(() => {});
  }
}
