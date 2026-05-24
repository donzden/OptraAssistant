import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, Heart, Wrench, Bookmark, Sparkles, RefreshCw,
  TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp,
} from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine, CartesianGrid,
} from 'recharts'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import { fetchStrategy, fetchStrategies, toggleFavourite, explainStrategy, addToWatchlist, removeFromWatchlistByStrategy, fetchWatchlist } from '@/api/strategies'

const CATEGORY_LABELS: Record<string, string> = {
  DIRECTIONAL: 'Directional',
  NON_DIRECTIONAL: 'Non-Directional',
  VOLATILITY: 'Volatility',
}

const TYPE_COLORS: Record<string, string> = {
  DEBIT: 'text-red-400 bg-red-900/20 border-red-800/40',
  CREDIT: 'text-emerald-400 bg-emerald-900/20 border-emerald-800/40',
  VARIES: 'text-amber-400 bg-amber-900/20 border-amber-800/40',
}

const RISK_COLORS: Record<string, string> = {
  CONSERVATIVE: 'text-blue-300 bg-blue-900/20 border-blue-800/40',
  MODERATE: 'text-amber-300 bg-amber-900/20 border-amber-800/40',
  AGGRESSIVE: 'text-red-300 bg-red-900/20 border-red-800/40',
}

const OUTLOOK_ICONS: Record<string, React.ReactNode> = {
  BULLISH: <TrendingUp className="w-4 h-4 text-emerald-400" />,
  BEARISH: <TrendingDown className="w-4 h-4 text-red-400" />,
  NEUTRAL: <Minus className="w-4 h-4 text-amber-400" />,
}

const IV_LABELS: Record<string, string> = {
  LOW: 'Low IV (rank <30%)',
  LOW_NORMAL: 'Low-Normal IV (rank 30–50%)',
  NORMAL: 'Normal IV (rank 50–65%)',
  HIGH_NORMAL: 'High-Normal IV (rank 65–80%)',
  HIGH: 'High IV (rank >80%)',
}

