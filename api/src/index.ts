import 'dotenv/config'
import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import { rateLimit } from 'express-rate-limit'
import authRouter from './routes/auth'
import usersRouter from './routes/users'
import adminRouter from './routes/admin'
import marketRouter from './routes/market'
import portfolioRouter from './routes/portfolio'
import kiteRouter from './routes/kite'
import strategiesRouter from './routes/strategies'
import myStrategiesRouter from './routes/my-strategies'
import watchlistRouter from './routes/watchlist'
import monitorRouter from './routes/monitor'
import { errorHandler } from './middleware/errorHandler'
import { requireAuth } from './middleware/requireAuth'

const app = express()
const PORT = process.env.PORT ?? 4000

// Security
app.use(helmet())
app.use(cors({
  origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
  credentials: true,
}))
app.use(cookieParser())
app.use(express.json({ limit: '10kb' }))

// Global rate limit
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
}))

// Routes
app.use('/api/v1/auth', authRouter)
app.use('/api/v1/users', requireAuth, usersRouter)
app.use('/api/v1/admin', requireAuth, adminRouter)
app.use('/api/v1/market', marketRouter)
app.use('/api/v1/portfolio', portfolioRouter)
app.use('/api/v1/kite', kiteRouter)
app.use('/api/v1/strategies', strategiesRouter)
app.use('/api/v1/my-strategies', requireAuth, myStrategiesRouter)
app.use('/api/v1/watchlist', watchlistRouter)
app.use('/api/v1/monitor', requireAuth, monitorRouter)

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }))

// 404
app.use((_req, res) => res.status(404).json({ message: 'Not found' }))

// Error handler
app.use(errorHandler)

app.listen(PORT, () => {
  console.log(`API server running on port ${PORT}`)
})

export default app
