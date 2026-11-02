import type { EradarZone } from '../lib/eradar'
import { ERADAR_ATTRIBUTION_URL } from '../lib/eradar'
import { SheetChrome } from './SheetChrome'

type Props = {
  zone: EradarZone | null
  onClose: () => void
}

function formatSeen(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('uk-UA', {
      timeZone: 'Europe/Kyiv',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export function EradarSheet({ zone, onClose }: Props) {
  if (!zone) return null

  const title = zone.name
    ? zone.name.charAt(0).toUpperCase() + zone.name.slice(1)
    : 'Згадка TG'

  return (
    <aside className="threat-sheet" aria-live="polite">
      <SheetChrome
        accent="#f0a020"
        kicker={
          zone.id.startsWith('ua-tg-') ? 'TG-зона · монітори UA' : 'TG-зона · eRadar'
        }
        title={title}
        onClose={onClose}
      >
        {zone.excerpt ? <p className="sheet-explain">{zone.excerpt}</p> : null}
        <p className="sheet-explain">
          Орієнтовна зона згадки (не офіційна тривога і не трек NEPTUN/MAPA). Радіус ~
          {Math.round(zone.radiusKm)} км · вікно до ~45 хв.
        </p>
        <dl className="sheet-grid">
          <div>
            <dt>Тип</dt>
            <dd>
              {zone.threatType || '—'}
              {zone.kind ? ` · ${zone.kind}` : ''}
            </dd>
          </div>
          <div>
            <dt>Канал</dt>
            <dd>{zone.channel || '—'}</dd>
          </div>
          <div>
            <dt>Останнє</dt>
            <dd>{formatSeen(zone.lastSeen)}</dd>
          </div>
        </dl>
        <div className="sheet-links">
          <a className="sheet-link" href={ERADAR_ATTRIBUTION_URL} target="_blank" rel="noreferrer">
            eradar.app
          </a>
        </div>
      </SheetChrome>
    </aside>
  )
}
