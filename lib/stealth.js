// Baseline automation-fingerprint evasions applied to every page.
// Deliberately hand-rolled instead of depending on puppeteer-extra-plugin-stealth,
// which has been unmaintained since 2023 and is not verified against current
// puppeteer/Chromium releases. Covers the checks bot-detection scripts run most often.

const EVASION_SCRIPT = `
(() => {
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

  window.chrome = window.chrome || { runtime: {} };

  const originalQuery = window.navigator.permissions.query;
  window.navigator.permissions.query = (parameters) =>
    parameters.name === 'notifications'
      ? Promise.resolve({ state: Notification.permission })
      : originalQuery(parameters);

  Object.defineProperty(navigator, 'plugins', {
    get: () => [1, 2, 3, 4, 5].map(() => ({ name: 'Chrome PDF Plugin' })),
  });

  Object.defineProperty(navigator, 'languages', {
    get: () => ['pt-BR', 'pt', 'en-US', 'en'],
  });

  const getParameter = WebGLRenderingContext.prototype.getParameter;
  WebGLRenderingContext.prototype.getParameter = function (parameter) {
    if (parameter === 37445) return 'Intel Inc.';
    if (parameter === 37446) return 'Intel Iris OpenGL Engine';
    return getParameter.call(this, parameter);
  };
})();
`;

export async function applyStealthEvasions(page) {
  await page.evaluateOnNewDocument(EVASION_SCRIPT);
}
