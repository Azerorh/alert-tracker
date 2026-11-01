import { useMemo } from 'react'
import { THREAT_TYPES } from '../lib/neptun'
import { threatIconDataUrl } from '../lib/threatIcons'

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
          <span className="legend-swatch alert" />
          Зона тривоги
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
          Зникло з треку
        </li>
      </ul>
    </div>
  )
}
