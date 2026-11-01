import type { DsUnit } from '../lib/dsUnits'
import { DEEPSTATE_ATTRIBUTION_URL } from '../lib/neptun'
import { SheetChrome } from './SheetChrome'

type Props = {
  unit: DsUnit | null
  onClose: () => void
}

export function DsUnitSheet({ unit, onClose }: Props) {
  if (!unit) return null

  return (
    <aside className="threat-sheet" aria-live="polite">
      <SheetChrome
        accent="#b91c1c"
        kicker="Підрозділ РФ · DeepState"
        title={unit.title}
        onClose={onClose}
      >
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
      </SheetChrome>
    </aside>
  )
}
