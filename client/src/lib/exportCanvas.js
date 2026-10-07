/**
 * Native SVG export — no <foreignObject> anywhere, so the result rasterizes
 * cleanly when we paint it onto a canvas for PNG download.
 *
 * Pipeline: inlineImages -> buildSvgString -> (.svg download | draw at N x).
 */

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  arrowHead,
  diamondPoints,
  fontFamilyFor,
  getBounds,
  strokeToPath,
} from './canvas'
import { urlToDataURL } from './image'
import { seededRandom, sketchEllipse, sketchLine, sketchPolygon, sketchRect } from './sketch'
import ChartElement from '../components/board/ChartElement'

const INK = '#16161d'
const PAD = 48

const n = (value) => Math.round(value * 100) / 100

const escapeXml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

const escapeAttr = (value) => escapeXml(value).replace(/"/g, '&quot;')

/* ------------------------------------------------------------ word wrap -- */

function wrapLines(text, width, fontSize) {
  const chars = Math.max(1, Math.floor((width - 4) / (fontSize * 0.55)))
  const lines = []

  for (const paragraph of String(text ?? '').split('\n')) {
    if (paragraph === '') {
      lines.push('')
      continue
    }

    let line = ''
    for (const word of paragraph.split(/\s+/)) {
      if (!word) continue
      let chunk = word

      while (chunk.length > chars) {
        if (line) {
          lines.push(line)
          line = ''
        }
        lines.push(chunk.slice(0, chars))
        chunk = chunk.slice(chars)
      }

      if (!line) line = chunk
      else if (line.length + 1 + chunk.length <= chars) line += ` ${chunk}`
      else {
        lines.push(line)
        line = chunk
      }
    }
    lines.push(line)
  }

  return lines
}

/**
 * Word-wrapped text as an SVG <text> with one <tspan> per line.
 * `valign` + `h` vertically centre/bottom-align the block inside `y … y + h`.
 */
export function textSvg(x, y, w, text, opts = {}) {
  const {
    fontSize = 14,
    lineHeight = 1.35,
    font = 'sans',
    weight = 500,
    color = INK,
    align = 'left',
    valign = 'top',
    h = null,
  } = opts

  const value = String(text ?? '')
  if (!value) return ''

  const lines = wrapLines(value, w, fontSize)
  const lineH = fontSize * lineHeight
  const total = lines.length * lineH
  const anchor = align === 'center' ? 'middle' : align === 'right' ? 'end' : 'start'
  const tx = align === 'center' ? x + w / 2 : align === 'right' ? x + w : x

  let top = y
  if (h != null) {
    if (valign === 'middle') top = y + (h - total) / 2
    else if (valign === 'bottom') top = y + h - total
  }

  const family = fontFamilyFor(font).replace(/"/g, "'")
  const spans = lines
    .map(
      (line, index) =>
        `<tspan x="${n(tx)}" y="${n(top + index * lineH + fontSize * 0.8)}">${escapeXml(line)}</tspan>`,
    )
    .join('')

  return (
    `<text font-family="${escapeAttr(family)}" font-size="${n(fontSize)}"` +
    ` font-weight="${weight}" fill="${escapeAttr(color)}" text-anchor="${anchor}"` +
    ` xml:space="preserve">${spans}</text>`
  )
}

/* ------------------------------------------------------------ elements --- */

function shapeSvg(type, b, d, rand) {
  const fill = d.fill && d.fill !== 'transparent' ? d.fill : 'none'
  const hasFill = fill !== 'none'
  const strokeWidth = d.strokeWidth || 2
  const sketch = Boolean(d.sketch)
  const color = d.stroke || d.color || INK
  const stroke = sketch ? 'none' : d.stroke || (hasFill ? 'none' : INK)
  const paint = `fill="${escapeAttr(fill)}" stroke="${escapeAttr(stroke)}" stroke-width="${
    stroke === 'none' ? 0 : n(strokeWidth)
  }"`

  let shape = ''
  if (type === 'rect') {
    shape =
      `<rect x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}"` +
      ` rx="${d.radius ?? 8}" ${paint}/>`
  } else if (type === 'ellipse') {
    shape =
      `<ellipse cx="${n(b.x + b.w / 2)}" cy="${n(b.y + b.h / 2)}"` +
      ` rx="${n(b.w / 2)}" ry="${n(b.h / 2)}" ${paint}/>`
  } else {
    const points = diamondPoints(b)
      .map(([px, py]) => `${n(px)},${n(py)}`)
      .join(' ')
    shape = `<polygon points="${points}" ${paint}/>`
  }

  let outline = ''
  if (sketch) {
    const path =
      type === 'rect'
        ? sketchRect(b.x, b.y, b.w, b.h, rand)
        : type === 'ellipse'
          ? sketchEllipse(b.x + b.w / 2, b.y + b.h / 2, b.w / 2, b.h / 2, rand)
          : sketchPolygon(diamondPoints(b), rand)
    outline =
      `<path d="${path}" fill="none" stroke="${escapeAttr(color)}" stroke-width="${n(strokeWidth)}"` +
      ' stroke-linecap="round" stroke-linejoin="round"/>'
  }

  const label = d.label
    ? textSvg(b.x + 8, b.y + 8, Math.max(1, b.w - 16), d.label, {
        fontSize: d.font === 'hand' ? 16 : 14,
        lineHeight: 1.3,
        font: d.font,
        weight: 600,
        color: INK,
        align: 'center',
        valign: 'middle',
        h: Math.max(1, b.h - 16),
      })
    : ''

  return `<g>${shape}${outline}${label}</g>`
}

function bulletSvg(b, d) {
  const fontSize = d.fontSize || 16
  const style = d.bulletStyle || 'disc'
  const indent = fontSize * 1.3 // matches the renderer's ul { padding-left: 1.3em }
  const markOf = (index) => {
    if (style === 'decimal') return `${index + 1}.`
    if (style === 'circle') return '○'
    if (style === 'square') return '▪'
    if (style === 'none') return ''
    return '•'
  }

  const lines = []
  const items = Array.isArray(d.items) ? d.items : []
  items.forEach((item, index) => {
    const mark = markOf(index)
    const wrapped = wrapLines(String(item ?? ''), Math.max(20, b.w - indent), fontSize)
    wrapped.forEach((line, position) => {
      if (position === 0) lines.push(mark ? `${mark} ${line}` : line)
      else lines.push(` ${mark.replace(/\S/g, ' ')} ${line}`)
    })
  })
  if (!lines.length) lines.push('')

  return textSvg(b.x, b.y, b.w, lines.join('\n'), {
    fontSize,
    lineHeight: 1.5,
    font: d.font,
    weight: 400,
    color: d.color || INK,
  })
}

/** One element -> an SVG markup string (already rotation-wrapped). */
export function elementSvg(el) {
  const d = el?.data || {}
  const type = el?.type
  const b = getBounds(el)
  const rand = seededRandom(el?.id)

  let body = ''

  if (type === 'rect' || type === 'ellipse' || type === 'diamond') {
    body = shapeSvg(type, b, d, rand)
  } else if (type === 'line' || type === 'arrow') {
    const x1 = d.x1 || 0
    const y1 = d.y1 || 0
    const x2 = d.x2 || 0
    const y2 = d.y2 || 0
    const color = d.color || d.stroke || INK
    const strokeWidth = d.strokeWidth || 2

    body = d.sketch
      ? `<path d="${sketchLine(x1, y1, x2, y2, rand, Math.max(1.2, strokeWidth * 0.5))}"` +
        ` fill="none" stroke="${escapeAttr(color)}" stroke-width="${n(strokeWidth)}" stroke-linecap="round"/>`
      : `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}"` +
        ` stroke="${escapeAttr(color)}" stroke-width="${n(strokeWidth)}" stroke-linecap="round"/>`

    if (type === 'arrow') {
      body += `<polygon points="${arrowHead(x1, y1, x2, y2, Math.max(10, strokeWidth * 3.2))}" fill="${escapeAttr(color)}"/>`
    }
  } else if (type === 'draw') {
    const path = strokeToPath(d.points || [], d.strokeWidth || 4)
    if (path) body = `<path d="${path}" fill="${escapeAttr(d.color || d.stroke || INK)}" stroke="none"/>`
  } else if (type === 'text') {
    body = textSvg(b.x, b.y, b.w, d.text, {
      fontSize: d.fontSize || 20,
      lineHeight: 1.35,
      font: d.font,
      weight: d.weight || 500,
      color: d.color || INK,
    })
  } else if (type === 'sticky') {
    const text = d.text ?? d.label
    body =
      `<rect x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}" rx="10"` +
      ` fill="${escapeAttr(d.fill || '#fde68a')}" stroke="rgba(22,22,29,0.06)" stroke-width="1"/>` +
      (text
        ? textSvg(b.x + 14, b.y + 14, Math.max(1, b.w - 28), text, {
            fontSize: d.fontSize || 16,
            lineHeight: d.font === 'hand' ? 1.15 : 1.35,
            font: d.font,
            weight: 400,
            color: INK,
          })
        : '')
  } else if (type === 'bullet') {
    body = bulletSvg(b, d)
  } else if (type === 'chart') {
    // .js files parse without JSX under Vite's oxc transform, so the chart is
    // built with createElement — same output as <ChartElement element={el} />.
    body = renderToStaticMarkup(createElement(ChartElement, { element: el }))
  } else if (type === 'image') {
    body =
      `<image href="${escapeAttr(d.src || '')}" x="${n(b.x)}" y="${n(b.y)}"` +
      ` width="${n(b.w)}" height="${n(b.h)}" preserveAspectRatio="xMidYMid slice"/>`
  } else if (type === 'emoji') {
    body =
      `<text x="${n(b.x + b.w / 2)}" y="${n(b.y + b.h / 2)}"` +
      ` font-size="${n(Math.min(b.w, b.h) * 0.86)}" text-anchor="middle" dominant-baseline="central">` +
      `${escapeXml(d.emoji || d.text || '😀')}</text>`
  }

  if (!body) return ''

  const rotation = Number(d.rotation) || 0
  if (!rotation) return body

  const cx = b.x + b.w / 2
  const cy = b.y + b.h / 2
  return `<g transform="rotate(${n(rotation)} ${n(cx)} ${n(cy)})">${body}</g>`
}

/* --------------------------------------------------------------- scene --- */

/** Union of every element's bounds, padded by PAD (or a sane empty frame). */
function sceneBounds(elements) {
  if (!elements?.length) return { x: 0, y: 0, w: 1200, h: 800 }

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const element of elements) {
    const b = getBounds(element)
    if (b.x < minX) minX = b.x
    if (b.y < minY) minY = b.y
    if (b.x + b.w > maxX) maxX = b.x + b.w
    if (b.y + b.h > maxY) maxY = b.y + b.h
  }

  return {
    x: minX - PAD,
    y: minY - PAD,
    w: Math.max(1, maxX - minX) + PAD * 2,
    h: Math.max(1, maxY - minY) + PAD * 2,
  }
}

/** Scene bounds + background rect + every element, as one <svg> string. */
export function buildSvgString(elements, { background = '#ffffff' } = {}) {
  const b = sceneBounds(elements)
  const body = (elements || []).map(elementSvg).join('')

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"` +
    ` width="${n(b.w)}" height="${n(b.h)}" viewBox="${n(b.x)} ${n(b.y)} ${n(b.w)} ${n(b.h)}">` +
    `<rect x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}" fill="${escapeAttr(background)}"/>` +
    `${body}</svg>`
  )
}

