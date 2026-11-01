import type { SourceHealth } from '../lib/api'

type Props = {
  sources: SourceHealth[] | null
  bffUp: boolean
}

function labelFor(name: string): string {
  switch (name) {
    case 'neptun':
      return 'NEPTUN'
    case 'neptun-alerts':
      return 'Тривоги'
    case 'mapa':
      return 'MAPA'
    default:
      return name
  }
}

function tone(s: SourceHealth | undefined, bffUp: boolean): 'ok' | 'stale' | 'down' {
  if (!bffUp || !s) return 'down'
  if (!s.ok) return 'down'
  if (s.stale) return 'stale'
  return 'ok'
}

export function SourceStatus({ sources, bffUp }: Props) {
  const list = sources ?? [
    { name: 'neptun', ok: false, ageSec: null, lagMs: null, error: null, stale: true },
    { name: 'mapa', ok: false, ageSec: null, lagMs: null, error: null, stale: true },
  ]

  return (
    <div className="source-row" aria-label="Стан джерел">
      <span className={`source-pill ${bffUp ? 'ok' : 'down'}`} title="BFF кеш / статус">
        <span className="status-dot" />
        BFF
      </span>
      {list
        .filter((s) => s.name === 'neptun' || s.name === 'mapa' || s.name === 'neptun-alerts')
        .map((s) => {
          const t = tone(s, bffUp)
          const age = s.ageSec != null ? `${s.ageSec}с` : '—'
          return (
            <span
              key={s.name}
              className={`source-pill ${t}`}
              title={s.error ? s.error : `вік кешу ${age}`}
            >
              <span className="status-dot" />
              {labelFor(s.name)}
              <span className="source-age">{age}</span>
            </span>
          )
        })}
    </div>
  )
}
