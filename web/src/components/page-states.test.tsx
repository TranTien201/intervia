import { useQuery } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { ApiError, NetworkError } from '@/api/client'
import { renderWithClient } from '@/test/render'
import { Banner } from './Banner'
import { EmptyState, ErrorState, QueryView } from './PageStates'

function List({ fn }: { fn: () => Promise<string[]> }) {
  const query = useQuery({ queryKey: ['test-list'], queryFn: fn })
  return (
    <QueryView
      query={query}
      isEmpty={(d) => d.length === 0}
      empty={<EmptyState message="Chưa có CV nào." />}
    >
      {(data) => <p>Có {data.length} CV</p>}
    </QueryView>
  )
}

describe('QueryView', () => {
  it('shows the skeleton while loading', () => {
    renderWithClient(<List fn={() => new Promise(() => {})} />)
    expect(screen.getByLabelText('Đang tải')).toHaveAttribute('aria-busy', 'true')
  })

  it('shows the empty state', async () => {
    renderWithClient(<List fn={async () => []} />)
    expect(await screen.findByText('Chưa có CV nào.')).toBeInTheDocument()
  })

  it('shows data', async () => {
    renderWithClient(<List fn={async () => ['a', 'b']} />)
    expect(await screen.findByText('Có 2 CV')).toBeInTheDocument()
  })

  it('shows the error and retries', async () => {
    let calls = 0
    const fn = async () => {
      calls += 1
      if (calls === 1) throw new NetworkError()
      return ['a']
    }
    renderWithClient(<List fn={fn} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Không kết nối được máy chủ')
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }))
    expect(await screen.findByText('Có 1 CV')).toBeInTheDocument()
  })
})

describe('ErrorState', () => {
  it('maps the error code to a Vietnamese message', () => {
    render(<ErrorState error={new ApiError(502, { code: 'llm_error', message: 'boom' })} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Dịch vụ AI đang lỗi')
  })

  it('uses the page-specific not-found message and hides retry', () => {
    render(
      <ErrorState
        error={new ApiError(404, { code: 'not_found', message: 'x' })}
        notFoundMessage="Không tìm thấy CV này."
        onRetry={() => {}}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Không tìm thấy CV này.')
    expect(screen.queryByRole('button', { name: 'Thử lại' })).not.toBeInTheDocument()
  })
})

describe('Banner', () => {
  function Dismissible() {
    const [open, setOpen] = useState(true)
    return open ? <Banner onDismiss={() => setOpen(false)}>Đã khôi phục phiên.</Banner> : null
  }

  it('can be dismissed', async () => {
    render(<Dismissible />)
    await userEvent.click(screen.getByRole('button', { name: 'Đóng thông báo' }))
    expect(screen.queryByText('Đã khôi phục phiên.')).not.toBeInTheDocument()
  })

  it('announces errors as alerts and others as status', () => {
    render(
      <>
        <Banner variant="error">Mic lỗi</Banner>
        <Banner variant="warning">Mất kết nối</Banner>
      </>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Mic lỗi')
    expect(screen.getByRole('status')).toHaveTextContent('Mất kết nối')
    expect(screen.queryByRole('button', { name: 'Đóng thông báo' })).not.toBeInTheDocument()
  })
})
