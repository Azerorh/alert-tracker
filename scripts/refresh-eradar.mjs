/** Snapshot eRadar TG danger zones for GitHub Pages (no CORS in browser). */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fetchEradarPayload } from './lib/eradar.mjs'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'geo', 'eradar.json')

async function main() {
  const payload = await fetchEradarPayload()
  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(OUT, JSON.stringify(payload))
  console.log(
    `[eradar] snapshot ${OUT}: zones=${payload.zones.length} alertsAreas=${payload.alertAreaCount} reports=${payload.reportCount}`,
  )
}

main().catch((err) => {
  console.error('[eradar] refresh failed', err)
  process.exit(1)
})
