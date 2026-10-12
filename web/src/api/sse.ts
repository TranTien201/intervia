import { rawRequest } from './client'
import type { StreamEvent } from './types'

/**
 * POST a JSON body and read the `text/event-stream` response.
 * EventSource only supports GET, so we parse the stream from fetch ourselves.
 */
export async function postStream(
  path: string,
  body: Record<string, unknown>,
  onEvent: (e: StreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await rawRequest(path, {
    method: 'POST',
    body,
    headers: { Accept: 'text/event-stream' },
    signal,
  })
  if (!res.body) return
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += value
    let match: RegExpExecArray | null
    while ((match = /\r?\n\r?\n/.exec(buffer))) {
      const raw = buffer.slice(0, match.index)
      buffer = buffer.slice(match.index + match[0].length)
      const parsed = parseEvent(raw)
      if (parsed) onEvent(parsed)
    }
  }
}

export function parseEvent(raw: string): StreamEvent | null {
  let event = 'message'
  const data: string[] = []
  for (const line of raw.split(/\r?\n/)) {
    if (line.startsWith(':')) continue
    const idx = line.indexOf(':')
    const field = idx === -1 ? line : line.slice(0, idx)
    const value = idx === -1 ? '' : line.slice(idx + 1).replace(/^ /, '')
    if (field === 'event') event = value
    else if (field === 'data') data.push(value)
  }
  if (data.length === 0) return null
  try {
    return { event, data: JSON.parse(data.join('\n')) } as StreamEvent
  } catch {
    return null
  }
}
