import bcrypt from 'bcryptjs'

// Mock Prisma so tests don't need a real DB
jest.mock('@prisma/client', () => {
  const mockUser = {
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
  return {
    PrismaClient: jest.fn().mockImplementation(() => ({
      user: {
        findUnique: jest.fn().mockResolvedValue(mockUser),
        findUniqueOrThrow: jest.fn().mockResolvedValue(mockUser),
        create: jest.fn().mockResolvedValue(mockUser),
        update: jest.fn().mockResolvedValue(mockUser),
      },
      refreshToken: {
        create: jest.fn().mockResolvedValue({ token: 'rt', expiresAt: new Date() }),
        findUnique: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
      },
      otpToken: {
        create: jest.fn().mockResolvedValue({ id: 'otp-1', code: '123456', attempts: 0 }),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn((ops: any[]) => Promise.all(ops)),
    })),
  }
})

jest.mock('jsonwebtoken', () => ({
  sign: jest.fn().mockReturnValue('mock-access-token'),
  verify: jest.fn().mockReturnValue({ sub: 'user-1', role: 'USER' }),
}))

process.env.JWT_SECRET = 'test-secret'

import * as authService from '../services/auth.service'
import { AppError } from '../middleware/errorHandler'

describe('validateOtp — master OTP', () => {
  it('accepts master OTP 232323 without DB lookup', async () => {
    // verifyEmailOtp calls validateOtp internally; master OTP should bypass
    const { PrismaClient } = require('@prisma/client')
    const instance = new PrismaClient()
    instance.user.findUnique.mockResolvedValueOnce({
      id: 'user-1', email: 'test@example.com',
    })
    await expect(authService.verifyEmailOtp('test@example.com', '232323')).resolves.not.toThrow()
    expect(instance.otpToken.findFirst).not.toHaveBeenCalled()
  })
})

describe('changePassword', () => {
  it('rejects if current password is wrong', async () => {
    const hash = await bcrypt.hash('CorrectPass1!', 12)
    const { PrismaClient } = require('@prisma/client')
    new PrismaClient().user.findUniqueOrThrow.mockResolvedValueOnce({
      id: 'user-1', passwordHash: hash,
    })
    await expect(authService.changePassword('user-1', 'WrongPass1!', 'NewPass1!')).rejects.toThrow(AppError)
  })

  it('rejects if new password equals current', async () => {
    const hash = await bcrypt.hash('Same1Pass!', 12)
    const { PrismaClient } = require('@prisma/client')
    new PrismaClient().user.findUniqueOrThrow.mockResolvedValueOnce({
      id: 'user-1', passwordHash: hash,
    })
    await expect(authService.changePassword('user-1', 'Same1Pass!', 'Same1Pass!')).rejects.toThrow(AppError)
  })
})
