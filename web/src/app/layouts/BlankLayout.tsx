import { Outlet } from 'react-router'

/** Page 11 (login / signup): one centred block, no sidebar. */
export function BlankLayout() {
  return (
    <div className="grid min-h-full place-items-center bg-bg p-4">
      <Outlet />
    </div>
  )
}
