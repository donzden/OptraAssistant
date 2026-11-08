/**
 * Unit tests for routes/strategies.ts — library listing, favourites, recommend/explain proxying, admin edit.
 */
import express from 'express'
import request from 'supertest'
import axios from 'axios'
import { errorHandler } from '../middleware/errorHandler'

jest.mock('axios')
const mockedAxios = axios as jest.Mocked<typeof axios>

const mockPrisma = {
  strategy: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  userStrategyFavourite: { findMany: jest.fn(), findUnique: jest.fn(), delete: jest.fn(), create: jest.fn() },
  user: { findUnique: jest.fn() },
  position: { findMany: jest.fn() },
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

let app: express.Express

beforeAll(async () => {
  process.env.ENGINE_URL = 'http://localhost:8000'
  process.env.INTERNAL_API_KEY = 'test-internal-key'
  const strategiesRouter = (await import('../routes/strategies')).default
  app = express()
  app.use(express.json())
  app.use('/api/v1/strategies', strategiesRouter)
  app.use(errorHandler)
})

beforeEach(() => {
  jest.clearAllMocks()
})

describe('GET /api/v1/strategies', () => {
  it('marks favourited strategies and includes favourite counts', async () => {
    mockPrisma.strategy.findMany.mockResolvedValue([
      { id: 's1', name: 'Iron Condor', _count: { favourites: 3 } },
      { id: 's2', name: 'Straddle', _count: { favourites: 0 } },
    ])
    mockPrisma.userStrategyFavourite.findMany.mockResolvedValue([{ strategyId: 's1' }])

    const res = await request(app).get('/api/v1/strategies').set('x-test-userid', 'user-1')

    expect(res.status).toBe(200)
    expect(res.body[0]).toEqual(expect.objectContaining({ id: 's1', isFavourite: true, favouriteCount: 3 }))
    expect(res.body[1]).toEqual(expect.objectContaining({ id: 's2', isFavourite: false, favouriteCount: 0 }))
  })

  it('applies category/riskLevel/type/outlook filters (uppercased)', async () => {
    mockPrisma.strategy.findMany.mockResolvedValue([])
    mockPrisma.userStrategyFavourite.findMany.mockResolvedValue([])

    await request(app)
      .get('/api/v1/strategies')
      .query({ category: 'non_directional', riskLevel: 'moderate', type: 'credit', outlook: 'neutral' })
      .set('x-test-userid', 'user-1')

    expect(mockPrisma.strategy.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { category: 'NON_DIRECTIONAL', riskLevel: 'MODERATE', type: 'CREDIT', outlook: { has: 'NEUTRAL' } },
      }),
    )
  })
})

describe('GET /api/v1/strategies/favourites', () => {
  it("returns the user's favourited strategies", async () => {
    mockPrisma.userStrategyFavourite.findMany.mockResolvedValue([
      { strategy: { id: 's1', name: 'Iron Condor' } },
    ])
    const res = await request(app).get('/api/v1/strategies/favourites').set('x-test-userid', 'user-1')
    expect(res.status).toBe(200)
    expect(res.body).toEqual([{ id: 's1', name: 'Iron Condor', isFavourite: true }])
  })
})

describe('GET /api/v1/strategies/recommend', () => {
  it('skips portfolio greeks when the user has no positions', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ riskAppetite: 'MODERATE' })
    mockPrisma.strategy.findMany.mockResolvedValue([])
    mockPrisma.position.findMany.mockResolvedValue([])
    mockedAxios.post.mockResolvedValue({ data: { ranked: [] } })

    const res = await request(app).get('/api/v1/strategies/recommend').set('x-test-userid', 'user-1')

    expect(res.status).toBe(200)
    expect(mockedAxios.post).toHaveBeenCalledTimes(1) // only the recommend call, no greeks call
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringContaining('/strategies/recommend'),
      expect.objectContaining({ portfolio_greeks: undefined }),
      expect.anything(),
    )
  })

  it('includes portfolio greeks when positions exist and the engine call succeeds', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ riskAppetite: 'AGGRESSIVE' })
    mockPrisma.strategy.findMany.mockResolvedValue([])
    mockPrisma.position.findMany.mockResolvedValue([{ id: 'p1', symbol: 'NIFTY' }])
    mockedAxios.post
      .mockResolvedValueOnce({ data: { aggregate: { delta: 1.2 } } }) // greeks call
      .mockResolvedValueOnce({ data: { ranked: [] } }) // recommend call

    const res = await request(app).get('/api/v1/strategies/recommend').set('x-test-userid', 'user-1')

    expect(res.status).toBe(200)
    expect(mockedAxios.post).toHaveBeenCalledTimes(2)
    expect(mockedAxios.post).toHaveBeenLastCalledWith(
      expect.stringContaining('/strategies/recommend'),
      expect.objectContaining({ portfolio_greeks: { aggregate: { delta: 1.2 } }, user_risk: 'AGGRESSIVE' }),
      expect.anything(),
    )
  })

  it('continues without portfolio_greeks when the greeks call fails', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ riskAppetite: 'MODERATE' })
    mockPrisma.strategy.findMany.mockResolvedValue([])
    mockPrisma.position.findMany.mockResolvedValue([{ id: 'p1' }])
    mockedAxios.post
      .mockRejectedValueOnce(new Error('engine down')) // greeks call fails
      .mockResolvedValueOnce({ data: { ranked: [] } }) // recommend still proceeds

    const res = await request(app).get('/api/v1/strategies/recommend').set('x-test-userid', 'user-1')

    expect(res.status).toBe(200)
    expect(mockedAxios.post).toHaveBeenLastCalledWith(
      expect.stringContaining('/strategies/recommend'),
      expect.objectContaining({ portfolio_greeks: undefined }),
      expect.anything(),
    )
  })
})

