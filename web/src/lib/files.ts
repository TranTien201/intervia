/** CV / JD upload limits; must match the backend (docs/design/api.md: file_too_large, unsupported_file). */
export const UPLOAD_MAX_BYTES = 5 * 1024 * 1024

const UPLOAD_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}

/** Value for `<input accept>`. */
export const UPLOAD_ACCEPT = [
  ...Object.keys(UPLOAD_TYPES).map((ext) => `.${ext}`),
  ...Object.values(UPLOAD_TYPES),
].join(',')

/**
 * Returns an error message, or null when the file is OK.
 * Checks the extension, not only the MIME type, because browsers often leave `type` empty for DOCX.
 */
export function validateUploadFile(file: File): string | null {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (!(ext in UPLOAD_TYPES)) return 'Chỉ nhận file PDF hoặc DOCX.'
  if (file.size > UPLOAD_MAX_BYTES) {
    return `File nặng ${formatFileSize(file.size)}, vượt giới hạn 5 MB. Thử xuất lại file nhẹ hơn.`
  }
  if (file.size === 0) return 'File trống. Hãy chọn file khác.'
  return null
}

const sizeFmt = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 })

/** "820 KB", "1,2 MB" */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${sizeFmt.format(bytes / (1024 * 1024))} MB`
}
