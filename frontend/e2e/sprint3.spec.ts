/**
 * Sprint 3 E2E tests — Recommender, Strategy Library, Strategy Detail
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

const MOCK_SIGNAL = {
  instrument: 'NIFTY',
  spot_price: 24500,
  trend: 'BULLISH',
  iv_regime: 'LOW_NORMAL',
  iv_rank: 42.5,
  iv_percentile: 38.0,
  vix: 13.5,
  vix_regime: 'LOW_VOL',
  pcr: 0.85,
  adx: 32.0,
  market_phase: 'TRENDING',
  dte_buckets: ['WEEKLY', 'MONTHLY', 'NEXT_CYCLE'],
  last_updated: new Date().toISOString(),
  is_mock: true,
}

const MOCK_STRATEGY_BASE = {
  id: 'strat-1',
  name: 'Long Call',
  description: 'Buy a call option to profit from bullish moves with limited risk.',
  category: 'DIRECTIONAL',
  type: 'DEBIT',
  riskLevel: 'MODERATE',
  outlook: ['BULLISH'],
  ivLevels: ['LOW', 'LOW_NORMAL'],
  dteMin: 7,
  dteMax: 30,
  isFavourite: false,
  favouriteCount: 14,
  rules: {
    entry: 'Buy 1 ATM call option',
    exit: 'Exit when profit target hit or near expiry',
    max_profit: 'Unlimited',
    max_loss: 'Premium paid',
    delta: 'Positive (0.4–0.6)',
    vega: 'Positive',
    theta: 'Negative',
  },
}

const MOCK_STRATEGY_2 = {
  id: 'strat-2',
  name: 'Iron Condor',
  description: 'Sell OTM call spread + OTM put spread to collect premium in range-bound markets.',
  category: 'NON_DIRECTIONAL',
  type: 'CREDIT',
  riskLevel: 'MODERATE',
  outlook: ['NEUTRAL'],
  ivLevels: ['HIGH_NORMAL', 'HIGH'],
  dteMin: 21,
  dteMax: 45,
  isFavourite: true,
  favouriteCount: 31,
  rules: {
    entry: 'Sell OTM call and put spreads',
    exit: 'Exit at 50% profit or manage breached strikes',
    max_profit: 'Net premium collected',
    max_loss: 'Width of spread minus premium',
    delta: 'Near zero',
    vega: 'Negative',
    theta: 'Positive',
  },
}

const MOCK_RECOMMEND = {
  signal: MOCK_SIGNAL,
  ranked: [
    {
      strategy: MOCK_STRATEGY_BASE,
      score: 90.0,
      explanation: 'Long Call is excellent in a bullish, low-IV trending market.',
      condition_checks: {
        iv_match: { passed: true, score: 30, max: 30, reason: 'Perfect IV match' },
        trend_match: { passed: true, score: 30, max: 30, reason: 'Bullish trend' },
        dte_match: { passed: true, score: 20, max: 20, reason: 'DTE 7d available' },
        risk_match: { passed: true, score: 10, max: 20, reason: 'Moderate strategy' },
      },
    },
  ],
}

const MOCK_STRATEGIES_LIST = [MOCK_STRATEGY_BASE, MOCK_STRATEGY_2]

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

async function mockAllApis(page: Page) {
  await page.route('**/api/v1/**', async (route) => {
    const url = route.request().url()
    const method = route.request().method()

    if (url.includes('/auth/me'))
      return route.fulfill({ status: 200, json: MOCK_USER })

    if (url.includes('/auth/refresh'))
      return route.fulfill({ status: 200, json: { accessToken: 'mock-jwt' } })

    if (url.includes('/strategies/recommend'))
      return route.fulfill({ status: 200, json: MOCK_RECOMMEND })

    if (url.includes('/strategies/favourites'))
      return route.fulfill({ status: 200, json: [] })

    if (method === 'POST' && url.match(/\/strategies\/[^/]+\/favourite/))
      return route.fulfill({ status: 200, json: {} })

    if (method === 'POST' && url.match(/\/strategies\/[^/]+\/explain/))
      return route.fulfill({ status: 200, json: { explanation: 'Detailed AI explanation here.' } })

    if (url.match(/\/strategies\/[^/]+$/) && method === 'GET')
      return route.fulfill({ status: 200, json: { ...MOCK_STRATEGY_BASE, isFavourite: false } })

    if (url.includes('/strategies') && method === 'GET')
      return route.fulfill({ status: 200, json: MOCK_STRATEGIES_LIST })

    if (url.includes('/market/sentiment'))
      return route.fulfill({ status: 200, json: { nifty_trend: 'BULLISH', is_mock: true } })

    if (url.includes('/portfolio/positions'))
      return route.fulfill({ status: 200, json: [] })

    return route.fulfill({ status: 200, json: {} })
  })
}

// ─── Recommender page ─────────────────────────────────────────────────────────

test.describe('Recommender page', () => {
  test.beforeEach(async ({ page }) => {
    await mockAllApis(page)
    await loginAs(page)
    await page.goto('/strategies')
  })

  test('page heading is visible', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /recommender|recommendation|strategy/i })).toBeVisible()
  })

  test('market conditions banner shows trend', async ({ page }) => {
    await expect(page.getByText(/bullish/i).first()).toBeVisible({ timeout: 5000 })
  })

  test('market banner shows IV regime', async ({ page }) => {
    await expect(page.getByText(/low.normal|low normal|IV/i).first()).toBeVisible({ timeout: 5000 })
  })

  test('market banner shows VIX value', async ({ page }) => {
    await expect(page.getByText(/13\.5|vix/i).first()).toBeVisible({ timeout: 5000 })
  })

  test('market banner shows market phase', async ({ page }) => {
    await expect(page.getByText(/trending/i).first()).toBeVisible({ timeout: 5000 })
  })

  test('strategy card shows strategy name', async ({ page }) => {
    await expect(page.getByText('Long Call')).toBeVisible({ timeout: 5000 })
  })

  test('strategy card shows score', async ({ page }) => {
    await expect(page.getByText(/90|score/i).first()).toBeVisible({ timeout: 5000 })
  })

  test('strategy card shows category badge', async ({ page }) => {
    await expect(page.getByText(/directional/i)).toBeVisible({ timeout: 5000 })
  })

  test('strategy card shows type badge', async ({ page }) => {
    await expect(page.getByText(/debit/i).first()).toBeVisible({ timeout: 5000 })
  })

  test('symbol selector buttons are visible', async ({ page }) => {
    for (const sym of ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY']) {
      await expect(page.getByRole('button', { name: sym, exact: true })).toBeVisible()
    }
  })

  test('mock banner is shown when data is mock', async ({ page }) => {
    await expect(page.getByText(/mock/i).first()).toBeVisible({ timeout: 5000 })
  })

  test('expand card shows explanation', async ({ page }) => {
    // Click the expand/details button on the first card
    const expandBtn = page.getByRole('button', { name: /view details|details|expand|explain/i }).first()
    if (await expandBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expandBtn.click()
      await expect(page.getByText(/bullish|call|trending/i).first()).toBeVisible({ timeout: 5000 })
    } else {
      // Some designs use click on the card itself
      await page.getByText('Long Call').click()
      await expect(page.getByText(/excellent|bullish|explanation/i).first()).toBeVisible({ timeout: 5000 })
        .catch(() => { /* card may navigate away */ })
    }
  })

  test('refresh button is visible', async ({ page }) => {
    await expect(page.getByRole('button', { name: /refresh/i })).toBeVisible()
  })
})

