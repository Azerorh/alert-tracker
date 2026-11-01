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

/** Red markers for Drone Strike Map (reported RU strikes). */
export const ABROAD_ICON_COLOR = '#ff3b3b'
export const FIRE_ICON_ID = 'npz-fire'

export function iconIdForType(
  type: string,
  ended?: ThreatEndKind | '' | null,
  abroad = false,
  group = false,
): string {
  const t = (THREAT_ICON_TYPES as string[]).includes(type) ? type : 'unknown'
  const g = group && t === 'uav' ? '-group' : ''
  if (ended === 'shot_down') return `threat-${t}${g}-shot`
  if (ended === 'vanished') return `threat-${t}${g}-vanished`
  if (abroad) return `threat-${t}${g}-abroad`
  return `threat-${t}${g}`
}

function strokeRound(ctx: CanvasRenderingContext2D, hex: string, width = 3) {
  ctx.strokeStyle = hex
  ctx.fillStyle = hex
  ctx.lineWidth = width
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
}

/** Shahed-like delta / flying-wing (nose up). scale 1 = single, ~0.72 for stacked group. */
function drawUavDelta(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  hex: string,
  scale = 1,
) {
  strokeRound(ctx, hex, 3.2 * Math.min(1, scale + 0.15))
  const s = scale
  ctx.beginPath()
  ctx.moveTo(cx, cy - 22 * s)
  ctx.lineTo(cx + 6 * s, cy - 8 * s)
  ctx.lineTo(cx + 22 * s, cy + 10 * s)
  ctx.lineTo(cx + 8 * s, cy + 6 * s)
  ctx.lineTo(cx + 5 * s, cy + 18 * s)
  ctx.lineTo(cx, cy + 12 * s)
  ctx.lineTo(cx - 5 * s, cy + 18 * s)
  ctx.lineTo(cx - 8 * s, cy + 6 * s)
  ctx.lineTo(cx - 22 * s, cy + 10 * s)
  ctx.lineTo(cx - 6 * s, cy - 8 * s)
  ctx.closePath()
  ctx.fill()
  ctx.globalCompositeOperation = 'destination-out'
  ctx.beginPath()
  ctx.arc(cx, cy - 2 * s, 2.4 * s, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalCompositeOperation = 'source-over'
}

/** Same UAV silhouette + small “+” badge for groups (count > 1). */
function drawUavGroup(ctx: CanvasRenderingContext2D, hex: string) {
  const cx = SIZE / 2
  const cy = SIZE / 2
  drawUavDelta(ctx, cx, cy, hex, 1)

  const bx = cx + 16
  const by = cy + 15
  ctx.beginPath()
  ctx.arc(bx, by, 8, 0, Math.PI * 2)
  ctx.fillStyle = hex
  ctx.fill()
  ctx.strokeStyle = 'rgba(11, 18, 32, 0.9)'
  ctx.lineWidth = 1.5
  ctx.stroke()

  ctx.strokeStyle = 'rgba(11, 18, 32, 0.92)'
  ctx.lineWidth = 2.4
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(bx - 3.5, by)
  ctx.lineTo(bx + 3.5, by)
  ctx.moveTo(bx, by - 3.5)
  ctx.lineTo(bx, by + 3.5)
  ctx.stroke()
}

/** Draw silhouette into a centered 64×64 canvas; nose points up (0° = north). */
function drawSilhouette(ctx: CanvasRenderingContext2D, type: ThreatType, hex: string) {
  const cx = SIZE / 2
  const cy = SIZE / 2
  strokeRound(ctx, hex, 3.2)

  switch (type) {
    case 'uav': {
      drawUavDelta(ctx, cx, cy, hex, 1)
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
  abroad = false,
  group = false,
): ImageData {
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) return new ImageData(SIZE, SIZE)

  const liveFill = abroad ? ABROAD_ICON_COLOR : '#ffffff'
  const ring = ended
    ? endKindColor(ended)
    : abroad
      ? 'rgba(255, 59, 59, 0.55)'
      : 'rgba(255, 255, 255, 0.35)'

  // Soft dark disc behind silhouette for contrast on any basemap
  ctx.beginPath()
  ctx.arc(SIZE / 2, SIZE / 2, 30, 0, Math.PI * 2)
  ctx.fillStyle = abroad ? 'rgba(40, 8, 8, 0.82)' : 'rgba(11, 18, 32, 0.78)'
  ctx.fill()
  ctx.strokeStyle = ring
  ctx.lineWidth = 2
  ctx.stroke()

  const t = (THREAT_ICON_TYPES as string[]).includes(type)
    ? (type as ThreatType)
    : 'unknown'
  const fill = ended ? endKindColor(ended) : liveFill
  const asGroup = group && t === 'uav'
  void _hex
  if (ended) ctx.globalAlpha = ended === 'vanished' ? 0.55 : 0.8
  if (asGroup) drawUavGroup(ctx, fill)
  else drawSilhouette(ctx, t, fill)
  ctx.globalAlpha = 1
  if (ended) withBadge(ctx, ended)

  return ctx.getImageData(0, 0, SIZE, SIZE)
}

function renderFlameIcon(): ImageData {
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) return new ImageData(SIZE, SIZE)
  const cx = SIZE / 2
  const cy = SIZE / 2

  ctx.beginPath()
  ctx.arc(cx, cy, 30, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(40, 12, 4, 0.85)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(255, 140, 40, 0.65)'
  ctx.lineWidth = 2
  ctx.stroke()

  // Outer flame
  ctx.beginPath()
  ctx.moveTo(cx, cy + 18)
  ctx.bezierCurveTo(cx + 18, cy + 8, cx + 16, cy - 6, cx + 4, cy - 20)
  ctx.bezierCurveTo(cx + 10, cy - 6, cx + 2, cy - 2, cx, cy - 22)
  ctx.bezierCurveTo(cx - 2, cy - 2, cx - 10, cy - 6, cx - 4, cy - 20)
  ctx.bezierCurveTo(cx - 16, cy - 6, cx - 18, cy + 8, cx, cy + 18)
  ctx.closePath()
  ctx.fillStyle = '#ff6a00'
  ctx.fill()

  // Inner core
  ctx.beginPath()
  ctx.moveTo(cx, cy + 12)
  ctx.bezierCurveTo(cx + 8, cy + 4, cx + 6, cy - 4, cx, cy - 12)
  ctx.bezierCurveTo(cx - 6, cy - 4, cx - 8, cy + 4, cx, cy + 12)
  ctx.closePath()
  ctx.fillStyle = '#ffd166'
  ctx.fill()

  return ctx.getImageData(0, 0, SIZE, SIZE)
}

/** Register all live + abroad + ended + flame variants on a MapLibre map. */
export function registerThreatIcons(map: {
  hasImage: (id: string) => boolean
  addImage: (id: string, image: ImageData | { width: number; height: number; data: Uint8Array | Uint8ClampedArray }, opts?: { pixelRatio?: number }) => void
}): void {
  for (const type of THREAT_ICON_TYPES) {
    const groupOpts = type === 'uav' ? [false, true] : [false]
    for (const group of groupOpts) {
      const variants: Array<{ id: string; ended?: ThreatEndKind; abroad?: boolean }> = [
        { id: iconIdForType(type, null, false, group) },
        { id: iconIdForType(type, null, true, group), abroad: true },
        { id: iconIdForType(type, 'shot_down', false, group), ended: 'shot_down' },
        { id: iconIdForType(type, 'vanished', false, group), ended: 'vanished' },
      ]
      for (const v of variants) {
        if (map.hasImage(v.id)) continue
        const img = renderThreatIcon(type, undefined, v.ended, Boolean(v.abroad), group)
        map.addImage(v.id, img, { pixelRatio: 2 })
      }
    }
  }
  if (!map.hasImage(FIRE_ICON_ID)) {
    map.addImage(FIRE_ICON_ID, renderFlameIcon(), { pixelRatio: 2 })
  }
}

export function flameIconDataUrl(): string {
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  const img = renderFlameIcon()
  ctx.putImageData(img, 0, 0)
  return canvas.toDataURL('image/png')
}

/** Data-URL for legend / DOM preview. */
export function threatIconDataUrl(
  type: ThreatType | string,
  _hex?: string,
  abroad = false,
  group = false,
): string {
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
  ctx.fillStyle = abroad ? 'rgba(40, 8, 8, 0.82)' : 'rgba(11, 18, 32, 0.78)'
  ctx.fill()
  const fill = abroad ? ABROAD_ICON_COLOR : '#ffffff'
  if (group && t === 'uav') drawUavGroup(ctx, fill)
  else drawSilhouette(ctx, t, fill)
  return canvas.toDataURL('image/png')
}
