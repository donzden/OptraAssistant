import { useState } from 'react'
import {
  HelpCircle, BookOpen, Lightbulb, TrendingUp,
  BarChart2, Activity, Shield, ChevronDown, ChevronRight,
} from 'lucide-react'
import clsx from 'clsx'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Strategy {
  name: string
  category: 'DIRECTIONAL' | 'NON_DIRECTIONAL' | 'VOLATILITY'
  type: 'DEBIT' | 'CREDIT' | 'VARIES'
  risk: 'CONSERVATIVE' | 'MODERATE' | 'AGGRESSIVE'
  bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'BOTH'
  outlook: string
  when: string
  howItWorks: string
  maxProfit: string
  maxLoss: string
  idealIv: string
  greeks: { gamma: string; theta: string; vega: string }
  entryRules: string[]
  exitRules: string[]
}

// ─── Strategy data ────────────────────────────────────────────────────────────

const STRATEGIES: Strategy[] = [
  {
    name: 'Long Call',
    category: 'DIRECTIONAL',
    type: 'DEBIT',
    risk: 'MODERATE',
    bias: 'BULLISH',
    outlook: 'Bullish',
    when: 'Strong uptrend, low IV, catalyst expected.',
    howItWorks: 'Buy one call option at or near the money. You pay a premium upfront and profit if the underlying rises beyond the breakeven (strike + premium paid).',
    maxProfit: 'Unlimited — the higher the underlying goes, the more you gain.',
    maxLoss: 'Limited to premium paid.',
    idealIv: 'Low to Normal — you want IV to expand after you buy.',
    greeks: {
      gamma: 'Positive — benefits from sharp moves; gamma accelerates gains as the option goes ITM.',
      theta: 'Negative — time decay works against you; avoid buying with < 21 DTE.',
      vega: 'Positive — profits from IV expansion after entry.',
    },
    entryRules: [
      'Spot is above the 20-day EMA and trending upward.',
      'IV Rank (IVR) is below 40 — buy options cheap.',
      'Choose an ATM or up to 1-strike OTM call.',
      'Target 30–45 DTE for a balanced theta/vega trade-off.',
    ],
    exitRules: [
      'Take profit at 50% of premium paid.',
      'Cut loss at 50% of premium paid.',
      'Close mechanically at 21 DTE regardless of P&L to avoid accelerated decay.',
    ],
  },
  {
    name: 'Long Put',
    category: 'DIRECTIONAL',
    type: 'DEBIT',
    risk: 'MODERATE',
    bias: 'BEARISH',
    outlook: 'Bearish',
    when: 'Expect a significant drop, low IV environment.',
    howItWorks: 'Buy one put option at or near the money. You profit if the underlying falls below the breakeven (strike − premium paid).',
    maxProfit: 'Strike minus premium (substantial but capped at zero price).',
    maxLoss: 'Limited to premium paid.',
    idealIv: 'Low to Normal — buy puts when IV is cheap.',
    greeks: {
      gamma: 'Positive — accelerating gains as the underlying falls.',
      theta: 'Negative — time decay hurts; avoid holding into final 21 DTE.',
      vega: 'Positive — benefits when VIX spikes or IV expands on a down-move.',
    },
    entryRules: [
      'Spot below the 20-day EMA; VIX rising or elevated.',
      'IV Rank below 40 — buy cheap protection.',
      'ATM or 1-strike OTM put; 30–45 DTE.',
      'Confirm bearish trend with ADX > 20 or MACD crossover.',
    ],
    exitRules: [
      'Take profit at 50% gain on premium.',
      'Stop loss at 50% of premium paid.',
      'Close at 21 DTE.',
      'Consider rolling to a lower strike if the move continues strongly.',
    ],
  },
  {
    name: 'Bull Call Spread',
    category: 'DIRECTIONAL',
    type: 'DEBIT',
    risk: 'CONSERVATIVE',
    bias: 'BULLISH',
    outlook: 'Moderately Bullish',
    when: 'Expecting moderate upside; cheaper than a Long Call.',
    howItWorks: 'Buy a lower-strike call and sell a higher-strike call with the same expiry. The short call caps your upside but also reduces your premium cost.',
    maxProfit: 'Difference between strikes minus net debit.',
    maxLoss: 'Net debit paid.',
    idealIv: 'Low to Normal — reduced by the short leg.',
    greeks: {
      gamma: 'Net positive near the lower strike; flattens as spot approaches the upper strike.',
      theta: 'Net negative but smaller than a naked long call — short leg offsets decay.',
      vega: 'Net positive but muted — IV rise helps, but less than a single long call.',
    },
    entryRules: [
      'Spot above 20 EMA; confirmed uptrend.',
      'IV Rank 20–50; not too cheap or expensive.',
      'Buy ATM call, sell 1–2 strikes OTM call; same expiry.',
      '30–45 DTE; net debit ≤ 40% of spread width.',
    ],
    exitRules: [
      'Close at 50% of maximum profit.',
      'Stop loss at 50% of net debit paid.',
      'Close at 21 DTE to avoid pin risk.',
    ],
  },
  {
    name: 'Bear Put Spread',
    category: 'DIRECTIONAL',
    type: 'DEBIT',
    risk: 'CONSERVATIVE',
    bias: 'BEARISH',
    outlook: 'Moderately Bearish',
    when: 'Expecting moderate downside with reduced cost.',
    howItWorks: 'Buy a higher-strike put and sell a lower-strike put. The short put limits profits but cuts premium cost.',
    maxProfit: 'Difference between strikes minus net debit.',
    maxLoss: 'Net debit paid.',
    idealIv: 'Low to Normal.',
    greeks: {
      gamma: 'Net positive near the higher (long) put strike.',
      theta: 'Net negative but smaller than a naked long put.',
      vega: 'Net positive but muted — IV expansion helps modestly.',
    },
    entryRules: [
      'Spot below 20 EMA; downtrend confirmed.',
      'IV Rank 20–50.',
      'Buy ATM put, sell 1–2 strikes OTM put; same expiry.',
      '30–45 DTE; net debit ≤ 40% of spread width.',
    ],
    exitRules: [
      'Close at 50% of max profit.',
      'Stop at 50% loss of debit paid.',
      'Close at 21 DTE.',
    ],
  },
  {
    name: 'Bull Put Spread',
    category: 'DIRECTIONAL',
    type: 'CREDIT',
    risk: 'CONSERVATIVE',
    bias: 'BULLISH',
    outlook: 'Mildly Bullish to Neutral',
    when: 'Want to collect premium while staying bullish; high IV helps.',
    howItWorks: 'Sell a higher-strike put, buy a lower-strike put as protection. You collect net credit upfront and keep it if the underlying stays above the short put strike.',
    maxProfit: 'Net premium collected.',
    maxLoss: 'Difference between strikes minus credit received.',
    idealIv: 'High to High-Normal — sell premium when it is expensive.',
    greeks: {
      gamma: 'Net negative — adverse gamma near the short put strike at expiry.',
      theta: 'Positive — time decay earns you money each day you hold.',
      vega: 'Negative — IV contraction after a high-IV entry increases your profit.',
    },
    entryRules: [
      'IV Rank above 50; high premium environment.',
      'Neutral to bullish market outlook.',
      'Sell the put closest to the 30-delta; buy a lower strike put for protection.',
      '30–45 DTE; collect at least 1/3 of spread width as credit.',
    ],
    exitRules: [
      'Close at 50% of credit received (profit).',
      'Stop loss if the position reaches 2× the credit received in loss.',
      'Close at 21 DTE to avoid accelerated gamma risk.',
      'Roll the short put down if underlying breaks below short put strike.',
    ],
  },
  {
    name: 'Bear Call Spread',
    category: 'DIRECTIONAL',
    type: 'CREDIT',
    risk: 'CONSERVATIVE',
    bias: 'BEARISH',
    outlook: 'Mildly Bearish to Neutral',
    when: 'Expecting sideways to downward move; collect premium.',
    howItWorks: 'Sell a lower-strike call, buy a higher-strike call as protection. Profit if the underlying stays below the short call strike.',
    maxProfit: 'Net premium collected.',
    maxLoss: 'Difference between strikes minus credit received.',
    idealIv: 'High — sell expensive premium.',
    greeks: {
      gamma: 'Net negative — adverse gamma near the short call at expiry.',
      theta: 'Positive — decay works in your favour daily.',
      vega: 'Negative — IV drop after entry boosts P&L.',
    },
    entryRules: [
      'IV Rank above 50.',
      'Neutral to bearish bias; spot below 20 EMA or at resistance.',
      'Sell the call closest to the 30-delta; buy a higher strike for protection.',
      '30–45 DTE; collect ≥ 1/3 of spread width.',
    ],
    exitRules: [
      'Close at 50% of credit received.',
      'Stop at 2× credit in loss.',
      'Close at 21 DTE.',
      'Roll the short call up if underlying rallies above short strike.',
    ],
  },
  {
    name: 'Long Straddle',
    category: 'VOLATILITY',
    type: 'DEBIT',
    risk: 'MODERATE',
    bias: 'BOTH',
    outlook: 'Expects Big Move Either Way',
    when: 'Major event (earnings, RBI policy) approaching; IV is low.',
    howItWorks: 'Buy one ATM call and one ATM put with the same strike and expiry. Profit from a large move in either direction.',
    maxProfit: 'Unlimited on the call side; substantial on the put side.',
    maxLoss: 'Total premium paid for both legs.',
    idealIv: 'Low — you buy volatility cheap, hoping for IV expansion.',
    greeks: {
      gamma: 'Very high positive — any large move rapidly increases the value of the winning leg.',
      theta: 'Very high negative — this is the most expensive position to hold; avoid holding too long.',
      vega: 'Very high positive — a VIX spike or IV expansion massively boosts both legs.',
    },
    entryRules: [
      'IV Rank below 30 — buy straddles cheaply.',
      'Major binary event (earnings, policy decision) 7–21 DTE.',
      'Buy ATM call and ATM put at the same strike.',
      'Avoid entering immediately before a known event — IV crush will hurt.',
    ],
    exitRules: [
      'Close the losing leg if the underlying makes a sustained directional move > 2×ATR.',
      'Take profit at 50% on the total position.',
      'Close if premium declines 25–30% without a move.',
      'Close all legs at 7 DTE to avoid negative gamma + theta pinch.',
    ],
  },
  {
    name: 'Short Straddle',
    category: 'VOLATILITY',
    type: 'CREDIT',
    risk: 'AGGRESSIVE',
    bias: 'NEUTRAL',
    outlook: 'Range-Bound, Low Volatility Expected',
    when: 'IV is very high, expecting a quiet market post-event.',
    howItWorks: 'Sell one ATM call and one ATM put. Collect maximum premium if underlying stays near the strike at expiry.',
    maxProfit: 'Total premium collected.',
    maxLoss: 'Unlimited (call side); very large (put side). Requires active management.',
    idealIv: 'High — sell when premium is richest.',
    greeks: {
      gamma: 'Highly negative near expiry — a sudden move in either direction creates rapid losses.',
      theta: 'Maximum positive — you earn the most theta of any strategy.',
      vega: 'Maximum negative — any IV spike will hurt your P&L significantly.',
    },
    entryRules: [
      'IV Rank above 70; sell post-event or at peak fear.',
      'Underlying in a defined consolidation range.',
      'Sell ATM call and ATM put at the same strike; 14–21 DTE.',
      'Have a clear delta-neutralisation plan before entry.',
    ],
    exitRules: [
      'Close at 25–50% of total credit.',
      'Stop immediately if position loses 2× the credit collected.',
      'Adjust if net delta exceeds ±0.30 — buy/sell futures or roll one leg.',
      'Always close by 7 DTE to avoid uncontrollable gamma risk.',
    ],
  },
  {
    name: 'Long Strangle',
    category: 'VOLATILITY',
    type: 'DEBIT',
    risk: 'MODERATE',
    bias: 'BOTH',
    outlook: 'Expects Big Move Either Way',
    when: 'Expecting a large move but uncertain direction; cheaper than straddle.',
    howItWorks: 'Buy an OTM call and an OTM put. Both are out-of-the-money so the premium is lower, but the underlying must move more to be profitable.',
    maxProfit: 'Unlimited on call side.',
    maxLoss: 'Total premium paid.',
    idealIv: 'Low to Normal.',
    greeks: {
      gamma: 'Positive — accelerating gains once either leg goes ITM.',
      theta: 'Negative — both legs decay; this position bleeds time value.',
      vega: 'Positive — IV expansion boosts both legs.',
    },
    entryRules: [
      'IV Rank below 35.',
      'Event approaching; underlying expected to move > 1.5× current IV-implied range.',
      'Buy OTM call and OTM put roughly equidistant from spot; 20–30 DTE.',
    ],
    exitRules: [
      'Close winning leg at 100% profit; roll or hold losing leg.',
      'Close full position at 50% total profit.',
      'Stop at 50% of total premium paid.',
      'Close at 7–10 DTE.',
    ],
  },
  {
    name: 'Short Strangle',
    category: 'VOLATILITY',
    type: 'CREDIT',
    risk: 'AGGRESSIVE',
    bias: 'NEUTRAL',
    outlook: 'Range-Bound',
    when: 'High IV, expecting underlying to stay between OTM strikes.',
    howItWorks: 'Sell an OTM call and an OTM put. Collect premium and keep it if the underlying stays within the two strike prices.',
    maxProfit: 'Net premium collected.',
    maxLoss: 'Theoretically unlimited — must manage carefully.',
    idealIv: 'High — rich premiums make the credit worthwhile.',
    greeks: {
      gamma: 'Negative — a breakout in either direction accelerates losses.',
      theta: 'Positive — daily time decay earns premium.',
      vega: 'Negative — IV rise hurts; IV fall helps.',
    },
    entryRules: [
      'IV Rank above 60.',
      'No major events in the holding window.',
      'Sell 15–20 delta OTM call and put; 30–45 DTE.',
      'Define max loss in advance (typically 2× credit).',
    ],
    exitRules: [
      'Close at 50% of credit received.',
      'Stop at 2× the initial credit collected.',
      'Adjust when delta of either short strike exceeds 0.20.',
      'Close all by 21 DTE.',
    ],
  },
  {
    name: 'Iron Condor',
    category: 'NON_DIRECTIONAL',
    type: 'CREDIT',
    risk: 'MODERATE',
    bias: 'NEUTRAL',
    outlook: 'Neutral, Range-Bound',
    when: 'High IV, expecting underlying to stay within a range until expiry.',
    howItWorks: 'Combine a bear call spread (sell lower call, buy higher call) and a bull put spread (sell higher put, buy lower put). Collect net credit; profit if underlying stays between the two short strikes.',
    maxProfit: 'Net premium collected.',
    maxLoss: 'Width of wider spread minus net credit.',
    idealIv: 'High to High-Normal — sell expensive wings.',
    greeks: {
      gamma: 'Negative but bounded — wing purchases limit the gamma risk unlike a naked strangle.',
      theta: 'Positive — theta decay across all four legs.',
      vega: 'Negative but limited — IV contraction helps; IV spike is partially hedged by wings.',
    },
    entryRules: [
      'IV Rank above 50; ADX below 25 (range-bound market).',
      'Sell OTM call spread and OTM put spread at ≈ 15–20 delta short strikes.',
      'Collect at least 1/3 of total spread width as credit.',
      '30–45 DTE for optimal theta-to-gamma ratio.',
    ],
    exitRules: [
      'Close at 50% of net credit — standard mechanical rule.',
      'Stop if the position reaches 2× credit in loss.',
      'Adjust the threatened spread when the short strike delta exceeds 0.25.',
      'Close the full position at 21 DTE.',
    ],
  },
  {
    name: 'Iron Butterfly',
    category: 'NON_DIRECTIONAL',
    type: 'CREDIT',
    risk: 'MODERATE',
    bias: 'NEUTRAL',
    outlook: 'Neutral — Expects underlying to pin near ATM',
    when: 'Post-event high IV, expecting underlying to converge near current price.',
    howItWorks: 'Sell ATM straddle (call + put at same strike), buy OTM call and OTM put as wings. Higher credit than Iron Condor but narrower profit zone.',
    maxProfit: 'Net premium collected (if underlying pins exactly at short strike).',
    maxLoss: 'Width of spread minus net credit.',
    idealIv: 'Very High — maximum premium collection.',
    greeks: {
      gamma: 'Highly negative near the ATM short strike — sharp moves hurt significantly.',
      theta: 'Highest positive of all multi-leg structures.',
      vega: 'Negative — post-event IV crush is this strategy\'s best friend.',
    },
    entryRules: [
      'IV Rank above 60; immediately after a major event.',
      'Sell ATM call and ATM put at the same strike; buy OTM wings 1–2 strikes away.',
      '14–21 DTE; collect ≥ 50% of spread width as credit.',
    ],
    exitRules: [
      'Take profit at 25% of credit (profit zone is narrow).',
      'Stop at 1.5× the initial credit in loss.',
      'Roll wings closer if underlying is still near ATM at 7 DTE.',
      'Always close by 7 DTE — gamma risk is extreme in final week.',
    ],
  },
  {
    name: 'Covered Call',
    category: 'DIRECTIONAL',
    type: 'CREDIT',
    risk: 'CONSERVATIVE',
    bias: 'BULLISH',
    outlook: 'Mildly Bullish to Neutral',
    when: 'You hold the underlying and want to generate income; willing to sell at the strike price.',
    howItWorks: 'Hold the underlying asset and sell an OTM call against it. The premium collected reduces your cost basis. If called away, you sell at the strike plus the premium received.',
    maxProfit: 'Strike price − purchase price + premium collected.',
    maxLoss: 'Purchase price of underlying minus premium collected (same risk as holding the asset).',
    idealIv: 'High — collect rich premium.',
    greeks: {
      gamma: 'Negative on the short call — the sold call works against you if the stock surges.',
      theta: 'Positive on the short call — daily decay reduces the call\'s value in your favour.',
      vega: 'Negative on the short call — IV drop after entry is beneficial.',
    },
    entryRules: [
      'Already holding the underlying.',
      'IV Rank above 40; sell premium into elevated volatility.',
      'Sell an OTM call with delta 30–40; 30–45 DTE.',
      'Choose a strike you are happy to sell the underlying at.',
    ],
    exitRules: [
      'Let the call expire worthless if underlying stays below strike.',
      'Roll the short call up and out if underlying rises strongly.',
      'Close the short call at 50% profit and re-sell at next opportunity.',
      'If underlying drops 5–8% below purchase price, close the call for a small profit.',
    ],
  },
  {
    name: 'Protective Put',
    category: 'DIRECTIONAL',
    type: 'DEBIT',
    risk: 'CONSERVATIVE',
    bias: 'BULLISH',
    outlook: 'Bullish with Downside Hedge',
    when: 'Holding the underlying and worried about a short-term pullback.',
    howItWorks: 'Buy a put option against a long position in the underlying. Acts as insurance — if the underlying drops, the put gains value and offsets losses.',
    maxProfit: 'Unlimited (underlying upside minus put premium).',
    maxLoss: 'Strike price difference plus put premium (hedged loss).',
    idealIv: 'Low — buy protection cheaply.',
    greeks: {
      gamma: 'Positive on the long put — the put gains value faster as spot drops.',
      theta: 'Negative — you pay for insurance daily; reduce cost by using 30–45 DTE and rolling.',
      vega: 'Positive — a VIX spike (typically accompanying market drops) boosts the put\'s value.',
    },
    entryRules: [
      'Long the underlying; IV Rank below 30 — buy cheap insurance.',
      'Buy ATM or 1-strike OTM put; 30–45 DTE.',
      'Size the put so it covers 5–10% downside.',
    ],
    exitRules: [
      'Close the put if the underlying rallies strongly (theta has eroded much of the value).',
      'Let the put absorb losses if a sharp drop occurs; close the underlying if the trend breaks.',
      'Roll to a lower strike put if the market drops and you want to lock in gains.',
    ],
  },
  {
    name: 'Collar',
    category: 'NON_DIRECTIONAL',
    type: 'VARIES',
    risk: 'CONSERVATIVE',
    bias: 'NEUTRAL',
    outlook: 'Neutral with Defined Risk',
    when: 'Protect an existing holding while funding the hedge with a covered call.',
    howItWorks: 'Buy a protective put and sell a covered call at a higher strike against the same underlying holding. The short call premium funds (or partially funds) the put.',
    maxProfit: 'Short call strike minus purchase price plus net credit/debit.',
    maxLoss: 'Purchase price minus put strike plus net debit.',
    idealIv: 'Moderate — balanced premium for both legs.',
    greeks: {
      gamma: 'Near zero — the long put\'s positive gamma offsets the short call\'s negative gamma.',
      theta: 'Small positive — the short call premium partially offsets the put\'s theta cost.',
      vega: 'Near zero — the long put and short call vega roughly cancel each other.',
    },
    entryRules: [
      'Long underlying; IV moderate (not too cheap for the CC, not too expensive for the put).',
      'Buy OTM put 5–10% below spot; sell OTM call 5–10% above spot.',
      'Target near-zero or small net credit.',
    ],
    exitRules: [
      'Adjust the short call strike upward if the underlying rallies to the call strike.',
      'Let the put protect if underlying falls sharply.',
      'Close the collar if market conditions change significantly.',
    ],
  },
  {
    name: 'Long Call Butterfly',
    category: 'NON_DIRECTIONAL',
    type: 'DEBIT',
    risk: 'CONSERVATIVE',
    bias: 'NEUTRAL',
    outlook: 'Neutral — Expects little movement',
    when: 'Low IV, expecting underlying to remain near current price at expiry.',
    howItWorks: 'Buy 1 lower-strike call, sell 2 middle-strike calls, buy 1 upper-strike call. Creates a profit peak at the middle strike.',
    maxProfit: 'Difference between strikes minus net debit (at middle strike).',
    maxLoss: 'Net debit paid.',
    idealIv: 'Low — cheap setup, profits from IV compression.',
    greeks: {
      gamma: 'Positive near the body strikes, negative at the wings — profits peak when spot pins at the middle.',
      theta: 'Positive near the middle strike — time decay accelerates profits as expiry approaches.',
      vega: 'Negative — IV compression (which typically accompanies low-movement periods) benefits this structure.',
    },
    entryRules: [
      'IV Rank above 40 (moderate IV — the setup is cheap but benefits from IV compression).',
      'Market expected to stay near current level.',
      'Strikes equidistant; buy lower call, sell 2× middle call, buy upper call.',
      '30–45 DTE; net debit ≤ 25% of spread width.',
    ],
    exitRules: [
      'Close at 40–50% of maximum profit.',
      'Stop at 25% loss of debit paid.',
      'Close at 21 DTE; maximum profit potential is near expiry but gamma risk increases.',
    ],
  },
  {
    name: 'Calendar Spread',
    category: 'VOLATILITY',
    type: 'DEBIT',
    risk: 'MODERATE',
    bias: 'NEUTRAL',
    outlook: 'Neutral Short-Term, Directional Long-Term',
    when: 'Expecting low near-term movement; want to harvest time decay differential.',
    howItWorks: 'Sell a near-term option, buy a same-strike longer-dated option. The short leg decays faster. Profit when the underlying stays near the strike into near expiry.',
    maxProfit: 'Capped — typically at near-term expiry when underlying is at the strike.',
    maxLoss: 'Net debit paid.',
    idealIv: 'Normal to Low-Normal — want near-term IV to drop while long term stays stable.',
    greeks: {
      gamma: 'Net negative on the near-term sold leg — front-month gamma is higher near expiry.',
      theta: 'Positive — the front-month option decays faster than the back-month.',
      vega: 'Positive — the longer-dated back-month benefits more from IV expansion than the front-month.',
    },
    entryRules: [
      'Market consolidating; no major events before front-month expiry.',
      'Sell near-term ATM option with ≤ 7 DTE; buy same-strike back-month option.',
      'Ensure the term structure is in contango (near-month IV ≥ back-month IV).',
    ],
    exitRules: [
      'Close both legs before or at front-month expiry.',
      'Take profit at 50% of debit paid.',
      'Close if underlying moves > 1.5% from the strike — the profit zone is narrow.',
    ],
  },
  {
    name: 'Diagonal Spread',
    category: 'DIRECTIONAL',
    type: 'DEBIT',
    risk: 'MODERATE',
    bias: 'BULLISH',
    outlook: 'Moderately Directional',
    when: 'Want directional exposure with reduced cost using different strikes and expiries.',
    howItWorks: 'Buy a longer-dated option at one strike and sell a nearer-dated option at a different strike. Combines elements of calendar and vertical spreads.',
    maxProfit: 'Varies — time decay on short leg plus intrinsic movement.',
    maxLoss: 'Net debit paid.',
    idealIv: 'Low for the long leg, higher for the short leg.',
    greeks: {
      gamma: 'Net positive from the long dated leg dominating the structure.',
      theta: 'Net positive typically — the short near-term leg decays faster.',
      vega: 'Positive — the long back-month dominates, so IV expansion helps.',
    },
    entryRules: [
      'Mild directional bias (bullish: buy back-month call below ATM; bearish: buy back-month put).',
      'Sell near-term OTM option against the long position.',
      'Back-month: 30–60 DTE; front-month: 7–21 DTE.',
    ],
    exitRules: [
      'Close when the front-month expires and roll to the next cycle.',
      'Close the full spread if underlying breaks out strongly.',
      'Stop at 50% of net debit.',
    ],
  },
  {
    name: 'Ratio Call Spread',
    category: 'DIRECTIONAL',
    type: 'VARIES',
    risk: 'AGGRESSIVE',
    bias: 'BULLISH',
    outlook: 'Mildly Bullish',
    when: 'High IV; expecting a modest move up but not a runaway rally.',
    howItWorks: 'Buy 1 lower-strike call and sell 2 higher-strike calls. The extra short call provides additional credit but creates unlimited risk if the underlying surges.',
    maxProfit: 'At the short strike — difference between strikes plus initial credit.',
    maxLoss: 'Unlimited above the upper breakeven — requires discipline.',
    idealIv: 'High — extra premium from the two short calls.',
    greeks: {
      gamma: 'Net negative above the upper strike — the two short calls dominate at extremes.',
      theta: 'Positive — two short calls generate more decay than one long call.',
      vega: 'Negative — the two short calls outweigh the long; IV drop helps.',
    },
    entryRules: [
      'IV Rank above 50; mild upside expected, not a surge.',
      'Buy 1 ATM or slightly OTM call; sell 2 calls 1–2 strikes higher.',
      'Target a near-zero debit or a small credit at entry.',
      '30–45 DTE.',
    ],
    exitRules: [
      'Close at 30% of max profit.',
      'Hard stop if underlying rallies to the short strikes — exit immediately.',
      'Never hold to expiry; unlimited upside risk requires active management.',
      'Roll down or convert to a vertical spread if market surges.',
    ],
  },
  {
    name: 'Ratio Put Spread',
    category: 'DIRECTIONAL',
    type: 'VARIES',
    risk: 'AGGRESSIVE',
    bias: 'BEARISH',
    outlook: 'Mildly Bearish',
    when: 'High IV; expecting a moderate downside move.',
    howItWorks: 'Buy 1 higher-strike put and sell 2 lower-strike puts. Profits peak at the short put strike. Risk if underlying crashes hard below both strikes.',
    maxProfit: 'At the short strike.',
    maxLoss: 'Substantial below the lower breakeven.',
    idealIv: 'High.',
    greeks: {
      gamma: 'Net negative below the lower strike — two short puts create severe gamma risk in a crash.',
      theta: 'Positive — two short puts earn more theta than one long.',
      vega: 'Negative — IV spike (common during crashes) works against the two short puts.',
    },
    entryRules: [
      'IV Rank above 50; moderate downside expected, not a market crash.',
      'Buy 1 ATM or slightly OTM put; sell 2 puts 1–2 strikes lower.',
      'Target a net credit or near-zero debit.',
    ],
    exitRules: [
      'Close at 30% of max profit.',
      'Exit immediately if underlying crashes below both short put strikes.',
      'Never hold to expiry — catastrophic risk in an extreme down-move.',
    ],
  },
  {
    name: 'Synthetic Long',
    category: 'DIRECTIONAL',
    type: 'VARIES',
    risk: 'AGGRESSIVE',
    bias: 'BULLISH',
    outlook: 'Strongly Bullish',
    when: 'Want futures-like exposure without holding the underlying.',
    howItWorks: 'Buy an ATM call and sell an ATM put at the same strike and expiry. The combined position replicates a long futures position, but capital tied up is just the margin difference.',
    maxProfit: 'Unlimited.',
    maxLoss: 'Substantial — akin to holding a long futures position.',
    idealIv: 'Any — structure is independent of IV bias.',
    greeks: {
      gamma: 'Near 1 — position behaves like a futures contract; every point move is fully captured.',
      theta: 'Near zero — the long call theta cost is offset by the short put theta income.',
      vega: 'Near zero — the long call positive vega is offset by the short put negative vega.',
    },
    entryRules: [
      'Strong confirmed uptrend; prefer when futures premium is high.',
      'Buy ATM call and sell ATM put at the same strike and expiry.',
      'Ensure sufficient margin for the short put.',
    ],
    exitRules: [
      'Use a trail stop below recent swing lows.',
      'Close on trend reversal or break of key support.',
      'Convert to a directional spread if conviction weakens.',
    ],
  },
  {
    name: 'Synthetic Short',
    category: 'DIRECTIONAL',
    type: 'VARIES',
    risk: 'AGGRESSIVE',
    bias: 'BEARISH',
    outlook: 'Strongly Bearish',
    when: 'Want short-futures-like exposure without selling the underlying.',
    howItWorks: 'Sell an ATM call and buy an ATM put at the same strike and expiry. Profit from a falling underlying, identical in P&L to a short futures position.',
    maxProfit: 'Substantial (underlying down to zero).',
    maxLoss: 'Unlimited on the upside.',
    idealIv: 'Any.',
    greeks: {
      gamma: 'Near −1 — mirrors a short futures position.',
      theta: 'Near zero — short call and long put theta offset.',
      vega: 'Near zero — vega offsets between legs.',
    },
    entryRules: [
      'Strong confirmed downtrend.',
      'Sell ATM call and buy ATM put at the same strike and expiry.',
      'Have a clear exit plan — unlimited upside risk.',
    ],
    exitRules: [
      'Trail stop above recent swing highs.',
      'Close on trend reversal or break of key resistance.',
      'Reduce size or hedge if market shows signs of reversal.',
    ],
  },
  {
    name: 'Jade Lizard',
    category: 'NON_DIRECTIONAL',
    type: 'CREDIT',
    risk: 'MODERATE',
    bias: 'BULLISH',
    outlook: 'Mildly Bullish to Neutral',
    when: 'High IV with a slight bullish bias; want zero upside risk.',
    howItWorks: 'Sell an OTM put + sell a bear call spread. The total premium collected exceeds the width of the call spread, so there is no upside risk. Risk is only on a severe downside move.',
    maxProfit: 'Total premium collected.',
    maxLoss: 'Put strike minus credit received (if underlying crashes).',
    idealIv: 'High to High-Normal.',
    greeks: {
      gamma: 'Negative below the short put strike — downside accelerates losses.',
      theta: 'Positive — all three short components benefit from time decay.',
      vega: 'Negative — IV drop after a high-IV entry boosts P&L.',
    },
    entryRules: [
      'IV Rank above 60; slight bullish or neutral bias.',
      'Sell OTM put (30-delta); sell OTM bear call spread above spot.',
      'Ensure total credit collected > width of the call spread (zero upside risk condition).',
      '30–45 DTE.',
    ],
    exitRules: [
      'Close the full structure at 50% of total credit.',
      'Stop at 2× the total credit in loss.',
      'Roll the short put down if underlying drops toward the strike.',
      'Close the call spread independently if underlying rallies above the short call.',
    ],
  },
]

