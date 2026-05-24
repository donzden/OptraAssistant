import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Users, UserCheck, Clock, Lock, ChevronLeft, ChevronRight, Shield, ShieldOff } from 'lucide-react'
import { adminApi, type AdminUser, type StrategyWithCount } from '@/api/admin'
import clsx from 'clsx'

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, icon: Icon, color }: { label: string; value?: number; icon: any; color: string }) {
  return (
    <div className="card p-4 flex items-center gap-4">
      <div className={clsx('w-10 h-10 rounded-lg flex items-center justify-center shrink-0', color)}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-2xl font-semibold text-white">{value ?? '—'}</p>
        <p className="text-xs text-slate-400">{label}</p>
      </div>
    </div>
  )
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    ACTIVE: 'badge badge-success',
    PENDING: 'badge badge-warning',
    LOCKED: 'badge badge-danger',
    INACTIVE: 'badge',
  }
  return <span className={map[status] ?? 'badge'}>{status}</span>
}

// ─── Action menu ──────────────────────────────────────────────────────────────

function UserActions({ user, onDone }: { user: AdminUser; onDone: () => void }) {
  const qc = useQueryClient()

  const statusMut = useMutation({
    mutationFn: (status: 'ACTIVE' | 'INACTIVE' | 'LOCKED') => adminApi.setStatus(user.id, status),
    onSuccess: () => { toast.success('Status updated'); qc.invalidateQueries({ queryKey: ['admin-users'] }); onDone() },
    onError: () => toast.error('Failed to update status'),
  })

  const roleMut = useMutation({
    mutationFn: (role: 'USER' | 'ADMIN') => adminApi.setRole(user.id, role),
    onSuccess: () => { toast.success('Role updated'); qc.invalidateQueries({ queryKey: ['admin-users'] }); onDone() },
    onError: () => toast.error('Failed to update role'),
  })

  const loading = statusMut.isPending || roleMut.isPending

  return (
    <div className="absolute right-0 top-8 z-20 w-44 card shadow-xl border border-surface-tertiary py-1 text-sm">
      {user.status !== 'ACTIVE' && (
        <button disabled={loading} onClick={() => statusMut.mutate('ACTIVE')}
          className="w-full text-left px-3 py-1.5 hover:bg-surface-tertiary text-emerald-400">
          Activate
        </button>
      )}
      {user.status !== 'LOCKED' && (
        <button disabled={loading} onClick={() => statusMut.mutate('LOCKED')}
          className="w-full text-left px-3 py-1.5 hover:bg-surface-tertiary text-amber-400">
          Lock
        </button>
      )}
      {user.status !== 'INACTIVE' && (
        <button disabled={loading} onClick={() => statusMut.mutate('INACTIVE')}
          className="w-full text-left px-3 py-1.5 hover:bg-surface-tertiary text-slate-400">
          Deactivate
        </button>
      )}
      <div className="border-t border-surface-tertiary my-1" />
      {user.role === 'USER' ? (
        <button disabled={loading} onClick={() => roleMut.mutate('ADMIN')}
          className="w-full text-left px-3 py-1.5 hover:bg-surface-tertiary text-primary-400 flex items-center gap-2">
          <Shield className="w-3.5 h-3.5" /> Make Admin
        </button>
      ) : (
        <button disabled={loading} onClick={() => roleMut.mutate('USER')}
          className="w-full text-left px-3 py-1.5 hover:bg-surface-tertiary text-slate-400 flex items-center gap-2">
          <ShieldOff className="w-3.5 h-3.5" /> Remove Admin
        </button>
      )}
    </div>
  )
}

// ─── Users table ─────────────────────────────────────────────────────────────

