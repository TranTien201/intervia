import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

// Teach tailwind-merge our custom type scale (index.css @theme), otherwise it
// treats `text-page-title` as a text color and drops it next to `text-ink`.
const twMerge = extendTailwindMerge({
  extend: {
    theme: { text: ['page-title', 'question', 'body', 'label', 'code'] },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
