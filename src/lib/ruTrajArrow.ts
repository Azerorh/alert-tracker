/** Experimental RU BPLA corridor arrow (NAHR-style). Tip points north. */

export const RU_TRAJ_ARROW_ID = 'ru-traj-arrow'

const SIZE = 64

function drawArrow(): ImageData {
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, SIZE, SIZE)

  ctx.translate(SIZE / 2, SIZE / 2)
  ctx.beginPath()
  ctx.moveTo(0, -24)
  ctx.lineTo(12, 8)
  ctx.lineTo(4, 8)
  ctx.lineTo(4, 22)
  ctx.lineTo(-4, 22)
  ctx.lineTo(-4, 8)
  ctx.lineTo(-12, 8)
  ctx.closePath()
  ctx.fillStyle = '#ff8a3d'
  ctx.strokeStyle = '#5c2010'
  ctx.lineWidth = 2.2
  ctx.lineJoin = 'round'
  ctx.fill()
  ctx.stroke()

  return ctx.getImageData(0, 0, SIZE, SIZE)
}

export function registerRuTrajArrow(
  map: {
    hasImage: (id: string) => boolean
    addImage: (
      id: string,
      img: ImageData,
      opts?: { pixelRatio?: number },
    ) => void
  },
) {
  if (map.hasImage(RU_TRAJ_ARROW_ID)) return
  map.addImage(RU_TRAJ_ARROW_ID, drawArrow(), { pixelRatio: 2 })
}

export function ruTrajArrowDataUrl(): string {
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d')!
  ctx.putImageData(drawArrow(), 0, 0)
  return canvas.toDataURL('image/png')
}

/** Initial bearing from A→B in degrees clockwise from north. */
export function bearingBetween(
  a: [number, number],
  b: [number, number],
): number {
  const [lon1, lat1] = a
  const [lon2, lat2] = b
  const φ1 = (lat1 * Math.PI) / 180
  const φ2 = (lat2 * Math.PI) / 180
  const Δλ = ((lon2 - lon1) * Math.PI) / 180
  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}
