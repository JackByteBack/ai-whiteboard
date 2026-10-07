import { useId } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '../../lib/utils'

function Field({ id, label, error, className, children }) {
  return (
    <div className={cn('w-full', className)}>
      {label && (
        <label htmlFor={id} className="mb-1.5 block text-xs font-medium text-muted">
          {label}
        </label>
      )}
      {children}
      {error && <p className="mt-1.5 text-xs text-danger">{error}</p>}
    </div>
  )
}

export function Input({ label, error, id, className, ...props }) {
  const autoId = useId()
  const inputId = id || autoId

  return (
    <Field id={inputId} label={label} error={error}>
      <input
        id={inputId}
        className={cn('input-base rounded-full', error && 'border-danger', className)}
        {...props}
      />
    </Field>
  )
}

export function Textarea({ label, error, id, rows = 4, className, ...props }) {
  const autoId = useId()
  const fieldId = id || autoId

  return (
    <Field id={fieldId} label={label} error={error}>
      <textarea
        id={fieldId}
        rows={rows}
        className={cn('input-base resize-none rounded-2xl', error && 'border-danger', className)}
        {...props}
      />
    </Field>
  )
}

export function Select({ label, error, id, className, children, ...props }) {
  const autoId = useId()
  const selectId = id || autoId

  return (
    <Field id={selectId} label={label} error={error}>
      <div className="relative">
        <select
          id={selectId}
          className={cn(
            'input-base appearance-none rounded-full pr-10',
            error && 'border-danger',
            className,
          )}
          {...props}
        >
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
      </div>
    </Field>
  )
}
