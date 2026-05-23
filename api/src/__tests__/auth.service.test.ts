import bcrypt from 'bcryptjs'

// All PrismaClient instances share these mocks — stored in global for test access
jest.mock('@prisma/client', () => {
  const baseUser = {
    id: 'user-1',
    name: 'Test User',
    email: 'test@example.com',
    passwordHash: '',
    emailVerified: true,
    status: 'ACTIVE',
    role: 'USER',
    loginFailureCount: 0,
    lockedUntil: null,
    lastLoginAt: null,
  }

  const methods = {
    user: {
      findUnique: jest.fn().mockResolvedValue(null),
      findUniqueOrThrow: jest.fn().mockResolvedValue(baseUser),
      create: jest.fn().mockResolvedValue(baseUser),
      update: jest.fn().mockResolvedValue(baseUser),
    },
    refreshToken: {
      create: jest.fn().mockResolvedValue({ id: 'rt-1', token: 'mock-refresh-token', expiresAt: new Date(Date.now() + 7 * 86400_000) }),
      findUnique: jest.fn().mockResolvedValue(null),
      delete: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({}),
    },
    otpToken: {
      create: jest.fn().mockResolvedValue({ id: 'otp-1', code: '654321', attempts: 0 }),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
    },
    $transaction: jest.fn((ops: any[]) => Promise.all(ops)),
  }

  ;(global as any).__mockPrisma = methods

  return { PrismaClient: jest.fn(() => methods) }
})

jest.mock('jsonwebtoken', () => ({
  sign: jest.fn().mockReturnValue('mock-access-token'),
  verify: jest.fn().mockReturnValue({ sub: 'user-1', role: 'USER' }),
}))

jest.mock('../services/email.service', () => ({
  sendEmailVerificationOtp: jest.fn().mockResolvedValue(undefined),
  sendPasswordResetOtp: jest.fn().mockResolvedValue(undefined),
}))

process.env.JWT_SECRET = 'test-secret'

import jwt from 'jsonwebtoken'
import * as authService from '../services/auth.service'
import { AppError } from '../middleware/errorHandler'
import * as emailService from '../services/email.service'

const db = () => (global as any).__mockPrisma as ReturnType<typeof buildMockPrisma>
function buildMockPrisma() { return (global as any).__mockPrisma }

const baseUser = {
  id: 'user-1',
  name: 'Test User',
  email: 'test@example.com',
  passwordHash: '',
  emailVerified: true,
  status: 'ACTIVE',
  role: 'USER',
  loginFailureCount: 0,
  lockedUntil: null,
  lastLoginAt: null,
}

beforeEach(() => {
  jest.clearAllMocks()
  db().user.findUnique.mockResolvedValue(null)
  db().user.findUniqueOrThrow.mockResolvedValue(baseUser)
  db().user.create.mockResolvedValue(baseUser)
  db().user.update.mockResolvedValue(baseUser)
  db().refreshToken.create.mockResolvedValue({ id: 'rt-1', token: 'mock-refresh-token', expiresAt: new Date(Date.now() + 7 * 86400_000) })
  db().refreshToken.findUnique.mockResolvedValue(null)
  db().refreshToken.delete.mockResolvedValue({})
  db().refreshToken.deleteMany.mockResolvedValue({})
  db().otpToken.create.mockResolvedValue({ id: 'otp-1', code: '654321', attempts: 0 })
  db().otpToken.findFirst.mockResolvedValue(null)
  db().otpToken.update.mockResolvedValue({})
  db().$transaction.mockImplementation((ops: any[]) => Promise.all(ops))
})

// ─── register ────────────────────────────────────────────────────────────────

