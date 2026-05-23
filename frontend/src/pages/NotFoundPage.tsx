import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

export default function NotFoundPage() {
  return (
    <div className="min-h-screen bg-surface flex items-center justify-center px-4">
      <div className="text-center space-y-4">
        <p className="text-7xl font-bold text-primary-700">404</p>
        <h1 className="text-xl font-semibold text-white">Page not found</h1>
        <p className="text-sm text-slate-400">The page you're looking for doesn't exist or has moved.</p>
        <Link to="/dashboard" className="btn-primary inline-flex">
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </Link>
      </div>
    </div>
  )
}
