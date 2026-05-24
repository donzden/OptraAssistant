import { Router, Response, NextFunction } from 'express'
import axios from 'axios'
import { z } from 'zod'
import { PrismaClient } from '@prisma/client'
import { AuthRequest, requireAuth } from '../middleware/requireAuth'

const router = Router()
const prisma = new PrismaClient()
const ENGINE_URL = process.env.ENGINE_URL ?? 'http://localhost:8000'
const INTERNAL_KEY = process.env.INTERNAL_API_KEY ?? 'dev-internal-key'

function eh() { return { 'X-Internal-Key': INTERNAL_KEY } }

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

const ExitRuleSchema = z.object({
  id: z.string(),
  type: z.enum(['pnl_pct', 'pnl_abs', 'delta', 'dte']),
  threshold: z.number(),
  label: z.string(),
  netPremium: z.number().optional(),
})

const CreateSchema = z.object({
  strategyName: z.string().min(1).max(100),
  instrument: z.string().min(1),
  expiry: z.string(),
  legs: z.array(LegSchema).min(1).max(6),
  stopLossPct: z.number().min(0).max(100).optional(),
  notes: z.string().max(500).optional(),
  userStrategyId: z.string().optional(),
  exitRules: z.array(ExitRuleSchema).optional(),
})

// ── helpers ──────────────────────────────────────────────────────────────────

async function enrichWithSnapshot(pos: any) {
  try {
    const { data: snapshot } = await axios.post(
      `${ENGINE_URL}/api/v1/monitor/snapshot`,
      { legs: pos.legs },
      { headers: eh(), timeout: 5000 },
    )
    const history: Array<{ timestamp: string; pnl: number }> = Array.isArray(pos.pnlHistory)
      ? (pos.pnlHistory as any) : []
    const trimmedHistory = [...history.slice(-47), { timestamp: new Date().toISOString(), pnl: snapshot.net_pnl ?? 0 }]
    await prisma.livePosition.update({ where: { id: pos.id }, data: { pnlHistory: trimmedHistory } })

    // Check exit rules if any
    let signals: any[] = []
    const rules = Array.isArray(pos.exitRules) ? (pos.exitRules as any[]) : []
    if (rules.length > 0) {
      try {
        const { data: ruleCheck } = await axios.post(
          `${ENGINE_URL}/api/v1/monitor/check-rules`,
          { snapshot, exit_rules: rules, expiry: pos.expiry, strategy_name: pos.strategyName },
          { headers: eh(), timeout: 6000 },
        )
        const triggered: any[] = ruleCheck.triggered ?? []
        for (const t of triggered) {
          // Only create signal if not already unacked in last 6h for same rule type
          const existing = await prisma.exitSignal.findFirst({
            where: {
              livePositionId: pos.id,
              ruleType: t.ruleType,
              acknowledged: false,
              createdAt: { gte: new Date(Date.now() - 6 * 60 * 60 * 1000) },
            },
          })
          if (!existing) {
            const created = await prisma.exitSignal.create({
              data: {
                userId: pos.userId,
                livePositionId: pos.id,
                ruleType: t.ruleType,
                ruleLabel: t.ruleLabel,
                currentPnl: t.currentPnl,
                triggerValue: t.triggerValue,
                suggestion: t.suggestion,
              },
            })
            signals.push(created)
          }
        }
      } catch { /* rule check failure is non-fatal */ }
    }

    // Attach unacknowledged signals to response
    const unacked = await prisma.exitSignal.findMany({
      where: { livePositionId: pos.id, acknowledged: false },
      orderBy: { createdAt: 'desc' },
    })
    return { ...pos, pnlHistory: trimmedHistory, snapshot, signals: unacked }
  } catch {
    const unacked = await prisma.exitSignal.findMany({
      where: { livePositionId: pos.id, acknowledged: false },
      orderBy: { createdAt: 'desc' },
    }).catch(() => [])
    return { ...pos, snapshot: null, signals: unacked }
  }
}

// ── routes ───────────────────────────────────────────────────────────────────

// GET /api/v1/monitor
router.get('/', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const status = req.query.status === 'CLOSED' ? 'CLOSED' : 'ACTIVE'
    const positions = await prisma.livePosition.findMany({
      where: { userId: req.userId!, status },
      orderBy: { createdAt: 'desc' },
    })
    if (status === 'ACTIVE' && positions.length > 0) {
      const enriched = await Promise.all(positions.map(enrichWithSnapshot))
      return res.json(enriched) as unknown as void
    }
    res.json(positions.map((p) => ({ ...p, snapshot: null, signals: [] })))
  } catch (err) { next(err) }
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
        exitRules: body.exitRules ?? [],
        pnlHistory: [],
      },
    })
    res.status(201).json(pos)
  } catch (err) { next(err) }
})

