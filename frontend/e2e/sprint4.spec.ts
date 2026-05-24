/**
 * Sprint 4 E2E tests — Strategy Builder, My Strategies, Watchlist
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

const MOCK_CHAIN = {
  instrument: 'NIFTY',
  expiry: '2024-12-26',
  spot_price: 24000,
  atm_strike: 24000,
  is_mock: true,
  strikes: [
    {
      strike_price: 23900,
      is_atm: false,
      ce: { ltp: 200, iv: 0.15, greeks: { delta: 0.6, gamma: 0.001, theta: -5, vega: 10 } },
      pe: { ltp: 100, iv: 0.16, greeks: { delta: -0.4, gamma: 0.001, theta: -4, vega: 9 } },
    },
    {
      strike_price: 24000,
      is_atm: true,
      ce: { ltp: 150, iv: 0.14, greeks: { delta: 0.5, gamma: 0.002, theta: -6, vega: 12 } },
      pe: { ltp: 150, iv: 0.14, greeks: { delta: -0.5, gamma: 0.002, theta: -6, vega: 12 } },
    },
    {
      strike_price: 24100,
      is_atm: false,
      ce: { ltp: 100, iv: 0.13, greeks: { delta: 0.4, gamma: 0.001, theta: -5, vega: 11 } },
      pe: { ltp: 200, iv: 0.15, greeks: { delta: -0.6, gamma: 0.001, theta: -5, vega: 10 } },
    },
  ],
}

const MOCK_STRATEGY_SAVED = {
  id: 'user-strat-1',
  userId: 'user-1',
  name: 'My Bull Call Spread',
  description: 'Custom bull call spread',
  category: 'DIRECTIONAL',
  type: 'DEBIT',
  riskLevel: 'MODERATE',
  outlook: ['BULLISH'],
  ivLevels: ['LOW_NORMAL'],
  legs: [
    { type: 'BUY', optionType: 'CE', strike: 24000, lots: 1, premium: 150 },
    { type: 'SELL', optionType: 'CE', strike: 24100, lots: 1, premium: 100 },
  ],
  notes: '',
  tags: [],
  isTemplate: false,
  sourceStrategyId: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}

const MOCK_STRATEGY_COPY = {
  ...MOCK_STRATEGY_SAVED,
  id: 'user-strat-2',
  name: 'My Bull Call Spread (copy)',
}

const MOCK_WATCHLIST_ITEM = {
  id: 'watch-1',
  userId: 'user-1',
  strategyId: 'strat-1',
  notes: '',
  alertThreshold: 75,
  alertEnabled: false,
  lastMatchPct: 85,
  lastCheckedAt: new Date().toISOString(),
  strategy: {
    id: 'strat-1',
    name: 'Long Call',
    description: 'Buy a call option',
    category: 'DIRECTIONAL',
    type: 'DEBIT',
    riskLevel: 'MODERATE',
    outlook: ['BULLISH'],
    ivLevels: ['LOW_NORMAL'],
    legs: [{ type: 'BUY', optionType: 'CE', strike: 24000, lots: 1, premium: 150 }],
  },
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

async function mockBaseApis(page: Page) {
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({ status: 200, json: MOCK_USER }),
  )
  await page.route('**/api/v1/auth/refresh', (route) =>
    route.fulfill({ status: 200, json: { accessToken: 'mock-jwt' } }),
  )
}

async function mockBuilderApis(page: Page) {
  await mockBaseApis(page)
  await page.route('**/api/v1/market/expiries/**', (route) =>
    route.fulfill({ status: 200, json: ['2024-12-26', '2025-01-02'] }),
  )
  await page.route('**/api/v1/market/chain/**', (route) =>
    route.fulfill({ status: 200, json: MOCK_CHAIN }),
  )
  await page.route('**/api/v1/strategies**', (route) =>
    route.fulfill({ status: 200, json: [] }),
  )
  await page.route('**/api/v1/my-strategies', (route) => {
    if (route.request().method() === 'POST')
      return route.fulfill({ status: 201, json: MOCK_STRATEGY_SAVED })
    return route.fulfill({ status: 200, json: [] })
  })
  await page.route('**/api/v1/my-strategies/**', (route) =>
    route.fulfill({ status: 200, json: MOCK_STRATEGY_SAVED }),
  )
}

// ─── Strategy Builder — basic rendering ──────────────────────────────────────

