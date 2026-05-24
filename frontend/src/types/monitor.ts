export type LivePositionStatus = 'ACTIVE' | 'CLOSED'

export interface LivePositionLeg {
  symbol: string
  strike: number
  expiry: string
  optionType: 'CE' | 'PE'
  action: 'BUY' | 'SELL'
  lots: number
  lotSize: number
  entryPrice: number
}

export interface SnapshotLeg {
  symbol: string
  strike: number
  optionType: 'CE' | 'PE'
  action: 'BUY' | 'SELL'
  lots: number
  entryPrice: number
  ltp: number
  pnl: number
  delta: number
  theta: number
  ivChange: number
}

export interface Snapshot {
  legs: SnapshotLeg[]
  net_pnl: number
  net_delta: number
  net_theta: number
  net_gamma: number
  net_vega: number
  timestamp: string
}

export interface PnlPoint {
  timestamp: string
  pnl: number
}

export interface LivePosition {
  id: string
  userId: string
  strategyName: string
  instrument: string
  expiry: string
  legs: LivePositionLeg[]
  status: LivePositionStatus
  entryDate: string
  closedAt: string | null
  stopLossPct: number | null
  notes: string | null
  pnlHistory: PnlPoint[]
  userStrategyId: string | null
  createdAt: string
  updatedAt: string
  snapshot: Snapshot | null
}
