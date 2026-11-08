/**
 * Unit tests for routes/portfolio.ts — manual positions, Zerodha import, greeks proxy.
 */
import express from 'express'
import request from 'supertest'
import axios from 'axios'
import { errorHandler } from '../middleware/errorHandler'

jest.mock('axios')
const mockedAxios = axios as jest.Mocked<typeof axios>

const mockPrisma = {
  position: {
    findMany: jest.fn(),
    create: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    upsert: jest.fn(),
  },
}

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => mockPrisma),
}))

const mockGetValidToken = jest.fn()
jest.mock('../services/kite.service', () => ({
  getValidToken: mockGetValidToken,
}))

jest.mock('../middleware/requireAuth', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.userId = req.headers['x-test-userid'] ?? 'user-1'
    next()
  },
  AuthRequest: {},
}))

const VALID_POSITION = {
  symbol: 'NIFTY', strike: 24000, expiry: '2026-05-29', optionType: 'CE',
  positionType: 'SHORT', lots: 1, lotSize: 50, avgPrice: 120,
}

let app: express.Express

beforeAll(async () => {
  process.env.ENGINE_URL = 'http://localhost:8000'
  process.env.INTERNAL_API_KEY = 'test-internal-key'
  process.env.KITE_API_KEY = 'test-kite-key'
  const portfolioRouter = (await import('../routes/portfolio')).default
  app = express()
  app.use(express.json())
  app.use('/api/v1/portfolio', portfolioRouter)
  app.use(errorHandler)
})

beforeEach(() => {
  jest.clearAllMocks()
})

describe('GET /api/v1/portfolio/positions', () => {
  it('returns the authenticated user\'s positions', async () => {
    mockPrisma.position.findMany.mockResolvedValue([{ id: 'p1' }])
    const res = await request(app).get('/api/v1/portfolio/positions').set('x-test-userid', 'user-1')
    expect(res.status).toBe(200)
    expect(mockPrisma.position.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1' } }),
    )
  })
})

describe('POST /api/v1/portfolio/positions', () => {
  it('creates a MANUAL position', async () => {
    mockPrisma.position.create.mockResolvedValue({ id: 'p1', ...VALID_POSITION, source: 'MANUAL' })
    const res = await request(app)
      .post('/api/v1/portfolio/positions')
      .set('x-test-userid', 'user-1')
      .send(VALID_POSITION)
    expect(res.status).toBe(201)
    expect(mockPrisma.position.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: 'user-1', source: 'MANUAL' }) }),
    )
  })

  it('returns 500 (not a hang) on an invalid symbol', async () => {
    const res = await request(app)
      .post('/api/v1/portfolio/positions')
      .set('x-test-userid', 'user-1')
      .send({ ...VALID_POSITION, symbol: 'SENSEX' })
    expect(res.status).toBe(500)
    expect(mockPrisma.position.create).not.toHaveBeenCalled()
  })
})

describe('PUT /api/v1/portfolio/positions/:id', () => {
  it('404s when the position is not owned by the user', async () => {
    mockPrisma.position.findFirst.mockResolvedValue(null)
    const res = await request(app)
      .put('/api/v1/portfolio/positions/p1')
      .set('x-test-userid', 'user-2')
      .send({ avgPrice: 150 })
    expect(res.status).toBe(404)
  })

  it('updates a partial body when owned', async () => {
    mockPrisma.position.findFirst.mockResolvedValue({ id: 'p1', userId: 'user-1' })
    mockPrisma.position.update.mockResolvedValue({ id: 'p1', avgPrice: 150 })
    const res = await request(app)
      .put('/api/v1/portfolio/positions/p1')
      .set('x-test-userid', 'user-1')
      .send({ avgPrice: 150 })
    expect(res.status).toBe(200)
    expect(mockPrisma.position.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { avgPrice: 150 } })
  })
})

