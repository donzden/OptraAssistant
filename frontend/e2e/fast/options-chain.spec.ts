import { test, expect } from '@playwright/test'
import { mockAuth, jsonRoute, MOCK_EXPIRIES, mockOptionsChain } from './helpers'

const SENTIMENT = {
  vix: { value: 14.2, change: -0.3, change_pct: -2.1, sentiment: 'MODERATE' },
  nifty_trend: 'SIDEWAYS',
  pcr: 1.05,
  recommended_stance: 'Balanced approach — directional spreads or delta-neutral positions',
  is_mock: true,
}

test.beforeEach(async ({ page }) => {
  await mockAuth(page)
  await jsonRoute(page, '**/api/v1/market/sentiment', SENTIMENT)
  await jsonRoute(page, '**/api/v1/market/expiries*', MOCK_EXPIRIES)
  await page.route('**/api/v1/market/options-chain*', (route) => {
    const url = new URL(route.request().url())
    const symbol = url.searchParams.get('symbol') ?? 'NIFTY'
    route.fulfill({ json: mockOptionsChain(symbol, MOCK_EXPIRIES.expiries[0]) })
  })
})

test('renders the options chain with the ATM strike flagged', async ({ page }) => {
  await page.goto('/options-chain')
  await expect(page.getByRole('heading', { name: 'Options Chain' })).toBeVisible()
  await expect(page.getByText('ATM', { exact: true })).toBeVisible()
  await expect(page.getByText('MODERATE')).toBeVisible() // sentiment banner
})

test('toggling "Show Greeks" reveals the delta columns', async ({ page }) => {
  await page.goto('/options-chain')
  await expect(page.getByText('ATM', { exact: true })).toBeVisible()
  await expect(page.locator('th', { hasText: 'Δ' })).toHaveCount(0)

  await page.getByRole('button', { name: /Show Greeks/i }).click()
  await expect(page.locator('th', { hasText: 'Δ' })).toHaveCount(2)
})

test('switching symbol re-fetches the chain for that instrument', async ({ page }) => {
  let requestedSymbol = ''
  await page.route('**/api/v1/market/options-chain*', (route) => {
    const url = new URL(route.request().url())
    requestedSymbol = url.searchParams.get('symbol') ?? ''
    route.fulfill({ json: mockOptionsChain(requestedSymbol, MOCK_EXPIRIES.expiries[0]) })
  })

  await page.goto('/options-chain')
  await expect(page.getByText('ATM', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'BANKNIFTY' }).click()
  await expect.poll(() => requestedSymbol).toBe('BANKNIFTY')
})
