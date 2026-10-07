import { getBounds } from '../../lib/canvas'

export const CHART_PALETTE = [
  '#2f8159',
  '#2563eb',
  '#e11d48',
  '#d97706',
  '#7c3aed',
  '#0891b2',
  '#ec4899',
  '#16a34a',
]

const AXIS_COLOR = '#e2e0f0'
const LABEL_COLOR = '#5d5d6e'
const FAINT_COLOR = '#9a9aae'
const START_ANGLE = -Math.PI / 2

const SAMPLES = {
  bar: {
    title: 'Ideas per day',
    data: [
      { label: 'Mon', value: 12 },
      { label: 'Tue', value: 26 },
      { label: 'Wed', value: 19 },
      { label: 'Thu', value: 34 },
      { label: 'Fri', value: 28 },
    ],
  },
  line: {
    title: 'Weekly activity',
    data: [
      { label: 'W1', value: 24 },
      { label: 'W2', value: 31 },
      { label: 'W3', value: 27 },
      { label: 'W4', value: 45 },
      { label: 'W5', value: 39 },
    ],
  },
  pie: {
    title: 'Where time goes',
    data: [
      { label: 'Design', value: 34 },
      { label: 'Research', value: 26 },
      { label: 'Build', value: 22 },
      { label: 'Ops', value: 18 },
    ],
  },
  donut: {
    title: 'Board mix',
    data: [
      { label: 'Personal', value: 42 },
      { label: 'Team', value: 33 },
      { label: 'Shared', value: 25 },
    ],
  },
}

/** A sensible sample payload for a fresh chart of the given type. */
export function defaultChartData(chartType = 'bar') {
  const sample = SAMPLES[chartType] || SAMPLES.bar
  return {
    chartType,
    title: sample.title,
    data: sample.data.map((point) => ({ ...point })),
  }
}

const colorOf = (item, index) => item.color || CHART_PALETTE[index % CHART_PALETTE.length]

const formatValue = (value) => (Number.isInteger(value) ? String(value) : value.toFixed(1))

const shortLabel = (label) => {
  const text = String(label ?? '')
  return text.length > 13 ? `${text.slice(0, 12)}…` : text
}

const polar = (cx, cy, radius, angle) => [
  cx + radius * Math.cos(angle),
  cy + radius * Math.sin(angle),
]

function arcPath(cx, cy, outer, inner, a0, a1) {
  const sweep = Math.max(0.001, a1 - a0)
  const end = a0 + sweep
  const large = sweep > Math.PI ? 1 : 0
  const [x0, y0] = polar(cx, cy, outer, a0)
  const [x1, y1] = polar(cx, cy, outer, end)

  if (!inner) {
    return `M ${cx} ${cy} L ${x0} ${y0} A ${outer} ${outer} 0 ${large} 1 ${x1} ${y1} Z`
  }

  const [x2, y2] = polar(cx, cy, inner, end)
  const [x3, y3] = polar(cx, cy, inner, a0)
  return [
    `M ${x0} ${y0}`,
    `A ${outer} ${outer} 0 ${large} 1 ${x1} ${y1}`,
    `L ${x2} ${y2}`,
    `A ${inner} ${inner} 0 ${large} 0 ${x3} ${y3}`,
    'Z',
  ].join(' ')
}

/**
 * Draws a chart as SVG children (no HTML): white rounded frame, bold title,
 * and bar / line / pie / donut geometry. Used by ElementRenderer.
 */
