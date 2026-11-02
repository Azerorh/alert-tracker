/** Resolve preview images from public source URLs (CORS-friendly where possible). */

const FX_TWITTER = 'https://api.fxtwitter.com'

function twitterStatusId(url: string): string | null {
  const m = String(url).match(
    /(?:twitter\.com|x\.com|vxtwitter\.com|fxtwitter\.com)\/[^/]+\/status\/(\d+)/i,
  )
  return m?.[1] ?? null
}

async function photosFromFxTwitter(statusId: string): Promise<string[]> {
  try {
    const res = await fetch(`${FX_TWITTER}/status/${statusId}`, {
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) return []
    const json = (await res.json()) as {
      tweet?: {
        media?: {
          all?: Array<{ type?: string; url?: string; thumbnail_url?: string }>
          photos?: Array<{ url?: string }>
        }
      }
    }
    const out: string[] = []
    const media = json.tweet?.media
    for (const p of media?.photos ?? []) {
      if (p.url) out.push(p.url)
    }
    for (const item of media?.all ?? []) {
      if (item.type === 'photo' && item.url) out.push(item.url)
      else if (item.thumbnail_url) out.push(item.thumbnail_url)
    }
    return [...new Set(out)]
  } catch {
    return []
  }
}

/**
 * Best-effort image URLs for sheet previews.
 * X/Twitter via FixTweet (CORS *); Telegram/Instagram usually need a new tab.
 */
export async function resolvePhotosFromSources(
  sources: string[],
  max = 4,
): Promise<string[]> {
  const out: string[] = []
  for (const src of sources) {
    if (out.length >= max) break
    const tw = twitterStatusId(src)
    if (!tw) continue
    const photos = await photosFromFxTwitter(tw)
    for (const p of photos) {
      if (!out.includes(p)) out.push(p)
      if (out.length >= max) break
    }
  }
  return out
}
