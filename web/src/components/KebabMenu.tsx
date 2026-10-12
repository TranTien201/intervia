import { MoreVertical } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

export interface KebabItem {
  label: string
  onSelect: () => void
  icon?: ReactNode
  /** Red: only for deleting user data. */
  danger?: boolean
  disabled?: boolean
}

/** "⋮" menu. `label` names the trigger for screen readers, e.g. "Tùy chọn cho CV Backend 2026". */
export function KebabMenu({
  items,
  label = 'Tùy chọn',
  className,
}: {
  items: KebabItem[]
  label?: string
  className?: string
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={label} className={cn(className)}>
          <MoreVertical />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44 rounded-lg border-line bg-surface">
        {items.map((item) => (
          <DropdownMenuItem
            key={item.label}
            variant={item.danger ? 'destructive' : 'default'}
            disabled={item.disabled}
            onSelect={item.onSelect}
            className={cn(
              'cursor-pointer',
              item.danger && 'text-danger focus:bg-danger-soft focus:text-danger',
            )}
          >
            {item.icon}
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
