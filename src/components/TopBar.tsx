import { useEffect, useState } from 'react'
import { MAP_MODE_LABEL, type MapMode } from '../lib/mapMode'
import { threatsLabel, type ConnectionStatus } from '../lib/neptun'
import { SourceStatus } from './SourceStatus'
import { OblastWatchMenu } from './OblastWatchMenu'
import type { SourceHealth } from '../lib/api'
import type { OblastMeta } from '../lib/oblasts'

type Props = {
  mapMode: MapMode
  onMapModeChange: (mode: MapMode) => void
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
  mapMode,
  onMapModeChange,
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
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const onResize = () => {
      if (window.matchMedia('(min-width: 901px)').matches) setMenuOpen(false)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])

  const threatWord = threatsLabel(threatCount).replace(/^\d+\s/, '')
  const nearLabel =
    nearMe && nearbyCount != null
      ? `Біля · ${nearbyCount}`
      : nearMe
        ? `Біля · ${nearMeRadiusKm} км`
        : 'Біля мене'

  const modeSwitch = (
    <div className="mode-switch" role="group" aria-label="Режим карти">
      {(['air', 'ground'] as const).map((mode) => (
        <button
          key={mode}
          type="button"
          className={`mode-switch-btn ${mapMode === mode ? 'active' : ''}`}
          aria-pressed={mapMode === mode}
          onClick={() => onMapModeChange(mode)}
        >
          {MAP_MODE_LABEL[mode]}
        </button>
      ))}
    </div>
  )

  return (
    <header className={`topbar ${menuOpen ? 'menu-open' : ''}`}>
      <div className="brand-block">
        <div className="brand-mark" aria-hidden />
        <div>
          <h1 className="brand-title">Тривога.Карта</h1>
          <p className="brand-sub">
            {mapMode === 'air' ? 'Повітряні загрози України' : 'Наземні втрати техніки'}
          </p>
        </div>
      </div>

      <div className="topbar-mode">{modeSwitch}</div>

      <div
        className={`status-pill status-${status} topbar-live`}
        title={statusLabel(status)}
        aria-label={statusLabel(status)}
      >
        <span className="status-dot" />
        <span className="topbar-live-label">{statusLabel(status)}</span>
      </div>

      <button
        type="button"
        className={`topbar-menu-btn ${menuOpen ? 'active' : ''}`}
        aria-expanded={menuOpen}
        aria-controls="topbar-panel"
        aria-label={menuOpen ? 'Закрити меню' : 'Відкрити меню'}
        onClick={() => setMenuOpen((v) => !v)}
      >
        {menuOpen ? (
          <span className="topbar-menu-close" aria-hidden>
            ×
          </span>
        ) : (
          <span className="topbar-menu-icon" aria-hidden />
        )}
      </button>

      {menuOpen ? (
        <button
          type="button"
          className="topbar-scrim"
          aria-label="Закрити меню"
          onClick={() => setMenuOpen(false)}
        />
      ) : null}

      <div className="topbar-panel" id="topbar-panel">
        <div className="topbar-mode-mobile">{modeSwitch}</div>
        <div className="topbar-center">
          <div className="topbar-stats">
            <div className={`status-pill status-${status} topbar-live-desktop`}>
              <span className="status-dot" />
              {statusLabel(status)}
            </div>
            {mapMode === 'air' ? (
              <>
                <div className="stat-chip">
                  <span className="stat-value">{threatCount}</span>
                  <span className="stat-label">
                    {nearMe && nearbyCount != null
                      ? `поблизу / ${threatWord}`
                      : threatWord}
                  </span>
                </div>
                <div className="stat-chip">
                  <span className="stat-value">{alertCount}</span>
                  <span className="stat-label">зон тривоги</span>
                </div>
              </>
            ) : (
              <div className="stat-chip">
                <span className="stat-value">{threatCount}</span>
                <span className="stat-label">точок на карті</span>
              </div>
            )}
            <div className="stat-chip muted">
              <span className="stat-label">оновлено {relativeUpdated}</span>
            </div>
          </div>
          {mapMode === 'air' ? <SourceStatus sources={sources} bffUp={bffUp} /> : null}
        </div>

        <div className="topbar-actions">
          {mapMode === 'air' ? (
            <OblastWatchMenu
              oblasts={oblasts}
              watched={watchedOblasts}
              permission={notifyPermission}
              onToggle={onToggleOblast}
              onSelectAll={onSelectAllOblasts}
              onClearAll={onClearOblasts}
              onRequestPermission={onRequestNotifyPermission}
            />
          ) : null}
          {mapMode === 'air' ? (
            <button
              type="button"
              className={`btn-locate ${nearMe ? 'active' : ''}`}
              onClick={() => {
                onToggleNearMe()
                setMenuOpen(false)
              }}
              title={`Підсвітити загрози в радіусі ${nearMeRadiusKm} км`}
            >
              {nearLabel}
            </button>
          ) : null}
          <button
            type="button"
            className="btn-locate"
            onClick={() => {
              onLocate()
              setMenuOpen(false)
            }}
            disabled={locateBusy}
            title="Показати моє місце на карті"
          >
            {locateBusy ? 'Шукаємо…' : 'Моє місце'}
          </button>
          {locateError ? <span className="locate-error">{locateError}</span> : null}
        </div>
      </div>
    </header>
  )
}
