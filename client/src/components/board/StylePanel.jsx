import { useState } from 'react'
import {
  FILL_COLORS,
  FONT_SIZES,
  STROKE_COLORS,
  STROKE_WIDTHS,
  fontFamilyFor,
} from '../../lib/canvas'
import { cn } from '../../lib/utils'

const STROKE_TARGETS = ['rect', 'ellipse', 'diamond', 'line', 'arrow', 'draw']
const FILL_TARGETS = ['rect', 'ellipse', 'diamond', 'sticky']
const SKETCH_TARGETS = ['rect', 'ellipse', 'diamond', 'line', 'arrow']
const TEXT_TARGETS = ['text', 'bullet']
const RICH_TEXT_TARGETS = ['text', 'bullet', 'sticky']

const BULLETS = [
  { value: 'disc', label: '•' },
  { value: 'decimal', label: '1.' },
  { value: 'none', label: '∅' },
]

const CHECKER_STYLE = {
  backgroundImage:
    'linear-gradient(45deg,#e0dfef 25%,transparent 25%), linear-gradient(-45deg,#e0dfef 25%,transparent 25%), linear-gradient(45deg,transparent 75%,#e0dfef 75%), linear-gradient(-45deg,transparent 75%,#e0dfef 75%)',
  backgroundSize: '8px 8px',
  backgroundPosition: '0 0, 0 4px, 4px -4px, -4px 0px',
  backgroundColor: '#ffffff',
}

const RAINBOW_STYLE = {
  background:
    'conic-gradient(#f43f5e, #f59e0b, #22c55e, #3b82f6, #a855f7, #f43f5e)',
}

const CHIP = 'h-6 w-6 shrink-0 cursor-pointer rounded-full border border-black/5 transition-transform hover:scale-110 focus-ring'
const TOGGLE =
  'grid h-7 cursor-pointer place-items-center rounded-lg px-2.5 text-muted transition-colors focus-ring'

function Group({ label, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[9px] font-semibold uppercase tracking-wider text-faint">{label}</span>
      <div className="flex items-center gap-1.5">{children}</div>
    </div>
  )
}

/** Rainbow chip that opens the native color picker for a palette group. */
function CustomColor({ value, onPick }) {
  return (
    <label
      title="Custom color"
      className={cn(CHIP, 'relative grid place-items-center ring-offset-1')}
      style={RAINBOW_STYLE}
    >
      <input
        type="color"
        value={value}
        onChange={(event) => onPick(event.target.value)}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
      <span className="h-2 w-2 rounded-full bg-white/90" />
    </label>
  )
}

/**
 * Floating contextual style bar: shows only the controls that apply to the
 * active tool or the current selection, and mirrors every change into the
 * pending style plus (when a selection exists) into the selection itself.
 */
