import { test, expect, type Page } from '@playwright/test'

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

/** Inject auth state into localStorage/sessionStorage so the app treats us as logged in. */
async function loginAs(page: Page, role: 'USER' | 'ADMIN' = 'USER') {
  const user = { ...MOCK_USER, role }
  await page.goto('/login')
  await page.evaluate((u) => {
    localStorage.setItem('optra-auth', JSON.stringify({
      state: { user: u, isAuthenticated: true },
      version: 0,
    }))
    sessionStorage.setItem('access_token', 'mock-jwt-token')
  }, user)
}

/** Intercept all /api/v1 requests with a default 200 response. */
async function mockApi(page: Page) {
  await page.route('**/api/v1/**', async (route) => {
    const url = route.request().url()
    const method = route.request().method()

    if (method === 'POST' && url.includes('/auth/register')) {
      return route.fulfill({ status: 201, json: { message: 'Account created. Please check your email for the OTP.' } })
    }
    if (method === 'POST' && url.includes('/auth/verify-email')) {
      return route.fulfill({ status: 200, json: { message: 'Email verified successfully' } })
    }
    if (method === 'POST' && url.includes('/auth/login')) {
      return route.fulfill({ status: 200, json: { accessToken: 'mock-jwt', user: MOCK_USER } })
    }
    if (method === 'POST' && url.includes('/auth/logout')) {
      return route.fulfill({ status: 200, json: { message: 'Logged out' } })
    }
    if (method === 'POST' && url.includes('/auth/refresh')) {
      return route.fulfill({ status: 200, json: { accessToken: 'mock-jwt' } })
    }
    if (method === 'GET' && url.includes('/auth/me')) {
      return route.fulfill({ status: 200, json: MOCK_USER })
    }
    if (method === 'POST' && url.includes('/auth/forgot-password')) {
      return route.fulfill({ status: 200, json: { message: 'If this email is registered, a reset link has been sent.' } })
    }
    if (method === 'POST' && url.includes('/auth/reset-password')) {
      return route.fulfill({ status: 200, json: { message: 'Password reset successfully' } })
    }
    if (method === 'POST' && url.includes('/auth/send-phone-otp')) {
      return route.fulfill({ status: 200, json: { message: 'OTP sent to your phone' } })
    }
    if (method === 'POST' && url.includes('/auth/verify-phone')) {
      return route.fulfill({ status: 200, json: { message: 'Phone verified successfully' } })
    }
    if (method === 'GET' && url.includes('/users/profile')) {
      return route.fulfill({ status: 200, json: { ...MOCK_USER, phoneVerified: true, phone: '9876543210' } })
    }

    // Default: pass through (or 200 for unknown API routes)
    return route.fulfill({ status: 200, json: {} })
  })
}

// ─── Basic page loads (smoke tests) ──────────────────────────────────────────

test.describe('Auth pages — smoke tests', () => {
  test('login page loads with sign in heading', async ({ page }) => {
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

  test('verify-email page shows 6 OTP input boxes', async ({ page }) => {
    await page.goto('/verify-email?email=test@example.com')
    const inputs = page.locator('input[maxlength="1"]')
    await expect(inputs).toHaveCount(6)
  })

  test('forgot-password page shows generic success message after submit', async ({ page }) => {
    await mockApi(page)
    await page.goto('/forgot-password')
    await page.fill('input[type="email"]', 'anyone@example.com')
    await page.click('button[type="submit"]')
    await expect(page.getByText(/check your email/i)).toBeVisible({ timeout: 5000 })
  })
})

// ─── Auth guard ───────────────────────────────────────────────────────────────

test.describe('Auth guard', () => {
  test('unauthenticated user is redirected from /dashboard to /login', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/login/)
  })

  test('authenticated user is redirected from /login to /dashboard', async ({ page }) => {
    await mockApi(page)
    await loginAs(page)
    await page.goto('/login')
    await expect(page).toHaveURL(/\/dashboard/)
  })
})

// ─── 404 page ─────────────────────────────────────────────────────────────────

test('404 page is shown for unknown routes', async ({ page }) => {
  await page.goto('/this-route-does-not-exist-at-all')
  // Not redirected to login (no auth guard on wildcard route)
  await expect(page.getByText(/404|not found/i)).toBeVisible()
})

// ─── Happy path: register → verify email → login → logout ─────────────────────

test.describe('Happy path', () => {
  test('register → verify email OTP → login → logout', async ({ page }) => {
    await mockApi(page)

    // 1. Register
    await page.goto('/register')
    await page.fill('input[name="name"]', 'Alice Example')
    await page.fill('input[name="email"]', 'alice@example.com')
    await page.fill('input[name="password"]', 'StrongPass1!')
    await page.click('button[type="submit"]')

    // 2. Redirected to verify-email
    await expect(page).toHaveURL(/\/verify-email/, { timeout: 5000 })
    const otpInputs = page.locator('input[maxlength="1"]')
    await expect(otpInputs).toHaveCount(6)

    // 3. Enter master OTP digits one by one
    for (let i = 0; i < 6; i++) {
      await otpInputs.nth(i).fill('2')
    }
    // Re-enter as 232323
    const digits = ['2', '3', '2', '3', '2', '3']
    for (let i = 0; i < 6; i++) {
      await otpInputs.nth(i).fill(digits[i])
    }
    await page.click('button[type="submit"]')

    // 4. Redirected to login
    await expect(page).toHaveURL(/\/login/, { timeout: 5000 })

    // 5. Login
    await page.fill('input[type="email"]', 'alice@example.com')
    await page.fill('input[type="password"]', 'StrongPass1!')
    await page.click('button[type="submit"]')

    // 6. Redirected to dashboard
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 5000 })

    // 7. Logout via the logout button in the top bar
    await page.click('[title="Logout"]')
    await expect(page).toHaveURL(/\/login/, { timeout: 5000 })
  })
})

