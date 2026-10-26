import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';
import postcss from 'postcss';
import { applyStealthEvasions } from './stealth.js';
import { detectBlock } from './block-detector.js';

const LAUNCH_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-blink-features=AutomationControlled',
  '--disable-dev-shm-usage',
  '--window-size=1920,1080',
];

// Persistent browser profile to store Akamai cookies (_abck, bm_sz) and reputation
const PROFILE_DIR = path.join(process.cwd(), 'data', 'browser-profile');

function cleanupStaleLocks(dir) {
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      return;
    }
    const lockFiles = ['SingletonLock', 'SingletonSocket', 'SingletonCookie'];
    for (const f of lockFiles) {
      const p = path.join(dir, f);
      if (fs.existsSync(p)) {
        try {
          fs.unlinkSync(p);
        } catch {}
      }
    }
  } catch {}
}

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
const SENSOR_WARMUP_DELAY_MS = 1200;
const SCROLL_STEPS = 3;
const SCROLL_STEP_DELAY_MS = 350;

let browserInstance = null;
let launchPromise = null;
const proxyBrowsers = new Map(); // proxyUrl -> { browser, auth }

function launchBrowser(extraArgs = [], useProfile = true) {
  if (useProfile) {
    cleanupStaleLocks(PROFILE_DIR);
  }

  const options = {
    headless: true,
    args: [...LAUNCH_ARGS, ...extraArgs],
    ignoreHTTPSErrors: true,
  };

  if (useProfile) {
    options.userDataDir = PROFILE_DIR;
  }

  return puppeteer.launch(options);
}

// Shared across the whole batch job: one real, current-Chromium browser
// instance (with cookies persisted in its default context) instead of
// letting critical/penthouse spin up their own bundled, years-out-of-date one.
export async function getSharedBrowser() {
  if (browserInstance && browserInstance.connected) {
    return browserInstance;
  }

  if (!launchPromise) {
    launchPromise = launchBrowser([], true)
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
  const browser = await launchBrowser([`--proxy-server=${server}`], false);
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

// Optional pass to surface lazy content if requested (disabled by default for pure critical CSS)
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
    // non-fatal
  }
}

/**
 * Intelligent Akamai Bot Manager solver loop.
 * Monitors the _abck cookie status: if challenge is pending (~-1~),
 * triggers natural organic micro-events and waits for sensor clearance (~0~).
 */
async function checkAndHandleAkamai(page, timeoutMs = 4500) {
  try {
    const cookies = await page.cookies();
    const abck = cookies.find((c) => c.name === '_abck');
    const bmSz = cookies.find((c) => c.name === 'bm_sz');

    if (!abck && !bmSz) {
      return { isAkamai: false, cleared: true };
    }

    const hasChallengePending = abck && abck.value.includes('~-1~');
    if (!hasChallengePending) {
      return { isAkamai: true, cleared: true, abck: abck?.value };
    }

    console.log('  🛡️ Desafio Akamai em andamento (_abck pendente). Simulando telemetria orgânica...');

    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      // Natural pointer movements trigger Akamai sensor event handlers
      const x = 120 + Math.floor(Math.random() * 300);
      const y = 100 + Math.floor(Math.random() * 250);
      await page.mouse.move(x, y, { steps: 4 }).catch(() => {});
      await delay(600);

      const latestCookies = await page.cookies().catch(() => []);
      const latestAbck = latestCookies.find((c) => c.name === '_abck');
      if (latestAbck && latestAbck.value.includes('~0~')) {
        console.log('  ✅ Desafio Akamai liberado com sucesso (_abck: ~0~)!');
        return { isAkamai: true, cleared: true, abck: latestAbck.value };
      }
    }

    return { isAkamai: true, cleared: false, abck: abck?.value };
  } catch (err) {
    return { isAkamai: false, cleared: true };
  }
}

/**
 * Visits `url` with an advanced stealth-patched browser: checks response for
 * WAF/Akamai challenges, resolves cookies, and captures a fully self-contained
 * snapshot with inline stylesheets ready for Penthouse extraction.
 *
 * @param {string} url
 * @param {object} [opts]
 * @param {number} [opts.timeout=30000]
 * @param {object} [opts.viewport=DEFAULT_VIEWPORT]
 * @param {string|null} [opts.proxyUrl=null]
 * @param {boolean} [opts.isolateFirstFold=true] - When true, skips full-page scrolling to avoid below-the-fold contamination
 */
export async function visitUrl(
  url,
  {
    timeout = 30000,
    viewport = DEFAULT_VIEWPORT,
    proxyUrl = null,
    isolateFirstFold = true,
  } = {},
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

    // Natural browser language header (do not force document/navigate Sec-Fetch headers across subresources)
    await page.setExtraHTTPHeaders({
      'accept-language': 'es-ES,es;q=0.9,pt-BR;q=0.8,pt;q=0.7,en-US;q=0.6,en;q=0.5',
    });

    const response = await page.goto(url, { waitUntil: 'networkidle2', timeout });
    await delay(SENSOR_WARMUP_DELAY_MS);

    // Akamai active check and sensor resolution
    await checkAndHandleAkamai(page);

    const [html, title] = await Promise.all([page.content(), page.title()]);
    const status = response ? response.status() : 0;
    const headers = response ? response.headers() : {};

    const blockResult = detectBlock({ status, headers, html, title });

    if (blockResult.blocked) {
      return { blockResult, html: null, css: null };
    }

    // Only scroll if explicitly requested; otherwise keep strictly First Fold pure
    if (!isolateFirstFold) {
      await triggerLazyContent(page);
    } else {
      // Natural tiny mouse movement on top of page
      await page.mouse.move(200, 150, { steps: 3 }).catch(() => {});
    }

    const sheets = [];
    for (const header of styleSheetHeaders.values()) {
      try {
        const { text } = await client.send('CSS.getStyleSheetText', {
          styleSheetId: header.styleSheetId,
        });
        if (text && text.trim()) sheets.push({ header, text });
      } catch {
        // skip unparsable sheets (e.g. UA default sheet)
      }
    }

    const ignoredRules = collectRuleKeys(
      sheets
        .filter(({ header }) => isIgnoredStylesheet(header.sourceURL))
        .map(({ text }) => text),
    );

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

    // Inlines all page CSS so `critical` never re-fetches via Node got client
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
