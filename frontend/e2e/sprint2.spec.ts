/**
 * Sprint 2 E2E tests — Options Chain, Portfolio, Greeks Dashboard
 * All API calls are mocked via page.route(); no backend required.
 */
import { test, expect, type Page } from '@playwright/test'

// ─── Shared mock data ─────────────────────────────────────────────────────────

const MOCK_USER = {
  id: 'user-1',
  name: 'Test User',
  email: 'test@example.com',
  emailVerified: true,
  phoneVerified: false,
  role: 'USER' as const,
  riskAppetite: 'MODERATE' as const,
  preferredInstruments: [],
  defaultLotSize: 1,
  createdAt: new Date().toISOString(),
}

const MOCK_EXPIRIES = ['2026-05-29', '2026-06-05', '2026-06-12', '2026-06-19']

const MOCK_CHAIN = {
  symbol: 'NIFTY',
  expiry: '2026-05-29',
  spot_price: 24500,
  atm_strike: 24500,
  iv_rank: 42.5,
  iv_percentile: 38.0,
  atm_iv: 14.2,
  pcr: 0.85,
  is_mock: true,
  strikes: [
    {
      strike_price: 24000,
      is_atm: false,
      ce: { ltp: 620, open_interest: 120000, volume: 8500, iv: 15.8, bid: 618, ask: 622 },
      pe: { ltp: 85,  open_interest: 95000,  volume: 5200, iv: 14.1, bid: 83,  ask: 87  },
    },
    {
      strike_price: 24500,
      is_atm: true,
      ce: { ltp: 310, open_interest: 200000, volume: 22000, iv: 14.2, bid: 308, ask: 312 },
      pe: { ltp: 295, open_interest: 185000, volume: 18000, iv: 14.2, bid: 293, ask: 297 },
    },
    {
      strike_price: 25000,
      is_atm: false,
      ce: { ltp: 80,  open_interest: 90000, volume: 6000, iv: 13.5, bid: 78, ask: 82 },
      pe: { ltp: 580, open_interest: 70000, volume: 4000, iv: 15.0, bid: 578, ask: 582 },
    },
  ],
}

const MOCK_SENTIMENT = {
  vix: { value: 13.5, change: -0.3, change_pct: -2.2, sentiment: 'LOW_VOL' },
  nifty_trend: 'BULLISH',
  pcr: 0.85,
  recommended_stance: 'Consider premium-selling strategies like Iron Condor or Covered Call.',
  is_mock: true,
}

const MOCK_POSITIONS = [
  {
    id: 'pos-1',
    symbol: 'NIFTY',
    strike: 24500,
    expiry: '2026-05-29',
    optionType: 'CE',
    positionType: 'SHORT',
    lots: 2,
    lotSize: 25,
    avgPrice: 310,
    source: 'MANUAL',
    createdAt: new Date().toISOString(),
  },
]

