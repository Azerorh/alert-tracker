import { useMemo, useState } from 'react'
import { FilterBar } from './components/FilterBar'
import { FooterBar } from './components/FooterBar'
import { GroundFilterBar } from './components/GroundFilterBar'
import { DsUnitSheet } from './components/DsUnitSheet'
import { GroundSheet } from './components/GroundSheet'
import { EradarSheet } from './components/EradarSheet'
import { Legend } from './components/Legend'
import { MapView } from './components/MapView'
import { PowerOutageSheet } from './components/PowerOutageSheet'
import { PowerQueueBar } from './components/PowerQueueBar'
import { PowerQueueSheet } from './components/PowerQueueSheet'
import { PowerTgSheet } from './components/PowerTgSheet'
import { SightingSheet } from './components/SightingSheet'
import { ThreatSheet } from './components/ThreatSheet'
import { TopBar } from './components/TopBar'
import { WatchToasts } from './components/WatchToasts'
import { useEnrichedThreats } from './hooks/useEnrichedThreats'
import { useTgAirZones } from './hooks/useTgAirZones'
import { useGroundLosses } from './hooks/useGroundLosses'
import { useNeptun } from './hooks/useNeptun'
import { useNow } from './hooks/useNow'
import { useDroneStrikeLayer } from './hooks/useDroneStrikeLayer'
import { useDsUnits } from './hooks/useDsUnits'
import { useGeoConfirmedGround } from './hooks/useGeoConfirmedGround'
import { usePowerOutages } from './hooks/usePowerOutages'
import { usePowerQueue } from './hooks/usePowerQueue'
import { usePowerTgOutages } from './hooks/usePowerTgOutages'
import { useRfSightings } from './hooks/useRfSightings'
import { useRuAlerts } from './hooks/useRuAlerts'
import { tgAirZoneById } from './lib/tgAirZones'
import { parsePowerSelectId, powerOblastByKey } from './lib/powerOutages'
import { POWER_QUEUE_SELECT_ID } from './lib/powerQueue'
import { parsePowerTgSelectId, powerTgById } from './lib/powerTgOutages'
import { findDsmDisplayThreat } from './lib/droneStrikeMap'
import {
  gcMarkerToLoss,
  gcMarkerToSighting,
} from './lib/geoConfirmedGround'
import { findRuBplaDisplayThreat } from './lib/ruAlerts'
import { useOblastWatch } from './hooks/useOblastWatch'
import { useSourceStatus } from './hooks/useSourceStatus'
import type { MapMode } from './lib/mapMode'
import {
  distanceKm,
  formatRelativeTime,
  matchesUiFilter,
  predict,
  type UiFilterKey,
} from './lib/neptun'
import { isActiveTrack, type DisplayThreat } from './lib/threatDisplay'
import {
  matchesGroundFilter,
  type GroundFilterKey,
} from './lib/warspotting'

const NEAR_ME_RADIUS_KM = 80

