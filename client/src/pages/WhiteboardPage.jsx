import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'

import AIPanel from '../components/board/AIPanel'
import Canvas from '../components/board/Canvas'
import ChartEditor from '../components/board/ChartEditor'
import { defaultChartData } from '../components/board/ChartElement'
import EmojiPicker from '../components/board/EmojiPicker'
import ShareModal from '../components/board/ShareModal'
import StylePanel from '../components/board/StylePanel'
import Toolbar from '../components/board/Toolbar'
import TopBar from '../components/board/TopBar'
import Button from '../components/ui/Button'
import { FullScreenSpinner } from '../components/ui/Spinner'
import { TOOLS, getBounds, screenToWorld, worldToScreen } from '../lib/canvas'
import { boardApi, elementApi, uploadApi } from '../lib/api'
import { connectSocket } from '../lib/socket'
import { exportPNG, exportSVG } from '../lib/exportCanvas'
import { fileToDownscaledBlob } from '../lib/image'
import { colorFromId } from '../lib/utils'

const HISTORY_LIMIT = 100
const MIN_ZOOM = 0.15
const MAX_ZOOM = 5

const DEFAULT_STYLE = {
  stroke: '#16161d',
  fill: '#fde68a',
  strokeWidth: 3,
  sketch: false,
  color: '#16161d',
  fontSize: 24,
  font: 'sans',
  bulletStyle: 'disc',
}

const KEY_TOOLS = {
  v: TOOLS.select,
  h: TOOLS.pan,
  t: TOOLS.text,
  g: TOOLS.hand,
  s: TOOLS.sticky,
  b: TOOLS.bullet,
  r: TOOLS.rect,
  o: TOOLS.ellipse,
  d: TOOLS.diamond,
  l: TOOLS.line,
  a: TOOLS.arrow,
  p: TOOLS.draw,
  e: TOOLS.eraser,
}

const normalizeElement = (element) => {
  let data = element?.data
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data)
    } catch {
      data = {}
    }
  }
  return { ...element, data: data && typeof data === 'object' ? data : {} }
}

const slug = (value) =>
  String(value || 'whiteboard')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'whiteboard'

const isTypingTarget = (target) =>
  Boolean(target) &&
  (target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.isContentEditable)

/** Route shell — remount per board id so no state leaks between boards. */
export default function WhiteboardPage() {
  const { boardId } = useParams()
  return <BoardView key={boardId} boardId={boardId} />
}

