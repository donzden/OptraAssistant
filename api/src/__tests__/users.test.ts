/**
 * Unit tests for routes/users.ts — profile read/update, avatar placeholder.
 */
import express from 'express'
import request from 'supertest'
import { errorHandler } from '../middleware/errorHandler'

const mockPrisma = {
  user: {
    findUniqueOrThrow: jest.fn(),
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

let app: express.Express

beforeAll(async () => {
  const usersRouter = (await import('../routes/users')).default
  app = express()
  app.use(express.json())
  app.use('/api/v1/users', usersRouter)
  app.use(errorHandler)
})

beforeEach(() => {
  jest.clearAllMocks()
})

describe('GET /api/v1/users/profile', () => {
  it('returns the profile without the password hash', async () => {
    mockPrisma.user.findUniqueOrThrow.mockResolvedValue({
      id: 'user-1', name: 'Alice', email: 'alice@x.com', passwordHash: 'secret-hash',
    })

    const res = await request(app).get('/api/v1/users/profile').set('x-test-userid', 'user-1')

    expect(res.status).toBe(200)
    expect(res.body).not.toHaveProperty('passwordHash')
    expect(res.body.email).toBe('alice@x.com')
  })

  it('returns 500 (not a hang/crash) when the user is not found', async () => {
    mockPrisma.user.findUniqueOrThrow.mockRejectedValue(new Error('No User found'))
    const res = await request(app).get('/api/v1/users/profile').set('x-test-userid', 'ghost')
    expect(res.status).toBe(500)
  })
})

describe('PATCH /api/v1/users/profile', () => {
  it('updates allowed fields and strips the password hash from the response', async () => {
    mockPrisma.user.update.mockResolvedValue({
      id: 'user-1', name: 'Alice Updated', passwordHash: 'secret-hash', riskAppetite: 'AGGRESSIVE',
    })

    const res = await request(app)
      .patch('/api/v1/users/profile')
      .set('x-test-userid', 'user-1')
      .send({ name: 'Alice Updated', riskAppetite: 'AGGRESSIVE' })

    expect(res.status).toBe(200)
    expect(res.body).not.toHaveProperty('passwordHash')
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { name: 'Alice Updated', riskAppetite: 'AGGRESSIVE' },
    })
  })

  it('returns 500 (not a hang/crash) on an invalid riskAppetite value', async () => {
    const res = await request(app)
      .patch('/api/v1/users/profile')
      .set('x-test-userid', 'user-1')
      .send({ riskAppetite: 'YOLO' })

    expect(res.status).toBe(500)
    expect(mockPrisma.user.update).not.toHaveBeenCalled()
  })
})

describe('POST /api/v1/users/avatar', () => {
  it('returns 501 Not Implemented instead of hanging or crashing the process', async () => {
    const res = await request(app).post('/api/v1/users/avatar').set('x-test-userid', 'user-1')
    expect(res.status).toBe(501)
    expect(res.body.message).toMatch(/not yet implemented/i)
  })
})
