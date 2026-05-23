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

// GET /api/v1/strategies — list all strategies with optional filters
router.get('/', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { category, riskLevel, type, outlook } = req.query
    const where: Record<string, unknown> = {}
    if (category) where.category = String(category).toUpperCase()
    if (riskLevel) where.riskLevel = String(riskLevel).toUpperCase()
    if (type) where.type = String(type).toUpperCase()
    if (outlook) where.outlook = { has: String(outlook).toUpperCase() }

    const strategies = await prisma.strategy.findMany({
      where,
      orderBy: { name: 'asc' },
    })

    const favouriteIds = await prisma.userStrategyFavourite
      .findMany({ where: { userId: req.userId! }, select: { strategyId: true } })
      .then((rows) => new Set(rows.map((r) => r.strategyId)))

    res.json(strategies.map((s) => ({ ...s, isFavourite: favouriteIds.has(s.id) })))
  } catch (err) {
    next(err)
  }
})

// GET /api/v1/strategies/favourites — user's favourited strategies
router.get('/favourites', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const rows = await prisma.userStrategyFavourite.findMany({
      where: { userId: req.userId! },
      include: { strategy: true },
      orderBy: { createdAt: 'desc' },
    })
    res.json(rows.map((r) => ({ ...r.strategy, isFavourite: true })))
  } catch (err) {
    next(err)
  }
})

// GET /api/v1/strategies/recommend — get AI recommendations for today
router.get('/recommend', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const symbol = String(req.query.symbol ?? 'NIFTY')

    const user = await prisma.user.findUnique({ where: { id: req.userId! }, select: { riskAppetite: true } })
    const userRisk = user?.riskAppetite ?? 'MODERATE'

    const strategies = await prisma.strategy.findMany({ orderBy: { name: 'asc' } })

    const { data } = await axios.post(
      `${ENGINE_URL}/api/v1/strategies/recommend`,
      { strategies, user_risk: userRisk, symbol },
      { headers: engineHeaders() },
    )
    res.json(data)
  } catch (err) {
    next(err)
  }
})

// GET /api/v1/strategies/:id — strategy detail
router.get('/:id', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id)
    const strategy = await prisma.strategy.findUnique({ where: { id } })
    if (!strategy) return res.status(404).json({ message: 'Strategy not found' }) as unknown as void

    const fav = await prisma.userStrategyFavourite.findUnique({
      where: { userId_strategyId: { userId: req.userId!, strategyId: strategy.id } },
    })
    res.json({ ...strategy, isFavourite: !!fav })
  } catch (err) {
    next(err)
  }
})

// POST /api/v1/strategies/:id/explain — get AI explanation for a specific strategy
router.post('/:id/explain', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id)
    const strategy = await prisma.strategy.findUnique({ where: { id } })
    if (!strategy) return res.status(404).json({ message: 'Strategy not found' }) as unknown as void

    const symbol = String(req.body.symbol ?? 'NIFTY')
    const detailed = Boolean(req.body.detailed ?? false)

    const { data: signal } = await axios.get(`${ENGINE_URL}/api/v1/strategies/analyse`, {
      params: { symbol },
      headers: engineHeaders(),
    })

    const { data } = await axios.post(
      `${ENGINE_URL}/api/v1/strategies/explain`,
      { strategy, market_signal: signal, detailed },
      { headers: engineHeaders() },
    )
    res.json(data)
  } catch (err) {
    next(err)
  }
})

// POST /api/v1/strategies/:id/favourite — toggle favourite
router.post('/:id/favourite', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const strategyId = String(req.params.id)
    const key = { userId: req.userId!, strategyId }
    const existing = await prisma.userStrategyFavourite.findUnique({ where: { userId_strategyId: key } })

    if (existing) {
      await prisma.userStrategyFavourite.delete({ where: { userId_strategyId: key } })
      res.json({ isFavourite: false })
    } else {
      await prisma.userStrategyFavourite.create({ data: key })
      res.json({ isFavourite: true })
    }
  } catch (err) {
    next(err)
  }
})

// Admin: GET /api/v1/strategies/admin/all — admin view with counts
router.get('/admin/all', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId! }, select: { role: true } })
    if (user?.role !== 'ADMIN') return res.status(403).json({ message: 'Forbidden' }) as unknown as void

    const strategies = await prisma.strategy.findMany({
      include: { _count: { select: { favourites: true } } },
      orderBy: { name: 'asc' },
    })
    res.json(strategies)
  } catch (err) {
    next(err)
  }
})

export default router