function BoardView({ boardId }) {
  const navigate = useNavigate()

  /* ------------------------------------------------------------- state -- */
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [error, setError] = useState('')
  const [board, setBoard] = useState(null)
  const [elements, setElements] = useState([])
  const [members, setMembers] = useState([])

  const [tool, setTool] = useState(TOOLS.select)
  const [style, setStyle] = useState(DEFAULT_STYLE)
  const [camera, setCamera] = useState({ x: 0, y: 0, zoom: 1 })
  const [selectedIds, setSelectedIds] = useState([])
  const [editingId, setEditingId] = useState(null)

  const [past, setPast] = useState([])
  const [future, setFuture] = useState([])
  const pendingRef = useRef(null)

  const [viewers, setViewers] = useState([])
  const [cursors, setCursors] = useState({})
  const [previewBg, setPreviewBg] = useState(null)

  const [aiOpen, setAiOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [chartTarget, setChartTarget] = useState(null)

  const stageRef = useRef(null)
  const socketRef = useRef(null)
  const fileRef = useRef(null)
  const fittedRef = useRef(false)

  const canEdit = board?.role !== 'viewer'
  const selectedElements = useMemo(
    () => (selectedIds.length ? elements.filter((el) => selectedIds.includes(el.id)) : []),
    [elements, selectedIds],
  )

  const persist = useMemo(
    () => ({
      create: (type, data) => elementApi.create(boardId, { type, data }),
      update: (id, payload) => elementApi.update(boardId, id, payload),
      remove: (id) => elementApi.remove(boardId, id),
    }),
    [boardId],
  )

  /* ------------------------------------------------------------ actions -- */

  /** History entry is only recorded if the gesture actually changed anything. */
  const checkpoint = () => {
    pendingRef.current = [...elements]
  }

  const report = (message) => (err) => toast.error(err?.message || message)

  const reconcile = (prev, next) => {
    const prevById = new Map(prev.map((el) => [el.id, el]))
    const nextIds = new Set(next.map((el) => el.id))

    for (const el of prev) {
      if (nextIds.has(el.id)) continue
      // Temp ids (create still in flight) simply 404 — safe to ignore.
      elementApi.remove(boardId, el.id).catch(() => {})
    }

    for (const el of next) {
      const before = prevById.get(el.id)
      if (!before) {
        elementApi
          .create(boardId, { type: el.type, data: el.data })
          .then((created) => {
            const serverId = created?.id
            if (!serverId) return
            setElements((list) =>
              list.map((item) => (item.id === el.id ? { ...item, id: serverId } : item)),
            )
            setSelectedIds((ids) => ids.map((id) => (id === el.id ? serverId : id)))
          })
          .catch(report('Could not restore that element'))
      } else if (before.data !== el.data) {
        elementApi
          .update(boardId, el.id, { data: el.data })
          .catch(report('Could not save that change'))
      }
    }
  }

  const undo = () => {
    if (!canEdit || !past.length) return
    pendingRef.current = null
    const target = past[past.length - 1]
    setPast((prev) => prev.slice(0, -1))
    setFuture((prev) => [elements, ...prev].slice(0, HISTORY_LIMIT))
    reconcile(elements, target)
    setElements(target)
  }

  const redo = () => {
    if (!canEdit || !future.length) return
    pendingRef.current = null
    const target = future[0]
    setFuture((prev) => prev.slice(1))
    setPast((prev) => [...prev, elements].slice(0, HISTORY_LIMIT))
    reconcile(elements, target)
    setElements(target)
  }

  const deleteSelection = () => {
    if (!canEdit || !selectedIds.length) return
    checkpoint()
    const ids = new Set(selectedIds)
    const removed = elements.filter((el) => ids.has(el.id))
    setElements((prev) => prev.filter((el) => !ids.has(el.id)))
    setSelectedIds([])
    setEditingId(null)
    for (const el of removed) elementApi.remove(boardId, el.id).catch(() => {})
  }

  const applyToSelection = (patch) => {
    if (!canEdit || !selectedIds.length || !patch || !Object.keys(patch).length) return
    checkpoint()
    const ids = new Set(selectedIds)
    setElements(
      elements.map((el) => (ids.has(el.id) ? { ...el, data: { ...el.data, ...patch } } : el)),
    )
    for (const el of elements) {
      if (!ids.has(el.id)) continue
      elementApi
        .update(boardId, el.id, { data: { ...el.data, ...patch } })
        .catch(report('Could not save that style'))
    }
  }

  /** Page-level create: optimistic with a temp id, remapped to the server id. */
  const addLocal = (type, data) => {
    if (!canEdit) return
    checkpoint()
    const tempId =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `tmp-${Date.now()}`
    setElements((prev) => [...prev, { id: tempId, type, data }])
    elementApi
      .create(boardId, { type, data })
      .then((created) => {
        const serverId = created?.id
        if (!serverId) return
        setElements((prev) => prev.map((el) => (el.id === tempId ? { ...el, id: serverId } : el)))
        setSelectedIds((ids) => ids.map((id) => (id === tempId ? serverId : id)))
      })
      .catch((err) => {
        setElements((prev) => prev.filter((el) => el.id !== tempId))
        report('Could not add that to the board')(err)
      })
  }

  const getDropPoint = () => {
    const node = stageRef.current
    if (!node) return { x: 80, y: 80 }
    const rect = node.getBoundingClientRect()
    const center = screenToWorld(rect.width / 2, rect.height / 2, camera)
    return { x: Math.round(center.x - 160), y: Math.round(center.y - 110) }
  }

  const anchorZoom = (factor) => {
    const node = stageRef.current
    if (!node) return
    const rect = node.getBoundingClientRect()
    const cx = rect.width / 2
    const cy = rect.height / 2
    setCamera((cam) => {
      const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, (cam.zoom || 1) * factor))
      const wx = (cx - cam.x) / (cam.zoom || 1)
      const wy = (cy - cam.y) / (cam.zoom || 1)
      return { ...cam, zoom, x: cx - wx * zoom, y: cy - wy * zoom }
    })
  }

  const resetZoom = () => {
    const node = stageRef.current
    if (!node) {
      setCamera({ x: 0, y: 0, zoom: 1 })
      return
    }
    const rect = node.getBoundingClientRect()
    const cx = rect.width / 2
    const cy = rect.height / 2
    setCamera((cam) => {
      const wx = (cx - cam.x) / (cam.zoom || 1)
      const wy = (cy - cam.y) / (cam.zoom || 1)
      return { x: cx - wx, y: cy - wy, zoom: 1 }
    })
  }

  const saveBoard = (patch) => {
    setBoard((prev) => (prev ? { ...prev, ...patch } : prev))
    boardApi.update(boardId, patch).catch(report('Could not save the board'))
  }

  const handleExportPNG = async () => {
    try {
      await exportPNG(elements, slug(board?.title))
      toast.success('PNG downloaded')
    } catch (err) {
      report('PNG export failed')(err)
    }
  }

  const handleExportSVG = async () => {
    try {
      await exportSVG(elements, slug(board?.title))
      toast.success('SVG downloaded')
    } catch (err) {
      report('SVG export failed')(err)
    }
  }

  /* ------------------------------------------------------------ effects -- */

  // Load board + elements + members (state starts fresh — the view is keyed).
  useEffect(() => {
    let cancelled = false
    boardApi
      .get(boardId)
      .then((data) => {
        if (cancelled) return
        setBoard(data.board)
        setMembers(data.members || [])
        setElements((data.elements || []).map(normalizeElement))
        setStatus('ready')
      })
      .catch((err) => {
        if (cancelled) return
        setError(err.message || 'This whiteboard could not be loaded.')
        setStatus('error')
      })

    return () => {
      cancelled = true
    }
  }, [boardId])

  // Frame the content once, on first load.
  useEffect(() => {
    if (status !== 'ready' || fittedRef.current) return
    fittedRef.current = true

    const node = stageRef.current
    if (!node || !elements.length) return

    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const el of elements) {
      const bounds = getBounds(el)
      if (!bounds || !Number.isFinite(bounds.x)) continue
      minX = Math.min(minX, bounds.x)
      minY = Math.min(minY, bounds.y)
      maxX = Math.max(maxX, bounds.x + bounds.w)
      maxY = Math.max(maxY, bounds.y + bounds.h)
    }
    if (minX === Infinity) return

    const rect = node.getBoundingClientRect()
    const inset = { left: 104, right: 48, top: 104, bottom: 56 }
    const availW = Math.max(160, rect.width - inset.left - inset.right)
    const availH = Math.max(160, rect.height - inset.top - inset.bottom)
    const contentW = Math.max(1, maxX - minX)
    const contentH = Math.max(1, maxY - minY)
    const zoom = Math.max(
      MIN_ZOOM,
      Math.min(1.25, Math.min(availW / contentW, availH / contentH)),
    )
    setCamera({
      x: inset.left + (availW - contentW * zoom) / 2 - minX * zoom,
      y: inset.top + (availH - contentH * zoom) / 2 - minY * zoom,
      zoom,
    })
  }, [status, elements])

  // Realtime: presence, remote element changes, board metadata, membership.
  useEffect(() => {
    if (status !== 'ready') return undefined
    let active = true
    let joinFn = null
    const handlers = []

    const on = (event, handler) => handlers.push([event, handler])

    const upsertRemote = (raw) => {
      const element = normalizeElement(raw)
      if (!element.id) return
      pendingRef.current = null // remote changes never enter local history
      setElements((prev) => {
        const index = prev.findIndex((el) => el.id === element.id)
        if (index === -1) return [...prev, element]
        const next = [...prev]
        next[index] = { ...next[index], data: element.data }
        return next
      })
    }

    on('presence:sync', ({ users }) => active && setViewers(users || []))
    on('presence:join', ({ user }) => {
      if (!active || !user) return
      setViewers((prev) => (prev.some((v) => v.id === user.id) ? prev : [...prev, user]))
    })
    on('presence:leave', ({ user }) => {
      if (!active || !user) return
      setViewers((prev) => prev.filter((v) => v.id !== user.id))
      setCursors((prev) => {
        if (!(user.id in prev)) return prev
        const next = { ...prev }
        delete next[user.id]
        return next
      })
    })
    on('presence:cursor', ({ user, x, y }) => {
      if (!active || !user || !Number.isFinite(x) || !Number.isFinite(y)) return
      setCursors((prev) => ({ ...prev, [user.id]: { id: user.id, name: user.name || 'Guest', x, y } }))
    })
    on('element:created', (element) => active && upsertRemote(element))
    on('element:updated', (element) => active && upsertRemote(element))
    on('element:live', ({ element }) => active && element && upsertRemote(element))
    on('element:deleted', ({ id }) => {
      if (!active || !id) return
      pendingRef.current = null
      setElements((prev) => prev.filter((el) => el.id !== id))
      setSelectedIds((prev) => prev.filter((x) => x !== id))
      setEditingId((prev) => (prev === id ? null : prev))
    })
    on('board:updated', (row) => {
      if (active && row) setBoard((prev) => (prev ? { ...prev, ...row } : prev))
    })
    on('member:added', (member) => {
      if (!active || !member) return
      setMembers((prev) => [...prev.filter((m) => m.id !== member.id), member])
    })
    on('member:removed', ({ userId }) => {
      if (!active || !userId) return
      setMembers((prev) => prev.filter((m) => m.id !== userId))
    })

    connectSocket()
      .then((socket) => {
        if (!active) return
        socketRef.current = socket
        for (const [event, handler] of handlers) socket.on(event, handler)

        joinFn = () => {
          socket.emit('wb:join', boardId, (res) => {
            if (res && !res.ok) toast.error(res.error || 'Could not join this whiteboard')
          })
        }
        if (socket.connected) joinFn()
        else socket.on('connect', joinFn)
      })
      .catch(() => {})

    return () => {
      active = false
      const socket = socketRef.current
      socketRef.current = null
      if (!socket) return
      socket.emit('wb:leave', boardId)
      for (const [event, handler] of handlers) socket.off(event, handler)
      if (joinFn) socket.off('connect', joinFn)
    }
  }, [boardId, status])

  // Commit a checkpointed gesture once it actually changed the elements.
  useEffect(() => {
    const pending = pendingRef.current
    if (!pending) return
    const changed =
      pending.length !== elements.length || pending.some((el, i) => el !== elements[i])
    if (!changed) return
    pendingRef.current = null
    setPast((prev) => [...prev, pending].slice(-HISTORY_LIMIT))
    setFuture([])
  }, [elements])

  // Keyboard: tools, undo/redo, delete. The handler is refreshed every render
  // through a ref so the window listener itself never has to re-subscribe.
  const keyRef = useRef(null)

  useEffect(() => {
    keyRef.current = (event) => {
      if (isTypingTarget(event.target)) return // native undo wins while typing
      const meta = event.metaKey || event.ctrlKey

      if (meta && (event.key === 'z' || event.key === 'Z')) {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
        return
      }
      if (meta && (event.key === 'y' || event.key === 'Y')) {
        event.preventDefault()
        redo()
        return
      }

      if (editingId || meta || event.altKey) return

      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault()
        deleteSelection()
        return
      }

      const nextTool = KEY_TOOLS[event.key.toLowerCase()]
      if (nextTool) setTool(nextTool)
    }
  })

  useEffect(() => {
    if (status !== 'ready') return undefined
    const listener = (event) => keyRef.current?.(event)
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [status])

  /* --------------------------------------------------------- integrations */

  const emitLive = (element) => socketRef.current?.emit('element:live', { boardId, element })
  const emitCursor = (x, y) => socketRef.current?.emit('presence:cursor', { boardId, x, y })

  const handleAiCreated = (created) => {
    if (!Array.isArray(created) || !created.length) return
    checkpoint()
    setElements((prev) => {
      const existing = new Set(prev.map((el) => el.id))
      const fresh = created.filter((el) => el && !existing.has(el.id)).map(normalizeElement)
      return fresh.length ? [...prev, ...fresh] : prev
    })
  }

  const handleAiUpdated = (updated) => {
    if (!Array.isArray(updated) || !updated.length) return
    checkpoint()
    setElements((prev) => {
      const byId = new Map(updated.map((el) => [el.id, el]))
      const next = prev.map((el) =>
        byId.has(el.id) ? { ...el, data: normalizeElement(byId.get(el.id)).data } : el,
      )
      const existing = new Set(prev.map((el) => el.id))
      const fresh = updated.filter((el) => el && !existing.has(el.id)).map(normalizeElement)
      return fresh.length ? [...next, ...fresh] : next
    })
  }

  const insertEmoji = (emoji) => {
    const drop = getDropPoint()
    addLocal('emoji', { x: drop.x + 120, y: drop.y + 40, w: 72, h: 72, emoji })
  }

  const insertChart = (chartType) => {
    const drop = getDropPoint()
    const sample = defaultChartData(chartType)
    addLocal('chart', { x: drop.x, y: drop.y, w: 360, h: 240, ...sample })
  }

  const pickImage = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const { blob, width, height, type } = await fileToDownscaledBlob(file)
      const url = await uploadApi.image(
        boardId,
        blob,
        file.name || `image.${(type || 'image/png').split('/')[1] || 'png'}`,
      )
      const scale = Math.min(1, 440 / Math.max(1, width), 360 / Math.max(1, height))
      const w = Math.max(48, Math.round(width * scale))
      const h = Math.max(48, Math.round(height * scale))
      const drop = getDropPoint()
      addLocal('image', {
        x: Math.round(drop.x + (360 - w) / 2),
        y: Math.round(drop.y + (240 - h) / 2),
        w,
        h,
        src: url,
      })
    } catch (err) {
      report('Could not add that image')(err)
    }
  }

  const saveChart = (chartData) => {
    const target = chartTarget
    setChartTarget(null)
    if (!target || !canEdit) return
    checkpoint()
    const data = { ...target.data, ...chartData }
    setElements((prev) => prev.map((el) => (el.id === target.id ? { ...el, data } : el)))
    elementApi.update(boardId, target.id, { data }).catch(report('Could not save the chart'))
  }

  /* -------------------------------------------------------------- render -- */

  if (status === 'loading') return <FullScreenSpinner label="Opening your whiteboard…" />

  if (status === 'error') {
    return (
      <div className="grid h-full place-items-center p-6">
        <div className="card w-full max-w-md rounded-2xl p-7 text-center">
          <h1 className="font-display text-lg font-semibold text-ink">
            Couldn&apos;t open this whiteboard
          </h1>
          <p className="mt-2 text-sm text-muted">{error}</p>
          <Button className="mt-5" size="sm" onClick={() => navigate('/dashboard')}>
            Back to dashboard
          </Button>
        </div>
      </div>
    )
  }

  return (
    <main ref={stageRef} className="relative h-full w-full overflow-hidden">
      <Canvas
        elements={elements}
        setElements={setElements}
        tool={tool}
        setTool={setTool}
        style={style}
        camera={camera}
        setCamera={setCamera}
        selectedIds={selectedIds}
        setSelectedIds={setSelectedIds}
        editingId={editingId}
        setEditingId={setEditingId}
        canEdit={canEdit}
        background={board?.background || 'dots'}
        bgColor={previewBg || board?.bg_color || '#ffffff'}
        persist={persist}
        emitLive={emitLive}
        emitCursor={emitCursor}
        onRequestChartEdit={setChartTarget}
        onCheckpoint={checkpoint}
      />

      <Toolbar
        tool={tool}
        setTool={setTool}
        disabled={!canEdit}
        onInsertImage={() => fileRef.current?.click()}
        onInsertChart={insertChart}
        onInsertEmoji={() => setEmojiOpen(true)}
      />

      {canEdit && (
        <StylePanel
          tool={tool}
          style={style}
          setStyle={(patch) => setStyle((prev) => ({ ...prev, ...patch }))}
          selected={selectedElements}
          onApply={applyToSelection}
          onSetFont={(font) => setStyle((prev) => ({ ...prev, font }))}
        />
      )}

      <TopBar
        board={board}
        role={board?.role}
        viewers={viewers}
        onRename={(title) => saveBoard({ title })}
        onShare={() => setShareOpen(true)}
        onAI={() => setAiOpen(true)}
        onSetBackground={(background) => saveBoard({ background })}
        onSetBgColor={(color) => {
          setPreviewBg(null)
          saveBoard({ bg_color: color })
        }}
        onPreviewBgColor={setPreviewBg}
        onExportPNG={handleExportPNG}
        onExportSVG={handleExportSVG}
        zoom={camera.zoom}
        onZoomIn={() => anchorZoom(1.2)}
        onZoomOut={() => anchorZoom(1 / 1.2)}
        onZoomReset={resetZoom}
        onUndo={undo}
        onRedo={redo}
        canUndo={canEdit && past.length > 0}
        canRedo={canEdit && future.length > 0}
      />

      {/* collaborator cursors (world → screen) */}
      {Object.values(cursors).map((cursor) => {
        const point = worldToScreen(cursor.x, cursor.y, camera)
        const color = colorFromId(cursor.id)
        return (
          <div
            key={cursor.id}
            className="pointer-events-none absolute z-30 -translate-x-1 -translate-y-1"
            style={{ left: point.x, top: point.y }}
          >
            <span
              className="block h-3 w-3 rounded-full ring-2 ring-white"
              style={{ background: color }}
            />
            <span
              className="mt-1 block max-w-[110px] truncate rounded-full px-1.5 py-0.5 text-[10px] font-semibold text-white shadow-sm"
              style={{ background: color }}
            >
              {cursor.name}
            </span>
          </div>
        )
      })}

      <EmojiPicker
        open={emojiOpen}
        onClose={() => setEmojiOpen(false)}
        onPick={(emoji) => {
          setEmojiOpen(false)
          insertEmoji(emoji)
        }}
      />

      <AIPanel
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        boardId={boardId}
        selectedIds={selectedIds}
        getDropPoint={getDropPoint}
        onElementsCreated={handleAiCreated}
        onElementsUpdated={handleAiUpdated}
      />

      <ChartEditor
        open={Boolean(chartTarget)}
        element={chartTarget}
        onClose={() => setChartTarget(null)}
        onSave={saveChart}
      />

      <ShareModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        boardId={boardId}
        members={members}
        setMembers={setMembers}
        ownerId={board?.owner_id}
      />

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={pickImage}
      />
    </main>
  )
}
