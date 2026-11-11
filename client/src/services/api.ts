import type { StoredFile } from '../types'

const apiBase = (import.meta.env.VITE_API_URL ?? '').trim().replace(/\/+$/, '')

export class ApiError extends Error {
  public readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  if (import.meta.env.PROD && !apiBase) {
    throw new ApiError('Die Produktions-API ist nicht konfiguriert. Hinterlege VITE_API_URL in den Vercel-Projekteinstellungen.', 0)
  }

  let base = ''
  if (apiBase) {
    try {
      const configuredUrl = new URL(apiBase)
      if (!['http:', 'https:'].includes(configuredUrl.protocol) || configuredUrl.pathname !== '/' || configuredUrl.search || configuredUrl.hash) {
        throw new Error('VITE_API_URL muss ein HTTP(S)-Origin ohne Pfad sein.')
      }
      base = configuredUrl.origin
    } catch (error) {
      throw new ApiError(error instanceof Error ? error.message : 'VITE_API_URL ist ungültig.', 0)
    }
  }

  let response: Response
  try {
    response = await fetch(`${base}/api${path}`, options)
  } catch {
    throw new ApiError('Der Server ist nicht erreichbar. Bitte Verbindung und API-Konfiguration prüfen.', 0)
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null
    throw new ApiError(body?.error ?? `Anfrage fehlgeschlagen (${response.status}).`, response.status)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export function getData<T>(path: string) {
  return request<{ data: T }>(path).then((response) => response.data)
}

export function saveData<T>(path: string, data: unknown, id?: string) {
  return request<{ data: T }>(id ? `${path}/${id}` : path, {
    method: id ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }).then((response) => response.data)
}

export function deleteData(path: string, id: string) {
  return request<void>(`${path}/${id}`, { method: 'DELETE' })
}

export function uploadData(file: File, subjectId: string) {
  const body = new FormData()
  body.append('file', file)
  body.append('subject_id', subjectId)
  return request<{ data: StoredFile }>('/files', { method: 'POST', body })
}

export async function downloadFile(id: string) {
  const response = await request<{ url: string }>(`/files/${id}/download`)
  window.location.assign(response.url)
}