function buildPayoffData(strategyName: string, spotOffset = 0) {
  const spot = 100
  const center = spot + spotOffset
  const moves = Array.from({ length: 21 }, (_, i) => center - 10 + i)

  const payoffFn = (s: number): number => {
    const p = (s - spot) / spot   // signed % move from entry price
    const a = Math.abs(p)         // absolute % move

    // ── Single-leg directional ──────────────────────────────────────────────
    if (strategyName === 'Long Call')
      return Math.max(0, p * 100) - 2
    if (strategyName === 'Long Put')
      return Math.max(0, -p * 100) - 2
    if (strategyName === 'Short Call')
      return Math.min(2, 2 - Math.max(0, p * 100))
    if (strategyName === 'Short Put')
      return Math.min(2, 2 + Math.min(0, p * 100))
    if (strategyName === 'Long Synthetic')  return p * 100
    if (strategyName === 'Short Synthetic') return -p * 100

    // ── Vertical debit spreads ──────────────────────────────────────────────
    // Bull Call Spread: buy ATM CE, sell OTM CE — max loss below, max profit above upper
    if (strategyName === 'Bull Call Spread') {
      const v = p * 100
      return v <= 0 ? -2 : v >= 5 ? 3 : -2 + v
    }
    // Bear Put Spread: mirror image — profits on downside move
    if (strategyName === 'Bear Put Spread') {
      const v = -p * 100
      return v <= 0 ? -2 : v >= 5 ? 3 : -2 + v
    }

    // ── Vertical credit spreads ─────────────────────────────────────────────
    // Bull Put Spread: sell OTM PE, buy further OTM PE — profits when bullish / flat
    if (strategyName === 'Bull Put Spread') {
      const v = p * 100
      return v >= -3 ? 2 : v <= -8 ? -3 : 2 + (v + 3)
    }
    // Bear Call Spread: sell OTM CE, buy further OTM CE — profits when bearish / flat
    if (strategyName === 'Bear Call Spread') {
      const v = -p * 100
      return v >= -3 ? 2 : v <= -8 ? -3 : 2 + (v + 3)
    }

    // ── Short neutral — credit / theta decay ───────────────────────────────
    // Short Strangle: sell OTM CE + PE, flat profit zone, then unlimited loss
    if (strategyName === 'Short Strangle') {
      if (a <= 0.04) return 2
      return Math.max(-6, 2 - (a - 0.04) * 100)
    }
    // Short Iron Condor: like strangle but wings cap the loss
    if (strategyName === 'Short Iron Condor') {
      if (a <= 0.03) return 2
      if (a <= 0.08) return 2 - (a - 0.03) * 100
      return -3
    }
    // Short Iron Butterfly: sells ATM straddle — sharper tent, peak at ATM
    if (strategyName === 'Short Iron Butterfly')
      return Math.max(-2, 3 - a * 100 * 0.83)
    // Double Diagonal: calendar + condor — wider flat zone, limited downside
    if (strategyName === 'Double Diagonal') {
      if (a <= 0.03) return 2
      return Math.max(-1.5, 2 - (a - 0.03) * 100 * 0.9)
    }

    // ── Long neutral — debit / volatility expansion ─────────────────────────
    // Long Strangle: buy OTM CE + PE — loss in middle, profits on big moves
    if (strategyName === 'Long Strangle') {
      if (a <= 0.04) return -2
      return Math.min(5, -2 + (a - 0.04) * 100)
    }
    // Long Iron Condor: buy inner OTM, sell outer OTM — loss in zone, profit at wings
    if (strategyName === 'Long Iron Condor') {
      if (a <= 0.04) return -2
      if (a <= 0.08) return -2 + (a - 0.04) * 100
      return 2
    }
    // Long Iron Butterfly: buys ATM straddle — V-trough at ATM, rises to wing cap
    if (strategyName === 'Long Iron Butterfly')
      return Math.min(2, -3 + a * 100 * 0.83)

    // ── Calendar spreads ───────────────────────────────────────────────────
    // Dome shape: peak profit when spot near strike at near-expiry, limited loss at extremes
    if (strategyName === 'Put Calendar Spread' || strategyName === 'Call Calendar Spread')
      return Math.max(-1.5, 2.5 - a * 100 * 0.8)

    // ── Ratio & complex strategies ─────────────────────────────────────────
    // Put Ratio Back Spread: sell 1 higher PE, buy 2 lower PEs
    // Small credit on upside, loss between strikes, growing profit on large downside
    if (strategyName === 'Put Ratio Back Spread') {
      if (p >= -0.01) return 0.5
      if (p >= -0.05) return 0.5 + (p + 0.01) * 100 * 0.75
      return Math.min(4, -2.5 + (-p - 0.05) * 100)
    }
    // Call Ratio Front Spread / Call Ratio Spread: buy 1 lower CE, sell 2 higher CEs
    // Flat below, profit in sweet spot, steep loss on strong upside
    if (strategyName === 'Call Ratio Front Spread' || strategyName === 'Call Ratio Spread') {
      if (p <= 0.01) return 0.5
      if (p <= 0.05) return 0.5 + (p - 0.01) * 100 * 0.625
      return Math.max(-4, 3 - (p - 0.05) * 100 * 1.5)
    }
    // Breakout for Free: sell 2 OTM PEs, buy 1 OTM CE
    // Profit on strong upside (CE), flat in middle (put premium), loss on large downside
    if (strategyName === 'Breakout for Free') {
      if (p >= 0) return Math.min(5, 1.5 + p * 100 * 0.8)
      if (p >= -0.04) return 1.5
      return Math.max(-5, 1.5 + (p + 0.04) * 100 * 0.75)
    }

    return Math.max(-3, Math.min(3, p * 80))
  }

  return moves.map((s) => ({
    price: `${s > spot ? '+' : ''}${((s - spot) / spot * 100).toFixed(0)}%`,
    pnl: parseFloat(payoffFn(s).toFixed(2)),
  }))
}

