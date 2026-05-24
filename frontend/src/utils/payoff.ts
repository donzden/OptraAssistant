export interface PayoffLeg {
  type: 'BUY' | 'SELL'
  optionType: 'CE' | 'PE'
  strike: number
  lots: number
  premium: number
}

export function computePayoffAtExpiry(legs: PayoffLeg[], spot: number, lotSize: number): number {
  return legs.reduce((sum, leg) => {
    const intrinsic =
      leg.optionType === 'CE' ? Math.max(0, spot - leg.strike) : Math.max(0, leg.strike - spot)
    const pnlPerUnit = leg.type === 'BUY' ? intrinsic - leg.premium : leg.premium - intrinsic
    return sum + pnlPerUnit * leg.lots * lotSize
  }, 0)
}

export function findBreakEvens(legs: PayoffLeg[], spotPrice: number, lotSize: number): number[] {
  const points = Array.from({ length: 201 }, (_, i) => {
    const s = Math.round(spotPrice * (0.8 + i * 0.002))
    return { price: s, pnl: computePayoffAtExpiry(legs, s, lotSize) }
  })

  const bes: number[] = []
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]
    const curr = points[i]
    if (Math.sign(prev.pnl) !== Math.sign(curr.pnl) && prev.pnl !== 0 && curr.pnl !== 0) {
      const be = prev.price + (0 - prev.pnl) * (curr.price - prev.price) / (curr.pnl - prev.pnl)
      bes.push(Math.round(be))
    }
  }
  return bes
}
