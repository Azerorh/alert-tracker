import { useState } from 'react'
import { DSM_ATTRIBUTION_URL } from '../lib/droneStrikeMap'
import { MAPA_ATTRIBUTION_URL } from '../lib/mapa'
import { DEEPSTATE_ATTRIBUTION_URL, NEPTUN_ATTRIBUTION_URL } from '../lib/neptun'
import { NAHR_MAP_URL, NAHR_TG_CHANNELS } from '../lib/ruAlerts'

export function FooterBar() {
  const [open, setOpen] = useState(false)

  return (
    <footer className={`footer-bar ${open ? 'open' : ''}`}>
      <button
        type="button"
        className="footer-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span>Не офіційна тривога · джерела даних</span>
        <span className="footer-toggle-chevron" aria-hidden>
          {open ? '▾' : '▴'}
        </span>
      </button>

      <div className="footer-body">
        <p className="disclaimer">
          Інформаційна карта, не офіційна система оповіщення. Орієнтуйтесь на сигнал{' '}
          <strong>Повітряної тривоги</strong> та вказівки місцевої влади. Позиції БпЛА — з
          OSINT-звітів (не радар); можливі затримки й похибка на рівень міста/коридору. Удари по
          РФ — заявлені події (не live-треки).
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
          {NAHR_TG_CHANNELS.map((c, i) => (
            <span key={c.id}>
              {i ? ' · ' : null}
              <a href={c.url} target="_blank" rel="noreferrer">
                {c.label}
              </a>
            </span>
          ))}{' '}
          (як{' '}
          <a href={NAHR_MAP_URL} target="_blank" rel="noreferrer">
            map.nahr.uk
          </a>
          ; на Pages — снапшот)
          {' · '}
          окупація:{' '}
          <a href={DEEPSTATE_ATTRIBUTION_URL} target="_blank" rel="noreferrer">
            DeepStateMap
          </a>
        </p>
      </div>
    </footer>
  )
}
