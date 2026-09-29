export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
    readonly code?: string,
  ) {
    super(message)
    this.name = 'HttpError'
  }
}

export const badRequest = (msg: string, code?: string) => new HttpError(400, msg, code)
export const unauthorized = (msg = 'Chua dang nhap') => new HttpError(401, msg, 'UNAUTHORIZED')
export const notFound = (msg = 'Khong tim thay') => new HttpError(404, msg, 'NOT_FOUND')
export const conflict = (msg: string) => new HttpError(409, msg, 'CONFLICT')
export const upstream = (msg: string) => new HttpError(502, msg, 'UPSTREAM')
