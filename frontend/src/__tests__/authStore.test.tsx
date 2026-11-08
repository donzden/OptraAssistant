import { useAuthStore } from '@/store/authStore'
import type { User } from '@/types'

const MOCK_USER: User = {
  id: 'user-1',
  name: 'Test User',
  email: 'test@optra.dev',
  emailVerified: true,
  phoneVerified: false,
  role: 'USER',
  riskAppetite: 'MODERATE',
  preferredInstruments: ['NIFTY'],
  defaultLotSize: 1,
  createdAt: new Date().toISOString(),
}

beforeEach(() => {
  useAuthStore.setState({ user: null, isAuthenticated: false })
})

describe('authStore', () => {
  it('starts logged out', () => {
    const state = useAuthStore.getState()
    expect(state.user).toBeNull()
    expect(state.isAuthenticated).toBe(false)
  })

  it('setUser logs the user in and marks isAuthenticated', () => {
    useAuthStore.getState().setUser(MOCK_USER)
    const state = useAuthStore.getState()
    expect(state.user).toEqual(MOCK_USER)
    expect(state.isAuthenticated).toBe(true)
  })

  it('setUser(null) logs the user out', () => {
    useAuthStore.getState().setUser(MOCK_USER)
    useAuthStore.getState().setUser(null)
    const state = useAuthStore.getState()
    expect(state.user).toBeNull()
    expect(state.isAuthenticated).toBe(false)
  })

  it('logout clears user and isAuthenticated', () => {
    useAuthStore.getState().setUser(MOCK_USER)
    useAuthStore.getState().logout()
    const state = useAuthStore.getState()
    expect(state.user).toBeNull()
    expect(state.isAuthenticated).toBe(false)
  })

  it('role-based admin check reflects the stored user', () => {
    useAuthStore.getState().setUser({ ...MOCK_USER, role: 'ADMIN' })
    expect(useAuthStore.getState().user?.role).toBe('ADMIN')
  })
})
