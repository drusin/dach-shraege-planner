import type { Cabinet, Point2D, RoomPoints } from './types'
import { getRoomOutline, getVirtualCorners } from './types'
import { t } from './i18n'

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
    parts.push(t('validation.out_of_bounds'))
  }
  if (validation.overlaps) {
    const n = validation.overlappingIds.length
    parts.push(n === 1 ? t('validation.overlaps_one') : t('validation.overlaps_many', { count: n }))
  }
  return parts.join(' · ')
}

export function shortCabinetIssueLabel(validation: CabinetValidation): string {
  if (validation.outOfBounds && validation.overlaps) return t('validation.short_bounds_overlap')
  if (validation.outOfBounds) return t('validation.short_out_of_bounds')
  if (validation.overlaps) return t('validation.short_overlap')
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
 * Findet die extremste gültige x-Position für einen neuen Schrank.
 * - left:  möglichst weit links (nicht „erster Kandidat“ – der wäre oft die rechte Wand)
 * - right: möglichst weit rechts
 * - none:  übergebene x unverändert
 *
 * Unter der Dachschräge ist x=min oft ungültig; dann muss der Scan
 * die linkeste *gültige* Stelle finden, statt auf maxLeft zu springen.
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

  const probe: Cabinet = {
    id: draft.id ?? '__snap_probe__',
    label: draft.label,
    width,
    height,
    x: minX,
    y,
    color: draft.color,
  }

  const best = findExtremeValidX(
    probe,
    room,
    cabinets,
    minX,
    maxLeft,
    snap,
    step,
  )

  if (best !== null) {
    return { x: best, y }
  }

  // Fallback: horizontal mittig im Raum
  const centerX = roundCm((minX + maxX) / 2 - width / 2)
  return { x: centerX, y }
}

/**
 * Sucht die extremste gültige x-Position in [lo, hi].
 * left  → kleinstes x
 * right → größtes x
 *
 * Kandidaten (Kanten) + dichter Scan – es wird immer das Extremum gewählt,
 * nicht der erste zufällig gültige Kandidat (sonst „Springen“ an Fixpunkte).
 */
function findExtremeValidX(
  probe: Cabinet,
  room: RoomPoints,
  others: Cabinet[],
  lo: number,
  hi: number,
  direction: 'left' | 'right',
  step: number,
): number | null {
  if (hi < lo - EPS) return null

  const loR = roundCm(lo)
  const hiR = roundCm(hi)

  // Kandidaten: Intervallenden + Andocken an Hindernisse
  const candidates = new Set<number>([loR, hiR])
  for (const o of others) {
    candidates.add(roundCm(o.x + o.width))
    candidates.add(roundCm(o.x - probe.width))
  }

  let best: number | null = null
  const consider = (x: number) => {
    const xr = roundCm(Math.min(hiR, Math.max(loR, x)))
    if (xr < loR - EPS || xr > hiR + EPS) return
    probe.x = xr
    if (!isPlacementValid(probe, room, others)) return
    if (
      best === null ||
      (direction === 'left' ? xr < best : xr > best)
    ) {
      best = xr
    }
  }

  for (const x of candidates) consider(x)

  // Dichter Scan über das erlaubte Intervall (für Positionen unter der Schräge)
  for (let x = loR; x <= hiR + EPS; x += step) {
    consider(x)
  }
  consider(hiR)

  return best
}

/**
 * Schiebt alle aktuell gültigen, nicht fixierten Schränke möglichst weit
 * nach links bzw. rechts.
 *
 * - Fixierte + ungültige bleiben stehen (Hindernisse)
 * - Links→Rechts-Reihenfolge der beweglichen Schränke bleibt strikt erhalten
 *   (Cursor-Grenze verhindert Überholen, z.B. unter der Schräge)
 * - y bleibt unverändert
 */
export function packValidCabinets(
  cabinets: Cabinet[],
  room: RoomPoints,
  direction: 'left' | 'right',
  step = 1,
): Cabinet[] {
  const result = cabinets.map((c) => ({ ...c }))

  // Immer in visueller Links→Rechts-Reihenfolge arbeiten
  const movable = result
    .filter((c) => !c.fixed && !validateCabinet(c, room, result).invalid)
    .sort((a, b) => a.x - b.x || a.id.localeCompare(b.id))

  if (movable.length === 0) return result

  // Bewegliche aus dem Weg; Platzierung von der Zielseite her
  const parked = new Set(movable.map((c) => c.id))
  const obstacles = () => result.filter((c) => !parked.has(c.id))

  const { p0, pEnd } = getVirtualCorners(room)
  const roomMinX = Math.min(p0.x, pEnd.x)
  const roomMaxX = Math.max(p0.x, pEnd.x)

  // Cursor erzwingt Reihenfolge:
  // left:  nächster Schrank startet erst rechts vom vorigen (x >= prev.x+prev.w)
  // right: nächster Schrank endet erst links vom vorigen (x+w <= prev.x)
  let cursorMinX = -Infinity
  let cursorMaxRight = Infinity

  const order = direction === 'left' ? movable : [...movable].reverse()

  for (const cab of order) {
    const others = obstacles()
    const width = cab.width
    const height = cab.height
    const y = cab.y
    const maxLeft = roomMaxX - width

    let lo = roomMinX
    let hi = maxLeft
    if (direction === 'left') {
      lo = Math.max(lo, cursorMinX)
    } else {
      hi = Math.min(hi, cursorMaxRight - width)
    }

    const probe: Cabinet = { ...cab, x: cab.x, y, width, height }
    const best = findExtremeValidX(probe, room, others, lo, hi, direction, step)

    const target = result.find((c) => c.id === cab.id)
    if (target) {
      if (best !== null) {
        target.x = best
      }
      // Cursor auch bei unveränderter Position fortschreiben
      if (direction === 'left') {
        cursorMinX = target.x + target.width
      } else {
        cursorMaxRight = target.x
      }
    }

    parked.delete(cab.id)
  }

  return result
}