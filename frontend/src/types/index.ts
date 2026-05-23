export interface User {
  id: string
  name: string
  email: string
  phone?: string
  avatarUrl?: string
  emailVerified: boolean
  phoneVerified: boolean
  role: 'USER' | 'ADMIN'
  riskAppetite: 'CONSERVATIVE' | 'MODERATE' | 'AGGRESSIVE'
  preferredInstruments: string[]
  defaultLotSize: number
  createdAt: string
  lastLoginAt?: string
}

export interface AuthTokens {
  accessToken: string
}

export interface ApiError {
  message: string
  code?: string
  field?: string
}

export interface ApiResponse<T> {
  data: T
  message?: string
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
}
