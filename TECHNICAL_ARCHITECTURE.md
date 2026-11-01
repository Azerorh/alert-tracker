# Air Threat Tracker — Technical Architecture

**Product decisions (locked for v1)**

| Decision | Choice |
|----------|--------|
| Audience | Public website for everyone |
| Notifications | None (site updates only; no Telegram / SMS / Web Push yet) |
| Map mode | Live marker per airborne object |
| Language | Ukrainian only |
| Moderation | Fully automatic |
| Organization | Solo founder — no legal entity yet |

This document describes how the system can work technically, which public data sources are realistically available today, and a lean architecture a single developer can ship.

---

## 1. Purpose

A public Ukrainian-language web map that shows **near–real-time air threats** over Ukraine (Shahed-type UAVs, cruise/ballistic missiles, KABs, related objects) as **individual live markers**, with zoom/pan and automatic updates as data changes.

**v1 goals**

- Fast situational picture on a real basemap
- One marker per tracked object (type, heading, last update)
- Official air-raid zone overlay as secondary context
- Clear disclaimer: not a substitute for official «Повітряна тривога»

**v1 non-goals**

- Push / Telegram / SMS alerts
- Manual moderator workflow
- Own radar / acoustic sensor network
- Guaranteed detection of every threat
- English UI

---

## 2. Reality Check: Where Live Tracks Come From

There is **no public civilian radar API** that streams raw military tracks. What exists today:

1. **Aggregator APIs** — services that already parse official / regional Telegram channels, geocode place names, fuse reports into tracks, and expose JSON / WebSocket. These are the only practical sources for **per-object lat/lon markers** for a solo MVP.
2. **Official siren APIs** — oblast/raion/hromada alarm state (polygons), not missile positions.
3. **Acoustic / Sky Fortress–class networks** — used operationally in Ukraine; **not** available as open public feeds for third-party apps.
4. **ADS-B** — civilian flights only; useless for Shaheds / ballistic.

**Implication for v1:** the product is a **client + thin backend** over one or two trusted aggregators, not a from-scratch OSINT pipeline. Building your own Telegram→NLP→geocode stack is Phase 2+ if aggregators become unavailable or insufficient.

---

## 3. Recommended Data Sources (Ranked)

### Tier A — Live object tracks (primary for markers)

