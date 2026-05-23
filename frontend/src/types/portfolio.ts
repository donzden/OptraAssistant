import type { GreeksData } from './market'
export type { GreeksData }

export type OptionType = 'CE' | 'PE'
export type PositionType = 'LONG' | 'SHORT'
export type PositionSource = 'MANUAL' | 'UPSTOX_IMPORT'

export interface Position {
  id: string
  userId: string
  symbol: string
  instrumentKey?: string | null
  strike: number
  expiry: string
  optionType: OptionType
  positionType: PositionType
  lots: number
  lotSize: number
  avgPrice: number
  currentPrice?: number | null
  source: PositionSource
  notes?: string | null
  createdAt: string
  updatedAt: string
}

export interface PositionGreeks extends GreeksData {
  position_id: string
  current_price: number
  pnl: number
}

export interface PortfolioGreeksResponse {
  positions: PositionGreeks[]
  aggregate: GreeksData
  total_pnl: number
}

export interface AddPositionPayload {
  symbol: string
  strike: number
  expiry: string
  optionType: OptionType
  positionType: PositionType
  lots: number
  lotSize: number
  avgPrice: number
  notes?: string
}
