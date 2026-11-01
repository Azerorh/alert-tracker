/** Re-enrich OG photos + mirror locally for evidence entries that already have sources. */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { enrichEvidence, mirrorEvidencePhoto } from './lib/warspottingEvidence.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'geo')
const EVIDENCE_OUT = join(ROOT, 'warspotting-evidence.json')
const PHOTOS_DIR = join(ROOT, 'ws-photos')

async function main() {
  const doc = JSON.parse(await readFile(EVIDENCE_OUT, 'utf8'))
  const evidence = doc.evidence ?? {}
  await mkdir(PHOTOS_DIR, { recursive: true })
  let mirrored = 0
  let enriched = 0

  for (const [id, raw] of Object.entries(evidence)) {
    if (!raw?.sources?.length) continue
    let cur = raw
    try {
      cur = await enrichEvidence(raw)
      enriched++
    } catch (err) {
      console.warn(`[remirror] enrich ${id}:`, err.message ?? err)
    }
    const candidates = [...(cur.confirmPhotos ?? []), ...(cur.photos ?? [])]
    const remote = candidates.find((u) => u && !String(u).includes('/geo/ws-photos/'))
    if (remote) {
      try {
        const local = await mirrorEvidencePhoto(id, remote, PHOTOS_DIR)
        if (local) {
          cur.confirmPhotos = [local, ...(cur.confirmPhotos ?? []).filter((u) => u !== local)]
          mirrored++
        }
      } catch (err) {
        console.warn(`[remirror] mirror ${id}:`, err.message ?? err)
      }
    }
    evidence[id] = cur
    await new Promise((r) => setTimeout(r, 200))
  }

  await writeFile(
    EVIDENCE_OUT,
    JSON.stringify({ fetchedAt: new Date().toISOString(), evidence }),
  )
  console.log(`[remirror] enriched ${enriched}, mirrored ${mirrored}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