function PayoffDiagram({ strategyName, spotOffset }: { strategyName: string; spotOffset: number }) {
  const data = buildPayoffData(strategyName, spotOffset)
  const currentLabel = `${spotOffset >= 0 ? '+' : ''}${spotOffset}%`

  return (
    <div className="rounded-xl bg-surface-secondary border border-surface-tertiary p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-300">Payoff Diagram (illustrative)</h3>
        {spotOffset !== 0 && (
          <span className="text-[10px] text-amber-400 border border-amber-800/40 bg-amber-900/20 px-1.5 py-0.5 rounded">
            Spot {currentLabel}
          </span>
        )}
      </div>
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="price" tick={{ fill: '#94a3b8', fontSize: 10 }} />
          <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} />
          <Tooltip
            contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 11 }}
            labelStyle={{ color: '#cbd5e1' }}
            formatter={(v: number) => [v > 0 ? `+${v}` : `${v}`, 'P&L']}
          />
          <ReferenceLine y={0} stroke="#475569" strokeDasharray="4 2" />
          {spotOffset !== 0 && (
            <ReferenceLine
              x={currentLabel}
              stroke="#f59e0b"
              strokeWidth={1.5}
              strokeDasharray="4 2"
              label={{ value: 'now', fill: '#f59e0b', fontSize: 9, position: 'insideTopRight' }}
            />
          )}
          <Line
            type="monotone"
            dataKey="pnl"
            stroke="#6366f1"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
      <p className="text-[10px] text-slate-500 mt-2">X-axis: underlying % move from entry price. Y-axis: relative P&L (normalised).</p>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="rounded-xl bg-surface-secondary border border-surface-tertiary overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-slate-200 hover:bg-surface-tertiary/30 transition-colors"
      >
        {title}
        {open ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  )
}

