import { apiFetch } from './client'

export type Settings = Record<string, string>

export function getSettings() {
  return apiFetch<Settings>('/api/settings')
}

export function updateSettings(updates: Settings) {
  return apiFetch<Settings>('/api/settings', { method: 'PATCH', body: { updates } })
}
