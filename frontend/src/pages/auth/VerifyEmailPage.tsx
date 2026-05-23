import { useState, useRef, useEffect } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { CheckCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { authApi } from '@/api/auth'
import AuthLayout from './AuthLayout'

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams()
  const email = searchParams.get('email') ?? ''
  const [otp, setOtp] = useState(['', '', '', '', '', ''])
  const [loading, setLoading] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])
  const navigate = useNavigate()

  useEffect(() => {
    if (resendCooldown > 0) {
      const t = setTimeout(() => setResendCooldown((c) => c - 1), 1000)
      return () => clearTimeout(t)
    }
  }, [resendCooldown])

  const handleChange = (i: number, val: string) => {
    const v = val.replace(/\D/, '').slice(-1)
    const next = [...otp]
    next[i] = v
    setOtp(next)
    if (v && i < 5) inputRefs.current[i + 1]?.focus()
    if (!v && i > 0) inputRefs.current[i - 1]?.focus()
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (text.length === 6) {
      setOtp(text.split(''))
      inputRefs.current[5]?.focus()
    }
  }

  const handleKeyDown = (i: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[i] && i > 0) inputRefs.current[i - 1]?.focus()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const code = otp.join('')
    if (code.length < 6) return
    setLoading(true)
    try {
      await authApi.verifyEmailOtp({ email, otp: code })
      toast.success('Email verified! You can now log in.')
      navigate('/login')
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Invalid OTP')
      setOtp(['', '', '', '', '', ''])
      inputRefs.current[0]?.focus()
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    try {
      await authApi.resendEmailOtp(email)
      toast.success('New OTP sent to your email')
      setResendCooldown(60)
    } catch {
      toast.error('Failed to resend OTP')
    }
  }

  return (
    <AuthLayout title="Verify your email" subtitle={`Enter the 6-digit code sent to ${email || 'your email'}`}>
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="flex gap-2 justify-center" onPaste={handlePaste}>
          {otp.map((digit, i) => (
            <input
              key={i}
              ref={(el) => { inputRefs.current[i] = el }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handleChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              className="w-11 h-12 text-center text-lg font-semibold rounded-lg bg-surface-secondary border border-surface-tertiary text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
            />
          ))}
        </div>

        <button
          type="submit"
          disabled={loading || otp.join('').length < 6}
          className="btn-primary w-full"
        >
          <CheckCircle className="w-4 h-4" />
          {loading ? 'Verifying…' : 'Verify email'}
        </button>

        <div className="text-center text-sm text-slate-400">
          Didn't receive it?{' '}
          {resendCooldown > 0 ? (
            <span className="text-slate-500">Resend in {resendCooldown}s</span>
          ) : (
            <button type="button" onClick={handleResend} className="text-primary-400 hover:text-primary-300 font-medium">
              Resend OTP
            </button>
          )}
        </div>
      </form>

      <p className="mt-4 text-center text-sm text-slate-400">
        <Link to="/login" className="text-primary-400 hover:text-primary-300">Back to login</Link>
      </p>
    </AuthLayout>
  )
}