// ─── Category / type / risk colors ───────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  DIRECTIONAL: 'text-blue-400 bg-blue-900/20 border-blue-800/40',
  NON_DIRECTIONAL: 'text-purple-400 bg-purple-900/20 border-purple-800/40',
  VOLATILITY: 'text-orange-400 bg-orange-900/20 border-orange-800/40',
}

const TYPE_COLORS: Record<string, string> = {
  DEBIT: 'text-red-400 bg-red-900/20',
  CREDIT: 'text-emerald-400 bg-emerald-900/20',
  VARIES: 'text-amber-400 bg-amber-900/20',
}

const RISK_COLORS: Record<string, string> = {
  CONSERVATIVE: 'text-blue-300',
  MODERATE: 'text-amber-300',
  AGGRESSIVE: 'text-red-300',
}

const BIAS_COLORS: Record<string, string> = {
  BULLISH: 'text-emerald-400 bg-emerald-900/20 border-emerald-800/40',
  BEARISH: 'text-red-400 bg-red-900/20 border-red-800/40',
  NEUTRAL: 'text-slate-300 bg-slate-800/40 border-slate-700/40',
  BOTH: 'text-amber-400 bg-amber-900/20 border-amber-800/40',
}

// ─── Strategy accordion item ──────────────────────────────────────────────────

