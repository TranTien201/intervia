import type { ApiErrorBody } from './types'

/** Business error returned by the backend as `{error: {code, message}}`. */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly fields: Record<string, string> | undefined

  constructor(status: number, body: ApiErrorBody) {
    super(body.message)
    this.name = 'ApiError'
    this.status = status
    this.code = body.code
    this.fields = body.fields
  }
}

/** The backend could not be reached at all (server down, offline). */
export class NetworkError extends Error {
  constructor(cause?: unknown) {
    super('Không kết nối được máy chủ Intervia.', { cause })
    this.name = 'NetworkError'
  }
}

export const API_BASE = '/api'

// Login is on and the user is not (or no longer) logged in. Set by `AuthRoot`, which sends them
// to /login. Lives here so every request sees it, SSE streams included.
let onUnauthenticated: (() => void) | null = null
export function setUnauthenticatedHandler(handler: (() => void) | null) {
  onUnauthenticated = handler
}

type Json = Record<string, unknown> | unknown[]

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: Json | FormData
}

export async function rawRequest(path: string, options: RequestOptions = {}): Promise<Response> {
  const { body, headers, ...rest } = options
  const init: RequestInit = { ...rest, headers: new Headers(headers) }
  if (body instanceof FormData) {
    init.body = body
  } else if (body !== undefined) {
    init.body = JSON.stringify(body)
    ;(init.headers as Headers).set('Content-Type', 'application/json')
  }

  let res: Response
  try {
    res = await fetch(new URL(API_BASE + path, globalThis.location.origin), init)
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    throw new NetworkError(err)
  }
  if (!res.ok) {
    const err = await toApiError(res)
    if (err instanceof ApiError && err.code === 'unauthenticated') onUnauthenticated?.()
    throw err
  }
  return res
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const res = await rawRequest(path, options)
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

async function toApiError(res: Response): Promise<ApiError | NetworkError> {
  // The Vite proxy answers 502/504 with an empty or HTML body when the backend is down.
  if ((res.status === 502 || res.status === 504) && !isJson(res)) return new NetworkError()
  try {
    const data = (await res.json()) as { error?: ApiErrorBody }
    if (data.error) return new ApiError(res.status, data.error)
  } catch {
    // fall through
  }
  return new ApiError(res.status, { code: 'internal_error', message: res.statusText })
}

function isJson(res: Response) {
  return res.headers.get('Content-Type')?.includes('application/json') ?? false
}

export function isNotFound(err: unknown) {
  return err instanceof ApiError && err.status === 404
}
