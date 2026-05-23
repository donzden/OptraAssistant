import axios from 'axios'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const UPSTOX_TOKEN_URL = 'https://api.upstox.com/v2/login/authorization/token'

export function buildAuthUrl(): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.UPSTOX_API_KEY ?? '',
    redirect_uri: process.env.UPSTOX_REDIRECT_URI ?? 'http://localhost:4000/api/v1/upstox/callback',
  })
  return `https://api.upstox.com/v2/login/authorization/dialog?${params.toString()}`
}

export async function exchangeCode(code: string): Promise<{
  access_token: string
  refresh_token?: string
  expires_in: number
}> {
  const params = new URLSearchParams({
    code,
    client_id: process.env.UPSTOX_API_KEY ?? '',
    client_secret: process.env.UPSTOX_API_SECRET ?? '',
    redirect_uri: process.env.UPSTOX_REDIRECT_URI ?? 'http://localhost:4000/api/v1/upstox/callback',
    grant_type: 'authorization_code',
  })
  const { data } = await axios.post(UPSTOX_TOKEN_URL, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
  })
  return data
}

export async function refreshAccessToken(userId: string): Promise<string | null> {
  const stored = await prisma.upstoxOAuthToken.findUnique({ where: { userId } })
  if (!stored?.refreshToken) return null

  try {
    const params = new URLSearchParams({
      client_id: process.env.UPSTOX_API_KEY ?? '',
      client_secret: process.env.UPSTOX_API_SECRET ?? '',
      refresh_token: stored.refreshToken,
      grant_type: 'refresh_token',
    })
    const { data } = await axios.post(UPSTOX_TOKEN_URL, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    })
    const expiresAt = new Date(Date.now() + data.expires_in * 1000)
    await prisma.upstoxOAuthToken.update({
      where: { userId },
      data: { accessToken: data.access_token, expiresAt },
    })
    return data.access_token
  } catch {
    return null
  }
}

export async function getValidToken(userId: string): Promise<string | null> {
  const stored = await prisma.upstoxOAuthToken.findUnique({ where: { userId } })
  if (!stored) return null
  if (stored.expiresAt > new Date()) return stored.accessToken
  return refreshAccessToken(userId)
}

export async function saveToken(
  userId: string,
  accessToken: string,
  refreshToken: string | undefined,
  expiresIn: number,
): Promise<void> {
  const expiresAt = new Date(Date.now() + expiresIn * 1000)
  await prisma.upstoxOAuthToken.upsert({
    where: { userId },
    create: { userId, accessToken, refreshToken: refreshToken ?? '', expiresAt },
    update: { accessToken, refreshToken: refreshToken ?? '', expiresAt },
  })
}

export async function revokeToken(userId: string): Promise<void> {
  await prisma.upstoxOAuthToken.deleteMany({ where: { userId } })
}

export async function isConnected(userId: string): Promise<boolean> {
  const t = await prisma.upstoxOAuthToken.findUnique({ where: { userId } })
  return !!t && t.expiresAt > new Date()
}
