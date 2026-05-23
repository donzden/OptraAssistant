import { Router, Response, NextFunction } from 'express'
import { AuthRequest, requireAuth } from '../middleware/requireAuth'
import * as upstoxService from '../services/upstox.service'

const router = Router()

// GET /api/v1/upstox/auth — redirect user to Upstox OAuth
router.get('/auth', requireAuth, (_req: AuthRequest, res: Response) => {
  const url = upstoxService.buildAuthUrl()
  res.redirect(url)
})

// GET /api/v1/upstox/callback — Upstox redirects here with ?code=
router.get('/callback', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  const { code, error } = req.query as Record<string, string>
  const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173'

  if (error || !code) {
    return res.redirect(`${frontendUrl}/portfolio?upstox=error`)
  }

  try {
    const tokens = await upstoxService.exchangeCode(code)
    await upstoxService.saveToken(
      req.userId!,
      tokens.access_token,
      tokens.refresh_token,
      tokens.expires_in,
    )
    res.redirect(`${frontendUrl}/portfolio?upstox=connected`)
  } catch (err) {
    next(err)
  }
})

// GET /api/v1/upstox/status
router.get('/status', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const connected = await upstoxService.isConnected(req.userId!)
    res.json({ connected })
  } catch (err) {
    next(err)
  }
})

// DELETE /api/v1/upstox/disconnect
router.delete('/disconnect', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await upstoxService.revokeToken(req.userId!)
    res.json({ message: 'Upstox account disconnected' })
  } catch (err) {
    next(err)
  }
})

export default router
