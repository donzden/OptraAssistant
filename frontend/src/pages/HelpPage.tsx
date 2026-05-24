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
  outlook: string
  when: string
  howItWorks: string
  maxProfit: string
  maxLoss: string
  idealIv: string
}

// ─── Strategy data ────────────────────────────────────────────────────────────

const STRATEGIES: Strategy[] = [
  {
    name: 'Long Call',
    category: 'DIRECTIONAL',
    type: 'DEBIT',
    risk: 'MODERATE',
    outlook: 'Bullish',
    when: 'Strong uptrend, low IV, catalyst expected.',
    howItWorks: 'Buy one call option at or near the money. You pay a premium upfront and profit if the underlying rises beyond the breakeven (strike + premium paid).',
    maxProfit: 'Unlimited — the higher the underlying goes, the more you gain.',
    maxLoss: 'Limited to premium paid.',
    idealIv: 'Low to Normal — you want IV to expand after you buy.',
  },
  {
    name: 'Long Put',
    category: 'DIRECTIONAL',
    type: 'DEBIT',
    risk: 'MODERATE',
    outlook: 'Bearish',
    when: 'Expect a significant drop, low IV environment.',
    howItWorks: 'Buy one put option at or near the money. You profit if the underlying falls below the breakeven (strike − premium paid).',
    maxProfit: 'Strike minus premium (substantial but capped at zero price).',
    maxLoss: 'Limited to premium paid.',
    idealIv: 'Low to Normal — buy puts when IV is cheap.',
  },
  {
    name: 'Bull Call Spread',
    category: 'DIRECTIONAL',
    type: 'DEBIT',
    risk: 'CONSERVATIVE',
    outlook: 'Moderately Bullish',
    when: 'Expecting moderate upside; cheaper than a Long Call.',
    howItWorks: 'Buy a lower-strike call and sell a higher-strike call with the same expiry. The short call caps your upside but also reduces your premium cost.',
    maxProfit: 'Difference between strikes minus net debit.',
    maxLoss: 'Net debit paid.',
    idealIv: 'Low to Normal — reduced by the short leg.',
  },
  {
    name: 'Bear Put Spread',
    category: 'DIRECTIONAL',
    type: 'DEBIT',
    risk: 'CONSERVATIVE',
    outlook: 'Moderately Bearish',
    when: 'Expecting moderate downside with reduced cost.',
    howItWorks: 'Buy a higher-strike put and sell a lower-strike put. The short put limits profits but cuts premium cost.',
    maxProfit: 'Difference between strikes minus net debit.',
    maxLoss: 'Net debit paid.',
    idealIv: 'Low to Normal.',
  },
  {
    name: 'Bull Put Spread',
    category: 'DIRECTIONAL',
    type: 'CREDIT',
    risk: 'CONSERVATIVE',
    outlook: 'Mildly Bullish to Neutral',
    when: 'Want to collect premium while staying bullish; high IV helps.',
    howItWorks: 'Sell a higher-strike put, buy a lower-strike put as protection. You collect net credit upfront and keep it if the underlying stays above the short put strike.',
    maxProfit: 'Net premium collected.',
    maxLoss: 'Difference between strikes minus credit received.',
    idealIv: 'High to High-Normal — sell premium when it is expensive.',
  },
  {
    name: 'Bear Call Spread',
    category: 'DIRECTIONAL',
    type: 'CREDIT',
    risk: 'CONSERVATIVE',
    outlook: 'Mildly Bearish to Neutral',
    when: 'Expecting sideways to downward move; collect premium.',
    howItWorks: 'Sell a lower-strike call, buy a higher-strike call as protection. Profit if the underlying stays below the short call strike.',
    maxProfit: 'Net premium collected.',
    maxLoss: 'Difference between strikes minus credit received.',
    idealIv: 'High — sell expensive premium.',
  },
  {
    name: 'Long Straddle',
    category: 'VOLATILITY',
    type: 'DEBIT',
    risk: 'MODERATE',
    outlook: 'Expects Big Move Either Way',
    when: 'Major event (earnings, RBI policy) approaching; IV is low.',
    howItWorks: 'Buy one ATM call and one ATM put with the same strike and expiry. Profit from a large move in either direction.',
    maxProfit: 'Unlimited on the call side; substantial on the put side.',
    maxLoss: 'Total premium paid for both legs.',
    idealIv: 'Low — you buy volatility cheap, hoping for IV expansion.',
  },
  {
    name: 'Short Straddle',
    category: 'VOLATILITY',
    type: 'CREDIT',
    risk: 'AGGRESSIVE',
    outlook: 'Range-Bound, Low Volatility Expected',
    when: 'IV is very high, expecting a quiet market post-event.',
    howItWorks: 'Sell one ATM call and one ATM put. Collect maximum premium if underlying stays near the strike at expiry.',
    maxProfit: 'Total premium collected.',
    maxLoss: 'Unlimited (call side); very large (put side). Requires active management.',
    idealIv: 'High — sell when premium is richest.',
  },
  {
    name: 'Long Strangle',
    category: 'VOLATILITY',
    type: 'DEBIT',
    risk: 'MODERATE',
    outlook: 'Expects Big Move Either Way',
    when: 'Expecting a large move but uncertain direction; cheaper than straddle.',
    howItWorks: 'Buy an OTM call and an OTM put. Both are out-of-the-money so the premium is lower, but the underlying must move more to be profitable.',
    maxProfit: 'Unlimited on call side.',
    maxLoss: 'Total premium paid.',
    idealIv: 'Low to Normal.',
  },
  {
    name: 'Short Strangle',
    category: 'VOLATILITY',
    type: 'CREDIT',
    risk: 'AGGRESSIVE',
    outlook: 'Range-Bound',
    when: 'High IV, expecting underlying to stay between OTM strikes.',
    howItWorks: 'Sell an OTM call and an OTM put. Collect premium and keep it if the underlying stays within the two strike prices.',
    maxProfit: 'Net premium collected.',
    maxLoss: 'Theoretically unlimited — must manage carefully.',
    idealIv: 'High — rich premiums make the credit worthwhile.',
  },
  {
    name: 'Iron Condor',
    category: 'NON_DIRECTIONAL',
    type: 'CREDIT',
    risk: 'MODERATE',
    outlook: 'Neutral, Range-Bound',
    when: 'High IV, expecting underlying to stay within a range until expiry.',
    howItWorks: 'Combine a bear call spread (sell lower call, buy higher call) and a bull put spread (sell higher put, buy lower put). Collect net credit; profit if underlying stays between the two short strikes.',
    maxProfit: 'Net premium collected.',
    maxLoss: 'Width of wider spread minus net credit.',
    idealIv: 'High to High-Normal — sell expensive wings.',
  },
  {
    name: 'Iron Butterfly',
    category: 'NON_DIRECTIONAL',
    type: 'CREDIT',
    risk: 'MODERATE',
    outlook: 'Neutral — Expects underlying to pin near ATM',
    when: 'Post-event high IV, expecting underlying to converge near current price.',
    howItWorks: 'Sell ATM straddle (call + put at same strike), buy OTM call and OTM put as wings. Higher credit than Iron Condor but narrower profit zone.',
    maxProfit: 'Net premium collected (if underlying pins exactly at short strike).',
    maxLoss: 'Width of spread minus net credit.',
    idealIv: 'Very High — maximum premium collection.',
  },
  {
    name: 'Covered Call',
    category: 'DIRECTIONAL',
    type: 'CREDIT',
    risk: 'CONSERVATIVE',
    outlook: 'Mildly Bullish to Neutral',
    when: 'You hold the underlying and want to generate income; willing to sell at the strike price.',
    howItWorks: 'Hold the underlying asset and sell an OTM call against it. The premium collected reduces your cost basis. If called away, you sell at the strike plus the premium received.',
    maxProfit: 'Strike price − purchase price + premium collected.',
    maxLoss: 'Purchase price of underlying minus premium collected (same risk as holding the asset).',
    idealIv: 'High — collect rich premium.',
  },
  {
    name: 'Protective Put',
    category: 'DIRECTIONAL',
    type: 'DEBIT',
    risk: 'CONSERVATIVE',
    outlook: 'Bullish with Downside Hedge',
    when: 'Holding the underlying and worried about a short-term pullback.',
    howItWorks: 'Buy a put option against a long position in the underlying. Acts as insurance — if the underlying drops, the put gains value and offsets losses.',
    maxProfit: 'Unlimited (underlying upside minus put premium).',
    maxLoss: 'Strike price difference plus put premium (hedged loss).',
    idealIv: 'Low — buy protection cheaply.',
  },
  {
    name: 'Collar',
    category: 'NON_DIRECTIONAL',
    type: 'VARIES',
    risk: 'CONSERVATIVE',
    outlook: 'Neutral with Defined Risk',
    when: 'Protect an existing holding while funding the hedge with a covered call.',
    howItWorks: 'Buy a protective put and sell a covered call at a higher strike against the same underlying holding. The short call premium funds (or partially funds) the put.',
    maxProfit: 'Short call strike minus purchase price plus net credit/debit.',
    maxLoss: 'Purchase price minus put strike plus net debit.',
    idealIv: 'Moderate — balanced premium for both legs.',
  },
  {
    name: 'Long Call Butterfly',
    category: 'NON_DIRECTIONAL',
    type: 'DEBIT',
    risk: 'CONSERVATIVE',
    outlook: 'Neutral — Expects little movement',
    when: 'Low IV, expecting underlying to remain near current price at expiry.',
    howItWorks: 'Buy 1 lower-strike call, sell 2 middle-strike calls, buy 1 upper-strike call. Creates a profit peak at the middle strike.',
    maxProfit: 'Difference between strikes minus net debit (at middle strike).',
    maxLoss: 'Net debit paid.',
    idealIv: 'Low — cheap setup, profits from IV compression.',
  },
  {
    name: 'Calendar Spread',
    category: 'VOLATILITY',
    type: 'DEBIT',
    risk: 'MODERATE',
    outlook: 'Neutral Short-Term, Directional Long-Term',
    when: 'Expecting low near-term movement; want to harvest time decay differential.',
    howItWorks: 'Sell a near-term option, buy a same-strike longer-dated option. The short leg decays faster. Profit when the underlying stays near the strike into near expiry.',
    maxProfit: 'Capped — typically at near-term expiry when underlying is at the strike.',
    maxLoss: 'Net debit paid.',
    idealIv: 'Normal to Low-Normal — want near-term IV to drop while long term stays stable.',
  },
  {
    name: 'Diagonal Spread',
    category: 'DIRECTIONAL',
    type: 'DEBIT',
    risk: 'MODERATE',
    outlook: 'Moderately Directional',
    when: 'Want directional exposure with reduced cost using different strikes and expiries.',
    howItWorks: 'Buy a longer-dated option at one strike and sell a nearer-dated option at a different strike. Combines elements of calendar and vertical spreads.',
    maxProfit: 'Varies — time decay on short leg plus intrinsic movement.',
    maxLoss: 'Net debit paid.',
    idealIv: 'Low for the long leg, higher for the short leg.',
  },
  {
    name: 'Ratio Call Spread',
    category: 'DIRECTIONAL',
    type: 'VARIES',
    risk: 'AGGRESSIVE',
    outlook: 'Mildly Bullish',
    when: 'High IV; expecting a modest move up but not a runaway rally.',
    howItWorks: 'Buy 1 lower-strike call and sell 2 higher-strike calls. The extra short call provides additional credit but creates unlimited risk if the underlying surges.',
    maxProfit: 'At the short strike — difference between strikes plus initial credit.',
    maxLoss: 'Unlimited above the upper breakeven — requires discipline.',
    idealIv: 'High — extra premium from the two short calls.',
  },
  {
    name: 'Ratio Put Spread',
    category: 'DIRECTIONAL',
    type: 'VARIES',
    risk: 'AGGRESSIVE',
    outlook: 'Mildly Bearish',
    when: 'High IV; expecting a moderate downside move.',
    howItWorks: 'Buy 1 higher-strike put and sell 2 lower-strike puts. Profits peak at the short put strike. Risk if underlying crashes hard below both strikes.',
    maxProfit: 'At the short strike.',
    maxLoss: 'Substantial below the lower breakeven.',
    idealIv: 'High.',
  },
  {
    name: 'Synthetic Long',
    category: 'DIRECTIONAL',
    type: 'VARIES',
    risk: 'AGGRESSIVE',
    outlook: 'Strongly Bullish',
    when: 'Want futures-like exposure without holding the underlying.',
    howItWorks: 'Buy an ATM call and sell an ATM put at the same strike and expiry. The combined position replicates a long futures position, but capital tied up is just the margin difference.',
    maxProfit: 'Unlimited.',
    maxLoss: 'Substantial — akin to holding a long futures position.',
    idealIv: 'Any — structure is independent of IV bias.',
  },
  {
    name: 'Synthetic Short',
    category: 'DIRECTIONAL',
    type: 'VARIES',
    risk: 'AGGRESSIVE',
    outlook: 'Strongly Bearish',
    when: 'Want short-futures-like exposure without selling the underlying.',
    howItWorks: 'Sell an ATM call and buy an ATM put at the same strike and expiry. Profit from a falling underlying, identical in P&L to a short futures position.',
    maxProfit: 'Substantial (underlying down to zero).',
    maxLoss: 'Unlimited on the upside.',
    idealIv: 'Any.',
  },
  {
    name: 'Jade Lizard',
    category: 'NON_DIRECTIONAL',
    type: 'CREDIT',
    risk: 'MODERATE',
    outlook: 'Mildly Bullish to Neutral',
    when: 'High IV with a slight bullish bias; want zero upside risk.',
    howItWorks: 'Sell an OTM put + sell a bear call spread. The total premium collected exceeds the width of the call spread, so there is no upside risk. Risk is only on a severe downside move.',
    maxProfit: 'Total premium collected.',
    maxLoss: 'Put strike minus credit received (if underlying crashes).',
    idealIv: 'High to High-Normal.',
  },
]

// ─── Category colors ──────────────────────────────────────────────────────────

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
          <span className={clsx('text-[10px] font-medium ml-1', RISK_COLORS[strategy.risk])}>
            {strategy.risk}
          </span>
        </div>
        <span className="text-xs text-slate-400 hidden sm:block shrink-0">{strategy.outlook}</span>
        {open ? <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />}
      </button>

      {open && (
        <div className="px-4 pb-4 pt-1 space-y-3 border-t border-surface-tertiary text-sm">
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
              q: 'Can I add my own strategies?',
              a: 'The Strategy Builder (coming soon) will let you create and back-test custom strategies. Currently the library has 23 pre-built strategies.',
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
