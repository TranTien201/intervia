import type { Page } from '@playwright/test'

// Each test gets a fresh browser context, so the mock DB (sessionStorage) starts from the seed.

/** Page content without the sidebar (which repeats CV/JD and session names). */
export const main = (page: Page) => page.getByRole('main')

/** A small PDF the file inputs accept (the mock reads nothing from it). */
export const pdfFile = (name: string) => ({
  name,
  mimeType: 'application/pdf',
  buffer: Buffer.from('%PDF-1.4\n% e2e\n'),
})

export const JD_TEXT = `Backend Engineer – Công ty E2E
Yêu cầu: Python, FastAPI, PostgreSQL, Redis, xử lý lỗi và retry, Docker.`

/** CV/JD analysis (5s) or blueprint generation (3s) in the mock can take a while. */
export const SLOW = { timeout: 20_000 }
