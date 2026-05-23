import axios from 'axios'
import type { Strategy, RecommendResponse } from '@/types/strategies'

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
