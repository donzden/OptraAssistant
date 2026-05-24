import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Activity, RefreshCw, Plus, ChevronDown, ChevronUp,
  CheckCircle, Clock, AlertTriangle, X, Trash2,
} from 'lucide-react'
import { AreaChart, Area, ResponsiveContainer, Tooltip } from 'recharts'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import {
  fetchMonitor, closeLivePosition, deleteLivePosition, createLivePosition,
} from '@/api/monitor'
import type { LivePosition, LivePositionLeg } from '@/types/monitor'

const INSTRUMENTS = ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY']
const AUTO_REFRESH_SEC = 60

function useCountdown(expiry: string) {
  const [label, setLabel] = useState('')
  useEffect(() => {
    const tick = () => {
      const exp = new Date(`${expiry}T15:30:00+05:30`)
      const diff = exp.getTime() - Date.now()
      if (diff <= 0) { setLabel('Expired'); return }
      const d = Math.floor(diff / 86_400_000)
      const h = Math.floor((diff % 86_400_000) / 3_600_000)
      const m = Math.floor((diff % 3_600_000) / 60_000)
      setLabel(d > 0 ? `${d}d ${h}h` : `${h}h ${m}m`)
    }
    tick()
    const id = setInterval(tick, 60_000)
    return () => clearInterval(id)
  }, [expiry])
  return label
}

function pnlTextColor(pnl: number | null, nearSL: boolean) {
  if (pnl == null) return 'text-slate-400'
  if (nearSL) return 'text-amber-400'
  return pnl >= 0 ? 'text-emerald-400' : 'text-red-400'
}

function pnlBorderBg(pnl: number | null) {
  if (pnl == null) return 'border-slate-700 bg-transparent'
  return pnl >= 0
    ? 'border-emerald-800/40 bg-emerald-900/10'
    : 'border-red-800/40 bg-red-900/10'
}

function calcStopLossPnl(pos: LivePosition): number | null {
  if (!pos.stopLossPct) return null
  const netPremium = pos.legs.reduce((acc, leg) => {
    const val = leg.entryPrice * leg.lots * leg.lotSize
    return acc + (leg.action === 'SELL' ? val : -val)
  }, 0)
  if (netPremium <= 0) return null
  return -1 * (netPremium * pos.stopLossPct) / 100
}