export default function App() {
  const snap = useNeptun()
  const {
    threats: enrichedThreats,
    mapaLinked,
    mapaStatus,
    mapaAttack,
    endedCount,
  } = useEnrichedThreats(snap.threats)
  const { status: sourceStatus, available: bffUp } = useSourceStatus()
  const now = useNow(true)
  const oblastWatch = useOblastWatch(enrichedThreats, snap.alertOblasts, snap.alerts, now)
  const dsm = useDroneStrikeLayer()
  const ruAlerts = useRuAlerts()
  const [mapMode, setMapMode] = useState<MapMode>('air')
  const tgAir = useTgAirZones(mapMode === 'air')
  const ground = useGroundLosses(mapMode === 'ground')
  const rfSight = useRfSightings(mapMode === 'ground')
  const gcGround = useGeoConfirmedGround(mapMode === 'ground')
  const dsUnits = useDsUnits(mapMode === 'ground')
  const power = usePowerOutages(mapMode === 'light')
  const powerTg = usePowerTgOutages(mapMode === 'light')
  const myQueue = usePowerQueue(power.payload, mapMode === 'light')
  const [filter, setFilter] = useState<UiFilterKey>('all')
  const [groundFilter, setGroundFilter] = useState<GroundFilterKey>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(null)
  const [locateToken, setLocateToken] = useState(0)
  const [locateBusy, setLocateBusy] = useState(false)
  const [locateError, setLocateError] = useState<string | null>(null)
  const [nearMe, setNearMe] = useState(false)

  const onMapModeChange = (mode: MapMode) => {
    setMapMode(mode)
    setSelectedId(null)
    if (mode !== 'air') setNearMe(false)
  }

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
    if (!nearMe || !userLocation || mapMode !== 'air') return null
    const ids = new Set<string>()
    for (const row of withDistance) {
      if (!isActiveTrack(row.threat)) continue
      if (row.distKm != null && row.distKm <= NEAR_ME_RADIUS_KM) ids.add(row.threat.id)
    }
    return ids
  }, [nearMe, userLocation, withDistance, mapMode])

  const visibleThreats = useMemo(() => {
    return withDistance
      .filter(({ threat }) => isActiveTrack(threat) && matchesUiFilter(threat.type, filter))
      .filter(({ threat, distKm }) => {
        if (!nearbyIds) return true
        return nearbyIds.has(threat.id) || (distKm != null && distKm <= NEAR_ME_RADIUS_KM)
      })
      .map((r) => r.threat)
  }, [withDistance, filter, nearbyIds])

  const gcSightings = useMemo(
    () =>
      gcGround.markers.filter((m) => m.kind === 'sighting').map(gcMarkerToSighting),
    [gcGround.markers],
  )

  const gcLosses = useMemo(
    () => gcGround.markers.filter((m) => m.kind === 'loss').map(gcMarkerToLoss),
    [gcGround.markers],
  )

  const mergedLosses = useMemo(
    () => [...ground.losses, ...gcLosses],
    [ground.losses, gcLosses],
  )

  const visibleGround = useMemo(
    () => mergedLosses.filter((l) => matchesGroundFilter(l, groundFilter)),
    [mergedLosses, groundFilter],
  )

  const visibleSightings = useMemo(() => {
    if (groundFilter === 'all' || groundFilter === 'sightings') {
      return [...rfSight.sightings, ...gcSightings]
    }
    return gcSightings.filter((s) => s.category === groundFilter)
  }, [rfSight.sightings, gcSightings, groundFilter])

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

  const groundCounts = useMemo(() => {
    const sightingTotal = rfSight.sightings.length + gcSightings.length
    const base: Record<string, number> = {
      all: mergedLosses.length + sightingTotal + dsUnits.units.length,
      sightings: sightingTotal,
    }
    for (const loss of mergedLosses) {
      base[loss.category] = (base[loss.category] ?? 0) + 1
    }
    for (const s of gcSightings) {
      base[s.category] = (base[s.category] ?? 0) + 1
    }
    for (const u of dsUnits.units) {
      base[u.category] = (base[u.category] ?? 0) + 1
    }
    return base
  }, [mergedLosses, rfSight.sightings, gcSightings, dsUnits.units])

  const selected: DisplayThreat | null = useMemo(() => {
    if (!selectedId || mapMode !== 'air') return null
    return (
      enrichedThreats.find((t) => t.id === selectedId) ??
      findDsmDisplayThreat(selectedId, dsm.strikes, dsm.burning) ??
      findRuBplaDisplayThreat(
        selectedId,
        ruAlerts.alerts,
        ruAlerts.trajectories,
      )
    )
  }, [
    enrichedThreats,
    selectedId,
    dsm.strikes,
    dsm.burning,
    mapMode,
    ruAlerts.alerts,
    ruAlerts.trajectories,
  ])

  const selectedGround = useMemo(() => {
    if (!selectedId || mapMode !== 'ground') return null
    return mergedLosses.find((l) => l.id === selectedId) ?? null
  }, [selectedId, mapMode, mergedLosses])

  const selectedSighting = useMemo(() => {
    if (!selectedId || mapMode !== 'ground') return null
    return (
      rfSight.sightings.find((s) => s.id === selectedId) ??
      gcSightings.find((s) => s.id === selectedId) ??
      null
    )
  }, [selectedId, mapMode, rfSight.sightings, gcSightings])

  const selectedDsUnit = useMemo(() => {
    if (!selectedId || mapMode !== 'ground') return null
    return dsUnits.units.find((u) => u.id === selectedId) ?? null
  }, [selectedId, mapMode, dsUnits.units])

  const selectedPowerTgId = mapMode === 'light' ? parsePowerTgSelectId(selectedId) : null
  const selectedPowerTg = powerTgById(powerTg.markers, selectedPowerTgId)
  const selectedMyQueue =
    mapMode === 'light' && selectedId === POWER_QUEUE_SELECT_ID ? myQueue.resolved : null
  const selectedPowerKey =
    mapMode === 'light' && !selectedPowerTgId && !selectedMyQueue
      ? parsePowerSelectId(selectedId)
      : null
  const selectedPower = powerOblastByKey(power.payload, selectedPowerKey)
  const selectedTgAir =
    mapMode === 'air' ? tgAirZoneById(tgAir.zones, selectedId) : null

  const activeLinkedPool = enrichedThreats.filter((t) => isActiveTrack(t)).length

  const alertCount = snap.alerts.length + snap.alertOblasts.length
  const headerCount =
    mapMode === 'air'
      ? visibleThreats.length
      : mapMode === 'ground'
        ? visibleGround.length + visibleSightings.length
        : power.oblasts.filter((o) => o.offNowCount > 0).length
  const relativeUpdated =
    mapMode === 'air'
      ? formatRelativeTime(snap.lastUpdatedAt, now)
      : mapMode === 'light'
        ? power.status === 'live'
          ? 'щойно'
          : '—'
        : ground.status === 'live' ||
            rfSight.status === 'live' ||
            gcGround.status === 'live'
          ? 'щойно'
          : '—'

  return (
    <div className="app-shell">
      <div className="atmosphere" aria-hidden />
      <TopBar
        mapMode={mapMode}
        onMapModeChange={onMapModeChange}
        status={
          mapMode === 'air'
            ? snap.status
            : mapMode === 'light'
              ? power.status === 'live'
                ? 'live'
                : 'connecting'
              : ground.status === 'live'
                ? 'live'
                : 'connecting'
        }
        threatCount={headerCount}
        alertCount={mapMode === 'light' ? power.oblasts.length : alertCount}
        lastUpdatedAt={snap.lastUpdatedAt}
        relativeUpdated={relativeUpdated}
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
        notifyKinds={oblastWatch.notifyKinds}
        onNotifyKindsChange={oblastWatch.setNotifyKinds}
        notifyPermission={
          typeof Notification === 'undefined' ? 'unsupported' : oblastWatch.permission
        }
        pushStatus={oblastWatch.pushStatus}
        onToggleOblast={oblastWatch.toggleOblast}
        onSelectAllOblasts={oblastWatch.selectAll}
        onClearOblasts={oblastWatch.clearAll}
        onRequestNotifyPermission={() => {
          void oblastWatch.requestPermission()
        }}
      />

      {mapMode === 'air' ? (
        <WatchToasts toasts={oblastWatch.toasts} onDismiss={oblastWatch.dismissToast} />
      ) : null}

      <main className="map-stage">
        <MapView
          mapMode={mapMode}
          threats={enrichedThreats}
          alerts={snap.alerts}
          alertOblasts={snap.alertOblasts}
          filter={filter}
          selectedId={selectedId}
          onSelect={setSelectedId}
          locateToken={locateToken}
          userLocation={userLocation}
          nearbyIds={nearbyIds}
          nearMeRadiusKm={mapMode === 'air' && nearMe ? NEAR_ME_RADIUS_KM : null}
          dsmStrikes={dsm.strikes}
          burningRefineries={dsm.burning}
          ruAlerts={ruAlerts.alerts}
          ruTrajectories={ruAlerts.trajectories}
          groundLosses={visibleGround}
          rfSightings={visibleSightings}
          dsUnits={dsUnits.units}
          groundFilter={groundFilter}
          powerOblasts={power.oblasts}
          powerTgMarkers={powerTg.markers}
          powerQueue={myQueue.resolved}
          eradarZones={tgAir.zones}
        />

        <div className="overlay-stack">
          {mapMode === 'air' ? (
            <FilterBar value={filter} onChange={setFilter} counts={counts} />
          ) : mapMode === 'ground' ? (
            <GroundFilterBar
              value={groundFilter}
              onChange={setGroundFilter}
              counts={groundCounts}
            />
          ) : mapMode === 'light' && power.oblasts.length > 0 ? (
            <PowerQueueBar
              oblasts={power.oblasts}
              resolved={myQueue.resolved}
              onSave={myQueue.setQueue}
              onClear={() => {
                myQueue.clearQueue()
                if (selectedId === POWER_QUEUE_SELECT_ID) setSelectedId(null)
              }}
              onOpen={() => setSelectedId(POWER_QUEUE_SELECT_ID)}
            />
          ) : null}
          <Legend mode={mapMode} />
          {mapMode === 'light' && power.status === 'live' ? (
            <p className="track-hint">
              Світло (графіки ОСР / КолиСвітло): {power.oblasts.length} регіонів · зараз без світла
              за графіком — {power.oblasts.filter((o) => o.offNowCount > 0).length}
              {myQueue.resolved
                ? ` · моя черга ${myQueue.resolved.group.name || myQueue.resolved.groupId}: ${myQueue.resolved.nowLabel}`
                : ''}
            </p>
          ) : null}
          {mapMode === 'light' && powerTg.status === 'live' && powerTg.markers.length > 0 ? (
            <p className="track-hint">
              TG-сигнали: {powerTg.markers.length} точок → орієнтовні зони (≤
              {powerTg.payload?.windowHours ?? 36} год), не полігони черг
            </p>
          ) : null}
          {mapMode === 'light' && power.status === 'error' ? (
            <p className="track-hint">Не вдалося завантажити графіки відключень</p>
          ) : null}
          {mapMode === 'air' &&
          (mapaStatus === 'live' ||
            dsm.status === 'live' ||
            ruAlerts.status === 'live' ||
            tgAir.status === 'live' ||
            endedCount.shot_down + endedCount.vanished > 0) ? (
            <p className="track-hint">
              {[
                mapaStatus === 'live'
                  ? `MAPA${
                      mapaAttack
                        ? ` #${mapaAttack.id}${mapaAttack.status === 'active' ? '' : ''}: БпЛА ${mapaAttack.totalDrones}/рак ${mapaAttack.totalMissiles}/КАБ ${mapaAttack.totalBombs}`
                        : ''
                    }${mapaLinked > 0 ? ` · 1↔1 ${mapaLinked}/${activeLinkedPool}` : ''}`
                  : null,
                tgAir.status === 'live' && tgAir.zones.length > 0
                  ? `TG-зони ${tgAir.zones.length}`
                  : null,
                ruAlerts.status === 'live' && ruAlerts.alerts.length > 0
                  ? `РФ ${ruAlerts.alerts.length} обл.`
                  : null,
                dsm.status === 'live' && (dsm.strikes.length > 0 || dsm.burning.length > 0)
                  ? `удари РФ ${dsm.strikes.length}${dsm.burning.length ? ` · НПЗ ${dsm.burning.length}` : ''}`
                  : null,
                endedCount.shot_down + endedCount.vanished > 0
                  ? `збито ${endedCount.shot_down} · зникло ${endedCount.vanished}`
                  : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          ) : null}
          {mapMode === 'air' && nearMe && userLocation ? (
            <p className="track-hint">
              Режим «біля мене»: {NEAR_ME_RADIUS_KM} км ·{' '}
              {nearbyIds?.size ?? 0} загроз у радіусі
            </p>
          ) : null}
          {mapMode === 'ground' && ground.status === 'live' && groundFilter !== 'sightings' ? (
            <p className="track-hint">
              WarSpotting · 21 діб: {visibleGround.length}
              {groundFilter !== 'all' ? ` / ${ground.losses.length}` : ''} втрат РФ
            </p>
          ) : null}
          {mapMode === 'ground' && rfSight.status === 'live' ? (
            <p className="track-hint">
              Активні сайтінги РФ (≤7 діб):{' '}
              {groundFilter === 'all' || groundFilter === 'sightings'
                ? rfSight.sightings.length
                : 0}{' '}
              TG · не втрати · не ЗСУ
            </p>
          ) : null}
          {mapMode === 'ground' && gcGround.status === 'live' ? (
            <p className="track-hint">
              GeoConfirmed (РФ kit ≤21 діб):{' '}
              {gcGround.markers.filter((m) =>
                groundFilter === 'all' || groundFilter === 'sightings'
                  ? true
                  : m.category === groundFilter,
              ).length}{' '}
              · verified, без ударів по Україні
            </p>
          ) : null}
          {mapMode === 'ground' && dsUnits.status === 'live' ? (
            <p className="track-hint">
              Підрозділи РФ (DeepState, зріз):{' '}
              {groundFilter === 'all' || groundFilter === 'sightings'
                ? dsUnits.units.length
                : dsUnits.units.filter((u) => u.category === groundFilter).length}
            </p>
          ) : null}
          {mapMode === 'ground' && ground.status === 'error' ? (
            <p className="track-hint">Не вдалося завантажити дані WarSpotting</p>
          ) : null}
          {mapMode === 'ground' && rfSight.status === 'error' ? (
            <p className="track-hint">Не вдалося завантажити TG-сайтінги</p>
          ) : null}
          {mapMode === 'ground' && gcGround.status === 'error' ? (
            <p className="track-hint">Не вдалося завантажити GeoConfirmed</p>
          ) : null}
        </div>
      </main>

      <FooterBar />

      {/* Outside map-stage so width tracks .app-shell (not the inflated layout viewport). */}
      {mapMode === 'air' ? (
        selectedTgAir ? (
          <EradarSheet zone={selectedTgAir} onClose={() => setSelectedId(null)} />
        ) : (
          <ThreatSheet
            threat={selected}
            now={now}
            userLocation={userLocation}
            onClose={() => setSelectedId(null)}
          />
        )
      ) : mapMode === 'light' ? (
        selectedPowerTg ? (
          <PowerTgSheet marker={selectedPowerTg} onClose={() => setSelectedId(null)} />
        ) : selectedMyQueue ? (
          <PowerQueueSheet
            queue={selectedMyQueue}
            kyivHour={power.payload?.kyivHour ?? 0}
            onClose={() => setSelectedId(null)}
            onClear={() => {
              myQueue.clearQueue()
              setSelectedId(null)
            }}
          />
        ) : (
          <PowerOutageSheet
            oblast={selectedPower}
            kyivHour={power.payload?.kyivHour ?? 0}
            onClose={() => setSelectedId(null)}
          />
        )
      ) : selectedSighting ? (
        <SightingSheet sighting={selectedSighting} onClose={() => setSelectedId(null)} />
      ) : selectedDsUnit ? (
        <DsUnitSheet unit={selectedDsUnit} onClose={() => setSelectedId(null)} />
      ) : (
        <GroundSheet loss={selectedGround} onClose={() => setSelectedId(null)} />
      )}
    </div>
  )
}
