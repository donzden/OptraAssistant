import { Router, Response, NextFunction } from 'express'
import { AuthRequest, requireAuth } from '../middleware/requireAuth'
import * as kiteService from '../services/kite.service'

const router = Router()

// GET /api/v1/kite/auth — redirect user to Kite OAuth login
router.get('/auth', requireAuth, (_req: AuthRequest, res: Response) => {
  res.redirect(kiteService.buildAuthUrl())
})

// GET /api/v1/kite/callback — Kite redirects here with ?request_token=&action=login&status=success
router.get('/callback', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  const { request_token, status, error_message } = req.query as Record<string, string>
  const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173'

  if (status !== 'success' || !request_token) {
    const reason = error_message ? encodeURIComponent(error_message) : 'cancelled'
    return res.redirect(`${frontendUrl}/portfolio?kite=error&reason=${reason}`)
  }

  try {
    const accessToken = await kiteService.exchangeRequestToken(request_token)
    await kiteService.saveToken(req.userId!, accessToken)
    res.redirect(`${frontendUrl}/portfolio?kite=connected`)
  } catch (err) {
    next(err)
  }
})

// GET /api/v1/kite/status
router.get('/status', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const connected = await kiteService.isConnected(req.userId!)
    res.json({ connected })
  } catch (err) {
    next(err)
  }
})

// DELETE /api/v1/kite/disconnect
router.delete('/disconnect', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await kiteService.revokeToken(req.userId!)
    res.json({ message: 'Zerodha account disconnected' })
  } catch (err) {
    next(err)
  }
})

export default router
