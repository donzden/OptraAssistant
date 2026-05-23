import { Router, Response } from 'express'
import { z } from 'zod'
import { PrismaClient } from '@prisma/client'
import { requireAuth, requireAdmin, AuthRequest } from '../middleware/requireAuth'

const router = Router()
const prisma = new PrismaClient()

// All admin routes require auth + admin role
router.use(requireAuth, requireAdmin)

// GET /admin/users
router.get('/users', async (req: AuthRequest, res: Response) => {
  const page = Number(req.query.page ?? 1)
  const limit = Math.min(Number(req.query.limit ?? 20), 100)
  const skip = (page - 1) * limit

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, name: true, email: true, phone: true,
        role: true, status: true, emailVerified: true, phoneVerified: true,
        riskAppetite: true, createdAt: true, lastLoginAt: true,
      },
    }),
    prisma.user.count(),
  ])

  res.json({ data: users, total, page, limit })
})

// PATCH /admin/users/:id/status
router.patch('/users/:id/status', async (req: AuthRequest, res: Response) => {
  const { status } = z.object({ status: z.enum(['ACTIVE', 'INACTIVE', 'LOCKED']) }).parse(req.body)
  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: { status, ...(status === 'ACTIVE' ? { lockedUntil: null, loginFailureCount: 0 } : {}) },
    select: { id: true, name: true, email: true, status: true },
  })
  res.json(user)
})

// PATCH /admin/users/:id/role
router.patch('/users/:id/role', async (req: AuthRequest, res: Response) => {
  const { role } = z.object({ role: z.enum(['USER', 'ADMIN']) }).parse(req.body)
  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: { role },
    select: { id: true, name: true, email: true, role: true },
  })
  res.json(user)
})

// GET /admin/stats
router.get('/stats', async (_req: AuthRequest, res: Response) => {
  const [totalUsers, activeUsers, pendingUsers, lockedUsers] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { status: 'ACTIVE' } }),
    prisma.user.count({ where: { status: 'PENDING' } }),
    prisma.user.count({ where: { status: 'LOCKED' } }),
  ])
  res.json({ totalUsers, activeUsers, pendingUsers, lockedUsers })
})

export default router
