import type { FastifyInstance } from 'fastify'
import { caInfo, httpsActive, httpsUrl, learnHost } from '../services/tls.js'
import { requireParent } from './auth.js'

/**
 * Cai app (PWA) len dien thoai / tablet — xem services/tls.ts.
 *
 * Luong cua bo me: mo trang Cai dat bang HTTP -> tai CA -> cai CA vao may ->
 * mo link HTTPS -> cai app. Muc "Cài app" trong Cai dat dan tung buoc.
 */
export async function installRoutes(app: FastifyInstance): Promise<void> {
  /**
   * CA cua nha minh. CONG KHAI co chu dich: day la chung chi (khoa cong khai),
   * khong co gi bi mat, va phai tai duoc ngay tren thiet bi can cai.
   *
   * `inline` + MIME x-x509-ca-cert: Safari iOS mo luong "cai hoso cau hinh",
   * Chrome Android luu file vao Tai xuong de cai trong Cai dat cua may.
   */
  app.get('/ca.crt', async (_req, reply) => {
    const ca = caInfo()
    if (!ca) {
      reply.code(404)
      return { error: 'HTTPS đang tắt — không có chứng chỉ để tải.' }
    }
    reply
      .header('content-type', 'application/x-x509-ca-cert')
      .header('content-disposition', 'inline; filename="kidtube-ca.crt"')
      .header('cache-control', 'no-store')
    return reply.send(ca.der)
  })

  /**
   * Trang thai de dan bo me cai app. Goi route nay = server HOC dia chi ma
   * thiet bi dang dung (header Host) va ky lai chung chi cho dia chi do. Chi
   * cho bo me: tranh nguoi la trong mang nha nhoi ten vao chung chi.
   */
  app.get('/api/admin/install', { preHandler: requireParent }, async (req) => {
    const ca = caInfo()
    if (!ca || !httpsActive()) {
      return { https: { enabled: false, url: null, hostError: null }, ca: null }
    }

    const learned = learnHost(req.host)
    return {
      https: {
        enabled: true,
        url: learned.ok ? httpsUrl(learned.host) : null,
        hostError: learned.ok ? null : learned.error,
      },
      ca: { name: ca.name, fingerprint: ca.fingerprint, validTo: ca.validTo, url: '/ca.crt' },
    }
  })
}
