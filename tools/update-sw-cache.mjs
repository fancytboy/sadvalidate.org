// Rewrites the service worker's cache name to a hash of the cached assets'
// contents, so a forgotten manual bump can't ship stale code. Run after any
// change to index.html, CSS, JS, or data files:
//
//   npm run sw:bump
//
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const swPath = join(root, 'sw.js');
const sw = readFileSync(swPath, 'utf8');

// Parse the ASSETS list out of sw.js ('./' resolves to index.html).
const assets = [...sw.matchAll(/'\.\/([^']*)'/g)]
  .map(m => m[1] || 'index.html')
  .filter((p, i, all) => all.indexOf(p) === i)
  .sort();

const hash = createHash('sha256');
for (const rel of assets) {
  hash.update(rel);
  hash.update(readFileSync(join(root, rel)));
}
const name = `sdp-cache-${hash.digest('hex').slice(0, 10)}`;

const next = sw.replace(/const CACHE = '[^']+';/, `const CACHE = '${name}';`);
if (next === sw && !sw.includes(`'${name}'`)) {
  console.error('Could not find the CACHE constant in sw.js');
  process.exit(1);
}
writeFileSync(swPath, next);
console.log(`sw.js cache name set to ${name} (${assets.length} assets hashed)`);
