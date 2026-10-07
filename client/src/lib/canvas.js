import { getStroke } from 'perfect-freehand'

/* ---------------------------------------------------------------- tools -- */

export const TOOLS = {
  select: 'select',
  pan: 'pan',
  text: 'text',
  sticky: 'sticky',
  rect: 'rect',
  ellipse: 'ellipse',
  diamond: 'diamond',
  line: 'line',
  arrow: 'arrow',
  draw: 'draw',
  bullet: 'bullet',
  hand: 'hand',
  eraser: 'eraser',
}

export function fontFamilyFor(font) {
  return font === 'hand' ? '"Caveat", "Segoe Script", cursive' : 'Inter, sans-serif'
}

/* ------------------------------------------------------------- palettes -- */

export const STROKE_COLORS = [
  '#16161d',
  '#2f8159',
  '#2563eb',
  '#e11d48',
  '#d97706',
  '#7c3aed',
  '#0891b2',
  '#ec4899',
]

export const FILL_COLORS = [
  'transparent',
  '#fde68a',
  '#bbf7d0',
  '#bfdbfe',
  '#fbcfe8',
  '#ddd6fe',
  '#fed7aa',
  '#e5e7eb',
]

export const STICKY_COLORS = [
  '#fde68a',
  '#bbf7d0',
  '#bfdbfe',
  '#fbcfe8',
  '#ddd6fe',
  '#fed7aa',
]

export const STROKE_WIDTHS = [2, 4, 8]

export const FONT_SIZES = [14, 18, 24, 34, 48]

/* ------------------------------------------------------------ camera ----- */

export function worldToScreen(wx, wy, cam) {
  return { x: wx * cam.zoom + cam.x, y: wy * cam.zoom + cam.y }
}

export function screenToWorld(sx, sy, cam) {
  return { x: (sx - cam.x) / cam.zoom, y: (sy - cam.y) / cam.zoom }
}

/* --------------------------------------------------------- freehand ------ */

const round = (n) => Math.round(n * 100) / 100

/** points -> closed SVG path string (quadratic-smoothed outline). */
export function strokeToPath(points, size = 4) {
  if (!points || points.length < 2) return ''

  const outline = getStroke(points, {
    size: size * 2.2,
    thinning: 0.6,
    smoothing: 0.5,
    streamline: 0.5,
    simulatePressure: points[0].length < 3,
  })

  if (outline.length < 4) return ''

  let d = `M ${round(outline[0][0])} ${round(outline[0][1])}`
  for (let i = 1; i < outline.length - 1; i += 1) {
    const [x0, y0] = outline[i]
    const [x1, y1] = outline[i + 1]
    d += ` Q ${round(x0)} ${round(y0)} ${round((x0 + x1) / 2)} ${round((y0 + y1) / 2)}`
  }
  const last = outline[outline.length - 1]
  d += ` L ${round(last[0])} ${round(last[1])} Z`
  return d
}

/* ----------------------------------------------------------- bounds ------ */

function wrappedLineCount(text, width, fontSize) {
  const charsPerLine = Math.max(1, Math.floor(width / (fontSize * 0.52)))
  const paragraphs = String(text ?? '').split('\n')
  let lines = 0
  for (const paragraph of paragraphs) {
    lines += Math.max(1, Math.ceil(paragraph.length / charsPerLine))
  }
  return Math.max(1, lines)
}

export function getBounds(el) {
  const d = el?.data || {}
  const type = el?.type

  if (type === 'line' || type === 'arrow') {
    const x1 = d.x1 ?? 0
    const y1 = d.y1 ?? 0
    const x2 = d.x2 ?? 0
    const y2 = d.y2 ?? 0
    return {
      x: Math.min(x1, x2),
      y: Math.min(y1, y2),
      w: Math.abs(x2 - x1),
      h: Math.abs(y2 - y1),
    }
  }

  if (type === 'draw') {
    const points = d.points || []
    if (points.length < 2) return { x: d.x || 0, y: d.y || 0, w: 100, h: 100 }

    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const [px, py] of points) {
      if (px < minX) minX = px
      if (py < minY) minY = py
      if (px > maxX) maxX = px
      if (py > maxY) maxY = py
    }

    const pad = (d.strokeWidth || 4) * 1.5
    return {
      x: minX - pad,
      y: minY - pad,
      w: maxX - minX + pad * 2,
      h: maxY - minY + pad * 2,
    }
  }

  if (type === 'text') {
    const w = d.w || 260
    const fontSize = d.fontSize || 20
    const h = d.h ?? wrappedLineCount(d.text, w, fontSize) * fontSize * 1.35
    return { x: d.x || 0, y: d.y || 0, w, h }
  }

  if (type === 'bullet') {
    const w = d.w || 280
    const fontSize = d.fontSize || 16
    const items = d.items?.length ? d.items : []
    const h = d.h ?? (items.length * fontSize * 1.7 + 12)
    return { x: d.x || 0, y: d.y || 0, w, h }
  }

  return { x: d.x || 0, y: d.y || 0, w: d.w || 100, h: d.h || 100 }
}

