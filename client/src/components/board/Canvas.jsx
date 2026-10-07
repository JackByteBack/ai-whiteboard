import { useEffect, useMemo, useRef, useState } from 'react'
import {
  TOOLS,
  boundsIntersectRect,
  diamondPoints,
  getBounds,
  hitTest,
  resizedData,
  screenToWorld,
  strokeToPath,
  translatedData,
} from '../../lib/canvas'
import EditingOverlay from './EditingOverlay'
import ElementRenderer from './ElementRenderer'

/**
 * The interactive SVG surface.
 *
 * Contract with the board page:
 *  - `elements`/`setElements` are the source of truth; Canvas mutates them
 *    locally for every gesture and only calls `persist` at gesture end
 *    (motion meanwhile streams over `emitLive` / `emitCursor`).
 *  - `persist.create(type, data)` performs the server write ONLY — Canvas has
 *    already added the element locally and will remap to the returned `id`.
 *  - `persist.update(id, { data })` / `persist.remove(id)` save or delete.
 *  - `onCheckpoint()` is called before each mutating gesture (undo/redo).
 */

const INK = '#16161d'
const BRAND = '#2f8159'
const MIN_ZOOM = 0.15
const MAX_ZOOM = 5
const CURSOR_THROTTLE = 45 // ms between collaborator cursor packets
const LIVE_THROTTLE = 50 // ms between live element updates while dragging

const EDITABLE_TYPES = new Set(['text', 'sticky', 'bullet', 'rect', 'ellipse', 'diamond'])
const LINE_TYPES = new Set(['line', 'arrow'])
const TRANSFORM_KINDS = new Set(['move', 'resize', 'rotate', 'endpoint'])

const HANDLES = [
  ['nw', 0, 0],
  ['n', 0.5, 0],
  ['ne', 1, 0],
  ['e', 1, 0.5],
  ['se', 1, 1],
  ['s', 0.5, 1],
  ['sw', 0, 1],
  ['w', 0, 0.5],
]

const HANDLE_CURSOR = {
  nw: 'nwse-resize',
  se: 'nwse-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
}

const isTypingTarget = (target) =>
  Boolean(target) &&
  (target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'BUTTON' ||
    target.tagName === 'A' ||
    target.isContentEditable)

