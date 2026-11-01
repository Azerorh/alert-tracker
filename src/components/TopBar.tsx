import { threatsLabel, type ConnectionStatus } from '../lib/neptun'
import { SourceStatus } from './SourceStatus'
import { OblastWatchMenu } from './OblastWatchMenu'
import type { SourceHealth } from '../lib/api'
import type { OblastMeta } from '../lib/oblasts'

type Props = {
  status: ConnectionStatus
  threatCount: number
  alertCount: number
  lastUpdatedAt: string
  relativeUpdated: string
  onLocate: () => void
  locateBusy: boolean
  locateError: string | null
  nearMe: boolean
  nearMeRadiusKm: number
  nearbyCount: number | null
  onToggleNearMe: () => void
  sources: SourceHealth[] | null
  bffUp: boolean
  oblasts: OblastMeta[]
  watchedOblasts: string[]
  notifyPermission: NotificationPermission | 'unsupported'
  onToggleOblast: (key: string) => void
  onSelectAllOblasts: () => void
  onClearOblasts: () => void
  onRequestNotifyPermission: () => void
}

function statusLabel(status: ConnectionStatus): string {
  switch (status) {
    case 'live':
      return 'Наживо'
    case 'reconnecting':
      return 'Перепідключення'
    default:
      return 'З’єднання'
  }
}

export function TopBar({
  status,
  threatCount,
  alertCount,
  relativeUpdated,
  onLocate,
  locateBusy,
  locateError,
  nearMe,
  nearMeRadiusKm,
  nearbyCount,
  onToggleNearMe,
  sources,
  bffUp,
  oblasts,
  watchedOblasts,
  notifyPermission,
  onToggleOblast,
  onSelectAllOblasts,
  onClearOblasts,
  onRequestNotifyPermission,
}: Props) {
  return (
    <header className="topbar">
      <div className="brand-block">
        <div className="brand-mark" aria-hidden />
        <div>
          <h1 className="brand-title">Тривога.Карта</h1>
          <p className="brand-sub">Повітряні загрози України</p>
        </div>
      </div>

      <div className="topbar-center">
        <div className="topbar-stats">
          <div className={`status-pill status-${status}`}>
            <span className="status-dot" />
            {statusLabel(status)}
          </div>
          <div className="stat-chip">
            <span className="stat-value">{threatCount}</span>
            <span className="stat-label">
              {nearMe && nearbyCount != null
                ? `поблизу / ${threatsLabel(threatCount).replace(/^\d+\s/, '')}`
                : threatsLabel(threatCount).replace(/^\d+\s/, '')}
            </span>
          </div>
          <div className="stat-chip">
            <span className="stat-value">{alertCount}</span>
            <span className="stat-label">зон тривоги</span>
          </div>
          <div className="stat-chip muted">
            <span className="stat-label">оновлено {relativeUpdated}</span>
          </div>
        </div>
        <SourceStatus sources={sources} bffUp={bffUp} />
      </div>

      <div className="topbar-actions">
        <OblastWatchMenu
          oblasts={oblasts}
          watched={watchedOblasts}
          permission={notifyPermission}
          onToggle={onToggleOblast}
          onSelectAll={onSelectAllOblasts}
          onClearAll={onClearOblasts}
          onRequestPermission={onRequestNotifyPermission}
        />
        <button
          type="button"
          className={`btn-locate ${nearMe ? 'active' : ''}`}
          onClick={onToggleNearMe}
          title={`Підсвітити загрози в радіусі ${nearMeRadiusKm} км`}
        >
          {nearMe
            ? `Біля мене · ${nearMeRadiusKm} км${nearbyCount != null ? ` · ${nearbyCount}` : ''}`
            : 'Біля мене'}
        </button>
        <button
          type="button"
          className="btn-locate"
          onClick={onLocate}
          disabled={locateBusy}
          title="Показати моє місце на карті"
        >
          {locateBusy ? 'Шукаємо…' : 'Моє місце'}
        </button>
        {locateError ? <span className="locate-error">{locateError}</span> : null}
      </div>
    </header>
  )
}