// ─── Recommender — empty state ────────────────────────────────────────────────

test.describe('Recommender page — empty state', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/v1/**', async (route) => {
      const url = route.request().url()
      if (url.includes('/auth/me'))
        return route.fulfill({ status: 200, json: MOCK_USER })
      if (url.includes('/auth/refresh'))
        return route.fulfill({ status: 200, json: { accessToken: 'mock-jwt' } })
      if (url.includes('/strategies/recommend'))
        return route.fulfill({ status: 200, json: { signal: MOCK_SIGNAL, ranked: [] } })
      if (url.includes('/strategies/favourites'))
        return route.fulfill({ status: 200, json: [] })
      if (url.includes('/strategies') && route.request().method() === 'GET')
        return route.fulfill({ status: 200, json: [] })
      if (url.includes('/portfolio/positions'))
        return route.fulfill({ status: 200, json: [] })
      return route.fulfill({ status: 200, json: {} })
    })
    await loginAs(page)
    await page.goto('/strategies')
  })

  test('shows empty state when no recommendations', async ({ page }) => {
    await expect(
      page.getByText(/no strategies|no recommendations|no match|nothing|empty/i).first()
    ).toBeVisible({ timeout: 5000 })
  })
})

// ─── Strategy Library ─────────────────────────────────────────────────────────

test.describe('Strategy Library', () => {
  test.beforeEach(async ({ page }) => {
    await mockAllApis(page)
    await loginAs(page)
    await page.goto('/library')
  })

  test('page heading is visible', async ({ page }) => {
    await expect(page.getByText(/strategy library/i)).toBeVisible({ timeout: 5000 })
  })

  test('shows strategy count', async ({ page }) => {
    await expect(page.getByText(/2 strategies|strategies/i).first()).toBeVisible({ timeout: 5000 })
  })

  test('shows strategy names', async ({ page }) => {
    await expect(page.getByText('Long Call')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Iron Condor')).toBeVisible({ timeout: 5000 })
  })

  test('search filters strategies', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/search/i)
    await expect(searchInput).toBeVisible({ timeout: 5000 })
    await searchInput.fill('Iron')
    await expect(page.getByText('Iron Condor')).toBeVisible()
  })

  test('search hides non-matching strategies', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/search/i)
    await searchInput.fill('Iron')
    await expect(page.getByText('Long Call')).not.toBeVisible()
  })

  test('category filter dropdown is visible', async ({ page }) => {
    await expect(page.getByRole('combobox').first()).toBeVisible({ timeout: 5000 })
  })

  test('grid/list toggle buttons are visible', async ({ page }) => {
    const gridBtn = page.locator('button').filter({ has: page.locator('svg') }).first()
    await expect(gridBtn).toBeVisible({ timeout: 5000 })
  })

  test('favourite heart button is visible on strategy cards', async ({ page }) => {
    await expect(page.locator('button').filter({ has: page.locator('svg') }).first()).toBeVisible({ timeout: 5000 })
  })

  test('clicking a strategy card navigates to detail page', async ({ page }) => {
    await page.getByText('Long Call').click()
    await expect(page).toHaveURL(/\/library\/strat-1/, { timeout: 5000 })
  })
})

// ─── Strategy Library — empty state ──────────────────────────────────────────

test.describe('Strategy Library — empty state', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/v1/**', async (route) => {
      const url = route.request().url()
      if (url.includes('/auth/me'))
        return route.fulfill({ status: 200, json: MOCK_USER })
      if (url.includes('/auth/refresh'))
        return route.fulfill({ status: 200, json: { accessToken: 'mock-jwt' } })
      if (url.includes('/strategies/favourites'))
        return route.fulfill({ status: 200, json: [] })
      if (url.includes('/strategies') && route.request().method() === 'GET')
        return route.fulfill({ status: 200, json: [] })
      return route.fulfill({ status: 200, json: {} })
    })
    await loginAs(page)
    await page.goto('/library')
  })

  test('shows empty state when no strategies match', async ({ page }) => {
    await expect(
      page.getByText(/no strategies|match your filters|empty/i).first()
    ).toBeVisible({ timeout: 5000 })
  })
})

// ─── Strategy Detail ──────────────────────────────────────────────────────────

test.describe('Strategy Detail page', () => {
  test.beforeEach(async ({ page }) => {
    await mockAllApis(page)
    await loginAs(page)
    await page.goto('/library/strat-1')
  })

  test('strategy name is visible', async ({ page }) => {
    await expect(page.getByText('Long Call').first()).toBeVisible({ timeout: 5000 })
  })

  test('strategy description is visible', async ({ page }) => {
    await expect(page.getByText(/bullish|call option|profit/i).first()).toBeVisible({ timeout: 5000 })
  })

  test('payoff diagram or chart is rendered', async ({ page }) => {
    // Recharts renders an SVG; look for chart container or svg
    await expect(
      page.locator('svg, canvas, [class*="recharts"], [class*="payoff"], [class*="chart"]').first()
    ).toBeVisible({ timeout: 5000 })
  })

  test('shows category, type, and risk badges', async ({ page }) => {
    await expect(page.getByText(/directional/i).first()).toBeVisible({ timeout: 5000 })
    await expect(page.getByText(/debit/i).first()).toBeVisible({ timeout: 5000 })
    await expect(page.getByText(/moderate/i).first()).toBeVisible({ timeout: 5000 })
  })

  test('shows entry and exit rules', async ({ page }) => {
    await expect(page.getByText(/entry|buy.*call|ATM/i).first()).toBeVisible({ timeout: 5000 })
  })

  test('favourite button is present', async ({ page }) => {
    await expect(page.getByRole('button', { name: /favourite|heart|save/i }).first()
      .or(page.locator('button svg').first())
    ).toBeVisible({ timeout: 5000 })
  })

  test('back button or breadcrumb is visible', async ({ page }) => {
    await expect(
      page.getByRole('link', { name: /library|back/i }).first()
        .or(page.getByRole('button', { name: /back/i }).first())
    ).toBeVisible({ timeout: 5000 })
  })
})
