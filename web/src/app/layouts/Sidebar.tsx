import {
  Library,
  type LucideIcon,
  Map,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  TrendingUp,
  UserRound,
} from 'lucide-react'
import { type MouseEvent, type ReactElement, useState } from 'react'
import { Link, useMatch, useResolvedPath } from 'react-router'
import { useMe } from '@/api/hooks'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { SessionList } from './SessionList'
import { useSidebarCollapsed } from './use-sidebar-collapsed'

/** Features not shipped in MVP-1. Flip a flag to show its sidebar link (docs/design/ui-pages.md §2). */
const SIDEBAR_FEATURES = {
  progress: false, // /progress — MVP-2+
  roadmap: false, // /roadmap — MVP-3+
}

type NavItem = { to: string; label: string; icon: LucideIcon; enabled: boolean }

// Shown under the session list.
const insightItems: NavItem[] = [
  { to: '/progress', label: 'Tiến bộ', icon: TrendingUp, enabled: SIDEBAR_FEATURES.progress },
  { to: '/roadmap', label: 'Lộ trình', icon: Map, enabled: SIDEBAR_FEATURES.roadmap },
]

// Pinned to the bottom. "Tài khoản" only when the backend has real login on (UI-11).
const footerItems = (authEnabled: boolean): NavItem[] => [
  { to: '/library', label: 'Thư viện CV & JD', icon: Library, enabled: true },
  { to: '/account', label: 'Tài khoản', icon: UserRound, enabled: authEnabled },
]

/** In the icon strip the label moves into a tooltip on the right. */
function StripTooltip({ label, children }: { label: string; children: ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  )
}

function SidebarLink({ to, label, icon: Icon, collapsed }: NavItem & { collapsed: boolean }) {
  // Same matching as NavLink; NavLink's function className doesn't survive TooltipTrigger's asChild.
  const isActive = useMatch({ path: useResolvedPath(to).pathname, end: false }) !== null
  const link = (
    <Link
      to={to}
      aria-label={collapsed ? label : undefined}
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink2 hover:bg-subtle hover:text-ink',
        collapsed && 'justify-center px-0',
        isActive &&
          'bg-accent-soft font-semibold text-accent hover:bg-accent-soft hover:text-accent',
      )}
    >
      <Icon className="size-4" /> {!collapsed && label}
    </Link>
  )
  return collapsed ? <StripTooltip label={label}>{link}</StripTooltip> : link
}

function NavList({
  items,
  label,
  collapsed,
}: {
  items: NavItem[]
  label: string
  collapsed: boolean
}) {
  const visible = items.filter((i) => i.enabled)
  if (visible.length === 0) return null
  return (
    <nav aria-label={label} className="flex flex-col gap-0.5">
      {visible.map((i) => (
        <SidebarLink key={i.to} {...i} collapsed={collapsed} />
      ))}
    </nav>
  )
}

function Logo() {
  return (
    <Link to="/" className="text-[17px] font-bold tracking-tight text-ink">
      Inter<span className="text-accent">via</span>
    </Link>
  )
}

/**
 * Sidebar body, shared by the desktop column and the mobile sheet.
 * Collapsed = icon strip: the session list is hidden, other items keep their icon + tooltip.
 */
function SidebarPanel({
  collapsed = false,
  onToggleCollapsed,
}: {
  collapsed?: boolean
  /** Desktop only; the mobile sheet closes with its own ✕. */
  onToggleCollapsed?: () => void
}) {
  const authEnabled = useMe().data?.auth_enabled ?? false
  const toggleLabel = collapsed ? 'Mở rộng thanh bên' : 'Thu gọn thanh bên'
  const ToggleIcon = collapsed ? PanelLeftOpen : PanelLeftClose
  return (
    <>
      <div
        className={cn(
          'flex items-center justify-between pt-5 pb-4 pl-5 pr-3',
          collapsed && 'justify-center px-0',
        )}
      >
        {!collapsed && <Logo />}
        {onToggleCollapsed && (
          <StripTooltip label={toggleLabel}>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={toggleLabel}
              aria-expanded={!collapsed}
              onClick={onToggleCollapsed}
            >
              <ToggleIcon />
            </Button>
          </StripTooltip>
        )}
      </div>
      <div className={cn('px-4', collapsed && 'flex justify-center px-0')}>
        {collapsed ? (
          <StripTooltip label="Phiên mới">
            <Button asChild size="icon">
              <Link to="/sessions/new" aria-label="Phiên mới">
                <Plus />
              </Link>
            </Button>
          </StripTooltip>
        ) : (
          <Button asChild className="w-full justify-start">
            <Link to="/sessions/new">
              <Plus /> Phiên mới
            </Link>
          </Button>
        )}
      </div>
      <div
        className={cn(
          'grid flex-1 content-start gap-4 overflow-y-auto px-3 py-4',
          collapsed && 'px-2',
        )}
      >
        {!collapsed && (
          <nav aria-label="Danh sách phiên">
            <SessionList />
          </nav>
        )}
        <NavList items={insightItems} label="Phân tích" collapsed={collapsed} />
      </div>
      <div className={cn('border-t border-line p-3', collapsed && 'px-2')}>
        <NavList items={footerItems(authEnabled)} label="Thư viện và tài khoản" collapsed={collapsed} />
      </div>
    </>
  )
}

/** Desktop (md+): 260px column, or a 56px icon strip when collapsed. */
export function Sidebar() {
  const [collapsed, toggleCollapsed] = useSidebarCollapsed()
  return (
    <aside
      aria-label="Thanh bên"
      className={cn(
        'sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-line bg-surface md:flex',
        collapsed ? 'w-14' : 'w-[260px]',
      )}
    >
      <SidebarPanel collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
    </aside>
  )
}

/** Phone (< md): top bar with ☰ opening the sidebar as a sheet from the left. */
export function MobileNav() {
  const [open, setOpen] = useState(false)
  // Close after following any link, including one to the page already shown.
  const closeOnLink = (e: MouseEvent) => {
    if ((e.target as Element).closest('a')) setOpen(false)
  }
  return (
    <header className="sticky top-0 z-40 flex h-12 items-center gap-2 border-b border-line bg-surface px-2 md:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Mở menu"
          aria-expanded={open}
          onClick={() => setOpen(true)}
        >
          <Menu />
        </Button>
        <SheetContent
          side="left"
          aria-describedby={undefined}
          className="w-[280px] gap-0 bg-surface p-0"
        >
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <div className="flex min-h-0 flex-1 flex-col" onClick={closeOnLink}>
            <SidebarPanel />
          </div>
        </SheetContent>
      </Sheet>
      <Logo />
    </header>
  )
}