function UsersTable() {
  const [page, setPage] = useState(1)
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const limit = 15

  const { data, isLoading } = useQuery({
    queryKey: ['admin-users', page],
    queryFn: () => adminApi.getUsers(page, limit).then((r) => r.data),
  })

  const totalPages = data ? Math.ceil(data.total / limit) : 1

  if (isLoading) return <div className="text-slate-400 text-sm py-8 text-center">Loading users…</div>

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-surface-tertiary">
        <table className="w-full text-sm">
          <thead className="bg-surface-secondary">
            <tr className="text-left text-slate-400">
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Joined</th>
              <th className="px-4 py-3 font-medium">Last login</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-tertiary">
            {data?.data.map((u) => (
              <tr key={u.id} className="hover:bg-surface-secondary/50 transition-colors">
                <td className="px-4 py-3 font-medium text-slate-200">{u.name}</td>
                <td className="px-4 py-3 text-slate-400">{u.email}</td>
                <td className="px-4 py-3">
                  <span className={clsx('text-xs font-medium', u.role === 'ADMIN' ? 'text-primary-400' : 'text-slate-400')}>
                    {u.role}
                  </span>
                </td>
                <td className="px-4 py-3"><StatusBadge status={(u as any).status} /></td>
                <td className="px-4 py-3 text-slate-500 text-xs">
                  {u.createdAt ? new Date(u.createdAt).toLocaleDateString('en-IN') : '—'}
                </td>
                <td className="px-4 py-3 text-slate-500 text-xs">
                  {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString('en-IN') : 'Never'}
                </td>
                <td className="px-4 py-3 relative">
                  <button
                    onClick={() => setOpenMenu(openMenu === u.id ? null : u.id)}
                    className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded hover:bg-surface-tertiary"
                  >
                    ···
                  </button>
                  {openMenu === u.id && (
                    <UserActions user={u} onDone={() => setOpenMenu(null)} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-slate-400">
          <span>{data?.total} users total</span>
          <div className="flex items-center gap-2">
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
              className="p-1.5 rounded hover:bg-surface-tertiary disabled:opacity-40">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-slate-300">{page} / {totalPages}</span>
            <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}
              className="p-1.5 rounded hover:bg-surface-tertiary disabled:opacity-40">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Strategies table ─────────────────────────────────────────────────────────

function StrategiesTable() {
  const qc = useQueryClient()
  const [editing, setEditing] = useState<StrategyWithCount | null>(null)
  const [form, setForm] = useState({ description: '', dteMin: '', dteMax: '' })

  const { data: strategies = [], isLoading } = useQuery({
    queryKey: ['admin-strategies'],
    queryFn: () => adminApi.getStrategies().then((r) => r.data),
  })

  const updateMut = useMutation({
    mutationFn: () => adminApi.updateStrategy(editing!.id, {
      description: form.description || undefined,
      dteMin: form.dteMin !== '' ? parseInt(form.dteMin) : null,
      dteMax: form.dteMax !== '' ? parseInt(form.dteMax) : null,
    }),
    onSuccess: () => {
      toast.success('Strategy updated')
      qc.invalidateQueries({ queryKey: ['admin-strategies'] })
      setEditing(null)
    },
    onError: () => toast.error('Update failed'),
  })

  if (isLoading) return <div className="text-slate-400 text-sm py-8 text-center">Loading strategies…</div>

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-surface-tertiary">
        <table className="w-full text-sm">
          <thead className="bg-surface-secondary">
            <tr className="text-left text-slate-400">
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Risk</th>
              <th className="px-4 py-3 font-medium">Favs</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-tertiary">
            {strategies.map((s) => (
              <tr key={s.id} className="hover:bg-surface-secondary/50 transition-colors">
                <td className="px-4 py-3 font-medium text-slate-200">{s.name}</td>
                <td className="px-4 py-3 text-slate-400 text-xs">{s.category}</td>
                <td className="px-4 py-3 text-slate-400 text-xs">{s.type}</td>
                <td className="px-4 py-3 text-slate-400 text-xs">{s.riskLevel}</td>
                <td className="px-4 py-3 text-slate-400 text-xs">{s._count.favourites}</td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => {
                      setEditing(s)
                      setForm({
                        description: s.description,
                        dteMin: s.dteMin != null ? String(s.dteMin) : '',
                        dteMax: s.dteMax != null ? String(s.dteMax) : '',
                      })
                    }}
                    className="text-xs text-primary-400 hover:text-primary-300 px-2 py-1 rounded hover:bg-surface-tertiary"
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          onClick={() => setEditing(null)}
        >
          <div className="card w-full max-w-lg p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-semibold text-white">{editing.name}</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-surface-tertiary border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-primary-500 resize-none"
                  rows={3}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">DTE Min</label>
                  <input
                    type="number"
                    value={form.dteMin}
                    onChange={(e) => setForm((f) => ({ ...f, dteMin: e.target.value }))}
                    className="w-full px-3 py-1.5 rounded-lg bg-surface-tertiary border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-primary-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">DTE Max</label>
                  <input
                    type="number"
                    value={form.dteMax}
                    onChange={(e) => setForm((f) => ({ ...f, dteMax: e.target.value }))}
                    className="w-full px-3 py-1.5 rounded-lg bg-surface-tertiary border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-primary-500"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setEditing(null)}
                className="px-4 py-2 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-surface-tertiary transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => updateMut.mutate()}
                disabled={updateMut.isPending}
                className="px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-xs font-medium transition-colors disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const [tab, setTab] = useState<'users' | 'strategies'>('users')

  const { data: stats } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: () => adminApi.getStats().then((r) => r.data),
  })

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-white">Admin Panel</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total users" value={stats?.totalUsers} icon={Users} color="bg-primary-900/50 text-primary-400" />
        <StatCard label="Active" value={stats?.activeUsers} icon={UserCheck} color="bg-emerald-900/50 text-emerald-400" />
        <StatCard label="Pending" value={stats?.pendingUsers} icon={Clock} color="bg-amber-900/50 text-amber-400" />
        <StatCard label="Locked" value={stats?.lockedUsers} icon={Lock} color="bg-red-900/50 text-red-400" />
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-1 border-b border-surface-tertiary">
          <button
            onClick={() => setTab('users')}
            className={clsx('px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px', tab === 'users' ? 'border-primary-500 text-white' : 'border-transparent text-slate-400 hover:text-white')}
          >
            Users
          </button>
          <button
            onClick={() => setTab('strategies')}
            className={clsx('px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px', tab === 'strategies' ? 'border-primary-500 text-white' : 'border-transparent text-slate-400 hover:text-white')}
          >
            Strategies
          </button>
        </div>

        {tab === 'users' && <UsersTable />}
        {tab === 'strategies' && <StrategiesTable />}
      </div>
    </div>
  )
}
