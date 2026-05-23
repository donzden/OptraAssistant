import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import { PrismaClient } from '@prisma/client'
import { AppError } from '../middleware/errorHandler'

const prisma = new PrismaClient()

const MASTER_OTP = '232323'
const OTP_EXPIRY_MINUTES = 15
const RESET_TOKEN_EXPIRY_HOURS = 1
const ACCESS_TOKEN_MINUTES = 15
const REFRESH_TOKEN_DAYS = 7
const MAX_LOGIN_FAILURES = 5

export async function register(name: string, email: string, password: string) {
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) throw new AppError(409, 'An account with this email already exists', 'EMAIL_TAKEN', 'email')

  const passwordHash = await bcrypt.hash(password, 12)
  const user = await prisma.user.create({ data: { name, email, passwordHash } })

  await createOtp(user.id, 'EMAIL_VERIFY')
  return user
}

export async function verifyEmailOtp(email: string, code: string) {
  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) throw new AppError(400, 'Invalid request')

  await validateOtp(user.id, 'EMAIL_VERIFY', code)
  await prisma.user.update({ where: { id: user.id }, data: { emailVerified: true, status: 'ACTIVE' } })
}

export async function login(email: string, password: string, rememberMe = false) {
  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) throw new AppError(401, 'Invalid email or password')

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new AppError(403, 'Account is temporarily locked. Check your email to unlock.', 'ACCOUNT_LOCKED')
  }

  const valid = await bcrypt.compare(password, user.passwordHash)
  if (!valid) {
    const failures = user.loginFailureCount + 1
    const updates: any = { loginFailureCount: failures }
    if (failures >= MAX_LOGIN_FAILURES) {
      updates.lockedUntil = new Date(Date.now() + 30 * 60 * 1000) // 30 min
      updates.status = 'LOCKED'
    }
    await prisma.user.update({ where: { id: user.id }, data: updates })
    throw new AppError(401, 'Invalid email or password')
  }

  if (!user.emailVerified) throw new AppError(403, 'Please verify your email before logging in', 'EMAIL_UNVERIFIED')
  if (user.status === 'INACTIVE') throw new AppError(403, 'Account is deactivated')

  // Reset failure count
  await prisma.user.update({ where: { id: user.id }, data: { loginFailureCount: 0, lockedUntil: null, lastLoginAt: new Date() } })

  const accessToken = generateAccessToken(user.id, user.role)
  const refreshToken = await createRefreshToken(user.id, rememberMe)

  return { accessToken, refreshToken, user }
}

export async function refreshTokens(token: string) {
  const stored = await prisma.refreshToken.findUnique({
    where: { token },
    include: { user: true },
  })

  if (!stored || stored.expiresAt < new Date()) {
    if (stored) await prisma.refreshToken.delete({ where: { id: stored.id } })
    throw new AppError(401, 'Refresh token expired')
  }

  // Rotate
  await prisma.refreshToken.delete({ where: { id: stored.id } })
  const newRefreshToken = await createRefreshToken(stored.userId)
  const accessToken = generateAccessToken(stored.userId, stored.user.role)

  return { accessToken, refreshToken: newRefreshToken }
}

export async function logout(refreshToken: string) {
  await prisma.refreshToken.deleteMany({ where: { token: refreshToken } })
}

export async function forgotPassword(email: string) {
  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) return // Silent — no enumeration

  await createOtp(user.id, 'PASSWORD_RESET')
}

export async function resetPassword(token: string, newPassword: string) {
  const otp = await prisma.otpToken.findFirst({
    where: { code: token, type: 'PASSWORD_RESET', used: false, expiresAt: { gt: new Date() } },
  })
  if (!otp) throw new AppError(400, 'Reset link is invalid or has expired')

  const passwordHash = await bcrypt.hash(newPassword, 12)
  await prisma.$transaction([
    prisma.user.update({ where: { id: otp.userId }, data: { passwordHash } }),
    prisma.otpToken.update({ where: { id: otp.id }, data: { used: true } }),
    prisma.refreshToken.deleteMany({ where: { userId: otp.userId } }),
  ])
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } })
  const valid = await bcrypt.compare(currentPassword, user.passwordHash)
  if (!valid) throw new AppError(400, 'Current password is incorrect', 'WRONG_PASSWORD', 'currentPassword')

  const sameAsOld = await bcrypt.compare(newPassword, user.passwordHash)
  if (sameAsOld) throw new AppError(400, 'New password cannot be the same as current', 'SAME_PASSWORD', 'newPassword')

  const passwordHash = await bcrypt.hash(newPassword, 12)
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
    prisma.refreshToken.deleteMany({ where: { userId } }),
  ])
}

export async function sendPhoneOtp(userId: string, _phone: string) {
  await createOtp(userId, 'PHONE_VERIFY')
  // TODO: integrate SMS provider (Twilio/MSG91)
}

export async function verifyPhoneOtp(userId: string, phone: string, code: string) {
  await validateOtp(userId, 'PHONE_VERIFY', code)
  await prisma.user.update({ where: { id: userId }, data: { phone, phoneVerified: true } })
}

// --- Helpers ---

function generateAccessToken(userId: string, role: string) {
  return jwt.sign({ sub: userId, role }, process.env.JWT_SECRET!, {
    expiresIn: `${ACCESS_TOKEN_MINUTES}m`,
  })
}

async function createRefreshToken(userId: string, rememberMe = false) {
  const token = crypto.randomBytes(48).toString('hex')
  const days = rememberMe ? 30 : REFRESH_TOKEN_DAYS
  await prisma.refreshToken.create({
    data: { token, userId, expiresAt: new Date(Date.now() + days * 86400 * 1000) },
  })
  return token
}

async function createOtp(userId: string, type: string) {
  const code = Math.floor(100000 + Math.random() * 900000).toString()
  await prisma.otpToken.create({
    data: {
      userId,
      type,
      code,
      expiresAt: new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000),
    },
  })
  return code
}

async function validateOtp(userId: string, type: string, code: string) {
  // Master OTP always passes
  if (code === MASTER_OTP) return

  const otp = await prisma.otpToken.findFirst({
    where: { userId, type, used: false, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  })

  if (!otp) throw new AppError(400, 'OTP has expired. Please request a new one.')

  await prisma.otpToken.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } })

  if (otp.attempts + 1 >= 3) {
    await prisma.otpToken.update({ where: { id: otp.id }, data: { used: true } })
    throw new AppError(400, 'Too many incorrect attempts. Please request a new OTP.')
  }

  if (otp.code !== code) throw new AppError(400, 'Incorrect OTP')

  await prisma.otpToken.update({ where: { id: otp.id }, data: { used: true } })
}