export default function ChartElement({ element }) {
  const d = element?.data || {}
  const chartType = d.chartType || 'bar'
  const items = (Array.isArray(d.data) ? d.data : []).filter(
    (item) => item && Number.isFinite(Number(item.value)),
  )

  const b = getBounds(element)
  const x = b.x
  const y = b.y
  const w = Math.max(b.w, 140)
  const h = Math.max(b.h, 120)

  const values = items.map((item) => Math.max(0, Number(item.value)))
  const total = values.reduce((sum, value) => sum + value, 0)
  const max = Math.max(...values, 1)

  let content = null

  if (chartType === 'bar' || chartType === 'line') {
    const plotX = x + 44
    const plotY = y + 42
    const plotW = Math.max(30, w - 60)
    const plotH = Math.max(30, h - 76)
    const slot = plotW / Math.max(items.length, 1)

    const axes = (
      <g stroke={AXIS_COLOR} strokeWidth="1">
        <line x1={plotX} y1={plotY - 4} x2={plotX} y2={plotY + plotH} />
        <line x1={plotX} y1={plotY + plotH} x2={plotX + plotW} y2={plotY + plotH} />
      </g>
    )

    const labels = items.map((item, index) => {
      const px =
        chartType === 'line'
          ? plotX + (items.length === 1 ? plotW / 2 : (index / (items.length - 1)) * plotW)
          : plotX + index * slot + slot / 2
      return (
        <text key={`label-${index}`} x={px} y={plotY + plotH + 18} fontSize="11" textAnchor="middle" fill={FAINT_COLOR}>
          {String(item.label ?? '')}
        </text>
      )
    })

    if (chartType === 'bar') {
      const barW = Math.min(slot * 0.62, 60)
      content = (
        <g>
          {axes}
          {items.map((item, index) => {
            const value = values[index]
            const barH = (value / max) * plotH
            const bx = plotX + index * slot + (slot - barW) / 2
            const by = plotY + plotH - barH
            return (
              <g key={index}>
                <rect x={bx} y={by} width={barW} height={Math.max(barH, 2)} rx="4" fill={colorOf(item, index)} />
                <text x={bx + barW / 2} y={by - 7} fontSize="11" textAnchor="middle" fill={LABEL_COLOR}>
                  {formatValue(value)}
                </text>
              </g>
            )
          })}
          {labels}
        </g>
      )
    } else {
      const points = items.map((item, index) => {
        const px = plotX + (items.length === 1 ? plotW / 2 : (index / (items.length - 1)) * plotW)
        const py = plotY + plotH - (values[index] / max) * plotH
        return [px, py]
      })
      const lineColor = colorOf(items[0] || {}, 0)
      content = (
        <g>
          {axes}
          <polyline
            points={points.map((p) => p.join(',')).join(' ')}
            fill="none"
            stroke={lineColor}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {points.map(([px, py], index) => (
            <circle key={index} cx={px} cy={py} r="3.5" fill="#ffffff" stroke={lineColor} strokeWidth="2" />
          ))}
          {labels}
        </g>
      )
    }
  } else if (chartType === 'pie' || chartType === 'donut') {
    const legendW = Math.min(124, w * 0.4)
    const areaW = Math.max(40, w - legendW - 24)
    const cx = x + 12 + areaW / 2
    const cy = y + h / 2 + 6
    const radius = Math.max(16, Math.min(areaW, h - 70) / 2 - 4)
    const inner = chartType === 'donut' ? radius * 0.58 : 0
    const safeTotal = total || 1

    // Cumulative sums -> slice angles, with no mutation during render.
    const prefix = values.reduce((acc, value) => acc.concat(acc[acc.length - 1] + value), [0])
    const slices = items.map((item, index) => {
      const start = START_ANGLE + (prefix[index] / safeTotal) * Math.PI * 2
      const end = START_ANGLE + (prefix[index + 1] / safeTotal) * Math.PI * 2
      return (
        <path
          key={index}
          d={arcPath(cx, cy, radius, inner, start, end)}
          fill={colorOf(item, index)}
          stroke="#ffffff"
          strokeWidth="1.5"
        />
      )
    })

    const legendX = x + w - legendW + 6
    const rowH = Math.max(16, Math.min(22, (h - 56) / Math.max(items.length, 1)))
    const legend = items.map((item, index) => {
      const ly = y + 44 + index * rowH
      const pct = Math.round((values[index] / safeTotal) * 100)
      return (
        <g key={`legend-${index}`}>
          <rect x={legendX} y={ly} width={10} height={10} rx="3" fill={colorOf(item, index)} />
          <text x={legendX + 16} y={ly + 9} fontSize="11" fill={LABEL_COLOR}>
            {shortLabel(item.label)}
          </text>
          <text x={x + w - 14} y={ly + 9} fontSize="11" textAnchor="end" fill={FAINT_COLOR}>
            {pct}%
          </text>
        </g>
      )
    })

    content = (
      <g>
        {slices}
        {legend}
      </g>
    )
  }

  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx="12" fill="#ffffff" stroke="#e9e8f3" strokeWidth="1" />
      {d.title ? (
        <text x={x + w / 2} y={y + 26} fontSize="14" fontWeight="700" textAnchor="middle" fill="#16161d">
          {d.title}
        </text>
      ) : null}
      {content}
    </g>
  )
}
