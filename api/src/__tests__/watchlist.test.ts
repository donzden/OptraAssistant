/**
 * Unit tests for routes/watchlist.ts — watchlist CRUD + best-effort live re-scoring.
 */
import express from 'express'
import request from 'supertest'
import axios from 'axios'
import { errorHandler } from '../middleware/errorHandler'

jest.mock('axios')
const mockedAxios = axios as jest.Mocked<typeof axios>

const mockPrisma = {
  watchlistItem: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    upsert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  },
  user: { findUnique: jest.fn() },
  strategy: { findUnique: jest.fn() },
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

function makeItem(overrides: Partial<any> = {}) {
  return {
    id: 'wl-1', userId: 'user-1', strategyId: 's1',
    strategy: { id: 's1', name: 'Iron Condor' },
    lastMatchPct: 60, lastCheckedAt: new Date('2026-01-01'),
    ...overrides,
  }
}

let app: express.Express

beforeAll(async () => {
  process.env.ENGINE_URL = 'http://localhost:8000'
  process.env.INTERNAL_API_KEY = 'test-internal-key'
  const watchlistRouter = (await import('../routes/watchlist')).default
  app = express()
  app.use(express.json())
  app.use('/api/v1/watchlist', watchlistRouter)
  app.use(errorHandler)
})

beforeEach(() => {
  jest.clearAllMocks()
})

describe('GET /api/v1/watchlist', () => {
  it('returns an empty array without calling the engine when the watchlist is empty', async () => {
    mockPrisma.watchlistItem.findMany.mockResolvedValue([])
    const res = await request(app).get('/api/v1/watchlist').set('x-test-userid', 'user-1')
    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
    expect(mockedAxios.get).not.toHaveBeenCalled()
  })

  it('re-scores items live and persists updated match percentages', async () => {
    mockPrisma.watchlistItem.findMany.mockResolvedValue([makeItem()])
    mockPrisma.user.findUnique.mockResolvedValue({ riskAppetite: 'MODERATE' })
    mockedAxios.get.mockResolvedValue({ data: { trend: 'SIDEWAYS' } })
    mockedAxios.post.mockResolvedValue({
      data: {
        ranked: [
          { strategy: { id: 's1' }, score: 8, condition_checks: { iv_match: { max: 5 }, trend_match: { max: 5 } } },
        ],
      },
    })
    mockPrisma.watchlistItem.update.mockResolvedValue({})

    const res = await request(app).get('/api/v1/watchlist').set('x-test-userid', 'user-1')

    expect(res.status).toBe(200)
    expect(res.body[0].lastMatchPct).toBe(80) // 8 / 10 * 100
    expect(mockPrisma.watchlistItem.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'wl-1' }, data: expect.objectContaining({ lastMatchPct: 80 }) }),
    )
  })

  it('falls back to stored match pcts when live scoring fails', async () => {
    mockPrisma.watchlistItem.findMany.mockResolvedValue([makeItem()])
    mockPrisma.user.findUnique.mockResolvedValue({ riskAppetite: 'MODERATE' })
    mockedAxios.get.mockRejectedValue(new Error('engine down'))

    const res = await request(app).get('/api/v1/watchlist').set('x-test-userid', 'user-1')

    expect(res.status).toBe(200)
    expect(res.body[0].lastMatchPct).toBe(60)
    expect(mockPrisma.watchlistItem.update).not.toHaveBeenCalled()
  })
})

describe('POST /api/v1/watchlist', () => {
  it('404s when the strategy does not exist', async () => {
    mockPrisma.strategy.findUnique.mockResolvedValue(null)
    const res = await request(app).post('/api/v1/watchlist').set('x-test-userid', 'user-1').send({ strategyId: 'nope' })
    expect(res.status).toBe(404)
    expect(mockPrisma.watchlistItem.upsert).not.toHaveBeenCalled()
  })

  it('upserts (adds, or no-ops if already present) and returns 201', async () => {
    mockPrisma.strategy.findUnique.mockResolvedValue({ id: 's1', name: 'Iron Condor' })
    mockPrisma.watchlistItem.upsert.mockResolvedValue(makeItem())

    const res = await request(app).post('/api/v1/watchlist').set('x-test-userid', 'user-1').send({ strategyId: 's1' })

    expect(res.status).toBe(201)
    expect(mockPrisma.watchlistItem.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId_strategyId: { userId: 'user-1', strategyId: 's1' } } }),
    )
  })
})

describe('PUT /api/v1/watchlist/:id', () => {
  it('404s when the item is not owned by the user', async () => {
    mockPrisma.watchlistItem.findFirst.mockResolvedValue(null)
    const res = await request(app).put('/api/v1/watchlist/wl-1').set('x-test-userid', 'user-2').send({ notes: 'x' })
    expect(res.status).toBe(404)
  })

  it('updates notes/alert settings when owned', async () => {
    mockPrisma.watchlistItem.findFirst.mockResolvedValue(makeItem())
    mockPrisma.watchlistItem.update.mockResolvedValue(makeItem({ notes: 'watch closely' }))
    const res = await request(app)
      .put('/api/v1/watchlist/wl-1')
      .set('x-test-userid', 'user-1')
      .send({ notes: 'watch closely', alertThreshold: 75 })
    expect(res.status).toBe(200)
  })

  it('returns 500 (not a hang) on an out-of-range alertThreshold', async () => {
    mockPrisma.watchlistItem.findFirst.mockResolvedValue(makeItem())
    const res = await request(app)
      .put('/api/v1/watchlist/wl-1')
      .set('x-test-userid', 'user-1')
      .send({ alertThreshold: 150 })
    expect(res.status).toBe(500)
    expect(mockPrisma.watchlistItem.update).not.toHaveBeenCalled()
  })
})

describe('DELETE /api/v1/watchlist/:id', () => {
  it('404s when not owned', async () => {
    mockPrisma.watchlistItem.findFirst.mockResolvedValue(null)
    const res = await request(app).delete('/api/v1/watchlist/wl-1').set('x-test-userid', 'user-2')
    expect(res.status).toBe(404)
    expect(mockPrisma.watchlistItem.delete).not.toHaveBeenCalled()
  })

  it('deletes when owned', async () => {
    mockPrisma.watchlistItem.findFirst.mockResolvedValue(makeItem())
    mockPrisma.watchlistItem.delete.mockResolvedValue(makeItem())
    const res = await request(app).delete('/api/v1/watchlist/wl-1').set('x-test-userid', 'user-1')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ deleted: true })
  })
})

describe('DELETE /api/v1/watchlist/by-strategy/:strategyId', () => {
  it('removes any watchlist entry for that strategy belonging to the user', async () => {
    mockPrisma.watchlistItem.deleteMany.mockResolvedValue({ count: 1 })
    const res = await request(app).delete('/api/v1/watchlist/by-strategy/s1').set('x-test-userid', 'user-1')
    expect(res.status).toBe(200)
    expect(mockPrisma.watchlistItem.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1', strategyId: 's1' } })
  })
})
