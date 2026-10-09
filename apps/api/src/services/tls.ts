/**
 * HTTPS noi bo — dieu kien de dien thoai / tablet CAI DUOC app (PWA).
 *
 * Trinh duyet chi cho cai PWA (va chi cho chay service worker) khi trang la
 * "secure context": HTTPS voi chung chi DUOC TIN, hoac localhost. Mo bang
 * http://<ip-cua-pi>:8477 thi Chrome Android chi tao loi tat — mo ra van la
 * mot tab co thanh dia chi. Chung chi tu ky khong ai tin (vd `tls internal`
 * cua Caddy chua cai root CA) cung vay.
 *
 * Cach lam: app tu lam mot CA rieng cho nha minh, roi dung no ky chung chi cho
 * chinh server. Bo me cai CA vao thiet bi MOT LAN -> tu do
 * https://<ip-cua-pi>:8478 duoc tin hoan toan, cai duoc app.
 *
 *   - KHONG can ten mien, KHONG can Internet, KHONG can Caddy.
 *   - CA bi gioi han bang Name Constraints: chi ky duoc cho IP noi bo va ten
 *     mien noi bo (.local, .lan, .home.arpa...). Lo ca.key bi lo ra ngoai thi
 *     ke gian cung KHONG gia duoc google.com hay ngan hang tren may da cai CA.
 *   - Tu ma hoa DER + node:crypto: khong them dependency, khong can lenh
 *     openssl (may Windows dev khong co san).
 *
 * Server khong tu biet tablet goi no bang dia chi nao (trong Docker no chi
 * thay IP cua container). Nen moi lan bo me mo trang huong dan cai app, server
 * HOC dia chi trong header Host roi ky lai chung chi cho ca dia chi do.
 *
 * File nam trong <DATA_DIR>/tls — sao luu cung voi kid.db. Mat thu muc nay thi
 * app sinh CA moi va moi thiet bi phai cai lai CA.
 */
import {
  createHash,
  createPrivateKey,
  generateKeyPairSync,
  type KeyObject,
  randomBytes,
  sign,
  X509Certificate,
} from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { isIP, isIPv4, isIPv6 } from 'node:net'
import { networkInterfaces } from 'node:os'
import { join } from 'node:path'
import type { FastifyBaseLogger } from 'fastify'
import { env } from '../env.js'

const DAY_MS = 24 * 60 * 60 * 1000
const CA_DAYS = 3650
/** Duoi 398 ngay: tran cua Apple/Chrome cho chung chi TLS. */
const LEAF_DAYS = 397
const RENEW_BEFORE_DAYS = 30
/** Chan header Host rac lam phinh danh sach ten trong chung chi. */
const MAX_LEARNED = 16

/**
 * Ten mien noi bo duoc phep. KHONG co dau cham o dau: theo RFC 5280, rang
 * buoc "local" khop ca "pi.local" lan chinh "local".
 *
 * Ten mot nhan (vd `raspberrypi` tran) khong the cho phep ma khong cho phep
 * moi ten mien — dung IP hoac `raspberrypi.local` thay the.
 */
const LOCAL_SUFFIXES = ['local', 'lan', 'home', 'home.arpa', 'internal', 'localhost', 'fritz.box']

/** Dai IP noi bo: [mang, so bit]. 100.64/10 la dai cua Tailscale. */
const PRIVATE_NETS: Array<[string, number]> = [
  ['10.0.0.0', 8],
  ['172.16.0.0', 12],
  ['192.168.0.0', 16],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['fc00::', 7],
  ['fe80::', 10],
  ['::1', 128],
]

const OID = {
  ecdsaSha256: '1.2.840.10045.4.3.2',
  commonName: '2.5.4.3',
  organization: '2.5.4.10',
  subjectKeyId: '2.5.29.14',
  keyUsage: '2.5.29.15',
  subjectAltName: '2.5.29.17',
  basicConstraints: '2.5.29.19',
  nameConstraints: '2.5.29.30',
  authorityKeyId: '2.5.29.35',
  extKeyUsage: '2.5.29.37',
  serverAuth: '1.3.6.1.5.5.7.3.1',
}

// ═══ DER toi gian — chi du de viet mot chung chi X.509 ════════════════

