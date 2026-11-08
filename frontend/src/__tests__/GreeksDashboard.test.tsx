import { render, screen } from '@testing-library/react'
import GreeksDashboard from '@/components/Portfolio/GreeksDashboard'
import type { PortfolioGreeksResponse, Position } from '@/types/portfolio'

const GREEKS: PortfolioGreeksResponse = {
  aggregate: { delta: -0.456, gamma: 0.0012, theta: 85, vega: 12.3, rho: 1 },
  positions: [
    { position_id: 'p1', delta: -0.3, gamma: 0.001, theta: 40, vega: 5, rho: 0.5, current_price: 100, pnl: 500 },
    { position_id: 'p2', delta: -0.156, gamma: 0.0002, theta: 45, vega: 7.3, rho: 0.5, current_price: 80, pnl: -200 },
  ],
  total_pnl: 300,
}

const POSITIONS: Position[] = [
  { id: 'p1', userId: 'u1', symbol: 'NIFTY', strike: 24000, expiry: '2026-05-29', optionType: 'CE', positionType: 'SHORT', lots: 1, lotSize: 50 } as Position,
  { id: 'p2', userId: 'u1', symbol: 'NIFTY', strike: 23900, expiry: '2026-05-29', optionType: 'PE', positionType: 'SHORT', lots: 1, lotSize: 50 } as Position,
]

describe('GreeksDashboard', () => {
  it('renders the net delta, theta, vega, and total P&L summary cards', () => {
    render(<GreeksDashboard greeks={GREEKS} positions={POSITIONS} />)

    expect(screen.getByText('Net Delta')).toBeInTheDocument()
    expect(screen.getByText('-0.456')).toBeInTheDocument()

    expect(screen.getByText('Net Theta / day')).toBeInTheDocument()
    expect(screen.getByText('₹ 85')).toBeInTheDocument()

    expect(screen.getByText('Net Vega')).toBeInTheDocument()
    expect(screen.getByText('12.30')).toBeInTheDocument()

    expect(screen.getByText('Total P&L')).toBeInTheDocument()
    expect(screen.getByText('₹ 300')).toBeInTheDocument()
  })

  it('colors a negative value red via the leading minus sign', () => {
    render(<GreeksDashboard greeks={GREEKS} positions={POSITIONS} />)
    expect(screen.getByText('-0.456')).toHaveClass('text-red-400')
    expect(screen.getByText('12.30')).toHaveClass('text-emerald-400')
  })

  it('renders the chart section headers without crashing on zero-size jsdom containers', () => {
    render(<GreeksDashboard greeks={GREEKS} positions={POSITIONS} />)
    expect(screen.getByText('Greeks Risk Profile')).toBeInTheDocument()
    expect(screen.getByText('Delta by Position')).toBeInTheDocument()
  })

  it('handles an empty positions list without crashing', () => {
    render(<GreeksDashboard greeks={{ aggregate: { delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0 }, positions: [], total_pnl: 0 }} positions={[]} />)
    expect(screen.getByText('Total P&L')).toBeInTheDocument()
  })
})
