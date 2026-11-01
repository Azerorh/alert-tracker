import type { RfSighting } from '../lib/rfSightings'

type Props = {
  sighting: RfSighting | null
  onClose: () => void
}

const CATEGORY_UA: Record<RfSighting['category'], string> = {
  tanks: 'Танк',
  ifv: 'БМП / БМД',
  apc: 'БТР / MRAP',
  trucks: 'Транспорт / інженерія',
  artillery: 'Артилерія',
  airdef: 'ППО / РЕБ',
  other: 'Техніка РФ',
}

export function SightingSheet({ sighting, onClose }: Props) {
  if (!sighting) return null

  const fromGc = sighting.source === 'geoconfirmed' || sighting.channelId === 'geoconfirmed'

  return (
    <aside className="threat-sheet" aria-live="polite">
      <div className="sheet-grab" aria-hidden>
        <span />
      </div>
      <div className="sheet-accent" style={{ background: '#f0b429' }} />
      <div className="sheet-head">
        <div>
          <p className="sheet-kicker" style={{ color: '#f0b429' }}>
            Сайтінг РФ · {CATEGORY_UA[sighting.category]}
          </p>
          <h2 className="sheet-title">{sighting.channelLabel}</h2>
        </div>
        <button type="button" className="sheet-close" onClick={onClose} aria-label="Закрити">
          ×
        </button>
      </div>
      <p className="sheet-explain">
        {fromGc
          ? 'Verified OSINT (GeoConfirmed), не live-колона. Геоприв’язана присутність / техніка РФ до 7 діб.'
          : 'Активна присутність / просування РФ (до 7 діб), не знищена техніка. Не live-трек. Лише РФ — не позиції ЗСУ.'}
      </p>
      <p className="sheet-explain">{sighting.summary}</p>
      <dl className="sheet-grid">
        <div>
          <dt>{fromGc ? 'Дата' : 'Час посту'}</dt>
          <dd className="mono">{new Date(sighting.at).toLocaleString('uk-UA')}</dd>
        </div>
        <div>
          <dt>Точність</dt>
          <dd>
            {sighting.precision === 'place'
              ? 'орієнтовно · населений пункт'
              : fromGc
                ? 'координати GeoConfirmed'
                : 'координати з поста'}
          </dd>
        </div>
        <div>
          <dt>Координати</dt>
          <dd className="mono">
            {sighting.lat.toFixed(4)}, {sighting.lon.toFixed(4)}
          </dd>
        </div>
        <div>
          <dt>{fromGc ? 'Джерело' : 'Канал'}</dt>
          <dd>{sighting.channelLabel}</dd>
        </div>
      </dl>
      <div className="sheet-links">
        <a className="sheet-link" href={sighting.postUrl} target="_blank" rel="noreferrer">
          {fromGc ? 'Відкрити GeoConfirmed' : 'Відкрити пост'}
        </a>
      </div>
    </aside>
  )
}
