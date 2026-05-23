import { useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Lightbulb, BookOpen, Wrench, Bookmark,
  BarChart2, Eye, User, LogOut, Menu, ChevronLeft,
  Bell, ShieldCheck, Activity,
} from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { authApi } from '@/api/auth'
import clsx from 'clsx'

const NAV_ITEMS = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/options-chain', icon: Activity, label: 'Options Chain' },
  { to: '/portfolio', icon: BarChart2, label: 'Portfolio' },
  { to: '/strategies', icon: Lightbulb, label: 'Recommender' },
  { to: '/library', icon: BookOpen, label: 'Strategy Library' },
  { to: '/builder', icon: Wrench, label: 'Builder' },
  { to: '/my-strategies', icon: Bookmark, label: 'My Strategies' },
  { to: '/watchlist', icon: Eye, label: 'Watchlist' },
]

export default function AppShell() {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const navigate = useNavigate()

  const handleLogout = async () => {
    try { await authApi.logout() } catch { /* ignore */ }
    sessionStorage.removeItem('access_token')
    logout()
    navigate('/login')
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 md:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-50 flex flex-col bg-surface-secondary border-r border-surface-tertiary transition-all duration-200',
          'md:relative md:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
          collapsed ? 'w-16' : 'w-56',
        )}
      >
        {/* Logo */}
        <div className="flex items-center gap-2 px-4 py-4 border-b border-surface-tertiary">
          <div className="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
            OA
          </div>
          {!collapsed && (
            <span className="font-semibold text-white text-sm truncate">OptraAssistant</span>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="ml-auto text-slate-400 hover:text-white hidden md:block"
          >
            <ChevronLeft className={clsx('w-4 h-4 transition-transform', collapsed && 'rotate-180')} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 px-2.5 py-2 rounded-lg text-sm transition-all duration-150',
                  isActive
                    ? 'bg-primary-600/20 text-primary-400 font-medium'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-surface-tertiary/50',
                )
              }
            >
              <Icon className="w-4 h-4 shrink-0" />
              {!collapsed && <span>{label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* Bottom links */}
        <div className="border-t border-surface-tertiary p-2 space-y-0.5">
          {user?.role === 'ADMIN' && (
            <NavLink
              to="/admin"
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 px-2.5 py-2 rounded-lg text-sm transition-all duration-150',
                  isActive ? 'bg-primary-600/20 text-primary-400' : 'text-slate-400 hover:text-slate-100 hover:bg-surface-tertiary/50',
                )
              }
            >
              <ShieldCheck className="w-4 h-4 shrink-0" />
              {!collapsed && <span>Admin</span>}
            </NavLink>
          )}
          <NavLink
            to="/profile"
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3 px-2.5 py-2 rounded-lg text-sm transition-all duration-150',
                isActive ? 'bg-primary-600/20 text-primary-400' : 'text-slate-400 hover:text-slate-100 hover:bg-surface-tertiary/50',
              )
            }
          >
            <User className="w-4 h-4 shrink-0" />
            {!collapsed && <span>Profile</span>}
          </NavLink>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex items-center gap-3 px-4 py-3 border-b border-surface-tertiary bg-surface-secondary shrink-0">
          <button className="md:hidden text-slate-400 hover:text-white" onClick={() => setMobileOpen(true)}>
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex-1" />

          <button className="relative text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-surface-tertiary">
            <Bell className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-2 pl-2 border-l border-surface-tertiary">
            <div className="w-7 h-7 rounded-full bg-primary-700 flex items-center justify-center text-xs font-medium text-white">
              {user?.name?.charAt(0).toUpperCase() ?? 'U'}
            </div>
            {!collapsed && (
              <span className="text-sm text-slate-300 hidden sm:block max-w-[120px] truncate">
                {user?.name}
              </span>
            )}
            <button
              onClick={handleLogout}
              className="text-slate-400 hover:text-red-400 p-1.5 rounded-lg hover:bg-surface-tertiary transition-colors"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
