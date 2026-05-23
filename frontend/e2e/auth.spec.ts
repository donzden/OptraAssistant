import { test, expect } from '@playwright/test'

test.describe('Auth flow', () => {
  test('login page loads', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible()
  })

  test('register page shows password strength indicator', async ({ page }) => {
    await page.goto('/register')
    await page.fill('input[name="password"]', 'weak')
    await expect(page.getByText(/weak/i)).toBeVisible()
    await page.fill('input[name="password"]', 'StrongPass1!')
    await expect(page.getByText(/strong/i)).toBeVisible()
  })

  test('protected route redirects to login', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/login/)
  })

  test('verify-email page shows 6 OTP boxes', async ({ page }) => {
    await page.goto('/verify-email?email=test@example.com')
    const inputs = page.locator('input[maxlength="1"]')
    await expect(inputs).toHaveCount(6)
  })

  test('forgot password shows generic success message', async ({ page }) => {
    await page.goto('/forgot-password')
    await page.fill('input[type="email"]', 'notregistered@example.com')
    await page.click('button[type="submit"]')
    await expect(page.getByText(/check your email/i)).toBeVisible({ timeout: 5000 })
  })
})