function StrategyItem({ strategy }: { strategy: Strategy }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="rounded-xl border border-surface-tertiary bg-surface-secondary overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface-tertiary/40 transition-colors"
      >
        <div className="flex-1 flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-white">{strategy.name}</span>
          <span className={clsx('text-[10px] px-1.5 py-0.5 rounded border font-medium', CATEGORY_COLORS[strategy.category])}>
            {strategy.category.replace('_', ' ')}
          </span>
          <span className={clsx('text-[10px] px-1.5 py-0.5 rounded font-medium', TYPE_COLORS[strategy.type])}>
            {strategy.type}
          </span>
          <span className={clsx('text-[10px] px-1.5 py-0.5 rounded border font-medium', BIAS_COLORS[strategy.bias])}>
            {strategy.bias === 'BOTH' ? 'BULL / BEAR' : strategy.bias}
          </span>
          <span className={clsx('text-[10px] font-medium ml-1', RISK_COLORS[strategy.risk])}>
            {strategy.risk}
          </span>
        </div>
        <span className="text-xs text-slate-400 hidden sm:block shrink-0">{strategy.outlook}</span>
        {open ? <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />}
      </button>

      {open && (
        <div className="px-4 pb-4 pt-1 space-y-4 border-t border-surface-tertiary text-sm">
          {/* Overview row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide">When to use</p>
                <p className="text-slate-300 mt-0.5">{strategy.when}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide">How it works</p>
                <p className="text-slate-300 mt-0.5 leading-relaxed">{strategy.howItWorks}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide">Ideal IV environment</p>
                <p className="text-slate-300 mt-0.5">{strategy.idealIv}</p>
              </div>
            </div>
            <div className="space-y-2">
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide">Maximum Profit</p>
                <p className="text-emerald-400 mt-0.5 font-medium">{strategy.maxProfit}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide">Maximum Loss</p>
                <p className="text-red-400 mt-0.5 font-medium">{strategy.maxLoss}</p>
              </div>
            </div>
          </div>

          {/* Greeks */}
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wide mb-1.5">Greeks</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {[
                { label: 'Γ Gamma', value: strategy.greeks.gamma, color: 'text-violet-300' },
                { label: 'Θ Theta', value: strategy.greeks.theta, color: 'text-amber-300' },
                { label: 'V Vega', value: strategy.greeks.vega, color: 'text-cyan-300' },
              ].map(({ label, value, color }) => (
                <div key={label} className="rounded-lg bg-surface-tertiary/40 p-2.5 space-y-0.5">
                  <p className={clsx('text-[11px] font-semibold', color)}>{label}</p>
                  <p className="text-xs text-slate-400 leading-snug">{value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Entry & Exit rules */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-1.5">Entry Rules</p>
              <ul className="space-y-1">
                {strategy.entryRules.map((r, i) => (
                  <li key={i} className="flex gap-2 text-xs text-slate-300">
                    <span className="text-emerald-500 shrink-0 mt-0.5">›</span>
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-1.5">Exit Rules</p>
              <ul className="space-y-1">
                {strategy.exitRules.map((r, i) => (
                  <li key={i} className="flex gap-2 text-xs text-slate-300">
                    <span className="text-red-400 shrink-0 mt-0.5">›</span>
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 pb-2 border-b border-surface-tertiary">
        <Icon className="w-4 h-4 text-primary-400" />
        <h2 className="text-base font-semibold text-white">{title}</h2>
      </div>
      {children}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function HelpPage() {
  const [stratFilter, setStratFilter] = useState<'ALL' | 'DIRECTIONAL' | 'NON_DIRECTIONAL' | 'VOLATILITY'>('ALL')

  const filtered = STRATEGIES.filter((s) => stratFilter === 'ALL' || s.category === stratFilter)

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <HelpCircle className="w-6 h-6 text-primary-400" />
        <div>
          <h1 className="text-xl font-semibold text-white">Help & Guide</h1>
          <p className="text-xs text-slate-400 mt-0.5">Everything you need to know about OptraAssistant</p>
        </div>
      </div>

      {/* What is OptraAssistant */}
      <Section title="What is OptraAssistant?" icon={Lightbulb}>
        <div className="card p-5 space-y-3 text-sm text-slate-300 leading-relaxed">
          <p>
            <strong className="text-white">OptraAssistant</strong> is an AI-powered options strategy advisor for Indian markets (NSE).
            It reads live market conditions — trend, implied volatility, VIX, and put-call ratio — and recommends the most
            appropriate options strategies for your risk profile, scored and ranked in real time.
          </p>
          <p>
            Every recommendation is explained in plain English by Claude AI, telling you exactly <em>why</em> a strategy fits
            today's conditions rather than just which one to use.
          </p>
        </div>
      </Section>

      {/* How scoring works */}
      <Section title="How Strategy Scoring Works" icon={Activity}>
        <div className="card p-5 space-y-4 text-sm text-slate-300">
          <p>Each strategy is scored out of 100 across four dimensions:</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { label: 'IV Match', weight: '30%', desc: 'How well the current IV regime matches the strategy\'s preferred IV environment.' },
              { label: 'Trend Match', weight: '30%', desc: 'Whether the market trend (bullish/bearish/sideways) aligns with the strategy\'s outlook.' },
              { label: 'DTE Fit', weight: '20%', desc: 'Whether there is a valid expiry date within the strategy\'s ideal days-to-expiry window.' },
              { label: 'Risk Profile', weight: '20%', desc: 'Whether the strategy\'s risk level suits your risk appetite (Conservative/Moderate/Aggressive).' },
            ].map(({ label, weight, desc }) => (
              <div key={label} className="rounded-lg bg-surface-tertiary/50 p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-white font-medium">{label}</span>
                  <span className="text-primary-400 text-xs font-semibold">{weight}</span>
                </div>
                <p className="text-xs text-slate-400">{desc}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-400">
            Strategies scoring below 50/100 are automatically filtered out. The higher the score, the better the fit
            for current conditions and your profile.
          </p>
        </div>
      </Section>

      {/* How to use each page */}
      <Section title="Using the App" icon={BarChart2}>
        <div className="space-y-2 text-sm">
          {[
            {
              title: 'Dashboard',
              desc: 'Overview of your account — market sentiment widget, quick links to active features, and account stats.',
            },
            {
              title: 'Options Chain',
              desc: 'Live NSE options chain for NIFTY, BANKNIFTY, FINNIFTY, and MIDCPNIFTY. Toggle Greeks, switch expiries, and read IV Rank at a glance.',
            },
            {
              title: 'Portfolio',
              desc: 'Add your live positions manually. OptraAssistant computes aggregate portfolio Greeks (Delta, Gamma, Theta, Vega) and total P&L in real time.',
            },
            {
              title: 'Recommender',
              desc: 'The AI engine analyses market conditions and ranks strategies for your risk profile. Select a symbol, read the market banner, and expand any strategy card for an AI-generated explanation and a payoff diagram.',
            },
            {
              title: 'Strategy Library',
              desc: 'Browse all 23 built-in strategies. Filter by category, type, risk level, and outlook. Save favourites for quick access. Click any strategy to see its full detail page with an interactive payoff diagram.',
            },
            {
              title: 'Builder',
              desc: 'Create custom option strategies by adding individual legs (CE/PE, Buy/Sell, strike, quantity). The payoff diagram updates live. Save the strategy to My Strategies for future use.',
            },
            {
              title: 'My Strategies',
              desc: 'All strategies you have saved — both from the Library and custom-built ones. Open any saved strategy to view its payoff diagram or apply it to a live position.',
            },
            {
              title: 'Watchlist',
              desc: 'Add instruments to a personal watchlist. OptraAssistant tracks each watchlist item against current market conditions and highlights when a strategy fits.',
            },
            {
              title: 'Live Monitor',
              desc: 'Real-time position tracker. Add active trades, watch live P&L and Greeks via a sparkline, and configure exit rules (P&L %, absolute loss, delta threshold, DTE). Receive alert banners and AI adjustment suggestions when a rule is triggered.',
            },
            {
              title: 'Performance',
              desc: 'Analytics for closed positions. View total P&L, win rate, average P&L, best and worst trades. Filter by instrument or date range. Explore a monthly P&L heatmap, export a CSV, or request a Claude AI post-mortem for any closed trade.',
            },
          ].map(({ title, desc }) => (
            <div key={title} className="flex gap-3 p-3 rounded-lg bg-surface-secondary border border-surface-tertiary">
              <ChevronRight className="w-4 h-4 text-primary-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-white">{title}</p>
                <p className="text-slate-400 text-xs mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Understanding market signals */}
      <Section title="Understanding Market Signals" icon={TrendingUp}>
        <div className="card p-5 space-y-4 text-sm text-slate-300">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <p className="text-xs text-slate-500 uppercase tracking-wide">IV Regime</p>
              <p>Implied volatility relative to its historical range. <span className="text-emerald-400">Low</span> means options are cheap; <span className="text-red-400">High</span> means options are expensive.</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-slate-500 uppercase tracking-wide">VIX</p>
              <p>India VIX — the market's fear gauge. Under 13 is calm; above 25 signals extreme uncertainty.</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-slate-500 uppercase tracking-wide">PCR (Put-Call Ratio)</p>
              <p>Ratio of put to call open interest. PCR above 1.2 is bullish (hedging by bears); below 0.7 is bearish (complacency).</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-slate-500 uppercase tracking-wide">ADX / Market Phase</p>
              <p>ADX above 25 means a trending market; below 25 is range-bound. Trending markets suit directional strategies; ranging markets suit non-directional ones.</p>
            </div>
          </div>
        </div>
      </Section>

      {/* Risk appetite */}
      <Section title="Risk Appetite" icon={Shield}>
        <div className="card p-5 space-y-3 text-sm text-slate-300">
          <p>Set your risk appetite in your Profile. It controls which strategies are recommended:</p>
          <div className="space-y-2">
            {[
              { level: 'Conservative', color: 'text-blue-400', desc: 'Only CONSERVATIVE strategies (defined risk, limited loss). Suitable for beginners or capital-protection goals.' },
              { level: 'Moderate', color: 'text-amber-400', desc: 'CONSERVATIVE + MODERATE strategies. Balanced between income and growth.' },
              { level: 'Aggressive', color: 'text-red-400', desc: 'All strategies including AGGRESSIVE. Higher potential reward with commensurately higher risk.' },
            ].map(({ level, color, desc }) => (
              <div key={level} className="flex gap-3">
                <span className={clsx('font-semibold shrink-0 w-24', color)}>{level}</span>
                <p className="text-slate-400 text-xs">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* Strategy reference */}
      <Section title="Strategy Reference" icon={BookOpen}>
        <p className="text-xs text-slate-400 -mt-1 mb-1">
          Each strategy shows IV environment, Greeks profile (Γ/Θ/V), and explicit entry and exit rules.
          Use the bias badges — <span className="text-emerald-400 font-medium">BULLISH</span> /&nbsp;
          <span className="text-red-400 font-medium">BEARISH</span> /&nbsp;
          <span className="text-slate-300 font-medium">NEUTRAL</span> /&nbsp;
          <span className="text-amber-400 font-medium">BULL / BEAR</span> — to quickly filter by direction.
        </p>
        <div className="flex items-center gap-2 flex-wrap mb-3">
          {(['ALL', 'DIRECTIONAL', 'NON_DIRECTIONAL', 'VOLATILITY'] as const).map((cat) => (
            <button
              key={cat}
              onClick={() => setStratFilter(cat)}
              className={clsx(
                'px-3 py-1 rounded-lg text-xs font-medium transition-colors',
                stratFilter === cat
                  ? 'bg-primary-600 text-white'
                  : 'bg-surface-secondary border border-surface-tertiary text-slate-400 hover:text-white',
              )}
            >
              {cat === 'ALL' ? 'All' : cat.replace('_', '-')}
              {cat === 'ALL' && <span className="ml-1 text-slate-500">({STRATEGIES.length})</span>}
            </button>
          ))}
        </div>
        <div className="space-y-2">
          {filtered.map((s) => (
            <StrategyItem key={s.name} strategy={s} />
          ))}
        </div>
      </Section>

      {/* FAQs */}
      <Section title="Frequently Asked Questions" icon={HelpCircle}>
        <div className="space-y-2">
          {[
            {
              q: 'Is this real-time data?',
              a: 'Market data comes from NSE via the Kite Connect API. When the market is closed or API is unavailable, a realistic mock is shown with a "MOCK" label.',
            },
            {
              q: 'How do I set my risk profile?',
              a: 'Go to Profile (bottom-left) → Risk Appetite. You can choose Conservative, Moderate, or Aggressive. This directly affects which strategies are scored and shown.',
            },
            {
              q: 'What does "Score: 90" mean?',
              a: 'Out of 100. It is a weighted combination of IV match (30%), trend match (30%), DTE fit (20%), and risk profile compatibility (20%). Higher means a better fit for today\'s conditions.',
            },
            {
              q: 'Can I build and save my own strategies?',
              a: 'Yes — use the Strategy Builder to create custom multi-leg strategies. You can save them to My Strategies and apply them to a live position in the Live Monitor.',
            },
            {
              q: 'What are Exit Rules in Live Monitor?',
              a: 'Exit rules are thresholds you set per position: P&L % loss, absolute loss, delta breach, or days-to-expiry. When a rule is triggered, an alert banner appears with an AI-generated adjustment suggestion.',
            },
            {
              q: 'What is the AI Post-Mortem?',
              a: 'After closing a position, click "AI Post-Mortem" in the Performance page to get a Claude AI analysis of the trade — what worked, what didn\'t, and what to consider next time.',
            },
            {
              q: 'Are these buy/sell signals I must follow?',
              a: 'No. OptraAssistant provides educational recommendations and analysis. Always do your own research and consult a SEBI-registered advisor before trading.',
            },
          ].map(({ q, a }) => (
            <div key={q} className="rounded-lg bg-surface-secondary border border-surface-tertiary p-4 space-y-1">
              <p className="text-sm font-medium text-white">{q}</p>
              <p className="text-xs text-slate-400 leading-relaxed">{a}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Disclaimer */}
      <div className="rounded-xl border border-amber-800/40 bg-amber-900/10 p-4 text-xs text-amber-300 leading-relaxed">
        <strong>Disclaimer:</strong> OptraAssistant is for educational and informational purposes only. It does not constitute
        financial advice or a recommendation to buy or sell any security. Options trading involves significant risk and
        may not be suitable for all investors. Past performance of any strategy does not guarantee future results.
        Always trade within your risk tolerance and consult a SEBI-registered investment advisor.
      </div>
    </div>
  )
}
