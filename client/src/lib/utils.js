const AVATAR_COLORS = [
  '#2f8159',
  '#2c9c8f',
  '#6f9b54',
  '#5f7da6',
  '#c26a45',
  '#9a7b3c',
  '#a05d7d',
]

/** Flatten, filter and join class names. */
export function cn(...args) {
  return args.flat(Infinity).filter(Boolean).join(' ')
}

/** Up to 2 uppercase initials from a name, "?" when there is nothing to show. */
export function initials(name = '') {
  const words = String(name)
    .trim()
    .split(/\s+/)
    .filter(Boolean)

  if (!words.length) return '?'

  const first = words[0][0]
  const second = words.length > 1 ? words[words.length - 1][0] : words[0][1] || ''

  return (first + second).toUpperCase()
}

/** Deterministic color for an id/email/name so avatars stay stable. */
export function colorFromId(id = '') {
  const key = String(id)
  let hash = 0
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

/** Compact relative timestamp: "just now" / "5m ago" / "3h ago" / "2d ago" / "4mo ago" / "1y ago". */
export function relativeTime(date) {
  const then = date instanceof Date ? date.getTime() : new Date(date).getTime()
  if (Number.isNaN(then)) return ''

  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000))
  if (seconds < 60) return 'just now'

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`

  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`

  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo ago`

  return `${Math.floor(months / 12)}y ago`
}
