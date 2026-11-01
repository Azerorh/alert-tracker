/** DeepState RF unit marker icons. */

export const DS_UNIT_ICON_ID = 'ds-unit-enemy'
export const DS_UNIT_HQ_ICON_ID = 'ds-unit-hq'

const SIZE = 64

function drawUnit(hq: boolean): ImageData {
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, SIZE, SIZE)
  ctx.translate(SIZE / 2, SIZE / 2)

  // Diamond / HQ square
  ctx.beginPath()
  if (hq) {
    ctx.rect(-14, -14, 28, 28)
  } else {
    ctx.moveTo(0, -16)
    ctx.lineTo(16, 0)
    ctx.lineTo(0, 16)
    ctx.lineTo(-16, 0)
    ctx.closePath()
  }
  ctx.fillStyle = hq ? '#c45c26' : '#b91c1c'
  ctx.strokeStyle = '#1a0a0a'
  ctx.lineWidth = 2.5
  ctx.fill()
  ctx.stroke()

  // Inner tick
  ctx.beginPath()
  ctx.moveTo(0, -6)
  ctx.lineTo(0, 6)
  ctx.moveTo(-6, 0)
  ctx.lineTo(6, 0)
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'
  ctx.lineWidth = 2
  ctx.stroke()

  return ctx.getImageData(0, 0, SIZE, SIZE)
}

export function registerDsUnitIcons(map: {
  hasImage: (id: string) => boolean
  addImage: (id: string, img: ImageData, opts?: { pixelRatio?: number }) => void
}) {
  if (!map.hasImage(DS_UNIT_ICON_ID)) {
    map.addImage(DS_UNIT_ICON_ID, drawUnit(false), { pixelRatio: 2 })
  }
  if (!map.hasImage(DS_UNIT_HQ_ICON_ID)) {
    map.addImage(DS_UNIT_HQ_ICON_ID, drawUnit(true), { pixelRatio: 2 })
  }
}

export function dsUnitIconDataUrl(hq = false): string {
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d')!
  ctx.putImageData(drawUnit(hq), 0, 0)
  return canvas.toDataURL('image/png')
}
