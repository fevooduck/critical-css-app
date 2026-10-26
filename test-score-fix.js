import puppeteer from 'puppeteer';

async function testScoreWithFix() {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 412, height: 823, isMobile: true, deviceScaleFactor: 1.75 });
  await page.setUserAgent(
    'Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36'
  );

  await page.evaluateOnNewDocument(() => {
    window.__clsScore = 0;
    window.__shifts = [];

    // Inject fix immediately in head
    const style = document.createElement('style');
    style.textContent = `
      .single-image .container picture,
      .single-image>.container picture,
      .single-image .container img,
      .single-image>.container img {
        width: 100% !important;
        height: auto !important;
        display: block !important;
      }
    `;
    const addStyle = () => {
      if (document.head) {
        document.head.insertBefore(style, document.head.firstChild);
      }
    };
    addStyle();
    document.addEventListener('readystatechange', addStyle);

    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) {
          window.__clsScore += entry.value;
          window.__shifts.push({
            value: entry.value,
            time: entry.startTime,
            sources: (entry.sources || []).map(s => s.node?.className || s.node?.tagName)
          });
        }
      }
    });
    observer.observe({ type: 'layout-shift', buffered: true });
  });

  await page.goto('https://www.recetasnestle.com.do/marcas/chocolates', {
    waitUntil: 'networkidle2',
    timeout: 60000,
  });

  await new Promise(r => setTimeout(r, 4000));

  const res = await page.evaluate(() => {
    return {
      cls: window.__clsScore,
      shifts: window.__shifts
    };
  });

  console.log('\n=======================================');
  console.log('CLS COM A CORREÇÃO: ', res.cls.toFixed(4));
  console.log('Shifts restantes:', res.shifts.length);
  console.log(JSON.stringify(res.shifts, null, 2));
  console.log('=======================================\n');

  await browser.close();
}

testScoreWithFix();
