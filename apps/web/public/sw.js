/*
 * Service worker toi gian: cache vo app (app shell).
 *
 * CO Y khong cache API va /media:
 *   - API phai luon tuoi, dac biet la quota (nguyen tac P5: server quyet dinh).
 *     Cache quota se cho tre xem qua gio.
 *   - File video trong /media co the rat lon, khong nen nhoi vao Cache Storage.
 */
const CACHE = 'kidtube-shell-v1'
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/media/')) return

  // Dieu huong (SPA): uu tien mang, that bai thi lay index.html trong cache
  // -> mo duoc app khi mat mang, roi app tu bao "khong ket noi duoc".
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match('/index.html')))
    return
  }

  // Tai nguyen tinh (js/css/anh): cache truoc, dong thoi cap nhat ngam.
  event.respondWith(
    caches.match(req).then((hit) => {
      const network = fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone()
            void caches.open(CACHE).then((c) => c.put(req, copy))
          }
          return res
        })
        .catch(() => hit)
      return hit || network
    }),
  )
})
