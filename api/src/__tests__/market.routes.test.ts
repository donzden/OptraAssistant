/**
 * Unit tests for routes/market.ts — thin proxy to the Python engine service.
 */
import express from 'express'
import request from 'supertest'
import axios from 'axios'
import { errorHandler } from '../middleware/errorHandler'

jest.mock('axios')
const mockedAxios = axios as jest.Mocked<typeof axios>

jest.mock('../middleware/requireAuth', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.userId = 'user-1'
    next()
  },
  AuthRequest: {},
}))

let app: express.Express

beforeAll(async () => {
  process.env.ENGINE_URL = 'http://localhost:8000'
  process.env.INTERNAL_API_KEY = 'test-internal-key'
  const marketRouter = (await import('../routes/market')).default
  app = express()
  app.use(express.json())
  app.use('/api/v1/market', marketRouter)
  app.use(errorHandler)
})

beforeEach(() => {
  jest.clearAllMocks()
})

describe('GET /api/v1/market/options-chain', () => {
  it('defaults symbol to NIFTY and forwards the internal key header', async () => {
    mockedAxios.get.mockResolvedValue({ data: { symbol: 'NIFTY', strikes: [] } })

    const res = await request(app).get('/api/v1/market/options-chain')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ symbol: 'NIFTY', strikes: [] })
    expect(mockedAxios.get).toHaveBeenCalledWith(
      'http://localhost:8000/api/v1/options-chain',
      expect.objectContaining({
        params: { symbol: 'NIFTY' },
        headers: { 'X-Internal-Key': 'test-internal-key' },
      }),
    )
  })

  it('passes through symbol and expiry query params', async () => {
    mockedAxios.get.mockResolvedValue({ data: {} })
    await request(app).get('/api/v1/market/options-chain').query({ symbol: 'BANKNIFTY', expiry: '2026-05-29' })

    expect(mockedAxios.get).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ params: { symbol: 'BANKNIFTY', expiry: '2026-05-29' } }),
    )
  })

  it('forwards engine errors via next(err) instead of crashing', async () => {
    mockedAxios.get.mockRejectedValue(new Error('engine unreachable'))
    const res = await request(app).get('/api/v1/market/options-chain')
    expect(res.status).toBe(500)
  })
})

describe('GET /api/v1/market/expiries', () => {
  it('returns the expiries list from the engine', async () => {
    mockedAxios.get.mockResolvedValue({ data: { symbol: 'NIFTY', expiries: ['2026-05-29', '2026-06-26'] } })
    const res = await request(app).get('/api/v1/market/expiries').query({ symbol: 'NIFTY' })
    expect(res.status).toBe(200)
    expect(res.body.expiries).toHaveLength(2)
  })
})

describe('GET /api/v1/market/vix', () => {
  it('proxies the vix endpoint', async () => {
    mockedAxios.get.mockResolvedValue({ data: { vix: 13.5 } })
    const res = await request(app).get('/api/v1/market/vix')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ vix: 13.5 })
  })
})

describe('GET /api/v1/market/sentiment', () => {
  it('proxies the sentiment endpoint', async () => {
    mockedAxios.get.mockResolvedValue({ data: { trend: 'BULLISH' } })
    const res = await request(app).get('/api/v1/market/sentiment')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ trend: 'BULLISH' })
  })
})
