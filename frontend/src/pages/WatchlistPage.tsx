import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Bell, BellOff, Trash2, ExternalLink, RefreshCw, Eye,
  ChevronDown, ChevronUp, AlertCircle, Plus, BookOpen,
} from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import {
  fetchWatchlist, removeFromWatchlist, updateWatchlistItem,
} from '@/api/strategies'
import type { WatchlistItem } from '@/types/strategies'

function matchColor(pct: number | null | undefined) {
  if (pct == null) return 'text-slate-500 border-slate-700 bg-slate-800/20'
  if (pct >= 80) return 'text-emerald-400 border-emerald-800/40 bg-emerald-900/20'
  if (pct >= 50) return 'text-amber-400 border-amber-800/40 bg-amber-900/20'
  return 'text-red-400 border-red-800/40 bg-red-900/20'
}

function matchDot(pct: number | null | undefined) {
  if (pct == null) return 'bg-slate-600'
  if (pct >= 80) return 'bg-emerald-500'
  if (pct >= 50) return 'bg-amber-500'
  return 'bg-red-500'
}

function AlertRow({
  item,
  onUpdate,
  onRemove,
}: {
  item: WatchlistItem
  onUpdate: (id: string, body: { notes?: string; alertThreshold?: number; alertEnabled?: boolean }) => void
  onRemove: (id: string) => void
}) {
  const navigate = useNavigate()
  const [expanded, setExpanded] = useState(false)
  const [notes, setNotes] = useState(item.notes ?? '')
  const [threshold, setThreshold] = useState(item.alertThreshold)
  const [alertEnabled, setAlertEnabled] = useState(item.alertEnabled)
  const [dirty, setDirty] = useState(false)

  const save = () => {
    onUpdate(item.id, { notes, alertThreshold: threshold, alertEnabled })
    setDirty(false)
  }

  const pct = item.lastMatchPct

  return (
    <div className="rounded-xl bg-surface-secondary border border-surface-tertiary overflow-hidden">
      {/* Main row */}
      <div className="flex items-center gap-3 p-3">
        {/* Dot */}
        <div className={clsx('w-2.5 h-2.5 rounded-full shrink-0', matchDot(pct))} />

        {/* Strategy name + info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-white truncate">{item.strategy.name}</p>
            <span className="shrink-0 text-[10px] text-slate-500">{item.strategy.category.replace('_', '-').toLowerCase()}</span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] text-slate-500">{item.strategy.legs.length} legs</span>
            {item.lastCheckedAt && (
              <span className="text-[10px] text-slate-600">
                · checked {new Date(item.lastCheckedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
        </div>

        {/* Match % badge */}
        <div className={clsx('shrink-0 text-xs font-bold px-2 py-0.5 rounded border', matchColor(pct))}>
          {pct != null ? `${pct}%` : '—'}
        </div>

        {/* Alert icon */}
        <button
          onClick={() => {
            setAlertEnabled(!alertEnabled)
            setDirty(true)
          }}
          className={clsx('shrink-0 p-1.5 rounded-lg transition-colors', alertEnabled ? 'text-amber-400 hover:text-amber-300' : 'text-slate-500 hover:text-slate-300')}
          title={alertEnabled ? 'Alerts on' : 'Alerts off'}
        >
          {alertEnabled ? <Bell className="w-3.5 h-3.5" /> : <BellOff className="w-3.5 h-3.5" />}
        </button>

        {/* Expand */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="shrink-0 text-slate-500 hover:text-slate-300 transition-colors p-1"
        >
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>

        {/* Remove */}
        <button
          onClick={() => onRemove(item.id)}
          className="shrink-0 text-slate-500 hover:text-red-400 transition-colors p-1"
          title="Remove from watchlist"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Expanded panel */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-surface-tertiary pt-3 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Alert threshold */}
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">
                Alert when match &gt; <span className="text-white font-medium">{threshold}%</span>
              </label>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={threshold}
                onChange={(e) => { setThreshold(Number(e.target.value)); setDirty(true) }}
                className="w-full accent-primary-500"
              />
              <div className="flex justify-between text-[9px] text-slate-600 mt-0.5">
                <span>0%</span><span>50%</span><span>100%</span>
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Notes</label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => { setNotes(e.target.value); setDirty(true) }}
                className="w-full bg-surface-tertiary border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-primary-500 resize-none"
                placeholder="e.g. waiting for NIFTY to test 22,500…"
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <button
              onClick={() => navigate(`/library/${item.strategyId}`)}
              className="flex items-center gap-1 text-[10px] text-primary-400 hover:text-primary-300 transition-colors"
            >
              <ExternalLink className="w-3 h-3" /> View strategy detail
            </button>
            {dirty && (
              <button
                onClick={save}
                className="px-3 py-1 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-xs transition-colors"
              >
                Save
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function WatchlistPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()

  const { data: items = [], isLoading, isFetching, refetch } = useQuery({
    queryKey: ['watchlist'],
    queryFn: () => fetchWatchlist(),
    staleTime: 30 * 60_000,
  })

  const removeMutation = useMutation({
    mutationFn: removeFromWatchlist,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['watchlist'] }); toast.success('Removed from watchlist') },
    onError: () => toast.error('Failed to remove from watchlist'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { notes?: string; alertThreshold?: number; alertEnabled?: boolean } }) =>
      updateWatchlistItem(id, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['watchlist'] }); toast.success('Watchlist updated') },
    onError: () => toast.error('Failed to update watchlist'),
  })

  const greenCount = items.filter((i) => (i.lastMatchPct ?? 0) >= 80).length
  const amberCount = items.filter((i) => (i.lastMatchPct ?? 0) >= 50 && (i.lastMatchPct ?? 0) < 80).length

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-white">Strategy Watchlist</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Monitor market conditions for your strategies · refreshes every 30 min
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:text-white text-xs transition-colors disabled:opacity-50"
          >
            <RefreshCw className={clsx('w-3.5 h-3.5', isFetching && 'animate-spin')} />
            Refresh
          </button>
          <button
            onClick={() => navigate('/library')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-xs font-medium transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Add Strategy
          </button>
        </div>
      </div>

      {/* Summary bar */}
      {items.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'High Match (≥80%)', count: greenCount, color: 'text-emerald-400' },
            { label: 'Medium (50–79%)', count: amberCount, color: 'text-amber-400' },
            { label: 'Low Match (<50%)', count: items.length - greenCount - amberCount, color: 'text-red-400' },
          ].map(({ label, count, color }) => (
            <div key={label} className="rounded-xl bg-surface-secondary border border-surface-tertiary p-3 text-center">
              <p className={clsx('text-xl font-bold', color)}>{count}</p>
              <p className="text-[10px] text-slate-500 mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center h-40 text-slate-400">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading watchlist…
        </div>
      )}

      {/* Empty state */}
      {!isLoading && items.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 rounded-xl border border-dashed border-slate-700 text-slate-500 space-y-3">
          <Eye className="w-10 h-10 opacity-30" />
          <p className="text-sm font-medium text-slate-400">Your watchlist is empty</p>
          <p className="text-xs text-center max-w-xs">
            Add strategies from the Strategy Library to monitor when conditions align for their setup.
          </p>
          <button
            onClick={() => navigate('/library')}
            className="mt-2 flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium transition-colors"
          >
            <BookOpen className="w-4 h-4" /> Browse Strategy Library
          </button>
        </div>
      )}

      {/* Legend */}
      {!isLoading && items.length > 0 && (
        <div className="flex items-center gap-4 text-[10px] text-slate-500">
          <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-emerald-500" /> ≥80% match</div>
          <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-amber-500" /> 50–79%</div>
          <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-red-500" /> &lt;50%</div>
          <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-slate-600" /> Not checked</div>
        </div>
      )}

      {/* Alert info */}
      {items.length > 0 && items.some((i) => i.alertEnabled) && (
        <div className="flex items-start gap-2 rounded-lg bg-amber-900/10 border border-amber-800/30 px-3 py-2">
          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-300">
            In-app alerts are active for {items.filter((i) => i.alertEnabled).length} {items.filter((i) => i.alertEnabled).length === 1 ? 'strategy' : 'strategies'}.
            Email alerts require email opt-in (coming soon).
          </p>
        </div>
      )}

      {/* Watchlist items */}
      <div className="space-y-2">
        {items
          .sort((a, b) => (b.lastMatchPct ?? 0) - (a.lastMatchPct ?? 0))
          .map((item) => (
            <AlertRow
              key={item.id}
              item={item}
              onUpdate={(id, body) => updateMutation.mutate({ id, body })}
              onRemove={(id) => removeMutation.mutate(id)}
            />
          ))}
      </div>
    </div>
  )
}
