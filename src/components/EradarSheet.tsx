import type { EradarZone } from '../lib/eradar'
import { ERADAR_ATTRIBUTION_URL } from '../lib/eradar'

type Props = {
  zone: EradarZone | null
  onClose: () => void
}

export function EradarSheet({ zone, onClose }: Props) {
  if (!zone) return null

  return (
    <aside className="sheet" aria-label="Зона eRadar">
      <header className="sheet-head">
        <div>
          <p className="sheet-kicker">TG-зона · eRadar</p>
          <h2 className="sheet-title">{zone.name || 'Згадка'}</h2>
        </div>
        <button type="button" className="sheet-close" onClick={onClose} aria-label="Закрити">
          ×
        </button>
      </header>
      <div className="sheet-body">
        <p className="sheet-meta">
          {zone.threatType}
          {zone.kind ? ` · ${zone.kind}` : ''}
          {zone.channel ? ` · ${zone.channel}` : ''}
        </p>
        {zone.excerpt ? <p className="sheet-explain">{zone.excerpt}</p> : null}
        <p className="sheet-explain">
          Орієнтовна зона згадки (не офіційна тривога, не трек NEPTUN/MAPA). Радіус ~
          {Math.round(zone.radiusKm)} км.
        </p>
        {zone.lastSeen ? (
          <p className="sheet-meta">Останнє: {new Date(zone.lastSeen).toLocaleString('uk-UA')}</p>
        ) : null}
        <p className="sheet-meta">
          <a href={ERADAR_ATTRIBUTION_URL} target="_blank" rel="noreferrer">
            eradar.app
          </a>
        </p>
      </div>
    </aside>
  )
}
