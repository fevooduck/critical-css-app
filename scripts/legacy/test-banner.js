import puppeteer from 'puppeteer';

async function testBannerRender() {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 412, height: 823, isMobile: true });

  // Intercept images or delay image loading to see initial layout
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    if (req.resourceType() === 'image') {
      // Delay image by 2 seconds
      setTimeout(() => req.continue(), 2000);
    } else {
      req.continue();
    }
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
      imgHeight: img?.clientHeight,
      imgNaturalHeight: img?.naturalHeight,
      imgComputedStyle: img ? {
        display: window.getComputedStyle(img).display,
        width: window.getComputedStyle(img).width,
        height: window.getComputedStyle(img).height,
        aspectRatio: window.getComputedStyle(img).aspectRatio,
      } : null,
      pictureComputedStyle: picture ? {
        display: window.getComputedStyle(picture).display,
        width: window.getComputedStyle(picture).width,
        height: window.getComputedStyle(picture).height,
        aspectRatio: window.getComputedStyle(picture).aspectRatio,
      } : null,
      containerComputedStyle: container ? {
        display: window.getComputedStyle(container).display,
        width: window.getComputedStyle(container).width,
        height: window.getComputedStyle(container).height,
        aspectRatio: window.getComputedStyle(container).aspectRatio,
      } : null,
    };
  });

  console.log('Layout antes da imagem carregar (Initial Layout):');
  console.log(JSON.stringify(initialRect, null, 2));

  await browser.close();
}

testBannerRender();