function derLength(n: number): Buffer {
  if (n < 0x80) return Buffer.from([n])
  const out: number[] = []
  for (let v = n; v > 0; v = Math.floor(v / 256)) out.unshift(v & 0xff)
  return Buffer.from([0x80 | out.length, ...out])
}

function tlv(tag: number, ...parts: Buffer[]): Buffer {
  const body = Buffer.concat(parts)
  return Buffer.concat([Buffer.from([tag]), derLength(body.length), body])
}

const seq = (...parts: Buffer[]): Buffer => tlv(0x30, ...parts)

/** INTEGER khong dau tu chuoi byte big-endian. */
function uint(bytes: Buffer | number[]): Buffer {
  let b = Buffer.from(bytes)
  let i = 0
  while (i < b.length - 1 && b[i] === 0) i++
  b = b.subarray(i)
  if ((b[0] ?? 0) & 0x80) b = Buffer.concat([Buffer.from([0]), b])
  return tlv(0x02, b)
}

function oid(dotted: string): Buffer {
  const [a = 0, b = 0, ...rest] = dotted.split('.').map(Number)
  const out = [a * 40 + b]
  for (const n of rest) {
    const chunk = [n & 0x7f]
    for (let v = n >>> 7; v > 0; v >>>= 7) chunk.unshift((v & 0x7f) | 0x80)
    out.push(...chunk)
  }
  return tlv(0x06, Buffer.from(out))
}

/** UTCTime toi het 2049, GeneralizedTime tu 2050 (RFC 5280 4.1.2.5). */
function derTime(d: Date): Buffer {
  const s = `${d.toISOString().replace(/[-:T]/g, '').slice(0, 14)}Z`
  return d.getUTCFullYear() < 2050
    ? tlv(0x17, Buffer.from(s.slice(2), 'ascii'))
    : tlv(0x18, Buffer.from(s, 'ascii'))
}

function dn(commonName: string): Buffer {
  return seq(
    tlv(0x31, seq(oid(OID.organization), tlv(0x0c, Buffer.from('KidTube Home', 'utf8')))),
    tlv(0x31, seq(oid(OID.commonName), tlv(0x0c, Buffer.from(commonName, 'utf8')))),
  )
}

function ext(id: string, critical: boolean, value: Buffer): Buffer {
  return critical
    ? seq(oid(id), tlv(0x01, Buffer.from([0xff])), tlv(0x04, value))
    : seq(oid(id), tlv(0x04, value))
}

/** GeneralName: dNSName [2] hoac iPAddress [7]. */
function generalName(host: string): Buffer {
  const ip = ipBytes(host)
  return ip ? tlv(0x87, ip) : tlv(0x82, Buffer.from(host, 'ascii'))
}

