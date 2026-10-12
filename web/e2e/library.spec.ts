import { expect, test } from '@playwright/test'
import { main } from './helpers'

test('editing a CV profile saves a new version and keeps the old one', async ({ page }) => {
  await page.goto('/library/cv/cv-backend')
  const m = main(page)
  await expect(m.getByRole('button', { name: 'Bản 3, xem lịch sử phiên bản' })).toBeVisible()

  await m.getByRole('button', { name: 'Thêm kỹ năng' }).click()
  await m.getByRole('textbox', { name: 'Thêm kỹ năng' }).fill('Kafka')
  await m.getByRole('textbox', { name: 'Thêm kỹ năng' }).press('Enter')
  await m.getByRole('button', { name: 'Lưu thành bản 4' }).click()

  await expect(m.getByText('Đã lưu · bản 4')).toBeVisible()
  await expect(m.getByRole('button', { name: 'Bản 4, xem lịch sử phiên bản' })).toBeVisible()

  // Saved on the "server": still there after a reload.
  await page.reload()
  await expect(m.getByRole('button', { name: 'Bản 4, xem lịch sử phiên bản' })).toBeVisible()
  await expect(m.getByText('Kafka', { exact: true })).toBeVisible()

  // The old version is unchanged and view-only.
  await page.goto('/library/cv/cv-backend?v=3')
  await expect(m.getByText('Đang xem bản 3 (chỉ xem)')).toBeVisible()
  await expect(m.getByText('Python', { exact: true })).toBeVisible()
  await expect(m.getByText('Kafka', { exact: true })).toHaveCount(0)
  await expect(m.getByRole('button', { name: /^Thêm/ })).toHaveCount(0)
})

test('deleting a CV deletes the sessions that use it', async ({ page }) => {
  await page.goto('/library')
  const m = main(page)
  // Seed: "CV Backend 2026" is used by s-done, s-plan, s-match; s-active uses another CV.
  await m.getByRole('button', { name: 'Tùy chọn cho CV CV Backend 2026' }).click()
  await page.getByRole('menuitem', { name: 'Xóa' }).click()

  const confirm = m.getByRole('alertdialog', { name: 'Xóa CV CV Backend 2026?' })
  await expect(confirm).toContainText(
    'Xóa CV sẽ xóa luôn 3 phiên đó, gồm transcript và file ghi âm.',
  )
  await expect(confirm.getByRole('listitem')).toHaveCount(3)
  // No way to delete the CV but keep its sessions.
  await expect(confirm.getByRole('button')).toHaveCount(2)
  await confirm.getByRole('button', { name: 'Xóa CV và 3 phiên' }).click()

  await expect(m.getByText('CV Backend 2026', { exact: true })).toHaveCount(0)
  await expect(m.getByText('CV AI Engineer', { exact: true })).toBeVisible()

  for (const id of ['s-done', 's-plan', 's-match']) {
    await page.goto(`/sessions/${id}`)
    await expect(m.getByRole('heading', { name: 'Không tìm thấy phiên này' })).toBeVisible()
  }
  await page.goto('/sessions/s-active/interview')
  await expect(page.getByRole('textbox', { name: 'Câu trả lời' })).toBeVisible()
})
