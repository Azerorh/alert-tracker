import { UI_FILTERS, type UiFilterKey } from '../lib/neptun'

type Props = {
  value: UiFilterKey
  onChange: (key: UiFilterKey) => void
  counts: Record<string, number>
}

export function FilterBar({ value, onChange, counts }: Props) {
  return (
    <div className="filter-bar" role="toolbar" aria-label="Фільтр типів загроз">
      {UI_FILTERS.map((f) => {
        const count =
          f.key === 'all'
            ? counts.all
            : (f.types ?? []).reduce((sum, t) => sum + (counts[t] ?? 0), 0)
        return (
          <button
            key={f.key}
            type="button"
            className={`filter-chip ${value === f.key ? 'active' : ''}`}
            onClick={() => onChange(f.key)}
            aria-pressed={value === f.key}
          >
            <span>{f.label}</span>
            <span className="filter-count">{count}</span>
          </button>
        )
      })}
    </div>
  )
}
