/**
 * Unit tests for kite.service.ts — Zerodha Kite Connect OAuth token lifecycle.
 */
import crypto from 'crypto'
import axios from 'axios'

jest.mock('axios')
const mockedAxios = axios as jest.Mocked<typeof axios>

const mockPrisma = {
  kiteOAuthToken: {
    upsert: jest.fn(),
    findUnique: jest.fn(),
    deleteMany: jest.fn(),
  },
}

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => mockPrisma),
}))

import * as kiteService from '../services/kite.service'

beforeEach(() => {
  jest.clearAllMocks()
  process.env.KITE_API_KEY = 'test-api-key'
  process.env.KITE_API_SECRET = 'test-api-secret'
})

describe('buildAuthUrl', () => {
  it('includes the configured API key and version', () => {
    const url = kiteService.buildAuthUrl()
    expect(url).toBe('https://kite.trade/connect/login?api_key=test-api-key&v=3')
  })
})

describe('exchangeRequestToken', () => {
  it('posts a SHA-256 checksum of apiKey+requestToken+apiSecret', async () => {
    mockedAxios.post.mockResolvedValue({ data: { data: { access_token: 'kite-access-token' } } })

    const token = await kiteService.exchangeRequestToken('req-token-123')

    expect(token).toBe('kite-access-token')
    const [url, body, config] = mockedAxios.post.mock.calls[0]
    expect(url).toBe('https://api.kite.trade/session/token')

    const expectedChecksum = crypto
      .createHash('sha256')
      .update('test-api-key' + 'req-token-123' + 'test-api-secret')
      .digest('hex')
    expect(String(body)).toContain(`checksum=${expectedChecksum}`)
    expect((config as any).headers['X-Kite-Version']).toBe('3')
  })
})

describe('saveToken', () => {
  it('upserts the token with an expiry at next 6 AM IST', async () => {
    mockPrisma.kiteOAuthToken.upsert.mockResolvedValue({})

    await kiteService.saveToken('user-1', 'access-token-xyz')

    expect(mockPrisma.kiteOAuthToken.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1' },
        create: expect.objectContaining({ userId: 'user-1', accessToken: 'access-token-xyz' }),
        update: expect.objectContaining({ accessToken: 'access-token-xyz' }),
      }),
    )
    const call = mockPrisma.kiteOAuthToken.upsert.mock.calls[0][0]
    expect(call.create.expiresAt).toBeInstanceOf(Date)
  })
})

describe('getValidToken', () => {
  it('returns null when no token is stored', async () => {
    mockPrisma.kiteOAuthToken.findUnique.mockResolvedValue(null)
    expect(await kiteService.getValidToken('user-1')).toBeNull()
  })

  it('returns the access token when not yet expired', async () => {
    mockPrisma.kiteOAuthToken.findUnique.mockResolvedValue({
      accessToken: 'still-valid',
      expiresAt: new Date(Date.now() + 60_000),
    })
    expect(await kiteService.getValidToken('user-1')).toBe('still-valid')
  })

  it('returns null when the stored token has expired (no refresh available)', async () => {
    mockPrisma.kiteOAuthToken.findUnique.mockResolvedValue({
      accessToken: 'stale',
      expiresAt: new Date(Date.now() - 60_000),
    })
    expect(await kiteService.getValidToken('user-1')).toBeNull()
  })
})

describe('revokeToken', () => {
  it('deletes all stored tokens for the user', async () => {
    mockPrisma.kiteOAuthToken.deleteMany.mockResolvedValue({ count: 1 })
    await kiteService.revokeToken('user-1')
    expect(mockPrisma.kiteOAuthToken.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } })
  })
})

describe('isConnected', () => {
  it('returns false when no token exists', async () => {
    mockPrisma.kiteOAuthToken.findUnique.mockResolvedValue(null)
    expect(await kiteService.isConnected('user-1')).toBe(false)
  })

  it('returns true when a non-expired token exists', async () => {
    mockPrisma.kiteOAuthToken.findUnique.mockResolvedValue({ expiresAt: new Date(Date.now() + 60_000) })
    expect(await kiteService.isConnected('user-1')).toBe(true)
  })

  it('returns false when the stored token has expired', async () => {
    mockPrisma.kiteOAuthToken.findUnique.mockResolvedValue({ expiresAt: new Date(Date.now() - 60_000) })
    expect(await kiteService.isConnected('user-1')).toBe(false)
  })
})
