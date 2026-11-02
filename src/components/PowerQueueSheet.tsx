import { POWER_ATTRIBUTION_URL, powerStatusLabel } from '../lib/powerOutages'
import type { ResolvedPowerQueue } from '../lib/powerQueue'
import { SheetChrome } from './SheetChrome'

type Props = {
  queue: ResolvedPowerQueue | null
  kyivHour: number
  onClose: () => void
  onClear: () => void
}

export function PowerQueueSheet({ queue, kyivHour, onClose, onClear }: Props) {
  if (!queue) return null

  const title = queue.saved.addressLabel
    ? queue.saved.addressLabel
    : `${queue.oblast.name} · ${queue.group.name || queue.groupId}`

  return (
    <aside className="threat-sheet" aria-live="polite">
      <SheetChrome
        accent={queue.nowOff ? '#e85d4c' : '#2f6b4f'}
        kicker="Моя черга · орієнтовно"
        title={title}
        onClose={onClose}
      >
        <p className="sheet-explain">
          Черга з графіка ОСР (КолиСвітло), не датчик у розетці. Пін на карті — центроїд області /
          міста, не адреса будинку. Полігонів по чергах у відкритих джерелах немає.
        </p>
        <p className="sheet-explain">
          Зараз (Київ, {String(kyivHour).padStart(2, '0')}:00):{' '}
          <strong>{queue.nowLabel}</strong>
        </p>
        <dl className="sheet-grid">
          <dt>Регіон</dt>
          <dd>{queue.oblast.name}</dd>
          <dt>Черга</dt>
          <dd>{queue.group.name || queue.groupId}</dd>
          <dt>Джерело</dt>
          <dd>{queue.saved.source === 'yasno' ? 'Yasno → КолиСвітло' : 'вручну → КолиСвітло'}</dd>
        </dl>

        <div className="power-schedule" aria-label="Розклад черги">
          <div className="power-group">
            <div className="power-group-head">
              <span className="power-group-name">{queue.group.name || queue.groupId}</span>
              <span className={`power-now ${queue.nowOff ? 'off' : 'on'}`}>
                зараз: {queue.nowLabel}
              </span>
            </div>
            <div className="power-slots" role="list">
              {queue.group.slots.map((slot) => (
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
        </div>

        <div className="sheet-links">
          {queue.oblast.sourceUrl ? (
            <a className="sheet-link" href={queue.oblast.sourceUrl} target="_blank" rel="noreferrer">
              Графік на КолиСвітло
            </a>
          ) : (
            <a className="sheet-link" href={POWER_ATTRIBUTION_URL} target="_blank" rel="noreferrer">
              КолиСвітло
            </a>
          )}
          <button type="button" className="sheet-link sheet-link-btn" onClick={onClear}>
            Скинути мою чергу
          </button>
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
