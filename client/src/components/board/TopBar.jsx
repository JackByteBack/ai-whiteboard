import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Download,
  Eye,
  LayoutGrid,
  Minus,
  Plus,
  Redo2,
  Share2,
  Sparkles,
  Undo2,
} from 'lucide-react'
import Button from '../ui/Button'
import { cn, colorFromId, initials } from '../../lib/utils'

const PATTERNS = [
  { id: 'dots', label: 'Dots' },
  { id: 'grid', label: 'Grid' },
  { id: 'plain', label: 'Plain' },
]

const BG_SWATCHES = [
  '#ffffff',
  '#f8fafc',
  '#fffbeb',
  '#f0fdf4',
  '#eff6ff',
  '#faf5ff',
  '#fef2f2',
  '#1e293b',
]

const MENU_MOTION = {
  initial: { opacity: 0, y: -6, scale: 0.97 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -6, scale: 0.97 },
  transition: { duration: 0.16, ease: [0.16, 1, 0.3, 1] },
}

const viewerKey = (viewer, index) =>
  String(viewer?.id ?? viewer?.userId ?? viewer?.socketId ?? viewer?.email ?? index)

const viewerName = (viewer) =>
  viewer?.name || viewer?.userName || viewer?.email || 'Guest'

/** Top glass bar: title, presence, background, zoom, AI, export and share. */
export default function TopBar({
  board,
  role,
  viewers = [],
  onRename,
  onShare,
  onAI,
  onSetBackground,
  onSetBgColor,
  onPreviewBgColor,
  onExportPNG,
  onExportSVG,
  zoom = 1,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
}) {
  const navigate = useNavigate()
  const editable = role !== 'viewer'

  const [title, setTitle] = useState(board?.title || '')
  const [lastTitle, setLastTitle] = useState(board?.title)
  if (board?.title !== lastTitle) {
    setLastTitle(board?.title)
    setTitle(board?.title || '')
  }

  const [menu, setMenu] = useState(null) // 'bg' | 'export' | null
  const [customColor, setCustomColor] = useState(board?.bg_color || '#ffffff')
  const [lastBgColor, setLastBgColor] = useState(board?.bg_color)
  if (board?.bg_color !== lastBgColor) {
    setLastBgColor(board?.bg_color)
    setCustomColor(board?.bg_color || '#ffffff')
  }

  const barRef = useRef(null)
  const previewRef = useRef(null)

  const commitCustomColor = useCallback(() => {
    const pending = previewRef.current
    previewRef.current = null
    if (pending && pending !== board?.bg_color) onSetBgColor?.(pending)
  }, [board?.bg_color, onSetBgColor])

  // Close popovers on outside click (and flush a pending custom color).
  useEffect(() => {
    if (!menu) return undefined

    const onPointerDown = (event) => {
      if (barRef.current && !barRef.current.contains(event.target)) {
        commitCustomColor()
        setMenu(null)
      }
    }

    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [menu, commitCustomColor])

  const commitTitle = () => {
    const next = title.trim() || 'Untitled whiteboard'
    setTitle(next)
    if (editable && next !== (board?.title || '')) onRename?.(next)
  }

  const closeMenu = () => {
    commitCustomColor()
    setMenu(null)
  }

  const zoomLabel = `${Math.round((zoom || 1) * 100)}%`

  return (
    <header
      ref={barRef}
      className="glass absolute inset-x-0 top-0 z-40 flex items-center justify-between border-b border-line px-3 py-2"
    >
      {/* ------------------------------------------------------------ left */}
      <div className="flex min-w-0 items-center gap-1.5">
        <Button
          variant="ghost"
          size="iconSm"
          aria-label="Back to dashboard"
          title="Back to dashboard"
          onClick={() => navigate('/dashboard')}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>

        <input
          value={title}
          disabled={!editable}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={commitTitle}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
            if (event.key === 'Escape') {
              setTitle(board?.title || '')
              event.currentTarget.blur()
            }
          }}
          className={cn(
            'focus-ring min-w-0 max-w-[38vw] truncate rounded-lg bg-transparent px-2 py-1 font-display text-sm font-semibold text-ink outline-none transition-colors',
            editable && 'hover:bg-surface-2 focus:bg-surface-2',
            !editable && 'cursor-default',
          )}
        />

        {role === 'viewer' && (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-xs font-medium text-muted">
            <Eye className="h-3.5 w-3.5" />
            View only
          </span>
        )}

        {editable && (
          <div className="flex items-center">
            <Button
              variant="ghost"
              size="iconSm"
              aria-label="Undo"
              title="Undo"
              disabled={!canUndo}
              onClick={onUndo}
            >
              <Undo2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="iconSm"
              aria-label="Redo"
              title="Redo"
              disabled={!canRedo}
              onClick={onRedo}
            >
              <Redo2 className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {/* ----------------------------------------------------------- right */}
      <div className="flex shrink-0 items-center gap-2">
        {/* presence */}
        <div className="mr-1 flex items-center -space-x-2">
          {viewers.slice(0, 4).map((viewer, index) => (
            <div
              key={viewerKey(viewer, index)}
              title={viewerName(viewer)}
              className="grid h-7 w-7 place-items-center rounded-full text-[10px] font-semibold text-white ring-2 ring-surface"
              style={{ background: colorFromId(viewerKey(viewer, index)) }}
            >
              {initials(viewerName(viewer))}
            </div>
          ))}
          {viewers.length > 4 && (
            <div
              title={`${viewers.length - 4} more`}
              className="grid h-7 w-7 place-items-center rounded-full bg-elevated text-[10px] font-semibold text-muted ring-2 ring-surface"
            >
              +{viewers.length - 4}
            </div>
          )}
        </div>

        {/* background switcher */}
        <div className="relative">
          <Button
            variant="ghost"
            size="iconSm"
            aria-label="Board background"
            title="Background"
            onClick={() => setMenu((value) => (value === 'bg' ? null : 'bg'))}
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>

          <AnimatePresence>
            {menu === 'bg' && (
              <motion.div
                {...MENU_MOTION}
                className="card absolute right-0 top-11 z-50 w-60 rounded-2xl p-3 shadow-[var(--shadow-lift)]"
              >
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-faint">
                  Pattern
                </p>
                <div className="mb-3 flex flex-col gap-0.5">
                  {PATTERNS.map((pattern) => {
                    const active = (board?.background || 'dots') === pattern.id
                    return (
                      <button
                        key={pattern.id}
                        type="button"
                        onClick={() => {
                          onSetBackground?.(pattern.id)
                          closeMenu()
                        }}
                        className={cn(
                          'flex cursor-pointer items-center justify-between rounded-lg px-2 py-1.5 text-sm transition-colors',
                          active
                            ? 'bg-brand-50 font-semibold text-brand-700'
                            : 'text-muted hover:bg-surface-2 hover:text-ink',
                        )}
                      >
                        {pattern.label}
                        {active && <Check className="h-4 w-4" />}
                      </button>
                    )
                  })}
                </div>

                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-faint">
                  Color
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {BG_SWATCHES.map((color) => (
                    <button
                      key={color}
                      type="button"
                      title={color}
                      onClick={() => {
                        onSetBgColor?.(color)
                        closeMenu()
                      }}
                      className={cn(
                        'h-8 cursor-pointer rounded-lg border border-line transition-transform hover:scale-105',
                        (board?.bg_color || '#ffffff') === color &&
                          'ring-2 ring-brand-300 ring-offset-1',
                      )}
                      style={{ background: color }}
                    />
                  ))}
                </div>

                <label className="mt-2 flex cursor-pointer items-center justify-between rounded-lg px-2 py-1.5 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-ink">
                  <span>Custom…</span>
                  <span
                    className="relative block h-6 w-6 overflow-hidden rounded-full border border-line"
                    style={{
                      background: `conic-gradient(#f43f5e, #f59e0b, #22c55e, #3b82f6, #a855f7, #f43f5e)`,
                    }}
                  >
                    <input
                      type="color"
                      value={customColor}
                      onChange={(event) => {
                        const value = event.target.value
                        setCustomColor(value)
                        previewRef.current = value
                        onPreviewBgColor?.(value)
                      }}
                      onBlur={commitCustomColor}
                      className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    />
                    <span
                      className="absolute inset-[5px] rounded-full border border-white/70"
                      style={{ background: customColor }}
                    />
                  </span>
                </label>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* zoom */}
        <div className="flex items-center gap-0.5 rounded-full border border-line bg-surface px-1 py-1">
          <button
            type="button"
            aria-label="Zoom out"
            title="Zoom out"
            onClick={onZoomOut}
            className="focus-ring grid h-6 w-6 cursor-pointer place-items-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="Reset zoom"
            onClick={onZoomReset}
            className="focus-ring w-14 cursor-pointer rounded-full text-center text-xs font-semibold tabular text-ink transition-colors hover:bg-surface-2"
          >
            {zoomLabel}
          </button>
          <button
            type="button"
            aria-label="Zoom in"
            title="Zoom in"
            onClick={onZoomIn}
            className="focus-ring grid h-6 w-6 cursor-pointer place-items-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        {editable && (
          <Button variant="soft" size="sm" onClick={onAI}>
            <Sparkles className="h-4 w-4" />
            AI
          </Button>
        )}

        {/* export */}
        <div className="relative">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setMenu((value) => (value === 'export' ? null : 'export'))}
          >
            <Download className="h-4 w-4" />
            Export
            <ChevronDown
              className={cn(
                'h-3.5 w-3.5 transition-transform',
                menu === 'export' && 'rotate-180',
              )}
            />
          </Button>

          <AnimatePresence>
            {menu === 'export' && (
              <motion.div
                {...MENU_MOTION}
                role="menu"
                className="card absolute right-0 top-11 z-50 w-44 rounded-2xl p-1.5 shadow-[var(--shadow-lift)]"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    closeMenu()
                    onExportPNG?.()
                  }}
                  className="flex w-full cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-ink"
                >
                  Download PNG
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    closeMenu()
                    onExportSVG?.()
                  }}
                  className="flex w-full cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-ink"
                >
                  Download SVG
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {role === 'owner' && (
          <Button size="sm" onClick={onShare}>
            <Share2 className="h-4 w-4" />
            Share
          </Button>
        )}
      </div>
    </header>
  )
}
