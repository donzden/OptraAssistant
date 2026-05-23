import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { X } from 'lucide-react'
import toast from 'react-hot-toast'
import { addPosition } from '@/api/portfolio'
import type { AddPositionPayload } from '@/types/portfolio'

const schema = z.object({
  symbol: z.enum(['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY']),
  strike: z.coerce.number().positive('Strike must be positive'),
  expiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD format'),
  optionType: z.enum(['CE', 'PE']),
  positionType: z.enum(['LONG', 'SHORT']),
  lots: z.coerce.number().int().min(1),
  lotSize: z.coerce.number().int().min(1),
  avgPrice: z.coerce.number().min(0, 'Avg price must be ≥ 0'),
  notes: z.string().max(500).optional(),
})

const LOT_SIZES: Record<string, number> = {
  NIFTY: 25,
  BANKNIFTY: 15,
  FINNIFTY: 40,
  MIDCPNIFTY: 50,
}

interface Props {
  onClose: () => void
  onAdded: () => void
}

export default function AddPositionModal({ onClose, onAdded }: Props) {
  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm<AddPositionPayload>({
    resolver: zodResolver(schema),
    defaultValues: { symbol: 'NIFTY', optionType: 'CE', positionType: 'LONG', lots: 1, lotSize: 25 },
  })

  // Auto-fill lot size when symbol changes
  const handleSymbolChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const sym = e.target.value as keyof typeof LOT_SIZES
    setValue('symbol', sym as any)
    setValue('lotSize', LOT_SIZES[sym] ?? 50)
  }

  const onSubmit = async (data: AddPositionPayload) => {
    try {
      await addPosition(data)
      toast.success('Position added')
      onAdded()
      onClose()
    } catch {
      toast.error('Failed to add position')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-md mx-4 shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
          <h2 className="font-semibold text-slate-100">Add Position</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {/* Symbol */}
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Symbol</label>
              <select
                {...register('symbol')}
                onChange={handleSymbolChange}
                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                {['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY'].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            {/* Option Type */}
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Type</label>
              <div className="flex rounded-lg overflow-hidden border border-slate-600">
                {(['CE', 'PE'] as const).map((t) => (
                  <label key={t} className="flex-1 text-center cursor-pointer">
                    <input type="radio" value={t} {...register('optionType')} className="sr-only" />
                    <span className={`block py-2 text-sm font-medium transition-colors ${watch('optionType') === t ? (t === 'CE' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white') : 'text-slate-400 hover:bg-slate-700'}`}>
                      {t}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Strike */}
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Strike</label>
              <input
                type="number"
                {...register('strike')}
                placeholder="22000"
                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              {errors.strike && <p className="text-red-400 text-xs mt-1">{errors.strike.message}</p>}
            </div>

            {/* Expiry */}
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Expiry</label>
              <input
                type="date"
                {...register('expiry')}
                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              {errors.expiry && <p className="text-red-400 text-xs mt-1">{errors.expiry.message}</p>}
            </div>

            {/* Position Type */}
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Direction</label>
              <div className="flex rounded-lg overflow-hidden border border-slate-600">
                {(['LONG', 'SHORT'] as const).map((t) => (
                  <label key={t} className="flex-1 text-center cursor-pointer">
                    <input type="radio" value={t} {...register('positionType')} className="sr-only" />
                    <span className={`block py-2 text-sm font-medium transition-colors ${watch('positionType') === t ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-700'}`}>
                      {t}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Avg Price */}
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Avg Price (₹)</label>
              <input
                type="number"
                step="0.05"
                {...register('avgPrice')}
                placeholder="150.00"
                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              {errors.avgPrice && <p className="text-red-400 text-xs mt-1">{errors.avgPrice.message}</p>}
            </div>

            {/* Lots */}
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Lots</label>
              <input
                type="number"
                {...register('lots')}
                placeholder="1"
                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              {errors.lots && <p className="text-red-400 text-xs mt-1">{errors.lots.message}</p>}
            </div>

            {/* Lot Size */}
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Lot Size</label>
              <input
                type="number"
                {...register('lotSize')}
                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Notes (optional)</label>
            <input
              {...register('notes')}
              placeholder="e.g. Iron Condor leg 1"
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 rounded-lg border border-slate-600 text-slate-400 text-sm hover:bg-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors disabled:opacity-60"
            >
              {isSubmitting ? 'Adding…' : 'Add Position'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
