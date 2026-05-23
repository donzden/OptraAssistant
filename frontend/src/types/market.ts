export interface GreeksData {
  delta: number
  gamma: number
  theta: number
  vega: number
  rho: number
}

export interface OptionData {
  ltp: number | null
  open_interest: number | null
  volume: number | null
  iv: number | null
  bid?: number | null
  ask?: number | null
  greeks?: GreeksData | null
}

export interface OptionStrike {
  strike_price: number
  is_atm: boolean
  ce?: OptionData | null
  pe?: OptionData | null
}

export interface OptionsChainResponse {
  symbol: string
  expiry: string
  spot_price: number
  atm_strike: number
  iv_rank: number | null
  iv_percentile: number | null
  atm_iv: number | null
  pcr: number | null
  strikes: OptionStrike[]
  is_mock: boolean
}

export interface VixResponse {
  value: number
  change: number
  change_pct: number
  sentiment: 'LOW_VOL' | 'MODERATE' | 'HIGH_VOL' | 'EXTREME'
}

export interface MarketSentimentResponse {
  vix: VixResponse
  nifty_trend: 'BULLISH' | 'BEARISH' | 'SIDEWAYS'
  pcr: number
  recommended_stance: string
  is_mock: boolean
}
