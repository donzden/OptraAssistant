import { Router, Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { rateLimit } from 'express-rate-limit'
import * as authService from '../services/auth.service'
import { requireAuth, AuthRequest } from '../middleware/requireAuth'
import { PrismaClient } from '@prisma/client'

const router = Router()
const prisma = new PrismaClient()

const authRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false })

// POST /auth/register
router.post('/register', authRateLimit, async (req: Request, res: Response, next: NextFunction) => {
  const schema = z.object({
    name: z.string().min(2).max(100),
    email: z.string().email(),
    password: z.string().min(8).regex(/[A-Z]/).regex(/[0-9]/).regex(/[^A-Za-z0-9]/),
  })
  const body = schema.parse(req.body)
  await authService.register(body.name, body.email, body.password)
  res.status(201).json({ message: 'Account created. Please check your email for the OTP.' })
})

// POST /auth/verify-email
router.post('/verify-email', authRateLimit, async (req: Request, res: Response) => {
  const { email, otp } = z.object({ email: z.string().email(), otp: z.string().length(6) }).parse(req.body)
  await authService.verifyEmailOtp(email, otp)
  res.json({ message: 'Email verified successfully' })
})

// POST /auth/resend-email-otp
router.post('/resend-email-otp', authRateLimit, async (req: Request, res: Response) => {
  const { email } = z.object({ email: z.string().email() }).parse(req.body)
  await authService.forgotPassword(email) // reuses OTP creation logic
  res.json({ message: 'OTP sent' })
})

// POST /auth/login
router.post('/login', authRateLimit, async (req: Request, res: Response) => {
  const { email, password, rememberMe } = z.object({
    email: z.string().email(),
    password: z.string(),
    rememberMe: z.boolean().default(false),
  }).parse(req.body)

  const { accessToken, refreshToken, user } = await authService.login(email, password, rememberMe)

  res.cookie('refresh_token', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: (rememberMe ? 30 : 7) * 86400 * 1000,
  })

  const { passwordHash: _, ...safeUser } = user as any
  res.json({ accessToken, user: safeUser })
})

// POST /auth/refresh
router.post('/refresh', async (req: Request, res: Response) => {
  const token = req.cookies?.refresh_token
  if (!token) return res.status(401).json({ message: 'No refresh token' })

  const { accessToken, refreshToken } = await authService.refreshTokens(token)

  res.cookie('refresh_token', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 86400 * 1000,
  })

  return res.json({ accessToken })
})

// POST /auth/logout
router.post('/logout', async (req: Request, res: Response) => {
  const token = req.cookies?.refresh_token
  if (token) await authService.logout(token)
  res.clearCookie('refresh_token')
  res.json({ message: 'Logged out' })
})

// GET /auth/me
router.get('/me', requireAuth, async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.userId } })
  const { passwordHash: _, ...safeUser } = user as any
  res.json(safeUser)
})

// POST /auth/forgot-password
router.post('/forgot-password', authRateLimit, async (req: Request, res: Response) => {
  const { email } = z.object({ email: z.string().email() }).parse(req.body)
  await authService.forgotPassword(email)
  res.json({ message: 'If this email is registered, a reset link has been sent.' })
})

// POST /auth/reset-password
router.post('/reset-password', authRateLimit, async (req: Request, res: Response) => {
  const { token, password } = z.object({ token: z.string(), password: z.string().min(8) }).parse(req.body)
  await authService.resetPassword(token, password)
  res.json({ message: 'Password reset successfully' })
})

// POST /auth/change-password
router.post('/change-password', requireAuth, async (req: AuthRequest, res: Response) => {
  const { currentPassword, newPassword } = z.object({
    currentPassword: z.string(),
    newPassword: z.string().min(8).regex(/[A-Z]/).regex(/[0-9]/).regex(/[^A-Za-z0-9]/),
  }).parse(req.body)
  await authService.changePassword(req.userId!, currentPassword, newPassword)
  res.clearCookie('refresh_token')
  res.json({ message: 'Password changed. Please log in again.' })
})

// POST /auth/send-phone-otp
router.post('/send-phone-otp', requireAuth, async (req: AuthRequest, res: Response) => {
  const { phone } = z.object({ phone: z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number') }).parse(req.body)
  await authService.sendPhoneOtp(req.userId!, phone)
  res.json({ message: 'OTP sent to your phone' })
})

// POST /auth/verify-phone
router.post('/verify-phone', requireAuth, async (req: AuthRequest, res: Response) => {
  const { phone, otp } = z.object({ phone: z.string(), otp: z.string().length(6) }).parse(req.body)
  await authService.verifyPhoneOtp(req.userId!, phone, otp)
  res.json({ message: 'Phone verified successfully' })
})

export default router
