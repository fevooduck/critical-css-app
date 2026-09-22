import fs from 'fs/promises';
import path from 'path';

// User-managed config (not auto-generated state, so it lives at the project
// root next to package.json, not in /data), mapping hostname -> proxy URL,
// e.g. { "www.example.com": "http://user:pass@proxy-host:8080" }.
// Never committed (see .gitignore) since it can carry credentials.
const PROXIES_FILE = path.join(process.cwd(), 'proxies.json');

let cache = null;

async function load() {
  if (cache) return cache;
  try {
    const raw = await fs.readFile(PROXIES_FILE, 'utf-8');
    cache = JSON.parse(raw);
  } catch {
    cache = {};
  }
  return cache;
}

export async function getProxyForDomain(hostname) {
  const map = await load();
  return map[hostname] || null;
}
