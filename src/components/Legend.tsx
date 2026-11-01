import { useMemo } from 'react'
import { dsUnitIconDataUrl } from '../lib/dsUnitIcon'
import { groundIconDataUrl } from '../lib/groundIcons'
import type { MapMode } from '../lib/mapMode'
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

type Props = {
  mode?: MapMode
}

export function Legend({ mode = 'air' }: Props) {
  const icons = useMemo(() => {
    const map = new Map<string, string>()
    for (const item of items) {
      map.set(item.type, threatIconDataUrl(item.type, item.hex))
    }
    map.set('fire', flameIconDataUrl())
    map.set('over-ru', threatIconDataUrl('uav', undefined, true))
    map.set('sighting', groundIconDataUrl('tanks', 'sighting'))
    map.set('loss', groundIconDataUrl('tanks', 'loss'))
    map.set('unit', dsUnitIconDataUrl(false))
    return map
  }, [])

  if (mode === 'ground') {
    return (
      <div className="legend" aria-label="Легенда">
        <p className="legend-title">Земля · РФ</p>
        <ul>
          <li>
            <img className="legend-icon" src={icons.get('sighting')} alt="" width={22} height={22} />
            Сайтінг
          </li>
          <li>
            <img className="legend-icon" src={icons.get('loss')} alt="" width={22} height={22} />
            Втрата
          </li>
          <li>
            <img className="legend-icon" src={icons.get('unit')} alt="" width={22} height={22} />
            Підрозділ
          </li>
          <li>
            <span className="legend-swatch occupied" />
            Окупація
          </li>
        </ul>
      </div>
    )
  }

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
          <img className="legend-icon" src={icons.get('fire')} alt="" width={22} height={22} />
          Приліт / НПЗ
        </li>
        <li>
          <img className="legend-icon" src={icons.get('over-ru')} alt="" width={22} height={22} />
          БПЛА над РФ
        </li>
        <li>
          <span className="legend-swatch alert" />
          Тривога UA / РФ
        </li>
        <li>
          <span className="legend-swatch occupied" />
          Окупація
        </li>
      </ul>
    </div>
  )
}
