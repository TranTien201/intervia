import { ApiError } from '@/api/client'
import type { NewJd } from '@/api/hooks'
import { LIMITS, type ExtractionMode } from '@/api/types'
import { errorMessage } from '@/lib/errors'
import { DEFAULT_EXTRACTION_MODE } from './extraction-modes'

// Form state + checks for adding a CV / JD (see fields.tsx).

export type FieldErrors = Partial<Record<'file' | 'name' | 'text', string>>

/** "nguyen-van-a.pdf" → "nguyen-van-a" */
export const suggestFileName = (file: File) =>
  file.name.replace(/\.[^.]+$/, '').slice(0, LIMITS.nameMaxChars)

/** First non-empty line of the JD, e.g. "Senior Backend Engineer – ACME". */
export const suggestJdName = (text: string) =>
  (text.split('\n').find((l) => l.trim()) ?? '').trim().slice(0, LIMITS.nameMaxChars)

const FILE_ERROR_CODES = new Set(['file_too_large', 'unsupported_file', 'no_text_in_file'])

/**
 * Field errors from a 422, or the file errors the server checks again (413/415), or a JD file
 * with no text in it (422 `no_text_in_file`, returned on upload).
 */
export function serverFieldErrors(err: unknown): FieldErrors | null {
  if (!(err instanceof ApiError)) return null
  if (FILE_ERROR_CODES.has(err.code)) return { file: errorMessage(err) }
  return err.fields ?? null
}

export function validateName(name: string): string | undefined {
  if (!name.trim()) return 'Đặt tên để dễ tìm lại.'
  if (name.length > LIMITS.nameMaxChars) return `Tên dài tối đa ${LIMITS.nameMaxChars} ký tự.`
}

export function validateJdText(text: string): string | undefined {
  if (!text.trim()) return 'Dán nội dung JD.'
  if (text.length > LIMITS.jdMaxChars)
    return `JD dài ${text.length.toLocaleString('vi-VN')} ký tự, tối đa ${LIMITS.jdMaxChars.toLocaleString('vi-VN')}.`
}

export interface CvDraft {
  file: File | null
  name: string
  /** The user typed a name: stop replacing it with the file name. */
  nameTouched: boolean
  mode: ExtractionMode
}

export const emptyCvDraft: CvDraft = {
  file: null,
  name: '',
  nameTouched: false,
  mode: DEFAULT_EXTRACTION_MODE,
}

/** A JD is pasted as text or uploaded as a PDF/DOCX file (the server extracts the text). */
export type JdInput = 'paste' | 'file'

export interface JdDraft {
  input: JdInput
  /** Both kept, so switching between paste and file loses nothing. */
  text: string
  file: File | null
  name: string
  nameTouched: boolean
  /** `standard` or `precise` only: a JD is always text. */
  mode: ExtractionMode
}

export const emptyJdDraft: JdDraft = {
  input: 'paste',
  text: '',
  file: null,
  name: '',
  nameTouched: false,
  mode: DEFAULT_EXTRACTION_MODE,
}

export function validateJdDraft(d: JdDraft): FieldErrors {
  return d.input === 'file'
    ? { file: d.file ? undefined : 'Chọn một file JD.', name: validateName(d.name) }
    : { text: validateJdText(d.text), name: validateName(d.name) }
}

/** Body for `POST /jds` (`useCreateJd`). Call after `validateJdDraft` passed. */
export const jdInputOf = (d: JdDraft): NewJd =>
  d.input === 'file'
    ? { file: d.file!, name: d.name.trim(), mode: d.mode }
    : { text: d.text, name: d.name.trim(), mode: d.mode }

/** Body for `POST /cvs` (`useUploadCv`). Call after the file and name were checked. */
export const cvInputOf = (d: CvDraft) => ({ file: d.file!, name: d.name.trim(), mode: d.mode })

/** What was sent for this draft: tells a retry whether the JD is already saved. */
export const jdSourceOf = (d: JdDraft): File | string => (d.input === 'file' ? d.file! : d.text)
