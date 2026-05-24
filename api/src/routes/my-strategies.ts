import { Router, Response, NextFunction } from 'express'
import { z } from 'zod'
import { PrismaClient } from '@prisma/client'
import { AuthRequest, requireAuth } from '../middleware/requireAuth'

const router = Router()
const prisma = new PrismaClient()

const legSchema = z.object({
  id: z.string(),
  type: z.enum(['BUY', 'SELL']),
  optionType: z.enum(['CE', 'PE']),
  strike: z.union([z.number(), z.literal('')]),
  lots: z.number().int().min(1).max(100),
  premium: z.union([z.number(), z.literal('')]),
  iv: z.number().nullable().optional(),
  delta: z.number().nullable().optional(),
  gamma: z.number().nullable().optional(),
  theta: z.number().nullable().optional(),
  vega: z.number().nullable().optional(),
})

const strategyBodySchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  category: z.enum(['DIRECTIONAL', 'NON_DIRECTIONAL', 'VOLATILITY']).optional(),
  type: z.enum(['DEBIT', 'CREDIT', 'VARIES']).optional(),
  riskLevel: z.enum(['CONSERVATIVE', 'MODERATE', 'AGGRESSIVE']).optional(),
  outlook: z.array(z.string()).optional(),
  ivLevels: z.array(z.enum(['LOW', 'LOW_NORMAL', 'NORMAL', 'HIGH_NORMAL', 'HIGH'])).optional(),
  legs: z.array(legSchema).min(1).max(6),
  notes: z.string().max(1000).optional(),
  tags: z.array(z.string().max(30)).max(10).optional(),
  isTemplate: z.boolean().optional(),
  sourceStrategyId: z.string().optional(),
})

// GET /api/v1/my-strategies
router.get('/', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const rows = await prisma.userStrategy.findMany({
      where: { userId: req.userId! },
      orderBy: { updatedAt: 'desc' },
    })
    res.json(rows)
  } catch (err) {
    next(err)
  }
})

// POST /api/v1/my-strategies
router.post('/', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const body = strategyBodySchema.parse(req.body)
    const row = await prisma.userStrategy.create({
      data: {
        userId: req.userId!,
        name: body.name,
        description: body.description,
        category: body.category ?? 'NON_DIRECTIONAL',
        type: body.type ?? 'VARIES',
        riskLevel: body.riskLevel ?? 'MODERATE',
        outlook: body.outlook ?? [],
        ivLevels: body.ivLevels ?? [],
        legs: body.legs as object,
        notes: body.notes,
        tags: body.tags ?? [],
        isTemplate: body.isTemplate ?? false,
        sourceStrategyId: body.sourceStrategyId,
      },
    })
    res.status(201).json(row)
  } catch (err) {
    next(err)
  }
})

// GET /api/v1/my-strategies/:id
router.get('/:id', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const row = await prisma.userStrategy.findFirst({
      where: { id: String(req.params.id), userId: req.userId! },
    })
    if (!row) return res.status(404).json({ message: 'Strategy not found' }) as unknown as void
    res.json(row)
  } catch (err) {
    next(err)
  }
})

// PUT /api/v1/my-strategies/:id
router.put('/:id', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.userStrategy.findFirst({ where: { id: String(req.params.id), userId: req.userId! } })
    if (!existing) return res.status(404).json({ message: 'Strategy not found' }) as unknown as void

    const body = strategyBodySchema.partial().parse(req.body)
    const updated = await prisma.userStrategy.update({
      where: { id: String(req.params.id) },
      data: {
        ...body,
        legs: body.legs ? (body.legs as object) : undefined,
      },
    })
    res.json(updated)
  } catch (err) {
    next(err)
  }
})

// DELETE /api/v1/my-strategies/:id
router.delete('/:id', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.userStrategy.findFirst({ where: { id: String(req.params.id), userId: req.userId! } })
    if (!existing) return res.status(404).json({ message: 'Strategy not found' }) as unknown as void
    await prisma.userStrategy.delete({ where: { id: String(req.params.id) } })
    res.json({ deleted: true })
  } catch (err) {
    next(err)
  }
})

// POST /api/v1/my-strategies/:id/duplicate
router.post('/:id/duplicate', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.userStrategy.findFirst({ where: { id: String(req.params.id), userId: req.userId! } })
    if (!existing) return res.status(404).json({ message: 'Strategy not found' }) as unknown as void

    const copy = await prisma.userStrategy.create({
      data: {
        userId: req.userId!,
        name: `${existing.name} (copy)`,
        description: existing.description ?? undefined,
        category: existing.category,
        type: existing.type,
        riskLevel: existing.riskLevel,
        outlook: existing.outlook,
        ivLevels: existing.ivLevels,
        legs: existing.legs as object,
        notes: existing.notes ?? undefined,
        tags: existing.tags,
        isTemplate: existing.isTemplate,
        sourceStrategyId: existing.sourceStrategyId ?? undefined,
      },
    })
    res.status(201).json(copy)
  } catch (err) {
    next(err)
  }
})

export default router
