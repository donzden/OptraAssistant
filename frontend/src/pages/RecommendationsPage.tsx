import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Lightbulb, RefreshCw, TrendingUp, TrendingDown, Minus,
  ChevronDown, ChevronUp, Heart, ExternalLink, AlertCircle,
  Clock,
} from 'lucide-react'
import {
  LineChart, Line, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import { fetchRecommendations, toggleFavourite } from '@/api/strategies'
import type { ScoredStrategy, MarketSignal, Strategy } from '@/types/strategies'

const SYMBOLS = ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY']

const TREND_CONFIG = {
  BULLISH: { label: 'Bullish', Icon: TrendingUp, color: 'text-emerald-400' },
  BEARISH: { label: 'Bearish', Icon: TrendingDown, color: 'text-red-400' },
  SIDEWAYS: { label: 'Sideways', Icon: Minus, color: 'text-amber-400' },
}

const VIX_COLORS = {
  LOW_VOL: 'text-emerald-400 bg-emerald-900/30',
  MODERATE: 'text-amber-400 bg-amber-900/30',
  HIGH_VOL: 'text-orange-400 bg-orange-900/30',
  EXTREME: 'text-red-400 bg-red-900/30',
}

const IV_LABELS: Record<string, string> = {
  LOW: 'Low IV',
  LOW_NORMAL: 'Low-Normal IV',
  NORMAL: 'Normal IV',
  HIGH_NORMAL: 'High-Normal IV',
  HIGH: 'High IV',
}

const TYPE_COLORS = {
  DEBIT: 'text-red-400 bg-red-900/20 border-red-800/40',
  CREDIT: 'text-emerald-400 bg-emerald-900/20 border-emerald-800/40',
  VARIES: 'text-amber-400 bg-amber-900/20 border-amber-800/40',
}

const RISK_COLORS = {
  CONSERVATIVE: 'text-blue-400 bg-blue-900/20 border-blue-800/40',
  MODERATE: 'text-amber-400 bg-amber-900/20 border-amber-800/40',
  AGGRESSIVE: 'text-red-400 bg-red-900/20 border-red-800/40',
}

function estimateRewardRisk(s: Strategy): number {
  if (s.type === 'DEBIT') return s.category === 'DIRECTIONAL' ? 3.0 : 2.0
  if (s.type === 'CREDIT') return s.category === 'NON_DIRECTIONAL' ? 0.8 : 0.6
  return 1.5
}

function buildMiniPayoff(name: string) {
  const pts = Array.from({ length: 11 }, (_, i) => i - 5)
  return pts.map((p) => {
    let y = 0
    if (name.includes('Long Call')) y = Math.max(0, p) - 2
    else if (name.includes('Long Put')) y = Math.max(0, -p) - 2
    else if (
      name.includes('Short Strangle') || name.includes('Iron Condor') || name.includes('Iron Butterfly')
    ) y = Math.max(-4, 2 - Math.max(0, Math.abs(p) - 2))
    else if (name.includes('Long Strangle') || name.includes('Long Iron')) y = Math.min(3, Math.max(-2, Math.abs(p) - 2))
    else if (name.includes('Bull') && name.includes('Spread')) y = Math.min(3, Math.max(-1.5, p - 1))
    else if (name.includes('Bear') && name.includes('Spread')) y = Math.min(3, Math.max(-1.5, -p - 1))
    else if (name.includes('Short Put') || name.includes('Short Call')) y = Math.min(1.5, 1.5 - Math.max(0, Math.abs(p) - 2))
    else if (name.includes('Synthetic')) y = name.includes('Long') ? p : -p
    else y = Math.max(-3, Math.min(3, p * 0.8))
    return { x: p, y: parseFloat(y.toFixed(2)) }
  })
}

function MiniPayoffChart({ name }: { name: string }) {
  const data = buildMiniPayoff(name)
  return (
    <div>
      <p className="text-[10px] text-slate-500 mb-1">Payoff shape (illustrative)</p>
      <ResponsiveContainer width="100%" height={80}>
        <LineChart data={data} margin={{ top: 4, right: 4, left: -30, bottom: 0 }}>
          <ReferenceLine y={0} stroke="#475569" strokeDasharray="3 2" />
          <Line type="monotone" dataKey="y" stroke="#6366f1" strokeWidth={1.5} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function MarketBanner({ signal }: { signal: MarketSignal }) {
  const trend = TREND_CONFIG[signal.trend] ?? TREND_CONFIG.SIDEWAYS
  const TrendIcon = trend.Icon
  const vixClass = VIX_COLORS[signal.vix_regime] ?? VIX_COLORS.MODERATE

  return (
    <div className="rounded-xl bg-surface-secondary border border-surface-tertiary p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">
          Market Conditions — {signal.instrument}
        </h2>
        <span className="text-xs text-slate-500 flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {new Date(signal.last_updated).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
          {signal.is_mock && <span className="ml-1 px-1.5 py-0.5 rounded text-[10px] bg-amber-900/40 text-amber-400 border border-amber-800/40">MOCK</span>}
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-slate-500">Trend</span>
          <span className={clsx('text-sm font-semibold flex items-center gap-1', trend.color)}>
            <TrendIcon className="w-3.5 h-3.5" /> {trend.label}
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-slate-500">IV Regime</span>
          <span className="text-sm font-semibold text-white">{IV_LABELS[signal.iv_regime] ?? signal.iv_regime}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-slate-500">IV Rank</span>
          <span className="text-sm font-semibold text-white">{signal.iv_rank.toFixed(0)}%</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-slate-500">VIX</span>
          <span className={clsx('text-sm font-semibold px-1.5 py-0.5 rounded-md w-fit', vixClass)}>
            {signal.vix.toFixed(1)}
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-slate-500">Market Phase</span>
          <span className="text-sm font-semibold text-white">{signal.market_phase.replace('_', ' ')}</span>
        </div>
      </div>
    </div>
  )
}

function ScoreBar({ score }: { score: number }) {
  const pct = Math.min(score, 100)
  const color = score >= 80 ? 'bg-emerald-500' : score >= 65 ? 'bg-amber-500' : 'bg-orange-500'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-slate-700">
        <div className={clsx('h-1.5 rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-medium text-slate-300 w-7 text-right">{score}</span>
    </div>
  )
}

function StrategyCard({
  item,
  rank,
  onFavouriteToggle,
}: {
  item: ScoredStrategy
  rank: number
  onFavouriteToggle: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const { strategy, score, explanation, condition_checks } = item
  const navigate = useNavigate()

  const rankColor = rank === 1 ? 'bg-yellow-500' : rank === 2 ? 'bg-slate-400' : rank === 3 ? 'bg-amber-700' : 'bg-slate-600'

  return (
    <div className="rounded-xl bg-surface-secondary border border-surface-tertiary overflow-hidden">
      <div className="p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className={clsx('w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0', rankColor)}>
            {rank}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold text-white">{strategy.name}</h3>
              <span className={clsx('text-[10px] px-1.5 py-0.5 rounded border font-medium', TYPE_COLORS[strategy.type])}>
                {strategy.type}
              </span>
              <span className={clsx('text-[10px] px-1.5 py-0.5 rounded border font-medium', RISK_COLORS[strategy.riskLevel])}>
                {strategy.riskLevel}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{strategy.description}</p>
          </div>
          <button
            onClick={() => onFavouriteToggle(strategy.id)}
            className={clsx('shrink-0 p-1.5 rounded-lg hover:bg-surface-tertiary transition-colors', strategy.isFavourite ? 'text-red-400' : 'text-slate-500 hover:text-red-400')}
          >
            <Heart className={clsx('w-4 h-4', strategy.isFavourite && 'fill-current')} />
          </button>
        </div>

        <ScoreBar score={score} />

        {explanation && (
          <p className="text-xs text-slate-400 leading-relaxed line-clamp-2">{explanation}</p>
        )}

        <div className="flex items-center gap-2">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-xs text-primary-400 hover:text-primary-300"
          >
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            {expanded ? 'Less' : 'More details'}
          </button>
          <button
            onClick={() => navigate(`/library/${strategy.id}`)}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-white ml-auto"
          >
            <ExternalLink className="w-3 h-3" /> View detail
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-surface-tertiary p-4 space-y-4 bg-surface-tertiary/20">
          {explanation && <p className="text-xs text-slate-300 leading-relaxed">{explanation}</p>}

          <MiniPayoffChart name={strategy.name} />

          <div className="grid grid-cols-2 gap-2">
            {Object.entries(condition_checks).map(([key, check]) => (
              <div key={key} className={clsx('rounded-lg p-2.5 border text-xs', check.passed ? 'bg-emerald-900/20 border-emerald-800/40' : 'bg-slate-800/40 border-slate-700/40')}>
                <div className="flex items-center justify-between mb-0.5">
                  <span className="font-medium text-slate-300 capitalize">{key.replace('_', ' ')}</span>
                  <span className={clsx('font-semibold', check.passed ? 'text-emerald-400' : 'text-slate-500')}>
                    {check.score}/{check.max}
                  </span>
                </div>
                <p className="text-slate-400 leading-snug">{check.reason}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div>
              <span className="text-slate-500">Max Profit</span>
              <p className="text-emerald-400 font-medium mt-0.5">{strategy.rules.max_profit}</p>
            </div>
            <div>
              <span className="text-slate-500">Max Loss</span>
              <p className="text-red-400 font-medium mt-0.5">{strategy.rules.max_loss}</p>
            </div>
            <div>
              <span className="text-slate-500">DTE</span>
              <p className="text-white font-medium mt-0.5">
                {strategy.dteMin && strategy.dteMax ? `${strategy.dteMin}–${strategy.dteMax} days` : 'Any'}
              </p>
            </div>
            <div>
              <span className="text-slate-500">Entry</span>
              <p className="text-white mt-0.5 leading-snug">{strategy.rules.entry}</p>
            </div>
          </div>

          <button
            onClick={() => navigate(`/library/${strategy.id}`)}
            className="w-full py-2 rounded-lg bg-primary-600/20 hover:bg-primary-600/30 text-primary-400 text-xs font-medium border border-primary-600/30 transition-colors"
          >
            Launch in Builder
          </button>
        </div>
      )}
    </div>
  )
}

export default function RecommendationsPage() {
  const [symbol, setSymbol] = useState('NIFTY')
  const [filterType, setFilterType] = useState<string>('')
  const [filterRisk, setFilterRisk] = useState<string>('')
  const [sortBy, setSortBy] = useState<'score' | 'name' | 'rewardRisk'>('score')
  const qc = useQueryClient()

  const { data, isLoading, isRefetching, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['recommendations', symbol],
    queryFn: () => fetchRecommendations(symbol),
    staleTime: 5 * 60_000,
  })

  const favMutation = useMutation({
    mutationFn: toggleFavourite,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recommendations'] })
      qc.invalidateQueries({ queryKey: ['favourites'] })
    },
    onError: () => toast.error('Could not update favourite'),
  })

  const ranked = data?.ranked ?? []
  const filtered = ranked
    .filter((r) => !filterType || r.strategy.type === filterType)
    .filter((r) => !filterRisk || r.strategy.riskLevel === filterRisk)
    .sort((a, b) => {
      if (sortBy === 'rewardRisk') return estimateRewardRisk(b.strategy) - estimateRewardRisk(a.strategy)
      if (sortBy === 'score') return b.score - a.score
      return a.strategy.name.localeCompare(b.strategy.name)
    })

  return (
    <div className="space-y-5 max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-2">
          <Lightbulb className="w-5 h-5 text-primary-400" />
          <h1 className="text-lg font-semibold text-white">Today's Recommendations</h1>
        </div>
        <div className="flex items-center gap-2 sm:ml-auto flex-wrap">
          {SYMBOLS.map((s) => (
            <button
              key={s}
              onClick={() => setSymbol(s)}
              className={clsx('px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors', symbol === s ? 'bg-primary-600/20 text-primary-400 border-primary-600/40' : 'text-slate-400 border-slate-700 hover:text-white hover:border-slate-500')}
            >
              {s}
            </button>
          ))}
          <button
            onClick={() => refetch()}
            disabled={isRefetching}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-surface-tertiary border border-slate-700 transition-colors"
          >
            <RefreshCw className={clsx('w-3.5 h-3.5', isRefetching && 'animate-spin')} />
          </button>
        </div>
      </div>

      {data?.market_signal && <MarketBanner signal={data.market_signal} />}

      <div className="flex flex-wrap gap-2 items-center">
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="px-2.5 py-1.5 rounded-lg bg-surface-secondary border border-slate-700 text-xs text-slate-300 focus:outline-none focus:border-primary-500"
        >
          <option value="">All types</option>
          <option value="DEBIT">Debit</option>
          <option value="CREDIT">Credit</option>
        </select>
        <select
          value={filterRisk}
          onChange={(e) => setFilterRisk(e.target.value)}
          className="px-2.5 py-1.5 rounded-lg bg-surface-secondary border border-slate-700 text-xs text-slate-300 focus:outline-none focus:border-primary-500"
        >
          <option value="">All risk profiles</option>
          <option value="CONSERVATIVE">Conservative</option>
          <option value="MODERATE">Moderate</option>
          <option value="AGGRESSIVE">Aggressive</option>
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          className="px-2.5 py-1.5 rounded-lg bg-surface-secondary border border-slate-700 text-xs text-slate-300 focus:outline-none focus:border-primary-500"
        >
          <option value="score">Sort: Score</option>
          <option value="rewardRisk">Sort: Reward/Risk</option>
          <option value="name">Sort: Name</option>
        </select>
        {dataUpdatedAt > 0 && (
          <span className="text-xs text-slate-500 ml-auto">
            Updated {new Date(dataUpdatedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-20 text-slate-400">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Analysing market conditions…
        </div>
      )}

      {!isLoading && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
          <AlertCircle className="w-10 h-10 text-slate-600" />
          <p className="text-slate-400 text-sm font-medium">Market conditions don't favour any high-confidence strategy today</p>
          <p className="text-slate-500 text-xs">Try adjusting your filters or check back at market open</p>
        </div>
      )}

      <div className="space-y-3">
        {filtered.map((item, idx) => (
          <StrategyCard
            key={item.strategy.id}
            item={item}
            rank={idx + 1}
            onFavouriteToggle={(id) => favMutation.mutate(id)}
          />
        ))}
      </div>
    </div>
  )
}
