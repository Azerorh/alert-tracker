/** Build-time snapshot of active RU alert oblasts from NAHR-cited Telegram channels. */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fetchNahrStyleRuAlerts } from './lib/nahrTgRuAlerts.mjs'

const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'public',
  'geo',
  'ru-alerts.json',
)

async function main() {
  const { alerts, trajectories, messageCount, errors, sources } =
    await fetchNahrStyleRuAlerts()
  const payload = {
    fetchedAt: new Date().toISOString(),
    source: 'telegram',
    channels: sources.map((s) => s.id),
    messageCount,
    errors,
    alerts,
    trajectories,
  }
  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(OUT, JSON.stringify(payload))
  console.log(
    `[ru-alerts] snapshot ${OUT}: ${alerts.length} regions, ${trajectories.length} traj from ${messageCount} msgs` +
      (errors.length ? ` (partial: ${errors.join('; ')})` : ''),
  )
}

main().catch((err) => {
  console.error('[ru-alerts] refresh failed', err)
  process.exit(1)
})
