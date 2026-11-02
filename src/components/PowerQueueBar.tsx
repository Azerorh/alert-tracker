import { useMemo, useState } from 'react'
import type { PowerOblast } from '../lib/powerOutages'
import {
  dsoGroupPrefix,
  type ResolvedPowerQueue,
  type SavedPowerQueue,
  type YasnoAddressItem,
  YASNO_QUEUE_REGIONS,
  yasnoGroupToKolysvitloId,
  yasnoResolveGroup,
  yasnoSearchCities,
  yasnoSearchHouses,
  yasnoSearchStreets,
} from '../lib/powerQueue'

type Props = {
  oblasts: PowerOblast[]
  resolved: ResolvedPowerQueue | null
  onSave: (saved: SavedPowerQueue) => void
  onClear: () => void
  onOpen: () => void
}

type Mode = 'manual' | 'yasno'

export function PowerQueueBar({ oblasts, resolved, onSave, onClear, onOpen }: Props) {
  const [open, setOpen] = useState(!resolved)
  const [mode, setMode] = useState<Mode>('manual')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [oblastKey, setOblastKey] = useState(oblasts[0]?.oblastKey ?? '')
  const groups = useMemo(() => {
    const o = oblasts.find((x) => x.oblastKey === oblastKey)
    return o ? Object.entries(o.groups).sort(([a], [b]) => a.localeCompare(b, 'uk', { numeric: true })) : []
  }, [oblasts, oblastKey])
  const [groupId, setGroupId] = useState('')

  const [regionId, setRegionId] = useState(YASNO_QUEUE_REGIONS[0]?.id ?? 25)
  const region = YASNO_QUEUE_REGIONS.find((r) => r.id === regionId) ?? YASNO_QUEUE_REGIONS[0]
  const [dsoId, setDsoId] = useState(region?.dsos[0]?.id ?? 902)
  const [cityQuery, setCityQuery] = useState('')
  const [cities, setCities] = useState<YasnoAddressItem[]>([])
  const [city, setCity] = useState<YasnoAddressItem | null>(null)
  const [streetQuery, setStreetQuery] = useState('')
  const [streets, setStreets] = useState<YasnoAddressItem[]>([])
  const [street, setStreet] = useState<YasnoAddressItem | null>(null)
  const [houseQuery, setHouseQuery] = useState('')
  const [houses, setHouses] = useState<YasnoAddressItem[]>([])
  const [house, setHouse] = useState<YasnoAddressItem | null>(null)

  const onRegionChange = (id: number) => {
    setRegionId(id)
    const r = YASNO_QUEUE_REGIONS.find((x) => x.id === id)
    setDsoId(r?.dsos[0]?.id ?? 902)
    setCity(null)
    setCities([])
    setCityQuery('')
    setStreet(null)
    setStreets([])
    setStreetQuery('')
    setHouse(null)
    setHouses([])
    setHouseQuery('')
  }

  const searchCities = async () => {
    if (!region?.hasCities || cityQuery.trim().length < 2) return
    setBusy(true)
    setError(null)
    try {
      const rows = await yasnoSearchCities({ regionId, dsoId, query: cityQuery })
      setCities(rows.slice(0, 20))
      if (!rows.length) setError('Місто не знайдено в Yasno')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setCities([])
    } finally {
      setBusy(false)
    }
  }

  const searchStreets = async () => {
    if (streetQuery.trim().length < 3) {
      setError('Введіть щонайменше 3 літери вулиці')
      return
    }
    if (region?.hasCities && !city) {
      setError('Спочатку оберіть місто')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const rows = await yasnoSearchStreets({
        regionId,
        dsoId,
        query: streetQuery,
        cityId: city?.id,
      })
      setStreets(rows.slice(0, 20))
      setStreet(null)
      setHouse(null)
      setHouses([])
      if (!rows.length) setError('Вулицю не знайдено')
    } catch (err) {
      setError(
        'Пошук адреси недоступний (потрібен BFF). Оберіть чергу вручну або запустіть npm run dev.',
      )
      setStreets([])
    } finally {
      setBusy(false)
    }
  }

  const searchHouses = async (streetItem: YasnoAddressItem) => {
    setStreet(streetItem)
    setBusy(true)
    setError(null)
    try {
      const rows = await yasnoSearchHouses({
        regionId,
        dsoId,
        streetId: streetItem.id,
        query: houseQuery.trim() || '1',
        cityId: city?.id,
      })
      setHouses(rows.slice(0, 40))
      setHouse(null)
      if (!rows.length) setError('Будинок не знайдено — спробуйте інший номер')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setHouses([])
    } finally {
      setBusy(false)
    }
  }

  const saveManual = () => {
    const o = oblasts.find((x) => x.oblastKey === oblastKey)
    const gid = groupId || groups[0]?.[0]
    if (!o || !gid) {
      setError('Оберіть регіон і чергу')
      return
    }
    const g = o.groups[gid]
    onSave({
      oblastKey: o.oblastKey,
      groupId: gid,
      groupLabel: g?.name || gid,
      source: 'manual',
      addressLabel: null,
      yasno: null,
      savedAt: new Date().toISOString(),
    })
    setOpen(false)
    setError(null)
  }

  const saveYasno = async () => {
    if (!street || !house || !region) {
      setError('Оберіть вулицю і будинок')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const hit = await yasnoResolveGroup({
        regionId,
        dsoId,
        streetId: street.id,
        houseId: house.id,
        cityId: city?.id,
      })
      const prefix = dsoGroupPrefix(region, dsoId)
      const gid = yasnoGroupToKolysvitloId(hit.queue, prefix)
      const o = oblasts.find((x) => x.oblastKey === region.oblastKey)
      if (!o?.groups[gid] && !Object.keys(o?.groups ?? {}).some((k) => k.endsWith(hit.queue) || k.includes(hit.queue))) {
        // Still save — resolveSavedQueue has fuzzy match
      }
      const addressLabel = [city?.value, street.value, house.value].filter(Boolean).join(', ')
      onSave({
        oblastKey: region.oblastKey,
        groupId: gid,
        groupLabel: hit.queue,
        source: 'yasno',
        addressLabel,
        yasno: {
          regionId,
          dsoId,
          street: street.value,
          house: house.value,
          city: city?.value,
        },
        savedAt: new Date().toISOString(),
      })
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="power-queue-bar" aria-label="Моя черга відключень">
      {resolved ? (
        <div className="power-queue-summary">
          <button type="button" className="power-queue-status" onClick={onOpen}>
            <span className={`power-queue-dot ${resolved.nowOff ? 'off' : 'on'}`} />
            Моя черга: {resolved.group.name || resolved.groupId}
            <span className="power-queue-meta">
              {resolved.oblast.name} · {resolved.nowLabel}
            </span>
          </button>
          <button type="button" className="filter-chip" onClick={() => setOpen((v) => !v)}>
            {open ? 'Згорнути' : 'Змінити'}
          </button>
          <button
            type="button"
            className="filter-chip"
            onClick={() => {
              onClear()
              setOpen(true)
            }}
          >
            Скинути
          </button>
        </div>
      ) : (
        <button type="button" className="filter-chip active" onClick={() => setOpen(true)}>
          Вказати мою чергу
        </button>
      )}

      {open ? (
        <div className="power-queue-panel">
          <div className="power-queue-modes">
            <button
              type="button"
              className={`filter-chip ${mode === 'manual' ? 'active' : ''}`}
              onClick={() => setMode('manual')}
            >
              Вручну
            </button>
            <button
              type="button"
              className={`filter-chip ${mode === 'yasno' ? 'active' : ''}`}
              onClick={() => setMode('yasno')}
            >
              За адресою (Yasno)
            </button>
          </div>

          {mode === 'manual' ? (
            <div className="power-queue-form">
              <label>
                Регіон
                <select
                  value={oblastKey}
                  onChange={(e) => {
                    setOblastKey(e.target.value)
                    setGroupId('')
                  }}
                >
                  {oblasts.map((o) => (
                    <option key={o.oblastKey} value={o.oblastKey}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Черга
                <select value={groupId || groups[0]?.[0] || ''} onChange={(e) => setGroupId(e.target.value)}>
                  {groups.map(([id, g]) => (
                    <option key={id} value={id}>
                      {g.name || id}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" className="filter-chip active" onClick={saveManual} disabled={!groups.length}>
                Зберегти
              </button>
            </div>
          ) : (
            <div className="power-queue-form">
              <p className="power-queue-note">
                Київ і Дніпро через Yasno. Інші області — вкладка «Вручну» (номер черги з сайту ОСР).
              </p>
              <label>
                Регіон Yasno
                <select
                  value={regionId}
                  onChange={(e) => onRegionChange(Number(e.target.value))}
                >
                  {YASNO_QUEUE_REGIONS.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.value}
                    </option>
                  ))}
                </select>
              </label>
              {region && region.dsos.length > 1 ? (
                <label>
                  Оператор
                  <select value={dsoId} onChange={(e) => setDsoId(Number(e.target.value))}>
                    {region.dsos.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {region?.hasCities ? (
                <label>
                  Місто
                  <span className="power-queue-row">
                    <input
                      value={cityQuery}
                      onChange={(e) => setCityQuery(e.target.value)}
                      placeholder="Дніпро"
                    />
                    <button type="button" className="filter-chip" onClick={() => void searchCities()} disabled={busy}>
                      Шукати
                    </button>
                  </span>
                  {cities.length ? (
                    <select
                      value={city?.id ?? ''}
                      onChange={(e) => {
                        const hit = cities.find((c) => c.id === Number(e.target.value)) ?? null
                        setCity(hit)
                      }}
                    >
                      <option value="">—</option>
                      {cities.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.value}
                        </option>
                      ))}
                    </select>
                  ) : null}
                </label>
              ) : null}
              <label>
                Вулиця
                <span className="power-queue-row">
                  <input
                    value={streetQuery}
                    onChange={(e) => setStreetQuery(e.target.value)}
                    placeholder="Хрещатик"
                  />
                  <button type="button" className="filter-chip" onClick={() => void searchStreets()} disabled={busy}>
                    Шукати
                  </button>
                </span>
                {streets.length ? (
                  <select
                    value={street?.id ?? ''}
                    onChange={(e) => {
                      const hit = streets.find((s) => s.id === Number(e.target.value))
                      if (hit) void searchHouses(hit)
                    }}
                  >
                    <option value="">— оберіть —</option>
                    {streets.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.value}
                      </option>
                    ))}
                  </select>
                ) : null}
              </label>
              <label>
                Будинок
                <span className="power-queue-row">
                  <input
                    value={houseQuery}
                    onChange={(e) => setHouseQuery(e.target.value)}
                    placeholder="1"
                  />
                  <button
                    type="button"
                    className="filter-chip"
                    disabled={busy || !street}
                    onClick={() => street && void searchHouses(street)}
                  >
                    Оновити
                  </button>
                </span>
                {houses.length ? (
                  <select
                    value={house?.id ?? ''}
                    onChange={(e) => {
                      const hit = houses.find((h) => h.id === Number(e.target.value)) ?? null
                      setHouse(hit)
                    }}
                  >
                    <option value="">—</option>
                    {houses.map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.value}
                      </option>
                    ))}
                  </select>
                ) : null}
              </label>
              <button
                type="button"
                className="filter-chip active"
                onClick={() => void saveYasno()}
                disabled={busy || !street || !house}
              >
                {busy ? '…' : 'Зберегти чергу'}
              </button>
            </div>
          )}
          {error ? <p className="power-queue-error">{error}</p> : null}
        </div>
      ) : null}
    </div>
  )
}
