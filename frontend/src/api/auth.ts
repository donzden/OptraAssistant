import { apiClient } from './client'
import type { User } from '@/types'

export interface RegisterPayload {
  name: string
  email: string
  password: string
}

export interface LoginPayload {
  email: string
  password: string
  rememberMe?: boolean
}

export interface OtpPayload {
  email?: string
  phone?: string
  otp: string
}

export const authApi = {
  register: (data: RegisterPayload) =>
    apiClient.post<{ message: string }>('/auth/register', data),

  verifyEmailOtp: (data: OtpPayload) =>
    apiClient.post<{ message: string }>('/auth/verify-email', data),

  resendEmailOtp: (email: string) =>
    apiClient.post<{ message: string }>('/auth/resend-email-otp', { email }),

  login: (data: LoginPayload) =>
    apiClient.post<{ accessToken: string; user: User }>('/auth/login', data),

  logout: () => apiClient.post('/auth/logout'),

  refresh: () =>
    apiClient.post<{ accessToken: string }>('/auth/refresh'),

  forgotPassword: (email: string) =>
    apiClient.post<{ message: string }>('/auth/forgot-password', { email }),

  resetPassword: (token: string, password: string) =>
    apiClient.post<{ message: string }>('/auth/reset-password', { token, password }),

  changePassword: (currentPassword: string, newPassword: string) =>
    apiClient.post<{ message: string }>('/auth/change-password', { currentPassword, newPassword }),

  me: () => apiClient.get<User>('/auth/me'),

  sendPhoneOtp: (phone: string) =>
    apiClient.post<{ message: string }>('/auth/send-phone-otp', { phone }),

  verifyPhoneOtp: (data: OtpPayload) =>
    apiClient.post<{ message: string }>('/auth/verify-phone', data),
}
