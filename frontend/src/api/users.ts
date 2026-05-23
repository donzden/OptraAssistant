import { apiClient } from './client'
import type { User } from '@/types'

export interface UpdateProfilePayload {
  name?: string
  riskAppetite?: 'CONSERVATIVE' | 'MODERATE' | 'AGGRESSIVE'
  preferredInstruments?: string[]
  defaultLotSize?: number
}

export const usersApi = {
  getProfile: () => apiClient.get<User>('/users/profile'),

  updateProfile: (data: UpdateProfilePayload) =>
    apiClient.patch<User>('/users/profile', data),

  sendPhoneOtp: (phone: string) =>
    apiClient.post<{ message: string }>('/auth/send-phone-otp', { phone }),

  verifyPhoneOtp: (phone: string, otp: string) =>
    apiClient.post<{ message: string }>('/auth/verify-phone', { phone, otp }),
}
