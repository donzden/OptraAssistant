import { Router, Response, NextFunction } from 'express'
import axios from 'axios'
import { z } from 'zod'
import { PrismaClient } from '@prisma/client'
import { AuthRequest, requireAuth } from '../middleware/requireAuth'

const router = Router()
const prisma = new PrismaClient()

const ENGINE_URL = process.env.ENGINE_URL ?? 'http://localhost:8000'
const INTERNAL_KEY = process.env.INTERNAL_API_KEY ?? 'dev-internal-key'

function engineHeaders() {
  return { 'X-Internal-Key': INTERNAL_KEY }
}

// GET /api/v1/watchlist — list items, attempt live scoring
router.get('/', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const items = await prisma.watchlistItem.findMany({
      where: { userId: req.userId! },
      include: { strategy: true },
      orderBy: { createdAt: 'asc' },
    })

    if (items.length === 0) return res.json([]) as unknown as void

    // Attempt live scoring
    try {
      const user = await prisma.user.findUnique({ where: { id: req.userId! }, select: { riskAppetite: true } })
      const userRisk = user?.riskAppetite ?? 'MODERATE'
      const symbol = String(req.query.symbol ?? 'NIFTY')

      const { data: signal } = await axios.get(`${ENGINE_URL}/api/v1/strategies/analyse`, {
        params: { symbol },
        headers: engineHeaders(),
      })

      const { data: scored } = await axios.post(
        `${ENGINE_URL}/api/v1/strategies/score`,
        { strategies: items.map((i) => i.strategy), market_signal: signal, user_risk: userRisk },
        { headers: engineHeaders() },
      )

      const scoreMap: Record<string, number> = {}
      for (const ranked of scored.ranked ?? []) {
        const maxScore = Object.values(ranked.condition_checks as Record<string, { max: number }>)
          .reduce((s, c) => s + c.max, 0)
        const pct = maxScore > 0 ? Math.round((ranked.score / maxScore) * 100) : 0
        scoreMap[ranked.strategy.id] = pct
      }

      // Persist updated match pcts
      await Promise.all(
        items.map((item) =>
          scoreMap[item.strategyId] !== undefined
            ? prisma.watchlistItem.update({
                where: { id: item.id },
                data: { lastMatchPct: scoreMap[item.strategyId], lastCheckedAt: new Date() },
              })
            : Promise.resolve(),
        ),
      )

      return res.json(
        items.map((item) => ({
          ...item,
          lastMatchPct: scoreMap[item.strategyId] ?? item.lastMatchPct ?? null,
          lastCheckedAt: new Date().toISOString(),
        })),
      ) as unknown as void
    } catch {
      // Scoring failed — return items with stored match pcts
      return res.json(items) as unknown as void
    }
  } catch (err) {
    next(err)
  }
})

// POST /api/v1/watchlist — add strategy to watchlist
router.post('/', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const body = z.object({ strategyId: z.string() }).parse(req.body)

    const strategy = await prisma.strategy.findUnique({ where: { id: body.strategyId } })
    if (!strategy) return res.status(404).json({ message: 'Strategy not found' }) as unknown as void

    const item = await prisma.watchlistItem.upsert({
      where: { userId_strategyId: { userId: req.userId!, strategyId: body.strategyId } },
      update: {},
      create: { userId: req.userId!, strategyId: body.strategyId },
      include: { strategy: true },
    })
    res.status(201).json(item)
  } catch (err) {
    next(err)
  }
})

// PUT /api/v1/watchlist/:id — update notes / alert settings
router.put('/:id', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.watchlistItem.findFirst({ where: { id: String(req.params.id), userId: req.userId! } })
    if (!existing) return res.status(404).json({ message: 'Not found' }) as unknown as void

    const body = z.object({
      notes: z.string().max(500).optional(),
      alertThreshold: z.number().min(0).max(100).optional(),
      alertEnabled: z.boolean().optional(),
    }).parse(req.body)

    const updated = await prisma.watchlistItem.update({
      where: { id: String(req.params.id) },
      data: body,
      include: { strategy: true },
    })
    res.json(updated)
  } catch (err) {
    next(err)
  }
})

// DELETE /api/v1/watchlist/:id
router.delete('/:id', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.watchlistItem.findFirst({ where: { id: String(req.params.id), userId: req.userId! } })
    if (!existing) return res.status(404).json({ message: 'Not found' }) as unknown as void
    await prisma.watchlistItem.delete({ where: { id: String(req.params.id) } })
    res.json({ deleted: true })
  } catch (err) {
    next(err)
  }
})

// DELETE /api/v1/watchlist/by-strategy/:strategyId — remove by strategy ID
router.delete('/by-strategy/:strategyId', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await prisma.watchlistItem.deleteMany({
      where: { userId: req.userId!, strategyId: String(req.params.strategyId) },
    })
    res.json({ deleted: true })
  } catch (err) {
    next(err)
  }
})

export default router
