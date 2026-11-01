import { GROUND_FILTERS, type GroundFilterKey } from '../lib/warspotting'

type Props = {
  value: GroundFilterKey
  onChange: (key: GroundFilterKey) => void
  counts: Record<string, number>
}

export function GroundFilterBar({ value, onChange, counts }: Props) {
  return (
    <div className="filter-bar" role="toolbar" aria-label="Фільтр наземної техніки">
      {GROUND_FILTERS.map((f) => {
        const count =
          f.key === 'all'
            ? counts.all
            : f.key === 'sightings'
              ? (counts.sightings ?? 0)
              : (f.categories ?? []).reduce((sum, c) => sum + (counts[c] ?? 0), 0)
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
