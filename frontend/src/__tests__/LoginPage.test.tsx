import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import LoginPage from '@/pages/auth/LoginPage'
import { authApi } from '@/api/auth'
import { useAuthStore } from '@/store/authStore'

jest.mock('@/api/auth', () => ({
  authApi: { login: jest.fn() },
}))

const mockNavigate = jest.fn()
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}))

jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: { error: jest.fn(), success: jest.fn() },
}))

function fillAndSubmit(email: string, password: string) {
  fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: email } })
  fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: password } })
  // fireEvent.submit bypasses jsdom's native HTML5 constraint validation on type="email",
  // which would otherwise silently swallow the submit event before React's onSubmit runs.
  fireEvent.submit(screen.getByText('Sign in').closest('form')!)
}

describe('LoginPage', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    useAuthStore.setState({ user: null, isAuthenticated: false })
    sessionStorage.clear()
  })

  it('shows a validation error for an invalid email without calling the API', async () => {
    render(<MemoryRouter><LoginPage /></MemoryRouter>)
    fillAndSubmit('not-an-email', 'whatever')
    await waitFor(() => expect(screen.getByText('Enter a valid email')).toBeInTheDocument())
    expect(authApi.login).not.toHaveBeenCalled()
  })

  it('logs the user in, stores the access token, and navigates to the dashboard', async () => {
    (authApi.login as jest.Mock).mockResolvedValue({
      data: { accessToken: 'jwt-123', user: { id: 'u1', email: 'a@x.com', role: 'USER' } },
    })

    render(<MemoryRouter><LoginPage /></MemoryRouter>)
    fillAndSubmit('a@x.com', 'password123')

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/dashboard'))
    expect(sessionStorage.getItem('access_token')).toBe('jwt-123')
    expect(useAuthStore.getState().isAuthenticated).toBe(true)
  })

  it('redirects to verify-email when login fails with EMAIL_UNVERIFIED', async () => {
    (authApi.login as jest.Mock).mockRejectedValue({
      response: { status: 403, data: { message: 'Please verify', code: 'EMAIL_UNVERIFIED' } },
    })

    render(<MemoryRouter><LoginPage /></MemoryRouter>)
    fillAndSubmit('a@x.com', 'password123')

    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith('/verify-email?email=a%40x.com'),
    )
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
  })

  it('does not navigate on a generic login failure (e.g. wrong password)', async () => {
    (authApi.login as jest.Mock).mockRejectedValue({
      response: { status: 401, data: { message: 'Invalid email or password' } },
    })

    render(<MemoryRouter><LoginPage /></MemoryRouter>)
    fillAndSubmit('a@x.com', 'wrongpass')

    await waitFor(() => expect(authApi.login).toHaveBeenCalled())
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('toggles password visibility', () => {
    render(<MemoryRouter><LoginPage /></MemoryRouter>)
    const passwordInput = screen.getByPlaceholderText('••••••••') as HTMLInputElement
    expect(passwordInput.type).toBe('password')
    const toggleButton = document.querySelector('button[type="button"]') as HTMLButtonElement
    fireEvent.click(toggleButton)
    expect(passwordInput.type).toBe('text')
  })
})
