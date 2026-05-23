import axios from 'axios'
import toast from 'react-hot-toast'
import { useAuthStore } from '@/store/authStore'

export const apiClient = axios.create({
  baseURL: '/api/v1',
  withCredentials: true, // send httpOnly refresh token cookie
  headers: { 'Content-Type': 'application/json' },
})

// Attach access token from memory on every request
apiClient.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('access_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Auto-refresh on 401, logout on second failure
let refreshing = false
apiClient.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config
    if (error.response?.status === 401 && !original._retry && !refreshing) {
      original._retry = true
      refreshing = true
      try {
        const { data } = await axios.post('/api/v1/auth/refresh', {}, { withCredentials: true })
        sessionStorage.setItem('access_token', data.accessToken)
        original.headers.Authorization = `Bearer ${data.accessToken}`
        refreshing = false
        return apiClient(original)
      } catch {
        refreshing = false
        sessionStorage.removeItem('access_token')
        useAuthStore.getState().logout()
        window.location.href = '/login'
      }
    }
    const message = error.response?.data?.message ?? 'Something went wrong'
    if (error.response?.status !== 401) toast.error(message)
    return Promise.reject(error)
  },
)
