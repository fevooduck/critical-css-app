import { readJson, writeJson } from './json-store.js';

const FILE = 'manual-captures.json';

// Last-resort fallback for a domain that blocks every automated path: the user
// captures the page from their own real browser (bookmarklet) and the batch
// job uses that HTML instead of trying to visit the URL itself.
export async function saveCapture(url, html) {
  const store = await readJson(FILE, {});
  store[url] = { html, capturedAt: new Date().toISOString() };
  await writeJson(FILE, store);
}

export async function getCapture(url) {
  const store = await readJson(FILE, {});
  return store[url] || null;
}

export async function deleteCapture(url) {
  const store = await readJson(FILE, {});
  delete store[url];
  await writeJson(FILE, store);
}

export async function listCaptures() {
  const store = await readJson(FILE, {});
  return Object.entries(store).map(([url, value]) => ({
    url,
    capturedAt: value.capturedAt,
    size: value.html?.length || 0,
  }));
}
