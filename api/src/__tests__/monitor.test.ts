/**
 * Unit tests for routes/monitor.ts — live position monitoring, exit signals, post-mortem.
 */
import express from 'express'
import request from 'supertest'
import axios from 'axios'
import { errorHandler } from '../middleware/errorHandler'

jest.mock('axios')
const mockedAxios = axios as jest.Mocked<typeof axios>

const mockPrisma = {
  livePosition: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  exitSignal: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
}

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => mockPrisma),
}))

jest.mock('../middleware/requireAuth', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.userId = req.headers['x-test-userid'] ?? 'user-1'
    next()
  },
  AuthRequest: {},
}))

const VALID_LEG = {
  symbol: 'NIFTY', strike: 24000, expiry: '2026-05-29', optionType: 'CE',
  action: 'SELL', lots: 1, lotSize: 50, entryPrice: 120,
}

function makePosition(overrides: Partial<any> = {}) {
  return {
    id: 'pos-1',
    userId: 'user-1',
    strategyName: 'Short Strangle',
    instrument: 'NIFTY',
    expiry: '2026-05-29',
    legs: [VALID_LEG],
    pnlHistory: [],
    exitRules: [],
    entryDate: new Date('2026-01-01'),
    closedAt: null,
    finalPnl: null,
    status: 'ACTIVE',
    ...overrides,
  }
}

let app: express.Express

beforeAll(async () => {
  process.env.ENGINE_URL = 'http://localhost:8000'
  process.env.INTERNAL_API_KEY = 'test-internal-key'
  const monitorRouter = (await import('../routes/monitor')).default
  app = express()
  app.use(express.json())
  app.use('/api/v1/monitor', monitorRouter)
  app.use(errorHandler)
})

beforeEach(() => {
  jest.clearAllMocks()
})

describe('GET /api/v1/monitor (list)', () => {
  it('enriches ACTIVE positions with an engine snapshot and unacked signals', async () => {
    mockPrisma.livePosition.findMany.mockResolvedValue([makePosition()])
    mockedAxios.post.mockResolvedValueOnce({ data: { net_pnl: 500 } }) // snapshot call
    mockPrisma.livePosition.update.mockResolvedValue({})
    mockPrisma.exitSignal.findMany.mockResolvedValue([])

    const res = await request(app).get('/api/v1/monitor').set('x-test-userid', 'user-1')

    expect(res.status).toBe(200)
    expect(res.body[0].snapshot).toEqual({ net_pnl: 500 })
    expect(res.body[0].signals).toEqual([])
    expect(mockPrisma.livePosition.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'pos-1' } }),
    )
  })

  it('creates an exit signal when the engine reports a triggered rule, and avoids duplicates', async () => {
    const pos = makePosition({ exitRules: [{ id: 'r1', type: 'pnl_pct', threshold: 50, label: '50% profit' }] })
    mockPrisma.livePosition.findMany.mockResolvedValue([pos])
    mockedAxios.post
      .mockResolvedValueOnce({ data: { net_pnl: 500 } }) // snapshot
      .mockResolvedValueOnce({ data: { triggered: [{ ruleType: 'pnl_pct', ruleLabel: '50% profit', currentPnl: 500, triggerValue: 50, suggestion: 'Close now' }] } }) // check-rules
    mockPrisma.livePosition.update.mockResolvedValue({})
    mockPrisma.exitSignal.findFirst.mockResolvedValue(null) // no existing unacked signal
    mockPrisma.exitSignal.create.mockResolvedValue({ id: 'sig-1', ruleType: 'pnl_pct' })
    mockPrisma.exitSignal.findMany.mockResolvedValue([{ id: 'sig-1', ruleType: 'pnl_pct' }])

    const res = await request(app).get('/api/v1/monitor').set('x-test-userid', 'user-1')

    expect(res.status).toBe(200)
    expect(mockPrisma.exitSignal.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ ruleType: 'pnl_pct', livePositionId: 'pos-1' }) }),
    )
    expect(res.body[0].signals).toEqual([{ id: 'sig-1', ruleType: 'pnl_pct' }])
  })

  it('falls back to snapshot: null when the engine is unreachable', async () => {
    mockPrisma.livePosition.findMany.mockResolvedValue([makePosition()])
    mockedAxios.post.mockRejectedValue(new Error('engine down'))
    mockPrisma.exitSignal.findMany.mockResolvedValue([])

    const res = await request(app).get('/api/v1/monitor').set('x-test-userid', 'user-1')

    expect(res.status).toBe(200)
    expect(res.body[0].snapshot).toBeNull()
  })

  it('does not enrich CLOSED positions (no engine call)', async () => {
    mockPrisma.livePosition.findMany.mockResolvedValue([makePosition({ status: 'CLOSED' })])

    const res = await request(app).get('/api/v1/monitor').query({ status: 'CLOSED' }).set('x-test-userid', 'user-1')

    expect(res.status).toBe(200)
    expect(mockedAxios.post).not.toHaveBeenCalled()
    expect(res.body[0].snapshot).toBeNull()
  })
})

