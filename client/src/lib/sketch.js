/**
 * Deterministic hand-drawn wobble: same id -> same random stream, so the
 * sketch effect is stable across re-renders and across clients.
 */

function fnv1a(str) {
  let hash = 0x811c9dc5
  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

function mulberry32(seed) {
  let a = seed
  return function next() {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function seededRandom(id) {
  return mulberry32(fnv1a(String(id ?? '')))
}

const r2 = (n) => Math.round(n * 100) / 100

/** Quadratic smoothing over a point list -> SVG path string. */
function smooth(points, closed = false) {
  if (points.length < 2) return ''

  let d = `M ${r2(points[0][0])} ${r2(points[0][1])}`
  for (let i = 1; i < points.length - 1; i += 1) {
    const [cx, cy] = points[i]
    const [nx, ny] = points[i + 1]
    d += ` Q ${r2(cx)} ${r2(cy)} ${r2((cx + nx) / 2)} ${r2((cy + ny) / 2)}`
  }
  const last = points[points.length - 1]
  d += ` L ${r2(last[0])} ${r2(last[1])}`
  if (closed) d += ' Z'
  return d
}

const jitter = (rand, amp) => (rand() * 2 - 1) * amp

export function sketchLine(x1, y1, x2, y2, rand, amp = 1.8) {
  const j = () => jitter(rand, amp)
  const mx = (x1 + x2) / 2 + j()
  const my = (y1 + y2) / 2 + j()
  return `M ${r2(x1 + j())} ${r2(y1 + j())} Q ${r2(mx)} ${r2(my)} ${r2(x2 + j())} ${r2(y2 + j())}`
}

export function sketchRect(x, y, w, h, rand, amp = 1.8) {
  const pts = [
    [x, y],
    [x + w / 2, y],
    [x + w, y],
    [x + w, y + h / 2],
    [x + w, y + h],
    [x + w / 2, y + h],
    [x, y + h],
    [x, y + h / 2],
    [x, y],
  ].map(([px, py]) => [px + jitter(rand, amp), py + jitter(rand, amp)])
  return smooth(pts, true)
}

export function sketchEllipse(cx, cy, rx, ry, rand, amp = 2) {
  const steps = 22
  const pts = []
  for (let i = 0; i <= steps; i += 1) {
    const angle = (i / steps) * Math.PI * 2
    pts.push([
      cx + Math.cos(angle) * rx + jitter(rand, amp),
      cy + Math.sin(angle) * ry + jitter(rand, amp),
    ])
  }
  return smooth(pts, true)
}

export function sketchPolygon(points, rand, amp = 1.8) {
  const pts = (points || []).map(([px, py]) => [px + jitter(rand, amp), py + jitter(rand, amp)])
  if (pts.length && (pts[0][0] !== pts[pts.length - 1][0] || pts[0][1] !== pts[pts.length - 1][1])) {
    pts.push([pts[0][0], pts[0][1]])
  }
  return smooth(pts, true)
}

export { smooth }