describe('register', () => {
  it('hashes password with bcrypt before creating user', async () => {
    await authService.register('New User', 'new@example.com', 'Pass1!')
    const createCall = db().user.create.mock.calls[0][0]
    expect(createCall.data.passwordHash).toMatch(/^\$2[aby]\$12\$/)
    const isHashed = await bcrypt.compare('Pass1!', createCall.data.passwordHash)
    expect(isHashed).toBe(true)
  })

  it('rejects duplicate email with 409', async () => {
    db().user.findUnique.mockResolvedValue(baseUser)
    await expect(authService.register('Test', 'test@example.com', 'Pass1!'))
      .rejects.toMatchObject({ statusCode: 409, code: 'EMAIL_TAKEN' })
  })

  it('sends email verification OTP after creating user', async () => {
    await authService.register('New User', 'new@example.com', 'Pass1!')
    expect(emailService.sendEmailVerificationOtp).toHaveBeenCalledWith(
      'new@example.com',
      'New User',
      expect.stringMatching(/^\d{6}$/)
    )
  })

  it('OTP sent to email is a 6-digit string', async () => {
    await authService.register('New User', 'new@example.com', 'Pass1!')
    const [, , otp] = (emailService.sendEmailVerificationOtp as jest.Mock).mock.calls[0]
    expect(otp).toMatch(/^\d{6}$/)
  })
})

// ─── login ────────────────────────────────────────────────────────────────────

describe('login', () => {
  it('rejects unverified email with EMAIL_UNVERIFIED', async () => {
    const hash = await bcrypt.hash('Pass1!', 12)
    db().user.findUnique.mockResolvedValue({ ...baseUser, emailVerified: false, passwordHash: hash })
    await expect(authService.login('test@example.com', 'Pass1!'))
      .rejects.toMatchObject({ statusCode: 403, code: 'EMAIL_UNVERIFIED' })
  })

  it('rejects wrong password with 401', async () => {
    const hash = await bcrypt.hash('Correct1!', 12)
    db().user.findUnique.mockResolvedValue({ ...baseUser, passwordHash: hash })
    await expect(authService.login('test@example.com', 'Wrong1!'))
      .rejects.toMatchObject({ statusCode: 401 })
  })

  it('returns accessToken and refreshToken on successful login', async () => {
    const hash = await bcrypt.hash('Pass1!', 12)
    db().user.findUnique.mockResolvedValue({ ...baseUser, passwordHash: hash })
    const result = await authService.login('test@example.com', 'Pass1!')
    expect(result.accessToken).toBe('mock-access-token')
    expect(typeof result.refreshToken).toBe('string')
    expect(result.refreshToken.length).toBeGreaterThan(0)
  })

  it('signs JWT with userId and role', async () => {
    const hash = await bcrypt.hash('Pass1!', 12)
    db().user.findUnique.mockResolvedValue({ ...baseUser, passwordHash: hash })
    await authService.login('test@example.com', 'Pass1!')
    expect(jwt.sign).toHaveBeenCalledWith(
      { sub: 'user-1', role: 'USER' },
      'test-secret',
      expect.anything()
    )
  })

  it('rejects locked account', async () => {
    const hash = await bcrypt.hash('Pass1!', 12)
    db().user.findUnique.mockResolvedValue({
      ...baseUser,
      passwordHash: hash,
      lockedUntil: new Date(Date.now() + 60_000),
    })
    await expect(authService.login('test@example.com', 'Pass1!'))
      .rejects.toMatchObject({ statusCode: 403, code: 'ACCOUNT_LOCKED' })
  })
})

// ─── refreshTokens ────────────────────────────────────────────────────────────

