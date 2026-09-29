import { randomBytes, timingSafeEqual } from 'node:crypto'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { getSetting, setSetting } from '../db/index.js'
import { hashPin } from '../db/seed.js'
import { badRequest, unauthorized } from '../lib/errors.js'

const COOKIE = 'kt_parent'
const TTL_MS = 8 * 60 * 60 * 1000 // 8 gio

/**
 * Phien dang nhap luu trong bo nho. Khoi dong lai server = phai nhap PIN lai.
 * Chap nhan duoc: day la app trong nha, va nghieng ve an toan thi tot hon.
 */
const sessions = new Map<string, number>() // token -> het han (ms)

function sweep(): void {
  const now = Date.now()
  for (const [token, exp] of sessions) if (exp < now) sessions.delete(token)
}

/** So sanh chuoi theo thoi gian hang so — tranh do ro PIN qua thoi gian phan hoi. */
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

export function verifyPin(pin: string): boolean {
  const salt = getSetting('pin_salt')
  const hash = getSetting('pin_hash')
  if (!salt || !hash) return false
  return safeEqual(hashPin(pin, salt), hash)
}

export function setPin(pin: string): void {
  if (!/^\d{4,12}$/.test(pin)) {
    throw badRequest('PIN phải gồm 4–12 chữ số')
  }
  const salt = randomBytes(16).toString('hex')
  setSetting('pin_salt', salt)
  setSetting('pin_hash', hashPin(pin, salt))
  setSetting('pin_is_default', '0')
  // Doi PIN thi dang xuat moi phien — thiet bi cu khong duoc giu quyen.
  sessions.clear()
}

export function isParent(req: FastifyRequest): boolean {
  sweep()
  const token = req.cookies[COOKIE]
  if (!token) return false
  const exp = sessions.get(token)
  return exp !== undefined && exp > Date.now()
}

/** Hook chan moi route /api/admin/*. */
export async function requireParent(req: FastifyRequest): Promise<void> {
  if (!isParent(req)) throw unauthorized('Cần nhập PIN của bố mẹ')
}

function issue(reply: FastifyReply): void {
  const token = randomBytes(32).toString('hex')
  sessions.set(token, Date.now() + TTL_MS)
  reply.setCookie(COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: TTL_MS / 1000,
    // Khong dat `secure`: app chay HTTP trong LAN la truong hop pho bien.
    // Caddy o truoc van cung cap HTTPS khi duoc cau hinh.
  })
}

/** Chong do PIN: khoa tam sau nhieu lan sai, theo dia chi IP. */
const attempts = new Map<string, { count: number; until: number }>()
const MAX_ATTEMPTS = 5
const LOCKOUT_MS = 5 * 60 * 1000

function checkLockout(ip: string): number {
  const rec = attempts.get(ip)
  if (!rec) return 0
  if (rec.until > Date.now()) return Math.ceil((rec.until - Date.now()) / 1000)
  if (rec.until !== 0 && rec.until <= Date.now()) attempts.delete(ip)
  return 0
}

function recordFailure(ip: string): void {
  const rec = attempts.get(ip) ?? { count: 0, until: 0 }
  rec.count++
  if (rec.count >= MAX_ATTEMPTS) {
    rec.until = Date.now() + LOCKOUT_MS
    rec.count = 0
  }
  attempts.set(ip, rec)
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: { pin?: string } }>('/api/admin/login', async (req, reply) => {
    const ip = req.ip
    const lockedFor = checkLockout(ip)
    if (lockedFor > 0) {
      reply.code(429)
      return { error: `Sai PIN nhiều lần. Thử lại sau ${lockedFor} giây.` }
    }

    const pin = String(req.body?.pin ?? '')
    if (!pin) {
      reply.code(400)
      return { error: 'Chưa nhập PIN' }
    }

    if (!verifyPin(pin)) {
      recordFailure(ip)
      reply.code(401)
      return { error: 'PIN không đúng' }
    }

    attempts.delete(ip)
    issue(reply)
    return { ok: true, pinIsDefault: getSetting('pin_is_default') === '1' }
  })

  app.post('/api/admin/logout', async (req, reply) => {
    const token = req.cookies[COOKIE]
    if (token) sessions.delete(token)
    reply.clearCookie(COOKIE, { path: '/' })
    return { ok: true }
  })

  app.get('/api/admin/me', async (req) => ({
    authenticated: isParent(req),
    pinIsDefault: getSetting('pin_is_default') === '1',
  }))

  app.post<{ Body: { currentPin?: string; newPin?: string } }>(
    '/api/admin/pin',
    { preHandler: requireParent },
    async (req, reply) => {
      const current = String(req.body?.currentPin ?? '')
      const next = String(req.body?.newPin ?? '')
      if (!verifyPin(current)) {
        reply.code(401)
        return { error: 'PIN hiện tại không đúng' }
      }
      setPin(next) // nem HttpError neu dinh dang sai
      issue(reply) // cap lai phien cho chinh thiet bi vua doi PIN
      return { ok: true }
    },
  )
}
