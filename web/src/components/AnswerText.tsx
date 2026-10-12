import { Fragment } from 'react'
import { splitCode } from '@/lib/code-blocks'

/** A candidate answer: paragraphs, fenced code blocks and `inline` code (pages 5 and 6). */
export function AnswerText({ text }: { text: string }) {
  return splitCode(text).map((part, i) =>
    part.type === 'code' ? (
      <pre
        key={i}
        className="my-2 overflow-x-auto rounded-md bg-subtle px-3 py-2 font-mono text-code first:mt-0 last:mb-0"
      >
        <code>{part.value}</code>
      </pre>
    ) : (
      <p key={i} className="whitespace-pre-wrap break-words">
        <InlineCode text={part.value} />
      </p>
    ),
  )
}

/** `like this` → mono. */
function InlineCode({ text }: { text: string }) {
  return text.split(/(`[^`\n]+`)/).map((chunk, i) =>
    /^`[^`\n]+`$/.test(chunk) ? (
      <code key={i} className="rounded bg-subtle px-1 font-mono text-code">
        {chunk.slice(1, -1)}
      </code>
    ) : (
      <Fragment key={i}>{chunk}</Fragment>
    ),
  )
}
