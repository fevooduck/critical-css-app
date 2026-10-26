import puppeteer from 'puppeteer';

async function test() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  // Emulate Moto G Power (PSI device)
  await page.setViewport({ width: 412, height: 823, isMobile: true, deviceScaleFactor: 1.75 });
  await page.setUserAgent(
    'Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36'
  );

  await page.evaluateOnNewDocument(() => {
    window.__events = [];
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        window.__events.push({
          type: 'layout-shift',
          value: entry.value,
          startTime: entry.startTime,
          sources: (entry.sources || []).map((s) => ({
            tagName: s.node?.tagName,
            id: s.node?.id,
            className: s.node?.className,
            prevTop: s.previousRect?.top,
            prevHeight: s.previousRect?.height,
            currTop: s.currentRect?.top,
            currHeight: s.currentRect?.height,
          })),
        });
      }
    });
    observer.observe({ type: 'layout-shift', buffered: true });
  });

  console.log('Carregando página...');
  await page.goto('https://www.recetasnestle.com.do/marcas/chocolates', {
    waitUntil: 'networkidle2',
    timeout: 60000,
  });

  await new Promise((r) => setTimeout(r, 6000));

  const data = await page.evaluate(() => {
    return {
      events: window.__events,
      section: (() => {
        const el = document.querySelector('section.brandCorner');
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return {
          rect,
          display: style.display,
          marginTop: style.marginTop,
          paddingTop: style.paddingTop,
          parent: el.parentElement?.className,
        };
      })(),
      banner: (() => {
        const el = document.querySelector('.single-image');
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return {
          rect,
          marginTop: style.marginTop,
          display: style.display,
        };
      })(),
    };
  });

  console.log('Resultados dos Shifts:');
  console.log(JSON.stringify(data.events, null, 2));

  console.log('\nDados dos Elementos:');
  console.log('Section brandCorner:', data.section);
  console.log('Banner single-image:', data.banner);

  await browser.close();
}

test();
