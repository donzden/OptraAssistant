import { Link2, RefreshCw, Unlink } from 'lucide-react'
import toast from 'react-hot-toast'
import { disconnectUpstox, importFromUpstox } from '@/api/portfolio'

interface Props {
  connected: boolean
  onStatusChange: () => void
  onImported: () => void
}

export default function UpstoxConnectBanner({ connected, onStatusChange, onImported }: Props) {
  const handleConnect = () => {
    window.location.href = '/api/v1/upstox/auth'
  }

  const handleDisconnect = async () => {
    try {
      await disconnectUpstox()
      toast.success('Upstox disconnected')
      onStatusChange()
    } catch {
      toast.error('Failed to disconnect')
    }
  }

  const handleImport = async () => {
    const t = toast.loading('Importing positions from Upstox…')
    try {
      const result = await importFromUpstox()
      toast.success(`Imported ${result.imported} of ${result.total} positions`, { id: t })
      onImported()
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? 'Import failed'
      toast.error(msg, { id: t })
    }
  }

  if (connected) {
    return (
      <div className="flex items-center gap-3 bg-emerald-900/20 border border-emerald-700/40 rounded-xl px-4 py-3 text-sm">
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        <span className="text-emerald-300 font-medium">Upstox connected</span>
        <button
          onClick={handleImport}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-700/40 hover:bg-emerald-600/50 text-emerald-200 text-xs transition-colors"
        >
          <RefreshCw size={13} />
          Sync positions
        </button>
        <button
          onClick={handleDisconnect}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs transition-colors"
        >
          <Unlink size={13} />
          Disconnect
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3 bg-indigo-900/20 border border-indigo-700/40 rounded-xl px-4 py-3 text-sm">
      <Link2 size={16} className="text-indigo-400 shrink-0" />
      <div>
        <span className="text-slate-300">Connect your Upstox account to auto-import live positions. </span>
        <span className="text-slate-400 text-xs">Or add positions manually below.</span>
      </div>
      <button
        onClick={handleConnect}
        className="ml-auto shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors"
      >
        <Link2 size={13} />
        Connect Upstox
      </button>
    </div>
  )
}
