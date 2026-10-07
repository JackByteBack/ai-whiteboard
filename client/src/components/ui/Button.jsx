import { Loader2 } from 'lucide-react'
import { cn } from '../../lib/utils'

const VARIANTS = {
  primary:
    'brand-gradient text-white shadow-[var(--shadow-brand)] hover:brightness-[1.07]',
  secondary:
    'bg-surface hover:bg-surface-2 text-ink border border-line shadow-[var(--shadow-card)]',
  ghost: 'text-muted hover:bg-surface-2 hover:text-ink',
  danger: 'bg-danger text-white',
  outline: 'border border-line bg-surface hover:border-brand-300',
  soft: 'bg-brand-50 text-brand-700 hover:bg-brand-100',
}

const SIZES = {
  sm: 'h-8 px-3.5 text-xs',
  md: 'h-10 px-5 text-sm',
  lg: 'h-12 px-7 text-[15px]',
  icon: 'h-10 w-10 p-0',
  iconSm: 'h-8 w-8 p-0',
}

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-full font-semibold whitespace-nowrap transition-all focus-ring active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none cursor-pointer select-none'

export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  className,
  children,
  disabled,
  type = 'button',
  ...props
}) {
  return (
    <button
      type={type}
      className={cn(BASE, VARIANTS[variant], SIZES[size], className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 shrink-0 animate-spin" />}
      {children}
    </button>
  )
}
