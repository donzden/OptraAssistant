/**
 * OP-43: Unit tests for my-strategies route — user-scoped isolation.
 * Verifies that user A cannot read, update, or delete user B's strategies.
 */
import express from 'express'
import request from 'supertest'

// ─── Prisma mock ──────────────────────────────────────────────────────────────

const STRATEGY_USER_A = {
  id: 'strat-a1',
  userId: 'user-a',
  name: 'User A strategy',
  description: null,
  category: 'NON_DIRECTIONAL',
  type: 'VARIES',
  riskLevel: 'MODERATE',
  outlook: [],
  ivLevels: [],
  legs: [],
  notes: null,
  tags: [],
  isTemplate: false,
  sourceStrategyId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}

const mockPrisma = {
  userStrategy: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
}

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => mockPrisma),
}))

// ─── Auth middleware mock ─────────────────────────────────────────────────────

// Replace requireAuth: injects req.userId from X-Test-UserId header
jest.mock('../middleware/requireAuth', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.userId = req.headers['x-test-userid'] ?? 'default-user'
    next()
  },
  AuthRequest: {},
}))

// ─── App setup ────────────────────────────────────────────────────────────────

let app: express.Express

beforeAll(async () => {
  const myStrategiesRouter = (await import('../routes/my-strategies')).default
  app = express()
  app.use(express.json())
  app.use('/api/v1/my-strategies', myStrategiesRouter)
})

beforeEach(() => {
  jest.clearAllMocks()
})

// ─── GET list — user sees only their own strategies ───────────────────────────

describe('GET /api/v1/my-strategies (list isolation)', () => {
  test('calls findMany with the authenticated userId', async () => {
    mockPrisma.userStrategy.findMany.mockResolvedValue([STRATEGY_USER_A])

    await request(app)
      .get('/api/v1/my-strategies')
      .set('x-test-userid', 'user-a')
      .expect(200)

    expect(mockPrisma.userStrategy.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-a' } }),
    )
  })

  test('user B query uses user B userId, not user A', async () => {
    mockPrisma.userStrategy.findMany.mockResolvedValue([])

    await request(app)
      .get('/api/v1/my-strategies')
      .set('x-test-userid', 'user-b')
      .expect(200)

    expect(mockPrisma.userStrategy.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-b' } }),
    )
  })
})

// ─── GET :id — user B cannot read user A's strategy ──────────────────────────

describe('GET /api/v1/my-strategies/:id (single isolation)', () => {
  test('returns 200 when strategy belongs to authenticated user', async () => {
    mockPrisma.userStrategy.findFirst.mockResolvedValue(STRATEGY_USER_A)

    const res = await request(app)
      .get('/api/v1/my-strategies/strat-a1')
      .set('x-test-userid', 'user-a')

    expect(res.status).toBe(200)
    expect(mockPrisma.userStrategy.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'strat-a1', userId: 'user-a' } }),
    )
  })

  test('returns 404 when user B requests user A strategy', async () => {
    mockPrisma.userStrategy.findFirst.mockResolvedValue(null)

    const res = await request(app)
      .get('/api/v1/my-strategies/strat-a1')
      .set('x-test-userid', 'user-b')

    expect(res.status).toBe(404)
    expect(mockPrisma.userStrategy.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'strat-a1', userId: 'user-b' } }),
    )
  })
})

// ─── PUT :id — user B cannot update user A's strategy ────────────────────────

