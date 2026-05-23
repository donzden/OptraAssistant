export type StrategyCategory = 'DIRECTIONAL' | 'NON_DIRECTIONAL' | 'VOLATILITY'
export type StrategyType = 'DEBIT' | 'CREDIT' | 'VARIES'
export type IVLevel = 'LOW' | 'LOW_NORMAL' | 'NORMAL' | 'HIGH_NORMAL' | 'HIGH'
export type RiskLevel = 'CONSERVATIVE' | 'MODERATE' | 'AGGRESSIVE'
export type Outlook = 'BULLISH' | 'BEARISH' | 'NEUTRAL'

export interface StrategyLeg {
  type: 'BUY' | 'SELL'
  optionType: 'CE' | 'PE'
  strikeOffset: number
  lots: number
  expiry?: 'near' | 'far'
}

export interface StrategyRules {
  entry: string
  exit: string
  strike_selection: string
  delta: string
  vega: string
  theta: string
  max_profit: string
  max_loss: string
}

export interface StrategyConditions {
  iv_levels: IVLevel[]
  outlook: Outlook[]
  dte_min: number | null
  dte_max: number | null
  zone: string
}

export interface Strategy {
  id: string
  name: string
  category: StrategyCategory
  type: StrategyType
  description: string
  outlook: Outlook[]
  ivLevels: IVLevel[]
  dteMin: number | null
  dteMax: number | null
  riskLevel: RiskLevel
  legs: StrategyLeg[]
  conditions: StrategyConditions
  rules: StrategyRules
  source: string
  isFavourite?: boolean
  createdAt: string
  updatedAt: string
}

export interface ConditionCheck {
  passed: boolean
  score: number
  max: number
  reason: string
}

export interface ScoredStrategy {
  strategy: Strategy
  score: number
  explanation?: string
  condition_checks: {
    iv_match: ConditionCheck
    trend_match: ConditionCheck
    dte_match: ConditionCheck
    risk_match: ConditionCheck
  }
}

export interface MarketSignal {
  instrument: string
  spot_price: number
  trend: 'BULLISH' | 'BEARISH' | 'SIDEWAYS'
  iv_regime: IVLevel
  iv_rank: number
  iv_percentile: number
  vix: number
  vix_regime: 'LOW_VOL' | 'MODERATE' | 'HIGH_VOL' | 'EXTREME'
  pcr: number
  adx: number
  market_phase: 'TRENDING' | 'RANGE_BOUND'
  dte_buckets: string[]
  last_updated: string
  is_mock: boolean
}

export interface RecommendResponse {
  market_signal: MarketSignal
  ranked: ScoredStrategy[]
  total: number
}
