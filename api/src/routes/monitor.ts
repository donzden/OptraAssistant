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

const LegSchema = z.object({
  symbol: z.string(),
  strike: z.number(),
  expiry: z.string(),
  optionType: z.enum(['CE', 'PE']),
  action: z.enum(['BUY', 'SELL']),
  lots: z.number().int().min(1),
  lotSize: z.number().int().min(1),
  entryPrice: z.number().min(0),
})

const CreateSchema = z.object({
  strategyName: z.string().min(1).max(100),
  instrument: z.string().min(1),
  expiry: z.string(),
  legs: z.array(LegSchema).min(1).max(6),
  stopLossPct: z.number().min(0).max(100).optional(),
  notes: z.string().max(500).optional(),
  userStrategyId: z.string().optional(),
})

// GET /api/v1/monitor
router.get('/', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const status = req.query.status === 'CLOSED' ? 'CLOSED' : 'ACTIVE'
    const positions = await prisma.livePosition.findMany({
      where: { userId: req.userId!, status },
      orderBy: { createdAt: 'desc' },
    })

    if (status === 'ACTIVE' && positions.length > 0) {
      const enriched = await Promise.all(
        positions.map(async (pos) => {
          try {
            const { data: snapshot } = await axios.post(
              `${ENGINE_URL}/api/v1/monitor/snapshot`,
              { legs: pos.legs },
              { headers: engineHeaders(), timeout: 5000 },
            )
            const history: Array<{ timestamp: string; pnl: number }> = Array.isArray(pos.pnlHistory)
              ? (pos.pnlHistory as any)
              : []
            const trimmedHistory = [
              ...history.slice(-47),
              { timestamp: new Date().toISOString(), pnl: snapshot.net_pnl ?? 0 },
            ]
            await prisma.livePosition.update({
              where: { id: pos.id },
              data: { pnlHistory: trimmedHistory },
            })
            return { ...pos, pnlHistory: trimmedHistory, snapshot }
          } catch {
            return { ...pos, snapshot: null }
          }
        }),
      )
      return res.json(enriched) as unknown as void
    }

    res.json(positions.map((p) => ({ ...p, snapshot: null })))
  } catch (err) {
    next(err)
  }
})

// POST /api/v1/monitor
router.post('/', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const body = CreateSchema.parse(req.body)
    const pos = await prisma.livePosition.create({
      data: {
        userId: req.userId!,
        strategyName: body.strategyName,
        instrument: body.instrument,
        expiry: body.expiry,
        legs: body.legs,
        stopLossPct: body.stopLossPct,
        notes: body.notes,
        userStrategyId: body.userStrategyId,
        pnlHistory: [],
      },
    })
    res.status(201).json(pos)
  } catch (err) {
    next(err)
  }
})

// PUT /api/v1/monitor/:id
router.put('/:id', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.livePosition.findFirst({
      where: { id: String(req.params.id), userId: req.userId! },
    })
    if (!existing) return res.status(404).json({ message: 'Not found' }) as unknown as void

    const body = z.object({
      notes: z.string().max(500).optional(),
      stopLossPct: z.number().min(0).max(100).optional(),
    }).parse(req.body)

    const updated = await prisma.livePosition.update({
      where: { id: String(req.params.id) },
      data: body,
    })
    res.json(updated)
  } catch (err) {
    next(err)
  }
})

// POST /api/v1/monitor/:id/close
router.post('/:id/close', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.livePosition.findFirst({
      where: { id: String(req.params.id), userId: req.userId! },
    })
    if (!existing) return res.status(404).json({ message: 'Not found' }) as unknown as void

    const updated = await prisma.livePosition.update({
      where: { id: String(req.params.id) },
      data: { status: 'CLOSED', closedAt: new Date() },
    })
    res.json(updated)
  } catch (err) {
    next(err)
  }
})

// DELETE /api/v1/monitor/:id
router.delete('/:id', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.livePosition.findFirst({
      where: { id: String(req.params.id), userId: req.userId! },
    })
    if (!existing) return res.status(404).json({ message: 'Not found' }) as unknown as void

    await prisma.livePosition.delete({ where: { id: String(req.params.id) } })
    res.json({ deleted: true })
  } catch (err) {
    next(err)
  }
})

export default router
