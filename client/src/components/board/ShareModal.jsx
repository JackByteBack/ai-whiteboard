import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { UserPlus, X } from 'lucide-react'
import Modal from '../ui/Modal'
import Avatar from '../ui/Avatar'
import Button from '../ui/Button'
import { Input, Select } from '../ui/Input'
import { boardApi, userApi } from '../../lib/api'
import { cn } from '../../lib/utils'

const ROLE_BADGE = {
  owner: 'bg-brand-50 text-brand-700',
  editor: 'bg-surface-2 text-ink',
  viewer: 'bg-surface-2 text-muted',
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Owner-only invite + access list dialog. */
export default function ShareModal({ open, onClose, boardId, members = [], setMembers, ownerId }) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('editor')
  const [busy, setBusy] = useState(null) // 'invite' | `remove:${id}`
  const [suggestions, setSuggestions] = useState([])

  // Look up existing users while an email is being typed.
  useEffect(() => {
    if (!open || email.trim().length < 2) return undefined

    let cancelled = false
    const timer = setTimeout(() => {
      userApi
        .search(email.trim())
        .then((users) => {
          if (!cancelled) setSuggestions(users || [])
        })
        .catch(() => {
          if (!cancelled) setSuggestions([])
        })
    }, 300)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [open, email])

  const invite = async (event) => {
    event.preventDefault()
    const target = email.trim().toLowerCase()

    if (!EMAIL_RE.test(target)) {
      toast.error('Enter a valid email address')
      return
    }
    if (busy) return

    setBusy('invite')
    try {
      const member = await boardApi.addMember(boardId, { email: target, role })
      setMembers?.((previous) => {
        const rest = (previous || []).filter((item) => item.id !== member.id)
        return [...rest, member]
      })
      setEmail('')
      setSuggestions([])
      toast.success(`${member.name || member.email} can now ${role} this board`)
    } catch (error) {
      toast.error(error.message || 'Could not invite that person')
    } finally {
      setBusy(null)
    }
  }

  const remove = async (member) => {
    if (busy) return
    setBusy(`remove:${member.id}`)
    try {
      await boardApi.removeMember(boardId, member.id)
      setMembers?.((previous) => (previous || []).filter((item) => item.id !== member.id))
      toast.success('Access removed')
    } catch (error) {
      toast.error(error.message || 'Could not remove that person')
    } finally {
      setBusy(null)
    }
  }

  const sorted = [...members].sort(
    (a, b) => Number(b.id === ownerId) - Number(a.id === ownerId),
  )

  const knownEmails = new Set(members.map((member) => (member.email || '').toLowerCase()))
  const visibleSuggestions = suggestions.filter(
    (user) => !knownEmails.has((user.email || '').toLowerCase()),
  )

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Share whiteboard"
      description="Invite people by email to collaborate."
    >
      <form onSubmit={invite} className="relative mb-5 flex items-center gap-2">
        <div className="relative flex-1">
          <Input
            type="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value)
              if (event.target.value.trim().length < 2) setSuggestions([])
            }}
            placeholder="name@company.com"
            aria-label="Email address"
            className="rounded-full"
            autoComplete="off"
          />

          {visibleSuggestions.length > 0 && (
            <ul className="card absolute left-0 top-full z-10 mt-2 w-full overflow-hidden rounded-2xl p-1 shadow-[var(--shadow-lift)]">
              {visibleSuggestions.slice(0, 5).map((user) => (
                <li key={user.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setEmail(user.email)
                      setSuggestions([])
                    }}
                    className="flex w-full cursor-pointer items-center gap-2 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-surface-2"
                  >
                    <Avatar user={user} size="sm" />
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-semibold text-ink">
                        {user.name}
                      </span>
                      <span className="block truncate text-[11px] text-muted">{user.email}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="w-28 shrink-0">
          <Select
            value={role}
            onChange={(event) => setRole(event.target.value)}
            aria-label="Role"
          >
            <option value="editor">Editor</option>
            <option value="viewer">Viewer</option>
          </Select>
        </div>

        <Button type="submit" size="md" disabled={busy === 'invite'} loading={busy === 'invite'}>
          <UserPlus className="h-4 w-4" />
          Invite
        </Button>
      </form>

      <p className="mb-2 text-xs font-semibold text-muted">
        People with access ({members.length})
      </p>

      <ul className="space-y-1.5">
        {sorted.map((member) => {
          const removing = busy === `remove:${member.id}`
          const isOwner = member.id === ownerId || member.role === 'owner'
          return (
            <li
              key={member.id}
              className="flex items-center gap-3 rounded-2xl border border-line px-3 py-2"
            >
              <Avatar user={member} size="md" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">
                  {member.name || member.email}
                </p>
                <p className="truncate text-xs text-muted">{member.email}</p>
              </div>

              <span
                className={cn(
                  'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                  ROLE_BADGE[member.role] || ROLE_BADGE.viewer,
                )}
              >
                {member.role === 'owner' ? 'Owner' : member.role === 'viewer' ? 'Viewer' : 'Editor'}
              </span>

              {!isOwner && (
                <button
                  type="button"
                  aria-label={`Remove ${member.name || member.email}`}
                  disabled={Boolean(busy)}
                  onClick={() => remove(member)}
                  className={cn(
                    'grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-full text-faint transition-colors hover:bg-danger/10 hover:text-danger focus-ring disabled:pointer-events-none disabled:opacity-40',
                    removing && 'animate-pulse',
                  )}
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </Modal>
  )
}
