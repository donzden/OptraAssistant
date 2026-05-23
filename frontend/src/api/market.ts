import { apiClient } from './client'
import type { MarketSentimentResponse, OptionsChainResponse, VixResponse } from '@/types/market'

export async function fetchOptionsChain(symbol: string, expiry?: string): Promise<OptionsChainResponse> {
  const params: Record<string, string> = { symbol }
  if (expiry) params.expiry = expiry
  const { data } = await apiClient.get<OptionsChainResponse>('/market/options-chain', { params })
  return data
}

export async function fetchExpiries(symbol: string): Promise<string[]> {
  const { data } = await apiClient.get<{ symbol: string; expiries: string[] }>('/market/expiries', {
    params: { symbol },
  })
  return data.expiries
}

export async function fetchVix(): Promise<VixResponse> {
  const { data } = await apiClient.get<VixResponse>('/market/vix')
  return data
}

export async function fetchMarketSentiment(): Promise<MarketSentimentResponse> {
  const { data } = await apiClient.get<MarketSentimentResponse>('/market/sentiment')
  return data
}
