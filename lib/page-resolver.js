import { visitUrl } from './browser-manager.js';
import { getProxyForDomain } from './proxy-config.js';
import { getCapture } from './manual-capture.js';
import { recordResult } from './domain-strategy.js';

function hostnameOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/**
 * Resolves a URL to renderable HTML through progressively more resilient
 * tiers, stopping at the first that works:
 *   1. direct visit with the shared stealth browser
 *   2. a domain-dedicated proxy, if one is configured in proxies.json
 *   3. a previously submitted manual capture (real browser, real session)
 * Records the outcome in the domain-strategy store either way, so the UI can
 * warn about domains that are known to need a proxy or manual capture.
 */
export async function resolvePage(url, opts = {}) {
  const hostname = hostnameOf(url);

  let attempt = await visitUrl(url, opts);
  if (!attempt.blockResult.blocked) {
    await recordResult(url, { blocked: false, strategy: 'direct' });
    return { ...attempt, strategy: 'direct' };
  }

  const proxyUrl = hostname ? await getProxyForDomain(hostname) : null;
  if (proxyUrl) {
    const proxyAttempt = await visitUrl(url, { ...opts, proxyUrl });
    if (!proxyAttempt.blockResult.blocked) {
      await recordResult(url, {
        blocked: false,
        strategy: 'proxy',
        provider: proxyAttempt.blockResult.provider,
      });
      return { ...proxyAttempt, strategy: 'proxy' };
    }
    attempt = proxyAttempt;
  }

  const capture = await getCapture(url);
  if (capture?.html) {
    await recordResult(url, { blocked: false, strategy: 'manual-capture' });
    return {
      blockResult: {
        blocked: false,
        confidence: null,
        provider: null,
        reason: null,
        matchedSignals: [],
        status: 200,
      },
      html: capture.html,
      css: null,
      strategy: 'manual-capture',
    };
  }

  await recordResult(url, {
    blocked: true,
    provider: attempt.blockResult.provider,
    strategy: null,
  });

  return { ...attempt, strategy: null };
}
