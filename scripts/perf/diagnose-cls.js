import puppeteer from 'puppeteer';

async function diagnose(viewport = { width: 393, height: 852, isMobile: true, name: 'Mobile' }) {
  console.log(`\n======================================================`);
  console.log(`Diagnosticando CLS em: ${viewport.name} (${viewport.width}x${viewport.height})`);
  console.log(`======================================================`);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport(viewport);
    await page.setUserAgent(
      viewport.isMobile
        ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
        : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // Instrument layout shifts before anything loads
    await page.evaluateOnNewDocument(() => {
      window.__clsEntries = [];
      window.__clsScore = 0;

      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!entry.hadRecentInput) {
            window.__clsScore += entry.value;
            const sources = (entry.sources || []).map((s) => {
              let nodeDesc = 'unknown';
              if (s.node) {
                const el = s.node;
                const id = el.id ? `#${el.id}` : '';
                const classes = el.className && typeof el.className === 'string' ? `.${el.className.trim().split(/\s+/).join('.')}` : '';
                nodeDesc = `${el.tagName.toLowerCase()}${id}${classes}`;
              }
              return {
                node: nodeDesc,
                prevRect: s.previousRect,
                currRect: s.currentRect,
              };
            });
            window.__clsEntries.push({
              value: entry.value,
              startTime: entry.startTime,
              sources,
            });
          }
        }
      });
      observer.observe({ type: 'layout-shift', buffered: true });
    });

    console.log('Navegando para https://www.recetasnestle.com.do/marcas/chocolates ...');
    await page.goto('https://www.recetasnestle.com.do/marcas/chocolates', {
      waitUntil: 'networkidle2',
      timeout: 45000,
    });

    // Wait a little for late scripts (fonts, ads, carousels, late css)
    await new Promise((r) => setTimeout(r, 4000));

    const result = await page.evaluate(() => {
      return {
        totalCls: window.__clsScore,
        entries: window.__clsEntries,
      };
    });

    console.log(`\n>> SCORE TOTAL DE CLS: ${result.totalCls.toFixed(4)}`);
    console.log(`Total de shifts detectados: ${result.entries.length}\n`);

    result.entries.forEach((entry, idx) => {
      console.log(`[Shift #${idx + 1}] Score: ${entry.value.toFixed(4)} @ ${entry.startTime.toFixed(0)}ms`);
      entry.sources.forEach((s) => {
        console.log(`   Elemento: ${s.node}`);
        console.log(`   Antes : top=${s.prevRect?.top?.toFixed(1)}, height=${s.prevRect?.height?.toFixed(1)}, width=${s.prevRect?.width?.toFixed(1)}`);
        console.log(`   Depois: top=${s.currRect?.top?.toFixed(1)}, height=${s.currRect?.height?.toFixed(1)}, width=${s.currRect?.width?.toFixed(1)}`);
      });
    });

    // Check critical CSS implementation on the live page
    const pageMeta = await page.evaluate(() => {
      const inlineStyles = Array.from(document.querySelectorAll('style')).map((s) => ({
        media: s.getAttribute('media') || 'none',
        length: s.textContent.length,
        hasCriticalComment: s.textContent.includes('CSS Crítico') || s.textContent.includes('critical'),
      }));
      const asyncLinks = Array.from(document.querySelectorAll('link[rel=preload][as=style], link[onload]')).map((l) => ({
        href: l.href,
        rel: l.rel,
        onload: l.getAttribute('onload'),
        media: l.getAttribute('media'),
      }));
      const regularLinks = Array.from(document.querySelectorAll('link[rel=stylesheet]')).map((l) => ({
        href: l.href,
        media: l.getAttribute('media'),
      }));

      // Check font loading
      const fontFaces = Array.from(document.fonts || []).map((f) => ({
        family: f.family,
        status: f.status,
      }));

      // Check images without dimensions in the first fold
      const foldImages = Array.from(document.querySelectorAll('img')).slice(0, 10).map((img) => ({
        src: img.src.substring(0, 80),
        widthAttr: img.getAttribute('width'),
        heightAttr: img.getAttribute('height'),
        clientWidth: img.clientWidth,
        clientHeight: img.clientHeight,
        loading: img.getAttribute('loading'),
        classes: img.className,
      }));

      return {
        inlineStyles,
        asyncLinks,
        regularLinks: regularLinks.length,
        fontFaces: fontFaces.slice(0, 5),
        foldImages,
      };
    });

    console.log('\n--- Análise Estrutural da Página ---');
    console.log('Estilos inline encontrados:', pageMeta.inlineStyles.length);
    pageMeta.inlineStyles.forEach((s, i) => {
      console.log(`  Style #${i + 1}: media="${s.media}", length=${s.length} chars, hasCriticalComment=${s.hasCriticalComment}`);
    });
    console.log('Links CSS assíncronos (preload/onload):', pageMeta.asyncLinks);
    console.log('Links CSS regulares bloqueantes:', pageMeta.regularLinks);
    console.log('\nImagens na 1ª dobra e atributos de dimensão:');
    pageMeta.foldImages.forEach((img, i) => {
      console.log(`  Img #${i + 1}: width="${img.widthAttr}", height="${img.heightAttr}", rendered=${img.clientWidth}x${img.clientHeight}, loading="${img.loading}"`);
    });

  } finally {
    await browser.close();
  }
}

async function run() {
  try {
    // 1. Mobile (iPhone 16 / standard 393px)
    await diagnose({ width: 393, height: 852, isMobile: true, name: 'Mobile (393x852)' });
    // 2. Desktop (1920x1080)
    await diagnose({ width: 1920, height: 1080, isMobile: false, name: 'Desktop (1920x1080)' });
  } catch (err) {
    console.error('Erro no diagnóstico:', err);
  }
}

run();
