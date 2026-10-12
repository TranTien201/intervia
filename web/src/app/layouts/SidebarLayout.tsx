import { Outlet } from 'react-router'
import { MobileNav, Sidebar } from './Sidebar'

/** Pages 1–4, 6–9 and error pages: sidebar + content area on --bg. Phones get a ☰ top bar instead. */
export function SidebarLayout() {
  return (
    <div className="flex min-h-full flex-col md:flex-row">
      <MobileNav />
      <Sidebar />
      <main className="min-w-0 flex-1 bg-bg">
        <Outlet />
      </main>
    </div>
  )
}
