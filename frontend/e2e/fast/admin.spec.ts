import { test, expect } from '@playwright/test'
import { mockAuth, jsonRoute, MOCK_USER, MOCK_ADMIN } from './helpers'

test('redirects a non-admin user away from /admin', async ({ page }) => {
  await mockAuth(page, MOCK_USER)
  await page.goto('/admin')
  await expect(page).toHaveURL(/\/dashboard/)
})

test('shows the admin dashboard for an admin user', async ({ page }) => {
  await mockAuth(page, MOCK_ADMIN)
  await jsonRoute(page, '**/api/v1/admin/stats', { totalUsers: 42, activeUsers: 30, pendingUsers: 10, lockedUsers: 2 })
  await jsonRoute(page, '**/api/v1/admin/users*', {
    data: [{ id: 'u1', name: 'Alice', email: 'alice@x.com', role: 'USER', status: 'ACTIVE', emailVerified: true, phoneVerified: false, riskAppetite: 'MODERATE', createdAt: new Date().toISOString() }],
    total: 1, page: 1, limit: 20,
  })

  await page.goto('/admin')
  await expect(page).toHaveURL(/\/admin/)
  await expect(page.getByText('42')).toBeVisible()
  await expect(page.getByText('Alice', { exact: true })).toBeVisible()
})