function Sparkline({ data }: { data: Array<{ timestamp: string; pnl: number }> }) {
  if (data.length < 2) return null
  const last = data[data.length - 1].pnl
  const color = last >= 0 ? '#34d399' : '#f87171'
  const gradId = `sg-${last >= 0 ? 'g' : 'r'}`
  return (
    <div className="h-10 w-24 shrink-0">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.3} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey="pnl" stroke={color} strokeWidth={1.5} fill={`url(#${gradId})`} dot={false} />
          <Tooltip
            contentStyle={{ background: '#1e293b', border: 'none', fontSize: 10, padding: '2px 6px', borderRadius: 4 }}
            formatter={(v: number) => [`₹${v.toFixed(0)}`, '']}
            labelFormatter={() => ''}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

function emptyLeg(): LivePositionLeg {
  return { symbol: '', strike: 0, expiry: '', optionType: 'CE', action: 'BUY', lots: 1, lotSize: 75, entryPrice: 0 }
}

function AddPositionModal({
  onClose,
  onCreate,
  loading,
}: {
  onClose: () => void
  onCreate: (body: any) => void
  loading: boolean
}) {
  const [name, setName] = useState('')
  const [instrument, setInstrument] = useState('NIFTY')
  const [expiry, setExpiry] = useState('')
  const [legs, setLegs] = useState<LivePositionLeg[]>([emptyLeg()])
  const [stopLoss, setStopLoss] = useState('')
  const [notes, setNotes] = useState('')

  const updateLeg = (i: number, field: keyof LivePositionLeg, val: any) =>
    setLegs((prev) => prev.map((l, idx) => (idx === i ? { ...l, [field]: val } : l)))

  const submit = () => {
    if (!name.trim() || !expiry) { toast.error('Name and expiry are required'); return }
    if (legs.some((l) => !l.symbol || l.entryPrice <= 0)) {
      toast.error('Each leg needs a symbol and entry price')
      return
    }
    onCreate({
      strategyName: name.trim(),
      instrument,
      expiry,
      legs,
      stopLossPct: stopLoss ? Number(stopLoss) : undefined,
      notes: notes || undefined,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-surface-secondary border border-surface-tertiary max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-tertiary shrink-0">
          <h2 className="text-base font-semibold text-white">Track New Position</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto p-5 space-y-4 flex-1">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Strategy Name *</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-surface-tertiary border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-primary-500"
                placeholder="e.g. Iron Condor NIFTY May"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Instrument</label>
              <select
                value={instrument}
                onChange={(e) => setInstrument(e.target.value)}
                className="w-full bg-surface-tertiary border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-primary-500"
              >
                {INSTRUMENTS.map((ins) => <option key={ins}>{ins}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Expiry Date *</label>
              <input
                type="date"
                value={expiry}
                onChange={(e) => setExpiry(e.target.value)}
                className="w-full bg-surface-tertiary border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-primary-500"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Stop Loss % of Premium</label>
              <input
                type="number"
                value={stopLoss}
                onChange={(e) => setStopLoss(e.target.value)}
                placeholder="e.g. 50"
                min={0}
                max={100}
                className="w-full bg-surface-tertiary border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-primary-500"
              />
            </div>
          </div>

          {/* Legs */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-white">Option Legs</p>
              {legs.length < 6 && (
                <button
                  onClick={() => setLegs((p) => [...p, emptyLeg()])}
                  className="flex items-center gap-1 text-[10px] text-primary-400 hover:text-primary-300 transition-colors"
                >
                  <Plus className="w-3 h-3" /> Add Leg
                </button>
              )}
            </div>

            {/* Header row */}
            <div className="grid grid-cols-[2fr_1fr_60px_60px_1fr_28px] gap-1.5 mb-1">
              {['Symbol *', 'Strike', 'B/S', 'CE/PE', 'Entry ₹ *', ''].map((h) => (
                <p key={h} className="text-[9px] text-slate-500">{h}</p>
              ))}
            </div>

            <div className="space-y-1.5">
              {legs.map((leg, i) => (
                <div key={i} className="grid grid-cols-[2fr_1fr_60px_60px_1fr_28px] gap-1.5 items-center">
                  <input
                    value={leg.symbol}
                    onChange={(e) => updateLeg(i, 'symbol', e.target.value)}
                    placeholder="NIFTY25MAY24600CE"
                    className="bg-surface-tertiary border border-slate-700 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-primary-500"
                  />
                  <input
                    type="number"
                    value={leg.strike || ''}
                    onChange={(e) => updateLeg(i, 'strike', Number(e.target.value))}
                    placeholder="24600"
                    className="bg-surface-tertiary border border-slate-700 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-primary-500"
                  />
                  <select
                    value={leg.action}
                    onChange={(e) => updateLeg(i, 'action', e.target.value)}
                    className="bg-surface-tertiary border border-slate-700 rounded-lg px-1 py-1 text-xs text-white focus:outline-none"
                  >
                    <option value="BUY">BUY</option>
                    <option value="SELL">SELL</option>
                  </select>
                  <select
                    value={leg.optionType}
                    onChange={(e) => updateLeg(i, 'optionType', e.target.value as 'CE' | 'PE')}
                    className="bg-surface-tertiary border border-slate-700 rounded-lg px-1 py-1 text-xs text-white focus:outline-none"
                  >
                    <option value="CE">CE</option>
                    <option value="PE">PE</option>
                  </select>
                  <input
                    type="number"
                    value={leg.entryPrice || ''}
                    onChange={(e) => updateLeg(i, 'entryPrice', Number(e.target.value))}
                    placeholder="150"
                    min={0}
                    className="bg-surface-tertiary border border-slate-700 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-primary-500"
                  />
                  {legs.length > 1 ? (
                    <button
                      onClick={() => setLegs((p) => p.filter((_, idx) => idx !== i))}
                      className="text-slate-500 hover:text-red-400 transition-colors p-1"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  ) : <div />}
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[10px] text-slate-400 block mb-1">Notes (optional)</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-surface-tertiary border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-primary-500 resize-none"
              placeholder="e.g. Entry on breakout, target ₹3,000 premium"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-surface-tertiary shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:text-white text-sm transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={loading}
            className="px-4 py-1.5 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium transition-colors disabled:opacity-50"
          >
            {loading ? 'Tracking…' : 'Track Position'}
          </button>
        </div>
      </div>
    </div>
  )
}

function PositionCard({
  pos,
  onClose,
  onDelete,
}: {
  pos: LivePosition
  onClose: (id: string) => void
  onDelete: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const tte = useCountdown(pos.expiry)
  const snap = pos.snapshot
  const pnl = snap?.net_pnl ?? null
  const stopLossPnl = calcStopLossPnl(pos)
  const nearSL = stopLossPnl != null && pnl != null && pnl <= stopLossPnl * 0.8 && pnl > stopLossPnl

  const entryPremium = pos.legs.reduce((acc, leg) => acc + leg.entryPrice * leg.lots * leg.lotSize, 0)
  const pnlPct = entryPremium > 0 && pnl != null
    ? ((pnl / entryPremium) * 100).toFixed(1)
    : null

  return (
    <div className={clsx(
      'rounded-xl border overflow-hidden transition-colors',
      nearSL ? 'border-amber-700/60 bg-amber-900/5' : 'border-surface-tertiary bg-surface-secondary',
    )}>
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Name + meta */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold text-white">{pos.strategyName}</p>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary-900/40 border border-primary-800/40 text-primary-300 font-medium">
                {pos.instrument}
              </span>
              {nearSL && (
                <span className="flex items-center gap-1 text-[10px] text-amber-300 bg-amber-900/20 border border-amber-800/30 px-1.5 py-0.5 rounded">
                  <AlertTriangle className="w-3 h-3" /> Near stop-loss
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <div className="flex items-center gap-1 text-[10px] text-slate-400">
                <Clock className="w-3 h-3" /> {tte}
              </div>
              <span className="text-[10px] text-slate-500">
                {pos.legs.length} leg{pos.legs.length !== 1 ? 's' : ''}
              </span>
              {snap && (
                <span className="text-[10px] text-slate-500">
                  Δ {snap.net_delta >= 0 ? '+' : ''}{snap.net_delta.toFixed(2)}
                  &nbsp;·&nbsp;
                  Θ {snap.net_theta.toFixed(2)}
                </span>
              )}
            </div>
          </div>

          {/* P&L badge */}
          <div className={clsx('shrink-0 rounded-xl border px-3 py-1.5 text-right', pnlBorderBg(pnl))}>
            <p className={clsx('text-base font-bold tabular-nums', pnlTextColor(pnl, nearSL))}>
              {pnl != null
                ? `${pnl >= 0 ? '+' : '−'}₹${Math.abs(pnl).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
                : '—'}
            </p>
            {pnlPct != null && (
              <p className={clsx('text-[10px] tabular-nums', pnlTextColor(pnl, nearSL))}>
                {Number(pnlPct) >= 0 ? '+' : ''}{pnlPct}%
              </p>
            )}
          </div>
        </div>

        {/* Sparkline + actions */}
        <div className="flex items-center justify-between mt-3">
          <Sparkline data={pos.pnlHistory} />
          <div className="flex items-center gap-2">
            <button
              onClick={() => onClose(pos.id)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-700/60 hover:bg-slate-600/60 text-slate-200 text-xs font-medium transition-colors"
            >
              <CheckCircle className="w-3 h-3" /> Mark Closed
            </button>
            <button
              onClick={() => onDelete(pos.id)}
              title="Delete position"
              className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-900/20 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setExpanded((e) => !e)}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-200 transition-colors"
            >
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Per-leg breakdown */}
      {expanded && (
        <div className="border-t border-surface-tertiary px-4 pb-4 pt-3">
          <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-2">Leg Breakdown</p>
          {snap ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[10px] text-slate-500 border-b border-slate-700">
                    <th className="text-left pb-1.5 pr-3 font-medium">Symbol</th>
                    <th className="text-right pb-1.5 pr-3 font-medium">Entry</th>
                    <th className="text-right pb-1.5 pr-3 font-medium">LTP</th>
                    <th className="text-right pb-1.5 pr-3 font-medium">IV Chg</th>
                    <th className="text-right pb-1.5 pr-3 font-medium">Delta</th>
                    <th className="text-right pb-1.5 font-medium">P&L</th>
                  </tr>
                </thead>
                <tbody>
                  {snap.legs.map((leg, i) => (
                    <tr key={i} className="border-b border-slate-800/40 last:border-0">
                      <td className="py-1.5 pr-3">
                        <div className="flex items-center gap-1.5">
                          <span className={clsx(
                            'text-[9px] px-1 py-0.5 rounded font-semibold',
                            leg.action === 'BUY'
                              ? 'bg-emerald-900/30 text-emerald-400'
                              : 'bg-red-900/30 text-red-400',
                          )}>
                            {leg.action}
                          </span>
                          <span className="text-slate-300 text-[11px] font-mono">{leg.symbol}</span>
                        </div>
                      </td>
                      <td className="py-1.5 pr-3 text-right text-slate-400 tabular-nums">
                        ₹{leg.entryPrice.toFixed(2)}
                      </td>
                      <td className="py-1.5 pr-3 text-right text-white font-medium tabular-nums">
                        ₹{leg.ltp.toFixed(2)}
                      </td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">
                        <span className={leg.ivChange >= 0 ? 'text-amber-400' : 'text-emerald-400'}>
                          {leg.ivChange >= 0 ? '+' : ''}{(leg.ivChange * 100).toFixed(2)}%
                        </span>
                      </td>
                      <td className="py-1.5 pr-3 text-right text-slate-400 tabular-nums">
                        {leg.delta.toFixed(3)}
                      </td>
                      <td className={clsx(
                        'py-1.5 text-right font-medium tabular-nums',
                        leg.pnl >= 0 ? 'text-emerald-400' : 'text-red-400',
                      )}>
                        {leg.pnl >= 0 ? '+' : '−'}₹{Math.abs(leg.pnl).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-slate-500">Live snapshot unavailable — engine not reachable.</p>
          )}
        </div>
      )}
    </div>
  )
}

export default function MonitorPage() {
  const qc = useQueryClient()
  const [tab, setTab] = useState<'ACTIVE' | 'CLOSED'>('ACTIVE')
  const [showModal, setShowModal] = useState(false)
  const [countdown, setCountdown] = useState(AUTO_REFRESH_SEC)
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null)
  const prevFetching = useRef(false)

  const { data: positions = [], isLoading, isFetching, refetch } = useQuery({
    queryKey: ['monitor', tab],
    queryFn: () => fetchMonitor(tab),
    staleTime: 55_000,
    refetchInterval: tab === 'ACTIVE' ? 60_000 : false,
  })

  // Detect fetch completion to reset countdown
  useEffect(() => {
    if (prevFetching.current && !isFetching) {
      setLastRefreshed(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }))
      setCountdown(AUTO_REFRESH_SEC)
    }
    prevFetching.current = isFetching
  }, [isFetching])

  // Countdown tick
  useEffect(() => {
    if (tab !== 'ACTIVE') return
    const id = setInterval(() => setCountdown((c) => Math.max(c - 1, 0)), 1000)
    return () => clearInterval(id)
  }, [tab, lastRefreshed])

  const closeMutation = useMutation({
    mutationFn: closeLivePosition,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['monitor'] }); toast.success('Marked as closed') },
    onError: () => toast.error('Failed to close position'),
  })

  const deleteMutation = useMutation({
    mutationFn: deleteLivePosition,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['monitor'] }); toast.success('Position deleted') },
    onError: () => toast.error('Failed to delete'),
  })

  const createMutation = useMutation({
    mutationFn: createLivePosition,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['monitor'] })
      setShowModal(false)
      toast.success('Position is being tracked!')
    },
    onError: () => toast.error('Failed to create position'),
  })

  const activePnl = positions.reduce((acc, p) => acc + (p.snapshot?.net_pnl ?? 0), 0)
  const profitCount = positions.filter((p) => (p.snapshot?.net_pnl ?? 0) > 0).length
  const lossCount = positions.filter((p) => (p.snapshot?.net_pnl ?? 0) < 0).length

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-white flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary-400" />
            Live Monitor
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            {tab === 'ACTIVE' ? (
              <>
                Auto-refreshes every {AUTO_REFRESH_SEC}s
                {lastRefreshed && (
                  <>
                    &nbsp;·&nbsp;Updated {lastRefreshed}
                    &nbsp;·&nbsp;Next in{' '}
                    <span className="text-primary-400 font-medium">{countdown}s</span>
                  </>
                )}
              </>
            ) : 'Closed positions history'}
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
          {tab === 'ACTIVE' && (
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-xs font-medium transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Track Position
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-lg bg-surface-secondary border border-surface-tertiary w-fit">
        {(['ACTIVE', 'CLOSED'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={clsx(
              'px-3 py-1 rounded-md text-xs font-medium transition-colors',
              tab === t ? 'bg-primary-600 text-white' : 'text-slate-400 hover:text-slate-200',
            )}
          >
            {t === 'ACTIVE' ? 'Active' : 'History'}
          </button>
        ))}
      </div>

      {/* Summary bar (active tab only) */}
      {tab === 'ACTIVE' && positions.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl bg-surface-secondary border border-surface-tertiary p-3 text-center">
            <p className="text-xl font-bold text-white">{positions.length}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">Active Positions</p>
          </div>
          <div className="rounded-xl bg-surface-secondary border border-surface-tertiary p-3 text-center">
            <p className={clsx('text-xl font-bold tabular-nums', activePnl >= 0 ? 'text-emerald-400' : 'text-red-400')}>
              {activePnl >= 0 ? '+' : '−'}₹{Math.abs(activePnl).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </p>
            <p className="text-[10px] text-slate-500 mt-0.5">Total P&L</p>
          </div>
          <div className="rounded-xl bg-surface-secondary border border-surface-tertiary p-3 text-center">
            <div className="flex items-center justify-center gap-2">
              <span className="text-emerald-400 font-bold text-lg">{profitCount}</span>
              <span className="text-slate-600 text-sm">/</span>
              <span className="text-red-400 font-bold text-lg">{lossCount}</span>
            </div>
            <p className="text-[10px] text-slate-500 mt-0.5">Winning / Losing</p>
          </div>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center h-40 text-slate-400">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading…
        </div>
      )}

      {/* Empty state */}
      {!isLoading && positions.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 rounded-xl border border-dashed border-slate-700 space-y-3">
          <Activity className="w-10 h-10 text-slate-600" />
          <p className="text-sm font-medium text-slate-400">
            {tab === 'ACTIVE' ? 'No active positions' : 'No closed positions yet'}
          </p>
          {tab === 'ACTIVE' && (
            <>
              <p className="text-xs text-slate-500 text-center max-w-xs">
                Click "Track Position" to start monitoring a live options strategy with real-time P&L.
              </p>
              <button
                onClick={() => setShowModal(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium transition-colors"
              >
                <Plus className="w-4 h-4" /> Track Your First Position
              </button>
            </>
          )}
        </div>
      )}

      {/* Position cards */}
      <div className="space-y-3">
        {positions.map((pos) => (
          <PositionCard
            key={pos.id}
            pos={pos}
            onClose={(id) => closeMutation.mutate(id)}
            onDelete={(id) => deleteMutation.mutate(id)}
          />
        ))}
      </div>

      {showModal && (
        <AddPositionModal
          onClose={() => setShowModal(false)}
          onCreate={(body) => createMutation.mutate(body)}
          loading={createMutation.isPending}
        />
      )}
    </div>
  )
}