describe('POST /api/v1/monitor (create)', () => {
  it('creates a live position with the authenticated userId', async () => {
    mockPrisma.livePosition.create.mockResolvedValue(makePosition())

    const res = await request(app)
      .post('/api/v1/monitor')
      .set('x-test-userid', 'user-1')
      .send({ strategyName: 'Short Strangle', instrument: 'NIFTY', expiry: '2026-05-29', legs: [VALID_LEG] })

    expect(res.status).toBe(201)
    expect(mockPrisma.livePosition.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: 'user-1', pnlHistory: [] }) }),
    )
  })

  it('returns 500 (not a hang) when legs are missing', async () => {
    const res = await request(app)
      .post('/api/v1/monitor')
      .set('x-test-userid', 'user-1')
      .send({ strategyName: 'X', instrument: 'NIFTY', expiry: '2026-05-29', legs: [] })
    expect(res.status).toBe(500)
    expect(mockPrisma.livePosition.create).not.toHaveBeenCalled()
  })
})

describe('PUT /api/v1/monitor/:id', () => {
  it('404s when the position does not belong to the user', async () => {
    mockPrisma.livePosition.findFirst.mockResolvedValue(null)
    const res = await request(app).put('/api/v1/monitor/pos-1').set('x-test-userid', 'user-2').send({ notes: 'x' })
    expect(res.status).toBe(404)
  })

  it('updates notes/stopLossPct when owned', async () => {
    mockPrisma.livePosition.findFirst.mockResolvedValue(makePosition())
    mockPrisma.livePosition.update.mockResolvedValue(makePosition({ notes: 'updated' }))
    const res = await request(app).put('/api/v1/monitor/pos-1').set('x-test-userid', 'user-1').send({ notes: 'updated' })
    expect(res.status).toBe(200)
  })
})

describe('POST /api/v1/monitor/:id/close', () => {
  it('closes and sets finalPnl from the last pnlHistory entry', async () => {
    mockPrisma.livePosition.findFirst.mockResolvedValue(
      makePosition({ pnlHistory: [{ timestamp: 't1', pnl: 100 }, { timestamp: 't2', pnl: 350 }] }),
    )
    mockPrisma.livePosition.update.mockResolvedValue(makePosition({ status: 'CLOSED', finalPnl: 350 }))

    const res = await request(app).post('/api/v1/monitor/pos-1/close').set('x-test-userid', 'user-1')

    expect(res.status).toBe(200)
    expect(mockPrisma.livePosition.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'CLOSED', finalPnl: 350 }) }),
    )
  })

  it('sets finalPnl to undefined when there is no pnl history', async () => {
    mockPrisma.livePosition.findFirst.mockResolvedValue(makePosition({ pnlHistory: [] }))
    mockPrisma.livePosition.update.mockResolvedValue(makePosition({ status: 'CLOSED' }))

    await request(app).post('/api/v1/monitor/pos-1/close').set('x-test-userid', 'user-1')

    expect(mockPrisma.livePosition.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ finalPnl: undefined }) }),
    )
  })
})

describe('DELETE /api/v1/monitor/:id', () => {
  it('404s for a position the user does not own', async () => {
    mockPrisma.livePosition.findFirst.mockResolvedValue(null)
    const res = await request(app).delete('/api/v1/monitor/pos-1').set('x-test-userid', 'user-2')
    expect(res.status).toBe(404)
    expect(mockPrisma.livePosition.delete).not.toHaveBeenCalled()
  })

  it('deletes when owned', async () => {
    mockPrisma.livePosition.findFirst.mockResolvedValue(makePosition())
    mockPrisma.livePosition.delete.mockResolvedValue(makePosition())
    const res = await request(app).delete('/api/v1/monitor/pos-1').set('x-test-userid', 'user-1')
    expect(res.status).toBe(200)
    expect(res.body.deleted).toBe(true)
  })
})

describe('PUT /api/v1/monitor/signals/:signalId/ack', () => {
  it('404s when the signal does not belong to the user', async () => {
    mockPrisma.exitSignal.findFirst.mockResolvedValue(null)
    const res = await request(app).put('/api/v1/monitor/signals/sig-1/ack').set('x-test-userid', 'user-2')
    expect(res.status).toBe(404)
  })

  it('acknowledges the signal', async () => {
    mockPrisma.exitSignal.findFirst.mockResolvedValue({ id: 'sig-1', userId: 'user-1' })
    mockPrisma.exitSignal.update.mockResolvedValue({ id: 'sig-1', acknowledged: true })
    const res = await request(app).put('/api/v1/monitor/signals/sig-1/ack').set('x-test-userid', 'user-1')
    expect(res.status).toBe(200)
    expect(res.body.acknowledged).toBe(true)
  })
})

describe('POST /api/v1/monitor/:id/post-mortem', () => {
  it('404s for a position the user does not own', async () => {
    mockPrisma.livePosition.findFirst.mockResolvedValue(null)
    const res = await request(app).post('/api/v1/monitor/pos-1/post-mortem').set('x-test-userid', 'user-2')
    expect(res.status).toBe(404)
    expect(mockedAxios.post).not.toHaveBeenCalled()
  })

  it('proxies to the engine with the position details', async () => {
    mockPrisma.livePosition.findFirst.mockResolvedValue(
      makePosition({ closedAt: new Date('2026-02-01'), finalPnl: 500 }),
    )
    mockedAxios.post.mockResolvedValue({ data: { explanation: 'Good trade' } })

    const res = await request(app).post('/api/v1/monitor/pos-1/post-mortem').set('x-test-userid', 'user-1')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ explanation: 'Good trade' })
    expect(mockedAxios.post).toHaveBeenCalledWith(
      'http://localhost:8000/api/v1/monitor/post-mortem',
      expect.objectContaining({ strategy_name: 'Short Strangle', final_pnl: 500 }),
      expect.anything(),
    )
  })
})
