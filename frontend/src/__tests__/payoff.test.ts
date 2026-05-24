/**
 * OP-43: Unit tests for payoff calculator and break-even solver.
 * Covers Bull Call Spread, Iron Condor, Strangle, Straddle, Butterfly.
 */
import { computePayoffAtExpiry, findBreakEvens, type PayoffLeg } from '../utils/payoff'

const LOT_SIZE = 50

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pnl(legs: PayoffLeg[], spot: number) {
  return computePayoffAtExpiry(legs, spot, LOT_SIZE)
}

// ─── Bull Call Spread ─────────────────────────────────────────────────────────
// BUY CE @ 24000 prem=300, SELL CE @ 24500 prem=100  (net debit = 200/unit)
// Max loss = -200 * 50 = -10,000   Max profit = 300 * 50 = +15,000
// Break-even = 24200

describe('Bull Call Spread', () => {
  const legs: PayoffLeg[] = [
    { type: 'BUY',  optionType: 'CE', strike: 24000, lots: 1, premium: 300 },
    { type: 'SELL', optionType: 'CE', strike: 24500, lots: 1, premium: 100 },
  ]

  test('max loss at spot well below lower strike', () => {
    expect(pnl(legs, 23000)).toBe(-10_000)
  })

  test('max loss at lower strike', () => {
    expect(pnl(legs, 24000)).toBe(-10_000)
  })

  test('max profit at upper strike', () => {
    expect(pnl(legs, 24500)).toBe(15_000)
  })

  test('max profit is capped above upper strike', () => {
    expect(pnl(legs, 25000)).toBe(15_000)
  })

  test('P&L at break-even spot is ~zero', () => {
    // spot = 24200 → BUY CE: (200-300)=-100, SELL CE: (100-0)=100 → 0
    expect(pnl(legs, 24200)).toBe(0)
  })

  test('break-even point found at 24200', () => {
    const bes = findBreakEvens(legs, 24250, LOT_SIZE)
    expect(bes.length).toBe(1)
    expect(bes[0]).toBeGreaterThanOrEqual(24180)
    expect(bes[0]).toBeLessThanOrEqual(24220)
  })

  test('P&L is between max-loss and max-profit at mid spot', () => {
    const mid = pnl(legs, 24300)
    expect(mid).toBeGreaterThan(-10_000)
    expect(mid).toBeLessThan(15_000)
  })
})

// ─── Iron Condor ──────────────────────────────────────────────────────────────
// BUY PE @23500 p=80, SELL PE @23800 p=120, SELL CE @24200 p=100, BUY CE @24500 p=70
// Net credit = (120-80)+(100-70) = 70/unit  Max profit = 70*50 = +3,500
// Max loss at wings = -(300-70) = -230/unit = -11,500

describe('Iron Condor', () => {
  const legs: PayoffLeg[] = [
    { type: 'BUY',  optionType: 'PE', strike: 23500, lots: 1, premium: 80  },
    { type: 'SELL', optionType: 'PE', strike: 23800, lots: 1, premium: 120 },
    { type: 'SELL', optionType: 'CE', strike: 24200, lots: 1, premium: 100 },
    { type: 'BUY',  optionType: 'CE', strike: 24500, lots: 1, premium: 70  },
  ]

  test('max profit at ATM (inside tent)', () => {
    expect(pnl(legs, 24000)).toBe(3_500)
  })

  test('max loss below lower put wing', () => {
    expect(pnl(legs, 23000)).toBe(-11_500)
  })

  test('max loss above upper call wing', () => {
    expect(pnl(legs, 25000)).toBe(-11_500)
  })

  test('P&L transitions from loss to profit as spot rises through put side', () => {
    const loss = pnl(legs, 23500)
    const profit = pnl(legs, 24000)
    expect(loss).toBeLessThan(profit)
  })

  test('two break-evens exist', () => {
    const bes = findBreakEvens(legs, 24000, LOT_SIZE)
    expect(bes.length).toBe(2)
    expect(bes[0]).toBeLessThan(24000)
    expect(bes[1]).toBeGreaterThan(24000)
  })
})

// ─── Strangle ─────────────────────────────────────────────────────────────────
// BUY CE @24500 p=200, BUY PE @24000 p=150  (net debit = 350/unit)
// Max loss = -350*50 = -17,500  (in zone between puts)
// Upper BE ≈ 24500+350=24850, Lower BE ≈ 24000-350=23650

describe('Strangle', () => {
  const legs: PayoffLeg[] = [
    { type: 'BUY', optionType: 'CE', strike: 24500, lots: 1, premium: 200 },
    { type: 'BUY', optionType: 'PE', strike: 24000, lots: 1, premium: 150 },
  ]

  test('max loss between the two strikes', () => {
    expect(pnl(legs, 24250)).toBe(-17_500)
  })

  test('max loss at the put strike', () => {
    expect(pnl(legs, 24000)).toBe(-17_500)
  })

  test('max loss at the call strike', () => {
    expect(pnl(legs, 24500)).toBe(-17_500)
  })

  test('profit above upper break-even', () => {
    expect(pnl(legs, 24900)).toBeGreaterThan(0)
  })

  test('profit below lower break-even', () => {
    expect(pnl(legs, 23600)).toBeGreaterThan(0)
  })

  test('two break-evens found', () => {
    const bes = findBreakEvens(legs, 24250, LOT_SIZE)
    expect(bes.length).toBe(2)
    expect(bes[0]).toBeLessThan(24250)
    expect(bes[1]).toBeGreaterThan(24250)
  })
})

