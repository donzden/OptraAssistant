import { useAuthStore } from '@/store/authStore'
import { CheckCircle, XCircle, User, Shield } from 'lucide-react'

export default function ProfilePage() {
  const user = useAuthStore((s) => s.user)

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold text-white">Profile</h1>

      <div className="card p-6 space-y-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-primary-700 flex items-center justify-center text-xl font-semibold text-white">
            {user?.name?.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="font-medium text-white">{user?.name}</p>
            <p className="text-sm text-slate-400">{user?.email}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 pt-2">
          <div>
            <p className="label">Email status</p>
            <div className="flex items-center gap-1.5">
              {user?.emailVerified
                ? <><CheckCircle className="w-4 h-4 text-emerald-400" /><span className="text-sm text-emerald-400">Verified</span></>
                : <><XCircle className="w-4 h-4 text-red-400" /><span className="text-sm text-red-400">Not verified</span></>
              }
            </div>
          </div>
          <div>
            <p className="label">Phone status</p>
            <div className="flex items-center gap-1.5">
              {user?.phoneVerified
                ? <><CheckCircle className="w-4 h-4 text-emerald-400" /><span className="text-sm text-emerald-400">Verified</span></>
                : <><XCircle className="w-4 h-4 text-slate-500" /><span className="text-sm text-slate-500">Not verified</span></>
              }
            </div>
          </div>
          <div>
            <p className="label">Risk appetite</p>
            <span className="text-sm text-slate-200">{user?.riskAppetite ?? '—'}</span>
          </div>
          <div>
            <p className="label">Role</p>
            <span className="text-sm text-slate-200">{user?.role}</span>
          </div>
        </div>
      </div>

      <div className="card p-5 flex items-center gap-3 text-slate-400 text-sm">
        <User className="w-4 h-4 shrink-0" />
        Full profile editing and phone verification coming in Sprint 1 completion
      </div>
    </div>
  )
}
