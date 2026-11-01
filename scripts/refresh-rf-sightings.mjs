/** Snapshot of RF ground sightings (TG allowlist, ≤24h) for GitHub Pages. */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fetchRfGroundSightings } from './lib/rfGroundSightings.mjs'

const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'public',
  'geo',
  'rf-sightings.json',
)

async function main() {
  const data = await fetchRfGroundSightings()
  const payload = {
    fetchedAt: new Date().toISOString(),
    source: 'rf-tg-sightings',
    windowHours: data.windowHours,
    sources: data.sources,
    messageCount: data.messageCount,
    errors: data.errors,
    sightings: data.sightings,
  }
  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(OUT, JSON.stringify(payload))
  const coords = data.sightings.filter((s) => s.precision === 'coords').length
  const places = data.sightings.filter((s) => s.precision === 'place').length
  const byCh = Object.entries(data.byChannel ?? {})
    .map(([id, n]) => `${id}=${n}`)
    .join(', ')
  console.log(
    `[rf-sightings] snapshot ${OUT}: ${data.sightings.length} points` +
      ` (coords=${coords}, place=${places}) from ${data.messageCount} msgs` +
      (byCh ? ` · by channel: ${byCh}` : '') +
      (data.errors.length ? ` (errors: ${data.errors.join('; ')})` : ''),
  )
}

main().catch((err) => {
  console.error('[rf-sightings] refresh failed', err)
  process.exit(1)
})
