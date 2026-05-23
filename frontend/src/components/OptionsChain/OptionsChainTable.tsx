import { useMemo, useRef, useEffect } from 'react'
import clsx from 'clsx'
import type { OptionStrike } from '@/types/market'

interface Props {
  strikes: OptionStrike[]
  spotPrice: number
  showGreeks: boolean
}

function fmt(v: number | null | undefined, digits = 2): string {
  if (v == null) return '—'
  return v.toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

function fmtOI(v: number | null | undefined): string {
  if (v == null) return '—'
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`
  return String(v)
}

export default function OptionsChainTable({ strikes, spotPrice, showGreeks }: Props) {
  const atmRef = useRef<HTMLTableRowElement>(null)

  useEffect(() => {
    atmRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [strikes])

  const sorted = useMemo(() => [...strikes].sort((a, b) => b.strike_price - a.strike_price), [strikes])

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-700">
      <table className="w-full text-xs text-slate-300 border-collapse">
        <thead>
          <tr className="bg-slate-800 text-slate-400 uppercase tracking-wide text-[11px]">
            {/* CE side */}
            <th className="px-3 py-2 text-right">OI</th>
            <th className="px-3 py-2 text-right">Vol</th>
            <th className="px-3 py-2 text-right">IV%</th>
            {showGreeks && <th className="px-3 py-2 text-right">Δ</th>}
            <th className="px-3 py-2 text-right font-semibold text-emerald-400">CE LTP</th>
            {/* Strike */}
            <th className="px-4 py-2 text-center font-bold text-slate-200 bg-slate-700/50">Strike</th>
            {/* PE side */}
            <th className="px-3 py-2 text-left font-semibold text-red-400">PE LTP</th>
            {showGreeks && <th className="px-3 py-2 text-left">Δ</th>}
            <th className="px-3 py-2 text-left">IV%</th>
            <th className="px-3 py-2 text-left">Vol</th>
            <th className="px-3 py-2 text-left">OI</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => {
            const isAtm = row.is_atm
            const isITM_CE = row.strike_price < spotPrice
            const isITM_PE = row.strike_price > spotPrice
            return (
              <tr
                key={row.strike_price}
                ref={isAtm ? atmRef : undefined}
                className={clsx(
                  'border-b border-slate-700/50 transition-colors',
                  isAtm
                    ? 'bg-amber-900/25 border-amber-600/40'
                    : isITM_CE
                    ? 'bg-emerald-950/20'
                    : isITM_PE
                    ? 'bg-red-950/20'
                    : 'hover:bg-slate-800/40',
                )}
              >
                {/* CE OI */}
                <td className="px-3 py-1.5 text-right text-slate-400">{fmtOI(row.ce?.open_interest)}</td>
                {/* CE Vol */}
                <td className="px-3 py-1.5 text-right text-slate-400">{fmtOI(row.ce?.volume)}</td>
                {/* CE IV */}
                <td className="px-3 py-1.5 text-right">{fmt(row.ce?.iv, 1)}</td>
                {/* CE Delta */}
                {showGreeks && (
                  <td className="px-3 py-1.5 text-right text-emerald-300">{fmt(row.ce?.greeks?.delta, 3)}</td>
                )}
                {/* CE LTP */}
                <td className="px-3 py-1.5 text-right font-semibold text-emerald-400">{fmt(row.ce?.ltp)}</td>

                {/* Strike */}
                <td
                  className={clsx(
                    'px-4 py-1.5 text-center font-bold bg-slate-700/50',
                    isAtm ? 'text-amber-400' : 'text-slate-200',
                  )}
                >
                  {row.strike_price.toLocaleString('en-IN')}
                  {isAtm && <span className="ml-1 text-[9px] text-amber-400 font-normal">ATM</span>}
                </td>

                {/* PE LTP */}
                <td className="px-3 py-1.5 text-left font-semibold text-red-400">{fmt(row.pe?.ltp)}</td>
                {/* PE Delta */}
                {showGreeks && (
                  <td className="px-3 py-1.5 text-left text-red-300">{fmt(row.pe?.greeks?.delta, 3)}</td>
                )}
                {/* PE IV */}
                <td className="px-3 py-1.5 text-left">{fmt(row.pe?.iv, 1)}</td>
                {/* PE Vol */}
                <td className="px-3 py-1.5 text-left text-slate-400">{fmtOI(row.pe?.volume)}</td>
                {/* PE OI */}
                <td className="px-3 py-1.5 text-left text-slate-400">{fmtOI(row.pe?.open_interest)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
