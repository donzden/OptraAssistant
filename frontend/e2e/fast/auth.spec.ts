/**
 * Fast auth flow tests — mocked API, no sleeps, no real backend needed.
 */
import { test, expect } from '@playwright/test'
import { MOCK_USER } from './helpers'

test.describe('Login', () => {
  test('blocks submission for an invalid email via native HTML5 validation', async ({ page }) => {
    // type="email" triggers the browser's own constraint validation before React
    // ever sees the submit — so there's no login request and no app-rendered error.
    let loginRequested = false
    await page.route('**/api/v1/auth/login', (route) => {
      loginRequested = true
      return route.fulfill({ json: {} })
    })

    await page.goto('/login')
    const emailInput = page.getByPlaceholder('you@example.com')
    await emailInput.fill('not-an-email')
    await page.getByPlaceholder('••••••••').fill('whatever')
    await page.getByRole('button', { name: 'Sign in' }).click()

    await expect(page).toHaveURL(/\/login/)
    expect(loginRequested).toBe(false)
    expect(await emailInput.evaluate((el: HTMLInputElement) => el.validity.valid)).toBe(false)
  })

  test('logs in successfully and lands on the dashboard', async ({ page }) => {
    await page.route('**/api/v1/auth/login', (route) =>
      route.fulfill({ json: { accessToken: 'mock-jwt', user: MOCK_USER } }),
    )
    await page.route('**/api/v1/market/sentiment', (route) =>
      route.fulfill({ json: { vix: { value: 14, change: 0, change_pct: 0, sentiment: 'MODERATE' }, nifty_trend: 'SIDEWAYS', pcr: 1, recommended_stance: 'Balanced', is_mock: true } }),
    )
    await page.route('**/api/v1/strategies/recommend*', (route) =>
      route.fulfill({ json: { market_signal: {}, ranked: [], total: 0 } }),
    )
    await page.route('**/api/v1/portfolio/positions', (route) => route.fulfill({ json: [] }))
    await page.route('**/api/v1/watchlist*', (route) => route.fulfill({ json: [] }))

    await page.goto('/login')
    await page.getByPlaceholder('you@example.com').fill(MOCK_USER.email)
    await page.getByPlaceholder('••••••••').fill('whatever-password')
    await page.getByRole('button', { name: 'Sign in' }).click()

    await expect(page).toHaveURL(/\/dashboard/)
  })

  test('shows a toast and stays on the login page for wrong credentials', async ({ page }) => {
    await page.route('**/api/v1/auth/login', (route) =>
      route.fulfill({ status: 401, json: { message: 'Invalid email or password' } }),
    )
    let refreshRequested = false
    await page.route('**/api/v1/auth/refresh', (route) => {
      refreshRequested = true
      return route.fulfill({ status: 401, json: {} })
    })
    await page.goto('/login')
    await page.getByPlaceholder('you@example.com').fill(MOCK_USER.email)
    await page.getByPlaceholder('••••••••').fill('wrong-password')
    await page.getByRole('button', { name: 'Sign in' }).click()

    await expect(page.getByText('Invalid email or password')).toBeVisible()
    await expect(page).toHaveURL(/\/login/)
    expect(refreshRequested).toBe(false) // wrong password isn't an expired-token situation
  })
})

test.describe('Register', () => {
  test('rejects a weak password', async ({ page }) => {
    await page.goto('/register')
    await page.getByPlaceholder('Nilotpal Das').fill('Alice')
    await page.getByPlaceholder('you@example.com').fill('alice@x.com')
    const pwFields = page.getByPlaceholder('••••••••')
    await pwFields.nth(0).fill('weak')
    await pwFields.nth(1).fill('weak')
    await page.getByRole('button', { name: 'Create account' }).click()
    await expect(page.getByText('Minimum 8 characters')).toBeVisible()
  })

  test('registers and redirects to verify-email', async ({ page }) => {
    await page.route('**/api/v1/auth/register', (route) =>
      route.fulfill({ status: 201, json: { message: 'Account created' } }),
    )
    await page.goto('/register')
    await page.getByPlaceholder('Nilotpal Das').fill('Alice')
    await page.getByPlaceholder('you@example.com').fill('alice@x.com')
    const pwFields = page.getByPlaceholder('••••••••')
    await pwFields.nth(0).fill('Str0ng!Pass')
    await pwFields.nth(1).fill('Str0ng!Pass')
    await page.getByRole('button', { name: 'Create account' }).click()

    await expect(page).toHaveURL(/verify-email/)
  })
})
