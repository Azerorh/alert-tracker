import type { DsUnit } from '../lib/dsUnits'
import { DEEPSTATE_ATTRIBUTION_URL } from '../lib/neptun'

type Props = {
  unit: DsUnit | null
  onClose: () => void
}

export function DsUnitSheet({ unit, onClose }: Props) {
  if (!unit) return null

  return (
    <aside className="threat-sheet" aria-live="polite">
      <div className="sheet-grab" aria-hidden>
        <span />
      </div>
      <div className="sheet-accent" style={{ background: '#b91c1c' }} />
      <div className="sheet-head">
        <div>
          <p className="sheet-kicker" style={{ color: '#f07167' }}>
            Підрозділ РФ · DeepState
          </p>
          <h2 className="sheet-title">{unit.title}</h2>
        </div>
        <button type="button" className="sheet-close" onClick={onClose} aria-label="Закрити">
          ×
        </button>
      </div>
      <p className="sheet-explain">
        Орієнтовна позиція з поточного зрізу DeepStateMap. Не live-трек і не підтвердження
        наявності всієї техніки підрозділу.
      </p>
      <dl className="sheet-grid">
        <div>
          <dt>Роль</dt>
          <dd>
            {unit.role === 'hq' ? 'штаб / обʼєднання' : unit.role === 'storm' ? 'штурм' : 'підрозділ'}
          </dd>
        </div>
        <div>
          <dt>Координати</dt>
          <dd className="mono">
            {unit.lat.toFixed(4)}, {unit.lon.toFixed(4)}
          </dd>
        </div>
      </dl>
      <div className="sheet-links">
        <a className="sheet-link" href={DEEPSTATE_ATTRIBUTION_URL} target="_blank" rel="noreferrer">
          DeepStateMap
        </a>
      </div>
    </aside>
  )
}
