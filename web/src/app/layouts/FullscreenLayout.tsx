import { Outlet } from 'react-router'

/** Page 5 (interview): no sidebar so the candidate can focus. */
export function FullscreenLayout() {
  return (
    <div className="flex min-h-full flex-col bg-bg">
      <Outlet />
    </div>
  )
}
