import { cn, colorFromId, initials } from '../../lib/utils'

const SIZES = {
  sm: 'h-7 w-7 text-[10px]',
  md: 'h-9 w-9 text-xs',
  lg: 'h-12 w-12 text-base',
}

export default function Avatar({ user, size = 'md', ring = false, className }) {
  const name = user?.name || user?.email || ''
  const background = colorFromId(user?.id || user?.email || user?.name || name)

  return (
    <div
      title={name || undefined}
      className={cn(
        'grid shrink-0 place-items-center rounded-full font-semibold text-white shadow-[var(--shadow-card)]',
        SIZES[size],
        ring && 'ring-2 ring-surface',
        className,
      )}
      style={{ background }}
    >
      {initials(name)}
    </div>
  )
}
