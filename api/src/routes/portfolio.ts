import { Router, Response, NextFunction } from 'express'
import { z } from 'zod'
import axios from 'axios'
import { PrismaClient } from '@prisma/client'
import { AuthRequest, requireAuth } from '../middleware/requireAuth'
import { getValidToken } from '../services/kite.service'

const router = Router()
const prisma = new PrismaClient()

const ENGINE_URL = process.env.ENGINE_URL ?? 'http://localhost:8000'
const INTERNAL_KEY = process.env.INTERNAL_API_KEY ?? 'dev-internal-key'

const positionSchema = z.object({
  symbol: z.enum(['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY']),
  strike: z.number().positive(),
  expiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  optionType: z.enum(['CE', 'PE']),
  positionType: z.enum(['LONG', 'SHORT']),
  lots: z.number().int().min(1),
  lotSize: z.number().int().min(1).default(50),
  avgPrice: z.number().min(0),
  instrumentKey: z.string().optional(),
  notes: z.string().max(500).optional(),
})

// GET /api/v1/portfolio/positions
router.get('/positions', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const positions = await prisma.position.findMany({
      where: { userId: req.userId! },
      orderBy: { createdAt: 'desc' },
    })
    res.json(positions)
  } catch (err) {
    next(err)
  }
})

// POST /api/v1/portfolio/positions
router.post('/positions', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const body = positionSchema.parse(req.body)
    const position = await prisma.position.create({
      data: { ...body, userId: req.userId!, source: 'MANUAL' },
    })
    res.status(201).json(position)
  } catch (err) {
    next(err)
  }
})

// PUT /api/v1/portfolio/positions/:id
router.put('/positions/:id', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const posId = req.params['id'] as string
    const existing = await prisma.position.findFirst({
      where: { id: posId, userId: req.userId! },
    })
    if (!existing) return res.status(404).json({ message: 'Position not found' })

    const body = positionSchema.partial().parse(req.body)
    const updated = await prisma.position.update({ where: { id: posId }, data: body })
    res.json(updated)
  } catch (err) {
    next(err)
  }
})

// DELETE /api/v1/portfolio/positions/:id
router.delete('/positions/:id', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const posId = req.params['id'] as string
    const existing = await prisma.position.findFirst({
      where: { id: posId, userId: req.userId! },
    })
    if (!existing) return res.status(404).json({ message: 'Position not found' })
    await prisma.position.delete({ where: { id: posId } })
    res.json({ message: 'Position deleted' })
  } catch (err) {
    next(err)
  }
})

// POST /api/v1/portfolio/import-from-zerodha
router.post('/import-from-zerodha', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const token = await getValidToken(req.userId!)
    if (!token) {
      return res.status(400).json({
        message: 'Zerodha account not connected or session expired (tokens reset at 6 AM IST). Reconnect via /api/v1/kite/auth',
      })
    }

    const apiKey = process.env.KITE_API_KEY ?? ''
    const { data } = await axios.get('https://api.kite.trade/portfolio/positions', {
      headers: {
        'X-Kite-Version': '3',
        Authorization: `token ${apiKey}:${token}`,
      },
    })

    // Kite returns {net: [...], day: [...]}; use net positions
    const kitePositions: any[] = data.data?.net ?? []
    const optionPositions = kitePositions.filter(
      (p: any) => (p.product === 'NRML' || p.product === 'MIS') && p.quantity !== 0 && p.exchange === 'NFO',
    )

    const LOT_SIZES: Record<string, number> = {
      NIFTY: 25, BANKNIFTY: 15, FINNIFTY: 40, MIDCPNIFTY: 50,
    }

    let imported = 0
    for (const p of optionPositions) {
      // Kite tradingsymbol: NIFTY25MAY2222000CE, BANKNIFTY25MAY2247000PE, etc.
      const ts: string = p.tradingsymbol ?? ''
      const symbolMatch = ts.match(/^(NIFTY|BANKNIFTY|FINNIFTY|MIDCPNIFTY)/)
      const symbol = symbolMatch?.[1] ?? 'NIFTY'
      const optionType: 'CE' | 'PE' = ts.endsWith('CE') ? 'CE' : 'PE'
      const strikeMatch = ts.match(/(\d+)(CE|PE)$/)
      const strike = strikeMatch ? parseFloat(strikeMatch[1]) : 0
      // Kite expiry is ISO date string: "2025-05-29"
      const expiry: string = p.expiry ?? new Date().toISOString().split('T')[0]
      const lotSize = LOT_SIZES[symbol] ?? 50
      const lots = Math.abs(Math.round(p.quantity / lotSize)) || 1
      const avgPrice = p.average_price ?? 0
      const positionType: 'LONG' | 'SHORT' = p.quantity > 0 ? 'LONG' : 'SHORT'

      if (!strike) continue

      const posId = `kite-${req.userId!}-${ts}`
      await prisma.position.upsert({
        where: { id: posId },
        create: {
          id: posId,
          userId: req.userId!,
          symbol,
          instrumentKey: ts,
          strike,
          expiry,
          optionType,
          positionType,
          lots,
          lotSize,
          avgPrice,
          source: 'UPSTOX_IMPORT', // kept as-is to avoid schema change; semantically means "broker import"
        },
        update: {
          lots,
          avgPrice,
          positionType,
          currentPrice: p.last_price ?? null,
        },
      })
      imported++
    }

    res.json({ imported, total: optionPositions.length })
  } catch (err) {
    next(err)
  }
})

// POST /api/v1/portfolio/greeks  — proxy to engine with current spot prices
router.post('/greeks', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const positions = await prisma.position.findMany({ where: { userId: req.userId! } })
    if (positions.length === 0) {
      return res.json({ positions: [], aggregate: { delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0 }, total_pnl: 0 })
    }

    const { data } = await axios.post(
      `${ENGINE_URL}/api/v1/portfolio/greeks`,
      {
        positions: positions.map((p) => ({
          id: p.id,
          symbol: p.symbol,
          strike: p.strike,
          expiry: p.expiry,
          option_type: p.optionType,
          position_type: p.positionType,
          lots: p.lots,
          lot_size: p.lotSize,
          avg_price: p.avgPrice,
        })),
        spot_prices: req.body?.spot_prices ?? {},
      },
      { headers: { 'X-Internal-Key': INTERNAL_KEY } },
    )
    res.json(data)
  } catch (err) {
    next(err)
  }
})

export default router
