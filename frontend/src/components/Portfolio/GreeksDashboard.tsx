import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  ReferenceLine,
} from 'recharts'
import type { PortfolioGreeksResponse, Position } from '@/types/portfolio'

interface Props {
  greeks: PortfolioGreeksResponse
  positions: Position[]
}

function GreekCard({ label, value, description }: { label: string; value: string; description: string }) {
  const isNeg = value.startsWith('-')
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
      <div className="text-xs text-slate-400 mb-1">{label}</div>
      <div className={`text-2xl font-bold ${isNeg ? 'text-red-400' : 'text-emerald-400'}`}>{value}</div>
      <div className="text-xs text-slate-500 mt-1">{description}</div>
    </div>
  )
}

export default function GreeksDashboard({ greeks, positions }: Props) {
  const { aggregate, positions: greekPositions, total_pnl } = greeks

  // Radar chart: normalise each greek to ±100 scale for display
  const radarData = [
    { greek: 'Δ Delta', value: Math.min(100, Math.abs(aggregate.delta) * 100) },
    { greek: 'Γ Gamma', value: Math.min(100, Math.abs(aggregate.gamma) * 10000) },
    { greek: 'Θ Theta', value: Math.min(100, Math.abs(aggregate.theta) * 10) },
    { greek: 'V Vega', value: Math.min(100, Math.abs(aggregate.vega) * 10) },
    { greek: 'ρ Rho', value: Math.min(100, Math.abs(aggregate.rho) * 50) },
  ]

  // Bar chart: delta per position
  const deltaData = greekPositions.map((gp) => {
    const pos = positions.find((p) => p.id === gp.position_id)
    const label = pos ? `${pos.symbol} ${pos.strike} ${pos.optionType}` : gp.position_id.slice(0, 8)
    return { name: label, delta: gp.delta, pnl: gp.pnl }
  })

  return (
    <div className="space-y-4">
      {/* Greek summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <GreekCard
          label="Net Delta"
          value={aggregate.delta.toFixed(3)}
          description="≈ ₹ exposure per 1pt move"
        />
        <GreekCard
          label="Net Theta / day"
          value={`₹ ${(aggregate.theta).toFixed(0)}`}
          description="Time decay (positive = earning)"
        />
        <GreekCard
          label="Net Vega"
          value={aggregate.vega.toFixed(2)}
          description="P&L per 1% IV change"
        />
        <GreekCard
          label="Total P&L"
          value={`₹ ${total_pnl.toLocaleString('en-IN', { minimumFractionDigits: 0 })}`}
          description="Mark-to-market"
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Radar */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-slate-300 mb-3">Greeks Risk Profile</h3>
          <ResponsiveContainer width="100%" height={220}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="#334155" />
              <PolarAngleAxis dataKey="greek" tick={{ fill: '#94a3b8', fontSize: 12 }} />
              <Radar
                name="Exposure"
                dataKey="value"
                stroke="#6366f1"
                fill="#6366f1"
                fillOpacity={0.25}
                strokeWidth={2}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* Delta by position */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-slate-300 mb-3">Delta by Position</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={deltaData} layout="vertical" margin={{ left: 8, right: 24 }}>
              <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <YAxis dataKey="name" type="category" width={110} tick={{ fill: '#94a3b8', fontSize: 10 }} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                labelStyle={{ color: '#e2e8f0' }}
                formatter={(v: number) => [v.toFixed(3), 'Delta']}
              />
              <ReferenceLine x={0} stroke="#475569" />
              <Bar dataKey="delta" radius={[0, 4, 4, 0]}>
                {deltaData.map((entry, index) => (
                  <Cell key={index} fill={entry.delta >= 0 ? '#10b981' : '#ef4444'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
