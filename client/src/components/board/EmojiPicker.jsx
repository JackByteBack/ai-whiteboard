import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { cn } from '../../lib/utils'

const CATEGORIES = [
  {
    id: 'smileys',
    label: 'Smileys',
    emojis: [
      '😀', '😃', '😄', '😁', '😆', '😅',
      '😂', '🙂', '🙃', '😉', '😊', '😍',
      '🥰', '😘', '😜', '🤪', '🤔', '🤨',
      '😐', '😴', '🥱', '😎', '🤓', '🥳',
    ],
  },
  {
    id: 'gestures',
    label: 'Gestures',
    emojis: [
      '👍', '👎', '👌', '🤌', '🤏', '✌️',
      '🤞', '🫶', '👏', '🙌', '🙏', '💪',
      '🤝', '👋', '🤚', '🖐️', '✋', '👉',
      '👈', '👆', '👇', '🫰', '🤙', '☝️',
    ],
  },
  {
    id: 'objects',
    label: 'Objects',
    emojis: [
      '💻', '🖥️', '⌨️', '🖱️', '📱', '📟',
      '📠', '🔋', '🔌', '💡', '🔦', '📷',
      '🎥', '🎙️', '🎧', '📚', '📖', '✏️',
      '📝', '📌', '📎', '🔗', '⏰', '🕰️',
    ],
  },
  {
    id: 'nature',
    label: 'Nature',
    emojis: [
      '🌸', '🌺', '🌻', '🌷', '🌹', '🌵',
      '🌴', '🌳', '🌿', '🍀', '🍁', '🍂',
      '🌾', '🌊', '🌈', '⛅', '☀️', '🌙',
      '⭐', '🌟', '☁️', '❄️', '🐶', '🦋',
    ],
  },
]

/** Floating emoji palette — pick one to drop it on the canvas. */
export default function EmojiPicker({ open, onClose, onPick }) {
  const [category, setCategory] = useState(CATEGORIES[0].id)
  const cardRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined

    const onPointerDown = (event) => {
      if (cardRef.current && !cardRef.current.contains(event.target)) onClose?.()
    }
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.()
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onClose])

  const active = CATEGORIES.find((item) => item.id === category) || CATEGORIES[0]

  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          ref={cardRef}
          initial={{ opacity: 0, x: -10, scale: 0.97 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: -10, scale: 0.97 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          className="card absolute left-20 top-1/2 z-40 w-72 -translate-y-1/2 overflow-hidden rounded-2xl shadow-[var(--shadow-lift)]"
        >
          <header className="flex items-center justify-between border-b border-line px-4 py-3">
            <h3 className="font-display text-sm font-semibold text-ink">Emojis</h3>
            <button
              type="button"
              aria-label="Close emoji picker"
              onClick={onClose}
              className="focus-ring grid h-7 w-7 cursor-pointer place-items-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-ink"
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          <div className="flex gap-1 border-b border-line px-2 py-2">
            {CATEGORIES.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setCategory(item.id)}
                className={cn(
                  'flex-1 cursor-pointer rounded-lg px-1 py-1.5 text-[11px] font-semibold transition-colors focus-ring',
                  category === item.id
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-muted hover:bg-surface-2 hover:text-ink',
                )}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="grid max-h-64 grid-cols-6 gap-1 overflow-y-auto p-3">
            {active.emojis.map((emoji) => (
              <button
                key={emoji}
                type="button"
                title={emoji}
                onClick={() => onPick?.(emoji)}
                className="grid h-9 cursor-pointer place-items-center rounded-lg text-xl leading-none transition-transform hover:scale-125 focus-ring"
              >
                {emoji}
              </button>
            ))}
          </div>

          <p className="border-t border-line px-4 py-2.5 text-center text-[11px] text-faint">
            Click to drop it on the canvas
          </p>
        </motion.aside>
      )}
    </AnimatePresence>
  )
}
