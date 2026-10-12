import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

const WIDTH = {
  form: 'max-w-[1040px]', // pages 2, 3, 4, 7, 8, 9
  wide: 'max-w-none', // page 6 (main column + 280px side column)
} as const

/** Content wrapper for pages inside SidebarLayout. */
export function Page({
  children,
  width = 'form',
  className,
}: {
  children: ReactNode
  width?: keyof typeof WIDTH
  className?: string
}) {
  return (
    <div className={cn('mx-auto w-full px-4 py-8 sm:px-8', WIDTH[width], className)}>
      {children}
    </div>
  )
}

export function PageTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h1 className={cn('text-page-title font-semibold text-ink', className)}>{children}</h1>
}
