import { useEffect, useId, useRef, useState } from 'react'
import type { OblastMeta } from '../lib/oblasts'
import type { OblastNotifyKinds } from '../hooks/useOblastWatch'

type Props = {
  oblasts: OblastMeta[]
  watched: string[]
  notifyKinds: OblastNotifyKinds
  onNotifyKindsChange: (patch: Partial<OblastNotifyKinds>) => void
  permission: NotificationPermission | 'unsupported'
  onToggle: (key: string) => void
  onSelectAll: () => void
  onClearAll: () => void
  onRequestPermission: () => void
}

export function OblastWatchMenu({
  oblasts,
  watched,
  notifyKinds,
  onNotifyKindsChange,
  permission,
  onToggle,
  onSelectAll,
  onClearAll,
  onRequestPermission,
}: Props) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const listId = useId()
  const watchedSet = new Set(watched)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className={`oblast-watch ${open ? 'open' : ''}`} ref={rootRef}>
      <button
        type="button"
        className={`btn-locate ${watched.length ? 'active' : ''}`}
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
        title="Сповіщення по обраних областях України"
      >
        Області{watched.length ? ` · ${watched.length}` : ''}
      </button>

      {open ? (
        <div className="oblast-watch-panel" id={listId} role="group" aria-label="Області для сповіщень">
          <div className="oblast-watch-head">
            <p className="oblast-watch-title">Сповіщення по областях</p>
            <p className="oblast-watch-sub">
              Оберіть типи сповіщень і області. Київ / Київська та Крим / Севастополь
              зв’язані. Після вибору — без стартового спаму.
            </p>
          </div>

          <div className="oblast-watch-kinds" role="group" aria-label="Типи сповіщень">
            <label className="oblast-watch-kind">
              <input
                type="checkbox"
                checked={notifyKinds.threats}
                onChange={(e) => onNotifyKindsChange({ threats: e.target.checked })}
              />
              <span>Повітряні об’єкти — заліт в область</span>
            </label>
            <label className="oblast-watch-kind">
              <input
                type="checkbox"
                checked={notifyKinds.alerts}
                onChange={(e) => onNotifyKindsChange({ alerts: e.target.checked })}
              />
              <span>Тривога UA — зміна статусу області</span>
            </label>
          </div>

          {permission === 'denied' ? (
            <p className="oblast-watch-warn">
              Сповіщення заблоковані в браузері — підказки лишаться на сайті.
            </p>
          ) : permission === 'default' ? (
            <button type="button" className="oblast-watch-link" onClick={onRequestPermission}>
              Дозволити сповіщення браузера
            </button>
          ) : null}

          <div className="oblast-watch-toolbar">
            <button type="button" onClick={onSelectAll}>
              Усі
            </button>
            <button type="button" onClick={onClearAll}>
              Скинути
            </button>
          </div>

          <ul className="oblast-watch-list">
            {oblasts.map((o) => {
              const checked = watchedSet.has(o.key)
              return (
                <li key={o.key}>
                  <label className="oblast-watch-item">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggle(o.key)}
                    />
                    <span>{o.name}</span>
                  </label>
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
