import { expect, test } from '@playwright/test'
import { JD_TEXT, main, pdfFile, SLOW } from './helpers'

// Page 2 → page 3: all 4 combinations of existing / new CV × existing / new JD.
const COMBOS = [
  { cv: 'existing', jd: 'existing' },
  { cv: 'existing', jd: 'new' },
  { cv: 'new', jd: 'existing' },
  { cv: 'new', jd: 'new' },
] as const

for (const { cv, jd } of COMBOS) {
  test(`creates a session with ${cv} CV and ${jd} JD`, async ({ page }) => {
    await page.goto('/sessions/new')
    const m = main(page)
    await expect(m.getByRole('heading', { name: 'Tạo phiên' })).toBeVisible()

    if (cv === 'existing') {
      await m.getByRole('combobox', { name: 'CV có sẵn' }).selectOption({ label: 'CV AI Engineer' })
    } else {
      await m.getByRole('radio', { name: 'Tải CV mới' }).check()
      await m.getByLabel('File CV').setInputFiles(pdfFile('cv-e2e.pdf'))
      // Name suggested from the file name.
      await expect(m.getByLabel('Tên CV')).not.toHaveValue('')
      await m.getByLabel('Tên CV').fill('CV E2E')
    }

    if (jd === 'existing') {
      await m.getByRole('combobox', { name: 'JD có sẵn' }).selectOption({ label: 'ABC · Backend' })
    } else {
      await m.getByRole('radio', { name: 'Thêm JD mới' }).check()
      await m.getByLabel('Nội dung JD').fill(JD_TEXT)
      await m.getByLabel('Tên JD').fill('JD E2E')
    }

    await m.getByRole('combobox', { name: 'Vị trí' }).selectOption({ label: 'Backend Engineer' })
    await m.getByRole('radio', { name: 'Mid' }).check()
    await m.getByRole('button', { name: 'Tiếp tục' }).click()

    await expect(page).toHaveURL(/\/sessions\/[^/]+\/match$/)
    // New items are analysed first; existing ones show the match right away.
    await expect(m.getByRole('button', { name: 'Lưu và tạo kế hoạch' })).toBeVisible(SLOW)
    if (cv === 'new') await expect(m.getByText('CV E2E', { exact: false }).first()).toBeVisible()
    if (jd === 'new') await expect(m.getByText('JD E2E', { exact: false }).first()).toBeVisible()

    // The new items are in the library.
    if (cv === 'new' || jd === 'new') {
      await page.goto(`/library${cv === 'new' ? '' : '?tab=jd'}`)
      await expect(m.getByText(cv === 'new' ? 'CV E2E' : 'JD E2E', { exact: true })).toBeVisible()
    }
  })
}
