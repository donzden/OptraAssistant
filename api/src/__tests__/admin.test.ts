/**
 * Unit tests for routes/admin.ts — admin-only user management + stats.
 */
import express from 'express'
import request from 'supertest'
import { errorHandler } from '../middleware/errorHandler'

const mockPrisma = {
  user: {
    findMany: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
  },
}

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => mockPrisma),
}))

let currentRole = 'ADMIN'

jest.mock('../middleware/requireAuth', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.userId = req.headers['x-test-userid'] ?? 'admin-1'
    req.userRole = currentRole
    next()
  },
  requireAdmin: (req: any, res: any, next: any) => {
    if (req.userRole !== 'ADMIN') return res.status(403).json({ message: 'Forbidden' })
    next()
  },
  AuthRequest: {},
}))

let app: express.Express

beforeAll(async () => {
  const adminRouter = (await import('../routes/admin')).default
  app = express()
  app.use(express.json())
  app.use('/api/v1/admin', adminRouter)
  app.use(errorHandler)
})

beforeEach(() => {
  jest.clearAllMocks()
  currentRole = 'ADMIN'
})

describe('non-admin access', () => {
  it('rejects a non-admin user with 403', async () => {
    currentRole = 'USER'
    const res = await request(app).get('/api/v1/admin/users')
    expect(res.status).toBe(403)
    expect(mockPrisma.user.findMany).not.toHaveBeenCalled()
  })
})

describe('GET /api/v1/admin/users', () => {
  it('returns paginated user list with default page/limit', async () => {
    mockPrisma.user.findMany.mockResolvedValue([{ id: 'u1', name: 'Alice' }])
    mockPrisma.user.count.mockResolvedValue(1)

    const res = await request(app).get('/api/v1/admin/users')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ data: [{ id: 'u1', name: 'Alice' }], total: 1, page: 1, limit: 20 })
    expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 20 }),
    )
  })

  it('respects page/limit query params and caps limit at 100', async () => {
    mockPrisma.user.findMany.mockResolvedValue([])
    mockPrisma.user.count.mockResolvedValue(0)

    const res = await request(app).get('/api/v1/admin/users').query({ page: 3, limit: 500 })

    expect(res.status).toBe(200)
    expect(res.body.page).toBe(3)
    expect(res.body.limit).toBe(100)
    expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 200, take: 100 }),
    )
  })
})

describe('PATCH /api/v1/admin/users/:id/status', () => {
  it('updates status and clears lock fields when reactivating', async () => {
    mockPrisma.user.update.mockResolvedValue({ id: 'u1', name: 'Alice', email: 'a@x.com', status: 'ACTIVE' })

    const res = await request(app).patch('/api/v1/admin/users/u1/status').send({ status: 'ACTIVE' })

    expect(res.status).toBe(200)
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'u1' },
        data: { status: 'ACTIVE', lockedUntil: null, loginFailureCount: 0 },
      }),
    )
  })

  it('does not reset lock fields when locking a user', async () => {
    mockPrisma.user.update.mockResolvedValue({ id: 'u1', status: 'LOCKED' })
    await request(app).patch('/api/v1/admin/users/u1/status').send({ status: 'LOCKED' })

    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'LOCKED' } }),
    )
  })

  it('returns 500 (not a hang/crash) on an invalid status value', async () => {
    const res = await request(app).patch('/api/v1/admin/users/u1/status').send({ status: 'NOT_A_STATUS' })
    expect(res.status).toBe(500)
    expect(mockPrisma.user.update).not.toHaveBeenCalled()
  })
})

describe('PATCH /api/v1/admin/users/:id/role', () => {
  it('updates the role', async () => {
    mockPrisma.user.update.mockResolvedValue({ id: 'u1', role: 'ADMIN' })
    const res = await request(app).patch('/api/v1/admin/users/u1/role').send({ role: 'ADMIN' })
    expect(res.status).toBe(200)
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'u1' }, data: { role: 'ADMIN' } }),
    )
  })

  it('returns 500 (not a hang/crash) on an invalid role value', async () => {
    const res = await request(app).patch('/api/v1/admin/users/u1/role').send({ role: 'SUPERUSER' })
    expect(res.status).toBe(500)
  })
})

describe('GET /api/v1/admin/stats', () => {
  it('returns aggregate user counts', async () => {
    mockPrisma.user.count
      .mockResolvedValueOnce(100) // total
      .mockResolvedValueOnce(80) // active
      .mockResolvedValueOnce(15) // pending
      .mockResolvedValueOnce(5) // locked

    const res = await request(app).get('/api/v1/admin/stats')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ totalUsers: 100, activeUsers: 80, pendingUsers: 15, lockedUsers: 5 })
  })

  it('returns 500 (not a hang/crash) when a DB call rejects', async () => {
    mockPrisma.user.count.mockRejectedValueOnce(new Error('DB down'))
    const res = await request(app).get('/api/v1/admin/stats')
    expect(res.status).toBe(500)
  })
})