export default function StylePanel({
  tool,
  style,
  setStyle,
  selected,
  onApply,
  onSetFont,
}) {
  const s = style || {}

  const selectedType = Array.isArray(selected)
    ? selected[0]?.type
    : selected && typeof selected === 'object'
      ? selected.type
      : undefined
  const hasSelection = Array.isArray(selected) ? selected.length > 0 : Boolean(selected)

  const target = selectedType || tool || 'select'

  const fontSize = s.fontSize ?? 16
  const [sizeText, setSizeText] = useState(String(fontSize))
  const [lastFontSize, setLastFontSize] = useState(fontSize)
  if (fontSize !== lastFontSize) {
    setLastFontSize(fontSize)
    setSizeText(String(fontSize))
  }

  if (!target) return null

  const showStroke = STROKE_TARGETS.includes(target)
  const showTextColor = TEXT_TARGETS.includes(target)
  const showFill = FILL_TARGETS.includes(target)
  const showSketch = SKETCH_TARGETS.includes(target)
  const showBullets = target === 'bullet'
  const showRichText = RICH_TEXT_TARGETS.includes(target)

  if (
    !showStroke &&
    !showTextColor &&
    !showFill &&
    !showSketch &&
    !showBullets &&
    !showRichText
  ) {
    return null
  }

  /** Update the pending style and, when something is selected, apply it live. */
  const apply = (patch) => {
    setStyle?.(patch)
    if (hasSelection) onApply?.(patch)
  }

  const handleFont = (font) => {
    if (onSetFont) onSetFont(font)
    else setStyle?.({ font })
    if (hasSelection) onApply?.({ font })
  }

  const commitSize = (raw) => {
    const parsed = Math.round(Number(raw))
    if (!Number.isFinite(parsed)) {
      setSizeText(String(fontSize))
      return
    }
    const clamped = Math.min(400, Math.max(6, parsed))
    setSizeText(String(clamped))
    if (clamped !== fontSize) apply({ fontSize: clamped })
  }

  const strokeColor = s.stroke ?? s.color ?? STROKE_COLORS[0]
  const textColor = s.color ?? STROKE_COLORS[0]
  const fillColor = s.fill ?? 'transparent'
  const strokeWidth = s.strokeWidth ?? 2
  const bulletStyle = s.bulletStyle || 'disc'
  const isHand = s.font === 'hand'

  return (
    <div className="card absolute left-1/2 top-16 z-30 flex -translate-x-1/2 flex-wrap items-center gap-3 rounded-2xl px-3 py-2">
      {showStroke && (
        <Group label="Stroke">
          {STROKE_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              title={color}
              onClick={() => apply({ stroke: color, color })}
              className={cn(
                CHIP,
                strokeColor === color && 'ring-2 ring-brand-300 ring-offset-1',
              )}
              style={{ background: color }}
            />
          ))}
          <CustomColor value={strokeColor} onPick={(color) => apply({ stroke: color, color })} />
        </Group>
      )}

      {showTextColor && (
        <Group label="Text">
          {STROKE_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              title={color}
              onClick={() => apply({ color })}
              className={cn(CHIP, textColor === color && 'ring-2 ring-brand-300 ring-offset-1')}
              style={{ background: color }}
            />
          ))}
          <CustomColor value={textColor} onPick={(color) => apply({ color })} />
        </Group>
      )}

      {showFill && (
        <Group label="Fill">
          {FILL_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              title={color === 'transparent' ? 'No fill' : color}
              onClick={() => apply({ fill: color })}
              className={cn(
                CHIP,
                fillColor === color && 'ring-2 ring-brand-300 ring-offset-1',
              )}
              style={color === 'transparent' ? CHECKER_STYLE : { background: color }}
            />
          ))}
          <CustomColor
            value={fillColor === 'transparent' ? '#ffffff' : fillColor}
            onPick={(color) => apply({ fill: color })}
          />
        </Group>
      )}

      {showStroke && (
        <Group label="Width">
          {STROKE_WIDTHS.map((width) => (
            <button
              key={width}
              type="button"
              title={`${width}px`}
              onClick={() => apply({ strokeWidth: width })}
              className={cn(
                'grid h-7 w-7 cursor-pointer place-items-center rounded-lg transition-colors focus-ring',
                strokeWidth === width ? 'bg-brand-50 ring-2 ring-brand-300' : 'hover:bg-surface-2',
              )}
            >
              <span
                className="block rounded-full bg-ink"
                style={{ width: width + 2, height: width + 2 }}
              />
            </button>
          ))}
        </Group>
      )}

      {showSketch && (
        <Group label="Style">
          <button
            type="button"
            title="Solid"
            onClick={() => apply({ sketch: false })}
            className={cn(
              TOGGLE,
              !s.sketch ? 'bg-brand-50 text-brand-700 ring-2 ring-brand-300' : 'hover:bg-surface-2',
            )}
          >
            <svg width="22" height="8" viewBox="0 0 22 8" aria-hidden="true">
              <path d="M1 4h20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
          <button
            type="button"
            title="Hand-drawn"
            onClick={() => apply({ sketch: true })}
            className={cn(
              TOGGLE,
              s.sketch ? 'bg-brand-50 text-brand-700 ring-2 ring-brand-300' : 'hover:bg-surface-2',
            )}
          >
            <svg width="22" height="8" viewBox="0 0 22 8" aria-hidden="true">
              <path
                d="M1 5.5c3-5 5 1.5 8-1.5s5 3 8-1"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </Group>
      )}

      {showBullets && (
        <Group label="Bullets">
          {BULLETS.map((bullet) => (
            <button
              key={bullet.value}
              type="button"
              title={bullet.value}
              onClick={() => apply({ bulletStyle: bullet.value })}
              className={cn(
                'grid h-7 min-w-7 cursor-pointer place-items-center rounded-lg px-1.5 text-sm font-semibold transition-colors focus-ring',
                bulletStyle === bullet.value
                  ? 'bg-brand-50 text-brand-700 ring-2 ring-brand-300'
                  : 'text-muted hover:bg-surface-2',
              )}
            >
              {bullet.label}
            </button>
          ))}
        </Group>
      )}

      {showRichText && (
        <>
          <Group label="Font">
            <button
              type="button"
              title="Sans"
              onClick={() => handleFont('sans')}
              className={cn(
                TOGGLE,
                !isHand ? 'bg-brand-50 text-brand-700 ring-2 ring-brand-300' : 'hover:bg-surface-2',
              )}
            >
              <span className="text-xs font-semibold">Aa</span>
            </button>
            <button
              type="button"
              title="Handwriting"
              onClick={() => handleFont('hand')}
              className={cn(
                TOGGLE,
                isHand ? 'bg-brand-50 text-brand-700 ring-2 ring-brand-300' : 'hover:bg-surface-2',
              )}
            >
              <span className="text-sm" style={{ fontFamily: fontFamilyFor('hand') }}>
                Aa
              </span>
            </button>
          </Group>

          <Group label="Size">
            {FONT_SIZES.map((size) => (
              <button
                key={size}
                type="button"
                title={`${size}px`}
                onClick={() => {
                  setSizeText(String(size))
                  apply({ fontSize: size })
                }}
                className={cn(
                  'h-7 cursor-pointer rounded-lg px-2 text-xs font-semibold tabular transition-colors focus-ring',
                  fontSize === size
                    ? 'bg-brand-50 text-brand-700 ring-2 ring-brand-300'
                    : 'text-muted hover:bg-surface-2',
                )}
              >
                {size}
              </button>
            ))}
            <input
              type="number"
              min={6}
              max={400}
              value={sizeText}
              aria-label="Font size"
              onChange={(event) => {
                setSizeText(event.target.value)
                const parsed = Math.round(Number(event.target.value))
                if (event.target.value !== '' && Number.isFinite(parsed)) {
                  const clamped = Math.min(400, Math.max(6, parsed))
                  if (clamped !== fontSize) apply({ fontSize: clamped })
                }
              }}
              onBlur={() => commitSize(sizeText)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur()
              }}
              className="focus-ring h-7 w-16 rounded-lg border border-line bg-surface px-2 text-center text-xs font-semibold tabular text-ink outline-none"
            />
          </Group>
        </>
      )}
    </div>
  )
}
