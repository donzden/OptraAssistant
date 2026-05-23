import { apiClient } from './client'
import type { AddPositionPayload, PortfolioGreeksResponse, Position } from '@/types/portfolio'

export async function fetchPositions(): Promise<Position[]> {
  const { data } = await apiClient.get<Position[]>('/portfolio/positions')
  return data
}

export async function addPosition(payload: AddPositionPayload): Promise<Position> {
  const { data } = await apiClient.post<Position>('/portfolio/positions', payload)
  return data
}

export async function updatePosition(id: string, payload: Partial<AddPositionPayload>): Promise<Position> {
  const { data } = await apiClient.put<Position>(`/portfolio/positions/${id}`, payload)
  return data
}

export async function deletePosition(id: string): Promise<void> {
  await apiClient.delete(`/portfolio/positions/${id}`)
}

export async function importFromZerodha(): Promise<{ imported: number; total: number }> {
  const { data } = await apiClient.post<{ imported: number; total: number }>('/portfolio/import-from-zerodha')
  return data
}

export async function fetchPortfolioGreeks(
  spotPrices?: Record<string, number>,
): Promise<PortfolioGreeksResponse> {
  const { data } = await apiClient.post<PortfolioGreeksResponse>('/portfolio/greeks', {
    spot_prices: spotPrices ?? {},
  })
  return data
}

export async function fetchZerodhaStatus(): Promise<{ connected: boolean }> {
  const { data } = await apiClient.get<{ connected: boolean }>('/kite/status')
  return data
}

export async function disconnectZerodha(): Promise<void> {
  await apiClient.delete('/kite/disconnect')
}
