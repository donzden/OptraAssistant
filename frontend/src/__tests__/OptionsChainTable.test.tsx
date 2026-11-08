import { render, screen } from '@testing-library/react'
import OptionsChainTable from '@/components/OptionsChain/OptionsChainTable'
import type { OptionStrike } from '@/types/market'

function strike(overrides: Partial<OptionStrike>): OptionStrike {
  return {
    strike_price: 24000,
    is_atm: false,
    ce: { ltp: 120, open_interest: 50000, volume: 1000, iv: 15, greeks: { delta: 0.5, gamma: 0, theta: 0, vega: 0, rho: 0 } },
    pe: { ltp: 110, open_interest: 40000, volume: 900, iv: 16, greeks: { delta: -0.5, gamma: 0, theta: 0, vega: 0, rho: 0 } },
    ...overrides,
  }
}

describe('OptionsChainTable', () => {
  it('renders one row per strike, sorted descending by strike price', () => {
    const strikes = [strike({ strike_price: 24000 }), strike({ strike_price: 24100 }), strike({ strike_price: 23900 })]
    render(<OptionsChainTable strikes={strikes} spotPrice={24000} showGreeks={false} />)

    const rows = screen.getAllByRole('row').slice(1) // skip header row
    expect(rows).toHaveLength(3)
    expect(rows[0]).toHaveTextContent('24,100')
    expect(rows[1]).toHaveTextContent('24,000')
    expect(rows[2]).toHaveTextContent('23,900')
  })

  it('marks the ATM row and shows the ATM badge', () => {
    const strikes = [strike({ strike_price: 24000, is_atm: true })]
    render(<OptionsChainTable strikes={strikes} spotPrice={24000} showGreeks={false} />)
    expect(screen.getByText('ATM')).toBeInTheDocument()
  })

  it('hides delta columns when showGreeks is false', () => {
    render(<OptionsChainTable strikes={[strike({})]} spotPrice={24000} showGreeks={false} />)
    expect(screen.queryByText('Δ')).not.toBeInTheDocument()
  })

  it('shows delta columns when showGreeks is true', () => {
    render(<OptionsChainTable strikes={[strike({})]} spotPrice={24000} showGreeks />)
    expect(screen.getAllByText('Δ')).toHaveLength(2)
    expect(screen.getByText('0.500')).toBeInTheDocument() // CE delta
  })

  it('renders a dash for missing CE/PE data instead of crashing', () => {
    const strikes = [strike({ ce: null, pe: null })]
    render(<OptionsChainTable strikes={strikes} spotPrice={24000} showGreeks={false} />)
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('formats large open interest with K/M suffixes', () => {
    const strikes = [strike({ ce: { ltp: 1, open_interest: 1_500_000, volume: 2_500, iv: 15, greeks: null } })]
    render(<OptionsChainTable strikes={strikes} spotPrice={24000} showGreeks={false} />)
    expect(screen.getByText('1.50M')).toBeInTheDocument()
    expect(screen.getByText('2.5K')).toBeInTheDocument()
  })
})
