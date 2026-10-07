import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { fontFamilyFor, worldToScreen } from '../../lib/canvas'

const INK = '#16161d'
const SHAPE_TYPES = ['rect', 'ellipse', 'diamond']

/** Current field of an element, as editable plain text. */
function readValue(element) {
  const d = element?.data || {}
  if (element?.type === 'bullet') return (d.items || []).join('\n')
  if (SHAPE_TYPES.includes(element?.type)) return d.label ?? ''
  return d.text ?? ''
}

/** The patch that stores `value` back onto the element. */
function patchFor(type, value) {
  if (type === 'bullet') return { items: value.split('\n') }
  if (SHAPE_TYPES.includes(type)) return { label: value }
  return { text: value }
}

/**
 * Screen-space textarea laid over an element while it is being edited.
 * The element's own text is hidden by <ElementRenderer editing/>, so this is
 * the only visible copy: it tracks the camera (position, size, font size).
 *
 * onLocalChange(patch) -> live local edits (never persisted)
 * onCommit(patch|null) -> blur: final patch, or null to delete the element
 */
export default function EditingOverlay({ element, camera, onLocalChange, onCommit }) {
  const ref = useRef(null)
  const data = element?.data || {}
  const type = element?.type || 'text'

  const isShape = SHAPE_TYPES.includes(type)
  const isBullet = type === 'bullet'
  const isText = type === 'text'
  const isSticky = type === 'sticky'
  const autoGrow = isText || isBullet || isShape

  const zoom = camera?.zoom || 1
  const [value, setValue] = useState(() => readValue(element))
  const [measured, setMeasured] = useState(0)

  const fontSizeBase =
    type === 'text'
      ? data.fontSize || 20
      : type === 'sticky' || isBullet
        ? data.fontSize || 16
        : data.font === 'hand'
          ? 16
          : 14
  const fontSize = fontSizeBase * zoom
  const lineHeight = isBullet ? 1.5 : isSticky && data.font === 'hand' ? 1.15 : isShape ? 1.3 : 1.35

  const boxW = (data.w || (isShape ? 140 : type === 'sticky' ? 190 : isBullet ? 280 : 260)) * zoom
  const boxH = (data.h || 0) * zoom

  const { x: sx, y: sy } = worldToScreen(data.x || 0, data.y || 0, camera)
  // Shapes centre their label: nudge the box down inside the element bounds.
  const top = isShape && boxH ? sy + Math.max(0, (boxH - measured) / 2) : sy

  // Focus *after* the browser's mousedown default action: focusing during
  // pointer-down would let the click steal focus back, firing an immediate
  // blur (commit) the moment the editor opens.
  useEffect(() => {
    const node = ref.current
    if (!node) return undefined
    const timer = setTimeout(() => {
      node.focus({ preventScroll: true })
      try {
        node.setSelectionRange(node.value.length, node.value.length)
      } catch {
        // selection is best-effort (some input types refuse it)
      }
    }, 0)
    return () => clearTimeout(timer)
  }, [])

  // Auto-grow: measure, then (for text/bullet) report the new world height.
  useLayoutEffect(() => {
    const node = ref.current
    if (!node || !autoGrow) return

    // 0px (not "auto") so scrollHeight is pure content height, unaffected by
    // the textarea's default rows.
    node.style.height = '0px'
    const next = node.scrollHeight
    if (Math.abs(next - measured) > 0.5) setMeasured(next)
    node.style.height = `${next}px`
  }, [value, zoom, autoGrow, measured])

  useEffect(() => {
    if (!autoGrow || isShape || !measured) return
    const h = measured / zoom
    if (Math.abs(h - (data.h || 0)) > 0.5) onLocalChange?.({ h })
  }, [measured, zoom, data.h, autoGrow, isShape, onLocalChange])

  const handleChange = (event) => {
    const next = event.target.value
    setValue(next)
    onLocalChange?.(patchFor(type, next))
  }

  const handleBlur = () => {
    const node = ref.current
    const next = node ? node.value : value

    if (isBullet) {
      const items = next.split('\n')
      while (items.length && !items[items.length - 1].trim()) items.pop()
      if (!items.some((line) => line.trim())) return onCommit?.(null)
      const patch = { items }
      if (measured) patch.h = measured / zoom
      return onCommit?.(patch)
    }

    if (isText) {
      if (!next.trim()) return onCommit?.(null)
      const patch = { text: next }
      if (measured) patch.h = measured / zoom
      return onCommit?.(patch)
    }

    // Sticky notes and shape labels are visible objects: always keep them.
    return onCommit?.(patchFor(type, next))
  }

  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      event.preventDefault()
      event.currentTarget.blur()
    }
  }

  const style = {
    position: 'absolute',
    left: sx,
    top,
    width: boxW,
    height: isSticky ? boxH : measured || undefined,
    margin: 0,
    padding: isSticky
      ? 14 * zoom
      : isBullet
        ? `0 0 0 ${fontSize * 1.2}px`
        : isShape
          ? 8 * zoom
          : 0,
    border: isSticky ? '1px solid rgba(22,22,29,0.06)' : 'none',
    borderRadius: isSticky ? 10 * zoom : 4,
    background: isSticky ? data.fill || '#fde68a' : 'transparent',
    color: isSticky || isShape ? INK : data.color || INK,
    fontFamily: fontFamilyFor(data.font),
    fontSize,
    fontWeight: isText ? data.weight || 500 : isShape ? 600 : 400,
    lineHeight,
    textAlign: isShape ? 'center' : 'left',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    overflow: 'hidden',
    resize: 'none',
    outline: 'none',
    boxSizing: 'border-box',
    caretColor: '#2f8159',
    boxShadow: isSticky ? 'none' : undefined,
    display: 'block',
  }

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      spellCheck={false}
      style={style}
    />
  )
}
