import puppeteer from 'puppeteer';

async function testFix() {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 412, height: 823, isMobile: true });

  // Delay image loading by 3 seconds
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    if (req.resourceType() === 'image') {
      setTimeout(() => req.continue(), 3000);
    } else {
      req.continue();
    }
  });

  // Inject the fix before the page loads
  await page.evaluateOnNewDocument(() => {
    const style = document.createElement('style');
    style.textContent = `
      .single-image .container picture,
      .single-image .container img {
        width: 100% !important;
        height: auto !important;
        display: block !important;
      }
    `;
    document.head ? document.head.appendChild(style) : document.addEventListener('DOMContentLoaded', () => document.head.appendChild(style));
  });

  await page.goto('https://www.recetasnestle.com.do/marcas/chocolates', { waitUntil: 'domcontentloaded' });

  const initialRect = await page.evaluate(() => {
    const banner = document.querySelector('.single-image');
    const img = document.querySelector('.single-image img');
    const picture = document.querySelector('.single-image picture');
    const container = document.querySelector('.single-image .container');

    return {
      bannerHeight: banner?.clientHeight,
      containerHeight: container?.clientHeight,
      pictureHeight: picture?.clientHeight,
      pictureWidth: picture?.clientWidth,
      imgHeight: img?.clientHeight,
      imgWidth: img?.clientWidth,
      aspectRatio: window.getComputedStyle(img).aspectRatio,
    };
  });

  console.log('Layout COM A CORREÇÃO antes da imagem carregar:');
  console.log(JSON.stringify(initialRect, null, 2));

  await browser.close();
}

testFix();
