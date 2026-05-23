import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Mail, ArrowLeft } from 'lucide-react'
import { authApi } from '@/api/auth'
import AuthLayout from './AuthLayout'

const schema = z.object({ email: z.string().email('Enter a valid email') })
type FormValues = z.infer<typeof schema>

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false)

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (values: FormValues) => {
    try {
      await authApi.forgotPassword(values.email)
    } catch { /* always show success to prevent enumeration */ }
    setSent(true)
  }

  if (sent) {
    return (
      <AuthLayout title="Check your inbox" subtitle="If this email is registered, you'll receive a reset link shortly.">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-primary-600/20 flex items-center justify-center mx-auto">
            <Mail className="w-6 h-6 text-primary-400" />
          </div>
          <p className="text-sm text-slate-400">The link is valid for 1 hour. Check your spam folder if you don't see it.</p>
          <Link to="/login" className="btn-ghost w-full justify-center">
            <ArrowLeft className="w-4 h-4" /> Back to login
          </Link>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Forgot password" subtitle="We'll send a reset link to your email">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="label">Email address</label>
          <input {...register('email')} type="email" className="input" placeholder="you@example.com" autoComplete="email" />
          {errors.email && <p className="mt-1 text-xs text-red-400">{errors.email.message}</p>}
        </div>

        <button type="submit" disabled={isSubmitting} className="btn-primary w-full">
          <Mail className="w-4 h-4" />
          {isSubmitting ? 'Sending…' : 'Send reset link'}
        </button>
      </form>

      <p className="mt-5 text-center text-sm text-slate-400">
        <Link to="/login" className="text-primary-400 hover:text-primary-300 inline-flex items-center gap-1">
          <ArrowLeft className="w-3 h-3" /> Back to login
        </Link>
      </p>
    </AuthLayout>
  )
}
