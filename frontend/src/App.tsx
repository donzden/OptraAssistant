import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import AppShell from '@/components/layout/AppShell'
import LoginPage from '@/pages/auth/LoginPage'
import RegisterPage from '@/pages/auth/RegisterPage'
import VerifyEmailPage from '@/pages/auth/VerifyEmailPage'
import ForgotPasswordPage from '@/pages/auth/ForgotPasswordPage'
import ResetPasswordPage from '@/pages/auth/ResetPasswordPage'
import DashboardPage from '@/pages/DashboardPage'
import ProfilePage from '@/pages/ProfilePage'
import AdminPage from '@/pages/admin/AdminPage'
import OptionsChainPage from '@/pages/OptionsChainPage'
import PortfolioPage from '@/pages/PortfolioPage'
import RecommendationsPage from '@/pages/RecommendationsPage'
import StrategyLibraryPage from '@/pages/StrategyLibraryPage'
import StrategyDetailPage from '@/pages/StrategyDetailPage'
import HelpPage from '@/pages/HelpPage'
import NotFoundPage from '@/pages/NotFoundPage'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />
}

function GuestOnly({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  return isAuthenticated ? <Navigate to="/dashboard" replace /> : <>{children}</>
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user)
  return user?.role === 'ADMIN' ? <>{children}</> : <Navigate to="/dashboard" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public auth routes */}
        <Route path="/login" element={<GuestOnly><LoginPage /></GuestOnly>} />
        <Route path="/register" element={<GuestOnly><RegisterPage /></GuestOnly>} />
        <Route path="/verify-email" element={<GuestOnly><VerifyEmailPage /></GuestOnly>} />
        <Route path="/forgot-password" element={<GuestOnly><ForgotPasswordPage /></GuestOnly>} />
        <Route path="/reset-password" element={<GuestOnly><ResetPasswordPage /></GuestOnly>} />

        {/* Protected app routes */}
        <Route element={<RequireAuth><AppShell /></RequireAuth>}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/admin" element={<RequireAdmin><AdminPage /></RequireAdmin>} />
          {/* Sprint 2 */}
          <Route path="/options-chain" element={<OptionsChainPage />} />
          <Route path="/portfolio" element={<PortfolioPage />} />
          {/* Sprint 3 */}
          <Route path="/strategies" element={<RecommendationsPage />} />
          <Route path="/library" element={<StrategyLibraryPage />} />
          <Route path="/library/:id" element={<StrategyDetailPage />} />
          {/* Sprint 4+ stubs */}
          <Route path="/builder" element={<ComingSoon title="Strategy Builder" />} />
          <Route path="/my-strategies" element={<ComingSoon title="My Strategies" />} />
          <Route path="/watchlist" element={<ComingSoon title="Watchlist" />} />
          <Route path="/help" element={<HelpPage />} />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  )
}

function ComingSoon({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-400">
      <div className="text-4xl">🚧</div>
      <h2 className="text-xl font-semibold text-slate-200">{title}</h2>
      <p className="text-sm">Coming in Sprint 3+</p>
    </div>
  )
}
