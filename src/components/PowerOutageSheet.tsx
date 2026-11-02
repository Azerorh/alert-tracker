import {
  POWER_ATTRIBUTION_URL,
  powerStatusLabel,
  type PowerOblast,
} from '../lib/powerOutages'
import { SheetChrome } from './SheetChrome'

type Props = {
  oblast: PowerOblast | null
  kyivHour: number
  onClose: () => void
}

function formatUpdated(iso: string | null): string {
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

export function PowerOutageSheet({ oblast, kyivHour, onClose }: Props) {
  if (!oblast) return null

  const groups = Object.entries(oblast.groups).sort(([a], [b]) =>
    a.localeCompare(b, 'uk', { numeric: true }),
  )
  const offLabel =
    oblast.offNowCount > 0
      ? oblast.offNow.slice(0, 12).join(', ') + (oblast.offNow.length > 12 ? '…' : '')
      : 'немає (за опублікованим графіком)'

  return (
    <aside className="threat-sheet" aria-live="polite">
      <SheetChrome accent="#f0b429" kicker="Світло · орієнтовно" title={oblast.name} onClose={onClose}>
        <p className="sheet-explain">
          Зараз (Київ, {String(kyivHour).padStart(2, '0')}:00): без світла за графіком —{' '}
          <strong>{oblast.offNowCount}</strong> з {oblast.groupCount} черг
          {oblast.offNowCount ? `: ${offLabel}` : ''}.
        </p>
        <p className="sheet-explain">
          Це опублікований графік ОСР, не датчик у розетці. Аварії та затримки можливі.
        </p>

        <dl className="sheet-grid">
          <dt>Дата графіка</dt>
          <dd>{oblast.scheduleDate ?? '—'}</dd>
          <dt>Оновлено джерелом</dt>
          <dd>{formatUpdated(oblast.updatedAt)}</dd>
          <dt>Знімок</dt>
          <dd>{formatUpdated(oblast.fetchedAt)}</dd>
        </dl>

        <div className="power-schedule" aria-label="Розклад черг">
          {groups.map(([gid, g]) => (
            <div key={gid} className="power-group">
              <div className="power-group-head">
                <span className="power-group-name">{g.name || gid}</span>
                <span
                  className={`power-now ${isOffClass(g.nowStatus) ? 'off' : 'on'}`}
                >
                  зараз: {powerStatusLabel(g.nowStatus)}
                </span>
              </div>
              <div className="power-slots" role="list">
                {g.slots.map((slot) => (
                  <span
                    key={slot.hour}
                    role="listitem"
                    className={`power-slot status-${normalizeStatus(slot.status)}${
                      slot.hour === kyivHour ? ' current' : ''
                    }`}
                    title={`${slot.hour}:00 — ${powerStatusLabel(slot.status)}`}
                  >
                    {slot.hour}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="sheet-links">
          {oblast.sourceUrl ? (
            <a className="sheet-link" href={oblast.sourceUrl} target="_blank" rel="noreferrer">
              Графік на КолиСвітло
            </a>
          ) : (
            <a className="sheet-link" href={POWER_ATTRIBUTION_URL} target="_blank" rel="noreferrer">
              КолиСвітло
            </a>
          )}
        </div>
      </SheetChrome>
    </aside>
  )
}

function normalizeStatus(status: string): string {
  const s = status.toLowerCase()
  if (s === 'yes' || s === 'no' || s === 'first' || s === 'second' || s === 'maybe') return s
  return 'unknown'
}

function isOffClass(status: string): boolean {
  const s = status.toLowerCase()
  return s === 'no' || s === 'first' || s === 'second'
}
