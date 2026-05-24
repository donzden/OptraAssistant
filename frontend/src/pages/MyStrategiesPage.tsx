import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Wrench, Copy, Trash2, RefreshCw, Tag, FileText,
  ChevronRight, Plus,
} from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import { fetchMyStrategies, deleteMyStrategy, duplicateMyStrategy } from '@/api/strategies'
import type { UserStrategy } from '@/types/strategies'

const RISK_COLORS: Record<string, string> = {
  CONSERVATIVE: 'text-blue-300 bg-blue-900/20 border-blue-800/40',
  MODERATE: 'text-amber-300 bg-amber-900/20 border-amber-800/40',
  AGGRESSIVE: 'text-red-300 bg-red-900/20 border-red-800/40',
}

const CATEGORY_LABELS: Record<string, string> = {
  DIRECTIONAL: 'Directional',
  NON_DIRECTIONAL: 'Non-Dir.',
  VOLATILITY: 'Volatility',
}

function ConfirmModal({ message, onConfirm, onCancel }: { message: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-surface-secondary border border-surface-tertiary rounded-xl p-6 w-full max-w-sm space-y-4">
        <p className="text-sm text-slate-200">{message}</p>
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 px-4 py-2 rounded-lg border border-slate-700 text-sm text-slate-300 hover:text-white transition-colors">Cancel</button>
          <button onClick={onConfirm} className="flex-1 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors">Delete</button>
        </div>
      </div>
    </div>
  )
}

function StrategyCard({ strategy, onEdit, onDuplicate, onDelete }: {
  strategy: UserStrategy
  onEdit: () => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  const legSummary = strategy.legs.slice(0, 4).map((l) => `${l.type[0]}${l.optionType}`).join(' · ')

  return (
    <div className="rounded-xl bg-surface-secondary border border-surface-tertiary hover:border-primary-600/40 transition-all group">
      <div className="p-4 space-y-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-white truncate">{strategy.name}</h3>
              {strategy.isTemplate && (
                <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded border border-primary-600/40 bg-primary-900/20 text-primary-400">TPL</span>
              )}
            </div>
            {strategy.description && (
              <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{strategy.description}</p>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={onDuplicate}
              className="p-1.5 rounded-lg text-slate-500 hover:text-primary-400 hover:bg-primary-900/20 transition-colors"
              title="Duplicate"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onEdit}
              className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-surface-tertiary transition-colors"
              title="Edit in builder"
            >
              <Wrench className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onDelete}
              className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-900/20 transition-colors"
              title="Delete"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Tags */}
        {(strategy.tags?.length ?? 0) > 0 && (
          <div className="flex flex-wrap gap-1">
            {(strategy.tags ?? []).map((tag) => (
              <span key={tag} className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-surface-tertiary text-slate-400">
                <Tag className="w-2.5 h-2.5" />{tag}
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          <span className={clsx('text-[10px] px-1.5 py-0.5 rounded border', RISK_COLORS[strategy.riskLevel])}>{strategy.riskLevel}</span>
          <span className="text-[10px] text-slate-500">{CATEGORY_LABELS[strategy.category]}</span>
          <span className="text-[10px] text-slate-500">•</span>
          <span className="text-[10px] text-slate-500">{strategy.legs.length} legs</span>
          {legSummary && (
            <>
              <span className="text-[10px] text-slate-500">•</span>
              <span className="text-[10px] text-slate-400 font-mono">{legSummary}</span>
            </>
          )}
        </div>

        {strategy.notes && (
          <div className="flex items-start gap-1.5 text-[10px] text-slate-500">
            <FileText className="w-3 h-3 mt-0.5 shrink-0" />
            <p className="line-clamp-2">{strategy.notes}</p>
          </div>
        )}

        <div className="flex items-center justify-between pt-1 border-t border-surface-tertiary/50">
          <span className="text-[10px] text-slate-600">
            {new Date(strategy.updatedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
          </span>
          <button
            onClick={onEdit}
            className="flex items-center gap-0.5 text-[10px] text-primary-400 hover:text-primary-300 transition-colors"
          >
            Open in Builder <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  )
}

export default function MyStrategiesPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const { data: strategies = [], isLoading } = useQuery({
    queryKey: ['my-strategies'],
    queryFn: fetchMyStrategies,
    staleTime: 60_000,
  })

  const deleteMutation = useMutation({
    mutationFn: deleteMyStrategy,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-strategies'] })
      toast.success('Strategy deleted')
      setConfirmDelete(null)
    },
    onError: () => toast.error('Failed to delete strategy'),
  })

  const duplicateMutation = useMutation({
    mutationFn: duplicateMyStrategy,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-strategies'] })
      toast.success('Strategy duplicated')
    },
    onError: () => toast.error('Failed to duplicate strategy'),
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading strategies…
      </div>
    )
  }

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-white">My Strategies</h1>
          <p className="text-xs text-slate-400 mt-0.5">{strategies.length} saved {strategies.length === 1 ? 'strategy' : 'strategies'}</p>
        </div>
        <button
          onClick={() => navigate('/builder')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-xs font-medium transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> New Strategy
        </button>
      </div>

      {strategies.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 rounded-xl border border-dashed border-slate-700 text-slate-500 space-y-3">
          <Wrench className="w-10 h-10 opacity-30" />
          <p className="text-sm font-medium text-slate-400">No saved strategies yet</p>
          <p className="text-xs text-center max-w-xs">Use the Strategy Builder to create and save your own custom option strategies.</p>
          <button
            onClick={() => navigate('/builder')}
            className="mt-2 flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" /> Build your first strategy
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {strategies.map((s) => (
            <StrategyCard
              key={s.id}
              strategy={s}
              onEdit={() => navigate(`/builder?editId=${s.id}`)}
              onDuplicate={() => duplicateMutation.mutate(s.id)}
              onDelete={() => setConfirmDelete(s.id)}
            />
          ))}
        </div>
      )}

      {confirmDelete && (
        <ConfirmModal
          message="Delete this strategy? This action cannot be undone."
          onConfirm={() => deleteMutation.mutate(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  )
}