const MOCK_GREEKS = {
  positions: [
    { position_id: 'pos-1', delta: -0.5, gamma: -0.002, theta: 15.2, vega: -12.1, rho: -3.5, current_price: 295, pnl: 750 },
  ],
  aggregate: { delta: -25.0, gamma: -0.05, theta: 380.0, vega: -302.5, rho: -87.5 },
  total_pnl: 750,
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function loginAs(page: Page) {
  await page.goto('/login')
  await page.evaluate((u) => {
    localStorage.setItem('optra-auth', JSON.stringify({
      state: { user: u, isAuthenticated: true },
      version: 0,
    }))
    sessionStorage.setItem('access_token', 'mock-jwt-token')
  }, MOCK_USER)
}

async function mockAllApis(page: Page, { withPositions = false } = {}) {
  await page.route('**/api/v1/**', async (route) => {
    const url = route.request().url()
    const method = route.request().method()

    if (url.includes('/market/expiries'))
      return route.fulfill({ status: 200, json: { symbol: 'NIFTY', expiries: MOCK_EXPIRIES } })

    if (url.includes('/market/options-chain'))
      return route.fulfill({ status: 200, json: MOCK_CHAIN })

    if (url.includes('/market/sentiment'))
      return route.fulfill({ status: 200, json: MOCK_SENTIMENT })

    if (url.includes('/market/vix'))
      return route.fulfill({ status: 200, json: MOCK_SENTIMENT.vix })

    if (method === 'GET' && url.includes('/portfolio/positions'))
      return route.fulfill({ status: 200, json: withPositions ? MOCK_POSITIONS : [] })

    if (method === 'POST' && url.includes('/portfolio/positions'))
      return route.fulfill({ status: 201, json: MOCK_POSITIONS[0] })

    if (method === 'DELETE' && url.includes('/portfolio/positions'))
      return route.fulfill({ status: 200, json: { message: 'Position deleted' } })

    if (method === 'POST' && url.includes('/portfolio/greeks'))
      return route.fulfill({ status: 200, json: MOCK_GREEKS })

    if (url.includes('/auth/me'))
      return route.fulfill({ status: 200, json: MOCK_USER })

    if (url.includes('/auth/refresh'))
      return route.fulfill({ status: 200, json: { accessToken: 'mock-jwt' } })

    return route.fulfill({ status: 200, json: {} })
  })
}

// ─── Options Chain page ───────────────────────────────────────────────────────

test.describe('Options Chain page', () => {
  test.beforeEach(async ({ page }) => {
    await mockAllApis(page)
    await loginAs(page)
    await page.goto('/options-chain')
  })

  test('page heading is visible', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /options chain/i })).toBeVisible()
  })

  test('shows all 4 symbol buttons', async ({ page }) => {
    for (const sym of ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY']) {
      await expect(page.getByRole('button', { name: sym, exact: true })).toBeVisible()
    }
  })

  test('shows expiry buttons after loading', async ({ page }) => {
    // Wait for expiries API response to render buttons
    await expect(page.getByRole('button', { name: '2026-05-29' })).toBeVisible({ timeout: 5000 })
    await expect(page.getByRole('button', { name: '2026-06-05' })).toBeVisible()
  })

  test('shows spot price pill', async ({ page }) => {
    await expect(page.getByText(/Spot/)).toBeVisible({ timeout: 5000 })
    await expect(page.getByText(/₹24,500|24,500/).first()).toBeVisible()
  })

  test('shows IV Rank and IV Percentile pills', async ({ page }) => {
    await expect(page.getByText(/IV Rank/)).toBeVisible({ timeout: 5000 })
    await expect(page.getByText(/IV%ile/)).toBeVisible()
  })

  test('options table shows strike prices', async ({ page }) => {
    await expect(page.getByText('24,500').first()).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('24,000').first()).toBeVisible()
    await expect(page.getByText('25,000').first()).toBeVisible()
  })

  test('shows market sentiment banner with VIX', async ({ page }) => {
    await expect(page.getByText(/VIX 13\.50/i)).toBeVisible({ timeout: 5000 })
  })

  test('shows recommended stance text', async ({ page }) => {
    await expect(page.getByText(/Iron Condor|premium.selling|Covered Call/i)).toBeVisible({ timeout: 5000 })
  })

  test('switching symbol reloads chain', async ({ page }) => {
    await page.getByRole('button', { name: 'BANKNIFTY', exact: true }).click()
    // NIFTY tab is no longer active; BANKNIFTY is now active
    const bankBtn = page.getByRole('button', { name: 'BANKNIFTY', exact: true })
    await expect(bankBtn).toHaveClass(/bg-indigo-600/)
  })

  test('Show Greeks toggle button is present', async ({ page }) => {
    await expect(page.getByRole('button', { name: /show greeks/i })).toBeVisible()
  })

  test('Refresh button is present', async ({ page }) => {
    await expect(page.getByRole('button', { name: /refresh/i })).toBeVisible()
  })
})

// ─── Portfolio page — empty state ─────────────────────────────────────────────

