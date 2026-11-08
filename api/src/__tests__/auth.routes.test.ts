/**
 * Unit tests for routes/auth.ts — HTTP wiring around auth.service
 * (service logic itself is covered by auth.service.test.ts).
 */
import express from 'express'
import cookieParser from 'cookie-parser'
import request from 'supertest'
import { errorHandler } from '../middleware/errorHandler'
import { AppError } from '../middleware/errorHandler'

const mockAuthService = {
  register: jest.fn(),
  verifyEmailOtp: jest.fn(),
  resendEmailOtp: jest.fn(),
  login: jest.fn(),
  refreshTokens: jest.fn(),
  logout: jest.fn(),
  forgotPassword: jest.fn(),
  resetPassword: jest.fn(),
  changePassword: jest.fn(),
  sendPhoneOtp: jest.fn(),
  verifyPhoneOtp: jest.fn(),
}

jest.mock('../services/auth.service', () => mockAuthService)

jest.mock('../middleware/requireAuth', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.userId = req.headers['x-test-userid'] ?? 'user-1'
    next()
  },
  AuthRequest: {},
}))

const mockPrisma = {
  user: { findUniqueOrThrow: jest.fn() },
}
jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => mockPrisma),
}))

let app: express.Express

beforeAll(async () => {
  const authRouter = (await import('../routes/auth')).default
  app = express()
  app.use(express.json())
  app.use(cookieParser())
  app.use('/api/v1/auth', authRouter)
  app.use(errorHandler)
})

beforeEach(() => {
  jest.clearAllMocks()
})

const VALID_PASSWORD = 'Str0ng!Pass'

describe('POST /api/v1/auth/register', () => {
  it('201s on a valid body', async () => {
    mockAuthService.register.mockResolvedValue(undefined)
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Alice', email: 'alice@x.com', password: VALID_PASSWORD })
    expect(res.status).toBe(201)
    expect(mockAuthService.register).toHaveBeenCalledWith('Alice', 'alice@x.com', VALID_PASSWORD)
  })

  it('returns 500 (not a crash) on a weak password instead of hanging', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Alice', email: 'alice@x.com', password: 'weak' })
    expect(res.status).toBe(500)
    expect(mockAuthService.register).not.toHaveBeenCalled()
  })

  it('propagates a thrown AppError (e.g. duplicate email) as its status code', async () => {
    mockAuthService.register.mockRejectedValue(new AppError(409, 'An account with this email already exists'))
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Alice', email: 'alice@x.com', password: VALID_PASSWORD })
    expect(res.status).toBe(409)
  })
})

describe('POST /api/v1/auth/login', () => {
  it('sets a refresh_token cookie and returns accessToken + safe user on success', async () => {
    mockAuthService.login.mockResolvedValue({
      accessToken: 'jwt-access',
      refreshToken: 'refresh-abc',
      user: { id: 'user-1', email: 'alice@x.com', passwordHash: 'should-not-leak' },
    })

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'alice@x.com', password: 'whatever' })

    expect(res.status).toBe(200)
    expect(res.body.accessToken).toBe('jwt-access')
    expect(res.body.user).not.toHaveProperty('passwordHash')
    expect(res.headers['set-cookie']?.[0]).toMatch(/refresh_token=refresh-abc/)
  })

  it('does not crash the server and returns the AppError status on wrong password', async () => {
    mockAuthService.login.mockRejectedValue(new AppError(401, 'Invalid email or password'))
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'alice@x.com', password: 'wrong' })
    expect(res.status).toBe(401)
  })

  it('does not crash the server on a malformed body (missing email)', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ password: 'x' })
    expect(res.status).toBe(500)
    expect(mockAuthService.login).not.toHaveBeenCalled()
  })
})

