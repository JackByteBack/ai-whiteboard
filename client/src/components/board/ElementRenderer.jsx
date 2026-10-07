import {
  arrowHead,
  diamondPoints,
  fontFamilyFor,
  getBounds,
  strokeToPath,
} from '../../lib/canvas'
import {
  seededRandom,
  sketchEllipse,
  sketchLine,
  sketchPolygon,
  sketchRect,
} from '../../lib/sketch'
import ChartElement from './ChartElement'

const INK = '#16161d'

/** Centered HTML label living inside an SVG <foreignObject>. */
function CenteredLabel({ bounds, text, font, size = 14 }) {
  return (
    <foreignObject x={bounds.x} y={bounds.y} width={bounds.w} height={bounds.h}>
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 8,
          textAlign: 'center',
          fontFamily: fontFamilyFor(font),
          fontSize: font === 'hand' ? 16 : size,
          fontWeight: 600,
          lineHeight: 1.3,
          color: INK,
          overflow: 'hidden',
          wordBreak: 'break-word',
        }}
      >
        {text}
      </div>
    </foreignObject>
  )
}

function TextOverlay({ bounds, style, children }) {
  return (
    <foreignObject x={bounds.x} y={bounds.y} width={bounds.w} height={bounds.h}>
      <div style={{ width: '100%', height: '100%', overflow: 'hidden', ...style }}>{children}</div>
    </foreignObject>
  )
}

/** Renders ONE board element as SVG children (used by thumbnails + canvas). */
export default function ElementRenderer({ element, editing = false }) {
  const d = element?.data || {}
  const type = element?.type
  const bounds = getBounds(element)
  const rand = seededRandom(element?.id)

  if (type === 'rect' || type === 'ellipse' || type === 'diamond') {
    const fill = d.fill && d.fill !== 'transparent' ? d.fill : 'none'
    const hasFill = fill !== 'none'
    const strokeWidth = d.strokeWidth || 2
    const sketch = Boolean(d.sketch)
    const color = d.stroke || d.color || INK
    const stroke = sketch ? 'none' : d.stroke || (hasFill ? 'none' : INK)

    const geometry = { fill, stroke, strokeWidth: stroke === 'none' ? 0 : strokeWidth }

    const outline = (() => {
      if (!sketch) return null
      const path =
        type === 'rect'
          ? sketchRect(bounds.x, bounds.y, bounds.w, bounds.h, rand)
          : type === 'ellipse'
            ? sketchEllipse(
                bounds.x + bounds.w / 2,
                bounds.y + bounds.h / 2,
                bounds.w / 2,
                bounds.h / 2,
                rand,
              )
            : sketchPolygon(diamondPoints(bounds), rand)
      return (
        <path
          d={path}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )
    })()

    return (
      <g>
        {type === 'rect' && <rect x={bounds.x} y={bounds.y} width={bounds.w} height={bounds.h} rx={d.radius ?? 8} {...geometry} />}
        {type === 'ellipse' && (
          <ellipse cx={bounds.x + bounds.w / 2} cy={bounds.y + bounds.h / 2} rx={bounds.w / 2} ry={bounds.h / 2} {...geometry} />
        )}
        {type === 'diamond' && (
          <polygon points={diamondPoints(bounds).map(([px, py]) => `${px},${py}`).join(' ')} {...geometry} />
        )}
        {outline}
        {!editing && d.label && <CenteredLabel bounds={bounds} text={d.label} font={d.font} />}
      </g>
    )
  }

  if (type === 'line' || type === 'arrow') {
    const x1 = d.x1 || 0
    const y1 = d.y1 || 0
    const x2 = d.x2 || 0
    const y2 = d.y2 || 0
    const color = d.color || d.stroke || INK
    const strokeWidth = d.strokeWidth || 2

    return (
      <g>
        {d.sketch ? (
          <path
            d={sketchLine(x1, y1, x2, y2, rand, Math.max(1.2, strokeWidth * 0.5))}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
        ) : (
          <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
        )}
        {type === 'arrow' && (
          <polygon points={arrowHead(x1, y1, x2, y2, Math.max(10, strokeWidth * 3.2))} fill={color} />
        )}
      </g>
    )
  }

  if (type === 'draw') {
    return (
      <path
        d={strokeToPath(d.points || [], d.strokeWidth || 4)}
        fill={d.color || d.stroke || INK}
        stroke="none"
      />
    )
  }

  if (type === 'image') {
    return (
      <image
        href={d.src}
        x={bounds.x}
        y={bounds.y}
        width={bounds.w}
        height={bounds.h}
        preserveAspectRatio="xMidYMid slice"
      />
    )
  }

  if (type === 'emoji') {
    return (
      <text
        x={bounds.x + bounds.w / 2}
        y={bounds.y + bounds.h / 2}
        fontSize={Math.min(bounds.w, bounds.h) * 0.86}
        textAnchor="middle"
        dominantBaseline="central"
      >
        {d.emoji || d.text || '😀'}
      </text>
    )
  }

  if (type === 'sticky') {
    return (
      <g>
        <rect
          x={bounds.x}
          y={bounds.y}
          width={bounds.w}
          height={bounds.h}
          rx="10"
          fill={d.fill || '#fde68a'}
          stroke="rgba(22,22,29,0.06)"
          strokeWidth="1"
        />
        {!editing && (d.text ?? d.label) ? (
          <TextOverlay
            bounds={bounds}
            style={{
              padding: 14,
              fontFamily: fontFamilyFor(d.font),
              fontSize: d.fontSize || 16,
              lineHeight: d.font === 'hand' ? 1.15 : 1.35,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              color: INK,
            }}
          >
            {d.text ?? d.label}
          </TextOverlay>
        ) : null}
      </g>
    )
  }

  if (type === 'text') {
    if (editing) return null
    return (
      <TextOverlay
        bounds={bounds}
        style={{
          fontFamily: fontFamilyFor(d.font),
          fontSize: d.fontSize || 20,
          fontWeight: d.weight || 500,
          lineHeight: 1.35,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          color: d.color || INK,
        }}
      >
        {d.text}
      </TextOverlay>
    )
  }

  if (type === 'bullet') {
    if (editing) return null
    return (
      <TextOverlay bounds={bounds} style={{ height: '100%' }}>
        <ul
          style={{
            margin: 0,
            paddingLeft: '1.3em',
            listStyleType: d.bulletStyle || 'disc',
            fontFamily: fontFamilyFor(d.font),
            fontSize: d.fontSize || 16,
            lineHeight: 1.5,
            color: d.color || INK,
          }}
        >
          {(d.items || []).map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      </TextOverlay>
    )
  }

  if (type === 'chart') {
    return <ChartElement element={element} />
  }

  return null
}
