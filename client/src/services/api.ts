import type { StoredFile } from '../types'

const apiBase = (import.meta.env.VITE_API_URL ?? '').trim().replace(/\/+$/, '')
const requestTimeoutMs = 20_000
const uploadTimeoutMs = 120_000

function getApiOrigin() {
  if (import.meta.env.PROD && !apiBase) {
    throw new ApiError('Die Produktions-API ist nicht konfiguriert. Hinterlege VITE_API_URL in den Vercel-Projekteinstellungen.', 0)
  }
  if (!apiBase) return ''

  try {
    const configuredUrl = new URL(apiBase)
    if (!['http:', 'https:'].includes(configuredUrl.protocol) || configuredUrl.pathname !== '/' || configuredUrl.search || configuredUrl.hash) {
      throw new Error('VITE_API_URL muss ein HTTP(S)-Origin ohne Pfad sein.')
    }
    return configuredUrl.origin
  } catch (error) {
    throw new ApiError(error instanceof Error ? error.message : 'VITE_API_URL ist ungültig.', 0)
  }
}

export class ApiError extends Error {
  public readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const base = getApiOrigin()
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), requestTimeoutMs)
  const forwardAbort = () => controller.abort()
  options.signal?.addEventListener('abort', forwardAbort, { once: true })
  let response: Response
  try {
    response = await fetch(`${base}/api${path}`, { ...options, signal: controller.signal })
  } catch (reason) {
    if (options.signal?.aborted) throw reason
    if (controller.signal.aborted) throw new ApiError('Der Server antwortet nicht. Bitte versuche es erneut.', 0)
    throw new ApiError('Der Server ist nicht erreichbar. Bitte Verbindung und API-Konfiguration prüfen.', 0)
  } finally {
    window.clearTimeout(timeout)
    options.signal?.removeEventListener('abort', forwardAbort)
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null
    throw new ApiError(body?.error ?? `Anfrage fehlgeschlagen (${response.status}).`, response.status)
  }
  if (response.status === 204) return undefined as T
  try {
    return await response.json() as T
  } catch {
    throw new ApiError('Der Server hat eine ungültige Antwort gesendet. Bitte versuche es erneut.', response.status)
  }
}

export function getData<T>(path: string) {
  return request<{ data: T }>(path).then((response) => {
    if (!response || typeof response !== 'object' || !('data' in response)) {
      throw new ApiError('Die Serverantwort enthält keine Daten. Bitte lade die Seite erneut.', 502)
    }
    const route = path.split('?')[0]
    if (['/subjects', '/assignments', '/presentations', '/notes', '/files'].includes(route) && !Array.isArray(response.data)) {
      throw new ApiError('Die Serverantwort für diese Liste ist ungültig. Bitte lade die Seite erneut.', 502)
    }
    if (route === '/dashboard') {
      const dashboard = response.data as { assignments?: unknown; presentations?: unknown; notes?: unknown; subjects?: unknown; stats?: unknown }
      if (!dashboard || typeof dashboard !== 'object'
        || !Array.isArray(dashboard.assignments)
        || !Array.isArray(dashboard.presentations)
        || !Array.isArray(dashboard.notes)
        || !Array.isArray(dashboard.subjects)
        || !dashboard.stats || typeof dashboard.stats !== 'object') {
        throw new ApiError('Die Serverantwort für die Übersicht ist ungültig. Bitte lade die Seite erneut.', 502)
      }
    }
    return response.data
  })
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

export function renameFile(id: string, filename: string) {
  return request<{ data: StoredFile }>(`/files/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename }),
  }).then((response) => response.data)
}

export function getFilePreview(id: string) {
  return request<{ url: string; content_type: string }>(`/files/${id}/preview`)
}

export function uploadData(
  file: File,
  subjectId: string,
  options: { signal?: AbortSignal; onProgress?: (progress: number) => void } = {},
) {
  const body = new FormData()
  body.append('file', file)
  body.append('subject_id', subjectId)
  const base = getApiOrigin()
  return new Promise<StoredFile>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    let settled = false
    const cleanup = () => options.signal?.removeEventListener('abort', abort)
    const fail = (reason: Error) => {
      if (settled) return
      settled = true
      cleanup()
      reject(reason)
    }
    const abort = () => {
      xhr.abort()
      fail(new DOMException('Der Upload wurde abgebrochen.', 'AbortError'))
    }

    xhr.open('POST', `${base}/api/files`)
    xhr.timeout = uploadTimeoutMs
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) options.onProgress?.(Math.round(event.loaded / event.total * 100))
    }
    xhr.onload = () => {
      let payload: { data?: StoredFile; error?: string }
      try {
        payload = JSON.parse(xhr.responseText) as { data?: StoredFile; error?: string }
      } catch {
        fail(new ApiError('Der Server hat eine ungültige Antwort gesendet.', xhr.status))
        return
      }
      if (xhr.status < 200 || xhr.status >= 300) {
        fail(new ApiError(payload.error ?? `Upload fehlgeschlagen (${xhr.status}).`, xhr.status))
        return
      }
      if (!payload.data || typeof payload.data.id !== 'string') {
        fail(new ApiError('Der Server hat den Upload nicht bestätigt.', 502))
        return
      }
      settled = true
      cleanup()
      options.onProgress?.(100)
      resolve(payload.data)
    }
    xhr.onerror = () => fail(new ApiError('Die Verbindung wurde während des Uploads unterbrochen.', 0))
    xhr.ontimeout = () => fail(new ApiError('Der Upload hat zu lange gedauert. Bitte versuche es erneut.', 0))
    xhr.onabort = () => fail(new DOMException('Der Upload wurde abgebrochen.', 'AbortError'))
    if (options.signal?.aborted) {
      abort()
      return
    }
    options.signal?.addEventListener('abort', abort, { once: true })
    xhr.send(body)
  })
}

export async function downloadFile(id: string) {
  const response = await request<{ url: string }>(`/files/${id}/download`)
  window.location.assign(response.url)
}