test.describe('Strategy Builder page', () => {
  test.beforeEach(async ({ page }) => {
    await mockBuilderApis(page)
    await loginAs(page)
    await page.goto('/builder')
  })

  test('page heading is visible', async ({ page }) => {
    await expect(page.getByText('Strategy Builder')).toBeVisible({ timeout: 5000 })
  })

  test('instrument selector buttons are visible', async ({ page }) => {
    for (const ins of ['NIFTY', 'BANKNIFTY', 'FINNIFTY']) {
      await expect(page.getByRole('button', { name: ins, exact: true })).toBeVisible()
    }
  })

  test('Add Leg button is visible', async ({ page }) => {
    await expect(page.getByRole('button', { name: /add leg/i })).toBeVisible()
  })

  test('Save Strategy button is visible', async ({ page }) => {
    await expect(page.getByRole('button', { name: /save strategy/i })).toBeVisible()
  })

  test('Load Template button is visible', async ({ page }) => {
    await expect(page.getByRole('button', { name: /load template/i })).toBeVisible()
  })

  test('empty state is shown when no legs added', async ({ page }) => {
    await expect(page.getByText(/no legs added/i)).toBeVisible({ timeout: 5000 })
  })
})

// ─── Strategy Builder — add legs → payoff diagram renders ────────────────────

test.describe('Strategy Builder — legs and payoff', () => {
  test.beforeEach(async ({ page }) => {
    await mockBuilderApis(page)
    await loginAs(page)
    await page.goto('/builder')
  })

  test('adding a leg removes the empty state', async ({ page }) => {
    await page.getByRole('button', { name: /add leg/i }).click()
    await expect(page.getByText(/no legs added/i)).not.toBeVisible()
  })

  test('two legs show up in the leg list', async ({ page }) => {
    await page.getByRole('button', { name: /add leg/i }).click()
    await page.getByRole('button', { name: /add leg/i }).click()
    // Two leg rows — each has a BUY/SELL toggle
    const buyButtons = page.getByRole('button', { name: 'BUY', exact: true })
    await expect(buyButtons).toHaveCount(2, { timeout: 5000 })
  })

  test('payoff chart SVG renders after legs with premium are set', async ({ page }) => {
    // Add a leg and fill in premium manually (no chain needed for chart to appear)
    await page.getByRole('button', { name: /add leg/i }).click()
    // Fill premium field
    const premInput = page.locator('input[placeholder="Prem"]').first()
    await premInput.fill('150')
    // Chart should appear — look for recharts SVG
    await expect(
      page.locator('svg, [class*="recharts"]').first()
    ).toBeVisible({ timeout: 5000 })
  })

  test('Net Greeks panel appears when legs are present', async ({ page }) => {
    await page.getByRole('button', { name: /add leg/i }).click()
    await expect(page.getByText('Net Greeks')).toBeVisible({ timeout: 5000 })
  })

  test('Add Leg counter updates to show (1/6) after first add', async ({ page }) => {
    await page.getByRole('button', { name: /add leg/i }).click()
    await expect(page.getByRole('button', { name: /add leg.*1\/6/i })).toBeVisible({ timeout: 3000 })
  })
})

// ─── Strategy Builder — save modal ───────────────────────────────────────────

test.describe('Strategy Builder — save flow', () => {
  test.beforeEach(async ({ page }) => {
    await mockBuilderApis(page)
    await loginAs(page)
    await page.goto('/builder')
  })

  test('Save Strategy without legs shows error toast', async ({ page }) => {
    await page.getByRole('button', { name: /save strategy/i }).click()
    await expect(page.getByText(/add at least one leg/i)).toBeVisible({ timeout: 5000 })
  })

  test('Save modal opens after adding a leg', async ({ page }) => {
    await page.getByRole('button', { name: /add leg/i }).click()
    await page.getByRole('button', { name: /save strategy/i }).click()
    await expect(page.getByText('Save Strategy')).toBeVisible({ timeout: 5000 })
  })

  test('Save modal has Name field', async ({ page }) => {
    await page.getByRole('button', { name: /add leg/i }).click()
    await page.getByRole('button', { name: /save strategy/i }).click()
    await expect(page.locator('input').filter({ hasText: '' }).first()).toBeVisible({ timeout: 3000 })
    // Name label should be visible
    await expect(page.getByText(/name \*/i)).toBeVisible()
  })

  test('Save modal cancel closes the dialog', async ({ page }) => {
    await page.getByRole('button', { name: /add leg/i }).click()
    await page.getByRole('button', { name: /save strategy/i }).click()
    await expect(page.getByText('Save Strategy')).toBeVisible({ timeout: 5000 })
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByText('Save Strategy')).not.toBeVisible()
  })

  test('saving with a name calls POST and shows success', async ({ page }) => {
    await page.getByRole('button', { name: /add leg/i }).click()
    await page.getByRole('button', { name: /save strategy/i }).click()
    // Fill name
    const nameInput = page.locator('input[placeholder*="strategy"]').first()
    await nameInput.fill('My Test Strategy')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    // Should see success toast
    await expect(page.getByText(/saved|strategy saved/i)).toBeVisible({ timeout: 5000 })
  })
})

