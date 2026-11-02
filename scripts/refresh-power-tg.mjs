/** Snapshot of emergency power-outage mentions from official TG channels. */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fetchPowerTgOutages } from './lib/powerTgOutages.mjs'

const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'public',
  'geo',
  'power-tg-outages.json',
)

async function main() {
  const data = await fetchPowerTgOutages()
  const payload = {
    fetchedAt: new Date().toISOString(),
    source: 'power-tg-outages',
    windowHours: data.windowHours,
    sources: data.sources,
    messageCount: data.messageCount,
    errors: data.errors,
    markers: data.markers,
  }
  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(OUT, JSON.stringify(payload))
  const byCh = Object.entries(data.byChannel ?? {})
    .map(([id, n]) => `${id}=${n}`)
    .join(', ')
  console.log(
    `[power-tg] snapshot ${OUT}: ${data.markers.length} markers from ${data.messageCount} msgs` +
      (byCh ? ` · by channel: ${byCh}` : '') +
      (data.errors.length ? ` (errors: ${data.errors.join('; ')})` : ''),
  )
}

main().catch((err) => {
  console.error('[power-tg] refresh failed', err)
  process.exit(1)
})
