import type { GroundCategory } from './warspotting'
import { ABROAD_ICON_COLOR } from './threatIcons'

const SIZE = 64

export const GROUND_ICON_CATEGORIES: GroundCategory[] = [
  'tanks',
  'ifv',
  'apc',
  'trucks',
  'artillery',
  'airdef',
  'other',
]

export function groundIconId(category: GroundCategory | string, kind: 'loss' | 'sighting' = 'loss'): string {
  const c = (GROUND_ICON_CATEGORIES as string[]).includes(category)
    ? category
    : 'other'
  return kind === 'sighting' ? `ground-sight-${c}` : `ground-${c}`
}

function strokeRound(ctx: CanvasRenderingContext2D, hex: string, width = 3) {
  ctx.strokeStyle = hex
  ctx.fillStyle = hex
  ctx.lineWidth = width
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
}

/** Top-down / side silhouettes, same disc language as air threat icons. */
function drawGroundSilhouette(
  ctx: CanvasRenderingContext2D,
  category: GroundCategory,
  hex: string,
) {
  const cx = SIZE / 2
  const cy = SIZE / 2
  strokeRound(ctx, hex, 3)

  switch (category) {
    case 'tanks': {
      // Hull
      ctx.beginPath()
      ctx.moveTo(cx - 20, cy + 4)
      ctx.lineTo(cx - 16, cy - 6)
      ctx.lineTo(cx + 16, cy - 6)
      ctx.lineTo(cx + 20, cy + 4)
      ctx.lineTo(cx + 16, cy + 12)
      ctx.lineTo(cx - 16, cy + 12)
      ctx.closePath()
      ctx.fill()
      // Turret
      ctx.beginPath()
      ctx.ellipse(cx - 2, cy - 2, 9, 7, 0, 0, Math.PI * 2)
      ctx.fill()
      // Barrel
      ctx.beginPath()
      ctx.moveTo(cx + 6, cy - 4)
      ctx.lineTo(cx + 24, cy - 8)
      ctx.lineTo(cx + 24, cy - 4)
      ctx.lineTo(cx + 8, cy - 1)
      ctx.closePath()
      ctx.fill()
      // Tracks hint
      ctx.beginPath()
      ctx.moveTo(cx - 18, cy + 12)
      ctx.lineTo(cx - 18, cy + 16)
      ctx.lineTo(cx + 18, cy + 16)
      ctx.lineTo(cx + 18, cy + 12)
      ctx.stroke()
      break
    }
    case 'ifv': {
      // Longer IFV hull
      ctx.beginPath()
      ctx.moveTo(cx - 22, cy + 2)
      ctx.lineTo(cx - 18, cy - 8)
      ctx.lineTo(cx + 14, cy - 8)
      ctx.lineTo(cx + 22, cy + 2)
      ctx.lineTo(cx + 18, cy + 12)
      ctx.lineTo(cx - 18, cy + 12)
      ctx.closePath()
      ctx.fill()
      // Small turret
      ctx.beginPath()
      ctx.arc(cx + 4, cy - 4, 6, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(cx + 9, cy - 5)
      ctx.lineTo(cx + 22, cy - 7)
      ctx.lineTo(cx + 22, cy - 3)
      ctx.lineTo(cx + 10, cy - 2)
      ctx.closePath()
      ctx.fill()
      break
    }
    case 'apc': {
      // Boxy wheeled APC
      ctx.beginPath()
      ctx.moveTo(cx - 18, cy - 6)
      ctx.lineTo(cx + 16, cy - 6)
      ctx.lineTo(cx + 20, cy + 2)
      ctx.lineTo(cx + 16, cy + 10)
      ctx.lineTo(cx - 16, cy + 10)
      ctx.lineTo(cx - 20, cy + 2)
      ctx.closePath()
      ctx.fill()
      // Wheels
      for (const x of [cx - 12, cx, cx + 12]) {
        ctx.beginPath()
        ctx.arc(x, cy + 12, 3.2, 0, Math.PI * 2)
        ctx.fill()
      }
      // Window slit
      ctx.globalCompositeOperation = 'destination-out'
      ctx.fillRect(cx - 10, cy - 2, 14, 3)
      ctx.globalCompositeOperation = 'source-over'
      break
    }
    case 'trucks': {
      // Cab
      ctx.beginPath()
      ctx.moveTo(cx - 18, cy - 4)
      ctx.lineTo(cx - 6, cy - 4)
      ctx.lineTo(cx - 6, cy + 10)
      ctx.lineTo(cx - 18, cy + 10)
      ctx.closePath()
      ctx.fill()
      // Bed
      ctx.beginPath()
      ctx.moveTo(cx - 6, cy - 2)
      ctx.lineTo(cx + 20, cy - 2)
      ctx.lineTo(cx + 20, cy + 10)
      ctx.lineTo(cx - 6, cy + 10)
      ctx.closePath()
      ctx.fill()
      // Wheels
      for (const x of [cx - 12, cx + 4, cx + 14]) {
        ctx.beginPath()
        ctx.arc(x, cy + 12, 3, 0, Math.PI * 2)
        ctx.fill()
      }
      break
    }
    case 'artillery': {
      // Carriage
      ctx.beginPath()
      ctx.moveTo(cx - 14, cy + 6)
      ctx.lineTo(cx + 10, cy + 6)
      ctx.lineTo(cx + 14, cy + 12)
      ctx.lineTo(cx - 18, cy + 12)
      ctx.closePath()
      ctx.fill()
      // Barrel up-right
      ctx.beginPath()
      ctx.moveTo(cx - 4, cy + 4)
      ctx.lineTo(cx + 18, cy - 18)
      ctx.lineTo(cx + 22, cy - 14)
      ctx.lineTo(cx + 2, cy + 6)
      ctx.closePath()
      ctx.fill()
      // Wheel
      ctx.beginPath()
      ctx.arc(cx - 2, cy + 10, 5, 0, Math.PI * 2)
      ctx.stroke()
      break
    }
    case 'airdef': {
      // Radar dish + launcher pad
      ctx.beginPath()
      ctx.moveTo(cx - 16, cy + 8)
      ctx.lineTo(cx + 16, cy + 8)
      ctx.lineTo(cx + 12, cy + 14)
      ctx.lineTo(cx - 12, cy + 14)
      ctx.closePath()
      ctx.fill()
      // Mast
      ctx.beginPath()
      ctx.moveTo(cx - 2, cy + 8)
      ctx.lineTo(cx - 2, cy - 4)
      ctx.lineTo(cx + 2, cy - 4)
      ctx.lineTo(cx + 2, cy + 8)
      ctx.fill()
      // Dish
      ctx.beginPath()
      ctx.ellipse(cx, cy - 10, 14, 10, 0, 0.2, Math.PI - 0.2)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(cx, cy - 8, 3, 0, Math.PI * 2)
      ctx.fill()
      // Missile upright
      ctx.beginPath()
      ctx.moveTo(cx + 12, cy + 6)
      ctx.lineTo(cx + 12, cy - 16)
      ctx.lineTo(cx + 16, cy - 12)
      ctx.lineTo(cx + 16, cy + 6)
      ctx.closePath()
      ctx.fill()
      break
    }
    default: {
      // Generic vehicle diamond
      ctx.beginPath()
      ctx.moveTo(cx, cy - 16)
      ctx.lineTo(cx + 14, cy)
      ctx.lineTo(cx, cy + 16)
      ctx.lineTo(cx - 14, cy)
      ctx.closePath()
      ctx.fill()
    }
  }
}

/** Small flame badge — marks documented loss (vs live air tracks). */
function drawLossFlame(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.save()
  ctx.beginPath()
  ctx.arc(x, y, 9.5, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(20, 8, 4, 0.92)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(255, 140, 40, 0.7)'
  ctx.lineWidth = 1.2
  ctx.stroke()

  ctx.beginPath()
  ctx.moveTo(x, y + 5)
  ctx.bezierCurveTo(x + 5.5, y + 2, x + 5, y - 2, x + 1.5, y - 6.5)
  ctx.bezierCurveTo(x + 3.5, y - 2, x + 0.5, y - 1, x, y - 7)
  ctx.bezierCurveTo(x - 0.5, y - 1, x - 3.5, y - 2, x - 1.5, y - 6.5)
  ctx.bezierCurveTo(x - 5, y - 2, x - 5.5, y + 2, x, y + 5)
  ctx.closePath()
  ctx.fillStyle = '#ff6a00'
  ctx.fill()

  ctx.beginPath()
  ctx.moveTo(x, y + 3.2)
  ctx.bezierCurveTo(x + 2.4, y + 1, x + 2, y - 1.2, x, y - 3.8)
  ctx.bezierCurveTo(x - 2, y - 1.2, x - 2.4, y + 1, x, y + 3.2)
  ctx.closePath()
  ctx.fillStyle = '#ffd166'
  ctx.fill()
  ctx.restore()
}

const SIGHTING_COLOR = '#f0b429'

export function renderGroundIcon(
  category: GroundCategory | string,
  kind: 'loss' | 'sighting' = 'loss',
): ImageData {
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) return new ImageData(SIZE, SIZE)

  const cat = (GROUND_ICON_CATEGORIES as string[]).includes(category)
    ? (category as GroundCategory)
    : 'other'

  const fill = kind === 'sighting' ? SIGHTING_COLOR : ABROAD_ICON_COLOR
  ctx.beginPath()
  ctx.arc(SIZE / 2, SIZE / 2, 30, 0, Math.PI * 2)
  ctx.fillStyle = kind === 'sighting' ? 'rgba(40, 28, 8, 0.85)' : 'rgba(40, 8, 8, 0.82)'
  ctx.fill()
  ctx.strokeStyle =
    kind === 'sighting' ? 'rgba(240, 180, 41, 0.6)' : 'rgba(255, 59, 59, 0.55)'
  ctx.lineWidth = 2
  ctx.stroke()

  drawGroundSilhouette(ctx, cat, fill)
  if (kind === 'loss') drawLossFlame(ctx, SIZE - 14, SIZE - 14)
  else {
    // Small clock-dot: sighting ≠ confirmed kill
    ctx.beginPath()
    ctx.arc(SIZE - 14, SIZE - 14, 7, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(20, 14, 4, 0.9)'
    ctx.fill()
    ctx.strokeStyle = SIGHTING_COLOR
    ctx.lineWidth = 1.5
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(SIZE - 14, SIZE - 17)
    ctx.lineTo(SIZE - 14, SIZE - 14)
    ctx.lineTo(SIZE - 11, SIZE - 12)
    ctx.stroke()
  }
  return ctx.getImageData(0, 0, SIZE, SIZE)
}

export function registerGroundIcons(map: {
  hasImage: (id: string) => boolean
  addImage: (
    id: string,
    image: ImageData | { width: number; height: number; data: Uint8Array | Uint8ClampedArray },
    opts?: { pixelRatio?: number },
  ) => void
}): void {
  for (const cat of GROUND_ICON_CATEGORIES) {
    for (const kind of ['loss', 'sighting'] as const) {
      const id = groundIconId(cat, kind)
      if (map.hasImage(id)) continue
      map.addImage(id, renderGroundIcon(cat, kind), { pixelRatio: 2 })
    }
  }
}

export function groundIconDataUrl(
  category: GroundCategory | string,
  kind: 'loss' | 'sighting' = 'loss',
): string {
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  const img = renderGroundIcon(category, kind)
  ctx.putImageData(img, 0, 0)
  return canvas.toDataURL('image/png')
}