// ─── My Strategies page ───────────────────────────────────────────────────────

test.describe('My Strategies page', () => {
  test.beforeEach(async ({ page }) => {
    await mockBaseApis(page)
    await page.route('**/api/v1/my-strategies', (route) =>
      route.fulfill({ status: 200, json: [MOCK_STRATEGY_SAVED] }),
    )
    await page.route('**/api/v1/my-strategies/**', (route) => {
      const method = route.request().method()
      if (method === 'DELETE') return route.fulfill({ status: 200, json: { deleted: true } })
      if (method === 'POST') return route.fulfill({ status: 201, json: MOCK_STRATEGY_COPY })
      return route.fulfill({ status: 200, json: MOCK_STRATEGY_SAVED })
    })
    await loginAs(page)
    await page.goto('/my-strategies')
  })

  test('page heading is visible', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /my strategies/i })).toBeVisible({ timeout: 5000 })
  })

  test('shows saved strategy name', async ({ page }) => {
    await expect(page.getByText('My Bull Call Spread')).toBeVisible({ timeout: 5000 })
  })

  test('shows strategy leg count', async ({ page }) => {
    await expect(page.getByText(/2 legs/i)).toBeVisible({ timeout: 5000 })
  })

  test('shows 1 saved strategy count in subtitle', async ({ page }) => {
    await expect(page.getByText(/1 saved strategy/i)).toBeVisible({ timeout: 5000 })
  })

  test('"New Strategy" button navigates to builder', async ({ page }) => {
    await page.getByRole('button', { name: /new strategy/i }).click()
    await expect(page).toHaveURL(/\/builder/, { timeout: 5000 })
  })

  test('"Open in Builder" link navigates to builder with editId', async ({ page }) => {
    await page.getByText(/open in builder/i).click()
    await expect(page).toHaveURL(/\/builder\?editId=user-strat-1/, { timeout: 5000 })
  })

  test('delete button shows confirmation dialog', async ({ page }) => {
    await page.getByTitle('Delete').click()
    await expect(page.getByText(/delete this strategy/i)).toBeVisible({ timeout: 5000 })
  })

  test('confirmation dialog has Cancel and Delete buttons', async ({ page }) => {
    await page.getByTitle('Delete').click()
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Delete' })).toBeVisible()
  })

  test('cancel on confirmation closes the dialog', async ({ page }) => {
    await page.getByTitle('Delete').click()
    await expect(page.getByText(/delete this strategy/i)).toBeVisible({ timeout: 5000 })
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByText(/delete this strategy/i)).not.toBeVisible()
  })

  test('duplicate button triggers success toast', async ({ page }) => {
    await page.getByTitle('Duplicate').click()
    await expect(page.getByText(/duplicated|strategy duplicated/i)).toBeVisible({ timeout: 5000 })
  })
})

// ─── My Strategies — empty state ─────────────────────────────────────────────

test.describe('My Strategies — empty state', () => {
  test.beforeEach(async ({ page }) => {
    await mockBaseApis(page)
    await page.route('**/api/v1/my-strategies', (route) =>
      route.fulfill({ status: 200, json: [] }),
    )
    await loginAs(page)
    await page.goto('/my-strategies')
  })

  test('empty state message is shown', async ({ page }) => {
    await expect(page.getByText(/no saved strategies/i)).toBeVisible({ timeout: 5000 })
  })

  test('empty state CTA navigates to builder', async ({ page }) => {
    await page.getByRole('button', { name: /build your first strategy/i }).click()
    await expect(page).toHaveURL(/\/builder/, { timeout: 5000 })
  })
})

// ─── Watchlist page ───────────────────────────────────────────────────────────