/* ------------------------------------------------------------ downloads --- */

/** Swap every image element's src for a data: URL (best effort). */
export async function inlineImages(elements) {
  return Promise.all(
    (elements || []).map(async (element) => {
      if (element?.type !== 'image' || typeof element.data?.src !== 'string') return element
      if (element.data.src.startsWith('data:')) return element
      try {
        const src = await urlToDataURL(element.data.src)
        return { ...element, data: { ...element.data, src } }
      } catch {
        return element // export still works; that <image> just won't paint
      }
    }),
  )
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Inline images -> SVG string -> download as `<name>.svg`. */
export async function exportSVG(elements, name = 'whiteboard') {
  const inlined = await inlineImages(elements)
  const svg = buildSvgString(inlined)
  downloadBlob(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), `${name}.svg`)
  return svg
}

/** Inline images -> SVG -> paint on a canvas at `scale` x -> download PNG. */
export async function exportPNG(elements, name = 'whiteboard', scale = 2) {
  const inlined = await inlineImages(elements)
  const svg = buildSvgString(inlined, { background: '#ffffff' })
  const b = sceneBounds(inlined)
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)

  try {
    const image = new Image()
    await new Promise((resolve, reject) => {
      image.onload = resolve
      image.onerror = () => reject(new Error('Could not rasterize the board'))
      image.src = url
    })

    const width = Math.max(1, Math.round(b.w * scale))
    const height = Math.max(1, Math.round(b.h * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(image, 0, 0, width, height)

    const png = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!png) throw new Error('Could not encode the PNG')

    downloadBlob(png, `${name}.png`)
    return png
  } finally {
    URL.revokeObjectURL(url)
  }
}
