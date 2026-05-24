import axios from 'axios'
import type { LivePosition, LivePositionLeg, ExitRule, ExitSignal } from '@/types/monitor'

const BASE = '/api/v1/monitor'

function authHeader() {
  const token = sessionStorage.getItem('access_token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function fetchMonitor(status: 'ACTIVE' | 'CLOSED' = 'ACTIVE'): Promise<LivePosition[]> {
  const { data } = await axios.get(BASE, { params: { status }, headers: authHeader() })
  return data
}

export interface CreateLivePositionBody {
  strategyName: string
  instrument: string
  expiry: string
  legs: LivePositionLeg[]
  exitRules?: ExitRule[]
  stopLossPct?: number
  notes?: string
  userStrategyId?: string
}

export async function createLivePosition(body: CreateLivePositionBody): Promise<LivePosition> {
  const { data } = await axios.post(BASE, body, { headers: authHeader() })
  return data
}

export async function closeLivePosition(id: string): Promise<LivePosition> {
  const { data } = await axios.post(`${BASE}/${id}/close`, {}, { headers: authHeader() })
  return data
}

export async function deleteLivePosition(id: string): Promise<void> {
  await axios.delete(`${BASE}/${id}`, { headers: authHeader() })
}

export async function updateLivePosition(
  id: string,
  body: { notes?: string; stopLossPct?: number },
): Promise<LivePosition> {
  const { data } = await axios.put(`${BASE}/${id}`, body, { headers: authHeader() })
  return data
}

export async function updateExitRules(id: string, exitRules: ExitRule[]): Promise<LivePosition> {
  const { data } = await axios.put(`${BASE}/${id}/exit-rules`, { exitRules }, { headers: authHeader() })
  return data
}

export async function fetchSignals(positionId: string): Promise<ExitSignal[]> {
  const { data } = await axios.get(`${BASE}/${positionId}/signals`, { headers: authHeader() })
  return data
}

export async function acknowledgeSignal(signalId: string): Promise<ExitSignal> {
  const { data } = await axios.put(`${BASE}/signals/${signalId}/ack`, {}, { headers: authHeader() })
  return data
}

export async function fetchPostMortem(positionId: string): Promise<string> {
  const { data } = await axios.post(`${BASE}/${positionId}/post-mortem`, {}, { headers: authHeader() })
  return data.explanation
}