test.describe('Watchlist page', () => {
  test.beforeEach(async ({ page }) => {
    await mockBaseApis(page)
    await page.route('**/api/v1/watchlist', (route) => {
      const method = route.request().method()
      if (method === 'POST') return route.fulfill({ status: 201, json: MOCK_WATCHLIST_ITEM })
      return route.fulfill({ status: 200, json: [MOCK_WATCHLIST_ITEM] })
    })
    await page.route('**/api/v1/watchlist/**', (route) => {
      const method = route.request().method()
      if (method === 'DELETE') return route.fulfill({ status: 200, json: { deleted: true } })
      return route.fulfill({ status: 200, json: MOCK_WATCHLIST_ITEM })
    })
    await loginAs(page)
    await page.goto('/watchlist')
  })

  test('page heading is visible', async ({ page }) => {
    await expect(page.getByText(/strategy watchlist/i)).toBeVisible({ timeout: 5000 })
  })

  test('shows strategy name in watchlist', async ({ page }) => {
    await expect(page.getByText('Long Call')).toBeVisible({ timeout: 5000 })
  })

  test('match % badge shows 85%', async ({ page }) => {
    await expect(page.getByText('85%')).toBeVisible({ timeout: 5000 })
  })

  test('summary bar shows High Match count', async ({ page }) => {
    await expect(page.getByText(/high match/i)).toBeVisible({ timeout: 5000 })
  })

  test('legend shows green/amber/red thresholds', async ({ page }) => {
    await expect(page.getByText(/≥80%/i)).toBeVisible({ timeout: 5000 })
    await expect(page.getByText(/50.79%|50–79%/i)).toBeVisible({ timeout: 5000 })
  })

  test('Refresh button is visible', async ({ page }) => {
    await expect(page.getByRole('button', { name: /refresh/i })).toBeVisible()
  })

  test('Add Strategy button is visible and navigates to library', async ({ page }) => {
    await page.getByRole('button', { name: /add strategy/i }).click()
    await expect(page).toHaveURL(/\/library/, { timeout: 5000 })
  })

  test('remove button triggers success toast', async ({ page }) => {
    // The trash/remove button on the watchlist row
    await page.getByTitle('Remove from watchlist').click()
    await expect(page.getByText(/removed from watchlist/i)).toBeVisible({ timeout: 5000 })
  })

  test('expand chevron reveals notes and threshold controls', async ({ page }) => {
    // Click the expand chevron
    const expandBtn = page.locator('button').filter({ has: page.locator('svg') }).last()
    // Find the ChevronDown button specifically — it's the second-to-last in the row
    const row = page.locator('.rounded-xl').first()
    const chevronBtn = row.locator('button').nth(1)
    await chevronBtn.click()
    await expect(page.getByText(/alert when match/i)).toBeVisible({ timeout: 5000 })
  })
})

// ─── Watchlist — empty state ──────────────────────────────────────────────────

test.describe('Watchlist — empty state', () => {
  test.beforeEach(async ({ page }) => {
    await mockBaseApis(page)
    await page.route('**/api/v1/watchlist', (route) =>
      route.fulfill({ status: 200, json: [] }),
    )
    await loginAs(page)
    await page.goto('/watchlist')
  })

  test('empty state message is shown', async ({ page }) => {
    await expect(page.getByText(/your watchlist is empty/i)).toBeVisible({ timeout: 5000 })
  })

  test('empty state CTA navigates to library', async ({ page }) => {
    await page.getByRole('button', { name: /browse strategy library/i }).click()
    await expect(page).toHaveURL(/\/library/, { timeout: 5000 })
  })
})

// ─── Strategy Builder loaded via editId ──────────────────────────────────────

test.describe('Strategy Builder — load existing strategy', () => {
  test.beforeEach(async ({ page }) => {
    await mockBuilderApis(page)
    await page.route('**/api/v1/my-strategies/user-strat-1', (route) =>
      route.fulfill({ status: 200, json: MOCK_STRATEGY_SAVED }),
    )
    await loginAs(page)
    await page.goto('/builder?editId=user-strat-1')
  })

  test('loads two legs from the saved strategy', async ({ page }) => {
    // Two legs should be present (from MOCK_STRATEGY_SAVED.legs)
    await expect(page.getByRole('button', { name: 'BUY', exact: true })).toHaveCount(1, { timeout: 5000 })
    await expect(page.getByRole('button', { name: 'SELL', exact: true })).toHaveCount(1, { timeout: 5000 })
  })

  test('CE option type buttons are visible for loaded legs', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'CE', exact: true }).first()).toBeVisible({ timeout: 5000 })
  })
})
