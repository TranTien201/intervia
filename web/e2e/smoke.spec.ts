import { expect, test } from '@playwright/test'

test('home page loads with mock data', async ({ page }) => {
  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: 'Chào bạn, hôm nay luyện phỏng vấn gì?' }),
  ).toBeVisible()
})
