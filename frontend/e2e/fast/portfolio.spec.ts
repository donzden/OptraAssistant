import { test, expect } from '@playwright/test'
import { mockAuth, jsonRoute } from './helpers'

const POSITION = {
  id: 'p1', userId: 'user-fast-1', symbol: 'NIFTY', strike: 24000, expiry: '2026-05-29',
  optionType: 'CE', positionType: 'SHORT', lots: 1, lotSize: 50, avgPrice: 120,
}

test.beforeEach(async ({ page }) => {
  await mockAuth(page)
})

test('shows the empty state when there are no positions', async ({ page }) => {
  await jsonRoute(page, '**/api/v1/portfolio/positions', [])
  await page.goto('/portfolio')
  await expect(page.getByText('No positions yet — use Add Position to get started')).toBeVisible()
})

test('renders a position row and allows deleting it', async ({ page }) => {
  await jsonRoute(page, '**/api/v1/portfolio/positions', [POSITION])
  await jsonRoute(page, '**/api/v1/portfolio/greeks', {
    positions: [{ position_id: 'p1', delta: -0.3, gamma: 0.001, theta: 40, vega: 5, rho: 0.5, current_price: 100, pnl: 500 }],
    aggregate: { delta: -0.3, gamma: 0.001, theta: 40, vega: 5, rho: 0.5 },
    total_pnl: 500,
  })
  let deleteCalled = false
  await page.route('**/api/v1/portfolio/positions/p1', (route) => {
    deleteCalled = true
    route.fulfill({ json: { message: 'Position deleted' } })
  })

  await page.goto('/portfolio')
  await expect(page.getByText('24,000')).toBeVisible()
  await expect(page.getByText('1 position')).toBeVisible()

  await page.locator('tbody tr').hover()
  await page.locator('tbody tr button').click()
  await expect.poll(() => deleteCalled).toBe(true)
})

test('opens Add Position modal and submits a new position', async ({ page }) => {
  await jsonRoute(page, '**/api/v1/portfolio/positions', [])
  let createdBody: unknown = null
  await page.route('**/api/v1/portfolio/positions', (route) => {
    if (route.request().method() === 'POST') {
      createdBody = route.request().postDataJSON()
      return route.fulfill({ status: 201, json: { id: 'new-1', ...(createdBody as object) } })
    }
    return route.fulfill({ json: [] })
  })

  await page.goto('/portfolio')
  await page.getByRole('button', { name: 'Add Position' }).first().click()

  await page.getByPlaceholder('22000').fill('24000')
  await page.locator('input[type="date"]').fill('2026-05-29')
  await page.getByPlaceholder('150.00').fill('120')
  await page.locator('form').getByRole('button', { name: 'Add Position' }).click()

  await expect.poll(() => createdBody).not.toBeNull()
})