// ─── Straddle ─────────────────────────────────────────────────────────────────
// BUY CE @24000 p=300, BUY PE @24000 p=250  (net debit = 550/unit)
// Max loss = -550*50 = -27,500  (at ATM)
// Upper BE = 24000+550=24550, Lower BE = 24000-550=23450

describe('Straddle', () => {
  const legs: PayoffLeg[] = [
    { type: 'BUY', optionType: 'CE', strike: 24000, lots: 1, premium: 300 },
    { type: 'BUY', optionType: 'PE', strike: 24000, lots: 1, premium: 250 },
  ]

  test('max loss at ATM', () => {
    expect(pnl(legs, 24000)).toBe(-27_500)
  })

  test('profit well above strike', () => {
    expect(pnl(legs, 24600)).toBeGreaterThan(0)
  })

  test('profit well below strike', () => {
    expect(pnl(legs, 23400)).toBeGreaterThan(0)
  })

  test('P&L at upper break-even is ~zero', () => {
    expect(pnl(legs, 24550)).toBe(0)
  })

  test('P&L at lower break-even is ~zero', () => {
    expect(pnl(legs, 23450)).toBe(0)
  })

  test('two break-evens found', () => {
    const bes = findBreakEvens(legs, 24000, LOT_SIZE)
    expect(bes.length).toBe(2)
    expect(bes[0]).toBeLessThan(24000)
    expect(bes[1]).toBeGreaterThan(24000)
  })
})

// ─── Butterfly (Long Call Butterfly) ─────────────────────────────────────────
// BUY CE @23500 p=600, SELL 2×CE @24000 p=350, BUY CE @24500 p=150
// Net debit = 600-700+150 = 50/unit  Max profit = 450*50 = +22,500 at center
// Max loss = -50*50 = -2,500

describe('Long Call Butterfly', () => {
  const legs: PayoffLeg[] = [
    { type: 'BUY',  optionType: 'CE', strike: 23500, lots: 1, premium: 600 },
    { type: 'SELL', optionType: 'CE', strike: 24000, lots: 2, premium: 350 },
    { type: 'BUY',  optionType: 'CE', strike: 24500, lots: 1, premium: 150 },
  ]

  test('max profit at center strike', () => {
    expect(pnl(legs, 24000)).toBe(22_500)
  })

  test('max loss below lower strike', () => {
    expect(pnl(legs, 23000)).toBe(-2_500)
  })

  test('max loss above upper strike', () => {
    expect(pnl(legs, 25000)).toBe(-2_500)
  })

  test('P&L rises from lower strike toward center', () => {
    expect(pnl(legs, 23750)).toBeGreaterThan(pnl(legs, 23500))
    expect(pnl(legs, 24000)).toBeGreaterThan(pnl(legs, 23750))
  })

  test('two break-evens exist', () => {
    const bes = findBreakEvens(legs, 24000, LOT_SIZE)
    expect(bes.length).toBe(2)
    expect(bes[0]).toBeGreaterThan(23500)
    expect(bes[0]).toBeLessThan(24000)
    expect(bes[1]).toBeGreaterThan(24000)
    expect(bes[1]).toBeLessThan(24500)
  })
})

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe('Edge cases', () => {
  test('empty legs returns zero P&L', () => {
    expect(pnl([], 24000)).toBe(0)
  })

  test('lots multiplier scales P&L linearly', () => {
    const single: PayoffLeg[] = [{ type: 'BUY', optionType: 'CE', strike: 24000, lots: 1, premium: 200 }]
    const double: PayoffLeg[] = [{ type: 'BUY', optionType: 'CE', strike: 24000, lots: 2, premium: 200 }]
    expect(pnl(double, 24500)).toBe(pnl(single, 24500) * 2)
  })

  test('SELL CE at-expiry is mirror of BUY CE', () => {
    const buy:  PayoffLeg[] = [{ type: 'BUY',  optionType: 'CE', strike: 24000, lots: 1, premium: 0 }]
    const sell: PayoffLeg[] = [{ type: 'SELL', optionType: 'CE', strike: 24000, lots: 1, premium: 0 }]
    expect(pnl(buy, 24500)).toBe(-pnl(sell, 24500))
  })

  test('findBreakEvens returns empty for all-positive strategy', () => {
    // SELL CE @24000 p=500. Break-even at 24500. Spot=5000 → range 4000-6000, all OTM → +500 always
    const legs: PayoffLeg[] = [{ type: 'SELL', optionType: 'CE', strike: 24000, lots: 1, premium: 500 }]
    const bes = findBreakEvens(legs, 5000, LOT_SIZE)
    expect(bes.length).toBe(0)
  })
})
