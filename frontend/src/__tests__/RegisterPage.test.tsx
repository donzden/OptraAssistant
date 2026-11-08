import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import RegisterPage from '@/pages/auth/RegisterPage'
import { authApi } from '@/api/auth'
import toast from 'react-hot-toast'

jest.mock('@/api/auth', () => ({
  authApi: { register: jest.fn() },
}))

const mockNavigate = jest.fn()
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}))

jest.mock('react-hot-toast', () => ({ __esModule: true, default: { error: jest.fn(), success: jest.fn() } }))

const toastMock = toast as unknown as { error: jest.Mock; success: jest.Mock }

function fillForm({ name = 'Alice', email = 'alice@x.com', password = 'Str0ng!Pass', confirm = password }: Partial<Record<string, string>> = {}) {
  fireEvent.change(screen.getByPlaceholderText('Nilotpal Das'), { target: { value: name } })
  fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: email } })
  const passwordFields = screen.getAllByPlaceholderText('••••••••')
  fireEvent.change(passwordFields[0], { target: { value: password } })
  fireEvent.change(passwordFields[1], { target: { value: confirm } })
}

describe('RegisterPage', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('rejects a weak password without calling the API', async () => {
    render(<MemoryRouter><RegisterPage /></MemoryRouter>)
    fillForm({ password: 'weak', confirm: 'weak' })
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))
    await waitFor(() => expect(screen.getByText('Minimum 8 characters')).toBeInTheDocument())
    expect(authApi.register).not.toHaveBeenCalled()
  })

  it('rejects mismatched confirm password', async () => {
    render(<MemoryRouter><RegisterPage /></MemoryRouter>)
    fillForm({ confirm: 'Different!Pass1' })
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))
    await waitFor(() => expect(screen.getByText('Passwords do not match')).toBeInTheDocument())
    expect(authApi.register).not.toHaveBeenCalled()
  })

  it('registers and navigates to verify-email on success', async () => {
    (authApi.register as jest.Mock).mockResolvedValue({})
    render(<MemoryRouter><RegisterPage /></MemoryRouter>)
    fillForm()
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))

    await waitFor(() => expect(authApi.register).toHaveBeenCalledWith({
      name: 'Alice', email: 'alice@x.com', password: 'Str0ng!Pass',
    }))
    expect(mockNavigate).toHaveBeenCalledWith('/verify-email?email=alice%40x.com')
  })

  it('shows an error toast and does not navigate when the email is already taken', async () => {
    (authApi.register as jest.Mock).mockRejectedValue({
      response: { data: { message: 'An account with this email already exists' } },
    })
    render(<MemoryRouter><RegisterPage /></MemoryRouter>)
    fillForm()
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))

    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith('An account with this email already exists'))
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('shows a live password strength label', () => {
    render(<MemoryRouter><RegisterPage /></MemoryRouter>)
    const passwordField = screen.getAllByPlaceholderText('••••••••')[0]
    fireEvent.change(passwordField, { target: { value: 'weak' } })
    expect(screen.getByText('Weak')).toBeInTheDocument()
    fireEvent.change(passwordField, { target: { value: 'VeryStrong!Pass123' } })
    expect(screen.getByText('Very Strong')).toBeInTheDocument()
  })
})
