import { useAuthStore } from '@/store/authStore'
import { TrendingUp, Lightbulb, BookOpen, Wrench } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">
          Good morning, {user?.name?.split(' ')[0]} 👋
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Here's your OptraAssistant overview for today.
        </p>
      </div>

      {/* Quick action cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { to: '/strategies', icon: Lightbulb, label: "Today's Recommendations", desc: 'AI-powered strategy picks', color: 'text-primary-400 bg-primary-500/10' },
          { to: '/library', icon: BookOpen, label: 'Strategy Library', desc: 'Browse all strategies', color: 'text-amber-400 bg-amber-500/10' },
          { to: '/builder', icon: Wrench, label: 'Strategy Builder', desc: 'Build a custom strategy', color: 'text-emerald-400 bg-emerald-500/10' },
          { to: '/portfolio', icon: TrendingUp, label: 'Portfolio', desc: 'Track live Greeks & P&L', color: 'text-rose-400 bg-rose-500/10' },
        ].map(({ to, icon: Icon, label, desc, color }) => (
          <Link key={to} to={to} className="card p-4 hover:border-slate-600 transition-all hover:shadow-lg group">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 ${color}`}>
              <Icon className="w-4 h-4" />
            </div>
            <p className="text-sm font-medium text-slate-100 group-hover:text-white">{label}</p>
            <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
          </Link>
        ))}
      </div>

      {/* Coming soon placeholder */}
      <div className="card p-6 flex flex-col items-center justify-center text-center min-h-[180px] gap-2">
        <TrendingUp className="w-8 h-8 text-slate-600" />
        <p className="text-slate-400 text-sm">Market data and live Greeks will appear here in Sprint 2</p>
      </div>
    </div>
  )
}
