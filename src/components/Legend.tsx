import { useMemo } from 'react'
import { THREAT_TYPES } from '../lib/neptun'
import { flameIconDataUrl, threatIconDataUrl } from '../lib/threatIcons'

const items = [
  THREAT_TYPES.uav,
  THREAT_TYPES.missile,
  THREAT_TYPES.ballistic,
  THREAT_TYPES.kab,
  THREAT_TYPES.recon,
  THREAT_TYPES.mig31k,
]

export function Legend() {
  const icons = useMemo(() => {
    const map = new Map<string, string>()
    for (const item of items) {
      map.set(item.type, threatIconDataUrl(item.type, item.hex))
    }
    map.set('uav-group', threatIconDataUrl('uav', undefined, false, true))
    map.set('over-ru', threatIconDataUrl('uav', undefined, true))
    map.set('fire', flameIconDataUrl())
    return map
  }, [])

  return (
    <div className="legend" aria-label="Легенда">
      <p className="legend-title">Типи</p>
      <ul>
        {items.map((item) => (
          <li key={item.type}>
            <img
              className="legend-icon"
              src={icons.get(item.type)}
              alt=""
              width={22}
              height={22}
            />
            {item.shortLabel}
          </li>
        ))}
        <li>
          <img
            className="legend-icon"
            src={icons.get('uav-group')}
            alt=""
            width={22}
            height={22}
          />
          БпЛА · група
        </li>
        <li>
          <img className="legend-icon" src={icons.get('over-ru')} alt="" width={22} height={22} />
          У повітрі над РФ
        </li>
        <li>
          <img className="legend-icon" src={icons.get('fire')} alt="" width={22} height={22} />
          Прильоти / НПЗ (24 год)
        </li>
        <li>
          <span className="legend-swatch russia-border" />
          Кордон РФ
        </li>
        <li>
          <span className="legend-swatch alert" />
          Зона тривоги (Україна)
        </li>
        <li>
          <span className="legend-swatch ru-alert" />
          Тривога / БПЛА в РФ
        </li>
        <li>
          <span className="legend-swatch occupied" />
          Окуповано (DeepState)
        </li>
        <li>
          <span className="legend-swatch unknown-zone" />
          Сіра зона / статус невідомий
        </li>
        <li>
          <span className="legend-swatch shot-down" />
          Збито (коротко)
        </li>
        <li>
          <span className="legend-swatch vanished" />
          Зникло (~3 хв)
        </li>
      </ul>
    </div>
  )
}
