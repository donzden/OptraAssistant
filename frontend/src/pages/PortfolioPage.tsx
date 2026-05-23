import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import { deletePosition, fetchPortfolioGreeks, fetchPositions, fetchUpstoxStatus } from '@/api/portfolio'
import AddPositionModal from '@/components/Portfolio/AddPositionModal'
import GreeksDashboard from '@/components/Portfolio/GreeksDashboard'
import UpstoxConnectBanner from '@/components/Portfolio/UpstoxConnectBanner'
import type { Position } from '@/types/portfolio'

function fmt(v: number | null | undefined): string {
  if (v == null) return '—'
  return v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function PositionRow({ pos, onDelete }: { pos: Position; onDelete: (id: string) => void }) {
  const isLong = pos.positionType === 'LONG'
  return (
    <tr className="border-b border-slate-700/50 hover:bg-slate-800/40 transition-colors group">
      <td className="px-4 py-2.5 font-semibold text-slate-200">{pos.symbol}</td>
      <td className="px-4 py-2.5 text-right">{pos.strike.toLocaleString('en-IN')}</td>
      <td className="px-4 py-2.5 text-center">
        <span className={clsx('px-2 py-0.5 rounded text-xs font-medium', pos.optionType === 'CE' ? 'bg-emerald-900/40 text-emerald-400' : 'bg-red-900/40 text-red-400')}>
          {pos.optionType}
        </span>
      </td>
      <td className="px-4 py-2.5 text-center">
        <span className={clsx('flex items-center justify-center gap-0.5 text-xs font-medium', isLong ? 'text-emerald-400' : 'text-red-400')}>
          {isLong ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
          {pos.positionType}
        </span>
      </td>
      <td className="px-4 py-2.5 text-right text-slate-300">{pos.lots} × {pos.lotSize}</td>
      <td className="px-4 py-2.5 text-right">₹{fmt(pos.avgPrice)}</td>
      <td className="px-4 py-2.5 text-right text-slate-400 text-xs">{pos.expiry}</td>
      <td className="px-4 py-2.5 text-center">
        <span className={clsx('text-xs px-1.5 py-0.5 rounded', pos.source === 'UPSTOX_IMPORT' ? 'bg-indigo-900/40 text-indigo-400' : 'bg-slate-700 text-slate-400')}>
          {pos.source === 'UPSTOX_IMPORT' ? 'Upstox' : 'Manual'}
        </span>
      </td>
      <td className="px-4 py-2.5 text-center">
        <button
          onClick={() => onDelete(pos.id)}
          className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 transition-all"
        >
          <Trash2 size={14} />
        </button>
      </td>
    </tr>
  )
}

export default function PortfolioPage() {
  const [showAddModal, setShowAddModal] = useState(false)
  const queryClient = useQueryClient()

  const { data: positions = [] } = useQuery({
    queryKey: ['positions'],
    queryFn: fetchPositions,
  })

  const { data: upstoxStatus } = useQuery({
    queryKey: ['upstox-status'],
    queryFn: fetchUpstoxStatus,
  })

  const { data: greeks } = useQuery({
    queryKey: ['portfolio-greeks'],
    queryFn: () => fetchPortfolioGreeks(),
    enabled: positions.length > 0,
    refetchInterval: 60_000,
  })

  const deleteMutation = useMutation({
    mutationFn: deletePosition,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['positions'] })
      queryClient.invalidateQueries({ queryKey: ['portfolio-greeks'] })
      toast.success('Position removed')
    },
  })

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['positions'] })
    queryClient.invalidateQueries({ queryKey: ['portfolio-greeks'] })
    queryClient.invalidateQueries({ queryKey: ['upstox-status'] })
  }

  return (
    <div className="space-y-5 p-4 md:p-6 max-w-screen-xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Minus size={20} className="text-indigo-400" />
          <h1 className="text-xl font-bold text-slate-100">Portfolio</h1>
          {positions.length > 0 && (
            <span className="text-xs bg-slate-700 text-slate-400 px-2 py-0.5 rounded-full">{positions.length} position{positions.length !== 1 ? 's' : ''}</span>
          )}
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus size={15} />
          Add Position
        </button>
      </div>

      {/* Upstox connect banner */}
      <UpstoxConnectBanner
        connected={upstoxStatus?.connected ?? false}
        onStatusChange={invalidateAll}
        onImported={invalidateAll}
      />

      {/* Greeks dashboard — only show when positions exist */}
      {greeks && positions.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3">Portfolio Greeks</h2>
          <GreeksDashboard greeks={greeks} positions={positions} />
        </div>
      )}

      {/* Positions table */}
      <div>
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3">Positions</h2>
        {positions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 bg-slate-800/40 border border-slate-700 rounded-xl text-slate-500 gap-2">
            <span className="text-3xl">📭</span>
            <p className="text-sm">No positions yet — add one manually or sync from Upstox</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-700">
            <table className="w-full text-sm text-slate-300 border-collapse">
              <thead>
                <tr className="bg-slate-800 text-slate-400 text-xs uppercase tracking-wide">
                  <th className="px-4 py-2.5 text-left">Symbol</th>
                  <th className="px-4 py-2.5 text-right">Strike</th>
                  <th className="px-4 py-2.5 text-center">Type</th>
                  <th className="px-4 py-2.5 text-center">Direction</th>
                  <th className="px-4 py-2.5 text-right">Qty</th>
                  <th className="px-4 py-2.5 text-right">Avg Price</th>
                  <th className="px-4 py-2.5 text-right">Expiry</th>
                  <th className="px-4 py-2.5 text-center">Source</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {positions.map((pos) => (
                  <PositionRow
                    key={pos.id}
                    pos={pos}
                    onDelete={(id) => deleteMutation.mutate(id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showAddModal && (
        <AddPositionModal
          onClose={() => setShowAddModal(false)}
          onAdded={() => {
            queryClient.invalidateQueries({ queryKey: ['positions'] })
            queryClient.invalidateQueries({ queryKey: ['portfolio-greeks'] })
          }}
        />
      )}
    </div>
  )
}
