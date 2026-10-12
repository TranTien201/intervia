import { expect, test } from '@playwright/test'
import { main } from './helpers'

// Login on in the mock (`__mock.setFlags({ auth: true })`). Seed account from src/mocks/auth.ts.
const ACCOUNT = { email: 'nguyenvana@example.com', password: 'matkhau-mau-123' }

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem('intervia-mock-flags', JSON.stringify({ auth: true })),
  )
})

test('log in, land on the page asked for, stay logged in after a reload', async ({ page }) => {
  await page.goto('/sessions/s-done/review')
  await expect(page).toHaveURL(/\/login\?next=%2Fsessions%2Fs-done%2Freview$/)
  await expect(page.getByRole('heading', { name: 'Đăng nhập' })).toBeVisible()
  // One block, no sidebar, no horizontal scroll on a phone.
  await expect(page.getByRole('navigation', { name: 'Danh sách phiên' })).toHaveCount(0)
  // A string: e2e/ is type-checked without the DOM lib.
  expect(await page.evaluate('document.documentElement.scrollWidth <= innerWidth')).toBe(true)

  await page.getByLabel('Email').fill(ACCOUNT.email)
  await page.getByLabel('Mật khẩu', { exact: true }).fill('sai-mat-khau-roi')
  await page.getByRole('button', { name: 'Đăng nhập' }).click()
  await expect(page.getByRole('alert')).toHaveText('Email hoặc mật khẩu không đúng.')

  await page.getByLabel('Mật khẩu', { exact: true }).fill(ACCOUNT.password)
  await page.getByLabel('Mật khẩu', { exact: true }).press('Enter')
  await expect(page).toHaveURL(/\/sessions\/s-done\/review$/)
  await expect(main(page).getByRole('heading', { name: 'Backend Engineer · Mid' })).toBeVisible()

  await page.reload()
  await expect(main(page).getByRole('heading', { name: 'Backend Engineer · Mid' })).toBeVisible()
})

test('sign up, then go straight in', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/login$/)
  await page.getByRole('link', { name: 'Đăng ký' }).click()
  await expect(page).toHaveURL(/\/signup$/)
  // Same labels as the login form: wait for the new page before typing.
  await expect(page.getByRole('heading', { name: 'Tạo tài khoản' })).toBeVisible()

  await page.getByLabel('Email').fill('moi@example.com')
  await page.getByLabel('Mật khẩu', { exact: true }).fill('mat-khau-dai-du')
  await page.getByLabel('Nhập lại mật khẩu').fill('mat-khau-dai-du')
  await page.getByRole('button', { name: 'Đăng ký' }).click()

  await expect(page).toHaveURL(/\/$/)
  await expect(
    page.getByRole('heading', { name: 'Chào bạn, hôm nay luyện phỏng vấn gì?' }),
  ).toBeVisible()
})

test('account page from the sidebar, then log out', async ({ page }, testInfo) => {
  await page.goto('/login')
  await page.getByLabel('Email').fill(ACCOUNT.email)
  await page.getByLabel('Mật khẩu', { exact: true }).fill(ACCOUNT.password)
  await page.getByRole('button', { name: 'Đăng nhập' }).click()
  await expect(page).toHaveURL(/\/$/)

  // Phone: the sidebar sits behind ☰.
  if (testInfo.project.name === 'mobile')
    await page.getByRole('button', { name: 'Mở menu' }).click()
  await page.getByRole('link', { name: 'Tài khoản' }).click()
  await expect(page).toHaveURL(/\/account$/)
  await expect(main(page).getByText(ACCOUNT.email)).toBeVisible()
  await expect(main(page).getByText(/file ghi âm \(/)).toBeVisible()
  expect(await page.evaluate('document.documentElement.scrollWidth <= innerWidth')).toBe(true)

  await main(page).getByRole('button', { name: 'Đăng xuất' }).click()
  await expect(page).toHaveURL(/\/login$/)
  await page.goBack()
  await expect(page).toHaveURL(/\/login/)
})
