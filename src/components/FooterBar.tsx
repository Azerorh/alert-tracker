import { DSM_ATTRIBUTION_URL } from '../lib/droneStrikeMap'
import { MAPA_ATTRIBUTION_URL } from '../lib/mapa'
import { DEEPSTATE_ATTRIBUTION_URL, NEPTUN_ATTRIBUTION_URL } from '../lib/neptun'
import { RADAR_MAP_URL } from '../lib/ruAlerts'

export function FooterBar() {
  return (
    <footer className="footer-bar">
      <p className="disclaimer">
        Інформаційна карта, не офіційна система оповіщення. Орієнтуйтесь на сигнал{' '}
        <strong>Повітряної тривоги</strong> та вказівки місцевої влади. Позиції БпЛА — з OSINT-звітів
        (не радар); можливі затримки й похибка на рівень міста/коридору. Удари по РФ — заявлені
        події (не live-треки).
      </p>
      <p className="attribution">
        Дані:{' '}
        <a href={NEPTUN_ATTRIBUTION_URL} target="_blank" rel="noreferrer">
          NEPTUN
        </a>
        {' · '}
        треки:{' '}
        <a href={MAPA_ATTRIBUTION_URL} target="_blank" rel="noreferrer">
          MAPA.UA
        </a>
        {' · '}
        удари РФ / НПЗ:{' '}
        <a href={DSM_ATTRIBUTION_URL} target="_blank" rel="noreferrer">
          Drone Strike Map
        </a>{' '}
        (CC BY 4.0)
        {' · '}
        тривоги РФ:{' '}
        <a href={RADAR_MAP_URL} target="_blank" rel="noreferrer">
          RadarMap
        </a>{' '}
        (на Pages — снапшот ~1 год)
        {' · '}
        окупація:{' '}
        <a href={DEEPSTATE_ATTRIBUTION_URL} target="_blank" rel="noreferrer">
          DeepStateMap
        </a>
      </p>
    </footer>
  )
}
