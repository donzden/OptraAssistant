import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import {
  TrendingUp, TrendingDown, Award, Minus, Download, RefreshCw,
  ChevronDown, ChevronUp, Bot, Filter,
} from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import { fetchMonitor, fetchPostMortem } from '@/api/monitor'
import type { LivePosition } from '@/types/monitor'

// ── Helpers ───────────────────────────────────────────────────────────────────

function effectivePnl(pos: LivePosition): number {
  if (pos.finalPnl != null) return pos.finalPnl
  const h = pos.pnlHistory
  return h.length > 0 ? h[h.length - 1].pnl : 0
}

function holdingDays(pos: LivePosition): number {
  const entry = new Date(pos.entryDate)
  const exit = pos.closedAt ? new Date(pos.closedAt) : new Date()
  return Math.max(Math.round((exit.getTime() - entry.getTime()) / 86_400_000), 0)
}

function fmt(n: number) {
  return `${n >= 0 ? '+' : '−'}₹${Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

// ── Monthly P&L Heatmap ───────────────────────────────────────────────────────

function PnlHeatmap({ positions }: { positions: LivePosition[] }) {
  // Build day → pnl map from closedAt date
  const dayMap: Record<string, number> = {}
  for (const p of positions) {
    if (!p.closedAt) continue
    const day = p.closedAt.slice(0, 10)
    dayMap[day] = (dayMap[day] ?? 0) + effectivePnl(p)
  }

  // Build last 3 months
  const today = new Date()
  const months: Array<{ year: number; month: number; label: string }> = []
  for (let i = 2; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1)
    months.push({
      year: d.getFullYear(),
      month: d.getMonth(),
      label: d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }),
    })
  }

  const maxAbs = Math.max(1, ...Object.values(dayMap).map(Math.abs))

  const cellColor = (pnl: number | undefined) => {
    if (pnl == null) return 'bg-slate-800/30'
    const intensity = Math.min(Math.abs(pnl) / maxAbs, 1)
    if (pnl > 0) return intensity > 0.6 ? 'bg-emerald-500' : intensity > 0.3 ? 'bg-emerald-700' : 'bg-emerald-900/60'
    return intensity > 0.6 ? 'bg-red-500' : intensity > 0.3 ? 'bg-red-700' : 'bg-red-900/60'
  }

  return (
    <div className="space-y-4">
      {months.map(({ year, month, label }) => {
        const firstDay = new Date(year, month, 1).getDay() // 0=Sun
        const daysInMonth = new Date(year, month + 1, 0).getDate()
        const cells: Array<{ day: number | null; key: string; pnl: number | undefined }> = []
        for (let i = 0; i < firstDay; i++) cells.push({ day: null, key: `e${i}`, pnl: undefined })
        for (let d = 1; d <= daysInMonth; d++) {
          const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
          cells.push({ day: d, key, pnl: dayMap[key] })
        }
        return (
          <div key={label}>
            <p className="text-[10px] text-slate-500 mb-1.5">{label}</p>
            <div className="grid grid-cols-7 gap-1">
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                <p key={i} className="text-[9px] text-slate-600 text-center">{d}</p>
              ))}
              {cells.map(({ day, key, pnl }) => (
                <div
                  key={key}
                  title={day != null ? (pnl != null ? `${key}: ${fmt(pnl)}` : key) : ''}
                  className={clsx(
                    'aspect-square rounded-sm flex items-center justify-center text-[8px]',
                    day == null ? 'bg-transparent' : cellColor(pnl),
                  )}
                >
                  {day != null && <span className={clsx('text-[8px]', pnl != null ? 'text-white/80' : 'text-slate-600')}>{day}</span>}
                </div>
              ))}
            </div>
          </div>
        )
      })}
      <div className="flex items-center gap-3 text-[9px] text-slate-500">
        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-sm bg-emerald-500" /> Profit</div>
        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-sm bg-red-500" /> Loss</div>
        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-sm bg-slate-800/30" /> No trades</div>
      </div>
    </div>
  )
}

// ── Closed Position Row ───────────────────────────────────────────────────────

function ClosedRow({ pos }: { pos: LivePosition }) {
  const [expanded, setExpanded] = useState(false)
  const [mortem, setMortem] = useState<string | null>(null)

  const mortemMutation = useMutation({
    mutationFn: () => fetchPostMortem(pos.id),
    onSuccess: (txt) => setMortem(txt),
    onError: () => toast.error('AI post-mortem failed'),
  })

  const pnl = effectivePnl(pos)
  const days = holdingDays(pos)

  return (
    <div className="rounded-xl bg-surface-secondary border border-surface-tertiary overflow-hidden">
      <div className="flex items-center gap-3 p-3">
        <div className={clsx('w-2 h-2 rounded-full shrink-0', pnl >= 0 ? 'bg-emerald-500' : 'bg-red-500')} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-white truncate">{pos.strategyName}</p>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">{pos.instrument}</span>
          </div>
          <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-500">
            <span>{pos.entryDate.slice(0, 10)}</span>
            <span>→</span>
            <span>{pos.closedAt?.slice(0, 10) ?? '—'}</span>
            <span>·</span>
            <span>{days}d</span>
            <span>·</span>
            <span>{pos.legs.length} leg{pos.legs.length !== 1 ? 's' : ''}</span>
          </div>
        </div>
        <div className={clsx('shrink-0 text-sm font-bold tabular-nums', pnl >= 0 ? 'text-emerald-400' : 'text-red-400')}>
          {fmt(pnl)}
        </div>
        <button onClick={() => setExpanded((e) => !e)} className="shrink-0 text-slate-500 hover:text-slate-200 p-1">
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      {expanded && (
        <div className="border-t border-surface-tertiary px-4 pb-4 pt-3 space-y-3">
          {/* Legs summary */}
          <div className="flex flex-wrap gap-1.5">
            {pos.legs.map((leg, i) => (
              <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                {leg.action} {leg.optionType} {leg.strike} @₹{leg.entryPrice}
              </span>
            ))}
          </div>

          {/* AI Post-Mortem */}
          {mortem ? (
            <div className="rounded-lg bg-primary-900/20 border border-primary-800/30 p-3">
              <p className="text-[10px] text-primary-300 font-medium mb-1 flex items-center gap-1">
                <Bot className="w-3 h-3" /> AI Post-Mortem
              </p>
              <p className="text-xs text-slate-300 leading-relaxed">{mortem}</p>
            </div>
          ) : (
            <button
              onClick={() => mortemMutation.mutate()}
              disabled={mortemMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-primary-700/50 text-primary-400 hover:bg-primary-900/20 text-xs font-medium transition-colors disabled:opacity-50"
            >
              <Bot className="w-3.5 h-3.5" />
              {mortemMutation.isPending ? 'Analysing…' : 'AI Post-Mortem'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── CSV export ────────────────────────────────────────────────────────────────

function exportCsv(positions: LivePosition[]) {
  const rows = [
    ['Strategy', 'Instrument', 'Entry Date', 'Exit Date', 'Holding Days', 'Legs', 'Final P&L (₹)'],
    ...positions.map((p) => [
      p.strategyName,
      p.instrument,
      p.entryDate.slice(0, 10),
      p.closedAt?.slice(0, 10) ?? '',
      String(holdingDays(p)),
      String(p.legs.length),
      effectivePnl(p).toFixed(2),
    ]),
  ]
  const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `optra_performance_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function PerformancePage() {
  const [instrument, setInstrument] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const { data: all = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ['monitor', 'CLOSED'],
    queryFn: () => fetchMonitor('CLOSED'),
    staleTime: 5 * 60_000,
  })

  // Apply filters
  const positions = all.filter((p) => {
    if (instrument && p.instrument !== instrument) return false
    if (dateFrom && (p.closedAt ?? p.entryDate) < dateFrom) return false
    if (dateTo && (p.closedAt ?? p.entryDate) > dateTo + 'T23:59:59') return false
    return true
  })

  // Summary stats
  const totalPnl = positions.reduce((acc, p) => acc + effectivePnl(p), 0)
  const wins = positions.filter((p) => effectivePnl(p) >= 0)
  const losses = positions.filter((p) => effectivePnl(p) < 0)
  const winRate = positions.length > 0 ? Math.round((wins.length / positions.length) * 100) : 0
  const avgPnl = positions.length > 0 ? totalPnl / positions.length : 0
  const best = positions.length > 0 ? Math.max(...positions.map(effectivePnl)) : null
  const worst = positions.length > 0 ? Math.min(...positions.map(effectivePnl)) : null

  const instruments = [...new Set(all.map((p) => p.instrument))].sort()

  return (
    <div className="space-y-5 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-white flex items-center gap-2">
            <Award className="w-5 h-5 text-primary-400" />
            Performance History
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">All closed strategy positions with analytics</p>
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
          {positions.length > 0 && (
            <button
              onClick={() => exportCsv(positions)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:text-white text-xs transition-colors"
            >
              <Download className="w-3.5 h-3.5" /> Export CSV
            </button>
          )}
        </div>
      </div>

      {/* Stats cards */}
      {positions.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            {
              label: 'Total P&L',
              value: fmt(totalPnl),
              color: totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400',
              icon: totalPnl >= 0 ? TrendingUp : TrendingDown,
            },
            { label: 'Win Rate', value: `${winRate}%`, color: winRate >= 50 ? 'text-emerald-400' : 'text-red-400', icon: Award },
            {
              label: 'Avg P&L / Trade',
              value: fmt(Math.round(avgPnl)),
              color: avgPnl >= 0 ? 'text-emerald-400' : 'text-red-400',
              icon: Minus,
            },
            {
              label: 'Trades',
              value: `${wins.length}W / ${losses.length}L`,
              color: 'text-white',
              icon: Filter,
            },
          ].map(({ label, value, color, icon: Icon }) => (
            <div key={label} className="rounded-xl bg-surface-secondary border border-surface-tertiary p-4">
              <div className="flex items-center gap-2 mb-1">
                <Icon className="w-3.5 h-3.5 text-slate-500" />
                <p className="text-[10px] text-slate-500">{label}</p>
              </div>
              <p className={clsx('text-lg font-bold tabular-nums', color)}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Best / Worst */}
      {best != null && worst != null && (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-emerald-900/10 border border-emerald-800/30 p-3">
            <p className="text-[10px] text-emerald-400 mb-0.5">Best Trade</p>
            <p className="text-base font-bold text-emerald-400 tabular-nums">+₹{best.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
          </div>
          <div className="rounded-xl bg-red-900/10 border border-red-800/30 p-3">
            <p className="text-[10px] text-red-400 mb-0.5">Worst Trade</p>
            <p className="text-base font-bold text-red-400 tabular-nums">−₹{Math.abs(worst).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <Filter className="w-3.5 h-3.5 text-slate-500 shrink-0" />
        <select
          value={instrument}
          onChange={(e) => setInstrument(e.target.value)}
          className="bg-surface-secondary border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-primary-500"
        >
          <option value="">All Instruments</option>
          {instruments.map((ins) => <option key={ins}>{ins}</option>)}
        </select>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="bg-surface-secondary border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-primary-500"
          placeholder="From"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="bg-surface-secondary border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-primary-500"
          placeholder="To"
        />
        {(instrument || dateFrom || dateTo) && (
          <button
            onClick={() => { setInstrument(''); setDateFrom(''); setDateTo('') }}
            className="text-[10px] text-slate-400 hover:text-white transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {/* Heatmap + positions side by side on wide screens */}
      {!isLoading && positions.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-5">
          <div className="rounded-xl bg-surface-secondary border border-surface-tertiary p-4">
            <p className="text-xs font-medium text-white mb-3">Monthly P&L Calendar</p>
            <PnlHeatmap positions={positions} />
          </div>
          <div className="space-y-2">
            {positions
              .sort((a, b) => (b.closedAt ?? b.updatedAt).localeCompare(a.closedAt ?? a.updatedAt))
              .map((pos) => <ClosedRow key={pos.id} pos={pos} />)}
          </div>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center h-40 text-slate-400">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading…
        </div>
      )}

      {/* Empty */}
      {!isLoading && positions.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 rounded-xl border border-dashed border-slate-700 space-y-2">
          <Award className="w-10 h-10 text-slate-600" />
          <p className="text-sm font-medium text-slate-400">No closed positions yet</p>
          <p className="text-xs text-slate-500">Mark positions as closed in Live Monitor to see performance here.</p>
        </div>
      )}
    </div>
  )
}
