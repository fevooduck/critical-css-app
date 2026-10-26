// Advanced stealth evasions tailored for Akamai Bot Manager, Cloudflare, and modern bot detection.
// Injects realistic browser signatures, userAgentData (Client Hints), chrome runtime objects,
// and removes automated testing markers.

const EVASION_SCRIPT = `
(() => {
  try {
    // 1. Properly mask navigator.webdriver on Navigator.prototype
    const proto = Object.getPrototypeOf(navigator);
    if ('webdriver' in proto) {
      delete proto.webdriver;
    }
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
      configurable: true,
      enumerable: true,
    });

    // 2. Realistic window.chrome ecosystem
    window.chrome = {
      app: {
        isInstalled: false,
        InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
        RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' },
        getDetails: function () { return null; },
        getIsInstalled: function () { return false; },
        installState: function () { return 'not_installed'; },
        runningState: function () { return 'cannot_run'; },
      },
      csi: function () {
        return {
          startE: Date.now() - 300,
          onloadT: Date.now() - 50,
          pageT: 250,
          tran: 15,
        };
      },
      loadTimes: function () {
        const now = Date.now() / 1000;
        return {
          requestTime: now - 0.3,
          startLoadTime: now - 0.25,
          commitLoadTime: now - 0.2,
          finishDocumentLoadTime: now - 0.1,
          firstPaintTime: now - 0.08,
          finishLoadTime: now - 0.05,
          wasFetchedViaSpdy: true,
          wasNpnNegotiated: true,
          npnNegotiatedProtocol: 'h2',
          connectionInfo: 'h2',
        };
      },
      runtime: {
        OnInstalledReason: { CHROME_UPDATE: 'chrome_update', INSTALL: 'install', SHARED_MODULE_UPDATE: 'shared_module_update', UPDATE: 'update' },
        OnRestartRequiredReason: { APP_UPDATE: 'app_update', OS_UPDATE: 'os_update', PERIODIC: 'periodic' },
        PlatformArch: { ARM: 'arm', ARM64: 'arm64', MIPS: 'mips', MIPS64: 'mips64', X86_32: 'x86-32', X86_64: 'x86-64' },
        PlatformNaclArch: { ARM: 'arm', MIPS: 'mips', MIPS64: 'mips64', X86_32: 'x86-32', X86_64: 'x86-64' },
        PlatformOs: { ANDROID: 'android', CROS: 'cros', LINUX: 'linux', MAC: 'mac', OPENBSD: 'openbsd', WIN: 'win' },
        RequestUpdateCheckStatus: { NO_UPDATE: 'no_update', THROTTLED: 'throttled', UPDATE_AVAILABLE: 'update_available' },
      },
    };

    // 3. Mock navigator.userAgentData (Client Hints) - crucial for modern Akamai checks
    if (!navigator.userAgentData) {
      const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
      const isMac = /Macintosh|Mac OS/i.test(navigator.userAgent);
      const platformName = isMobile ? (navigator.userAgent.includes('iPhone') ? 'iOS' : 'Android') : (isMac ? 'macOS' : 'Windows');

      const brands = [
        { brand: 'Chromium', version: '130' },
        { brand: 'Google Chrome', version: '130' },
        { brand: 'Not?A_Brand', version: '99' },
      ];

      const userAgentData = {
        brands,
        mobile: isMobile,
        platform: platformName,
        getHighEntropyValues: async (hints) => {
          const values = {
            brands,
            mobile: isMobile,
            platform: platformName,
          };
          if (hints && Array.isArray(hints)) {
            if (hints.includes('architecture')) values.architecture = 'x86';
            if (hints.includes('bitness')) values.bitness = '64';
            if (hints.includes('model')) values.model = '';
            if (hints.includes('platformVersion')) values.platformVersion = '15.0.0';
            if (hints.includes('uaFullVersion')) values.uaFullVersion = '130.0.6723.116';
            if (hints.includes('fullVersionList')) {
              values.fullVersionList = [
                { brand: 'Chromium', version: '130.0.6723.116' },
                { brand: 'Google Chrome', version: '130.0.6723.116' },
                { brand: 'Not?A_Brand', version: '99.0.0.0' },
              ];
            }
          }
          return values;
        },
        toJSON: () => ({ brands, mobile: isMobile, platform: platformName }),
      };

      Object.defineProperty(navigator, 'userAgentData', {
        get: () => userAgentData,
        configurable: true,
        enumerable: true,
      });
    }

    // 4. Permissions API consistency (Notification)
    if (window.navigator.permissions && window.navigator.permissions.query) {
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters) => {
        if (parameters && parameters.name === 'notifications') {
          return Promise.resolve({
            state: Notification.permission || 'default',
            onchange: null,
          });
        }
        return originalQuery.call(window.navigator.permissions, parameters);
      };
    }

    // 5. Hardware and environment defaults
    if (!navigator.hardwareConcurrency || navigator.hardwareConcurrency < 4) {
      Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
    }
    if (!navigator.deviceMemory) {
      Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
    }

    // 6. Realistic Plugins Array
    const fakePlugins = [
      { name: 'PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
      { name: 'Chrome PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
      { name: 'Chromium PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
      { name: 'Microsoft Edge PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
      { name: 'WebKit built-in PDF', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
    ];
    Object.defineProperty(navigator, 'plugins', {
      get: () => {
        const arr = [...fakePlugins];
        arr.item = (i) => fakePlugins[i] || null;
        arr.namedItem = (name) => fakePlugins.find((p) => p.name === name) || null;
        arr.refresh = () => {};
        return arr;
      },
    });

    // 7. WebGL Renderer consistency
    const getParameter = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function (parameter) {
      if (parameter === 37445) return 'Google Inc. (Intel)'; // UNMASKED_VENDOR_WEBGL
      if (parameter === 37446) return 'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)'; // UNMASKED_RENDERER_WEBGL
      return getParameter.call(this, parameter);
    };

    if (window.WebGL2RenderingContext) {
      const getParameter2 = WebGL2RenderingContext.prototype.getParameter;
      WebGL2RenderingContext.prototype.getParameter = function (parameter) {
        if (parameter === 37445) return 'Google Inc. (Intel)';
        if (parameter === 37446) return 'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)';
        return getParameter2.call(this, parameter);
      };
    }
  } catch (e) {
    // Fail-safe: stealth patches should never break the page runtime
  }
})();
`;

export async function applyStealthEvasions(page) {
  await page.evaluateOnNewDocument(EVASION_SCRIPT);
}
