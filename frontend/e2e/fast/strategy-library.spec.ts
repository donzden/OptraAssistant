import { test, expect } from '@playwright/test'
import { mockAuth, jsonRoute } from './helpers'

const STRATEGIES = [
  {
    id: 's1', name: 'Iron Condor', category: 'NON_DIRECTIONAL', type: 'CREDIT',
    description: 'Sell OTM call and put spreads for range-bound income.',
    outlook: ['NEUTRAL'], ivLevels: ['HIGH'], dteMin: 7, dteMax: 21, riskLevel: 'AGGRESSIVE',
    legs: [], conditions: {}, rules: {}, source: 'seed', isFavourite: false, favouriteCount: 3,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  },
  {
    id: 's2', name: 'Call Calendar Spread', category: 'NON_DIRECTIONAL', type: 'DEBIT',
    description: 'Sell near-term call, buy far-term call at the same strike.',
    outlook: ['NEUTRAL'], ivLevels: ['LOW'], dteMin: 10, dteMax: 21, riskLevel: 'MODERATE',
    legs: [], conditions: {}, rules: {}, source: 'seed', isFavourite: false, favouriteCount: 0,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  },
]

test.beforeEach(async ({ page }) => {
  await mockAuth(page)
  await jsonRoute(page, '**/api/v1/strategies', STRATEGIES)
})

test('lists strategies from the library', async ({ page }) => {
  await page.goto('/library')
  await expect(page.getByText('Iron Condor')).toBeVisible()
  await expect(page.getByText('Call Calendar Spread')).toBeVisible()
})

test('search filters the list by name', async ({ page }) => {
  await page.goto('/library')
  await expect(page.getByText('Iron Condor')).toBeVisible()

  await page.getByPlaceholder('Search strategies…').fill('Calendar')
  await expect(page.getByText('Call Calendar Spread')).toBeVisible()
  await expect(page.getByText('Iron Condor')).not.toBeVisible()
})

test('toggling favourite calls the favourite endpoint', async ({ page }) => {
  let favouriteRequested = false
  await page.route('**/api/v1/strategies/s1/favourite', (route) => {
    favouriteRequested = true
    route.fulfill({ json: { isFavourite: true } })
  })

  await page.goto('/library')
  await expect(page.getByText('Iron Condor')).toBeVisible()

  const card = page.locator('div.rounded-xl.bg-surface-secondary', { hasText: 'Iron Condor' }).first()
  await card.getByRole('button').first().click()

  await expect.poll(() => favouriteRequested).toBe(true)
})
