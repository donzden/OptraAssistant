import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Activity, RefreshCw, Eye, EyeOff } from 'lucide-react'
import clsx from 'clsx'
import { fetchExpiries, fetchMarketSentiment, fetchOptionsChain } from '@/api/market'
import OptionsChainTable from '@/components/OptionsChain/OptionsChainTable'

const SYMBOLS = ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY']

const SENTIMENT_COLORS = {
  LOW_VOL: 'text-emerald-400 bg-emerald-900/30 border-emerald-700/40',
  MODERATE: 'text-amber-400 bg-amber-900/30 border-amber-700/40',
  HIGH_VOL: 'text-orange-400 bg-orange-900/30 border-orange-700/40',
  EXTREME: 'text-red-400 bg-red-900/30 border-red-700/40',
}

const TREND_COLORS = {
  BULLISH: 'text-emerald-400',
  BEARISH: 'text-red-400',
  SIDEWAYS: 'text-amber-400',
}

export default function OptionsChainPage() {
  const [symbol, setSymbol] = useState('NIFTY')
  const [expiry, setExpiry] = useState<string | undefined>(undefined)
  const [showGreeks, setShowGreeks] = useState(false)

  const { data: expiries } = useQuery({
    queryKey: ['expiries', symbol],
    queryFn: () => fetchExpiries(symbol),
    staleTime: 60_000,
  })

  const selectedExpiry = expiry ?? expiries?.[0]

  const {
    data: chain,
    isLoading,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['options-chain', symbol, selectedExpiry],
    queryFn: () => fetchOptionsChain(symbol, selectedExpiry),
    enabled: !!selectedExpiry,
    staleTime: 30_000,
    refetchInterval: 60_000,
  })

  const { data: sentiment } = useQuery({
    queryKey: ['market-sentiment'],
    queryFn: fetchMarketSentiment,
    staleTime: 60_000,
    refetchInterval: 120_000,
  })

  return (
    <div className="space-y-5 p-4 md:p-6 max-w-screen-xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-2">
          <Activity size={20} className="text-indigo-400" />
          <h1 className="text-xl font-bold text-slate-100">Options Chain</h1>
        </div>

        {/* Sentiment banner */}
        {sentiment && (
          <div className={clsx('flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs', SENTIMENT_COLORS[sentiment.vix.sentiment])}>
            <span className="font-semibold">VIX {sentiment.vix.value.toFixed(2)}</span>
            <span className="opacity-60">|</span>
            <span>{sentiment.vix.sentiment.replace('_', ' ')}</span>
            <span className="opacity-60">|</span>
            <span className={TREND_COLORS[sentiment.nifty_trend]}>{sentiment.nifty_trend}</span>
            <span className="opacity-60">PCR {sentiment.pcr.toFixed(2)}</span>
            {sentiment.is_mock && <span className="ml-1 opacity-50">(mock)</span>}
          </div>
        )}

        <div className="sm:ml-auto flex items-center gap-2">
          <button
            onClick={() => setShowGreeks((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs transition-colors"
          >
            {showGreeks ? <EyeOff size={13} /> : <Eye size={13} />}
            {showGreeks ? 'Hide' : 'Show'} Greeks
          </button>
          <button
            onClick={() => refetch()}
            disabled={isRefetching}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs transition-colors disabled:opacity-50"
          >
            <RefreshCw size={13} className={isRefetching ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Market sentiment advice */}
      {sentiment && (
        <div className="bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3 text-xs text-slate-300">
          <span className="font-medium text-slate-200">Suggested stance: </span>
          {sentiment.recommended_stance}
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-wrap gap-3 items-center">
        {/* Symbol tabs */}
        <div className="flex gap-1 bg-slate-800 p-1 rounded-lg">
          {SYMBOLS.map((s) => (
            <button
              key={s}
              onClick={() => { setSymbol(s); setExpiry(undefined) }}
              className={clsx(
                'px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                symbol === s ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200',
              )}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Expiry selector */}
        {expiries && expiries.length > 0 && (
          <div className="flex gap-1 bg-slate-800 p-1 rounded-lg">
            {expiries.map((e) => (
              <button
                key={e}
                onClick={() => setExpiry(e)}
                className={clsx(
                  'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                  selectedExpiry === e ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-slate-200',
                )}
              >
                {e}
              </button>
            ))}
          </div>
        )}

        {/* Spot + info pills */}
        {chain && (
          <div className="flex gap-2 ml-auto flex-wrap">
            <span className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-300">
              Spot <span className="font-semibold text-slate-100">₹{chain.spot_price.toLocaleString('en-IN')}</span>
            </span>
            {chain.atm_iv != null && (
              <span className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-300">
                ATM IV <span className="font-semibold text-slate-100">{chain.atm_iv.toFixed(1)}%</span>
              </span>
            )}
            {chain.iv_rank != null && (
              <span className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-300">
                IV Rank <span className="font-semibold text-amber-400">{chain.iv_rank.toFixed(0)}</span>
              </span>
            )}
            {chain.iv_percentile != null && (
              <span className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-300">
                IV%ile <span className="font-semibold text-amber-400">{chain.iv_percentile.toFixed(0)}</span>
              </span>
            )}
            {chain.pcr != null && (
              <span className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-300">
                PCR <span className="font-semibold text-slate-100">{chain.pcr.toFixed(2)}</span>
              </span>
            )}
            {chain.is_mock && (
              <span className="px-3 py-1.5 bg-amber-900/30 border border-amber-700/40 rounded-lg text-xs text-amber-400">
                Mock data
              </span>
            )}
          </div>
        )}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64 text-slate-500">Loading options chain…</div>
      ) : chain ? (
        <OptionsChainTable strikes={chain.strikes} spotPrice={chain.spot_price} showGreeks={showGreeks} />
      ) : null}
    </div>
  )
}
