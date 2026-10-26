import puppeteer from 'puppeteer';

async function testCriticalContent() {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.goto('https://www.recetasnestle.com.do/marcas/chocolates');

  const cssInfo = await page.evaluate(() => {
    const styles = Array.from(document.querySelectorAll('style'));
    const mobileStyle = styles.find(s => s.getAttribute('media') === '(max-width: 991.98px)');
    const desktopStyle = styles.find(s => s.getAttribute('media') === '(min-width: 992px)');

    return {
      hasMobileStyle: !!mobileStyle,
      mobileLength: mobileStyle ? mobileStyle.textContent.length : 0,
      mobileSingleImage: mobileStyle ? mobileStyle.textContent.includes('single-image') : false,
      mobileImgRule: mobileStyle ? mobileStyle.textContent.includes('.single-image') : false,
      mobileMatches: mobileStyle ? mobileStyle.textContent.match(/(\.single-image[^{]*\{[^}]*\})/g) : [],
      mobileBrandCorner: mobileStyle ? mobileStyle.textContent.match(/(\.brandCorner[^{]*\{[^}]*\})/g) : [],
      mainWrapperRules: mobileStyle ? mobileStyle.textContent.match(/((\.mainWrapper|mainWrapper)[^{]*\{[^}]*\})/g) : [],
    };
  });

  console.log('Informações do CSS Crítico inline no site:');
  console.log(JSON.stringify(cssInfo, null, 2));

  await browser.close();
}

testCriticalContent();
