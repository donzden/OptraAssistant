import crypto from 'crypto'
import axios from 'axios'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const KITE_BASE = 'https://api.kite.trade'
const KITE_VERSION = '3'

export function buildAuthUrl(): string {
  const apiKey = process.env.KITE_API_KEY ?? ''
  return `https://kite.trade/connect/login?api_key=${apiKey}&v=${KITE_VERSION}`
}

export async function exchangeRequestToken(requestToken: string): Promise<string> {
  const apiKey = process.env.KITE_API_KEY ?? ''
  const apiSecret = process.env.KITE_API_SECRET ?? ''
  // Kite checksum: SHA-256(api_key + request_token + api_secret)
  const checksum = crypto
    .createHash('sha256')
    .update(apiKey + requestToken + apiSecret)
    .digest('hex')

  const { data } = await axios.post(
    `${KITE_BASE}/session/token`,
    new URLSearchParams({ api_key: apiKey, request_token: requestToken, checksum }).toString(),
    { headers: { 'X-Kite-Version': KITE_VERSION, 'Content-Type': 'application/x-www-form-urlencoded' } },
  )
  return data.data.access_token as string
}

export async function saveToken(userId: string, accessToken: string): Promise<void> {
  // Kite tokens expire at 6 AM IST the following day
  const now = new Date()
  const istOffset = 5.5 * 60 * 60 * 1000
  const istNow = new Date(now.getTime() + istOffset)
  const expiry = new Date(istNow)
  expiry.setHours(6, 0, 0, 0)
  if (expiry <= istNow) expiry.setDate(expiry.getDate() + 1)
  const expiresAt = new Date(expiry.getTime() - istOffset) // back to UTC

  await prisma.kiteOAuthToken.upsert({
    where: { userId },
    create: { userId, accessToken, expiresAt },
    update: { accessToken, expiresAt },
  })
}

export async function getValidToken(userId: string): Promise<string | null> {
  const stored = await prisma.kiteOAuthToken.findUnique({ where: { userId } })
  if (!stored) return null
  if (stored.expiresAt > new Date()) return stored.accessToken
  // Kite has no refresh — token is stale, user must re-auth
  return null
}

export async function revokeToken(userId: string): Promise<void> {
  await prisma.kiteOAuthToken.deleteMany({ where: { userId } })
}

export async function isConnected(userId: string): Promise<boolean> {
  const t = await prisma.kiteOAuthToken.findUnique({ where: { userId } })
  return !!t && t.expiresAt > new Date()
}
