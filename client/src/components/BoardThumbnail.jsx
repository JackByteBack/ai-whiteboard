import { useEffect, useMemo, useRef, useState } from 'react'
import { PenLine } from 'lucide-react'
import { boardApi } from '../lib/api'
import { getBounds } from '../lib/canvas'
import ElementRenderer from './board/ElementRenderer'

/** boardId + updatedAt -> elements, so re-renders never refetch. */
const cache = new Map()
const cacheKey = (boardId, updatedAt) => `${boardId}:${updatedAt}`

/** Union of every element's AABB, padded by ~4%. */
function sceneBounds(elements) {
  if (!elements.length) return { x: 0, y: 0, w: 400, h: 300 }

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const element of elements) {
    const b = getBounds(element)
    minX = Math.min(minX, b.x)
    minY = Math.min(minY, b.y)
    maxX = Math.max(maxX, b.x + b.w)
    maxY = Math.max(maxY, b.y + b.h)
  }

  const w = Math.max(1, maxX - minX)
  const h = Math.max(1, maxY - minY)
  const padX = w * 0.04
  const padY = h * 0.04

  return { x: minX - padX, y: minY - padY, w: w + padX * 2, h: h + padY * 2 }
}

/** Live, non-interactive scaled preview of a board's elements. */
export default function BoardThumbnail({ boardId, updatedAt }) {
  const key = cacheKey(boardId, updatedAt)
  const holderRef = useRef(null)
  const [fetched, setFetched] = useState({ key: null, elements: null })

  // Cache wins (it survives re-renders and remounts), then whatever this
  // instance has fetched for the current key; otherwise we are still loading.
  const cached = cache.get(key)
  const elements = cached ?? (fetched.key === key ? fetched.elements : null)

  useEffect(() => {
    if (cached) return undefined

    const target = holderRef.current
    if (!target) return undefined

    let alive = true
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        observer.disconnect()

        boardApi
          .get(boardId)
          .then((payload) => {
            const loaded = payload?.elements || []
            cache.set(key, loaded)
            if (alive) setFetched({ key, elements: loaded })
          })
          .catch(() => {
            if (alive) setFetched({ key, elements: [] })
          })
      },
      { rootMargin: '300px' },
    )

    observer.observe(target)
    return () => {
      alive = false
      observer.disconnect()
    }
  }, [key, boardId, cached])

  const bounds = useMemo(() => sceneBounds(elements || []), [elements])
  const ready = Array.isArray(elements) && elements.length > 0

  if (!ready) {
    return (
      <div ref={holderRef} className="grid h-full w-full place-items-center text-faint">
        <PenLine className="h-5 w-5" />
      </div>
    )
  }

  return (
    <div ref={holderRef} className="h-full w-full">
      <svg
        viewBox={`${bounds.x} ${bounds.y} ${bounds.w} ${bounds.h}`}
        preserveAspectRatio="xMidYMid meet"
        className="h-full w-full"
        aria-hidden="true"
      >
        {elements.map((element) => {
          const rotation = element.data?.rotation
          if (!rotation) {
            return (
              <g key={element.id}>
                <ElementRenderer element={element} />
              </g>
            )
          }

          const b = getBounds(element)
          return (
            <g
              key={element.id}
              transform={`rotate(${rotation} ${b.x + b.w / 2} ${b.y + b.h / 2})`}
            >
              <ElementRenderer element={element} />
            </g>
          )
        })}
      </svg>
    </div>
  )
}
