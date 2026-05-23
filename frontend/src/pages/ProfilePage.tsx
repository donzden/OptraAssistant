import { useState, useRef, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { CheckCircle, XCircle, Pencil, X, Smartphone, KeyRound } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { usersApi } from '@/api/users'
import { authApi } from '@/api/auth'

// ─── Edit profile ────────────────────────────────────────────────────────────

const profileSchema = z.object({
  name: z.string().min(2).max(100),
  riskAppetite: z.enum(['CONSERVATIVE', 'MODERATE', 'AGGRESSIVE']),
})
type ProfileForm = z.infer<typeof profileSchema>

function EditProfileModal({ onClose }: { onClose: () => void }) {
  const user = useAuthStore((s) => s.user)
  const setUser = useAuthStore((s) => s.setUser)
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: user?.name ?? '', riskAppetite: user?.riskAppetite ?? 'MODERATE' },
  })

  const onSubmit = async (data: ProfileForm) => {
    try {
      const res = await usersApi.updateProfile(data)
      setUser(res.data)
      toast.success('Profile updated')
      onClose()
    } catch {
      toast.error('Failed to update profile')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="card w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-white">Edit Profile</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="label">Name</label>
            <input {...register('name')} className="input" />
            {errors.name && <p className="text-xs text-red-400 mt-1">{errors.name.message}</p>}
          </div>
          <div>
            <label className="label">Risk Appetite</label>
            <select {...register('riskAppetite')} className="input">
              <option value="CONSERVATIVE">Conservative</option>
              <option value="MODERATE">Moderate</option>
              <option value="AGGRESSIVE">Aggressive</option>
            </select>
          </div>
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="btn btn-ghost flex-1">Cancel</button>
            <button type="submit" disabled={isSubmitting} className="btn btn-primary flex-1">
              {isSubmitting ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Change password ─────────────────────────────────────────────────────────

const pwSchema = z.object({
  currentPassword: z.string().min(1, 'Required'),
  newPassword: z.string().min(8).regex(/[A-Z]/, 'Needs uppercase').regex(/[0-9]/, 'Needs number').regex(/[^A-Za-z0-9]/, 'Needs special char'),
  confirm: z.string(),
}).refine((d) => d.newPassword === d.confirm, { message: 'Passwords do not match', path: ['confirm'] })
type PwForm = z.infer<typeof pwSchema>

function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<PwForm>({ resolver: zodResolver(pwSchema) })
  const logout = useAuthStore((s) => s.logout)

  const onSubmit = async (data: PwForm) => {
    try {
      await authApi.changePassword(data.currentPassword, data.newPassword)
      toast.success('Password changed. Please log in again.')
      sessionStorage.removeItem('access_token')
      logout()
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Failed to change password')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="card w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-white">Change Password</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="label">Current password</label>
            <input type="password" {...register('currentPassword')} className="input" />
            {errors.currentPassword && <p className="text-xs text-red-400 mt-1">{errors.currentPassword.message}</p>}
          </div>
          <div>
            <label className="label">New password</label>
            <input type="password" {...register('newPassword')} className="input" />
            {errors.newPassword && <p className="text-xs text-red-400 mt-1">{errors.newPassword.message}</p>}
          </div>
          <div>
            <label className="label">Confirm new password</label>
            <input type="password" {...register('confirm')} className="input" />
            {errors.confirm && <p className="text-xs text-red-400 mt-1">{errors.confirm.message}</p>}
          </div>
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="btn btn-ghost flex-1">Cancel</button>
            <button type="submit" disabled={isSubmitting} className="btn btn-primary flex-1">
              {isSubmitting ? 'Saving…' : 'Change'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Phone verify ─────────────────────────────────────────────────────────────

function PhoneVerifySection() {
  const user = useAuthStore((s) => s.user)
  const setUser = useAuthStore((s) => s.setUser)
  const [step, setStep] = useState<'input' | 'otp'>('input')
  const [phone, setPhone] = useState(user?.phone ?? '')
  const [otp, setOtp] = useState(['', '', '', '', '', ''])
  const [sending, setSending] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  const sendOtp = async () => {
    const cleaned = phone.trim()
    if (!/^[6-9]\d{9}$/.test(cleaned)) { toast.error('Enter a valid 10-digit Indian mobile number'); return }
    setSending(true)
    try {
      await usersApi.sendPhoneOtp(cleaned)
      setStep('otp')
      setCooldown(60)
      toast.success('OTP sent to your phone')
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Failed to send OTP')
    } finally {
      setSending(false)
    }
  }

  const handleOtpKey = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otp[i] && i > 0) inputRefs.current[i - 1]?.focus()
  }

  const handleOtpChange = (i: number, val: string) => {
    const digit = val.replace(/\D/, '').slice(-1)
    const next = [...otp]
    next[i] = digit
    setOtp(next)
    if (digit && i < 5) inputRefs.current[i + 1]?.focus()
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    const digits = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6).split('')
    if (digits.length < 6) return
    e.preventDefault()
    setOtp(digits)
    inputRefs.current[5]?.focus()
  }

  const verify = async () => {
    const code = otp.join('')
    if (code.length < 6) { toast.error('Enter all 6 digits'); return }
    setVerifying(true)
    try {
      await usersApi.verifyPhoneOtp(phone.trim(), code)
      const res = await usersApi.getProfile()
      setUser(res.data)
      toast.success('Phone verified!')
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Invalid OTP')
    } finally {
      setVerifying(false)
    }
  }

  if (user?.phoneVerified) {
    return (
      <div className="flex items-center gap-2 text-sm text-emerald-400">
        <CheckCircle className="w-4 h-4" />
        <span>{user.phone} — verified</span>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {step === 'input' ? (
        <div className="flex gap-2">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">+91</span>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="10-digit mobile number"
              maxLength={10}
              className="input pl-12"
            />
          </div>
          <button onClick={sendOtp} disabled={sending} className="btn btn-primary shrink-0">
            {sending ? 'Sending…' : 'Send OTP'}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-slate-400">Enter the 6-digit OTP sent to +91 {phone}</p>
          <div className="flex gap-2" onPaste={handlePaste}>
            {otp.map((d, i) => (
              <input
                key={i}
                ref={(el) => { inputRefs.current[i] = el }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={d}
                onChange={(e) => handleOtpChange(i, e.target.value)}
                onKeyDown={(e) => handleOtpKey(i, e)}
                className="input w-10 text-center px-0 text-lg font-semibold"
              />
            ))}
          </div>
          <div className="flex items-center gap-3">
            <button onClick={verify} disabled={verifying} className="btn btn-primary">
              {verifying ? 'Verifying…' : 'Verify'}
            </button>
            <button
              onClick={() => { sendOtp(); setOtp(['', '', '', '', '', '']) }}
              disabled={cooldown > 0}
              className="text-sm text-primary-400 hover:text-primary-300 disabled:text-slate-500"
            >
              {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend OTP'}
            </button>
            <button onClick={() => setStep('input')} className="text-sm text-slate-400 hover:text-slate-200 ml-auto">
              Change number
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const user = useAuthStore((s) => s.user)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showPwModal, setShowPwModal] = useState(false)

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold text-white">Profile</h1>

      {/* Identity card */}
      <div className="card p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-primary-700 flex items-center justify-center text-xl font-semibold text-white">
              {user?.name?.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="font-medium text-white">{user?.name}</p>
              <p className="text-sm text-slate-400">{user?.email}</p>
            </div>
          </div>
          <button onClick={() => setShowEditModal(true)} className="btn btn-ghost text-xs gap-1.5">
            <Pencil className="w-3.5 h-3.5" /> Edit
          </button>
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-4 border-t border-surface-tertiary pt-4">
          <div>
            <p className="label">Email</p>
            <div className="flex items-center gap-1.5 mt-1">
              {user?.emailVerified
                ? <><CheckCircle className="w-3.5 h-3.5 text-emerald-400" /><span className="text-sm text-emerald-400">Verified</span></>
                : <><XCircle className="w-3.5 h-3.5 text-red-400" /><span className="text-sm text-red-400">Not verified</span></>
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
          <div>
            <p className="label">Member since</p>
            <span className="text-sm text-slate-200">
              {user?.createdAt ? new Date(user.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
            </span>
          </div>
        </div>
      </div>

      {/* Phone verification */}
      <div className="card p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Smartphone className="w-4 h-4 text-slate-400" />
          <h2 className="font-medium text-white">Phone Verification</h2>
        </div>
        <PhoneVerifySection />
      </div>

      {/* Security */}
      <div className="card p-6 space-y-4">
        <div className="flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-slate-400" />
          <h2 className="font-medium text-white">Security</h2>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-200">Password</p>
            <p className="text-xs text-slate-500">Last changed: unknown</p>
          </div>
          <button onClick={() => setShowPwModal(true)} className="btn btn-ghost text-xs">Change password</button>
        </div>
      </div>

      {showEditModal && <EditProfileModal onClose={() => setShowEditModal(false)} />}
      {showPwModal && <ChangePasswordModal onClose={() => setShowPwModal(false)} />}
    </div>
  )
}
