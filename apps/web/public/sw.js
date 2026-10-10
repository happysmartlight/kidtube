/*
 * Service worker toi gian: cache vo app (app shell).
 *
 * CHI chay tren HTTPS (hoac localhost) — tuc la khi mo qua `tailscale serve`.
 * Mo bang http://<ip> thi trinh duyet khong dang ky SW — app van chay, chi
 * khong mo duoc khi mat mang.
 *
 * CO Y khong cache API va /media:
 *   - API phai luon tuoi, dac biet la quota (nguyen tac P5: server quyet dinh).
 *     Cache quota se cho tre xem qua gio.
 *   - File video trong /media co the rat lon, khong nen nhoi vao Cache Storage.
 */
const CACHE = 'kidtube-shell-v2'
const SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
]
/** Moi ban build sinh file assets/ moi (ten co hash) — giu vua du, bo ban cu. */
const MAX_ENTRIES = 60

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

/** Luu vao cache roi xoa bot muc cu nhat (Cache.keys() theo thu tu them vao). */
async function store(req, res) {
  const c = await caches.open(CACHE)
  await c.put(req, res)
  const keys = await c.keys()
  const old = keys.filter((k) => !SHELL.includes(new URL(k.url).pathname))
  const extra = keys.length - MAX_ENTRIES
  if (extra > 0) await Promise.all(old.slice(0, extra).map((k) => c.delete(k)))
}

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/media/')) return

  // Dieu huong (SPA): uu tien mang, that bai thi lay index.html trong cache
  // -> mo duoc app khi mat mang, roi app tu bao "khong ket noi duoc".
  // Giu ban index.html moi nhat de no tro dung toi assets/ dang co trong cache.
  if (req.mode === 'navigate') {
    const network = fetch(req)
    // Chi luu trang HTML: dieu huong toi file khac (vd mp4) thi bo qua.
    keep(event, network, (res) =>
      (res.headers.get('content-type') || '').includes('text/html') ? '/index.html' : null,
    )
    event.respondWith(network.catch(() => caches.match('/index.html')))
    return
  }

  // assets/ co hash trong ten -> noi dung bat bien: co trong cache la dung luon.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(req).then((hit) => {
        if (hit) return hit
        const network = fetch(req)
        keep(event, network, () => req)
        return network
      }),
    )
    return
  }

  // Icon, manifest: tra ban trong cache ngay, dong thoi cap nhat ngam.
  if (SHELL.includes(url.pathname)) {
    const network = fetch(req)
    keep(event, network, () => req)
    event.respondWith(caches.match(req).then((hit) => hit || network))
  }
  // Con lai (vd /sw.js): di thang ra mang, khong cache.
})

/**
 * Luu ban sao cua phan hoi khi no ve. Goi waitUntil NGAY (dong bo) — goi tu
 * trong .then() sau khi respondWith da xong thi trinh duyet nem loi.
 * Clone trong .then() dau tien, truoc khi trinh duyet doc mat body cua `res`.
 */
function keep(event, network, keyOf) {
  event.waitUntil(
    network
      .then((res) => {
        const key = res.ok ? keyOf(res) : null
        return key ? store(key, res.clone()) : undefined
      })
      .catch(() => {}),
  )
}