| Source | Auth | Realtime | What you get | Notes |
|--------|------|----------|--------------|-------|
| **[NEPTUN](https://neptun.in.ua/developers)** | None | REST + **WebSocket** + JS SDK | `lat`/`lon`, type (`uav`, `missile`, `ballistic`, `kab`, …), heading, velocity, confidence, status, uncertainty, official alerts | Free; **visible attribution required**; poll REST ≤ 1/5s; prefer WS/SDK. Includes `advisory` / `areaOnly` flags — respect them in UI. |
| **[MAPA.UA](https://mapa.ua/docs/)** | None | REST (`/api/v1/current`) | Objects with `kind`/`subkind`, heading, speed, **trail**, predicted lat/lon, attack grouping, statuses (`active` / `eliminated` / …) | Rich trail/replay APIs; good for history and smoother paths. Confirm current ToS / attribution before production. |

**Recommendation for solo MVP**

- **Primary ingest:** NEPTUN WebSocket (`wss://neptun.in.ua/api/v1/stream`) or their SDK (`RealtimeClient` + `predict()` for dead-reckoning between updates).
- **Optional secondary:** MAPA.UA `/current` for trail enrichment / cross-check (fusion later).
- Start with **one** source to avoid double markers; add fusion only when needed.

### Tier B — Official / siren state (zone overlay, not markers)

| Source | Auth | Role |
|--------|------|------|
| **[Ukraine Alarm API](https://api.ukrainealarm.com/)** (`api.ukrainealarm.com`) | API key (request form) | Closest to the official «Повітряна тривога» app data — best for zone coloring |
| **[alerts.in.ua](https://devs.alerts.in.ua/)** | Free token (request form) | Mature alerts API + threat types per region; IoT compact endpoints |
| **NEPTUN `/api/v1/alerts`** | None | Raion/oblast keys + GeoJSON-aligned keys — convenient if NEPTUN is already primary |
| **[eRadar](https://eradar.app/llms.txt)** | None | Compact status JSON + Telegram-derived danger reports; poll ≥ 30s |

**Recommendation:** use NEPTUN alerts for v1 (zero signup). Apply for Ukraine Alarm and/or alerts.in.ua when you want stronger official grounding.

### Tier C — Unofficial / limited (backup only)

| Source | Notes |
|--------|-------|
| [raid.fly.dev](https://raid.fly.dev/) | Oblast-level alerts from `@air_alert_ua`; not object tracks |
| Raw Telegram channels (OVA, monitors) | Highest effort; ToS/rate limits; needed only if aggregators fail |

### Not usable as public product feeds (today)

- Military radar plots
- Sky Fortress / Zvook / FENEK acoustic triangulations (closed / defense-oriented)
- Unlicensed scraping of private APIs

---

## 4. Product Architecture (Solo-Friendly)

Because notifications and moderation are out of scope, the system stays thin:

```
┌──────────────────────────────┐
│ NEPTUN (WS/REST) ± MAPA.UA   │  external truth for tracks + alerts
└──────────────┬───────────────┘
               ▼
┌──────────────────────────────┐
│ Optional BFF (Node/Go)       │  cache, normalize, rate-limit, CORS,
│                              │  hide upstream quirks, kill-switch
└──────────────┬───────────────┘
               ▼
┌──────────────────────────────┐
│ Static / PWA frontend (UK)   │  MapLibre map + live markers + zones
│                              │  WebSocket or poll → update markers
└──────────────────────────────┘
```

**Even thinner option (weekend prototype):** browser talks to NEPTUN SDK / WebSocket **directly** (CORS open). No backend. Ship map + attribution + disclaimer. Add a BFF when you need caching, multi-source fusion, or to protect against upstream changes.

---

## 5. Data Model (Normalized Internally)

```text
ThreatMarker {
  id: string                 // stable across upserts
  type: uav | recon | missile | ballistic | kab | mig31k | unknown
  title_uk: string
  lat: number
  lon: number
  heading_deg: number | null
  speed_kmh: number | null
  confidence: low | medium | high | null
  status: active | stale | resolved | eliminated | …
  count: number              // group size if provided
  uncertainty_km: number | null
  area_only: boolean         // true → do NOT treat lat/lon as a point report
  advisory: boolean          // true → observational, not “take shelter” cue
  updated_at: ISO datetime
  source: "neptun" | "mapa" | "fused"
  trail?: [lon, lat, t][]    // if available from MAPA or local buffer
}

AlertZone {
  key: string                // e.g. odeska:odeskyi
  name_uk: string
  level: oblast | raion
  since: ISO datetime
}
```

Map rules driven by flags:

- `area_only` → region highlight or soft area label, **not** a pinpoint marker with false distance-to-user
- `advisory` → muted styling (no panic chrome)
- stale beyond N minutes → fade or remove

---

## 6. Frontend (Live Markers)

### Stack

- **Map:** MapLibre GL JS + OSM or other open tiles
- **App:** Vite + React (or Svelte) as Ukrainian PWA
- **Realtime:** NEPTUN WebSocket / SDK; fallback REST every 5–10 s
- **Motion:** `predict()` / dead-reckoning between server updates so markers glide instead of jumping

### UX (v1)

- Full-screen map of Ukraine; zoom/pan; deep link `?lat=&lon=&z=`
- Marker per object: icon by type, heading chevron, optional short trail
- Tap → bottom sheet: type, region/locality, updated time, confidence
- Layer toggles: threats / official alert zones
- Filters: БпЛА / ракети / балістика / КАБ
- Persistent footer: «Не замінює офіційну тривогу» + attribution link to NEPTUN (and MAPA if used)
- Mobile-first; «Моє місце» opt-in (browser geolocation only; no account)

### Performance

- Update markers in place by `id` (upsert/remove), do not rebuild the whole layer
- Declutter / cluster only when zoomed far out; individual markers at city zoom
- Target: paint updates &lt; 100 ms after message receipt

---

## 7. Backend (When You Add It)

Minimal BFF responsibilities:

| Concern | Approach |
|---------|----------|
| Ingest | One WS consumer to NEPTUN; optional MAPA poller |
| Normalize | Map upstream fields → `ThreatMarker` |
| Cache | Redis or in-memory last snapshot for fast client connect |
| Fan-out | Your own WS/SSE to browsers (optional; can stay client→NEPTUN) |
| Kill switch | Env flag to hide speculative tracks; keep official zones |
| Observability | Upstream lag, marker count, error rate (Grafana / simple logs) |

**No** alert-engine, push workers, or moderator queue in v1.

### Automation (no humans)

- Trust upstream status + confidence fields
- Auto-drop: `resolved` / `remove` events; TTL for silent tracks
- Auto-mute: `advisory: true`
- Auto-degrade: `area_only: true` → non-point rendering
- Optional later: if NEPTUN + MAPA disagree beyond Δkm/Δt, prefer higher confidence or hide until agreement (still automatic)

---

## 8. Hosting (Solo)

| Piece | Practical choice |
|-------|------------------|
| Frontend | Cloudflare Pages / Vercel / Netlify |
| BFF (optional) | Fly.io / Railway / single VPS |
| Domain | Any; HTTPS mandatory for geolocation |
| Cost target | Near-zero until traffic spikes |

During mass attacks, traffic spikes with national interest — CDN for static assets is mandatory; if you proxy upstream, cache aggressively and respect NEPTUN’s ≥5 s REST rule.

---

## 9. Legal / Trust (Especially Without an Entity)

- Visible disclaimer on every view: informational aggregator; follow official alarms and local authorities.
- Respect **NEPTUN attribution** (required) and any MAPA terms.
- Do not claim radar accuracy or “official” status.
- Privacy: no accounts in v1; if you store geolocation later, say so; prefer ephemeral client-side only.
- Keep a written note of upstream ToS dates; be ready to switch sources.

---

## 10. MVP Build Plan

### Phase 0 — Direct client (days)

1. Vite app + MapLibre + Ukrainian UI chrome
2. NEPTUN SDK or raw WebSocket → live markers + dead-reckon
3. Alert polygons from NEPTUN `/alerts` + their GeoJSON keys
4. Disclaimer + attribution
5. Deploy static site

### Phase 1 — Hardening

1. Thin BFF snapshot cache + your own WS
2. Apply for Ukraine Alarm and/or alerts.in.ua tokens
3. Stale/advisory/areaOnly UX polish
4. Basic analytics (privacy-friendly)

### Phase 2 — Optional differentiation

1. Dual-source fusion (NEPTUN + MAPA) with automatic conflict rules
2. Short local trail buffer / replay of last N hours
3. Web Push / Telegram (explicitly deferred — not v1)
4. Own Telegram ingest only if upstream quality or availability becomes a problem

---

## 11. Suggested Default Stack

| Layer | Choice |
|-------|--------|
| UI | Vite + React + Ukrainian copy |
| Map | MapLibre GL JS |
| Tracks | NEPTUN WebSocket / SDK |
| Zones | NEPTUN alerts (+ later Ukraine Alarm) |
| Hosting | Cloudflare Pages |
| BFF later | Node (Fastify) or Go on Fly.io |

---

## 12. Key Risks

| Risk | Mitigation |
|------|------------|
| Upstream outage / API change | Thin adapter; keep Phase 0 able to swap URL/schema |
| Duplicate or wrong markers | Single source first; confidence + age UI |
| Users treat map as official alarm | Permanent disclaimer; link to official app |
| You are a single point of failure | Static deploy + docs; automated healthcheck ping |
| Dual-use / bad actors watching the same public data | Same as any public map; do not add targeting aids |

---

## 13. Source Quick Links

**Live tracks**

- NEPTUN developers: https://neptun.in.ua/developers  
- MAPA.UA API: https://mapa.ua/docs/

**Sirens / regions**

- Ukraine Alarm API request: https://api.ukrainealarm.com/  
- alerts.in.ua API docs: https://devs.alerts.in.ua/  
- eRadar machine-readable status: https://eradar.app/api/status  

---

## Document status

Architecture draft aligned to: public site, Ukrainian-only, live per-object markers, automatic operation, no push channels, solo builder, with researched public sources as of the document update.
