import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowRight,
  BarChart3,
  Circle,
  Diamond,
  Donut,
  Eraser,
  Feather,
  Hand,
  Image as ImageIcon,
  LineChart,
  List,
  Minus,
  MousePointer2,
  Pencil,
  PieChart,
  Smile,
  Square,
  StickyNote,
  Type,
} from 'lucide-react'
import { TOOLS } from '../../lib/canvas'
import { cn } from '../../lib/utils'

const TOOLS_LIST = [
  { id: TOOLS.select, label: 'Select', Icon: MousePointer2, key: 'V' },
  { id: TOOLS.pan, label: 'Pan', Icon: Hand, key: 'H' },
  { id: TOOLS.text, label: 'Text', Icon: Type, key: 'T' },
  { id: TOOLS.hand, label: 'Handwriting', Icon: Feather, key: 'G' },
  { id: TOOLS.sticky, label: 'Sticky', Icon: StickyNote, key: 'S' },
  { id: TOOLS.bullet, label: 'Bullet list', Icon: List, key: 'B' },
  { id: TOOLS.rect, label: 'Rectangle', Icon: Square, key: 'R' },
  { id: TOOLS.ellipse, label: 'Ellipse', Icon: Circle, key: 'O' },
  { id: TOOLS.diamond, label: 'Diamond', Icon: Diamond, key: 'D' },
  { id: TOOLS.line, label: 'Line', Icon: Minus, key: 'L' },
  { id: TOOLS.arrow, label: 'Arrow', Icon: ArrowRight, key: 'A' },
  { id: TOOLS.draw, label: 'Draw', Icon: Pencil, key: 'P' },
  { id: TOOLS.eraser, label: 'Eraser', Icon: Eraser, key: 'E' },
]

const CHARTS = [
  { id: 'bar', label: 'Bar', Icon: BarChart3 },
  { id: 'line', label: 'Line', Icon: LineChart },
  { id: 'pie', label: 'Pie', Icon: PieChart },
  { id: 'donut', label: 'Donut', Icon: Donut },
]

const BUTTON =
  'group relative grid h-10 w-10 cursor-pointer place-items-center rounded-xl transition-colors focus-ring disabled:pointer-events-none disabled:opacity-40'

function Divider() {
  return <div className="my-1 h-px w-full bg-line" />
}

/** Floating vertical tool rail on the left edge of the canvas. */
export default function Toolbar({
  tool,
  setTool,
  disabled = false,
  onInsertImage,
  onInsertChart,
  onInsertEmoji,
}) {
  const [chartOpen, setChartOpen] = useState(false)
  const railRef = useRef(null)

  useEffect(() => {
    if (!chartOpen) return undefined

    const onPointerDown = (event) => {
      if (railRef.current && !railRef.current.contains(event.target)) setChartOpen(false)
    }
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setChartOpen(false)
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [chartOpen])

  const renderTool = (item) => {
    const active = tool === item.id
    const { Icon } = item
    return (
      <button
        key={item.id}
        type="button"
        title={`${item.label} · ${item.key}`}
        aria-label={item.label}
        aria-pressed={active}
        disabled={disabled}
        onClick={() => setTool?.(item.id)}
        className={cn(
          BUTTON,
          active
            ? 'brand-gradient text-white shadow-[var(--shadow-brand)]'
            : 'text-muted hover:bg-surface-2',
        )}
      >
        <Icon className="h-[18px] w-[18px]" />
        <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap rounded-lg bg-ink px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow-[var(--shadow-soft)] transition-opacity group-hover:opacity-100">
          {item.label}
          <kbd className="ml-1.5 rounded bg-white/15 px-1 py-px font-sans text-[10px]">
            {item.key}
          </kbd>
        </span>
      </button>
    )
  }

  return (
    <div
      ref={railRef}
      className="absolute left-4 top-1/2 z-30 -translate-y-1/2"
    >
      <div className="card flex flex-col gap-1 rounded-2xl p-1.5">
        {TOOLS_LIST.slice(0, 2).map(renderTool)}
        <Divider />
        {TOOLS_LIST.slice(2, 6).map(renderTool)}
        <Divider />
        {TOOLS_LIST.slice(6, 11).map(renderTool)}
        <Divider />
        {TOOLS_LIST.slice(11).map(renderTool)}

        <Divider />

        {/* inserts */}
        <button
          type="button"
          title="Emoji"
          aria-label="Insert emoji"
          disabled={disabled}
          onClick={onInsertEmoji}
          className={cn(BUTTON, 'text-muted hover:bg-surface-2')}
        >
          <Smile className="h-[18px] w-[18px]" />
        </button>

        <button
          type="button"
          title="Image"
          aria-label="Insert image"
          disabled={disabled}
          onClick={onInsertImage}
          className={cn(BUTTON, 'text-muted hover:bg-surface-2')}
        >
          <ImageIcon className="h-[18px] w-[18px]" />
        </button>

        <div className="relative">
          <button
            type="button"
            title="Chart"
            aria-label="Insert chart"
            aria-haspopup="menu"
            aria-expanded={chartOpen}
            disabled={disabled}
            onClick={() => setChartOpen((value) => !value)}
            className={cn(BUTTON, chartOpen ? 'bg-surface-2 text-ink' : 'text-muted hover:bg-surface-2')}
          >
            <BarChart3 className="h-[18px] w-[18px]" />
          </button>

          <AnimatePresence>
            {chartOpen && (
              <motion.div
                role="menu"
                initial={{ opacity: 0, x: -6, scale: 0.97 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: -6, scale: 0.97 }}
                transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                className="card absolute left-full top-1/2 z-50 ml-2 w-36 -translate-y-1/2 rounded-2xl p-1.5 shadow-[var(--shadow-lift)]"
              >
                {CHARTS.map(({ id, label, Icon }) => (
                  <button
                    key={id}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setChartOpen(false)
                      onInsertChart?.(id)
                    }}
                    className="flex w-full cursor-pointer items-center gap-2 rounded-xl px-2.5 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-ink"
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
