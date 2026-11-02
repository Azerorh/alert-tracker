import type { PowerTgMarker } from '../lib/powerTgOutages'
import { SheetChrome } from './SheetChrome'

type Props = {
  marker: PowerTgMarker | null
  onClose: () => void
}

function formatAt(iso: string): string {
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

function precisionLabel(precision: string): string {
  switch (precision) {
    case 'district':
      return 'орієнтовно · район'
    case 'region':
      return 'орієнтовно · область / місто'
    case 'place':
      return 'орієнтовно · населений пункт'
    default:
      return 'орієнтовно'
  }
}

export function PowerTgSheet({ marker, onClose }: Props) {
  if (!marker) return null

  const title = marker.place
    ? marker.place.charAt(0).toUpperCase() + marker.place.slice(1)
    : marker.channelLabel

  return (
    <aside className="threat-sheet" aria-live="polite">
      <SheetChrome
        accent="#e85d4c"
        kicker="Аварія / екстрене · TG"
        title={title}
        onClose={onClose}
      >
        <p className="sheet-explain">
          Згадка в офіційному Telegram-каналі, не факт у конкретному будинку. Графіки областей
          лишаються окремим шаром.
        </p>
        <p className="sheet-explain">{marker.summary}</p>
        <dl className="sheet-grid">
          <dt>Час посту</dt>
          <dd className="mono">{formatAt(marker.at)}</dd>
          <dt>Точність</dt>
          <dd>{precisionLabel(marker.precision)}</dd>
          <dt>Канал</dt>
          <dd>{marker.channelLabel}</dd>
        </dl>
        <div className="sheet-links">
          {marker.postUrl ? (
            <a className="sheet-link" href={marker.postUrl} target="_blank" rel="noreferrer">
              Відкрити пост у Telegram
            </a>
          ) : (
            <a className="sheet-link" href={marker.channelUrl} target="_blank" rel="noreferrer">
              Канал {marker.channelLabel}
            </a>
          )}
        </div>
      </SheetChrome>
    </aside>
  )
}
