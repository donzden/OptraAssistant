import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ZerodhaConnectBanner from '@/components/Portfolio/UpstoxConnectBanner'
import { disconnectZerodha, importFromZerodha } from '@/api/portfolio'

jest.mock('@/api/portfolio', () => ({
  disconnectZerodha: jest.fn(),
  importFromZerodha: jest.fn(),
}))

jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: { success: jest.fn(), error: jest.fn(), loading: jest.fn(() => 'toast-id') },
}))

describe('UpstoxConnectBanner (Zerodha)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('shows the connect CTA when disconnected', () => {
    render(<ZerodhaConnectBanner connected={false} onStatusChange={jest.fn()} onImported={jest.fn()} />)
    expect(screen.getByText('Connect Zerodha')).toBeInTheDocument()
    expect(screen.queryByText('Zerodha connected')).not.toBeInTheDocument()
  })

  it('shows connected status with sync/disconnect actions when connected', () => {
    render(<ZerodhaConnectBanner connected={true} onStatusChange={jest.fn()} onImported={jest.fn()} />)
    expect(screen.getByText('Zerodha connected')).toBeInTheDocument()
    expect(screen.getByText('Sync positions')).toBeInTheDocument()
    expect(screen.getByText('Disconnect')).toBeInTheDocument()
  })

  it('calls disconnectZerodha and onStatusChange on Disconnect click', async () => {
    (disconnectZerodha as jest.Mock).mockResolvedValue(undefined)
    const onStatusChange = jest.fn()
    render(<ZerodhaConnectBanner connected={true} onStatusChange={onStatusChange} onImported={jest.fn()} />)

    fireEvent.click(screen.getByText('Disconnect'))

    await waitFor(() => expect(onStatusChange).toHaveBeenCalled())
    expect(disconnectZerodha).toHaveBeenCalledTimes(1)
  })

  it('calls importFromZerodha and onImported on Sync click', async () => {
    (importFromZerodha as jest.Mock).mockResolvedValue({ imported: 3, total: 5 })
    const onImported = jest.fn()
    render(<ZerodhaConnectBanner connected={true} onStatusChange={jest.fn()} onImported={onImported} />)

    fireEvent.click(screen.getByText('Sync positions'))

    await waitFor(() => expect(onImported).toHaveBeenCalled())
  })

  it('does not call onImported when the import request fails', async () => {
    (importFromZerodha as jest.Mock).mockRejectedValue(new Error('network error'))
    const onImported = jest.fn()
    render(<ZerodhaConnectBanner connected={true} onStatusChange={jest.fn()} onImported={onImported} />)

    fireEvent.click(screen.getByText('Sync positions'))

    await waitFor(() => expect(importFromZerodha).toHaveBeenCalled())
    expect(onImported).not.toHaveBeenCalled()
  })
})