export default function StrategyDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [explanation, setExplanation] = useState<string | null>(null)
  const [explainLoading, setExplainLoading] = useState(false)
  const [spotOffset, setSpotOffset] = useState(0)

  const { data: strategy, isLoading } = useQuery({
    queryKey: ['strategy', id],
    queryFn: () => fetchStrategy(id!),
    enabled: !!id,
  })

  const { data: allStrategies = [] } = useQuery({
    queryKey: ['strategies'],
    queryFn: () => fetchStrategies({}),
    staleTime: 5 * 60_000,
    enabled: !!strategy,
  })

  const similar = allStrategies
    .filter((s) => s.category === strategy?.category && s.id !== id)
    .slice(0, 3)

  const { data: watchlist = [] } = useQuery({
    queryKey: ['watchlist'],
    queryFn: () => fetchWatchlist(),
    staleTime: 5 * 60_000,
  })
  const isWatchlisted = watchlist.some((w) => w.strategyId === id)

  const favMutation = useMutation({
    mutationFn: () => toggleFavourite(id!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['strategy', id] })
      qc.invalidateQueries({ queryKey: ['strategies'] })
    },
    onError: () => toast.error('Could not update favourite'),
  })

  const watchlistMutation = useMutation<void>({
    mutationFn: async () => {
      if (isWatchlisted) {
        await removeFromWatchlistByStrategy(id!)
      } else {
        await addToWatchlist(id!)
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['watchlist'] })
      toast.success(isWatchlisted ? 'Removed from watchlist' : 'Added to watchlist')
    },
    onError: () => toast.error('Could not update watchlist'),
  })

  const handleExplain = async (detailed = false) => {
    if (!id) return
    setExplainLoading(true)
    try {
      const text = await explainStrategy(id, 'NIFTY', detailed)
      setExplanation(text)
    } catch {
      toast.error('AI explanation unavailable')
    } finally {
      setExplainLoading(false)
    }
  }

  if (isLoading) return (
    <div className="flex items-center justify-center h-64 text-slate-400">
      <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading…
    </div>
  )

  if (!strategy) return (
    <div className="flex items-center justify-center h-64 text-slate-400">Strategy not found</div>
  )

  const rules = strategy.rules

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-surface-tertiary transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold text-white">{strategy.name}</h1>
          <p className="text-xs text-slate-400">{CATEGORY_LABELS[strategy.category]} · {strategy.source}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => favMutation.mutate()}
            className={clsx('p-1.5 rounded-lg border transition-colors', strategy.isFavourite ? 'text-red-400 border-red-800/40 bg-red-900/20' : 'text-slate-400 border-slate-700 hover:text-red-400')}
          >
            <Heart className={clsx('w-4 h-4', strategy.isFavourite && 'fill-current')} />
          </button>
          <button
            onClick={() => watchlistMutation.mutate()}
            className={clsx('p-1.5 rounded-lg border transition-colors', isWatchlisted ? 'text-amber-400 border-amber-800/40 bg-amber-900/20' : 'text-slate-400 border-slate-700 hover:text-amber-400')}
            title={isWatchlisted ? 'Remove from watchlist' : 'Add to watchlist'}
          >
            <Bookmark className={clsx('w-4 h-4', isWatchlisted && 'fill-current')} />
          </button>
          <button
            onClick={() => navigate(`/builder?templateId=${id}`)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-xs font-medium transition-colors"
          >
            <Wrench className="w-3.5 h-3.5" /> Launch in Builder
          </button>
        </div>
      </div>

      <Section title="Overview">
        <div className="space-y-3">
          <p className="text-sm text-slate-300 leading-relaxed">{strategy.description}</p>
          <div className="flex flex-wrap gap-2">
            <span className={clsx('text-xs px-2 py-1 rounded border font-medium', TYPE_COLORS[strategy.type])}>{strategy.type}</span>
            <span className={clsx('text-xs px-2 py-1 rounded border font-medium', RISK_COLORS[strategy.riskLevel])}>{strategy.riskLevel}</span>
            {strategy.outlook.map((o) => (
              <span key={o} className="flex items-center gap-1 text-xs px-2 py-1 rounded border border-slate-700 text-slate-300">
                {OUTLOOK_ICONS[o]} {o.charAt(0) + o.slice(1).toLowerCase()}
              </span>
            ))}
          </div>
        </div>
      </Section>

      <Section title="Setup Conditions">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          <div>
            <p className="text-xs text-slate-500 mb-1">IV Environment</p>
            <ul className="space-y-0.5">
              {strategy.ivLevels.map((l) => (
                <li key={l} className="text-slate-300 text-xs">• {IV_LABELS[l] ?? l}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-1">Days to Expiry</p>
            <p className="text-slate-300 text-xs">{strategy.dteMin && strategy.dteMax ? `${strategy.dteMin}–${strategy.dteMax} days` : 'Any expiry'}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-1">Strike Zone</p>
            <p className="text-slate-300 text-xs">{strategy.conditions.zone}</p>
          </div>
        </div>
      </Section>

      <Section title="Legs Structure">
        <div className="space-y-2">
          {(strategy.legs ?? []).map((leg, i) => (
            <div key={i} className={clsx('flex items-center gap-3 px-3 py-2 rounded-lg text-xs border', leg.type === 'BUY' ? 'bg-emerald-900/10 border-emerald-800/30' : 'bg-red-900/10 border-red-800/30')}>
              <span className={clsx('font-bold text-sm', leg.type === 'BUY' ? 'text-emerald-400' : 'text-red-400')}>{leg.type}</span>
              <span className="text-slate-300">{leg.lots}× {leg.optionType}</span>
              <span className="text-slate-400">{leg.strikeOffset === 0 ? 'ATM' : `${leg.strikeOffset > 0 ? '+' : ''}${leg.strikeOffset} strike${Math.abs(leg.strikeOffset) > 1 ? 's' : ''} OTM`}</span>
              {leg.expiry && <span className="text-slate-500">({leg.expiry} expiry)</span>}
            </div>
          ))}
        </div>
      </Section>

      {rules && (
        <>
          <Section title="Entry Rules">
            <div className="space-y-2 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-slate-500">Entry</p>
                  <p className="text-slate-300 mt-0.5 text-xs leading-relaxed">{rules.entry}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Strike Selection</p>
                  <p className="text-slate-300 mt-0.5 text-xs leading-relaxed">{rules.strike_selection}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Delta</p>
                  <p className="text-slate-300 mt-0.5 text-xs">{rules.delta}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Vega / Theta</p>
                  <p className="text-slate-300 mt-0.5 text-xs">{rules.vega} vega, {rules.theta} theta</p>
                </div>
              </div>
            </div>
          </Section>

          <Section title="Exit Rules">
            <p className="text-sm text-slate-300 leading-relaxed">{rules.exit}</p>
          </Section>

          <Section title="Risk / Reward">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="rounded-lg bg-emerald-900/10 border border-emerald-800/30 p-3">
                <p className="text-xs text-slate-500 mb-1">Max Profit</p>
                <p className="text-emerald-400 font-semibold">{rules.max_profit}</p>
              </div>
              <div className="rounded-lg bg-red-900/10 border border-red-800/30 p-3">
                <p className="text-xs text-slate-500 mb-1">Max Loss</p>
                <p className="text-red-400 font-semibold">{rules.max_loss}</p>
              </div>
            </div>
          </Section>
        </>
      )}

      <PayoffDiagram strategyName={strategy.name} spotOffset={spotOffset} />

      <div className="rounded-xl bg-surface-secondary border border-surface-tertiary px-4 py-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-400">Spot offset: <span className="text-white font-medium">{spotOffset >= 0 ? '+' : ''}{spotOffset}%</span></span>
          <button onClick={() => setSpotOffset(0)} className="text-[10px] text-slate-500 hover:text-slate-300">Reset</button>
        </div>
        <input
          type="range"
          min={-15}
          max={15}
          step={1}
          value={spotOffset}
          onChange={(e) => setSpotOffset(Number(e.target.value))}
          className="w-full accent-primary-500"
        />
        <div className="flex justify-between text-[10px] text-slate-600">
          <span>−15%</span>
          <span>0%</span>
          <span>+15%</span>
        </div>
      </div>

      <div className="rounded-xl bg-surface-secondary border border-surface-tertiary p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary-400" />
            <h3 className="text-sm font-semibold text-white">AI Explanation</h3>
          </div>
          <div className="flex items-center gap-2">
            {explanation && (
              <button
                onClick={() => handleExplain(true)}
                disabled={explainLoading}
                className="text-xs text-slate-400 hover:text-primary-400 transition-colors"
              >
                Explain More
              </button>
            )}
            <button
              onClick={() => handleExplain(false)}
              disabled={explainLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-600/20 hover:bg-primary-600/30 text-primary-400 text-xs font-medium border border-primary-600/30 transition-colors disabled:opacity-50"
            >
              {explainLoading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
              {explanation ? 'Refresh' : 'Explain This'}
            </button>
          </div>
        </div>
        {explanation ? (
          <p className="text-sm text-slate-300 leading-relaxed">{explanation}</p>
        ) : (
          <p className="text-xs text-slate-500">Click "Explain This" to get an AI-powered explanation of why this strategy may fit current market conditions.</p>
        )}
      </div>

      <div className="rounded-xl bg-surface-secondary border border-surface-tertiary p-4 space-y-2">
        <h3 className="text-sm font-semibold text-white">When to Use</h3>
        <ul className="space-y-1 text-xs text-slate-300">
          <li className="flex items-start gap-2"><span className="text-emerald-400 mt-0.5">✓</span> IV is {strategy.ivLevels.map((l) => l.toLowerCase().replace('_', '-')).join(' or ')}</li>
          <li className="flex items-start gap-2"><span className="text-emerald-400 mt-0.5">✓</span> Market outlook is {strategy.outlook.map((o) => o.toLowerCase()).join(' or ')}</li>
          {strategy.dteMin && strategy.dteMax && <li className="flex items-start gap-2"><span className="text-emerald-400 mt-0.5">✓</span> {strategy.dteMin}–{strategy.dteMax} days to expiry available</li>}
          <li className="flex items-start gap-2"><span className="text-emerald-400 mt-0.5">✓</span> Strike zone: {strategy.conditions.zone}</li>
        </ul>
        <h3 className="text-sm font-semibold text-white pt-2">When NOT to Use</h3>
        <ul className="space-y-1 text-xs text-slate-300">
          <li className="flex items-start gap-2"><span className="text-red-400 mt-0.5">✗</span> IV conditions are opposite to strategy requirements</li>
          <li className="flex items-start gap-2"><span className="text-red-400 mt-0.5">✗</span> Strong trend contradicts the strategy's outlook</li>
          <li className="flex items-start gap-2"><span className="text-red-400 mt-0.5">✗</span> Major economic events (RBI, elections, budget) that can spike IV unpredictably</li>
        </ul>
      </div>

      {similar.length > 0 && (
        <div className="rounded-xl bg-surface-secondary border border-surface-tertiary p-4 space-y-3">
          <h3 className="text-sm font-semibold text-white">Similar Strategies</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {similar.map((s) => (
              <button
                key={s.id}
                onClick={() => navigate(`/library/${s.id}`)}
                className="text-left p-3 rounded-lg bg-surface-tertiary/40 hover:bg-surface-tertiary border border-surface-tertiary hover:border-primary-600/40 transition-all group"
              >
                <p className="text-xs font-medium text-white group-hover:text-primary-300 transition-colors">{s.name}</p>
                <p className="text-[10px] text-slate-400 mt-0.5 line-clamp-2">{s.description}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
