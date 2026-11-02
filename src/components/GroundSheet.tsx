import { useEffect, useState } from 'react'
import { resolvePhotosFromSources } from '../lib/sourcePhotos'
import { ABROAD_ICON_COLOR } from '../lib/threatIcons'
import {
  fetchGroundEvidence,
  numericWarspottingId,
  pickEvidencePhotos,
  warspottingViewUrl,
  type GroundLoss,
} from '../lib/warspotting'
import { SheetChrome } from './SheetChrome'

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
  const [photosLoading, setPhotosLoading] = useState(false)

  useEffect(() => {
    if (!loss) return
    const wsId = loss.wsId ?? numericWarspottingId(loss.id)
    let nextPhotos = [...(loss.photos ?? [])]
    let nextSources = [...(loss.sources ?? [])]
    setPhotos(nextPhotos)
    setSources(nextSources)
    setViewUrl(loss.viewUrl ?? (wsId != null ? warspottingViewUrl(wsId) : null))
    setPhotoFailed({})
    setPhotosLoading(false)

    let cancelled = false
    void (async () => {
      if (wsId != null) {
        const ev = await fetchGroundEvidence(wsId)
        if (cancelled) return
        if (ev) {
          const preferred = pickEvidencePhotos(ev, loss.photos ?? [])
          if (preferred.length) {
            nextPhotos = preferred
            setPhotos(preferred)
          }
          if (ev.sources?.length) {
            nextSources = ev.sources
            setSources(ev.sources)
          }
          if (ev.viewUrl) setViewUrl(ev.viewUrl)
        }
      }

      if (cancelled || nextPhotos.length > 0 || nextSources.length === 0) return
      setPhotosLoading(true)
      const fromSrc = await resolvePhotosFromSources(nextSources)
      if (cancelled) return
      setPhotosLoading(false)
      if (fromSrc.length) setPhotos(fromSrc)
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
      <SheetChrome
        accent={accent}
        kicker={`${CATEGORY_UA[loss.category]} · ${loss.status || 'втрата'}`}
        title={loss.model}
        onClose={onClose}
      >
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
        ) : photosLoading ? (
          <p className="sheet-explain">Шукаємо прев’ю в джерелах…</p>
        ) : (
          <p className="sheet-explain">
            {fromGc
              ? 'Прев’ю фото тут немає (X/Instagram часто без прямого кадру). Відкрийте джерело нижче.'
              : 'Фото в кеші немає: WarSpotting зараз блокує скрейп сторінок (Cloudflare). Відкрийте WarSpotting або джерело нижче.'}
          </p>
        )}

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
      </SheetChrome>
    </aside>
  )
}
