import axios from 'axios'
import { apiClient } from './client'
import type { Strategy, RecommendResponse, UserStrategy, WatchlistItem } from '@/types/strategies'

const BASE = '/api/v1/strategies'

function authHeader() {
  const token = sessionStorage.getItem('access_token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export interface StrategyFilters {
  category?: string
  riskLevel?: string
  type?: string
  outlook?: string
}

export async function fetchStrategies(filters: StrategyFilters = {}): Promise<Strategy[]> {
  const params: Record<string, string> = {}
  if (filters.category) params.category = filters.category
  if (filters.riskLevel) params.riskLevel = filters.riskLevel
  if (filters.type) params.type = filters.type
  if (filters.outlook) params.outlook = filters.outlook
  const { data } = await axios.get(BASE, { params, headers: authHeader() })
  return data
}

export async function fetchStrategy(id: string): Promise<Strategy> {
  const { data } = await axios.get(`${BASE}/${id}`, { headers: authHeader() })
  return data
}

export async function fetchRecommendations(symbol = 'NIFTY'): Promise<RecommendResponse> {
  const { data } = await axios.get(`${BASE}/recommend`, {
    params: { symbol },
    headers: authHeader(),
  })
  return data
}

export async function fetchFavourites(): Promise<Strategy[]> {
  const { data } = await axios.get(`${BASE}/favourites`, { headers: authHeader() })
  return data
}

export async function toggleFavourite(id: string): Promise<{ isFavourite: boolean }> {
  const { data } = await axios.post(`${BASE}/${id}/favourite`, {}, { headers: authHeader() })
  return data
}

export async function explainStrategy(id: string, symbol = 'NIFTY', detailed = false): Promise<string> {
  const { data } = await axios.post(
    `${BASE}/${id}/explain`,
    { symbol, detailed },
    { headers: authHeader() },
  )
  return data.explanation
}

// ── My Strategies ──────────────────────────────────────────────────────────

export async function fetchMyStrategies(): Promise<UserStrategy[]> {
  const { data } = await apiClient.get<UserStrategy[]>('/my-strategies')
  return data
}

export async function fetchMyStrategy(id: string): Promise<UserStrategy> {
  const { data } = await apiClient.get<UserStrategy>(`/my-strategies/${id}`)
  return data
}

export async function createMyStrategy(body: Partial<UserStrategy>): Promise<UserStrategy> {
  const { data } = await apiClient.post<UserStrategy>('/my-strategies', body)
  return data
}

export async function updateMyStrategy(id: string, body: Partial<UserStrategy>): Promise<UserStrategy> {
  const { data } = await apiClient.put<UserStrategy>(`/my-strategies/${id}`, body)
  return data
}

export async function deleteMyStrategy(id: string): Promise<void> {
  await apiClient.delete(`/my-strategies/${id}`)
}

export async function duplicateMyStrategy(id: string): Promise<UserStrategy> {
  const { data } = await apiClient.post<UserStrategy>(`/my-strategies/${id}/duplicate`)
  return data
}

// ── Watchlist ──────────────────────────────────────────────────────────────

export async function fetchWatchlist(symbol = 'NIFTY'): Promise<WatchlistItem[]> {
  const { data } = await apiClient.get<WatchlistItem[]>('/watchlist', { params: { symbol } })
  return data
}

export async function addToWatchlist(strategyId: string): Promise<WatchlistItem> {
  const { data } = await apiClient.post<WatchlistItem>('/watchlist', { strategyId })
  return data
}

export async function updateWatchlistItem(id: string, body: { notes?: string; alertThreshold?: number; alertEnabled?: boolean }): Promise<WatchlistItem> {
  const { data } = await apiClient.put<WatchlistItem>(`/watchlist/${id}`, body)
  return data
}

export async function removeFromWatchlist(id: string): Promise<void> {
  await apiClient.delete(`/watchlist/${id}`)
}

export async function removeFromWatchlistByStrategy(strategyId: string): Promise<void> {
  await apiClient.delete(`/watchlist/by-strategy/${strategyId}`)
}
