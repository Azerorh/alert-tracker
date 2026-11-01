import { useEffect, useState } from 'react'
import { ABROAD_ICON_COLOR } from '../lib/threatIcons'
import {
  fetchGroundEvidence,
  numericWarspottingId,
  resolvePhotoUrl,
  warspottingViewUrl,
  type GroundLoss,
} from '../lib/warspotting'

type Props = {
  loss: GroundLoss | null
  onClose: () => void
}

const CATEGORY_UA: Record<GroundLoss['category'], string> = {
  tanks: 'Танк',
  ifv: 'БМП / БМД',
  apc: 'БТР / MRAP',
  trucks: 'Транспорт / інженерія',
  artillery: 'Артилерія',
  airdef: 'ППО / РЕБ',
  other: 'Інше',
}

export function GroundSheet({ loss, onClose }: Props) {
  const [photos, setPhotos] = useState<string[]>([])
  const [sources, setSources] = useState<string[]>([])
  const [viewUrl, setViewUrl] = useState<string | null>(null)
  const [photoFailed, setPhotoFailed] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (!loss) return
    const wsId = loss.wsId ?? numericWarspottingId(loss.id)
    setPhotos(loss.photos ?? [])
    setSources(loss.sources ?? [])
    setViewUrl(loss.viewUrl ?? (wsId != null ? warspottingViewUrl(wsId) : null))
    setPhotoFailed({})

    if (wsId == null) return
    let cancelled = false
    void (async () => {
      const ev = await fetchGroundEvidence(wsId)
      if (cancelled || !ev) return
      const preferred = (ev.confirmPhotos?.length ? ev.confirmPhotos : loss.photos ?? []).map(
        resolvePhotoUrl,
      )
      if (preferred.length) setPhotos([...new Set(preferred)].slice(0, 6))
      if (ev.sources?.length) setSources(ev.sources)
      if (ev.viewUrl) setViewUrl(ev.viewUrl)
    })()
    return () => {
      cancelled = true
    }
  }, [loss])

  if (!loss) return null
  const accent = ABROAD_ICON_COLOR
  const visiblePhotos = photos.filter((p) => !photoFailed[p])
  const fromGc = loss.id.startsWith('gc-')

  return (
    <aside className="threat-sheet" aria-live="polite">
      <div className="sheet-grab" aria-hidden>
        <span />
      </div>
      <div className="sheet-accent" style={{ background: accent }} />
      <div className="sheet-head">
        <div>
          <p className="sheet-kicker" style={{ color: accent }}>
            {CATEGORY_UA[loss.category]} · {loss.status || 'втрата'}
          </p>
          <h2 className="sheet-title">{loss.model}</h2>
        </div>
        <button type="button" className="sheet-close" onClick={onClose} aria-label="Закрити">
          ×
        </button>
      </div>

      {visiblePhotos.length > 0 ? (
        <div className="sheet-photos" aria-label="Фото підтвердження">
          {visiblePhotos.map((src) => (
            <a
              key={src}
              className="sheet-photo"
              href={src}
              target="_blank"
              rel="noreferrer"
              title="Відкрити фото"
            >
              <img
                src={src}
                alt="Фото підтвердження втрати"
                loading="lazy"
                referrerPolicy="no-referrer"
                onError={() => setPhotoFailed((m) => ({ ...m, [src]: true }))}
              />
            </a>
          ))}
        </div>
      ) : null}

      <p className="sheet-explain">
        {fromGc
          ? 'Verified OSINT (GeoConfirmed): знищена / пошкоджена техніка РФ. Не live-позиція.'
          : 'Задокументована втрата техніки (WarSpotting / OSINT-фото). Це не live-позиція колони й не підтвердження наявності піхоти.'}
      </p>
      <dl className="sheet-grid">
        <div>
          <dt>Місце</dt>
          <dd>{loss.place || 'невідоме'}</dd>
        </div>
        <div>
          <dt>Дата</dt>
          <dd className="mono">{loss.date || '—'}</dd>
        </div>
        <div>
          <dt>Тип</dt>
          <dd>{loss.type}</dd>
        </div>
        {loss.unit ? (
          <div>
            <dt>Підрозділ</dt>
            <dd>{loss.unit}</dd>
          </div>
        ) : null}
        <div>
          <dt>Точність</dt>
          <dd>
            {loss.geoPrecision === 'place'
              ? 'орієнтовно · населений пункт'
              : fromGc
                ? 'координати GeoConfirmed'
                : 'координати WarSpotting'}
          </dd>
        </div>
        <div>
          <dt>Координати</dt>
          <dd className="mono">
            {loss.lat.toFixed(4)}, {loss.lon.toFixed(4)}
          </dd>
        </div>
      </dl>

      <div className="sheet-links">
        {sources.map((href) => (
          <a key={href} className="sheet-link" href={href} target="_blank" rel="noreferrer">
            Джерело
          </a>
        ))}
        {viewUrl ? (
          <a className="sheet-link" href={viewUrl} target="_blank" rel="noreferrer">
            {fromGc ? 'GeoConfirmed' : 'WarSpotting'}
          </a>
        ) : null}
      </div>
    </aside>
  )
}
