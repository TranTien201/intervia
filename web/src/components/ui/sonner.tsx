'use client'

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from 'lucide-react'
import { Toaster as Sonner, type ToasterProps } from 'sonner'

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      // Rich colours so success uses --ok ("Đã lưu"); every type is mapped to Intervia tokens below.
      richColors
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
          '--border-radius': 'var(--radius)',
          '--success-bg': 'var(--ok-soft)',
          '--success-text': 'var(--ok)',
          '--success-border': 'var(--ok-soft)',
          '--error-bg': 'var(--danger-soft)',
          '--error-text': 'var(--danger)',
          '--error-border': 'var(--danger-soft)',
          '--info-bg': 'var(--accent-soft)',
          '--info-text': 'var(--accent-strong)',
          '--info-border': 'var(--accent-soft)',
          '--warning-bg': 'var(--amber-soft)',
          '--warning-text': 'var(--amber)',
          '--warning-border': 'var(--amber-soft)',
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
