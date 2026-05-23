import { apiClient } from './client'
import type { User } from '@/types'

export interface AdminUser extends User {
  status: 'ACTIVE' | 'PENDING' | 'LOCKED' | 'INACTIVE'
}

export interface AdminStats {
  totalUsers: number
  activeUsers: number
  pendingUsers: number
  lockedUsers: number
}

export interface PaginatedUsers {
  data: AdminUser[]
  total: number
  page: number
  limit: number
}

export const adminApi = {
  getStats: () => apiClient.get<AdminStats>('/admin/stats'),

  getUsers: (page = 1, limit = 20) =>
    apiClient.get<PaginatedUsers>(`/admin/users?page=${page}&limit=${limit}`),

  setStatus: (userId: string, status: 'ACTIVE' | 'INACTIVE' | 'LOCKED') =>
    apiClient.patch<Pick<AdminUser, 'id' | 'name' | 'email' | 'status'>>(`/admin/users/${userId}/status`, { status }),

  setRole: (userId: string, role: 'USER' | 'ADMIN') =>
    apiClient.patch<Pick<AdminUser, 'id' | 'name' | 'email' | 'role'>>(`/admin/users/${userId}/role`, { role }),
}
