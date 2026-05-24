import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Trash2, Save, BookOpen, RefreshCw, ChevronDown,
  ArrowLeftRight,
} from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine, CartesianGrid,
} from 'recharts'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import { fetchExpiries, fetchOptionsChain } from '@/api/market'
import { fetchStrategies, fetchMyStrategy, createMyStrategy, updateMyStrategy } from '@/api/strategies'
import type { BuilderLeg, Strategy } from '@/types/strategies'
import type { OptionStrike } from '@/types/market'

const LOT_SIZES: Record<string, number> = { NIFTY: 50, BANKNIFTY: 15, FINNIFTY: 40 }
const STEP_SIZES: Record<string, number> = { NIFTY: 50, BANKNIFTY: 100, FINNIFTY: 50 }
const INSTRUMENTS = ['NIFTY', 'BANKNIFTY', 'FINNIFTY']

function newLeg(): BuilderLeg {
  return {
    id: Math.random().toString(36).slice(2),
    type: 'BUY',
    optionType: 'CE',
    strike: '',
    lots: 1,
    premium: '',
    iv: null,
    delta: null,
    gamma: null,
    theta: null,
    vega: null,
  }
}

function computePayoff(legs: BuilderLeg[], spot: number, lotSize: number): number {
  return legs
    .filter((l) => l.strike !== '' && l.premium !== '')
    .reduce((sum, leg) => {
      const K = leg.strike as number
      const prem = leg.premium as number
      const intrinsic = leg.optionType === 'CE' ? Math.max(0, spot - K) : Math.max(0, K - spot)
      const pnlPerUnit = leg.type === 'BUY' ? intrinsic - prem : prem - intrinsic
      return sum + pnlPerUnit * leg.lots * lotSize
    }, 0)
}

function buildChartData(legs: BuilderLeg[], spotPrice: number, lotSize: number) {
  if (spotPrice <= 0) return []
  return Array.from({ length: 21 }, (_, i) => {
    const s = Math.round(spotPrice * (0.9 + i * 0.01))
    const pnl = Math.round(computePayoff(legs, s, lotSize))
    return { price: s, pct: `${((s - spotPrice) / spotPrice * 100).toFixed(0)}%`, pnl }
  })
}

function computeNetGreeks(legs: BuilderLeg[], lotSize: number) {
  return legs.reduce(
    (acc, leg) => {
      const sign = leg.type === 'BUY' ? 1 : -1
      const mult = leg.lots * lotSize * sign
      return {
        delta: acc.delta + (leg.delta ?? 0) * mult,
        gamma: acc.gamma + (leg.gamma ?? 0) * mult,
        theta: acc.theta + (leg.theta ?? 0) * mult,
        vega: acc.vega + (leg.vega ?? 0) * mult,
      }
    },
    { delta: 0, gamma: 0, theta: 0, vega: 0 },
  )
}

function estimateMargin(legs: BuilderLeg[], lotSize: number): number {
  return Math.round(
    legs.reduce((acc, leg) => {
      if (leg.strike === '' || leg.lots === 0) return acc
      const strike = leg.strike as number
      const prem = typeof leg.premium === 'number' ? leg.premium : 0
      return acc + (leg.type === 'SELL' ? strike * lotSize * leg.lots * 0.12 : prem * lotSize * leg.lots)
    }, 0),
  )
}

function fmtInr(n: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)
}

// ── Sub-components ───────────────────────────────────────────────────────────

