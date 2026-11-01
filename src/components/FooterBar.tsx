import { MAPA_ATTRIBUTION_URL } from '../lib/mapa'
import { DEEPSTATE_ATTRIBUTION_URL, NEPTUN_ATTRIBUTION_URL } from '../lib/neptun'

export function FooterBar() {
  return (
    <footer className="footer-bar">
      <p className="disclaimer">
        Інформаційна карта, не офіційна система оповіщення. Орієнтуйтесь на сигнал{' '}
        <strong>Повітряної тривоги</strong> та вказівки місцевої влади. Позиції БпЛА — з OSINT-звітів
        (не радар); можливі затримки й похибка на рівень міста/коридору.
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
        окупація:{' '}
        <a href={DEEPSTATE_ATTRIBUTION_URL} target="_blank" rel="noreferrer">
          DeepStateMap
        </a>
      </p>
    </footer>
  )
}
