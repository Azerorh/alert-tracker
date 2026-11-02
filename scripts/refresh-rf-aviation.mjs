/** Snapshot RF aircraft takeoffs (TG) for GitHub Pages. */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fetchRfAviationEvents } from './lib/rfAviation.mjs'

const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'public',
  'geo',
  'rf-aviation.json',
)

async function main() {
  const payload = await fetchRfAviationEvents()
  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(OUT, JSON.stringify(payload))
  console.log(
    `[rf-aviation] snapshot ${OUT}: events=${payload.events.length} msgs=${payload.messageCount}` +
      (payload.errors.length ? ` (partial: ${payload.errors.join('; ')})` : ''),
  )
}

main().catch((err) => {
  console.error('[rf-aviation] refresh failed', err)
  process.exit(1)
})
