import {
  CONFIDENCE_META,
  distanceKm,
  formatClock,
  formatRelativeTime,
  getTypeMeta,
  predict,
  sourcesLabel,
} from '../lib/neptun'
import {
  endKindColor,
  endKindLabel,
  isEndedThreat,
  type DisplayThreat,
} from '../lib/threatDisplay'
import { SheetChrome } from './SheetChrome'

type Props = {
  threat: DisplayThreat | null
  now: number
  userLocation: { lat: number; lon: number } | null
  onClose: () => void
}

function confidenceLabel(level: string | undefined): string {
  if (!level) return 'невідома'
  const meta = CONFIDENCE_META[level as keyof typeof CONFIDENCE_META]
  return meta?.label ?? level
}

function precisionLabel(threat: DisplayThreat): string {
  if (threat.id.startsWith('npz-')) return 'координати об’єкта (Drone Strike Map)'
  if (threat.id.startsWith('dsm-')) return 'заявлена точка удару (не live-трек)'
  if (threat.id.startsWith('ru-bpla:place:'))
    return 'орієнтовно · населений пункт з TG'
  if (threat.id.startsWith('ru-bpla:'))
    return 'центр області з тривогою (не точка БПЛА)'
  if (isEndedThreat(threat) && threat.endKind) {
    return threat.endKind === 'shot_down'
      ? 'остання відома точка · збито'
      : 'остання відома точка · зникло з трекінгу'
  }
  if (threat.areaOnly) return 'лише область (без точки)'
  if (threat.positionQuality === 'mapa') return 'уточнено MAPA (трек / прогноз)'
  if (threat.positionQuality === 'confirmed') return 'підтверджена точка звіту'
  if (threat.velocity) return 'оцінка руху між звітами'
  return 'населений пункт / коридор'
}

export function ThreatSheet({ threat, now, userLocation, onClose }: Props) {
  if (!threat) return null

  const meta = getTypeMeta(threat.type)
  const isNpz = threat.id.startsWith('npz-')
  const isDsm = threat.id.startsWith('dsm-') || isNpz
  const isRuBpla = threat.id.startsWith('ru-bpla:')
  const ended = isEndedThreat(threat)
  const areaOnly = Boolean(threat.areaOnly)
  const advisory = Boolean(threat.advisory)
  const predicted =
    areaOnly || ended || isDsm || isRuBpla ? null : predict(threat, now)
  const lat = predicted?.lat ?? threat.lat
  const lon = predicted?.lon ?? threat.lon
  const accent = isNpz
    ? '#ff6a00'
    : isRuBpla
      ? '#ff6b6b'
      : isDsm
        ? '#ff3b3b'
        : ended && threat.endKind
          ? endKindColor(threat.endKind)
          : meta.hex
  const kicker = isNpz
    ? 'НПЗ / паливо · нещодавній вогонь'
    : isRuBpla
      ? `Тривога РФ (TG) · ${meta.label}`
      : isDsm
        ? `Удар по РФ · ${meta.label}`
        : `${meta.label}${ended && threat.endKind ? ` · ${endKindLabel(threat.endKind)}` : ''}${!ended && advisory ? ' · спостереження' : ''}${areaOnly ? ' · лише область' : ''}`

  const distance =
    userLocation && !areaOnly
      ? distanceKm(userLocation.lat, userLocation.lon, lat, lon)
      : null

  return (
    <aside className={`threat-sheet ${ended ? 'ended' : ''}`} aria-live="polite">
      <SheetChrome accent={accent} kicker={kicker} title={threat.title} onClose={onClose}>
        <p className="sheet-explain">{threat.explanationShort}</p>

        <dl className="sheet-grid">
          {ended && threat.endKind ? (
            <div>
              <dt>Статус</dt>
              <dd>
                {threat.endKind === 'shot_down'
                  ? 'Позначено як збите (MAPA eliminated / підтвердження джерел). Маркер зникне за ~1 хв.'
                  : 'Зникло з живого трекінгу (немає оновлень або hit_target). Іконка й трек лишаються ~3 хв — це не завжди = збито.'}
              </dd>
            </div>
          ) : null}
          <div>
            <dt>Місце</dt>
            <dd>
              {[threat.locality, threat.district, threat.region].filter(Boolean).join(' · ') || '—'}
            </dd>
          </div>
          <div>
            <dt>Точність маркера</dt>
            <dd>{precisionLabel(threat)}</dd>
          </div>
          <div>
            <dt>Оновлено</dt>
            <dd>
              {formatRelativeTime(threat.updatedAt, now)}
              <span className="mono"> · {formatClock(threat.updatedAt)}</span>
            </dd>
          </div>
          <div>
            <dt>Впевненість</dt>
            <dd>{confidenceLabel(threat.displayConfidence ?? threat.confidenceLevel)}</dd>
          </div>
          <div>
            <dt>Джерела</dt>
            <dd>{threat.sourceCount ? sourcesLabel(threat.sourceCount) : '—'}</dd>
          </div>
          {!ended && !areaOnly && threat.velocity ? (
            <div>
              <dt>Рух</dt>
              <dd>
                {Math.round(threat.velocity.speedKmh)} км/г · курс{' '}
                {Math.round(threat.velocity.bearingDeg)}°
              </dd>
            </div>
          ) : null}
          {!ended && threat.uncertaintyKm ? (
            <div>
              <dt>Невизначеність</dt>
              <dd>~{Math.round(threat.uncertaintyKm)} км</dd>
            </div>
          ) : null}
          {distance != null ? (
            <div>
              <dt>До вас</dt>
              <dd>~{Math.round(distance)} км</dd>
            </div>
          ) : null}
          {threat.count && threat.count > 1 ? (
            <div>
              <dt>У групі</dt>
              <dd>{threat.count}+</dd>
            </div>
          ) : null}
          <div className="sheet-note">
            <dt>Важливо</dt>
            <dd>
              {isRuBpla
                ? 'Дані з публічних TG-каналів (як map.nahr.uk): регіональна тривога / фіксація, не радар і не live-трек NEPTUN.'
                : isDsm
                  ? 'Дані Drone Strike Map (CC BY 4.0): заявлені події з відкритих джерел, не live-трек і не радар.'
                  : ended
                    ? 'Короткий слід для зрозумілості карти. Не є офіційним підтвердженням ППО.'
                    : areaOnly
                      ? 'Точної точки немає — джерела назвали лише регіон. Маркер у центрі області не є місцем БпЛА.'
                      : threat.positionQuality === 'mapa'
                        ? 'Позицію підтягнуто з MAPA-треку (не радар). Між оновленнями — їхній прогноз, без подвійної екстраполяції.'
                        : 'Це не військовий радар. Точка — з публічних звітів (місто/напрямок) + оцінка руху між оновленнями.'}
            </dd>
          </div>
        </dl>
      </SheetChrome>
    </aside>
  )
}