// PUT /api/v1/monitor/:id
router.put('/:id', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.livePosition.findFirst({ where: { id: String(req.params.id), userId: req.userId! } })
    if (!existing) return res.status(404).json({ message: 'Not found' }) as unknown as void
    const body = z.object({
      notes: z.string().max(500).optional(),
      stopLossPct: z.number().min(0).max(100).optional(),
    }).parse(req.body)
    const updated = await prisma.livePosition.update({ where: { id: String(req.params.id) }, data: body })
    res.json(updated)
  } catch (err) { next(err) }
})

// PUT /api/v1/monitor/:id/exit-rules
router.put('/:id/exit-rules', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.livePosition.findFirst({ where: { id: String(req.params.id), userId: req.userId! } })
    if (!existing) return res.status(404).json({ message: 'Not found' }) as unknown as void
    const body = z.object({ exitRules: z.array(ExitRuleSchema) }).parse(req.body)
    const updated = await prisma.livePosition.update({
      where: { id: String(req.params.id) },
      data: { exitRules: body.exitRules },
    })
    res.json(updated)
  } catch (err) { next(err) }
})

// POST /api/v1/monitor/:id/close
router.post('/:id/close', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.livePosition.findFirst({ where: { id: String(req.params.id), userId: req.userId! } })
    if (!existing) return res.status(404).json({ message: 'Not found' }) as unknown as void
    // Compute finalPnl from last pnlHistory entry
    const history: Array<{ pnl: number }> = Array.isArray(existing.pnlHistory) ? (existing.pnlHistory as any) : []
    const finalPnl = history.length > 0 ? history[history.length - 1].pnl : null
    const updated = await prisma.livePosition.update({
      where: { id: String(req.params.id) },
      data: { status: 'CLOSED', closedAt: new Date(), finalPnl: finalPnl ?? undefined },
    })
    res.json(updated)
  } catch (err) { next(err) }
})

// DELETE /api/v1/monitor/:id
router.delete('/:id', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.livePosition.findFirst({ where: { id: String(req.params.id), userId: req.userId! } })
    if (!existing) return res.status(404).json({ message: 'Not found' }) as unknown as void
    await prisma.livePosition.delete({ where: { id: String(req.params.id) } })
    res.json({ deleted: true })
  } catch (err) { next(err) }
})

// GET /api/v1/monitor/:id/signals
router.get('/:id/signals', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.livePosition.findFirst({ where: { id: String(req.params.id), userId: req.userId! } })
    if (!existing) return res.status(404).json({ message: 'Not found' }) as unknown as void
    const signals = await prisma.exitSignal.findMany({
      where: { livePositionId: String(req.params.id) },
      orderBy: { createdAt: 'desc' },
    })
    res.json(signals)
  } catch (err) { next(err) }
})

// PUT /api/v1/monitor/signals/:signalId/ack
router.put('/signals/:signalId/ack', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.exitSignal.findFirst({ where: { id: String(req.params.signalId), userId: req.userId! } })
    if (!existing) return res.status(404).json({ message: 'Not found' }) as unknown as void
    const updated = await prisma.exitSignal.update({
      where: { id: String(req.params.signalId) },
      data: { acknowledged: true },
    })
    res.json(updated)
  } catch (err) { next(err) }
})

// POST /api/v1/monitor/:id/post-mortem
router.post('/:id/post-mortem', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const pos = await prisma.livePosition.findFirst({ where: { id: String(req.params.id), userId: req.userId! } })
    if (!pos) return res.status(404).json({ message: 'Not found' }) as unknown as void
    const { data } = await axios.post(
      `${ENGINE_URL}/api/v1/monitor/post-mortem`,
      {
        strategy_name: pos.strategyName,
        instrument: pos.instrument,
        entry_date: pos.entryDate.toISOString(),
        closed_at: pos.closedAt?.toISOString() ?? new Date().toISOString(),
        final_pnl: pos.finalPnl ?? 0,
        legs: pos.legs,
      },
      { headers: eh(), timeout: 15000 },
    )
    res.json(data)
  } catch (err) { next(err) }
})

export default router
