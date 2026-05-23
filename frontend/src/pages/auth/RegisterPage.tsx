import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, EyeOff, UserPlus } from 'lucide-react'
import toast from 'react-hot-toast'
import { authApi } from '@/api/auth'
import AuthLayout from './AuthLayout'

const schema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Enter a valid email'),
  password: z
    .string()
    .min(8, 'Minimum 8 characters')
    .regex(/[A-Z]/, 'Must contain an uppercase letter')
    .regex(/[0-9]/, 'Must contain a number')
    .regex(/[^A-Za-z0-9]/, 'Must contain a special character'),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
})
type FormValues = z.infer<typeof schema>

function strengthLabel(password: string) {
  let score = 0
  if (password.length >= 8) score++
  if (/[A-Z]/.test(password)) score++
  if (/[0-9]/.test(password)) score++
  if (/[^A-Za-z0-9]/.test(password)) score++
  if (password.length >= 12) score++
  if (score <= 1) return { label: 'Weak', color: 'bg-red-500', width: 'w-1/5' }
  if (score <= 2) return { label: 'Fair', color: 'bg-amber-500', width: 'w-2/5' }
  if (score <= 3) return { label: 'Good', color: 'bg-yellow-400', width: 'w-3/5' }
  if (score <= 4) return { label: 'Strong', color: 'bg-emerald-500', width: 'w-4/5' }
  return { label: 'Very Strong', color: 'bg-emerald-400', width: 'w-full' }
}

export default function RegisterPage() {
  const [showPassword, setShowPassword] = useState(false)
  const navigate = useNavigate()

  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  })

  const passwordValue = watch('password', '')
  const strength = strengthLabel(passwordValue)

  const onSubmit = async (values: FormValues) => {
    try {
      await authApi.register({ name: values.name, email: values.email, password: values.password })
      toast.success('Account created! Check your email for the OTP.')
      navigate(`/verify-email?email=${encodeURIComponent(values.email)}`)
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Registration failed')
    }
  }

  return (
    <AuthLayout title="Create account" subtitle="Start with OptraAssistant">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3.5">
        <div>
          <label className="label">Full name</label>
          <input {...register('name')} className="input" placeholder="Nilotpal Das" autoComplete="name" />
          {errors.name && <p className="mt-1 text-xs text-red-400">{errors.name.message}</p>}
        </div>

        <div>
          <label className="label">Email address</label>
          <input {...register('email')} type="email" className="input" placeholder="you@example.com" autoComplete="email" />
          {errors.email && <p className="mt-1 text-xs text-red-400">{errors.email.message}</p>}
        </div>

        <div>
          <label className="label">Password</label>
          <div className="relative">
            <input
              {...register('password')}
              type={showPassword ? 'text' : 'password'}
              className="input pr-10"
              placeholder="••••••••"
              autoComplete="new-password"
            />
            <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
              onClick={() => setShowPassword(!showPassword)}>
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {passwordValue && (
            <div className="mt-1.5 flex items-center gap-2">
              <div className="flex-1 h-1 bg-surface-tertiary rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${strength.color} ${strength.width}`} />
              </div>
              <span className="text-xs text-slate-400">{strength.label}</span>
            </div>
          )}
          {errors.password && <p className="mt-1 text-xs text-red-400">{errors.password.message}</p>}
        </div>

        <div>
          <label className="label">Confirm password</label>
          <input
            {...register('confirmPassword')}
            type="password"
            className="input"
            placeholder="••••••••"
            autoComplete="new-password"
          />
          {errors.confirmPassword && <p className="mt-1 text-xs text-red-400">{errors.confirmPassword.message}</p>}
        </div>

        <button type="submit" disabled={isSubmitting} className="btn-primary w-full mt-1">
          <UserPlus className="w-4 h-4" />
          {isSubmitting ? 'Creating account…' : 'Create account'}
        </button>
      </form>

      <p className="mt-5 text-center text-sm text-slate-400">
        Already have an account?{' '}
        <Link to="/login" className="text-primary-400 hover:text-primary-300 font-medium">Sign in</Link>
      </p>
    </AuthLayout>
  )
}
