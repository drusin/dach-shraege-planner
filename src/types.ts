/** 2D-Punkt in cm (x = horizontal von links, y = Höhe vom Boden) */
export interface Point2D {
  x: number
  y: number
}

/** Ein Schrankelement (Seitenansicht) */
export interface Cabinet {
  id: string
  label: string
  /** Breite (horizontal) in cm */
  width: number
  /** Höhe (vertikal) in cm */
  height: number
  /** Linke untere Ecke: Abstand von links in cm */
  x: number
  /** Linke untere Ecke: Höhe vom Boden in cm */
  y: number
  color: string
  /**
   * Fixiert: Position/Größe nicht änderbar,
   * wird beim Links-/Rechts-Schieben nicht bewegt.
   */
  fixed?: boolean
}

/**
 * Raum in der Seitenansicht, von links nach rechts:
 *
 *  P0 (virtuell)                                     PEnd (virtuell)
 *   ●                                                   ●
 *   │                                                   │
 *   │ P1                                              P4 │
 *   │  \                                              /  │
 *   │   \                                            /   │
 *   │    P2 ════════════════ P3                     /    │
 *   └────────────────────────────────────────────────────┘
 *                        Boden (y = 0)
 *
 *  Pfad: P0 ─hoch→ P1 ─schräg→ P2 ─gerade→ P3 ─schräg→ P4 ─runter→ PEnd
 *
 *  P0  = virtuell unter P1 (x = P1.x, y = 0)
 *  PEnd = virtuell unter P4 (x = P4.x, y = 0)
 */
export interface RoomPoints {
  /** Anfang linke Schräge (nach der stehenden Wand) */
  p1: Point2D
  /** Ende linke Schräge / Anfang flache Decke */
  p2: Point2D
  /** Ende flache Decke / Anfang rechte Schräge */
  p3: Point2D
  /** Ende rechte Schräge (Beginn stehende Wand rechts) */
  p4: Point2D
}

export type RoomPointKey = keyof RoomPoints

export interface VirtualCorners {
  p0: Point2D
  pEnd: Point2D
}

/** P0 senkrecht unter P1, PEnd senkrecht unter P4 — immer y = 0 */
export function getVirtualCorners(room: RoomPoints): VirtualCorners {
  return {
    p0: { x: room.p1.x, y: 0 },
    pEnd: { x: room.p4.x, y: 0 },
  }
}

/** Gesamter Umriss: P0 → P1 → P2 → P3 → P4 → PEnd */
export function getRoomOutline(room: RoomPoints): Point2D[] {
  const { p0, pEnd } = getVirtualCorners(room)
  return [p0, room.p1, room.p2, room.p3, room.p4, pEnd]
}

export interface Plan {
  room: RoomPoints
  cabinets: Cabinet[]
}

/** Ein gespeichertes Planungsprojekt */
export interface Project {
  id: string
  name: string
  plan: Plan
  /** ms since epoch */
  updatedAt: number
  createdAt: number
}

/** Kompakte Projektliste für "Laden"-Dialoge */
export interface ProjectSummary {
  id: string
  name: string
  updatedAt: number
  createdAt: number
  cabinetCount: number
}