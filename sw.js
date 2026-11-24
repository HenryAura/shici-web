const CACHE = 'shici-v13';
const CORE = [
  './',
  './index.html',
  './style.css',
  './js/core.js',
  './js/dict.js',
  './js/study.js',
  './js/views.js',
  './js/boot.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-1024.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // 词库与例句：体积大、几乎不变，缓存优先（离线也能用）
  if (url.pathname.indexOf('/data/') >= 0) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      }))
    );
    return;
  }

  // 应用外壳：网络优先，断网回退缓存 —— 避免更新后仍跑旧 HTML 引用已删除的脚本
  // cache:'reload' 绕过浏览器的 HTTP 缓存与 iOS WebView 快照，确保拿到最新外壳
  e.respondWith(
    fetch(new Request(req, { cache: 'reload' })).then((res) => {
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    }).catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')))
  );
});
