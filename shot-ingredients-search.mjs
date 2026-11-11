// Testa o SDC ingredients-search ("O que tem em casa?"): adiciona ingredientes,
// alterna o toggle, valida a URL do submit e tira screenshots desktop/mobile.
// Uso: node shot-ingredients-search.mjs <url> <saida-dir>
import { chromium } from 'playwright';
const [url, out = 'data'] = process.argv.slice(2);
const browser = await chromium.launch();

const open = async (viewport) => {
  const page = await browser.newPage({ viewport, ignoreHTTPSErrors: true });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
  const accept = page.locator('#onetrust-accept-btn-handler');
  if (await accept.count()) await accept.click().catch(() => {});
  return { page, errors };
};

const add = async (page, name) => {
  await page.fill('[data-ingredients-input]', name);
  await page.press('[data-ingredients-input]', 'Enter');
};

const state = (page) => page.evaluate(() => {
  const root = document.querySelector('[data-ingredients-search]');
  return {
    items: [...root.querySelectorAll('.ingredients-search__item')].map((li) => ({
      name: li.querySelector('.ingredients-search__name').textContent,
      checked: li.querySelector('[role=switch]').getAttribute('aria-checked'),
    })),
    inputDisabled: root.querySelector('[data-ingredients-input]').disabled,
    submitDisabled: root.querySelector('[data-ingredients-submit]').disabled,
    clearDisabled: root.querySelector('[data-ingredients-clear]').disabled,
    hint: !root.querySelector('[data-ingredients-hint]').hidden,
  };
});

const submitUrl = async (page) => {
  const [req] = await Promise.all([
    page.waitForRequest((r) => r.url().includes('cp=true') && r.isNavigationRequest(), { timeout: 15000 }),
    page.click('[data-ingredients-submit]'),
  ]);
  return decodeURIComponent(new URL(req.url()).search);
};

// Desktop
{
  const { page, errors } = await open({ width: 1440, height: 900 });
  const section = page.locator('[data-ingredients-search]');
  await section.scrollIntoViewIfNeeded();
  console.log('inicial', await state(page));

  // Autocomplete
  await page.fill('[data-ingredients-input]', 'tom');
  await page.waitForSelector('[data-ingredients-suggestions]:not([hidden]) li', { timeout: 8000 }).catch(() => {});
  console.log('sugestões', await page.locator('[data-ingredients-suggestions] li').allTextContents());
  await page.fill('[data-ingredients-input]', '');

  await add(page, 'Tomate');
  await add(page, 'tomate'); // duplicado (case-insensitive)
  await add(page, 'Ovo');
  await add(page, 'Queijo');
  await page.locator('.ingredients-search__item').nth(2).locator('[role=switch]').click();
  console.log('3 itens, queijo off', await state(page));
  await page.waitForTimeout(400);
  await section.screenshot({ path: `${out}/ingredients-desktop.png` });

  // Só excluídos → submit desabilitado + hint
  await page.click('[data-ingredients-clear]');
  await add(page, 'Queijo');
  await page.locator('.ingredients-search__item').nth(0).locator('[role=switch]').click();
  console.log('só excluído', await state(page));

  // Reordena: [Queijo ✗, Tomate ✓] → Tomate primeiro, radioOne=not
  await add(page, 'Tomate');
  console.log('submit A', await submitUrl(page));

  console.log('erros desktop', errors);
  await page.close();
}

// Desktop: caso do plano [Tomate ✓, Ovo ✓, Queijo ✗]
{
  const { page } = await open({ width: 1440, height: 900 });
  await add(page, 'Tomate');
  await add(page, 'Ovo');
  await add(page, 'Queijo');
  await page.locator('.ingredients-search__item').nth(2).locator('[role=switch]').click();
  console.log('submit B', await submitUrl(page));
  await page.close();
}

// Mobile
{
  const { page, errors } = await open({ width: 393, height: 852 });
  const section = page.locator('[data-ingredients-search]');
  await section.scrollIntoViewIfNeeded();
  await add(page, 'Tomate');
  await add(page, 'Ovo');
  await page.waitForTimeout(400);
  await section.screenshot({ path: `${out}/ingredients-mobile.png` });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  console.log('mobile overflow horizontal', overflow, 'erros', errors);
  await page.close();
}

await browser.close();
