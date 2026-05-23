import { Router, Response } from 'express'
import { z } from 'zod'
import { PrismaClient } from '@prisma/client'
import { requireAuth, AuthRequest } from '../middleware/requireAuth'
import { AppError } from '../middleware/errorHandler'

const router = Router()
const prisma = new PrismaClient()

// GET /users/profile
router.get('/profile', requireAuth, async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.userId } })
  const { passwordHash: _, ...safeUser } = user as any
  res.json(safeUser)
})

// PATCH /users/profile
router.patch('/profile', requireAuth, async (req: AuthRequest, res: Response) => {
  const schema = z.object({
    name: z.string().min(2).max(100).optional(),
    riskAppetite: z.enum(['CONSERVATIVE', 'MODERATE', 'AGGRESSIVE']).optional(),
    preferredInstruments: z.array(z.string()).optional(),
    defaultLotSize: z.number().int().min(1).optional(),
  })
  const data = schema.parse(req.body)
  const user = await prisma.user.update({ where: { id: req.userId }, data })
  const { passwordHash: _, ...safeUser } = user as any
  res.json(safeUser)
})

// POST /users/avatar — placeholder, will integrate storage in later sprint
router.post('/avatar', requireAuth, async (_req: AuthRequest, res: Response) => {
  throw new AppError(501, 'Avatar upload not yet implemented')
})

export default router
