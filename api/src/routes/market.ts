import { Router, Request, Response, NextFunction } from 'express'
import axios from 'axios'
import { requireAuth } from '../middleware/requireAuth'

const router = Router()

const ENGINE_URL = process.env.ENGINE_URL ?? 'http://localhost:8000'
const INTERNAL_KEY = process.env.INTERNAL_API_KEY ?? 'dev-internal-key'

function engineHeaders() {
  return { 'X-Internal-Key': INTERNAL_KEY }
}

// GET /api/v1/market/options-chain?symbol=NIFTY&expiry=2025-05-29
router.get('/options-chain', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { symbol = 'NIFTY', expiry } = req.query
    const params: Record<string, string> = { symbol: String(symbol) }
    if (expiry) params.expiry = String(expiry)
    const { data } = await axios.get(`${ENGINE_URL}/api/v1/options-chain`, {
      params,
      headers: engineHeaders(),
    })
    res.json(data)
  } catch (err) {
    next(err)
  }
})

// GET /api/v1/market/expiries?symbol=NIFTY
router.get('/expiries', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { symbol = 'NIFTY' } = req.query
    const { data } = await axios.get(`${ENGINE_URL}/api/v1/options-chain/expiries`, {
      params: { symbol: String(symbol) },
      headers: engineHeaders(),
    })
    res.json(data)
  } catch (err) {
    next(err)
  }
})

// GET /api/v1/market/vix
router.get('/vix', requireAuth, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const { data } = await axios.get(`${ENGINE_URL}/api/v1/market/vix`, {
      headers: engineHeaders(),
    })
    res.json(data)
  } catch (err) {
    next(err)
  }
})

// GET /api/v1/market/sentiment
router.get('/sentiment', requireAuth, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const { data } = await axios.get(`${ENGINE_URL}/api/v1/market/sentiment`, {
      headers: engineHeaders(),
    })
    res.json(data)
  } catch (err) {
    next(err)
  }
})

export default router
