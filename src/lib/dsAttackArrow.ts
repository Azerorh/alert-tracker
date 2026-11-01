/** DeepState attack-direction arrow icon for MapLibre. */

export const DS_ATTACK_ICON_ID = 'ds-attack-arrow'

const SIZE = 64

function drawArrow(): ImageData {
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, SIZE, SIZE)

  // Tip points up (north); MapLibre icon-rotate is clockwise from that.
  ctx.translate(SIZE / 2, SIZE / 2)
  ctx.beginPath()
  ctx.moveTo(0, -26)
  ctx.lineTo(14, 6)
  ctx.lineTo(5, 6)
  ctx.lineTo(5, 22)
  ctx.lineTo(-5, 22)
  ctx.lineTo(-5, 6)
  ctx.lineTo(-14, 6)
  ctx.closePath()
  ctx.fillStyle = '#1d8fd8'
  ctx.strokeStyle = '#0b3d5c'
  ctx.lineWidth = 2.5
  ctx.lineJoin = 'round'
  ctx.fill()
  ctx.stroke()

  return ctx.getImageData(0, 0, SIZE, SIZE)
}

export function registerDsAttackArrow(
  map: { hasImage: (id: string) => boolean; addImage: (id: string, img: ImageData, opts?: { pixelRatio?: number }) => void },
) {
  if (map.hasImage(DS_ATTACK_ICON_ID)) return
  map.addImage(DS_ATTACK_ICON_ID, drawArrow(), { pixelRatio: 2 })
}

export function dsAttackArrowDataUrl(): string {
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d')!
  const img = drawArrow()
  ctx.putImageData(img, 0, 0)
  return canvas.toDataURL('image/png')
}
