import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AddPositionModal from '@/components/Portfolio/AddPositionModal'
import { addPosition } from '@/api/portfolio'

jest.mock('@/api/portfolio', () => ({
  addPosition: jest.fn(),
}))

jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: { success: jest.fn(), error: jest.fn() },
}))

function fillValidForm() {
  fireEvent.change(screen.getByPlaceholderText('22000'), { target: { value: '24000' } })
  const expiryInput = document.querySelector('input[type="date"]') as HTMLInputElement
  fireEvent.change(expiryInput, { target: { value: '2026-05-29' } })
  fireEvent.change(screen.getByPlaceholderText('150.00'), { target: { value: '120' } })
}

describe('AddPositionModal', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('auto-fills lot size when the symbol changes', async () => {
    render(<AddPositionModal onClose={jest.fn()} onAdded={jest.fn()} />)
    const symbolSelect = screen.getByRole('combobox') as HTMLSelectElement
    const lotSizeInput = screen.getByText('Lot Size').nextElementSibling as HTMLInputElement

    expect(lotSizeInput.value).toBe('25') // NIFTY default

    await userEvent.selectOptions(symbolSelect, 'BANKNIFTY')
    expect(lotSizeInput.value).toBe('15')
  })

  it('shows a validation error for a non-positive strike', async () => {
    render(<AddPositionModal onClose={jest.fn()} onAdded={jest.fn()} />)
    fireEvent.change(screen.getByPlaceholderText('22000'), { target: { value: '-100' } })
    fireEvent.change(screen.getByPlaceholderText('150.00'), { target: { value: '120' } })
    const expiryInput = document.querySelector('input[type="date"]') as HTMLInputElement
    fireEvent.change(expiryInput, { target: { value: '2026-05-29' } })

    fireEvent.click(screen.getByRole('button', { name: 'Add Position' }))

    await waitFor(() => expect(screen.getByText('Strike must be positive')).toBeInTheDocument())
    expect(addPosition).not.toHaveBeenCalled()
  })

  it('submits the form and calls onAdded + onClose on success', async () => {
    (addPosition as jest.Mock).mockResolvedValue({})
    const onAdded = jest.fn()
    const onClose = jest.fn()
    render(<AddPositionModal onClose={onClose} onAdded={onAdded} />)

    fillValidForm()
    fireEvent.click(screen.getByRole('button', { name: 'Add Position' }))

    await waitFor(() => expect(addPosition).toHaveBeenCalled())
    expect(onAdded).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('does not close the modal when the add request fails', async () => {
    (addPosition as jest.Mock).mockRejectedValue(new Error('server error'))
    const onClose = jest.fn()
    render(<AddPositionModal onClose={onClose} onAdded={jest.fn()} />)

    fillValidForm()
    fireEvent.click(screen.getByRole('button', { name: 'Add Position' }))

    await waitFor(() => expect(addPosition).toHaveBeenCalled())
    expect(onClose).not.toHaveBeenCalled()
  })

  it('calls onClose when Cancel is clicked without submitting', () => {
    const onClose = jest.fn()
    render(<AddPositionModal onClose={onClose} onAdded={jest.fn()} />)
    fireEvent.click(screen.getByText('Cancel'))
    expect(onClose).toHaveBeenCalled()
    expect(addPosition).not.toHaveBeenCalled()
  })
})