/* ---------------------------------------------------------- transforms --- */

export function translatedData(el, dx, dy) {
  const d = el?.data || {}

  if (el.type === 'line' || el.type === 'arrow') {
    return { ...d, x1: (d.x1 || 0) + dx, y1: (d.y1 || 0) + dy, x2: (d.x2 || 0) + dx, y2: (d.y2 || 0) + dy }
  }

  if (el.type === 'draw') {
    return { ...d, points: (d.points || []).map((p) => [p[0] + dx, p[1] + dy, ...p.slice(2)]) }
  }

  return { ...d, x: (d.x || 0) + dx, y: (d.y || 0) + dy }
}

export function resizedData(el, bounds) {
  const d = el?.data || {}
  const old = getBounds(el)
  const sx = old.w ? bounds.w / old.w : 1
  const sy = old.h ? bounds.h / old.h : 1

  if (el.type === 'line' || el.type === 'arrow') {
    return {
      ...d,
      x1: bounds.x + ((d.x1 ?? old.x) - old.x) * sx,
      y1: bounds.y + ((d.y1 ?? old.y) - old.y) * sy,
      x2: bounds.x + ((d.x2 ?? old.x) - old.x) * sx,
      y2: bounds.y + ((d.y2 ?? old.y) - old.y) * sy,
    }
  }

  if (el.type === 'draw') {
    // Scale the *unpadded* point extents onto the target box inset by the
    // stroke padding, so getBounds(resized) lands exactly on `bounds`.
    const points = d.points || []
    if (!points.length) return d

    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const [px, py] of points) {
      if (px < minX) minX = px
      if (py < minY) minY = py
      if (px > maxX) maxX = px
      if (py > maxY) maxY = py
    }

    const pad = (d.strokeWidth || 4) * 1.5
    const tx = bounds.x + pad
    const ty = bounds.y + pad
    const tw = Math.max(1, bounds.w - pad * 2)
    const th = Math.max(1, bounds.h - pad * 2)
    const rsx = maxX > minX ? tw / (maxX - minX) : 1
    const rsy = maxY > minY ? th / (maxY - minY) : 1

    return {
      ...d,
      points: points.map((p) => [tx + (p[0] - minX) * rsx, ty + (p[1] - minY) * rsy, ...p.slice(2)]),
    }
  }

  return { ...d, x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h }
}

/* ------------------------------------------------------------- picking --- */

function distanceToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1
  const dy = y2 - y1
  const lenSq = dx * dx + dy * dy

  if (lenSq === 0) return Math.hypot(px - x1, py - y1)

  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq
  t = Math.max(0, Math.min(1, t))

  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))
}

export function hitTest(el, px, py, tol = 6) {
  const d = el?.data || {}

  if (el.type === 'line' || el.type === 'arrow') {
    return distanceToSegment(px, py, d.x1 || 0, d.y1 || 0, d.x2 || 0, d.y2 || 0) <= tol
  }

  if (el.type === 'draw') {
    const points = d.points || []
    const reach = tol + (d.strokeWidth || 4)
    for (let i = 0; i < points.length - 1; i += 1) {
      if (distanceToSegment(px, py, points[i][0], points[i][1], points[i + 1][0], points[i + 1][1]) <= reach) {
        return true
      }
    }
    return false
  }

  const b = getBounds(el)
  return (
    px >= b.x - tol && px <= b.x + b.w + tol && py >= b.y - tol && py <= b.y + b.h + tol
  )
}

export function boundsIntersectRect(el, rect) {
  const b = getBounds(el)
  return (
    b.x <= rect.x + rect.w &&
    b.x + b.w >= rect.x &&
    b.y <= rect.y + rect.h &&
    b.y + b.h >= rect.y
  )
}

/* -------------------------------------------------------------- shapes --- */

/** Corner points of a diamond (top, right, bottom, left) as [x, y] pairs. */
export function diamondPoints(b) {
  return [
    [b.x + b.w / 2, b.y],
    [b.x + b.w, b.y + b.h / 2],
    [b.x + b.w / 2, b.y + b.h],
    [b.x, b.y + b.h / 2],
  ]
}

/** 3-point arrowhead polygon at (x2, y2), as an SVG `points` string. */
export function arrowHead(x1, y1, x2, y2, size = 12) {
  const angle = Math.atan2(y2 - y1, x2 - x1)
  const spread = 0.42
  const p1 = [x2, y2]
  const p2 = [x2 - size * Math.cos(angle - spread), y2 - size * Math.sin(angle - spread)]
  const p3 = [x2 - size * Math.cos(angle + spread), y2 - size * Math.sin(angle + spread)]
  return [p1, p2, p3].map(([x, y]) => `${round(x)},${round(y)}`).join(' ')
}
