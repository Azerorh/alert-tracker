/** Snapshot of GeoConfirmed RF ground placemarks (≤7d) for GitHub Pages / BFF. */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fetchGeoConfirmedGround } from './lib/geoConfirmedGround.mjs'

const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'public',
  'geo',
  'geoconfirmed-ground.json',
)

async function main() {
  const data = await fetchGeoConfirmedGround()
  const payload = {
    fetchedAt: new Date().toISOString(),
    source: 'geoconfirmed',
    windowHours: data.windowHours,
    featureCount: data.featureCount,
    skippedStrikes: data.skippedStrikes ?? 0,
    errors: data.detailErrors,
    markers: data.markers,
  }
  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(OUT, JSON.stringify(payload))
  const sight = data.markers.filter((m) => m.kind === 'sighting').length
  const loss = data.markers.filter((m) => m.kind === 'loss').length
  console.log(
    `[geoconfirmed] snapshot ${OUT}: ${data.markers.length} markers` +
      ` (sighting=${sight}, loss=${loss}) from ${data.featureCount} RF features` +
      (data.skippedStrikes
        ? ` · skipped strikes/on-UA=${data.skippedStrikes}`
        : '') +
      (data.detailErrors.length
        ? ` (detail errors: ${data.detailErrors.length})`
        : ''),
  )
}

main().catch((err) => {
  console.error('[geoconfirmed] refresh failed', err)
  process.exit(1)
})