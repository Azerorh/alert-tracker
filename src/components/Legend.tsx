import { THREAT_TYPES } from '../lib/neptun'

const items = [
  THREAT_TYPES.uav,
  THREAT_TYPES.missile,
  THREAT_TYPES.ballistic,
  THREAT_TYPES.kab,
  THREAT_TYPES.recon,
  THREAT_TYPES.mig31k,
]

export function Legend() {
  return (
    <div className="legend" aria-label="Легенда">
      <p className="legend-title">Типи</p>
      <ul>
        {items.map((item) => (
          <li key={item.type}>
            <span className="legend-swatch" style={{ background: item.hex }} />
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
