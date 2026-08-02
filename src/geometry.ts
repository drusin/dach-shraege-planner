import type { Cabinet, Point2D, RoomPoints } from './types'
import { getRoomOutline, getVirtualCorners } from './types'

export type SnapMode = 'none' | 'left' | 'right'

/** Kleine Toleranz in cm – Kante exakt auf der Wand / berühren zählt noch als OK */
const EPS = 0.05

export type CabinetInvalidReason = 'out_of_bounds' | 'overlap'

export interface CabinetValidation {
  invalid: boolean
  outOfBounds: boolean
  overlaps: boolean
  /** IDs der Schränke, mit denen dieser überlappt */
  overlappingIds: string[]
  reasons: CabinetInvalidReason[]
}

/**
 * Ray-casting point-in-polygon.
 * Punkte genau auf der Kante gelten als innen (mit EPS).
 */
export function isPointInPolygon(point: Point2D, polygon: Point2D[]): boolean {
  if (polygon.length < 3) return false

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
 * 4 Ecken + Zwischenpunkte entlang der Kanten (wichtig bei Dachschräge).
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

/** Echte Fläche überlappen (nur berühren an der Kante = OK) */
export function cabinetsOverlap(a: Cabinet, b: Cabinet): boolean {
  if (a.id === b.id) return false
  return (
    a.x < b.x + b.width - EPS &&
    a.x + a.width > b.x + EPS &&
    a.y < b.y + b.height - EPS &&
    a.y + a.height > b.y + EPS
  )
}

export function getOverlappingCabinetIds(
  cab: Cabinet,
  cabinets: Cabinet[],
): string[] {
  return cabinets.filter((other) => cabinetsOverlap(cab, other)).map((o) => o.id)
}

export function validateCabinet(
  cab: Cabinet,
  room: RoomPoints,
  cabinets: Cabinet[],
): CabinetValidation {
  const outOfBounds = !isCabinetInsideRoom(cab, room)
  const overlappingIds = getOverlappingCabinetIds(cab, cabinets)
  const overlaps = overlappingIds.length > 0
  const reasons: CabinetInvalidReason[] = []
  if (outOfBounds) reasons.push('out_of_bounds')
  if (overlaps) reasons.push('overlap')

  return {
    invalid: reasons.length > 0,
    outOfBounds,
    overlaps,
    overlappingIds,
    reasons,
  }
}

export function isCabinetInvalid(
  cab: Cabinet,
  room: RoomPoints,
  cabinets: Cabinet[],
): boolean {
  return validateCabinet(cab, room, cabinets).invalid
}

export function describeCabinetIssues(validation: CabinetValidation): string {
  const parts: string[] = []
  if (validation.outOfBounds) {
    parts.push('ragt über die Raumbounds (Wand/Dachschräge/Boden)')
  }
  if (validation.overlaps) {
    const n = validation.overlappingIds.length
    parts.push(n === 1 ? 'überlappt mit einem anderen Schrank' : `überlappt mit ${n} anderen Schränken`)
  }
  return parts.join(' · ')
}

export function shortCabinetIssueLabel(validation: CabinetValidation): string {
  if (validation.outOfBounds && validation.overlaps) return 'Bounds + Überlappung'
  if (validation.outOfBounds) return 'außerhalb'
  if (validation.overlaps) return 'Überlappung'
  return ''
}

function roundCm(n: number): number {
  return Math.round(n * 10) / 10
}

function isPlacementValid(
  draft: Cabinet,
  room: RoomPoints,
  cabinets: Cabinet[],
): boolean {
  return !validateCabinet(draft, room, cabinets).invalid
}

/**
 * Findet die erste gültige x-Position für einen neuen Schrank.
 * - left:  scan von links nach rechts
 * - right: scan von rechts nach links
 * - none:  übergebene x unverändert
 *
 * Fallback wenn nichts passt: Raummitte (horizontal zentriert).
 * y bleibt unverändert (typisch 0 = Boden).
 */
export function resolveCabinetPlacement(
  draft: Omit<Cabinet, 'id'> & { id?: string },
  room: RoomPoints,
  cabinets: Cabinet[],
  snap: SnapMode,
  step = 1,
): { x: number; y: number } {
  const y = Math.max(0, draft.y)
  const width = Math.max(1, draft.width)
  const height = Math.max(1, draft.height)

  if (snap === 'none') {
    return { x: draft.x, y }
  }

  const { p0, pEnd } = getVirtualCorners(room)
  const minX = Math.min(p0.x, pEnd.x)
  const maxX = Math.max(p0.x, pEnd.x)
  const maxLeft = maxX - width

  // Kandidaten: Kanten der bestehenden Schränke + Raumgrenzen
  const candidates = new Set<number>()
  candidates.add(roundCm(minX))
  candidates.add(roundCm(maxLeft))

  for (const cab of cabinets) {
    candidates.add(roundCm(cab.x + cab.width)) // direkt rechts daneben
    candidates.add(roundCm(cab.x - width)) // direkt links daneben
  }

  // Dichter Scan als Fallback / Füllung
  const start = snap === 'left' ? minX : maxLeft
  const end = snap === 'left' ? maxLeft : minX
  const dir = snap === 'left' ? 1 : -1

  const probe: Cabinet = {
    id: draft.id ?? '__snap_probe__',
    label: draft.label,
    width,
    height,
    x: start,
    y,
    color: draft.color,
  }

  // 1) Kandidaten in Scan-Richtung prüfen (präzises Snappen an Nachbarn)
  const ordered = [...candidates]
    .filter((x) => x >= minX - EPS && x <= maxLeft + EPS)
    .sort((a, b) => (snap === 'left' ? a - b : b - a))

  for (const x of ordered) {
    probe.x = x
    if (isPlacementValid(probe, room, cabinets)) {
      return { x: roundCm(x), y }
    }
  }

  // 2) Schrittweiser Scan
  if (maxLeft >= minX) {
    for (let x = start; dir > 0 ? x <= end : x >= end; x += dir * step) {
      probe.x = x
      if (isPlacementValid(probe, room, cabinets)) {
        return { x: roundCm(x), y }
      }
    }
  }

  // 3) Fallback: horizontal mittig im Raum
  const centerX = roundCm((minX + maxX) / 2 - width / 2)
  return { x: centerX, y }
}