describe('GET /api/v1/strategies/:id', () => {
  it('404s for an unknown strategy', async () => {
    mockPrisma.strategy.findUnique.mockResolvedValue(null)
    const res = await request(app).get('/api/v1/strategies/does-not-exist').set('x-test-userid', 'user-1')
    expect(res.status).toBe(404)
  })

  it('returns the strategy with isFavourite flag', async () => {
    mockPrisma.strategy.findUnique.mockResolvedValue({ id: 's1', name: 'Iron Condor' })
    mockPrisma.userStrategyFavourite.findUnique.mockResolvedValue({ userId: 'user-1', strategyId: 's1' })
    const res = await request(app).get('/api/v1/strategies/s1').set('x-test-userid', 'user-1')
    expect(res.status).toBe(200)
    expect(res.body.isFavourite).toBe(true)
  })
})

describe('POST /api/v1/strategies/:id/explain', () => {
  it('404s for an unknown strategy', async () => {
    mockPrisma.strategy.findUnique.mockResolvedValue(null)
    const res = await request(app).post('/api/v1/strategies/does-not-exist/explain').set('x-test-userid', 'user-1').send({})
    expect(res.status).toBe(404)
  })

  it('fetches market signal then requests an explanation', async () => {
    mockPrisma.strategy.findUnique.mockResolvedValue({ id: 's1', name: 'Iron Condor' })
    mockedAxios.get.mockResolvedValue({ data: { trend: 'SIDEWAYS' } })
    mockedAxios.post.mockResolvedValue({ data: { explanation: 'Good fit for low IV.' } })

    const res = await request(app)
      .post('/api/v1/strategies/s1/explain')
      .set('x-test-userid', 'user-1')
      .send({ symbol: 'BANKNIFTY', detailed: true })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ explanation: 'Good fit for low IV.' })
    expect(mockedAxios.get).toHaveBeenCalledWith(
      expect.stringContaining('/strategies/analyse'),
      expect.objectContaining({ params: { symbol: 'BANKNIFTY' } }),
    )
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringContaining('/strategies/explain'),
      expect.objectContaining({ detailed: true, market_signal: { trend: 'SIDEWAYS' } }),
      expect.anything(),
    )
  })
})

describe('POST /api/v1/strategies/:id/favourite', () => {
  it('adds a favourite when none exists', async () => {
    mockPrisma.userStrategyFavourite.findUnique.mockResolvedValue(null)
    mockPrisma.userStrategyFavourite.create.mockResolvedValue({})
    const res = await request(app).post('/api/v1/strategies/s1/favourite').set('x-test-userid', 'user-1')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ isFavourite: true })
    expect(mockPrisma.userStrategyFavourite.create).toHaveBeenCalled()
  })

  it('removes an existing favourite (toggle off)', async () => {
    mockPrisma.userStrategyFavourite.findUnique.mockResolvedValue({ userId: 'user-1', strategyId: 's1' })
    mockPrisma.userStrategyFavourite.delete.mockResolvedValue({})
    const res = await request(app).post('/api/v1/strategies/s1/favourite').set('x-test-userid', 'user-1')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ isFavourite: false })
    expect(mockPrisma.userStrategyFavourite.delete).toHaveBeenCalled()
  })
})

describe('GET /api/v1/strategies/admin/all', () => {
  it('403s for a non-admin user', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ role: 'USER' })
    const res = await request(app).get('/api/v1/strategies/admin/all').set('x-test-userid', 'user-1')
    expect(res.status).toBe(403)
    expect(mockPrisma.strategy.findMany).not.toHaveBeenCalled()
  })

  it('200s with the full strategy list for an admin', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ role: 'ADMIN' })
    mockPrisma.strategy.findMany.mockResolvedValue([{ id: 's1' }])
    const res = await request(app).get('/api/v1/strategies/admin/all').set('x-test-userid', 'admin-1')
    expect(res.status).toBe(200)
    expect(res.body).toEqual([{ id: 's1' }])
  })
})

describe('PUT /api/v1/strategies/admin/:id', () => {
  it('403s for a non-admin user', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ role: 'USER' })
    const res = await request(app)
      .put('/api/v1/strategies/admin/s1')
      .set('x-test-userid', 'user-1')
      .send({ riskLevel: 'AGGRESSIVE' })
    expect(res.status).toBe(403)
    expect(mockPrisma.strategy.update).not.toHaveBeenCalled()
  })

  it('updates allowed fields for an admin', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ role: 'ADMIN' })
    mockPrisma.strategy.update.mockResolvedValue({ id: 's1', riskLevel: 'AGGRESSIVE' })
    const res = await request(app)
      .put('/api/v1/strategies/admin/s1')
      .set('x-test-userid', 'admin-1')
      .send({ riskLevel: 'AGGRESSIVE' })
    expect(res.status).toBe(200)
    expect(mockPrisma.strategy.update).toHaveBeenCalledWith({ where: { id: 's1' }, data: { riskLevel: 'AGGRESSIVE' } })
  })

  it('returns 500 (not a hang) on an invalid riskLevel for an admin', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ role: 'ADMIN' })
    const res = await request(app)
      .put('/api/v1/strategies/admin/s1')
      .set('x-test-userid', 'admin-1')
      .send({ riskLevel: 'YOLO' })
    expect(res.status).toBe(500)
    expect(mockPrisma.strategy.update).not.toHaveBeenCalled()
  })
})
