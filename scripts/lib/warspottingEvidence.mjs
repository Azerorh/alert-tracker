/** Scrape WarSpotting view pages + resolve confirmation photos from source OG images. */

export const WARSPOTTING_ORIGIN = 'https://ukr.warspotting.net'

const UA = 'alert-tracker/1.0 (evidence; +https://github.com/Azerorh/alert-tracker)'

export function viewUrlForId(id) {
  return `${WARSPOTTING_ORIGIN}/view/${id}/`
}

export function parseViewEvidence(html, id) {
  const photos = []
  const seen = new Set()
  const thumbRe =
    /(?:src|data-media)=["'](\/media\/(?:thumbnails|original)\/[^"']+)["']/gi
  let m
  while ((m = thumbRe.exec(html))) {
    const path = m[1]
    const abs = path.startsWith('http') ? path : `${WARSPOTTING_ORIGIN}${path}`
    // Prefer thumbnails for sheet preview
    if (!abs.includes('/thumbnails/')) continue
    if (seen.has(abs)) continue
    seen.add(abs)
    photos.push(abs)
  }

  const sources = []
  const sourceRe = /<a[^>]+href=["']([^"']+)["'][^>]*>\s*Source\s*<\/a>/gi
  while ((m = sourceRe.exec(html))) {
    const href = m[1]
    if (!href || href.startsWith('#')) continue
    const abs = href.startsWith('http') ? href : `${WARSPOTTING_ORIGIN}${href}`
    if (!sources.includes(abs)) sources.push(abs)
  }

  return {
    id: Number(id),
    viewUrl: viewUrlForId(id),
    photos,
    sources,
  }
}

export async function fetchViewHtml(id) {
  const url = viewUrlForId(id)
  const res = await fetch(url, {
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'User-Agent': UA,
    },
    redirect: 'follow',
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`view HTTP ${res.status}`)
  if (text.includes('Just a moment') || text.includes('cf-challenge')) {
    throw new Error('cloudflare challenge')
  }
  if (!text.includes('data-media') && !text.includes('thumbnail')) {
    throw new Error('unexpected view html')
  }
  return text
}

export async function resolveSourcePhoto(sourceUrl) {
  try {
    const res = await fetch(sourceUrl, {
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent':
          'Mozilla/5.0 (compatible; alert-tracker/1.0; +https://github.com/Azerorh/alert-tracker)',
      },
    })
    if (!res.ok) return null
    const html = await res.text()
    const og =
      html.match(/property="og:image"\s+content="([^"]+)"/i)?.[1] ||
      html.match(/content="([^"]+)"\s+property="og:image"/i)?.[1] ||
      html.match(/property='og:image'\s+content='([^']+)'/i)?.[1]
    if (!og) return null
    if (og.startsWith('//')) return `https:${og}`
    return og
  } catch {
    return null
  }
}

export async function enrichEvidence(base) {
  const confirmPhotos = []
  for (const src of base.sources ?? []) {
    const photo = await resolveSourcePhoto(src)
    if (photo && !confirmPhotos.includes(photo)) confirmPhotos.push(photo)
  }
  // Keep prior confirms if OG resolve failed this pass.
  for (const prev of base.confirmPhotos ?? []) {
    if (prev && !confirmPhotos.includes(prev)) confirmPhotos.push(prev)
  }
  return {
    ...base,
    // Prefer source confirmation photos (Telegram CDN etc.) — usually embeddable.
    // Keep WarSpotting thumbs as secondary (often CF-blocked as hotlinks).
    confirmPhotos,
  }
}

/** Host a confirmation photo under public/geo/ws-photos/{id}.jpg for Pages/hotlink-safe use. */
export async function mirrorEvidencePhoto(id, photoUrl, photosDir) {
  if (!photoUrl || !id) return null
  if (String(photoUrl).includes('/geo/ws-photos/')) return String(photoUrl).replace(/^\//, '/')
  const { mkdir, writeFile } = await import('node:fs/promises')
  const { join } = await import('node:path')
  await mkdir(photosDir, { recursive: true })
  const res = await fetch(photoUrl, {
    headers: {
      Accept: 'image/*,*/*',
      'User-Agent':
        'Mozilla/5.0 (compatible; alert-tracker/1.0; +https://github.com/Azerorh/alert-tracker)',
    },
    redirect: 'follow',
  })
  if (!res.ok) throw new Error(`mirror HTTP ${res.status}`)
  const ctype = res.headers.get('content-type') || ''
  if (!ctype.includes('image') && !ctype.includes('octet-stream')) {
    throw new Error(`mirror not image: ${ctype}`)
  }
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length < 400) throw new Error('mirror too small')
  const file = `${id}.jpg`
  await writeFile(join(photosDir, file), buf)
  return `/geo/ws-photos/${file}`
}

export async function fetchEvidenceForId(id) {
  const html = await fetchViewHtml(id)
  const parsed = parseViewEvidence(html, id)
  return enrichEvidence(parsed)
}
