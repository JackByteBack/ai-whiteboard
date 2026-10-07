import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { LayoutGrid, PenLine, Plus, Trash2, Users } from 'lucide-react'
import { boardApi } from '../lib/api'
import { relativeTime } from '../lib/utils'
import BoardThumbnail from '../components/BoardThumbnail'
import UserMenu from '../components/UserMenu'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import Spinner from '../components/ui/Spinner'
import { Input, Select, Textarea } from '../components/ui/Input'

const TINTS = ['#ebf6ef', '#eef4ff', '#fdf2f8', '#fefce8', '#f5f3ff', '#fff7ed']
const EMPTY_FORM = { title: '', description: '', background: 'dots' }

export default function Dashboard() {
  const navigate = useNavigate()
  const [boards, setBoards] = useState(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)

  useEffect(() => {
    let alive = true

    boardApi
      .list()
      .then((list) => {
        if (alive) setBoards(Array.isArray(list) ? list : [])
      })
      .catch((error) => {
        if (!alive) return
        setBoards([])
        toast.error(error.message || 'Could not load your whiteboards')
      })

    return () => {
      alive = false
    }
  }, [])

  const openCreate = () => {
    setForm(EMPTY_FORM)
    setCreateOpen(true)
  }

  const closeCreate = () => {
    if (creating) return
    setCreateOpen(false)
  }

  const onSubmit = async (event) => {
    event.preventDefault()
    if (creating) return

    setCreating(true)
    try {
      const board = await boardApi.create({
        title: form.title.trim() || 'Untitled whiteboard',
        description: form.description.trim() || undefined,
        background: form.background,
      })
      toast.success('Whiteboard created')
      navigate(`/board/${board.id}`)
    } catch (error) {
      toast.error(error.message || 'Could not create the whiteboard')
      setCreating(false)
    }
  }

  const onDelete = async (event, board) => {
    event.preventDefault()
    event.stopPropagation()

    const title = board.title || 'Untitled whiteboard'
    if (!window.confirm(`Delete "${title}"? This cannot be undone.`)) return

    try {
      await boardApi.remove(board.id)
      setBoards((prev) => (prev || []).filter((item) => item.id !== board.id))
      toast.success('Whiteboard deleted')
    } catch (error) {
      toast.error(error.message || 'Could not delete the whiteboard')
    }
  }

  const count = boards?.length || 0

  return (
    <div className="min-h-screen w-full">
      <header className="glass sticky top-0 z-20 border-b border-line">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="brand-gradient grid h-8 w-8 place-items-center rounded-lg text-white">
              <PenLine className="h-4 w-4" />
            </span>
            <span className="font-display text-lg font-bold">Canvas</span>
          </Link>
          <UserMenu />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold">Your whiteboards</h1>
            <p className="mt-1 text-sm text-muted">
              {count} {count === 1 ? 'board' : 'boards'}
            </p>
          </div>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            New whiteboard
          </Button>
        </div>

        {boards === null && (
          <div className="grid place-items-center py-28">
            <Spinner label="Loading your boards..." />
          </div>
        )}

        {boards?.length === 0 && (
          <div className="card mt-8 rounded-3xl py-20 text-center">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-brand-50 text-brand-600">
              <LayoutGrid className="h-6 w-6" />
            </span>
            <h2 className="mt-5 font-display text-xl font-semibold">No whiteboards yet</h2>
            <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
              Create your first board to start sketching, dropping sticky notes and thinking with
              AI.
            </p>
            <div className="mt-6">
              <Button onClick={openCreate}>
                <Plus className="h-4 w-4" />
                New whiteboard
              </Button>
            </div>
          </div>
        )}

        {boards?.length > 0 && (
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {boards.map((board, index) => (
              <Link
                key={board.id}
                to={`/board/${board.id}`}
                className="card group overflow-hidden rounded-2xl transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-soft)]"
              >
                <div
                  className="relative h-32 overflow-hidden"
                  style={{
                    background: `linear-gradient(180deg, ${TINTS[index % TINTS.length]} 0%, #ffffff 100%)`,
                  }}
                >
                  <BoardThumbnail boardId={board.id} updatedAt={board.updated_at} />
                </div>

                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="line-clamp-1 font-display font-semibold">
                      {board.title || 'Untitled whiteboard'}
                    </h3>
                    {board.is_owner && (
                      <button
                        type="button"
                        aria-label="Delete whiteboard"
                        onClick={(event) => onDelete(event, board)}
                        className="focus-ring -mr-1 shrink-0 cursor-pointer rounded-lg p-1 text-faint opacity-0 transition-all hover:bg-danger/10 hover:text-danger group-hover:opacity-100"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  {board.description && (
                    <p className="mt-1 line-clamp-1 text-xs text-muted">{board.description}</p>
                  )}

                  <div className="mt-3 flex items-center justify-between text-xs text-faint">
                    <span>{board.element_count ?? 0} items</span>
                    <span className="flex items-center gap-1.5">
                      {!board.is_owner && <Users className="h-3.5 w-3.5" />}
                      {relativeTime(board.updated_at)}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>

      <Modal
        open={createOpen}
        onClose={closeCreate}
        title="New whiteboard"
        description="Give it a name and pick a background."
        footer={
          <>
            <Button variant="ghost" onClick={closeCreate}>
              Cancel
            </Button>
            <Button type="submit" form="create-whiteboard" loading={creating}>
              Create &amp; open
            </Button>
          </>
        }
      >
        <form id="create-whiteboard" onSubmit={onSubmit} className="space-y-4">
          <Input
            label="Title"
            autoFocus
            placeholder="Product roadmap"
            value={form.title}
            onChange={(event) => setForm({ ...form, title: event.target.value })}
          />
          <Textarea
            label="Description (optional)"
            rows={2}
            placeholder="What is this board for?"
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
          />
          <Select
            label="Background"
            value={form.background}
            onChange={(event) => setForm({ ...form, background: event.target.value })}
          >
            <option value="dots">Dotted grid</option>
            <option value="grid">Lined grid</option>
            <option value="plain">Plain</option>
          </Select>
        </form>
      </Modal>
    </div>
  )
}
