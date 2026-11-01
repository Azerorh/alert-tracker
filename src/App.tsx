import { useMemo, useState } from 'react'
import { FilterBar } from './components/FilterBar'
import { FooterBar } from './components/FooterBar'
import { Legend } from './components/Legend'
import { MapView } from './components/MapView'
import { ThreatSheet } from './components/ThreatSheet'
import { TopBar } from './components/TopBar'
import { WatchToasts } from './components/WatchToasts'
import { useEnrichedThreats } from './hooks/useEnrichedThreats'
import { useNeptun } from './hooks/useNeptun'
import { useNow } from './hooks/useNow'
import { useOblastWatch } from './hooks/useOblastWatch'
import { useSourceStatus } from './hooks/useSourceStatus'
import {
  distanceKm,
  formatRelativeTime,
  matchesUiFilter,
  predict,
  type UiFilterKey,
} from './lib/neptun'
import { isActiveTrack, type DisplayThreat } from './lib/threatDisplay'

const NEAR_ME_RADIUS_KM = 80

export default function App() {
  const snap = useNeptun()
  const {
    threats: enrichedThreats,
    mapaLinked,
    mapaStatus,
    endedCount,
  } = useEnrichedThreats(snap.threats)
  const { status: sourceStatus, available: bffUp } = useSourceStatus()
  const now = useNow(true)
  const oblastWatch = useOblastWatch(enrichedThreats, now)
  const [filter, setFilter] = useState<UiFilterKey>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(null)
  const [locateToken, setLocateToken] = useState(0)
  const [locateBusy, setLocateBusy] = useState(false)
  const [locateError, setLocateError] = useState<string | null>(null)
  const [nearMe, setNearMe] = useState(false)

  const locate = (thenEnableNearMe = false) => {
    if (!navigator.geolocation) {
      setLocateError('Геолокація недоступна в цьому браузері')
      return
    }
    setLocateBusy(true)
    setLocateError(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation({ lat: pos.coords.latitude, lon: pos.coords.longitude })
        setLocateToken((n) => n + 1)
        setLocateBusy(false)
        if (thenEnableNearMe) setNearMe(true)
      },
      () => {
        setLocateBusy(false)
        setLocateError('Не вдалося визначити місце')
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    )
  }

  const onToggleNearMe = () => {
    if (nearMe) {
      setNearMe(false)
      return
    }
    if (userLocation) {
      setNearMe(true)
      setLocateToken((n) => n + 1)
      return
    }
    locate(true)
  }

  const withDistance = useMemo(() => {
    if (!userLocation) return enrichedThreats.map((t) => ({ threat: t, distKm: null as number | null }))
    return enrichedThreats.map((t) => {
      if (t.areaOnly || !isActiveTrack(t)) return { threat: t, distKm: null as number | null }
      const p = predict(t, now)
      return {
        threat: t,
        distKm: distanceKm(userLocation.lat, userLocation.lon, p.lat, p.lon),
      }
    })
  }, [enrichedThreats, userLocation, now])

  const nearbyIds = useMemo(() => {
    if (!nearMe || !userLocation) return null
    const ids = new Set<string>()
    for (const row of withDistance) {
      if (!isActiveTrack(row.threat)) continue
      if (row.distKm != null && row.distKm <= NEAR_ME_RADIUS_KM) ids.add(row.threat.id)
    }
    return ids
  }, [nearMe, userLocation, withDistance])

  const visibleThreats = useMemo(() => {
    return withDistance
      .filter(({ threat }) => isActiveTrack(threat) && matchesUiFilter(threat.type, filter))
      .filter(({ threat, distKm }) => {
        if (!nearbyIds) return true
        return nearbyIds.has(threat.id) || (distKm != null && distKm <= NEAR_ME_RADIUS_KM)
      })
      .map((r) => r.threat)
  }, [withDistance, filter, nearbyIds])

  const counts = useMemo(() => {
    const base: Record<string, number> = { all: 0 }
    const pool = nearbyIds
      ? enrichedThreats.filter((t) => nearbyIds.has(t.id))
      : enrichedThreats
    for (const t of pool) {
      if (!isActiveTrack(t)) continue
      base.all += 1
      base[t.type] = (base[t.type] ?? 0) + 1
    }
    return base
  }, [enrichedThreats, nearbyIds])

  const selected: DisplayThreat | null = useMemo(
    () => enrichedThreats.find((t) => t.id === selectedId) ?? null,
    [enrichedThreats, selectedId],
  )

  const activeLinkedPool = enrichedThreats.filter((t) => isActiveTrack(t)).length

  const alertCount = snap.alerts.length + snap.alertOblasts.length

  return (
    <div className="app-shell">
      <div className="atmosphere" aria-hidden />
      <TopBar
        status={snap.status}
        threatCount={visibleThreats.length}
        alertCount={alertCount}
        lastUpdatedAt={snap.lastUpdatedAt}
        relativeUpdated={formatRelativeTime(snap.lastUpdatedAt, now)}
        onLocate={() => locate(false)}
        locateBusy={locateBusy}
        locateError={locateError}
        nearMe={nearMe}
        nearMeRadiusKm={NEAR_ME_RADIUS_KM}
        nearbyCount={nearbyIds ? nearbyIds.size : null}
        onToggleNearMe={onToggleNearMe}
        sources={sourceStatus?.sources ?? null}
        bffUp={bffUp}
        oblasts={oblastWatch.oblasts}
        watchedOblasts={oblastWatch.watched}
        notifyPermission={
          typeof Notification === 'undefined' ? 'unsupported' : oblastWatch.permission
        }
        onToggleOblast={oblastWatch.toggleOblast}
        onSelectAllOblasts={oblastWatch.selectAll}
        onClearOblasts={oblastWatch.clearAll}
        onRequestNotifyPermission={() => {
          void oblastWatch.requestPermission()
        }}
      />

      <WatchToasts toasts={oblastWatch.toasts} onDismiss={oblastWatch.dismissToast} />

      <main className="map-stage">
        <MapView
          threats={enrichedThreats}
          alerts={snap.alerts}
          alertOblasts={snap.alertOblasts}
          filter={filter}
          selectedId={selectedId}
          onSelect={setSelectedId}
          locateToken={locateToken}
          userLocation={userLocation}
          nearbyIds={nearbyIds}
          nearMeRadiusKm={nearMe ? NEAR_ME_RADIUS_KM : null}
        />

        <div className="overlay-stack">
          <FilterBar value={filter} onChange={setFilter} counts={counts} />
          <Legend />
          {mapaStatus === 'live' && mapaLinked > 0 ? (
            <p className="track-hint">
              Уточнення треків: MAPA 1↔1 · зв’язано {mapaLinked} з {activeLinkedPool}
            </p>
          ) : null}
          {endedCount.shot_down + endedCount.vanished > 0 ? (
            <p className="track-hint end-hint">
              Нещодавно:{' '}
              {endedCount.shot_down > 0 ? (
                <span className="end-shot">збито {endedCount.shot_down}</span>
              ) : null}
              {endedCount.shot_down > 0 && endedCount.vanished > 0 ? ' · ' : null}
              {endedCount.vanished > 0 ? (
                <span className="end-vanished">зникло {endedCount.vanished}</span>
              ) : null}
            </p>
          ) : null}
          {nearMe && userLocation ? (
            <p className="track-hint">
              Режим «біля мене»: {NEAR_ME_RADIUS_KM} км ·{' '}
              {nearbyIds?.size ?? 0} загроз у радіусі
            </p>
          ) : null}
        </div>

        <ThreatSheet
          threat={selected}
          now={now}
          userLocation={userLocation}
          onClose={() => setSelectedId(null)}
        />
      </main>

      <FooterBar />
    </div>
  )
}
