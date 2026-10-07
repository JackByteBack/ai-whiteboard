import { Loader2 } from 'lucide-react'
import { cn } from '../../lib/utils'

export function Spinner({ label, className }) {
  return (
    <span className={cn('inline-flex items-center gap-2 text-brand-500', className)}>
      <Loader2 className="h-4 w-4 animate-spin" />
      {label && <span className="text-sm font-medium">{label}</span>}
    </span>
  )
}

export function FullScreenSpinner({ label = 'Loading...' }) {
  return (
    <div className="flex h-screen w-full flex-col items-center justify-center gap-3">
      <Spinner label={label} />
    </div>
  )
}

export default Spinner