function LegRow({
  leg,
  strikes,
  onUpdate,
  onRemove,
}: {
  leg: BuilderLeg
  strikes: OptionStrike[]
  onUpdate: (updates: Partial<BuilderLeg>) => void
  onRemove: () => void
}) {
  const handleStrikeChange = (strikePrice: string) => {
    if (strikePrice === '') {
      onUpdate({ strike: '', premium: '', iv: null, delta: null, gamma: null, theta: null, vega: null })
      return
    }
    const strike = Number(strikePrice)
    const found = strikes.find((s) => s.strike_price === strike)
    const optData = found ? (leg.optionType === 'CE' ? found.ce : found.pe) : null
    onUpdate({
      strike,
      premium: optData?.ltp ?? '',
      iv: optData?.iv ?? null,
      delta: optData?.greeks?.delta ?? null,
      gamma: optData?.greeks?.gamma ?? null,
      theta: optData?.greeks?.theta ?? null,
      vega: optData?.greeks?.vega ?? null,
    })
  }

  const handleOptionTypeChange = (optionType: 'CE' | 'PE') => {
    if (leg.strike === '') { onUpdate({ optionType }); return }
    const found = strikes.find((s) => s.strike_price === leg.strike)
    const optData = found ? (optionType === 'CE' ? found.ce : found.pe) : null
    onUpdate({
      optionType,
      premium: optData?.ltp ?? leg.premium,
      iv: optData?.iv ?? null,
      delta: optData?.greeks?.delta ?? null,
      gamma: optData?.greeks?.gamma ?? null,
      theta: optData?.greeks?.theta ?? null,
      vega: optData?.greeks?.vega ?? null,
    })
  }

  return (
    <div className={clsx(
      'grid grid-cols-[auto_auto_1fr_80px_80px_auto] gap-2 items-center px-3 py-2 rounded-lg border text-sm',
      leg.type === 'BUY' ? 'bg-emerald-900/10 border-emerald-800/30' : 'bg-red-900/10 border-red-800/30',
    )}>
      {/* BUY / SELL */}
      <div className="flex rounded-lg overflow-hidden border border-slate-700 shrink-0">
        {(['BUY', 'SELL'] as const).map((t) => (
          <button
            key={t}
            onClick={() => onUpdate({ type: t })}
            className={clsx(
              'px-2.5 py-1 text-xs font-semibold transition-colors',
              leg.type === t
                ? t === 'BUY' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
                : 'text-slate-400 hover:text-white',
            )}
          >{t}</button>
        ))}
      </div>

      {/* CE / PE */}
      <div className="flex rounded-lg overflow-hidden border border-slate-700 shrink-0">
        {(['CE', 'PE'] as const).map((t) => (
          <button
            key={t}
            onClick={() => handleOptionTypeChange(t)}
            className={clsx(
              'px-2.5 py-1 text-xs font-semibold transition-colors',
              leg.optionType === t ? 'bg-primary-600 text-white' : 'text-slate-400 hover:text-white',
            )}
          >{t}</button>
        ))}
      </div>

      {/* Strike */}
      <div className="relative">
        <select
          value={leg.strike}
          onChange={(e) => handleStrikeChange(e.target.value)}
          className={clsx(
            'w-full bg-surface-tertiary border border-slate-700 rounded-lg px-2 py-1 text-xs text-white',
            'appearance-none pr-6 focus:outline-none focus:border-primary-500',
          )}
        >
          <option value="">Strike</option>
          {strikes.map((s) => {
            const optData = leg.optionType === 'CE' ? s.ce : s.pe
            return (
              <option key={s.strike_price} value={s.strike_price}>
                {s.strike_price}
                {s.is_atm ? ' (ATM)' : ''}
                {optData?.ltp ? ` | ₹${optData.ltp}` : ''}
                {optData?.greeks?.delta ? ` | Δ${optData.greeks.delta.toFixed(2)}` : ''}
              </option>
            )
          })}
        </select>
        <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500 pointer-events-none" />
      </div>

      {/* Lots */}
      <input
        type="number"
        min={1}
        max={100}
        value={leg.lots}
        onChange={(e) => onUpdate({ lots: Math.max(1, parseInt(e.target.value) || 1) })}
        className="bg-surface-tertiary border border-slate-700 rounded-lg px-2 py-1 text-xs text-white text-center focus:outline-none focus:border-primary-500"
        placeholder="Lots"
      />

      {/* Premium */}
      <input
        type="number"
        min={0}
        step={0.5}
        value={leg.premium}
        onChange={(e) => onUpdate({ premium: e.target.value === '' ? '' : Number(e.target.value) })}
        className="bg-surface-tertiary border border-slate-700 rounded-lg px-2 py-1 text-xs text-white text-center focus:outline-none focus:border-primary-500"
        placeholder="Prem"
      />

      {/* Info & Delete */}
      <div className="flex items-center gap-1.5">
        {leg.iv !== null && (
          <span className="text-[10px] text-slate-500 hidden xl:inline">IV: {(leg.iv * 100).toFixed(1)}%</span>
        )}
        <button onClick={onRemove} className="text-slate-500 hover:text-red-400 transition-colors p-0.5">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

function SaveModal({
  legs,
  instrument,
  existingId,
  onClose,
  onSaved,
}: {
  legs: BuilderLeg[]
  instrument: string
  existingId?: string
  onClose: () => void
  onSaved: (id: string) => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [notes, setNotes] = useState('')
  const [tags, setTags] = useState('')
  const [isTemplate, setIsTemplate] = useState(false)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Name is required'); return }
    setSaving(true)
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || undefined,
        notes: notes.trim() || undefined,
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
        isTemplate,
        legs,
        category: 'NON_DIRECTIONAL' as const,
        type: 'VARIES' as const,
        riskLevel: 'MODERATE' as const,
      }
      const result = existingId
        ? await updateMyStrategy(existingId, payload)
        : await createMyStrategy({ ...payload, sourceStrategyId: undefined })
      toast.success(existingId ? 'Strategy updated' : 'Strategy saved')
      onSaved(result.id)
    } catch {
      toast.error('Failed to save strategy')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-surface-secondary border border-surface-tertiary rounded-xl p-6 w-full max-w-md space-y-4">
        <h2 className="text-base font-semibold text-white">Save Strategy</h2>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Name *</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-surface-tertiary border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary-500"
              placeholder={`My ${instrument} strategy`}
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Description</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-surface-tertiary border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary-500"
              placeholder="Short description"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full bg-surface-tertiary border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary-500 resize-none"
              placeholder="Personal notes about this strategy..."
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Tags (comma-separated)</label>
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              className="w-full bg-surface-tertiary border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary-500"
              placeholder="earnings, high-iv, weekly"
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isTemplate}
              onChange={(e) => setIsTemplate(e.target.checked)}
              className="accent-primary-500"
            />
            <span className="text-xs text-slate-300">Save as template (no specific strikes — structure only)</span>
          </label>
        </div>
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 px-4 py-2 rounded-lg border border-slate-700 text-sm text-slate-300 hover:text-white hover:border-slate-600 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

function TemplateModal({
  templates,
  onSelect,
  onClose,
}: {
  templates: Strategy[]
  onSelect: (s: Strategy) => void
  onClose: () => void
}) {
  const [search, setSearch] = useState('')
  const filtered = templates.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-surface-secondary border border-surface-tertiary rounded-xl p-5 w-full max-w-lg space-y-3">
        <h2 className="text-base font-semibold text-white">Load Template</h2>
        <input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-surface-tertiary border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary-500"
          placeholder="Search strategies…"
        />
        <div className="max-h-80 overflow-y-auto space-y-1.5">
          {filtered.map((s) => (
            <button
              key={s.id}
              onClick={() => onSelect(s)}
              className="w-full text-left px-3 py-2.5 rounded-lg bg-surface-tertiary/50 hover:bg-surface-tertiary border border-transparent hover:border-primary-600/40 transition-all"
            >
              <p className="text-sm font-medium text-white">{s.name}</p>
              <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{s.description}</p>
              <div className="flex gap-2 mt-1">
                <span className="text-[10px] text-slate-500">{s.category}</span>
                <span className="text-[10px] text-slate-500">•</span>
                <span className="text-[10px] text-slate-500">{s.legs.length} legs</span>
              </div>
            </button>
          ))}
          {filtered.length === 0 && <p className="text-sm text-slate-500 text-center py-4">No strategies found</p>}
        </div>
        <button onClick={onClose} className="w-full px-4 py-2 rounded-lg border border-slate-700 text-sm text-slate-300 hover:text-white transition-colors">
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function StrategyBuilderPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const templateId = searchParams.get('templateId')
  const editId = searchParams.get('editId')

  const [instrument, setInstrument] = useState('NIFTY')
  const [expiry, setExpiry] = useState('')
  const [legs, setLegs] = useState<BuilderLeg[]>([])
  const [showSave, setShowSave] = useState(false)
  const [showTemplate, setShowTemplate] = useState(false)

  const lotSize = LOT_SIZES[instrument] ?? 50
  const stepSize = STEP_SIZES[instrument] ?? 50

  const { data: expiries = [], isLoading: expiriesLoading } = useQuery({
    queryKey: ['expiries', instrument],
    queryFn: () => fetchExpiries(instrument),
    staleTime: 5 * 60_000,
  })

  const { data: chain, isFetching: chainFetching } = useQuery({
    queryKey: ['chain', instrument, expiry],
    queryFn: () => fetchOptionsChain(instrument, expiry),
    enabled: !!expiry,
    staleTime: 60_000,
  })

  const { data: templates = [] } = useQuery({
    queryKey: ['strategies'],
    queryFn: () => fetchStrategies({}),
    staleTime: 10 * 60_000,
  })

  // Auto-select first expiry
  useEffect(() => {
    if (expiries.length > 0 && !expiry) setExpiry(expiries[0])
  }, [expiries, expiry])

  // Load template / edit strategy
  useEffect(() => {
    if (templateId && templates.length > 0) {
      const tpl = templates.find((s) => s.id === templateId)
      if (tpl) loadTemplate(tpl)
    }
  }, [templateId, templates])

  useEffect(() => {
    if (editId) {
      fetchMyStrategy(editId).then((s) => setLegs(s.legs)).catch(() => {})
    }
  }, [editId])

  const strikes = chain?.strikes ?? []
  const spotPrice = chain?.spot_price ?? 0
  const atmStrike = chain?.atm_strike ?? 0

  const payoffData = buildChartData(legs, spotPrice, lotSize)
  const netGreeks = computeNetGreeks(legs, lotSize)
  const margin = estimateMargin(legs, lotSize)

  const validLegs = legs.filter((l) => l.strike !== '' && l.premium !== '')
  const payoffValues = payoffData.map((d) => d.pnl)
  const maxProfit = validLegs.length > 0 ? Math.max(...payoffValues) : null
  const maxLoss = validLegs.length > 0 ? Math.min(...payoffValues) : null
  const breakEvens = payoffData
    .map((d, i) => (i > 0 && Math.sign(d.pnl) !== Math.sign(payoffData[i - 1].pnl) ? d.price : null))
    .filter(Boolean) as number[]

  const addLeg = () => {
    if (legs.length >= 6) { toast.error('Maximum 6 legs per strategy'); return }
    setLegs((prev) => [...prev, newLeg()])
  }

  const updateLeg = (id: string, updates: Partial<BuilderLeg>) => {
    setLegs((prev) => prev.map((l) => (l.id === id ? { ...l, ...updates } : l)))
  }

  const removeLeg = (id: string) => setLegs((prev) => prev.filter((l) => l.id !== id))

  const loadTemplate = (strategy: Strategy) => {
    const built: BuilderLeg[] = strategy.legs.map((sl) => ({
      id: Math.random().toString(36).slice(2),
      type: sl.type as 'BUY' | 'SELL',
      optionType: sl.optionType as 'CE' | 'PE',
      strike: atmStrike ? Math.round((atmStrike + sl.strikeOffset * stepSize) / stepSize) * stepSize : '',
      lots: sl.lots,
      premium: '',
      iv: null,
      delta: null,
      gamma: null,
      theta: null,
      vega: null,
    }))
    setLegs(built)
    setShowTemplate(false)
    toast.success(`Template "${strategy.name}" loaded`)
  }

  const greekSign = (v: number) => {
    if (Math.abs(v) < 0.005) return 'text-slate-400'
    return v > 0 ? 'text-emerald-400' : 'text-red-400'
  }

  const fmt = (v: number, dp = 2) => {
    const s = v.toFixed(dp)
    return v > 0 ? `+${s}` : s
  }

  return (
    <div className="space-y-4 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-white">Strategy Builder</h1>
          <p className="text-xs text-slate-400 mt-0.5">Build and visualise custom option strategies leg by leg</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowTemplate(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:text-white hover:border-slate-600 text-xs transition-colors"
          >
            <BookOpen className="w-3.5 h-3.5" /> Load Template
          </button>
          <button
            onClick={() => {
              if (legs.length === 0) { toast.error('Add at least one leg'); return }
              setShowSave(true)
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-xs font-medium transition-colors"
          >
            <Save className="w-3.5 h-3.5" /> Save Strategy
          </button>
        </div>
      </div>

      {/* Instrument + Expiry row */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex rounded-lg overflow-hidden border border-slate-700">
          {INSTRUMENTS.map((ins) => (
            <button
              key={ins}
              onClick={() => { setInstrument(ins); setExpiry(''); setLegs([]) }}
              className={clsx(
                'px-3 py-1.5 text-xs font-medium transition-colors',
                instrument === ins ? 'bg-primary-600 text-white' : 'text-slate-400 hover:text-white',
              )}
            >{ins}</button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">Expiry:</span>
          <div className="relative">
            <select
              value={expiry}
              onChange={(e) => setExpiry(e.target.value)}
              disabled={expiriesLoading}
              className="bg-surface-tertiary border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white pr-7 appearance-none focus:outline-none focus:border-primary-500"
            >
              {expiriesLoading && <option>Loading…</option>}
              {expiries.map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500 pointer-events-none" />
          </div>
          {chainFetching && <RefreshCw className="w-3.5 h-3.5 text-slate-400 animate-spin" />}
          {chain && (
            <span className="text-xs text-slate-400">
              Spot: <span className="text-white font-medium">{chain.spot_price.toLocaleString('en-IN')}</span>
              {chain.is_mock && <span className="ml-1 text-amber-500">(mock)</span>}
            </span>
          )}
        </div>
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Left: legs + Greeks + margin */}
        <div className="lg:col-span-3 space-y-3">
          {/* Column headers */}
          {legs.length > 0 && (
            <div className="grid grid-cols-[auto_auto_1fr_80px_80px_auto] gap-2 px-3 text-[10px] text-slate-500">
              <span>TYPE</span><span>OPT</span><span>STRIKE</span><span className="text-center">LOTS</span><span className="text-center">PREM</span><span />
            </div>
          )}

          {/* Legs */}
          <div className="space-y-2">
            {legs.map((leg) => (
              <LegRow
                key={leg.id}
                leg={leg}
                strikes={strikes}
                onUpdate={(updates) => updateLeg(leg.id, updates)}
                onRemove={() => removeLeg(leg.id)}
              />
            ))}
          </div>

          {/* Empty state */}
          {legs.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 rounded-xl border border-dashed border-slate-700 text-slate-500">
              <ArrowLeftRight className="w-8 h-8 mb-2 opacity-40" />
              <p className="text-sm">No legs added yet</p>
              <p className="text-xs mt-1">Add legs below or load a template to start</p>
            </div>
          )}

          {/* Add leg button */}
          {legs.length < 6 && (
            <button
              onClick={addLeg}
              className="flex items-center gap-1.5 text-xs text-primary-400 hover:text-primary-300 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Add Leg {legs.length > 0 && `(${legs.length}/6)`}
            </button>
          )}

          {/* Net Greeks */}
          {legs.length > 0 && (
            <div className="rounded-xl bg-surface-secondary border border-surface-tertiary p-4">
              <p className="text-xs font-semibold text-slate-400 mb-3">Net Greeks</p>
              <div className="grid grid-cols-4 gap-3 text-center">
                {([
                  { label: 'Delta', value: netGreeks.delta, dp: 2 },
                  { label: 'Gamma', value: netGreeks.gamma, dp: 4 },
                  { label: 'Theta', value: netGreeks.theta, dp: 2 },
                  { label: 'Vega', value: netGreeks.vega, dp: 2 },
                ] as { label: string; value: number; dp: number }[]).map(({ label, value, dp }) => (
                  <div key={label}>
                    <p className="text-[10px] text-slate-500 mb-0.5">{label}</p>
                    <p className={clsx('text-sm font-semibold', greekSign(value))}>{fmt(value, dp)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Margin estimate */}
          {legs.length > 0 && margin > 0 && (
            <div className="rounded-xl bg-surface-secondary border border-surface-tertiary px-4 py-3 flex items-center justify-between">
              <span className="text-xs text-slate-400">Approx. required margin</span>
              <span className="text-sm font-semibold text-amber-400">{fmtInr(margin)}</span>
            </div>
          )}
          {legs.length > 0 && margin > 0 && (
            <p className="text-[10px] text-slate-600 -mt-2 px-1">
              SPAN approximation only (12% of SELL notional). Actual margin may vary.
            </p>
          )}
        </div>

        {/* Right: payoff chart + stats */}
        <div className="lg:col-span-2 space-y-3">
          <div className="rounded-xl bg-surface-secondary border border-surface-tertiary p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-slate-300">Payoff at Expiry</h3>
              {validLegs.length === 0 && (
                <span className="text-[10px] text-slate-500">Add legs with strike + premium</span>
              )}
            </div>
            {validLegs.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={payoffData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis
                    dataKey="pct"
                    tick={{ fill: '#64748b', fontSize: 9 }}
                    interval={4}
                  />
                  <YAxis tick={{ fill: '#64748b', fontSize: 9 }} tickFormatter={(v) => v >= 1000 || v <= -1000 ? `${(v / 1000).toFixed(0)}k` : v} />
                  <Tooltip
                    contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 11 }}
                    labelStyle={{ color: '#cbd5e1' }}
                    formatter={(v: number) => [fmtInr(v), 'P&L']}
                    labelFormatter={(l) => `Spot: ${l}`}
                  />
                  <ReferenceLine y={0} stroke="#475569" strokeDasharray="4 2" />
                  {breakEvens.map((be) => (
                    <ReferenceLine
                      key={be}
                      x={be}
                      stroke="#f59e0b"
                      strokeWidth={1}
                      strokeDasharray="3 2"
                      label={{ value: 'BE', fill: '#f59e0b', fontSize: 8 }}
                    />
                  ))}
                  <Line type="monotone" dataKey="pnl" stroke="#6366f1" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-44 text-slate-600 text-xs">
                No complete legs yet
              </div>
            )}
          </div>

          {/* Summary stats */}
          {validLegs.length > 0 && maxProfit !== null && maxLoss !== null && (
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-emerald-900/10 border border-emerald-800/30 p-3 text-center">
                <p className="text-[10px] text-slate-500 mb-1">Max Profit</p>
                <p className="text-sm font-bold text-emerald-400">
                  {maxProfit === Infinity || maxProfit > 9_999_999 ? 'Unlimited' : fmtInr(maxProfit)}
                </p>
              </div>
              <div className="rounded-xl bg-red-900/10 border border-red-800/30 p-3 text-center">
                <p className="text-[10px] text-slate-500 mb-1">Max Loss</p>
                <p className="text-sm font-bold text-red-400">
                  {maxLoss === -Infinity || maxLoss < -9_999_999 ? 'Unlimited' : fmtInr(maxLoss)}
                </p>
              </div>
              {maxLoss !== 0 && maxProfit > 0 && maxLoss < 0 && (
                <div className="col-span-2 rounded-xl bg-surface-secondary border border-surface-tertiary p-3 text-center">
                  <p className="text-[10px] text-slate-500 mb-1">Reward : Risk</p>
                  <p className="text-sm font-bold text-white">
                    {(maxProfit / Math.abs(maxLoss)).toFixed(2)} : 1
                  </p>
                </div>
              )}
              {breakEvens.length > 0 && (
                <div className="col-span-2 rounded-xl bg-surface-secondary border border-surface-tertiary px-3 py-2 text-center">
                  <p className="text-[10px] text-slate-500 mb-1">Break-even{breakEvens.length > 1 ? 's' : ''}</p>
                  <p className="text-xs font-semibold text-amber-400">{breakEvens.map((be) => be.toLocaleString('en-IN')).join(' / ')}</p>
                </div>
              )}
            </div>
          )}

          {/* Legs count hint */}
          {legs.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {legs.map((l) => (
                <span
                  key={l.id}
                  className={clsx(
                    'text-[10px] px-2 py-0.5 rounded border',
                    l.type === 'BUY'
                      ? 'text-emerald-400 bg-emerald-900/10 border-emerald-800/30'
                      : 'text-red-400 bg-red-900/10 border-red-800/30',
                  )}
                >
                  {l.type} {l.lots}× {l.optionType} {l.strike || '?'}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {showSave && (
        <SaveModal
          legs={legs}
          instrument={instrument}
          existingId={editId ?? undefined}
          onClose={() => setShowSave(false)}
          onSaved={(_savedId) => { setShowSave(false); qc.invalidateQueries({ queryKey: ['my-strategies'] }); navigate('/my-strategies') }}
        />
      )}
      {showTemplate && (
        <TemplateModal
          templates={templates}
          onSelect={loadTemplate}
          onClose={() => setShowTemplate(false)}
        />
      )}
    </div>
  )
}