const newId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `el-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

const normalizeRect = (x0, y0, x1, y1) => ({
  x: Math.min(x0, x1),
  y: Math.min(y0, y1),
  w: Math.abs(x1 - x0),
  h: Math.abs(y1 - y0),
})

/** Union of element bounds (min 1px, so handles always have a box). */
function unionBounds(list) {
  if (!list?.length) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const element of list) {
    const b = getBounds(element)
    if (b.x < minX) minX = b.x
    if (b.y < minY) minY = b.y
    if (b.x + b.w > maxX) maxX = b.x + b.w
    if (b.y + b.h > maxY) maxY = b.y + b.h
  }
  return { x: minX, y: minY, w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY) }
}

/** In-progress previews, drawn in world space inside the camera group. */
function draftSvg(draft, style, z) {
  if (!draft) return null

  if (draft.kind === 'marquee') {
    return (
      <rect
        x={draft.x}
        y={draft.y}
        width={draft.w}
        height={draft.h}
        fill="rgba(47,129,89,0.08)"
        stroke={BRAND}
        strokeWidth={1 / z}
        strokeDasharray={`${4 / z} ${4 / z}`}
      />
    )
  }

  if (draft.kind === 'shape') {
    const fill = style.fill && style.fill !== 'transparent' ? style.fill : 'rgba(47,129,89,0.07)'
    const common = {
      fill,
      stroke: style.stroke || INK,
      strokeWidth: style.strokeWidth || 2,
      strokeDasharray: `${6 / z} ${4 / z}`,
      strokeLinejoin: 'round',
    }
    if (draft.type === 'ellipse') {
      return (
        <ellipse
          cx={draft.x + draft.w / 2}
          cy={draft.y + draft.h / 2}
          rx={draft.w / 2}
          ry={draft.h / 2}
          {...common}
        />
      )
    }
    if (draft.type === 'diamond') {
      const points = diamondPoints(draft)
        .map(([px, py]) => `${px},${py}`)
        .join(' ')
      return <polygon points={points} {...common} />
    }
    return <rect x={draft.x} y={draft.y} width={draft.w} height={draft.h} rx={8} {...common} />
  }

  if (draft.kind === 'line') {
    return (
      <line
        x1={draft.x1}
        y1={draft.y1}
        x2={draft.x2}
        y2={draft.y2}
        stroke={style.stroke || INK}
        strokeWidth={style.strokeWidth || 2}
        strokeLinecap="round"
        strokeDasharray={`${5 / z} ${4 / z}`}
      />
    )
  }

  if (draft.kind === 'draw') {
    return (
      <path
        d={strokeToPath(draft.points, style.strokeWidth || 4)}
        fill={style.stroke || INK}
        stroke="none"
      />
    )
  }

  return null
}

/** Dashed brand box + constant-screen-size handles around the selection. */
function SelectionOverlay({ selected, camera, onHandleDown }) {
  const box = useMemo(() => unionBounds(selected), [selected])
  if (!box) return null

  const z = camera.zoom || 1
  const sw = 1.5 / z
  const hs = 8 / z
  const dash = `${6 / z} ${4 / z}`
  const isSingleLine = selected.length === 1 && LINE_TYPES.has(selected[0].type)

  if (isSingleLine) {
    const d = selected[0].data
    return (
      <g>
        <line
          x1={d.x1}
          y1={d.y1}
          x2={d.x2}
          y2={d.y2}
          stroke={BRAND}
          strokeOpacity={0.55}
          strokeWidth={sw}
          strokeDasharray={dash}
          style={{ pointerEvents: 'none' }}
        />
        {[
          [d.x1, d.y1, 0],
          [d.x2, d.y2, 1],
        ].map(([px, py, index]) => (
          <circle
            key={index}
            cx={px}
            cy={py}
            r={hs * 0.7}
            fill="#ffffff"
            stroke={BRAND}
            strokeWidth={sw}
            style={{ pointerEvents: 'all', cursor: 'pointer' }}
            data-overlay="1"
            onPointerDown={(event) => onHandleDown(event, 'endpoint', null, index)}
          />
        ))}
      </g>
    )
  }

  const midX = box.x + box.w / 2

  return (
    <g>
      <rect
        x={box.x}
        y={box.y}
        width={box.w}
        height={box.h}
        fill="none"
        stroke={BRAND}
        strokeWidth={sw}
        strokeDasharray={dash}
        style={{ pointerEvents: 'none' }}
      />
      {HANDLES.map(([dir, fx, fy]) => {
        const hx = box.x + box.w * fx
        const hy = box.y + box.h * fy
        return (
          <rect
            key={dir}
            x={hx - hs / 2}
            y={hy - hs / 2}
            width={hs}
            height={hs}
            rx={hs * 0.24}
            fill="#ffffff"
            stroke={BRAND}
            strokeWidth={sw}
            style={{ pointerEvents: 'all', cursor: HANDLE_CURSOR[dir] }}
            data-overlay="1"
            onPointerDown={(event) => onHandleDown(event, 'resize', dir)}
          />
        )
      })}
      <line
        x1={midX}
        y1={box.y}
        x2={midX}
        y2={box.y - 26 / z}
        stroke={BRAND}
        strokeWidth={sw}
        style={{ pointerEvents: 'none' }}
      />
      <circle
        cx={midX}
        cy={box.y - 26 / z}
        r={5 / z}
        fill="#ffffff"
        stroke={BRAND}
        strokeWidth={sw}
        style={{ pointerEvents: 'all', cursor: 'grab' }}
        data-overlay="1"
        onPointerDown={(event) => onHandleDown(event, 'rotate')}
      />
    </g>
  )
}

export default function Canvas({
  elements = [],
  setElements,
  tool,
  setTool,
  style = {},
  camera,
  setCamera,
  selectedIds = [],
  setSelectedIds,
  editingId = null,
  setEditingId,
  canEdit = true,
  background = 'dots',
  bgColor = '#ffffff',
  persist = {},
  emitLive,
  emitCursor,
  onRequestChartEdit,
  onCheckpoint,
}) {
  const svgRef = useRef(null)
  const gestureRef = useRef(null)
  const elementsRef = useRef(elements)
  const spaceRef = useRef(false)
  const editingRef = useRef(editingId)
  const cursorAtRef = useRef(0)
  const liveAtRef = useRef(0)

  const [spaceDown, setSpaceDown] = useState(false)
  const [panning, setPanning] = useState(false)
  const [draft, setDraft] = useState(null)

  const z = camera.zoom || 1
  const selected = useMemo(
    () => (selectedIds.length ? elements.filter((el) => selectedIds.includes(el.id)) : []),
    [elements, selectedIds],
  )
  const editingElement = editingId ? elements.find((el) => el.id === editingId) : null

  useEffect(() => {
    elementsRef.current = elements
  }, [elements])

  useEffect(() => {
    editingRef.current = editingId
  }, [editingId])

  /* ------------------------------------------------------------ helpers -- */

  const updateElements = (next) => {
    elementsRef.current = next
    setElements(next)
  }

  const report = (label, error) => console.warn(`[canvas] ${label} failed:`, error)

  const run = (result, label) => {
    if (result && typeof result.then === 'function') result.catch((error) => report(label, error))
    return result
  }

  const persistUpdate = (id, data) => {
    try {
      run(persist.update?.(id, { data }), 'save')
    } catch (error) {
      report('save', error)
    }
  }

  const persistRemove = (id) => {
    try {
      run(persist.remove?.(id), 'delete')
    } catch (error) {
      report('delete', error)
    }
  }

  /** Local-first create; remaps to the server id when the write resolves. */
  const createEl = (type, data) => {
    const el = { id: newId(), type, data }
    updateElements([...elementsRef.current, el])

    let result
    try {
      result = persist.create?.(type, data)
    } catch (error) {
      report('create', error)
      return el
    }

    if (result && typeof result.then === 'function') {
      result
        .then((created) => {
          const serverId = created?.id || created?.element?.id
          if (!serverId || serverId === el.id) return
          elementsRef.current = elementsRef.current.map((x) =>
            x.id === el.id ? { ...x, id: serverId } : x,
          )
          setElements(elementsRef.current)
          setSelectedIds((prev) => prev.map((id) => (id === el.id ? serverId : id)))
          setEditingId((prev) => (prev === el.id ? serverId : prev))
        })
        .catch((error) => report('create', error))
    }

    return el
  }

  const worldPoint = (event) => {
    const node = svgRef.current
    if (!node) return { x: 0, y: 0 }
    const rect = node.getBoundingClientRect()
    return screenToWorld(event.clientX - rect.left, event.clientY - rect.top, camera)
  }

  const pickElement = (wx, wy) => {
    const tol = 6 / z
    const list = elementsRef.current
    for (let i = list.length - 1; i >= 0; i -= 1) {
      const el = list[i]
      if (el.id === editingId) continue
      if (hitTest(el, wx, wy, tol)) return el
    }
    return null
  }

  const maybeEmitCursor = (point) => {
    if (!emitCursor) return
    const now = performance.now()
    if (now - cursorAtRef.current < CURSOR_THROTTLE) return
    cursorAtRef.current = now
    emitCursor(point.x, point.y)
  }

  const emitLiveBatch = (updates, force = false) => {
    if (!emitLive || !updates.length) return
    const now = performance.now()
    if (!force && now - liveAtRef.current < LIVE_THROTTLE) return
    liveAtRef.current = now
    for (const update of updates) emitLive({ id: update.id, type: update.type, data: update.data })
  }

  /** Move a gesture's snapshot onto the board + (optionally) to collaborators. */
  const applyUpdates = (gesture, updates) => {
    if (!updates.length) return
    const map = new Map(updates.map((update) => [update.id, update.data]))
    updateElements(
      elementsRef.current.map((el) => (map.has(el.id) ? { ...el, data: map.get(el.id) } : el)),
    )
    for (const update of updates) gesture.final.set(update.id, update.data)
    emitLiveBatch(updates)
  }

  const startTransform = (kind, ids, point, extra = {}) => {
    const snapshot = elementsRef.current
      .filter((el) => ids.includes(el.id))
      .map((el) => ({ id: el.id, type: el.type, data: { ...el.data } }))
    if (!snapshot.length) return

    onCheckpoint?.()
    gestureRef.current = {
      kind,
      snapshot,
      wx: point.x,
      wy: point.y,
      box: unionBounds(snapshot),
      final: new Map(snapshot.map((item) => [item.id, item.data])),
      ...extra,
    }
  }

  const eraseAt = (wx, wy) => {
    const list = elementsRef.current
    const tol = 6 / z
    let hit = null
    for (let i = list.length - 1; i >= 0; i -= 1) {
      if (hitTest(list[i], wx, wy, tol)) {
        hit = list[i]
        break
      }
    }
    if (!hit) return false

    const gesture = gestureRef.current
    if (gesture?.kind === 'erase' && !gesture.checkpointed) {
      gesture.checkpointed = true
      onCheckpoint?.()
    }

    updateElements(list.filter((el) => el.id !== hit.id))
    setSelectedIds((prev) => (prev.includes(hit.id) ? prev.filter((id) => id !== hit.id) : prev))
    persistRemove(hit.id)
    return true
  }

  const selectDown = (event, point) => {
    const hit = pickElement(point.x, point.y)

    if (hit) {
      const already = selectedIds.includes(hit.id)

      if (event.shiftKey && already) {
        setSelectedIds((prev) => prev.filter((id) => id !== hit.id))
        return
      }

      let ids
      if (event.shiftKey) {
        ids = [...selectedIds, hit.id]
        setSelectedIds(ids)
      } else {
        ids = already ? selectedIds : [hit.id]
        if (!already) setSelectedIds(ids)
      }

      if (!canEdit || editingId) return
      startTransform('move', ids, point)
      return
    }

    if (!event.shiftKey) setSelectedIds([])
    gestureRef.current = {
      kind: 'marquee',
      base: event.shiftKey ? selectedIds : [],
      wx: point.x,
      wy: point.y,
    }
    setDraft({ kind: 'marquee', x: point.x, y: point.y, w: 0, h: 0 })
  }

  /* ---------------------------------------------------------- pointer ---- */

  const onPointerDown = (event) => {
    if (event.button !== 0 && event.button !== 1) return
    const node = svgRef.current
    if (!node) return
    try {
      node.setPointerCapture(event.pointerId)
    } catch {
      // pointer capture is best-effort (e.g. synthetic events in tests)
    }

    const point = worldPoint(event)

    // pan: middle button, space held, or the pan tool
    if (event.button === 1 || spaceRef.current || tool === TOOLS.pan) {
      gestureRef.current = {
        kind: 'pan',
        clientX: event.clientX,
        clientY: event.clientY,
        camera: { ...camera },
      }
      setPanning(true)
      return
    }

    if (event.button !== 0) return

    if (tool === TOOLS.eraser) {
      if (!canEdit) return
      gestureRef.current = { kind: 'erase', checkpointed: false }
      eraseAt(point.x, point.y)
      return
    }

    if (tool === TOOLS.select) {
      selectDown(event, point)
      return
    }

    if (!canEdit) return

    if (tool === TOOLS.text || tool === TOOLS.hand) {
      const hand = tool === TOOLS.hand
      onCheckpoint?.()
      const el = createEl('text', {
        x: point.x,
        y: point.y,
        w: hand ? 300 : 260,
        text: '',
        fontSize: hand ? Math.max(style.fontSize || 0, 28) : style.fontSize || 24,
        color: '#16161d',
        ...(hand ? { font: 'hand' } : {}),
      })
      setSelectedIds([el.id])
      setEditingId(el.id)
      return
    }

    if (tool === TOOLS.sticky) {
      onCheckpoint?.()
      const el = createEl('sticky', {
        x: point.x,
        y: point.y,
        w: 190,
        h: 190,
        text: '',
        fill: style.fill && style.fill !== 'transparent' ? style.fill : '#fde68a',
        fontSize: 16,
      })
      setSelectedIds([el.id])
      setEditingId(el.id)
      return
    }

    if (tool === TOOLS.bullet) {
      onCheckpoint?.()
      const el = createEl('bullet', {
        x: point.x,
        y: point.y,
        w: 280,
        items: ['Item'],
        fontSize: 16,
        color: '#16161d',
        bulletStyle: style.bulletStyle || 'disc',
      })
      setSelectedIds([el.id])
      setEditingId(el.id)
      return
    }

    if (tool === TOOLS.rect || tool === TOOLS.ellipse || tool === TOOLS.diamond) {
      onCheckpoint?.()
      gestureRef.current = { kind: 'shape', type: tool, wx: point.x, wy: point.y }
      setDraft({ kind: 'shape', type: tool, x: point.x, y: point.y, w: 0, h: 0 })
      return
    }

    if (tool === TOOLS.line || tool === TOOLS.arrow) {
      onCheckpoint?.()
      gestureRef.current = { kind: 'line', type: tool, wx: point.x, wy: point.y }
      setDraft({ kind: 'line', type: tool, x1: point.x, y1: point.y, x2: point.x, y2: point.y })
      return
    }

    if (tool === TOOLS.draw) {
      onCheckpoint?.()
      const points = [[point.x, point.y, event.pressure || 0.5]]
      gestureRef.current = { kind: 'draw', points }
      setDraft({ kind: 'draw', points: points.slice() })
    }
  }

  const onPointerMove = (event) => {
    const point = worldPoint(event)
    maybeEmitCursor(point)

    const gesture = gestureRef.current
    if (!gesture) return

    switch (gesture.kind) {
      case 'pan':
        setCamera({
          ...gesture.camera,
          x: gesture.camera.x + (event.clientX - gesture.clientX),
          y: gesture.camera.y + (event.clientY - gesture.clientY),
        })
        break

      case 'erase':
        eraseAt(point.x, point.y)
        break

      case 'marquee': {
        const rect = normalizeRect(gesture.wx, gesture.wy, point.x, point.y)
        setDraft({ kind: 'marquee', ...rect })
        const matches = elementsRef.current
          .filter((el) => boundsIntersectRect(el, rect))
          .map((el) => el.id)
        setSelectedIds([...new Set([...gesture.base, ...matches])])
        break
      }

      case 'draw': {
        const points = gesture.points
        const last = points[points.length - 1]
        if (Math.hypot(point.x - last[0], point.y - last[1]) < 1.5 / z) break
        points.push([point.x, point.y, event.pressure || 0.5])
        setDraft({ kind: 'draw', points: points.slice() })
        break
      }

      case 'shape':
        setDraft({ kind: 'shape', type: gesture.type, ...normalizeRect(gesture.wx, gesture.wy, point.x, point.y) })
        break

      case 'line':
        setDraft({
          kind: 'line',
          type: gesture.type,
          x1: gesture.wx,
          y1: gesture.wy,
          x2: point.x,
          y2: point.y,
        })
        break

      case 'move': {
        const dx = point.x - gesture.wx
        const dy = point.y - gesture.wy
        applyUpdates(
          gesture,
          gesture.snapshot.map((item) => ({
            id: item.id,
            type: item.type,
            data: translatedData(item, dx, dy),
          })),
        )
        break
      }

      case 'resize': {
        const box0 = gesture.box
        const dx = point.x - gesture.wx
        const dy = point.y - gesture.wy
        const dir = gesture.dir
        let { x, y, w, h } = box0

        if (dir.includes('e')) w = box0.w + dx
        else if (dir.includes('w')) {
          w = box0.w - dx
          x = box0.x + dx
        }
        if (dir.includes('s')) h = box0.h + dy
        else if (dir.includes('n')) {
          h = box0.h - dy
          y = box0.y + dy
        }

        if (w < 8) {
          if (dir.includes('w')) x = box0.x + box0.w - 8
          w = 8
        }
        if (h < 8) {
          if (dir.includes('n')) y = box0.y + box0.h - 8
          h = 8
        }

        const next = { x, y, w, h }
        applyUpdates(
          gesture,
          gesture.snapshot.map((item) => {
            const bounds = getBounds(item)
            const rel =
              box0.w && box0.h
                ? {
                    x: (bounds.x - box0.x) / box0.w,
                    y: (bounds.y - box0.y) / box0.h,
                    w: bounds.w / box0.w,
                    h: bounds.h / box0.h,
                  }
                : { x: 0, y: 0, w: 1, h: 1 }
            const target = {
              x: next.x + rel.x * next.w,
              y: next.y + rel.y * next.h,
              w: Math.max(1, rel.w * next.w),
              h: Math.max(1, rel.h * next.h),
            }
            return { id: item.id, type: item.type, data: resizedData(item, target) }
          }),
        )
        break
      }

      case 'rotate': {
        const box0 = gesture.box
        const cx = box0.x + box0.w / 2
        const cy = box0.y + box0.h / 2
        const start = Math.atan2(gesture.wy - cy, gesture.wx - cx)
        const now = Math.atan2(point.y - cy, point.x - cx)
        const delta = (now - start) * (180 / Math.PI)
        const single = gesture.snapshot.length === 1
        const rad = (delta * Math.PI) / 180

        applyUpdates(
          gesture,
          gesture.snapshot.map((item) => {
            const base = Number(item.data.rotation) || 0
            // Shift snaps the *result* to the 15° grid, not just the delta.
            const rotation = event.shiftKey
              ? Math.round((base + delta) / 15) * 15
              : base + delta
            if (single) return { id: item.id, type: item.type, data: { ...item.data, rotation } }
            const bounds = getBounds(item)
            const bx = bounds.x + bounds.w / 2
            const by = bounds.y + bounds.h / 2
            const nx = cx + (bx - cx) * Math.cos(rad) - (by - cy) * Math.sin(rad)
            const ny = cy + (bx - cx) * Math.sin(rad) + (by - cy) * Math.cos(rad)
            const moved = translatedData(item, nx - bx, ny - by)
            return { id: item.id, type: item.type, data: { ...moved, rotation } }
          }),
        )
        break
      }

      case 'endpoint': {
        const item = gesture.snapshot[0]
        if (!item) break
        const [kx, ky] = gesture.endpoint === 0 ? ['x1', 'y1'] : ['x2', 'y2']
        applyUpdates(gesture, [
          { id: item.id, type: item.type, data: { ...item.data, [kx]: point.x, [ky]: point.y } },
        ])
        break
      }

      default:
        break
    }
  }

  const onPointerUp = (event) => {
    const gesture = gestureRef.current
    gestureRef.current = null
    setPanning(false)
    try {
      svgRef.current?.releasePointerCapture(event.pointerId)
    } catch {
      // ignore — capture may not have been taken
    }

    if (gesture) {
      const point = worldPoint(event)

      if (gesture.kind === 'shape') {
        const dragged =
          Math.abs(point.x - gesture.wx) >= 4 || Math.abs(point.y - gesture.wy) >= 4
        let rect = normalizeRect(gesture.wx, gesture.wy, point.x, point.y)
        if (!dragged) rect = { x: gesture.wx - 70, y: gesture.wy - 45, w: 140, h: 90 }
        else {
          rect = { ...rect, w: Math.max(rect.w, 8), h: Math.max(rect.h, 8) }
        }
        const el = createEl(gesture.type, {
          ...rect,
          fill: style.fill,
          stroke: style.stroke,
          strokeWidth: style.strokeWidth,
          sketch: style.sketch,
        })
        setSelectedIds([el.id])
      } else if (gesture.kind === 'line') {
        if (Math.hypot(point.x - gesture.wx, point.y - gesture.wy) >= 3 / z) {
          const el = createEl(gesture.type, {
            x1: gesture.wx,
            y1: gesture.wy,
            x2: point.x,
            y2: point.y,
            stroke: style.stroke,
            strokeWidth: style.strokeWidth,
            sketch: style.sketch,
          })
          setSelectedIds([el.id])
        }
      } else if (gesture.kind === 'draw') {
        if (gesture.points.length >= 2) {
          createEl('draw', {
            points: gesture.points.slice(),
            stroke: style.stroke,
            strokeWidth: style.strokeWidth,
          })
        }
      } else if (TRANSFORM_KINDS.has(gesture.kind)) {
        // Gesture end = the authoritative save (one REST call per element).
        // A plain click that moved nothing saves nothing.
        const typeById = new Map(gesture.snapshot.map((item) => [item.id, item.type]))
        for (const item of gesture.snapshot) {
          const data = gesture.final.get(item.id)
          if (data === item.data) continue
          emitLive?.({ id: item.id, type: typeById.get(item.id), data })
          persistUpdate(item.id, data)
        }
      }
    }

    setDraft(null)
  }

  const onDoubleClick = (event) => {
    if (!canEdit) return
    if (event.target?.dataset?.overlay) return // selection handles aren't elements
    const point = worldPoint(event)
    const hit = pickElement(point.x, point.y)
    if (!hit) return

    if (hit.type === 'chart') {
      onRequestChartEdit?.(hit)
      return
    }

    if (EDITABLE_TYPES.has(hit.type)) {
      if (!selectedIds.includes(hit.id)) setSelectedIds([hit.id])
      onCheckpoint?.() // undo should be able to revert the edit about to happen
      setEditingId(hit.id)
    }
  }

  const onHandleDown = (event, kind, dir = null, endpoint = null) => {
    event.stopPropagation()
    if (event.button !== 0) return
    if (!canEdit || editingId) return
    try {
      svgRef.current?.setPointerCapture(event.pointerId)
    } catch {
      // best-effort
    }
    startTransform(kind, selectedIds, worldPoint(event), { dir, endpoint })
  }

  /* ---------------------------------------------------------- editing ---- */

  const handleLocalChange = (patch) => {
    const id = editingId
    if (!id) return
    updateElements(
      elementsRef.current.map((el) =>
        el.id === id ? { ...el, data: { ...el.data, ...patch } } : el,
      ),
    )
  }

  const handleCommit = (patch) => {
    const id = editingId
    setEditingId(null)
    if (!id) return

    const current = elementsRef.current.find((el) => el.id === id)
    if (!current) return

    if (patch === null) {
      // Empty text/bullet: remove the element entirely.
      onCheckpoint?.()
      updateElements(elementsRef.current.filter((el) => el.id !== id))
      setSelectedIds((prev) => prev.filter((x) => x !== id))
      persistRemove(id)
      return
    }

    const data = { ...current.data, ...patch }
    // Opening an editor and closing it without typing must not rewrite the
    // element locally (a fresh data object would register as a no-op history
    // entry) — but the server write always runs: typed text only exists in
    // local state until this commit persists it.
    const unchanged = Object.keys(patch).every((key) => {
      const from = current.data[key]
      const to = patch[key]
      if (from === to) return true
      if (Array.isArray(from) && Array.isArray(to)) return from.join('\n') === to.join('\n')
      return false
    })
    if (!unchanged) {
      updateElements(
        elementsRef.current.map((el) => (el.id === id ? { ...el, data } : el)),
      )
    }
    persistUpdate(id, data)
    emitLive?.({ id, type: current.type, data })
  }

  /* --------------------------------------------------------- keyboard ---- */

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.code !== 'Space' || isTypingTarget(event.target)) return
      event.preventDefault()
      spaceRef.current = true
      setSpaceDown(true)
    }
    const onKeyUp = (event) => {
      if (event.code !== 'Space') return
      spaceRef.current = false
      setSpaceDown(false)
    }
    const onBlur = () => {
      spaceRef.current = false
      setSpaceDown(false)
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key !== 'Escape' || isTypingTarget(event.target) || editingRef.current) return
      setSelectedIds([])
      gestureRef.current = null
      setDraft(null)
      setTool?.(TOOLS.select)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [setSelectedIds, setTool])

  // Native wheel listener so ctrl+wheel zoom can preventDefault (React's
  // synthetic wheel is passive on the root).
  useEffect(() => {
    const node = svgRef.current
    if (!node) return undefined

    const onWheel = (event) => {
      event.preventDefault()
      const rect = node.getBoundingClientRect()
      const px = event.clientX - rect.left
      const py = event.clientY - rect.top

      if (event.ctrlKey || event.metaKey) {
        const factor = Math.exp(-event.deltaY * 0.01)
        setCamera((cam) => {
          const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, (cam.zoom || 1) * factor))
          const wx = (px - cam.x) / (cam.zoom || 1)
          const wy = (py - cam.y) / (cam.zoom || 1)
          return { ...cam, zoom, x: px - wx * zoom, y: py - wy * zoom }
        })
      } else {
        setCamera((cam) => ({ ...cam, x: cam.x - event.deltaX, y: cam.y - event.deltaY }))
      }
    }

    node.addEventListener('wheel', onWheel, { passive: false })
    return () => node.removeEventListener('wheel', onWheel)
  }, [setCamera])

  /* ------------------------------------------------------------ render --- */

  let cursor = 'default'
  if (panning) cursor = 'grabbing'
  else if (spaceDown || tool === TOOLS.pan) cursor = 'grab'
  else if (tool === TOOLS.eraser) cursor = 'cell'
  else if (tool !== TOOLS.select) cursor = 'crosshair'

  const showOverlay = selected.length > 0 && !editingId && canEdit

  return (
    <div className="relative h-full w-full overflow-hidden" style={{ touchAction: 'none' }}>
      <div
        className={
          background === 'grid' ? 'canvas-bg-grid' : background === 'dots' ? 'canvas-bg-dots' : ''
        }
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: bgColor || '#ffffff',
          backgroundSize:
            background === 'grid' || background === 'dots' ? `${22 * z}px ${22 * z}px` : undefined,
          backgroundPosition: `${camera.x}px ${camera.y}px`,
        }}
      />

      <svg
        ref={svgRef}
        className="absolute inset-0 h-full w-full"
        style={{ cursor, touchAction: 'none', display: 'block' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
      >
        <g transform={`translate(${camera.x} ${camera.y}) scale(${camera.zoom})`}>
          {elements.map((element) => {
            const rotation = Number(element.data?.rotation) || 0
            const content = (
              <ElementRenderer element={element} editing={element.id === editingId} />
            )
            if (!rotation) return <g key={element.id}>{content}</g>
            const b = getBounds(element)
            return (
              <g
                key={element.id}
                transform={`rotate(${rotation} ${b.x + b.w / 2} ${b.y + b.h / 2})`}
              >
                {content}
              </g>
            )
          })}

          {draftSvg(draft, style, z)}

          {showOverlay && (
            <SelectionOverlay selected={selected} camera={camera} onHandleDown={onHandleDown} />
          )}
        </g>
      </svg>

      {editingElement && (
        <EditingOverlay
          key={editingElement.id}
          element={editingElement}
          camera={camera}
          onLocalChange={handleLocalChange}
          onCommit={handleCommit}
        />
      )}
    </div>
  )
}
