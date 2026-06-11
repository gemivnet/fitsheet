// pwa.mjs — runs after `expo export -p web`. Generates a coral app icon (no external tools),
// writes the web manifest + a small service worker, and injects PWA/Apple meta into index.html.
// Result: open the site in Safari/Chrome → "Add to Home Screen" → fullscreen app.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const DIST = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
if (!existsSync(join(DIST, 'index.html'))) {
  console.error('[pwa] dist/index.html not found — run `expo export -p web` first.');
  process.exit(1);
}

// ── tiny PNG encoder (RGBA, no deps) ────────────────────────────────────────
function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(Buffer.concat([typeBuf, data])) >>> 0, 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}
function encodePNG(w, h, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', idat), pngChunk('IEND', Buffer.alloc(0))]);
}

// coral background + white progress-ring + green dot (matches the design mark), with light AA
function drawIcon(N) {
  const buf = Buffer.alloc(N * N * 4);
  const c = (N - 1) / 2;
  const R = N * 0.32;
  const stroke = N * 0.085;
  const coral = [248, 131, 107];
  const white = [255, 255, 255];
  const green = [107, 191, 138];
  const dotCx = c;
  const dotCy = c + R + stroke * 0.65;
  const dotR = stroke * 0.5;
  const mix = (a, b, w) => [a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w, a[2] + (b[2] - a[2]) * w];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = (y * N + x) * 4;
      let col = coral;
      const d = Math.hypot(x - c, y - c);
      // ring band [R-stroke, R] with ~1px feather
      const inner = R - stroke;
      const ringCov = Math.min(smooth(d, inner - 1, inner + 1), 1 - smooth(d, R - 1, R + 1));
      if (ringCov > 0) col = mix(col, white, Math.max(0, Math.min(1, ringCov)));
      const dg = Math.hypot(x - dotCx, y - dotCy);
      const dotCov = 1 - smooth(dg, dotR - 1, dotR + 1);
      if (dotCov > 0) col = mix(col, green, Math.max(0, Math.min(1, dotCov)));
      buf[i] = Math.round(col[0]);
      buf[i + 1] = Math.round(col[1]);
      buf[i + 2] = Math.round(col[2]);
      buf[i + 3] = 255;
    }
  }
  return buf;
}
// 0 below e0, 1 above e1, linear between
function smooth(v, e0, e1) {
  if (v <= e0) return 0;
  if (v >= e1) return 1;
  return (v - e0) / (e1 - e0);
}

writeFileSync(join(DIST, 'icon-512.png'), encodePNG(512, 512, drawIcon(512)));
writeFileSync(join(DIST, 'icon-180.png'), encodePNG(180, 180, drawIcon(180)));
console.log('[pwa] wrote icon-512.png, icon-180.png');

// ── manifest ────────────────────────────────────────────────────────────────
const manifest = {
  name: 'fitsheet',
  short_name: 'fitsheet',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  orientation: 'portrait',
  background_color: '#FFF8F4',
  theme_color: '#F8836B',
  icons: [
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
    { src: '/icon-180.png', sizes: '180x180', type: 'image/png' },
  ],
};
writeFileSync(join(DIST, 'manifest.webmanifest'), JSON.stringify(manifest, null, 2));

// ── service worker (cache the shell; never cache /api) ───────────────────────
const sw = `const C='fitsheet-v2';
self.addEventListener('install',e=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil((async()=>{const ks=await caches.keys();await Promise.all(ks.filter(k=>k!==C).map(k=>caches.delete(k)));await self.clients.claim();})()));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET') return;
  const u=new URL(e.request.url);
  if(u.pathname.startsWith('/api')) return;
  e.respondWith(
    fetch(e.request).then(r=>{const cp=r.clone();caches.open(C).then(c=>c.put(e.request,cp));return r;})
      .catch(()=>caches.match(e.request).then(m=>m||caches.match('/')))
  );
});`;
writeFileSync(join(DIST, 'sw.js'), sw);

// ── inject head tags into index.html ─────────────────────────────────────────
const head = `  <link rel="manifest" href="/manifest.webmanifest" />
  <meta name="theme-color" content="#F8836B" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="default" />
  <meta name="apple-mobile-web-app-title" content="fitsheet" />
  <link rel="apple-touch-icon" href="/icon-180.png" />
  <link rel="icon" href="/icon-180.png" />
  <script>if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){})});}</script>
`;
const htmlPath = join(DIST, 'index.html');
let html = readFileSync(htmlPath, 'utf8');
// Opt the viewport into the safe-area insets so iOS standalone (home-screen) mode reports
// env(safe-area-inset-*) — without this the bottom tab bar sits under the home indicator.
if (/<meta name="viewport"/i.test(html)) {
  html = html.replace(/<meta name="viewport"[^>]*>/i, '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />');
} else {
  html = html.replace('<head>', '<head>\n  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />');
}
if (!html.includes('manifest.webmanifest')) {
  html = html.replace('</head>', `${head}</head>`);
}
writeFileSync(htmlPath, html);
console.log('[pwa] manifest + service worker + meta injected. PWA ready in dist/.');
