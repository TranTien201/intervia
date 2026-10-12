// Answers may hold fenced code (```lang … ```): typed in code mode or pasted.

export type AnswerPart = { type: 'text' | 'code'; value: string }

/**
 * Split an answer into text and fenced code blocks (```lang … ```). An unclosed fence runs to
 * the end, so code still shows as code while the candidate forgot to close it.
 */
export function splitCode(text: string): AnswerPart[] {
  const parts: AnswerPart[] = []
  const fence = /```[^\n`]*\n?([\s\S]*?)(?:```|$)/g
  let at = 0
  for (const m of text.matchAll(fence)) {
    if (m.index > at) parts.push({ type: 'text', value: text.slice(at, m.index) })
    parts.push({ type: 'code', value: m[1]!.replace(/\n$/, '') })
    at = m.index + m[0].length
  }
  if (at < text.length) parts.push({ type: 'text', value: text.slice(at) })
  // Blank lines around a block are spacing in the source, the block has its own margin.
  return parts
    .map((p) => (p.type === 'text' ? { ...p, value: p.value.replace(/^\n+|\s+$/g, '') } : p))
    .filter((p) => p.type === 'code' || p.value !== '')
}
