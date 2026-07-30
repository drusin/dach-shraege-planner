import type { Cabinet, Point2D, RoomPoints } from './types'
import { getRoomOutline } from './types'

/** Kleine Toleranz in cm – Kante exakt auf der Wand zählt noch als OK */
const EPS = 0.05

/**
 * Ray-casting point-in-polygon.
 * Punkte genau auf der Kante gelten als innen (mit EPS).
 */
export function isPointInPolygon(point: Point2D, polygon: Point2D[]): boolean {
  if (polygon.length < 3) return false

  // Schnelltest: auf/nahe einer Kante
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    if (distanceToSegment(point, polygon[j], polygon[i]) <= EPS) {
      return true
    }
  }

  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const pi = polygon[i]
    const pj = polygon[j]
    const intersect =
      pi.y > point.y !== pj.y > point.y &&
      point.x <
        ((pj.x - pi.x) * (point.y - pi.y)) / (pj.y - pi.y + Number.EPSILON) + pi.x
    if (intersect) inside = !inside
  }
  return inside
}

function distanceToSegment(p: Point2D, a: Point2D, b: Point2D): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y)
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  const projX = a.x + t * dx
  const projY = a.y + t * dy
  return Math.hypot(p.x - projX, p.y - projY)
}

/** Geschlossener Raumumriss als Polygon (Boden schließt von PEnd → P0) */
export function getRoomPolygon(room: RoomPoints): Point2D[] {
  return getRoomOutline(room)
}

/**
 * Proben auf dem Schrank-Rechteck:
 * 4 Ecken + Zwischenpunkte entlang der Oberkante (wichtig bei Dachschräge).
 */
export function getCabinetSamplePoints(cab: Cabinet, samples = 8): Point2D[] {
  const left = cab.x
  const right = cab.x + cab.width
  const bottom = cab.y
  const top = cab.y + cab.height

  const pts: Point2D[] = [
    { x: left, y: bottom },
    { x: right, y: bottom },
    { x: left, y: top },
    { x: right, y: top },
  ]

  for (let i = 1; i < samples; i++) {
    const t = i / samples
    const x = left + (right - left) * t
    pts.push({ x, y: top })
    pts.push({ x, y: bottom })
  }

  // Seitenkanten stichprobenartig (falls Spitzdach/Überstand vertikal greift)
  for (let i = 1; i < samples; i++) {
    const t = i / samples
    const y = bottom + (top - bottom) * t
    pts.push({ x: left, y })
    pts.push({ x: right, y })
  }

  return pts
}

/** true = komplett im Raum, false = ragt über die Bounds */
export function isCabinetInsideRoom(cab: Cabinet, room: RoomPoints): boolean {
  if (cab.width <= 0 || cab.height <= 0) return false
  if (cab.y < -EPS) return false

  const polygon = getRoomPolygon(room)
  const samples = getCabinetSamplePoints(cab)
  return samples.every((p) => isPointInPolygon(p, polygon))
}

export function isCabinetInvalid(cab: Cabinet, room: RoomPoints): boolean {
  return !isCabinetInsideRoom(cab, room)
}