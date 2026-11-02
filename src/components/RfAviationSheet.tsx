import { ttlLabel, type RfAviationEvent } from '../lib/rfAviation'
import { SheetChrome } from './SheetChrome'

type Props = {
  event: RfAviationEvent | null
  onClose: () => void
}

function formatSeen(iso: string): string {
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

export function RfAviationSheet({ event, onClose }: Props) {
  if (!event) return null

  return (
    <aside className="threat-sheet" aria-live="polite">
      <SheetChrome
        accent="#c4a0ff"
        kicker="Виліт РФ · TG"
        title={event.title}
        onClose={onClose}
      >
        {event.excerpt ? <p className="sheet-explain">{event.excerpt}</p> : null}
        <p className="sheet-explain">
          Мітка на аеродромі (не трек). Якщо аеродром поза екраном — іконка на межі карти зі
          стрілками напряму. Вікно показу {ttlLabel(event.kind)}; це OSINT, не офіційна тривога.
        </p>
        <dl className="sheet-grid">
          <div>
            <dt>Аеродром</dt>
            <dd>{event.airbase}</dd>
          </div>
          <div>
            <dt>Напрям на UA</dt>
            <dd>{Math.round(event.bearingDeg)}°</dd>
          </div>
          <div>
            <dt>Канал</dt>
            <dd>{event.channel || '—'}</dd>
          </div>
          <div>
            <dt>Згадка</dt>
            <dd>{formatSeen(event.lastSeen)}</dd>
          </div>
        </dl>
        {event.postUrl ? (
          <div className="sheet-links">
            <a className="sheet-link" href={event.postUrl} target="_blank" rel="noreferrer">
              Telegram
            </a>
          </div>
        ) : null}
      </SheetChrome>
    </aside>
  )
}
