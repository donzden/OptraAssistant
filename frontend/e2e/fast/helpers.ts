/**
 * Shared helpers for the "fast" e2e suite: deterministic, mocked-API,
 * no-artificial-sleep tests meant to run in CI. Keep this separate from
 * the sprintN human-paced regression scripts.
 */
import type { Page } from '@playwright/test'

export const MOCK_USER = {
  id: 'user-fast-1',
  name: 'Fast Test User',
  email: 'fast@optra.dev',
  emailVerified: true,
  phoneVerified: false,
  role: 'USER' as const,
  riskAppetite: 'MODERATE' as const,
  preferredInstruments: ['NIFTY'],
  defaultLotSize: 1,
  createdAt: new Date().toISOString(),
}

export const MOCK_ADMIN = { ...MOCK_USER, id: 'admin-fast-1', email: 'admin@optra.dev', role: 'ADMIN' as const }

/** Injects a mock session (zustand persist + bearer token) so pages skip the login flow. */
export async function mockAuth(page: Page, user: typeof MOCK_USER = MOCK_USER) {
  await page.addInitScript((u) => {
    localStorage.setItem('optra-auth', JSON.stringify({ state: { user: u, isAuthenticated: true }, version: 0 }))
    sessionStorage.setItem('access_token', 'mock-jwt-fast')
  }, user)
  await page.route('**/api/v1/auth/me', (route) => route.fulfill({ json: user }))
}

export function jsonRoute(page: Page, pattern: string | RegExp, body: unknown) {
  return page.route(pattern, (route) => route.fulfill({ json: body }))
}

export const MOCK_EXPIRIES = { symbol: 'NIFTY', expiries: ['2026-05-28', '2026-06-25', '2026-07-30'] }

export function mockOptionsChain(symbol = 'NIFTY', expiry = '2026-05-28') {
  const strike = (offset: number) => ({
    strike_price: 24000 + offset * 50,
    is_atm: offset === 0,
    ce: { ltp: 120 - offset * 10, open_interest: 50000, volume: 1000, iv: 15, greeks: { delta: 0.5, gamma: 0.001, theta: -2, vega: 5, rho: 0.5 } },
    pe: { ltp: 110 + offset * 10, open_interest: 40000, volume: 900, iv: 16, greeks: { delta: -0.5, gamma: 0.001, theta: -2, vega: 5, rho: -0.5 } },
  })
  return {
    symbol, expiry, spot_price: 24000, atm_strike: 24000,
    iv_rank: 40, iv_percentile: 55, atm_iv: 15, pcr: 1.1,
    strikes: [-2, -1, 0, 1, 2].map(strike),
    is_mock: true,
  }
}
