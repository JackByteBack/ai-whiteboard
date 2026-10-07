import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import toast from 'react-hot-toast'
import {
  BarChart3,
  List,
  Pencil,
  Sparkles,
  StickyNote,
  Workflow,
  X,
} from 'lucide-react'
import Button from '../ui/Button'
import { Textarea } from '../ui/Input'
import Spinner from '../ui/Spinner'
import { aiApi } from '../../lib/api'

const CREATE_ACTIONS = [
  { key: 'brainstorm', label: 'Sticky notes', Icon: StickyNote, call: aiApi.brainstorm },
  { key: 'outline', label: 'Outline', Icon: List, call: aiApi.outline },
  { key: 'diagram', label: 'Flow diagram', Icon: Workflow, call: aiApi.diagram },
  { key: 'chart', label: 'Chart', Icon: BarChart3, call: aiApi.chart },
]

function SummarySection({ title, items }) {
  if (!items?.length) return null
  return (
    <div className="mt-3">
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-faint">{title}</p>
      <ul className="space-y-1">
        {items.map((item, index) => (
          <li key={index} className="flex gap-2 text-xs leading-relaxed text-muted">
            <span className="text-brand-400">•</span>
            {String(item)}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Right-hand AI slide-over: edit a selection or generate new board content. */
export default function AIPanel({
  open,
  onClose,
  boardId,
  selectedIds = [],
  getDropPoint,
  onElementsCreated,
  onElementsUpdated,
}) {
  const [topic, setTopic] = useState('')
  const [count, setCount] = useState(6)
  const [busy, setBusy] = useState(null) // 'edit' | action key | 'summary'
  const [summary, setSummary] = useState(null)

  const hasSelection = selectedIds.length > 0

  const run = async (key, task) => {
    if (busy) return
    setBusy(key)
    try {
      await task()
    } catch (error) {
      toast.error(error.message || 'The AI request failed')
    } finally {
      setBusy(null)
    }
  }

  const createWith = (action) => {
    const prompt = topic.trim()
    if (!prompt) {
      toast.error('Describe what you want to create first')
      return
    }
    run(action.key, async () => {
      const { x, y } = getDropPoint?.() || { x: 80, y: 80 }
      const created = await action.call(boardId, { topic: prompt, count, x, y })
      onElementsCreated?.(created)
      toast.success(`${action.label} added to the board`)
    })
  }

  const editSelection = () => {
    const prompt = topic.trim()
    if (!prompt) {
      toast.error('Describe the change you want first')
      return
    }
    run('edit', async () => {
      const updated = await aiApi.edit(boardId, { instruction: prompt, ids: selectedIds })
      onElementsUpdated?.(updated)
      toast.success('Selection updated')
    })
  }

  const summarize = () => {
    run('summary', async () => {
      const result = await aiApi.summary(boardId, {})
      setSummary(result)
    })
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 24 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="card absolute right-4 top-16 z-30 flex w-80 flex-col rounded-2xl p-4 shadow-[var(--shadow-lift)]"
        >
          <header className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-2 font-display text-sm font-semibold text-ink">
              <Sparkles className="h-4 w-4 text-brand-500" />
              AI assistant
            </h3>
            <button
              type="button"
              aria-label="Close AI panel"
              onClick={onClose}
              className="focus-ring grid h-7 w-7 cursor-pointer place-items-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-ink"
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          <Textarea
            rows={3}
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            placeholder={
              hasSelection
                ? 'Describe the change to apply to the selection…'
                : 'Describe your topic — e.g. “Launch plan for a mobile app”…'
            }
            className="text-sm"
          />

          {hasSelection && (
            <>
              <Button
                className="mt-3 w-full"
                variant="secondary"
                size="sm"
                disabled={Boolean(busy)}
                loading={busy === 'edit'}
                onClick={editSelection}
              >
                <Pencil className="h-4 w-4" />
                Edit {selectedIds.length} selected
              </Button>
              <div className="my-3 flex items-center gap-3 text-[10px] font-semibold uppercase tracking-wider text-faint">
                <span className="h-px flex-1 bg-line" />
                or create new
                <span className="h-px flex-1 bg-line" />
              </div>
            </>
          )}

          <div className="mb-2 flex items-center justify-between">
            <label htmlFor="ai-items" className="text-[10px] font-semibold uppercase tracking-wider text-faint">
              Items
            </label>
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-semibold tabular text-ink">
              {count}
            </span>
          </div>
          <input
            id="ai-items"
            type="range"
            min={3}
            max={12}
            value={count}
            onChange={(event) => setCount(Number(event.target.value))}
            className="mb-3 w-full accent-[var(--color-brand-500)]"
          />

          <div className="grid grid-cols-2 gap-2">
            {CREATE_ACTIONS.map((action) => (
              <Button
                key={action.key}
                variant="soft"
                size="sm"
                disabled={Boolean(busy)}
                loading={busy === action.key}
                onClick={() => createWith(action)}
                className="justify-start"
              >
                <action.Icon className="h-4 w-4" />
                {action.label}
              </Button>
            ))}
          </div>

          <div className="my-3 h-px bg-line" />

          <Button
            variant="secondary"
            size="sm"
            className="w-full"
            disabled={Boolean(busy)}
            onClick={summarize}
          >
            Summarize this board
          </Button>

          {busy === 'summary' && (
            <div className="mt-3 flex justify-center">
              <Spinner label="Reading your board…" />
            </div>
          )}

          {summary && (
            <div className="mt-3 max-h-64 overflow-y-auto rounded-2xl border border-line bg-surface-2/70 p-3">
              <p className="font-display text-sm font-semibold leading-snug text-ink">
                {summary.headline}
              </p>
              <SummarySection title="Themes" items={summary.themes} />
              <SummarySection title="Action items" items={summary.actionItems} />
              <SummarySection title="Open questions" items={summary.questions} />
            </div>
          )}
        </motion.aside>
      )}
    </AnimatePresence>
  )
}