function toPem(label: string, der: Buffer): string {
  const lines = der.toString('base64').match(/.{1,64}/g) ?? []
  return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----\n`
}

function spki(key: KeyObject): Buffer {
  return key.export({ type: 'spki', format: 'der' })
}

function keyId(pub: KeyObject): Buffer {
  return createHash('sha1').update(spki(pub)).digest()
}

function buildCert(opts: {
  subject: Buffer
  issuer: Buffer
  publicKey: KeyObject
  signingKey: KeyObject
  days: number
  extensions: Buffer[]
}): X509Certificate {
  const serial = randomBytes(16)
  serial[0] = ((serial[0] ?? 0) & 0x7f) | 0x40 // duong, du 16 byte
  // Lui 1 ngay: tablet lech dong ho van thay chung chi da co hieu luc.
  const notBefore = new Date(Date.now() - DAY_MS)
  const notAfter = new Date(Date.now() + opts.days * DAY_MS)
  const algorithm = seq(oid(OID.ecdsaSha256))

  const tbs = seq(
    tlv(0xa0, uint([2])), // v3
    uint(serial),
    algorithm,
    opts.issuer,
    seq(derTime(notBefore), derTime(notAfter)),
    opts.subject,
    spki(opts.publicKey),
    tlv(0xa3, seq(...opts.extensions)),
  )
  const signature = sign('sha256', tbs, opts.signingKey) // ECDSA, dang DER
  return new X509Certificate(seq(tbs, algorithm, tlv(0x03, Buffer.from([0]), signature)))
}

// ═══ Dia chi noi bo ═══════════════════════════════════════════════════

function ipBytes(ip: string): Buffer | null {
  if (isIPv4(ip)) return Buffer.from(ip.split('.').map(Number))
  if (!isIPv6(ip)) return null

  // Duoi IPv4 nhung (::ffff:192.168.1.5) -> doi thanh hai nhom hex.
  let s = ip
  const v4 = /(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(s)
  if (v4) {
    const [, a, b, c, d] = v4.map(Number) as [number, number, number, number, number]
    s = `${s.slice(0, v4.index)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`
  }

  const [head = '', tail] = s.split('::')
  const h = head ? head.split(':') : []
  const t = tail ? tail.split(':') : []
  const groups = tail === undefined ? h : [...h, ...Array<string>(8 - h.length - t.length).fill('0'), ...t]
  if (groups.length !== 8) return null

  const out = Buffer.alloc(16)
  groups.forEach((g, i) => out.writeUInt16BE(Number.parseInt(g, 16), i * 2))
  return out
}

function prefixMask(bytes: number, prefix: number): Buffer {
  const mask = Buffer.alloc(bytes)
  for (let bit = 0; bit < prefix; bit++) mask[bit >> 3]! |= 0x80 >> (bit & 7)
  return mask
}

function inNet(addr: Buffer, [net, prefix]: [string, number]): boolean {
  const base = ipBytes(net)
  if (!base || base.length !== addr.length) return false
  const mask = prefixMask(addr.length, prefix)
  return addr.every((byte, i) => (byte & mask[i]!) === (base[i]! & mask[i]!))
}

/**
 * Lay ten may tu header Host: bo cong, bo ngoac cua IPv6, viet thuong.
 * Khong kiem tra co duoc phep hay khong — xem hostAllowed.
 */
export function parseHost(raw: string | undefined): string | null {
  if (!raw) return null
  let h = raw.trim().toLowerCase()
  if (h.startsWith('[')) {
    const end = h.indexOf(']')
    if (end < 0) return null
    h = h.slice(1, end)
  } else if (h.split(':').length === 2) {
    h = h.slice(0, h.indexOf(':'))
  }
  h = h.replace(/%.*$/, '').replace(/\.$/, '')
  return h || null
}

/** Chi IP noi bo va ten mien noi bo — khop dung Name Constraints cua CA. */
export function hostAllowed(host: string): boolean {
  if (isIP(host)) {
    const addr = ipBytes(host)
    return addr !== null && PRIVATE_NETS.some((n) => inNet(addr, n))
  }
  const label = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/
  if (host.length > 253 || !host.split('.').every((l) => label.test(l))) return false
  return LOCAL_SUFFIXES.some((s) => host === s || host.endsWith(`.${s}`))
}

// ═══ CA va chung chi server ══════════════════════════════════════════

export interface TlsMaterial {
  key: string
  cert: string
}

interface State {
  caKey: KeyObject
  caCert: X509Certificate
  leafKey: string
  leafCert: X509Certificate | null
  learned: string[]
}

let state: State | null = null
let log: FastifyBaseLogger | null = null
let active = false
let renewTimer: NodeJS.Timeout | null = null
const renewHandlers: Array<(m: TlsMaterial) => void> = []

const dir = (): string => join(env.dataDir, 'tls')
const file = (name: string): string => join(dir(), name)

/** Ghi file qua file tam + rename: mat dien giua chung khong de lai file hong. */
function writeAtomic(path: string, data: string, secret = false): void {
  const tmp = `${path}.tmp`
  writeFileSync(tmp, data, { mode: secret ? 0o600 : 0o644 })
  renameSync(tmp, path)
}

/**
 * Ten CA co hau to tu khoa cong khai: moi ban cai co ten rieng, nen trong
 * danh sach chung chi cua tablet phan biet duoc CA cu va CA moi.
 */
function caName(pub: KeyObject): string {
  return `KidTube Home CA ${keyId(pub).subarray(0, 4).toString('hex')}`
}

function createCa(): { caKey: KeyObject; caCert: X509Certificate } {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  const name = dn(caName(publicKey))

  const permitted = [
    ...LOCAL_SUFFIXES.map((s) => tlv(0x82, Buffer.from(s, 'ascii'))),
    ...PRIVATE_NETS.map(([net, prefix]) => {
      const base = ipBytes(net)!
      return tlv(0x87, Buffer.concat([base, prefixMask(base.length, prefix)]))
    }),
  ]

  const caCert = buildCert({
    subject: name,
    issuer: name,
    publicKey,
    signingKey: privateKey,
    days: CA_DAYS,
    extensions: [
      ext(OID.basicConstraints, true, seq(tlv(0x01, Buffer.from([0xff])), uint([0]))),
      ext(OID.keyUsage, true, tlv(0x03, Buffer.from([0x01, 0x06]))), // keyCertSign, cRLSign
      ext(OID.subjectKeyId, false, tlv(0x04, keyId(publicKey))),
      ext(OID.nameConstraints, true, seq(tlv(0xa0, ...permitted.map((gn) => seq(gn))))),
    ],
  })

  writeAtomic(file('ca.key'), privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), true)
  writeAtomic(file('ca.crt'), caCert.toString())
  return { caKey: privateKey, caCert }
}

function loadOrCreateCa(): { caKey: KeyObject; caCert: X509Certificate } {
  if (existsSync(file('ca.key')) && existsSync(file('ca.crt'))) {
    try {
      const caKey = createPrivateKey(readFileSync(file('ca.key')))
      const caCert = new X509Certificate(readFileSync(file('ca.crt')))
      if (caCert.checkPrivateKey(caKey) && Date.parse(caCert.validTo) > Date.now() + DAY_MS) {
        return { caKey, caCert }
      }
      log?.warn('CA HTTPS đã hết hạn hoặc không khớp khoá — tạo CA mới, các thiết bị phải cài lại.')
    } catch (err) {
      log?.warn({ err }, 'Không đọc được CA HTTPS — tạo CA mới, các thiết bị phải cài lại.')
    }
  }
  const ca = createCa()
  log?.info(`Đã tạo CA HTTPS mới: ${caName(ca.caCert.publicKey)}`)
  return ca
}

function readLearned(): string[] {
  try {
    const v: unknown = JSON.parse(readFileSync(file('hosts.json'), 'utf8'))
    return Array.isArray(v) ? v.filter((h): h is string => typeof h === 'string' && hostAllowed(h)) : []
  } catch {
    return []
  }
}

/** Moi ten ma chung chi server phai phu. */
function wantedHosts(learned: string[]): string[] {
  const iface = Object.values(networkInterfaces())
    .flat()
    .filter((i) => i && !i.internal && i.family === 'IPv4')
    .map((i) => i!.address)
  const extra = env.tlsHosts
    .split(',')
    .map((h) => parseHost(h))
    .filter((h): h is string => h !== null)
  const all = ['localhost', '127.0.0.1', '::1', ...iface, ...extra, ...learned]
  return [...new Set(all.filter(hostAllowed))]
}

function covers(cert: X509Certificate, host: string): boolean {
  return isIP(host) ? cert.checkIP(host) !== undefined : cert.checkHost(host) !== undefined
}

function issueLeaf(s: State, hosts: string[]): void {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  const caPub = s.caCert.publicKey

  const leafCert = buildCert({
    // CN trong pham vi .local: vai trinh kiem tra ap Name Constraints len CN.
    subject: dn('kidtube.local'),
    issuer: dn(caName(caPub)),
    publicKey,
    signingKey: s.caKey,
    days: LEAF_DAYS,
    extensions: [
      ext(OID.basicConstraints, true, seq()),
      ext(OID.keyUsage, true, tlv(0x03, Buffer.from([0x07, 0x80]))), // digitalSignature
      // iOS bat buoc co serverAuth.
      ext(OID.extKeyUsage, false, seq(oid(OID.serverAuth))),
      ext(OID.subjectAltName, false, seq(...hosts.map(generalName))),
      ext(OID.subjectKeyId, false, tlv(0x04, keyId(publicKey))),
      ext(OID.authorityKeyId, false, seq(tlv(0x80, keyId(caPub)))),
    ],
  })

  s.leafKey = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
  s.leafCert = leafCert
  writeAtomic(file('server.key'), s.leafKey, true)
  writeAtomic(file('server.crt'), leafCert.toString())
  log?.info(`Đã ký chứng chỉ HTTPS cho: ${hosts.join(', ')}`)
}

/** Ky lai neu chung chi thieu ten, sap het han, hoac do CA cu ky. Tra true neu da ky lai. */
function ensureLeaf(s: State): boolean {
  const hosts = wantedHosts(s.learned)
  const cur = s.leafCert
  const fresh =
    cur !== null &&
    cur.verify(s.caCert.publicKey) &&
    Date.parse(cur.validTo) - Date.now() > RENEW_BEFORE_DAYS * DAY_MS &&
    hosts.every((h) => covers(cur, h))
  if (fresh) return false
  issueLeaf(s, hosts)
  return true
}

function material(s: State): TlsMaterial {
  return { key: s.leafKey, cert: s.leafCert!.toString() }
}

function notifyRenewed(s: State): void {
  for (const fn of renewHandlers) fn(material(s))
}

/**
 * Nap (hoac tao) CA va chung chi server. Tra null neu khong lam duoc — app
 * van chay HTTP binh thuong, chi la khong cai PWA duoc.
 */
export function initTls(logger: FastifyBaseLogger): TlsMaterial | null {
  log = logger
  try {
    mkdirSync(dir(), { recursive: true })
    const ca = loadOrCreateCa()

    let leafKey = ''
    let leafCert: X509Certificate | null = null
    try {
      leafKey = readFileSync(file('server.key'), 'utf8')
      leafCert = new X509Certificate(readFileSync(file('server.crt')))
      if (!leafCert.checkPrivateKey(createPrivateKey(leafKey))) leafCert = null
    } catch {
      leafCert = null // chua co hoac hong -> ky moi ben duoi
    }

    const s: State = { ...ca, leafKey, leafCert, learned: readLearned() }
    ensureLeaf(s)
    state = s

    // Server chay hang thang lien: tu gia han truoc khi chung chi het han.
    if (renewTimer) clearInterval(renewTimer)
    renewTimer = setInterval(() => {
      try {
        if (ensureLeaf(s)) notifyRenewed(s)
      } catch (err) {
        log?.error({ err }, 'Không gia hạn được chứng chỉ HTTPS')
      }
    }, 12 * 60 * 60 * 1000)
    renewTimer.unref()

    return material(s)
  } catch (err) {
    logger.error({ err }, 'Không tạo được chứng chỉ HTTPS — chỉ chạy HTTP')
    return null
  }
}

/** Server HTTPS goi khi can thay chung chi dang dung (vd: vua hoc them dia chi). */
export function onTlsRenewed(fn: (m: TlsMaterial) => void): void {
  renewHandlers.push(fn)
}

export function setHttpsActive(v: boolean): void {
  active = v
}

/** HTTPS dang thuc su lang nghe (khong chi la co chung chi). */
export function httpsActive(): boolean {
  return active && state !== null
}

export function stopTls(): void {
  if (renewTimer) clearInterval(renewTimer)
  renewTimer = null
}

export type LearnResult = { ok: true; host: string } | { ok: false; error: string }

/**
 * Ghi nho dia chi ma thiet bi dang dung de goi server, va ky lai chung chi neu
 * chua phu dia chi do.
 */
export function learnHost(rawHost: string | undefined): LearnResult {
  const s = state
  if (!s) return { ok: false, error: 'HTTPS đang tắt.' }

  const host = parseHost(rawHost)
  if (!host || !hostAllowed(host)) {
    return {
      ok: false,
      error:
        `Không cấp chứng chỉ được cho địa chỉ "${host ?? rawHost ?? ''}". ` +
        'Hãy mở trang này bằng địa chỉ IP của máy chủ (vd http://192.168.1.10:8477), ' +
        'hoặc tên kết thúc bằng .local / .lan / .home.arpa.',
    }
  }

  if (!wantedHosts(s.learned).includes(host)) {
    s.learned = [...s.learned, host].slice(-MAX_LEARNED)
    writeAtomic(file('hosts.json'), JSON.stringify(s.learned, null, 2))
  }
  if (ensureLeaf(s)) notifyRenewed(s)
  return { ok: true, host }
}

export function caInfo(): { name: string; fingerprint: string; validTo: string; der: Buffer } | null {
  const s = state
  if (!s) return null
  return {
    name: caName(s.caCert.publicKey),
    fingerprint: s.caCert.fingerprint256,
    validTo: new Date(Date.parse(s.caCert.validTo)).toISOString(),
    der: s.caCert.raw,
  }
}

/** Dia chi HTTPS ma thiet bi nen mo (cong tren may chu, khong phai trong container). */
export function httpsUrl(host: string): string {
  const port = env.httpsPublicPort
  const h = isIPv6(host) ? `[${host}]` : host
  return `https://${h}${port === 443 ? '' : `:${port}`}/`
}