// ─── Navigation: sidebar links accessible after login ─────────────────────────

test.describe('Navigation', () => {
  test('all sidebar nav links are visible after login', async ({ page }) => {
    await mockApi(page)
    await loginAs(page)
    await page.goto('/dashboard')

    const expectedLinks = [
      { label: 'Dashboard', href: '/dashboard' },
      { label: 'Options Chain', href: '/options-chain' },
      { label: 'Portfolio', href: '/portfolio' },
      { label: 'Recommender', href: '/strategies' },
      { label: 'Strategy Library', href: '/library' },
      { label: 'Builder', href: '/builder' },
      { label: 'My Strategies', href: '/my-strategies' },
      { label: 'Watchlist', href: '/watchlist' },
    ]

    for (const { href } of expectedLinks) {
      await expect(page.locator(`a[href="${href}"]`)).toBeVisible()
    }
  })

  test('each sidebar link navigates to its route', async ({ page }) => {
    await mockApi(page)
    await loginAs(page)
    await page.goto('/dashboard')

    await page.click('a[href="/portfolio"]')
    await expect(page).toHaveURL(/\/portfolio/)

    await page.click('a[href="/options-chain"]')
    await expect(page).toHaveURL(/\/options-chain/)
  })

  test('profile link navigates to /profile', async ({ page }) => {
    await mockApi(page)
    await loginAs(page)
    await page.goto('/dashboard')
    await page.click('a[href="/profile"]')
    await expect(page).toHaveURL(/\/profile/)
  })
})

// ─── Admin: non-admin redirected away from /admin ─────────────────────────────

test.describe('Admin access control', () => {
  test('non-admin navigating to /admin is redirected to /dashboard', async ({ page }) => {
    await mockApi(page)
    await loginAs(page, 'USER')
    await page.goto('/admin')
    // RequireAdmin renders <Navigate to="/dashboard" /> for non-admins
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 5000 })
  })

  test('admin user can access /admin', async ({ page }) => {
    await mockApi(page)
    await loginAs(page, 'ADMIN')
    await page.goto('/admin')
    await expect(page).toHaveURL(/\/admin/)
    await expect(page.getByRole('heading', { name: /admin/i })).toBeVisible()
  })

  test('admin link not visible in sidebar for non-admin users', async ({ page }) => {
    await mockApi(page)
    await loginAs(page, 'USER')
    await page.goto('/dashboard')
    await expect(page.locator('a[href="/admin"]')).not.toBeVisible()
  })
})

// ─── Phone OTP verification ───────────────────────────────────────────────────

test.describe('Phone OTP', () => {
  test('enter number → send OTP → enter master OTP → see verified badge', async ({ page }) => {
    await mockApi(page)

    // Login and go to profile
    await loginAs(page)
    await page.goto('/profile')

    // Fill phone number
    await page.fill('input[type="tel"]', '9876543210')
    await page.click('button:has-text("Send OTP")')

    // OTP input boxes should appear
    await expect(page.locator('input[maxlength="1"]')).toHaveCount(6, { timeout: 5000 })

    // Enter master OTP 232323
    const digits = ['2', '3', '2', '3', '2', '3']
    const otpInputs = page.locator('input[maxlength="1"]')
    for (let i = 0; i < 6; i++) {
      await otpInputs.nth(i).fill(digits[i])
    }

    // Mock the profile GET to return phoneVerified: true so the badge appears
    await page.route('**/api/v1/users/profile', (route) =>
      route.fulfill({ status: 200, json: { ...MOCK_USER, phoneVerified: true, phone: '9876543210' } })
    )

    await page.click('button:has-text("Verify")')

    // After verification, see the verified badge
    await expect(page.getByText(/verified/i)).toBeVisible({ timeout: 5000 })
  })
})

// ─── Forgot password full flow ─────────────────────────────────────────────────

test.describe('Forgot password', () => {
  test('forgot password → success message shown', async ({ page }) => {
    await mockApi(page)
    await page.goto('/forgot-password')
    await page.fill('input[type="email"]', 'user@example.com')
    await page.click('button[type="submit"]')
    await expect(page.getByText(/check your email/i)).toBeVisible({ timeout: 5000 })
  })

  test('reset password page accepts new password and redirects to login', async ({ page }) => {
    await mockApi(page)
    await page.goto('/reset-password?token=abc123')
    const passwordInputs = page.locator('input[type="password"]')
    await passwordInputs.nth(0).fill('NewPass1!')
    await passwordInputs.nth(1).fill('NewPass1!')
    await page.click('button[type="submit"]')
    // After successful reset, should redirect to login
    await expect(page).toHaveURL(/\/login/, { timeout: 5000 })
  })
})
