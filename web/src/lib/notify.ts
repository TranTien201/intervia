import { toast } from 'sonner'

/** Small green "Đã lưu" toast after a successful save (ok colour, see components/ui/sonner.tsx). */
export function notifySaved(message = 'Đã lưu', description?: string) {
  toast.success(message, { description })
}

/** Red toast for a failed action that has no inline place to show the error. */
export function notifyError(message: string) {
  toast.error(message)
}
