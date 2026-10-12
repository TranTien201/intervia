import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PasswordInput } from './PasswordInput'

it('shows and hides the password with the eye button', async () => {
  const user = userEvent.setup()
  render(<PasswordInput aria-label="Mật khẩu" defaultValue="bi-mat-123" />)
  const input = screen.getByLabelText('Mật khẩu')
  expect(input).toHaveAttribute('type', 'password')

  await user.click(screen.getByRole('button', { name: 'Hiện mật khẩu' }))
  expect(input).toHaveAttribute('type', 'text')
  expect(screen.getByRole('button', { name: 'Ẩn mật khẩu' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  await user.click(screen.getByRole('button', { name: 'Ẩn mật khẩu' }))
  expect(input).toHaveAttribute('type', 'password')
  expect(input).toHaveValue('bi-mat-123')
})
