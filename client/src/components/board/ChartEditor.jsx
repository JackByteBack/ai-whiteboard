import { useState } from 'react'
import { BarChart3, Donut, LineChart, PieChart, Plus, Trash2 } from 'lucide-react'
import Modal from '../ui/Modal'
import Button from '../ui/Button'
import { Input } from '../ui/Input'
import { cn } from '../../lib/utils'
import { CHART_PALETTE } from './ChartElement'

const TYPES = [
  { id: 'bar', label: 'Bar', Icon: BarChart3 },
  { id: 'line', label: 'Line', Icon: LineChart },
  { id: 'pie', label: 'Pie', Icon: PieChart },
  { id: 'donut', label: 'Donut', Icon: Donut },
]

/** Modal editor for a chart element's type, title and data rows. */
export default function ChartEditor({ open, element, onClose, onSave }) {
  const [chartType, setChartType] = useState('bar')
  const [title, setTitle] = useState('')
  const [rows, setRows] = useState([])

  // Seed local state from the element every time the dialog opens.
  const [seed, setSeed] = useState({ open, element })
  if (seed.open !== open || seed.element !== element) {
    setSeed({ open, element })
    if (open) {
      const data = element?.data || {}
      setChartType(data.chartType || 'bar')
      setTitle(data.title || '')
      setRows((Array.isArray(data.data) ? data.data : []).map((row) => ({ ...row })))
    }
  }

  const updateRow = (index, patch) => {
    setRows((previous) => previous.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  const removeRow = (index) => {
    setRows((previous) => previous.filter((_, i) => i !== index))
  }

  const addRow = () => {
    setRows((previous) => [
      ...previous,
      {
        label: `Item ${previous.length + 1}`,
        value: 0,
        color: CHART_PALETTE[previous.length % CHART_PALETTE.length],
      },
    ])
  }

  const save = () => {
    onSave?.({
      chartType,
      title: title.trim(),
      data: rows.map((row) => ({
        label: row.label ?? '',
        value: Number(row.value) || 0,
        ...(row.color ? { color: row.color } : {}),
      })),
    })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit chart"
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!rows.length}>
            Save chart
          </Button>
        </>
      }
    >
      <div className="mb-4 grid grid-cols-4 gap-2">
        {TYPES.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setChartType(id)}
            className={cn(
              'flex cursor-pointer flex-col items-center gap-1.5 rounded-2xl border px-2 py-3 text-xs font-semibold transition-colors focus-ring',
              chartType === id
                ? 'border-brand-300 bg-brand-50 text-brand-700 ring-2 ring-brand-300'
                : 'border-line bg-surface text-muted hover:bg-surface-2 hover:text-ink',
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      <Input
        label="Title"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Chart title"
        className="rounded-full"
      />

      <div className="mt-4">
        <p className="mb-1.5 text-xs font-medium text-muted">Data</p>

        <div className="space-y-2">
          {rows.map((row, index) => (
            <div key={index} className="flex items-center gap-2">
              <input
                type="color"
                value={row.color || CHART_PALETTE[index % CHART_PALETTE.length]}
                onChange={(event) => updateRow(index, { color: event.target.value })}
                aria-label={`Color for row ${index + 1}`}
                className="h-9 w-9 shrink-0 cursor-pointer rounded-lg border border-line bg-surface p-1"
              />
              <div className="min-w-0 flex-1">
                <Input
                  value={row.label ?? ''}
                  onChange={(event) => updateRow(index, { label: event.target.value })}
                  placeholder="Label"
                  aria-label={`Label for row ${index + 1}`}
                  className="rounded-full"
                />
              </div>
              <div className="w-24 shrink-0">
                <Input
                  type="number"
                  value={row.value ?? 0}
                  onChange={(event) => updateRow(index, { value: event.target.value })}
                  placeholder="0"
                  aria-label={`Value for row ${index + 1}`}
                  className="rounded-full"
                />
              </div>
              <button
                type="button"
                aria-label={`Delete row ${index + 1}`}
                disabled={rows.length <= 1}
                onClick={() => removeRow(index)}
                className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-full text-faint transition-colors hover:bg-danger/10 hover:text-danger focus-ring disabled:pointer-events-none disabled:opacity-40"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>

        <Button variant="outline" size="sm" className="mt-3" onClick={addRow}>
          <Plus className="h-4 w-4" />
          Add row
        </Button>
      </div>
    </Modal>
  )
}