describe('POST /api/v1/auth/refresh', () => {
  it('returns 401 when no refresh_token cookie is present', async () => {
    const res = await request(app).post('/api/v1/auth/refresh')
    expect(res.status).toBe(401)
    expect(mockAuthService.refreshTokens).not.toHaveBeenCalled()
  })

  it('rotates the cookie and returns a new accessToken', async () => {
    mockAuthService.refreshTokens.mockResolvedValue({ accessToken: 'new-jwt', refreshToken: 'new-refresh' })
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', ['refresh_token=old-refresh'])
    expect(res.status).toBe(200)
    expect(res.body.accessToken).toBe('new-jwt')
    expect(res.headers['set-cookie']?.[0]).toMatch(/refresh_token=new-refresh/)
  })
})

describe('POST /api/v1/auth/logout', () => {
  it('clears the cookie even with no refresh_token present', async () => {
    const res = await request(app).post('/api/v1/auth/logout')
    expect(res.status).toBe(200)
    expect(mockAuthService.logout).not.toHaveBeenCalled()
  })

  it('revokes the refresh token when present', async () => {
    mockAuthService.logout.mockResolvedValue(undefined)
    const res = await request(app).post('/api/v1/auth/logout').set('Cookie', ['refresh_token=abc'])
    expect(res.status).toBe(200)
    expect(mockAuthService.logout).toHaveBeenCalledWith('abc')
  })
})

describe('GET /api/v1/auth/me', () => {
  it('returns the authenticated user without the password hash', async () => {
    mockPrisma.user.findUniqueOrThrow.mockResolvedValue({ id: 'user-1', email: 'a@x.com', passwordHash: 'h' })
    const res = await request(app).get('/api/v1/auth/me').set('x-test-userid', 'user-1')
    expect(res.status).toBe(200)
    expect(res.body).not.toHaveProperty('passwordHash')
  })
})

describe('POST /api/v1/auth/forgot-password / reset-password', () => {
  it('always 200s on forgot-password to avoid email enumeration', async () => {
    mockAuthService.forgotPassword.mockResolvedValue(undefined)
    const res = await request(app).post('/api/v1/auth/forgot-password').send({ email: 'nobody@x.com' })
    expect(res.status).toBe(200)
  })

  it('propagates AppError(400) for an invalid/expired reset token', async () => {
    mockAuthService.resetPassword.mockRejectedValue(new AppError(400, 'Reset link is invalid or has expired'))
    const res = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: 'bad-token', password: VALID_PASSWORD })
    expect(res.status).toBe(400)
  })
})

describe('POST /api/v1/auth/change-password', () => {
  it('clears the session cookie on success', async () => {
    mockAuthService.changePassword.mockResolvedValue(undefined)
    const res = await request(app)
      .post('/api/v1/auth/change-password')
      .set('x-test-userid', 'user-1')
      .send({ currentPassword: 'old', newPassword: VALID_PASSWORD })
    expect(res.status).toBe(200)
    expect(mockAuthService.changePassword).toHaveBeenCalledWith('user-1', 'old', VALID_PASSWORD)
  })
})

describe('POST /api/v1/auth/send-phone-otp / verify-phone', () => {
  it('rejects a malformed Indian phone number without crashing', async () => {
    const res = await request(app)
      .post('/api/v1/auth/send-phone-otp')
      .set('x-test-userid', 'user-1')
      .send({ phone: '12345' })
    expect(res.status).toBe(500)
    expect(mockAuthService.sendPhoneOtp).not.toHaveBeenCalled()
  })

  it('accepts a valid 10-digit Indian mobile number', async () => {
    mockAuthService.sendPhoneOtp.mockResolvedValue(undefined)
    const res = await request(app)
      .post('/api/v1/auth/send-phone-otp')
      .set('x-test-userid', 'user-1')
      .send({ phone: '9876543210' })
    expect(res.status).toBe(200)
  })

  it('verifies phone OTP and persists the phone number', async () => {
    mockAuthService.verifyPhoneOtp.mockResolvedValue(undefined)
    const res = await request(app)
      .post('/api/v1/auth/verify-phone')
      .set('x-test-userid', 'user-1')
      .send({ phone: '9876543210', otp: '232323' })
    expect(res.status).toBe(200)
    expect(mockAuthService.verifyPhoneOtp).toHaveBeenCalledWith('user-1', '9876543210', '232323')
  })
})