describe('DELETE /api/v1/portfolio/positions/:id', () => {
  it('404s when not owned', async () => {
    mockPrisma.position.findFirst.mockResolvedValue(null)
    const res = await request(app).delete('/api/v1/portfolio/positions/p1').set('x-test-userid', 'user-2')
    expect(res.status).toBe(404)
    expect(mockPrisma.position.delete).not.toHaveBeenCalled()
  })

  it('deletes when owned', async () => {
    mockPrisma.position.findFirst.mockResolvedValue({ id: 'p1' })
    mockPrisma.position.delete.mockResolvedValue({ id: 'p1' })
    const res = await request(app).delete('/api/v1/portfolio/positions/p1').set('x-test-userid', 'user-1')
    expect(res.status).toBe(200)
  })
})

describe('POST /api/v1/portfolio/import-from-zerodha', () => {
  it('400s when no valid Kite token is stored', async () => {
    mockGetValidToken.mockResolvedValue(null)
    const res = await request(app).post('/api/v1/portfolio/import-from-zerodha').set('x-test-userid', 'user-1')
    expect(res.status).toBe(400)
    expect(mockedAxios.get).not.toHaveBeenCalled()
  })

  it('parses NFO option positions and upserts them, skipping non-NFO/zero-qty', async () => {
    mockGetValidToken.mockResolvedValue('kite-token-abc')
    mockedAxios.get.mockResolvedValue({
      data: {
        data: {
          net: [
            {
              tradingsymbol: 'NIFTY25MAY22000CE', product: 'NRML', quantity: -50,
              exchange: 'NFO', average_price: 120, expiry: '2026-05-29', last_price: 110,
            },
            { tradingsymbol: 'RELIANCE', product: 'CNC', quantity: 10, exchange: 'NSE' },
            { tradingsymbol: 'NIFTY25MAY22000PE', product: 'NRML', quantity: 0, exchange: 'NFO' },
          ],
        },
      },
    })
    mockPrisma.position.upsert.mockResolvedValue({})

    const res = await request(app).post('/api/v1/portfolio/import-from-zerodha').set('x-test-userid', 'user-1')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ imported: 1, total: 1 })
    expect(mockPrisma.position.upsert).toHaveBeenCalledTimes(1)
    const call = mockPrisma.position.upsert.mock.calls[0][0]
    expect(call.create).toEqual(
      expect.objectContaining({ symbol: 'NIFTY', optionType: 'CE', positionType: 'SHORT', strike: 22000, lots: 2 }),
    )
  })
})

describe('POST /api/v1/portfolio/greeks', () => {
  it('short-circuits with zeroed aggregate when there are no positions', async () => {
    mockPrisma.position.findMany.mockResolvedValue([])
    const res = await request(app).post('/api/v1/portfolio/greeks').set('x-test-userid', 'user-1').send({})
    expect(res.status).toBe(200)
    expect(res.body.positions).toEqual([])
    expect(mockedAxios.post).not.toHaveBeenCalled()
  })

  it('proxies to the engine with mapped position fields', async () => {
    mockPrisma.position.findMany.mockResolvedValue([
      { id: 'p1', symbol: 'NIFTY', strike: 24000, expiry: '2026-05-29', optionType: 'CE', positionType: 'SHORT', lots: 1, lotSize: 50, avgPrice: 120 },
    ])
    mockedAxios.post.mockResolvedValue({ data: { aggregate: { delta: -0.3 } } })

    const res = await request(app)
      .post('/api/v1/portfolio/greeks')
      .set('x-test-userid', 'user-1')
      .send({ spot_prices: { NIFTY: 24050 } })

    expect(res.status).toBe(200)
    expect(mockedAxios.post).toHaveBeenCalledWith(
      'http://localhost:8000/api/v1/portfolio/greeks',
      expect.objectContaining({
        positions: [expect.objectContaining({ id: 'p1', option_type: 'CE', lot_size: 50 })],
        spot_prices: { NIFTY: 24050 },
      }),
      expect.anything(),
    )
  })
})