describe('PUT /api/v1/my-strategies/:id (update isolation)', () => {
  test('returns 404 when user B tries to update user A strategy', async () => {
    mockPrisma.userStrategy.findFirst.mockResolvedValue(null)

    const res = await request(app)
      .put('/api/v1/my-strategies/strat-a1')
      .set('x-test-userid', 'user-b')
      .send({ name: 'Hijacked' })

    expect(res.status).toBe(404)
    expect(mockPrisma.userStrategy.update).not.toHaveBeenCalled()
  })

  test('allows update when strategy belongs to user', async () => {
    mockPrisma.userStrategy.findFirst.mockResolvedValue(STRATEGY_USER_A)
    mockPrisma.userStrategy.update.mockResolvedValue({ ...STRATEGY_USER_A, name: 'Updated' })

    const validLeg = { id: 'leg-1', type: 'BUY', optionType: 'CE', strike: 24000, lots: 1, premium: 150 }
    const res = await request(app)
      .put('/api/v1/my-strategies/strat-a1')
      .set('x-test-userid', 'user-a')
      .send({ name: 'Updated', legs: [validLeg] })

    expect(res.status).toBe(200)
    expect(res.body.name).toBe('Updated')
  })
})

// ─── DELETE :id — user B cannot delete user A's strategy ─────────────────────

describe('DELETE /api/v1/my-strategies/:id (delete isolation)', () => {
  test('returns 404 when user B tries to delete user A strategy', async () => {
    mockPrisma.userStrategy.findFirst.mockResolvedValue(null)

    const res = await request(app)
      .delete('/api/v1/my-strategies/strat-a1')
      .set('x-test-userid', 'user-b')

    expect(res.status).toBe(404)
    expect(mockPrisma.userStrategy.delete).not.toHaveBeenCalled()
  })

  test('deletes successfully when strategy belongs to user', async () => {
    mockPrisma.userStrategy.findFirst.mockResolvedValue(STRATEGY_USER_A)
    mockPrisma.userStrategy.delete.mockResolvedValue(STRATEGY_USER_A)

    const res = await request(app)
      .delete('/api/v1/my-strategies/strat-a1')
      .set('x-test-userid', 'user-a')

    expect(res.status).toBe(200)
    expect(res.body.deleted).toBe(true)
  })
})

// ─── POST — new strategy is tied to the authenticated user ────────────────────

describe('POST /api/v1/my-strategies (create)', () => {
  test('creates strategy with authenticated userId', async () => {
    const created = { ...STRATEGY_USER_A, userId: 'user-b', id: 'strat-b1' }
    mockPrisma.userStrategy.create.mockResolvedValue(created)

    const validLeg = { id: 'leg-1', type: 'BUY', optionType: 'CE', strike: 24000, lots: 1, premium: 150 }
    await request(app)
      .post('/api/v1/my-strategies')
      .set('x-test-userid', 'user-b')
      .send({ name: 'B strategy', legs: [validLeg] })
      .expect(201)

    expect(mockPrisma.userStrategy.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: 'user-b' }) }),
    )
  })

  test('returns 400 on missing name', async () => {
    const res = await request(app)
      .post('/api/v1/my-strategies')
      .set('x-test-userid', 'user-a')
      .send({ legs: [] })

    expect(res.status).toBe(400)
  })
})

// ─── POST :id/duplicate — copies belong to authenticated user ────────────────

describe('POST /api/v1/my-strategies/:id/duplicate', () => {
  test('duplicate is owned by the authenticated user', async () => {
    mockPrisma.userStrategy.findFirst.mockResolvedValue(STRATEGY_USER_A)
    const copy = { ...STRATEGY_USER_A, id: 'strat-a2', name: 'User A strategy (copy)' }
    mockPrisma.userStrategy.create.mockResolvedValue(copy)

    const res = await request(app)
      .post('/api/v1/my-strategies/strat-a1/duplicate')
      .set('x-test-userid', 'user-a')

    expect(res.status).toBe(201)
    expect(res.body.name).toMatch(/copy/)
    expect(mockPrisma.userStrategy.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: 'user-a' }) }),
    )
  })

  test('returns 404 when user B tries to duplicate user A strategy', async () => {
    mockPrisma.userStrategy.findFirst.mockResolvedValue(null)

    const res = await request(app)
      .post('/api/v1/my-strategies/strat-a1/duplicate')
      .set('x-test-userid', 'user-b')

    expect(res.status).toBe(404)
    expect(mockPrisma.userStrategy.create).not.toHaveBeenCalled()
  })
})
