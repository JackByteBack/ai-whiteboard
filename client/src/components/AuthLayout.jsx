import { Link } from 'react-router-dom'
import { PenLine } from 'lucide-react'
import { cn } from '../lib/utils'

function Logo({ tone = 'light', className }) {
  const onDark = tone === 'light'

  return (
    <Link to="/" className={cn('group inline-flex items-center gap-2.5', className)}>
      <span
        className={cn(
          'grid h-9 w-9 place-items-center rounded-xl',
          onDark ? 'bg-white/15 text-white' : 'bg-brand-50 text-brand-700',
        )}
      >
        <PenLine className="h-4 w-4" />
      </span>
      <span className="font-display text-xl font-bold text-current">Canvas</span>
    </Link>
  )
}

const HIGHLIGHTS = ['🪶 Freehand & shapes', '✦ AI brainstorm', '◐ Real-time']

export default function AuthLayout({ title, subtitle, children, footer, wide = false }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* LEFT — brand panel */}
      <aside className="brand-gradient relative hidden overflow-hidden p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute -right-20 -top-16 h-80 w-80 opacity-20"
          viewBox="0 0 200 200"
          fill="none"
        >
          <circle cx="100" cy="100" r="72" stroke="white" strokeWidth="2" />
          <path
            d="M20 148C62 96 118 190 184 118"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>

        <Logo tone="light" />

        <div className="max-w-md">
          <h2 className="font-display text-4xl font-bold leading-tight">
            Think it. Draw it. Share it.
          </h2>
          <p className="mt-4 text-white/80">
            An infinite whiteboard for notes, diagrams, sketches and sticky-note brainstorms — with
            AI and live collaboration built in.
          </p>
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/70">
          {HIGHLIGHTS.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
      </aside>

      {/* RIGHT — form panel */}
      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className={cn('w-full animate-in', wide ? 'max-w-md' : 'max-w-sm')}>
          <div className="mb-8 lg:hidden">
            <Logo tone="dark" />
          </div>

          {title && <h1 className="font-display text-2xl font-bold">{title}</h1>}
          {subtitle && <p className="mt-2 text-sm text-muted">{subtitle}</p>}

          <div className="mt-8">{children}</div>

          {footer && <div className="mt-8 text-center text-sm text-muted">{footer}</div>}
        </div>
      </div>
    </div>
  )
}
