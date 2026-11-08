/**
 * Unit tests for routes/kite.ts — Zerodha Kite OAuth wiring.
 */
import express from 'express'
import request from 'supertest'
import { errorHandler } from '../middleware/errorHandler'

jest.mock('../middleware/requireAuth', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.userId = req.headers['x-test-userid'] ?? 'user-1'
    next()
  },
  AuthRequest: {},
}))

const mockKiteService = {
  buildAuthUrl: jest.fn(),
  exchangeRequestToken: jest.fn(),
  saveToken: jest.fn(),
  isConnected: jest.fn(),
  revokeToken: jest.fn(),
}

jest.mock('../services/kite.service', () => mockKiteService)

let app: express.Express

beforeAll(async () => {
  const kiteRouter = (await import('../routes/kite')).default
  app = express()
  app.use(express.json())
  app.use('/api/v1/kite', kiteRouter)
  app.use(errorHandler)
})

beforeEach(() => {
  jest.clearAllMocks()
  process.env.FRONTEND_URL = 'http://localhost:5173'
})

describe('GET /api/v1/kite/auth', () => {
  it('redirects to the Kite OAuth login URL', async () => {
    mockKiteService.buildAuthUrl.mockReturnValue('https://kite.trade/connect/login?api_key=x&v=3')

    const res = await request(app).get('/api/v1/kite/auth')

    expect(res.status).toBe(302)
    expect(res.headers.location).toBe('https://kite.trade/connect/login?api_key=x&v=3')
  })
})

describe('GET /api/v1/kite/callback', () => {
  it('redirects to portfolio with an error when status is not success', async () => {
    const res = await request(app).get('/api/v1/kite/callback').query({ status: 'error', error_message: 'User denied' })

    expect(res.status).toBe(302)
    expect(res.headers.location).toBe('http://localhost:5173/portfolio?kite=error&reason=User%20denied')
    expect(mockKiteService.exchangeRequestToken).not.toHaveBeenCalled()
  })

  it('redirects to portfolio with "cancelled" when no error_message is given', async () => {
    const res = await request(app).get('/api/v1/kite/callback').query({ status: 'error' })
    expect(res.headers.location).toBe('http://localhost:5173/portfolio?kite=error&reason=cancelled')
  })

  it('exchanges the request token and saves it, then redirects as connected', async () => {
    mockKiteService.exchangeRequestToken.mockResolvedValue('kite-access-token')
    mockKiteService.saveToken.mockResolvedValue(undefined)

    const res = await request(app)
      .get('/api/v1/kite/callback')
      .set('x-test-userid', 'user-42')
      .query({ status: 'success', request_token: 'req-abc' })

    expect(res.status).toBe(302)
    expect(res.headers.location).toBe('http://localhost:5173/portfolio?kite=connected')
    expect(mockKiteService.exchangeRequestToken).toHaveBeenCalledWith('req-abc')
    expect(mockKiteService.saveToken).toHaveBeenCalledWith('user-42', 'kite-access-token')
  })

  it('forwards to the error handler when token exchange fails', async () => {
    mockKiteService.exchangeRequestToken.mockRejectedValue(new Error('Kite API down'))

    const res = await request(app)
      .get('/api/v1/kite/callback')
      .query({ status: 'success', request_token: 'req-abc' })

    expect(res.status).toBe(500)
  })
})

describe('GET /api/v1/kite/status', () => {
  it('returns connected: true when a valid token exists', async () => {
    mockKiteService.isConnected.mockResolvedValue(true)
    const res = await request(app).get('/api/v1/kite/status').set('x-test-userid', 'user-1')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ connected: true })
  })

  it('returns connected: false when no token exists', async () => {
    mockKiteService.isConnected.mockResolvedValue(false)
    const res = await request(app).get('/api/v1/kite/status').set('x-test-userid', 'user-1')
    expect(res.body).toEqual({ connected: false })
  })
})

describe('DELETE /api/v1/kite/disconnect', () => {
  it('revokes the token for the authenticated user', async () => {
    mockKiteService.revokeToken.mockResolvedValue(undefined)
    const res = await request(app).delete('/api/v1/kite/disconnect').set('x-test-userid', 'user-7')
    expect(res.status).toBe(200)
    expect(mockKiteService.revokeToken).toHaveBeenCalledWith('user-7')
  })
})
