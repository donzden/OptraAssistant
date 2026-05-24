import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { BookOpen, Search, Heart, TrendingUp, TrendingDown, Minus, Grid, List } from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import { fetchStrategies, toggleFavourite } from '@/api/strategies'
import type { Strategy } from '@/types/strategies'

const CATEGORY_LABELS: Record<string, string> = {
  DIRECTIONAL: 'Directional',
  NON_DIRECTIONAL: 'Non-Directional',
  VOLATILITY: 'Volatility',
}

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

const OUTLOOK_ICONS: Record<string, React.ReactNode> = {
  BULLISH: <TrendingUp className="w-3 h-3 text-emerald-400" />,
  BEARISH: <TrendingDown className="w-3 h-3 text-red-400" />,
  NEUTRAL: <Minus className="w-3 h-3 text-amber-400" />,
}

const IV_LABELS: Record<string, string> = {
  LOW: 'Low IV',
  LOW_NORMAL: 'Low-Normal',
  NORMAL: 'Normal',
  HIGH_NORMAL: 'High-Normal',
  HIGH: 'High IV',
}

function StrategyCard({ strategy, view, onFavourite }: { strategy: Strategy; view: 'grid' | 'list'; onFavourite: () => void }) {
  const navigate = useNavigate()

  if (view === 'list') {
    return (
      <div
        className="flex items-center gap-4 p-3 rounded-xl bg-surface-secondary border border-surface-tertiary hover:border-primary-600/40 cursor-pointer transition-all group"
        onClick={() => navigate(`/library/${strategy.id}`)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-white group-hover:text-primary-300 transition-colors">{strategy.name}</span>
            <span className={clsx('text-[10px] px-1.5 py-0.5 rounded border font-medium', CATEGORY_COLORS[strategy.category])}>
              {CATEGORY_LABELS[strategy.category]}
            </span>
            <span className={clsx('text-[10px] px-1.5 py-0.5 rounded font-medium', TYPE_COLORS[strategy.type])}>
              {strategy.type}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5 truncate">{strategy.description}</p>
        </div>
        <div className="hidden sm:flex items-center gap-4 text-xs shrink-0">
          <div className="flex items-center gap-1 text-slate-400">
            {strategy.outlook.map((o) => <span key={o}>{OUTLOOK_ICONS[o]}</span>)}
          </div>
          <span className={clsx('font-medium', RISK_COLORS[strategy.riskLevel])}>{strategy.riskLevel}</span>
          <span className="text-slate-500">{strategy.dteMin && strategy.dteMax ? `${strategy.dteMin}–${strategy.dteMax}d` : 'Any'}</span>
          {strategy.favouriteCount !== undefined && (
            <span className="text-slate-500 flex items-center gap-0.5">
              <Heart className="w-2.5 h-2.5" /> {strategy.favouriteCount}
            </span>
          )}
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onFavourite() }}
          className={clsx('p-1.5 rounded-lg hover:bg-surface-tertiary shrink-0', strategy.isFavourite ? 'text-red-400' : 'text-slate-500 hover:text-red-400')}
        >
          <Heart className={clsx('w-4 h-4', strategy.isFavourite && 'fill-current')} />
        </button>
      </div>
    )
  }

  return (
    <div
      className="rounded-xl bg-surface-secondary border border-surface-tertiary hover:border-primary-600/40 cursor-pointer transition-all group overflow-hidden"
      onClick={() => navigate(`/library/${strategy.id}`)}
    >
      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <span className={clsx('text-[10px] px-1.5 py-0.5 rounded border font-medium', CATEGORY_COLORS[strategy.category])}>
            {CATEGORY_LABELS[strategy.category]}
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); onFavourite() }}
            className={clsx('p-1 rounded hover:bg-surface-tertiary', strategy.isFavourite ? 'text-red-400' : 'text-slate-500 hover:text-red-400')}
          >
            <Heart className={clsx('w-3.5 h-3.5', strategy.isFavourite && 'fill-current')} />
          </button>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-white group-hover:text-primary-300 transition-colors">{strategy.name}</h3>
          <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">{strategy.description}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={clsx('text-[10px] px-1.5 py-0.5 rounded font-medium', TYPE_COLORS[strategy.type])}>{strategy.type}</span>
          <span className={clsx('text-[10px] font-medium', RISK_COLORS[strategy.riskLevel])}>{strategy.riskLevel}</span>
          {strategy.favouriteCount !== undefined && (
            <span className="text-[10px] text-slate-500 flex items-center gap-0.5 ml-auto">
              <Heart className="w-2.5 h-2.5" /> {strategy.favouriteCount}
            </span>
          )}
        </div>
        <div className="border-t border-surface-tertiary pt-2 grid grid-cols-3 gap-2 text-[10px]">
          <div>
            <span className="text-slate-500">IV</span>
            <p className="text-slate-300 mt-0.5">{strategy.ivLevels.map((l) => IV_LABELS[l] ?? l).join(', ')}</p>
          </div>
          <div>
            <span className="text-slate-500">DTE</span>
            <p className="text-slate-300 mt-0.5">{strategy.dteMin && strategy.dteMax ? `${strategy.dteMin}–${strategy.dteMax}d` : 'Any'}</p>
          </div>
          <div>
            <span className="text-slate-500">Outlook</span>
            <div className="flex items-center gap-1 mt-0.5">
              {strategy.outlook.map((o) => <span key={o}>{OUTLOOK_ICONS[o]}</span>)}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function StrategyLibraryPage() {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [riskLevel, setRiskLevel] = useState('')
  const [type, setType] = useState('')
  const [outlook, setOutlook] = useState('')
  const [sortBy, setSortBy] = useState<'name' | 'category' | 'popularity'>('name')
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const qc = useQueryClient()

  const { data: strategies = [], isLoading } = useQuery({
    queryKey: ['strategies', category, riskLevel, type, outlook],
    queryFn: () => fetchStrategies({ category: category || undefined, riskLevel: riskLevel || undefined, type: type || undefined, outlook: outlook || undefined }),
    staleTime: 5 * 60_000,
  })

  const favMutation = useMutation({
    mutationFn: toggleFavourite,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['strategies'] }),
    onError: () => toast.error('Could not update favourite'),
  })

  const filtered = strategies
    .filter((s) => !search || s.name.toLowerCase().includes(search.toLowerCase()) || s.description.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'popularity') return (b.favouriteCount ?? 0) - (a.favouriteCount ?? 0)
      if (sortBy === 'category') return a.category.localeCompare(b.category)
      return a.name.localeCompare(b.name)
    })

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-primary-400" />
          <h1 className="text-lg font-semibold text-white">Strategy Library</h1>
          <span className="text-xs text-slate-500 ml-1">({filtered.length} strategies)</span>
        </div>
        <div className="flex items-center gap-2 sm:ml-auto">
          <button onClick={() => setView('grid')} className={clsx('p-1.5 rounded', view === 'grid' ? 'text-primary-400 bg-primary-600/20' : 'text-slate-500 hover:text-white')}>
            <Grid className="w-4 h-4" />
          </button>
          <button onClick={() => setView('list')} className={clsx('p-1.5 rounded', view === 'list' ? 'text-primary-400 bg-primary-600/20' : 'text-slate-500 hover:text-white')}>
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search strategies…"
            className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-surface-secondary border border-slate-700 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-primary-500"
          />
        </div>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="px-2.5 py-1.5 rounded-lg bg-surface-secondary border border-slate-700 text-xs text-slate-300 focus:outline-none focus:border-primary-500">
          <option value="">All categories</option>
          <option value="DIRECTIONAL">Directional</option>
          <option value="NON_DIRECTIONAL">Non-Directional</option>
          <option value="VOLATILITY">Volatility</option>
        </select>
        <select value={type} onChange={(e) => setType(e.target.value)} className="px-2.5 py-1.5 rounded-lg bg-surface-secondary border border-slate-700 text-xs text-slate-300 focus:outline-none focus:border-primary-500">
          <option value="">Debit / Credit</option>
          <option value="DEBIT">Debit</option>
          <option value="CREDIT">Credit</option>
        </select>
        <select value={riskLevel} onChange={(e) => setRiskLevel(e.target.value)} className="px-2.5 py-1.5 rounded-lg bg-surface-secondary border border-slate-700 text-xs text-slate-300 focus:outline-none focus:border-primary-500">
          <option value="">All risk profiles</option>
          <option value="CONSERVATIVE">Conservative</option>
          <option value="MODERATE">Moderate</option>
          <option value="AGGRESSIVE">Aggressive</option>
        </select>
        <select value={outlook} onChange={(e) => setOutlook(e.target.value)} className="px-2.5 py-1.5 rounded-lg bg-surface-secondary border border-slate-700 text-xs text-slate-300 focus:outline-none focus:border-primary-500">
          <option value="">All outlooks</option>
          <option value="BULLISH">Bullish</option>
          <option value="BEARISH">Bearish</option>
          <option value="NEUTRAL">Neutral</option>
        </select>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)} className="px-2.5 py-1.5 rounded-lg bg-surface-secondary border border-slate-700 text-xs text-slate-300 focus:outline-none focus:border-primary-500">
          <option value="name">Sort: A–Z</option>
          <option value="category">Sort: Category</option>
          <option value="popularity">Sort: Popularity</option>
        </select>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-16 text-slate-400 text-sm">Loading library…</div>
      )}

      {!isLoading && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 gap-2 text-slate-400 text-sm">
          <BookOpen className="w-8 h-8 text-slate-600" />
          No strategies match your filters
        </div>
      )}

      <div className={clsx(view === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3' : 'space-y-2')}>
        {filtered.map((s) => (
          <StrategyCard
            key={s.id}
            strategy={s}
            view={view}
            onFavourite={() => favMutation.mutate(s.id)}
          />
        ))}
      </div>
    </div>
  )
}
