import { expect, test, type Page } from '@playwright/test'
import { SLOW } from './helpers'

// Page 5 in Text mode. Seed: s-plan is a draft with a ready blueprint; the mock asks at most 5 questions.

const answerBox = (page: Page) => page.getByRole('textbox', { name: 'Câu trả lời' })
const conversation = (page: Page) => page.getByRole('log')

/** The interviewer has finished its line and the candidate can answer. */
async function waitForTurn(page: Page) {
  await expect(conversation(page)).toHaveAttribute('aria-busy', 'false', SLOW)
  await expect(page.getByRole('button', { name: 'Nhắc lại' })).toBeEnabled(SLOW)
}

async function startFromPlan(page: Page) {
  await page.goto('/sessions/s-plan/plan')
  await page.getByRole('radio', { name: 'Text' }).check()
  await page.getByRole('button', { name: 'Bắt đầu phỏng vấn' }).click()
  await expect(page).toHaveURL(/\/sessions\/s-plan\/interview$/)
  await waitForTurn(page)
}

/** Send an answer; resolves once it is saved, while the next question may still be streaming. */
async function answer(page: Page, text: string, how: 'click' | 'keys' = 'click') {
  await answerBox(page).fill(text)
  if (how === 'click') await page.getByRole('button', { name: 'Gửi' }).click()
  else await answerBox(page).press('Control+Enter')
  await expect(conversation(page).getByText(text, { exact: true })).toBeVisible()
}

test('a full Text interview, from page 4 to the review', async ({ page }) => {
  await startFromPlan(page)
  await expect(page.getByText(/Câu 1\/~\d+/)).toBeVisible()

  // Quick buttons are events, not answers.
  for (const name of ['Nhắc lại', 'Giải thích', 'Gợi ý']) {
    await page.getByRole('button', { name }).click()
    await waitForTurn(page)
  }
  await answer(page, 'Câu trả lời thứ nhất, kèm ví dụ cụ thể.')
  // Cleared once the server has saved it and the next question is in.
  await expect(answerBox(page)).toHaveValue('', SLOW)
  await waitForTurn(page)
  await page.getByRole('button', { name: 'Bỏ qua' }).click()

  // Answer with Ctrl+Enter until the mock ends the session (5 questions).
  const ended = page.getByText(/Buổi phỏng vấn đã kết thúc · \d+ câu/)
  const ready = page.getByRole('button', { name: 'Nhắc lại', disabled: false })
  for (let i = 2; i <= 6; i++) {
    await expect(ready.or(ended)).toBeVisible(SLOW)
    if (await ended.isVisible()) break
    await answer(page, `Câu trả lời số ${i}.`, 'keys')
  }
  await expect(ended).toBeVisible(SLOW)
  await expect(answerBox(page)).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Dừng' })).toHaveCount(0)

  await page.getByRole('link', { name: 'Xem lại phiên →' }).click()
  await expect(page).toHaveURL(/\/sessions\/s-plan\/review$/)
  const transcript = page.getByRole('main')
  await expect(transcript.getByText('Câu trả lời thứ nhất, kèm ví dụ cụ thể.')).toBeVisible()
  await expect(transcript.getByText('Đã bỏ qua')).toBeVisible()

  // A finished session opens on the review page.
  await page.goto('/sessions/s-plan/interview')
  await expect(page).toHaveURL(/\/sessions\/s-plan\/review$/)
})

test('reloading while the interviewer is speaking restores the session', async ({ page }) => {
  await startFromPlan(page)
  await answer(page, 'Câu trả lời trước khi tải lại.')

  // Reload in the middle of the next question's stream.
  await expect(conversation(page)).toHaveAttribute('aria-busy', 'true')
  await page.reload()

  await expect(page.getByText('Đã khôi phục phiên')).toBeVisible(SLOW)
  await expect(conversation(page)).toContainText('Câu trả lời trước khi tải lại.')
  // The answer was saved before the reload: it must not come back as a draft to send again.
  await expect(answerBox(page)).toHaveValue('')

  // The question that was streaming comes back in full from the transcript, and the session goes on.
  await waitForTurn(page)
  await expect(page.getByText(/Câu 2\/~\d+/)).toBeVisible()
  await expect(conversation(page).getByText('Người phỏng vấn')).toHaveCount(2)

  // A half-typed answer survives a reload too.
  await answerBox(page).fill('Đang gõ dở')
  await page.reload()
  await expect(page.getByText('Câu trả lời bạn đang gõ dở vẫn còn trong ô nhập.')).toBeVisible(SLOW)
  await expect(answerBox(page)).toHaveValue('Đang gõ dở')
  await waitForTurn(page)
  await answer(page, 'Đang gõ dở')
})
