import { Router, Response, NextFunction } from 'express'
import { z } from 'zod'
import axios from 'axios'
import { PrismaClient } from '@prisma/client'
import { AuthRequest, requireAuth } from '../middleware/requireAuth'
import { getValidToken } from '../services/upstox.service'

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

// POST /api/v1/portfolio/import-from-upstox
router.post('/import-from-upstox', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const token = await getValidToken(req.userId!)
    if (!token) {
      return res.status(400).json({ message: 'Upstox account not connected. Connect via /api/v1/upstox/auth' })
    }

    const { data } = await axios.get('https://api.upstox.com/v2/portfolio/short-term-positions', {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    })

    const upstoxPositions: any[] = data.data ?? []
    const optionPositions = upstoxPositions.filter(
      (p: any) => p.instrument_type === 'OPTION' && p.quantity !== 0,
    )

    let imported = 0
    for (const p of optionPositions) {
      // Parse instrument key like "NSE_FO|NIFTY25MAY2422000CE"
      const ikey: string = p.instrument_key ?? ''
      const matchSymbol = ikey.match(/\|(NIFTY|BANKNIFTY|FINNIFTY)/)
      const symbol = matchSymbol?.[1] ?? 'NIFTY'
      const optionType: 'CE' | 'PE' = ikey.endsWith('CE') ? 'CE' : 'PE'
      const strikeMatch = ikey.match(/(\d+)(CE|PE)$/)
      const strike = strikeMatch ? parseFloat(strikeMatch[1]) : 0
      const expiry = p.expiry ?? new Date().toISOString().split('T')[0]
      const lots = Math.abs(Math.round(p.quantity / (p.lot_size ?? 50)))
      const lotSize = p.lot_size ?? 50
      const avgPrice = p.average_price ?? 0
      const positionType: 'LONG' | 'SHORT' = p.quantity > 0 ? 'LONG' : 'SHORT'

      if (!strike || !lots) continue

      await prisma.position.upsert({
        where: {
          // unique by user + instrument key
          // Prisma doesn't support compound on non-unique; use findFirst + create pattern
          id: `upstox-${req.userId!}-${ikey}`,
        },
        create: {
          id: `upstox-${req.userId!}-${ikey}`,
          userId: req.userId!,
          symbol,
          instrumentKey: ikey,
          strike,
          expiry,
          optionType,
          positionType,
          lots,
          lotSize,
          avgPrice,
          source: 'UPSTOX_IMPORT',
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
