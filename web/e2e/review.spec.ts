import { expect, test } from '@playwright/test'
import { main } from './helpers'

test('review a finished session and edit an STT transcript', async ({ page }) => {
  await page.goto('/sessions/s-done/review')
  const m = main(page)
  await expect(m.getByRole('heading', { name: 'Backend Engineer · Mid' })).toBeVisible()

  // Seed: answer 4 came from STT and has no edit yet.
  const original =
    'Mình sẽ gửi kèm idempotency key, server lưu key đó lại, nếu gặp lại key thì trả kết quả cũ chứ không trừ tiền lần nữa.'
  const edited = original.replace('idempotency key', 'Idempotency-Key')
  const q4 = m.getByRole('listitem', { name: /^Câu 4 ·/ })
  await expect(q4).toContainText(original)

  await q4.getByRole('button', { name: 'Sửa transcript' }).click()
  const box = q4.getByRole('textbox', { name: 'Sửa transcript' })
  await expect(box).toHaveValue(original)
  await box.fill(edited)
  await q4.getByRole('button', { name: 'Lưu bản sửa' }).click()

  const shows = async (text: string, version: 'Đã sửa' | 'Bản STT gốc') => {
    await expect(q4).toContainText(text)
    await expect(q4.getByRole('button', { name: version })).toHaveAttribute('aria-pressed', 'true')
  }
  await shows(edited, 'Đã sửa')
  await q4.getByRole('button', { name: 'Bản STT gốc' }).click()
  await shows(original, 'Bản STT gốc')

  // Both versions are kept after a reload; the edit is shown by default.
  await page.reload()
  await shows(edited, 'Đã sửa')
  await q4.getByRole('button', { name: 'Bản STT gốc' }).click()
  await shows(original, 'Bản STT gốc')
})
