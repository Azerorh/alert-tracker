import type { ThreatType } from './neptun'
import { endKindColor, type ThreatEndKind } from './threatDisplay'

const SIZE = 64

export const THREAT_ICON_TYPES: ThreatType[] = [
  'uav',
  'fpv',
  'missile',
  'ballistic',
  'kab',
  'mig31k',
  'recon',
  'unknown',
]

export function iconIdForType(type: string, ended?: ThreatEndKind | '' | null): string {
  const t = (THREAT_ICON_TYPES as string[]).includes(type) ? type : 'unknown'
  if (ended === 'shot_down') return `threat-${t}-shot`
  if (ended === 'vanished') return `threat-${t}-vanished`
  return `threat-${t}`
}

function strokeRound(ctx: CanvasRenderingContext2D, hex: string, width = 3) {
  ctx.strokeStyle = hex
  ctx.fillStyle = hex
  ctx.lineWidth = width
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
}

/** Draw silhouette into a centered 64×64 canvas; nose points up (0° = north). */
function drawSilhouette(ctx: CanvasRenderingContext2D, type: ThreatType, hex: string) {
  const cx = SIZE / 2
  const cy = SIZE / 2
  strokeRound(ctx, hex, 3.2)

  switch (type) {
    case 'uav': {
      // Shahed-like delta / flying-wing (nose up)
      ctx.beginPath()
      ctx.moveTo(cx, cy - 22) // nose
      ctx.lineTo(cx + 6, cy - 8)
      ctx.lineTo(cx + 22, cy + 10) // right wing tip
      ctx.lineTo(cx + 8, cy + 6)
      ctx.lineTo(cx + 5, cy + 18) // right rear
      ctx.lineTo(cx, cy + 12) // center rear notch
      ctx.lineTo(cx - 5, cy + 18)
      ctx.lineTo(cx - 8, cy + 6)
      ctx.lineTo(cx - 22, cy + 10) // left wing tip
      ctx.lineTo(cx - 6, cy - 8)
      ctx.closePath()
      ctx.fill()
      // small intake / hub
      ctx.globalCompositeOperation = 'destination-out'
      ctx.beginPath()
      ctx.arc(cx, cy - 2, 2.4, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalCompositeOperation = 'source-over'
      break
    }
    case 'fpv': {
      // Compact X-frame FPV (distinct from Shahed)
      ctx.beginPath()
      ctx.moveTo(cx - 18, cy - 10)
      ctx.lineTo(cx - 6, cy)
      ctx.lineTo(cx - 18, cy + 10)
      ctx.moveTo(cx + 18, cy - 10)
      ctx.lineTo(cx + 6, cy)
      ctx.lineTo(cx + 18, cy + 10)
      ctx.moveTo(cx, cy - 16)
      ctx.lineTo(cx, cy + 16)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(cx, cy, 4.5, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(cx - 5, cy + 8)
      ctx.lineTo(cx, cy + 18)
      ctx.lineTo(cx + 5, cy + 8)
      ctx.stroke()
      break
    }
    case 'missile': {
      // Cruise missile / torpedo pointing up
      ctx.beginPath()
      ctx.moveTo(cx, cy - 22)
      ctx.lineTo(cx + 7, cy - 8)
      ctx.lineTo(cx + 7, cy + 14)
      ctx.lineTo(cx + 12, cy + 20)
      ctx.lineTo(cx - 12, cy + 20)
      ctx.lineTo(cx - 7, cy + 14)
      ctx.lineTo(cx - 7, cy - 8)
      ctx.closePath()
      ctx.fill()
      break
    }
    case 'ballistic': {
      // Sharper rocket + ring
      ctx.beginPath()
      ctx.moveTo(cx, cy - 24)
      ctx.lineTo(cx + 8, cy - 6)
      ctx.lineTo(cx + 6, cy + 10)
      ctx.lineTo(cx + 10, cy + 18)
      ctx.lineTo(cx - 10, cy + 18)
      ctx.lineTo(cx - 6, cy + 10)
      ctx.lineTo(cx - 8, cy - 6)
      ctx.closePath()
      ctx.fill()
      ctx.beginPath()
      ctx.arc(cx, cy + 2, 11, 0, Math.PI * 2)
      ctx.strokeStyle = hex
      ctx.lineWidth = 2.4
      ctx.stroke()
      break
    }
    case 'kab': {
      // Bomb drop shape
      ctx.beginPath()
      ctx.moveTo(cx, cy - 20)
      ctx.quadraticCurveTo(cx + 14, cy - 4, cx + 10, cy + 10)
      ctx.lineTo(cx + 12, cy + 18)
      ctx.lineTo(cx - 12, cy + 18)
      ctx.lineTo(cx - 10, cy + 10)
      ctx.quadraticCurveTo(cx - 14, cy - 4, cx, cy - 20)
      ctx.closePath()
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(cx - 8, cy + 18)
      ctx.lineTo(cx, cy + 24)
      ctx.lineTo(cx + 8, cy + 18)
      ctx.stroke()
      break
    }
    case 'mig31k': {
      // Simple jet top-down
      ctx.beginPath()
      ctx.moveTo(cx, cy - 22)
      ctx.lineTo(cx + 5, cy - 4)
      ctx.lineTo(cx + 20, cy + 4)
      ctx.lineTo(cx + 20, cy + 10)
      ctx.lineTo(cx + 5, cy + 6)
      ctx.lineTo(cx + 4, cy + 18)
      ctx.lineTo(cx + 10, cy + 22)
      ctx.lineTo(cx, cy + 18)
      ctx.lineTo(cx - 10, cy + 22)
      ctx.lineTo(cx - 4, cy + 18)
      ctx.lineTo(cx - 5, cy + 6)
      ctx.lineTo(cx - 20, cy + 10)
      ctx.lineTo(cx - 20, cy + 4)
      ctx.lineTo(cx - 5, cy - 4)
      ctx.closePath()
      ctx.fill()
      break
    }
    case 'recon': {
      // Eye / optic
      ctx.beginPath()
      ctx.ellipse(cx, cy, 20, 12, 0, 0, Math.PI * 2)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(cx, cy, 6, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalCompositeOperation = 'destination-out'
      ctx.beginPath()
      ctx.arc(cx + 2, cy - 2, 2.2, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalCompositeOperation = 'source-over'
      break
    }
    default: {
      // Diamond
      ctx.beginPath()
      ctx.moveTo(cx, cy - 18)
      ctx.lineTo(cx + 14, cy)
      ctx.lineTo(cx, cy + 18)
      ctx.lineTo(cx - 14, cy)
      ctx.closePath()
      ctx.fill()
    }
  }
}

function withBadge(
  ctx: CanvasRenderingContext2D,
  kind: 'shot_down' | 'vanished',
) {
  const color = endKindColor(kind)
  if (kind === 'shot_down') {
    ctx.strokeStyle = color
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(14, 14)
    ctx.lineTo(50, 50)
    ctx.moveTo(50, 14)
    ctx.lineTo(14, 50)
    ctx.stroke()
  } else {
    ctx.fillStyle = color
    ctx.globalAlpha = 0.85
    ctx.beginPath()
    ctx.arc(SIZE / 2, SIZE / 2, 6, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1
  }
}

export function renderThreatIcon(
  type: ThreatType | string,
  _hex?: string,
  ended?: ThreatEndKind | null,
): ImageData {
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) return new ImageData(SIZE, SIZE)

  // Soft dark disc behind white silhouette for contrast on any basemap
  ctx.beginPath()
  ctx.arc(SIZE / 2, SIZE / 2, 30, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(11, 18, 32, 0.78)'
  ctx.fill()
  ctx.strokeStyle = ended ? endKindColor(ended) : 'rgba(255, 255, 255, 0.35)'
  ctx.lineWidth = 2
  ctx.stroke()

  const t = (THREAT_ICON_TYPES as string[]).includes(type)
    ? (type as ThreatType)
    : 'unknown'
  // Live markers are white for readability; ended keep muted gray.
  const fill = ended ? endKindColor(ended) : '#ffffff'
  void _hex
  if (ended) ctx.globalAlpha = ended === 'vanished' ? 0.55 : 0.8
  drawSilhouette(ctx, t, fill)
  ctx.globalAlpha = 1
  if (ended) withBadge(ctx, ended)

  return ctx.getImageData(0, 0, SIZE, SIZE)
}

/** Register all live + ended variants on a MapLibre map. */
export function registerThreatIcons(map: {
  hasImage: (id: string) => boolean
  addImage: (id: string, image: ImageData | { width: number; height: number; data: Uint8Array | Uint8ClampedArray }, opts?: { pixelRatio?: number }) => void
}): void {
  for (const type of THREAT_ICON_TYPES) {
    const variants: Array<{ id: string; ended?: ThreatEndKind }> = [
      { id: iconIdForType(type) },
      { id: iconIdForType(type, 'shot_down'), ended: 'shot_down' },
      { id: iconIdForType(type, 'vanished'), ended: 'vanished' },
    ]
    for (const v of variants) {
      if (map.hasImage(v.id)) continue
      const img = renderThreatIcon(type, undefined, v.ended)
      map.addImage(v.id, img, { pixelRatio: 2 })
    }
  }
}

/** Data-URL for legend / DOM preview (same white silhouettes as the map). */
export function threatIconDataUrl(type: ThreatType | string, _hex?: string): string {
  const t = (THREAT_ICON_TYPES as string[]).includes(type)
    ? (type as ThreatType)
    : 'unknown'
  void _hex
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  ctx.clearRect(0, 0, SIZE, SIZE)
  ctx.beginPath()
  ctx.arc(SIZE / 2, SIZE / 2, 30, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(11, 18, 32, 0.78)'
  ctx.fill()
  drawSilhouette(ctx, t, '#ffffff')
  return canvas.toDataURL('image/png')
}