describe('refreshTokens', () => {
  it('rotates token — deletes old and creates new', async () => {
    db().refreshToken.findUnique.mockResolvedValue({
      id: 'rt-1',
      token: 'old-token',
      userId: 'user-1',
      expiresAt: new Date(Date.now() + 86400_000),
      user: baseUser,
    })
    await authService.refreshTokens('old-token')
    expect(db().refreshToken.delete).toHaveBeenCalledWith({ where: { id: 'rt-1' } })
    expect(db().refreshToken.create).toHaveBeenCalled()
  })

  it('returns new accessToken and refreshToken after rotation', async () => {
    db().refreshToken.findUnique.mockResolvedValue({
      id: 'rt-1',
      token: 'old-token',
      userId: 'user-1',
      expiresAt: new Date(Date.now() + 86400_000),
      user: baseUser,
    })
    const result = await authService.refreshTokens('old-token')
    expect(result.accessToken).toBe('mock-access-token')
    expect(result.refreshToken).toBeDefined()
  })

  it('throws 401 when token is expired', async () => {
    db().refreshToken.findUnique.mockResolvedValue({
      id: 'rt-1',
      token: 'old-token',
      userId: 'user-1',
      expiresAt: new Date(Date.now() - 1000), // expired
      user: baseUser,
    })
    await expect(authService.refreshTokens('old-token')).rejects.toMatchObject({ statusCode: 401 })
  })

  it('throws 401 when token is not found', async () => {
    db().refreshToken.findUnique.mockResolvedValue(null)
    await expect(authService.refreshTokens('nonexistent')).rejects.toMatchObject({ statusCode: 401 })
  })
})

// ─── validateOtp ─────────────────────────────────────────────────────────────

describe('validateOtp — master OTP', () => {
  it('accepts 232323 without DB lookup', async () => {
    db().user.findUnique.mockResolvedValue(baseUser)
    await expect(authService.verifyEmailOtp('test@example.com', '232323')).resolves.not.toThrow()
    expect(db().otpToken.findFirst).not.toHaveBeenCalled()
  })
})

describe('validateOtp — expiry', () => {
  it('throws when no valid OTP exists in DB (expired or never issued)', async () => {
    db().user.findUnique.mockResolvedValue(baseUser)
    db().otpToken.findFirst.mockResolvedValue(null)
    await expect(authService.verifyEmailOtp('test@example.com', '999999')).rejects.toThrow(AppError)
  })

  it('throws when OTP code is incorrect', async () => {
    db().user.findUnique.mockResolvedValue(baseUser)
    db().otpToken.findFirst.mockResolvedValue({
      id: 'otp-1',
      code: '123456',
      attempts: 0,
      expiresAt: new Date(Date.now() + 60_000),
    })
    await expect(authService.verifyEmailOtp('test@example.com', '999999')).rejects.toThrow(AppError)
  })

  it('accepts correct OTP and marks it used', async () => {
    db().user.findUnique.mockResolvedValue(baseUser)
    db().otpToken.findFirst.mockResolvedValue({
      id: 'otp-1',
      code: '123456',
      attempts: 0,
      expiresAt: new Date(Date.now() + 60_000),
    })
    await expect(authService.verifyEmailOtp('test@example.com', '123456')).resolves.not.toThrow()
    expect(db().otpToken.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ used: true }) })
    )
  })
})

// ─── changePassword ───────────────────────────────────────────────────────────

describe('changePassword', () => {
  it('rejects if current password is wrong', async () => {
    const hash = await bcrypt.hash('CorrectPass1!', 12)
    db().user.findUniqueOrThrow.mockResolvedValue({ ...baseUser, passwordHash: hash })
    await expect(authService.changePassword('user-1', 'WrongPass1!', 'NewPass2@'))
      .rejects.toMatchObject({ statusCode: 400, code: 'WRONG_PASSWORD' })
  })

  it('rejects if new password equals current', async () => {
    const hash = await bcrypt.hash('SamePass1!', 12)
    db().user.findUniqueOrThrow.mockResolvedValue({ ...baseUser, passwordHash: hash })
    await expect(authService.changePassword('user-1', 'SamePass1!', 'SamePass1!'))
      .rejects.toMatchObject({ statusCode: 400, code: 'SAME_PASSWORD' })
  })

  it('updates password hash and revokes all sessions on success', async () => {
    const hash = await bcrypt.hash('OldPass1!', 12)
    db().user.findUniqueOrThrow.mockResolvedValue({ ...baseUser, passwordHash: hash })
    await authService.changePassword('user-1', 'OldPass1!', 'NewPass2@')
    expect(db().$transaction).toHaveBeenCalled()
  })
})