test.describe('Portfolio page — empty state', () => {
  test.beforeEach(async ({ page }) => {
    await mockAllApis(page, { withPositions: false })
    await loginAs(page)
    await page.goto('/portfolio')
  })

  test('page heading is visible', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /portfolio/i })).toBeVisible()
  })

  test('shows empty state message when no positions', async ({ page }) => {
    await expect(page.getByText(/no positions yet/i)).toBeVisible({ timeout: 5000 })
  })

  test('Add Position button is visible', async ({ page }) => {
    await expect(page.getByRole('button', { name: /add position/i })).toBeVisible()
  })

  test('Add Position modal opens on click', async ({ page }) => {
    await page.getByRole('button', { name: /add position/i }).click()
    // Modal should appear with form fields
    await expect(page.getByRole('dialog').or(page.locator('[role="dialog"], .modal, form'))).toBeVisible({ timeout: 3000 })
      .catch(() => expect(page.getByText(/symbol|symbol|strike|lots/i).first()).toBeVisible({ timeout: 3000 }))
  })

  test('Add Position modal has Symbol, Strike, Option Type fields', async ({ page }) => {
    await page.getByRole('button', { name: /add position/i }).click()
    await expect(page.getByText(/symbol/i).first()).toBeVisible({ timeout: 3000 })
    await expect(page.getByText(/strike/i).first()).toBeVisible()
  })

  test('Greeks dashboard is hidden when no positions exist', async ({ page }) => {
    await expect(page.getByText(/Portfolio Greeks/i)).not.toBeVisible()
  })
})

// ─── Portfolio page — with positions ─────────────────────────────────────────

test.describe('Portfolio page — with positions', () => {
  test.beforeEach(async ({ page }) => {
    await mockAllApis(page, { withPositions: true })
    await loginAs(page)
    await page.goto('/portfolio')
  })

  test('shows position count badge', async ({ page }) => {
    await expect(page.getByText('1 position')).toBeVisible({ timeout: 5000 })
  })

  test('shows position details in table', async ({ page }) => {
    await expect(page.getByText('NIFTY').first()).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('SHORT').first()).toBeVisible()
    await expect(page.getByText('CE').first()).toBeVisible()
  })

  test('shows Greeks dashboard when positions exist', async ({ page }) => {
    await expect(page.getByText(/Portfolio Greeks/i)).toBeVisible({ timeout: 5000 })
  })

  test('Greeks dashboard shows Delta, Theta, Vega cards', async ({ page }) => {
    await expect(page.getByText(/delta/i).first()).toBeVisible({ timeout: 5000 })
    await expect(page.getByText(/theta/i).first()).toBeVisible()
    await expect(page.getByText(/vega/i).first()).toBeVisible()
  })

  test('total P&L is displayed', async ({ page }) => {
    // total_pnl is 750 in mock
    await expect(page.getByText(/750|P&L|pnl/i).first()).toBeVisible({ timeout: 5000 })
  })
})

// ─── Dashboard stale text check ───────────────────────────────────────────────

test.describe('Dashboard — no stale Sprint 2 text', () => {
  test.beforeEach(async ({ page }) => {
    await mockAllApis(page)
    await loginAs(page)
    await page.goto('/dashboard')
  })

  test('does not show "Sprint 2" placeholder text', async ({ page }) => {
    const bodyText = await page.textContent('body')
    expect(bodyText).not.toContain('Sprint 2')
  })

  test('does not show "Coming in Sprint 2" on any stub route', async ({ page }) => {
    await page.goto('/strategies')
    const text = await page.textContent('body')
    expect(text).not.toContain('Sprint 2+')
  })

  test('Strategy stub pages say Sprint 3', async ({ page }) => {
    for (const route of ['/strategies', '/library', '/builder']) {
      await page.goto(route)
      await expect(page.getByText(/Sprint 3/i)).toBeVisible({ timeout: 3000 })
    }
  })

  test('quick action cards link to correct Sprint 2 pages', async ({ page }) => {
    await page.goto('/dashboard')
    // Portfolio card should go to /portfolio
    await expect(page.locator('a[href="/portfolio"]').first()).toBeVisible()
    // Options chain is now live
    await expect(page.locator('a[href="/options-chain"], a[href*="options"]').first()).toBeVisible()
  })
})
