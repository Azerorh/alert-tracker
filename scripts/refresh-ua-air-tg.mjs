/** Snapshot UA air-monitor TG place zones for GitHub Pages. */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fetchUaAirTgZones } from './lib/uaAirTg.mjs'

const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'public',
  'geo',
  'ua-air-tg.json',
)

async function main() {
  const payload = await fetchUaAirTgZones()
  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(OUT, JSON.stringify(payload))
  console.log(
    `[ua-air-tg] snapshot ${OUT}: zones=${payload.zones.length} msgs=${payload.messageCount}` +
      (payload.errors.length ? ` (partial: ${payload.errors.join('; ')})` : ''),
  )
}

main().catch((err) => {
  console.error('[ua-air-tg] refresh failed', err)
  process.exit(1)
})
