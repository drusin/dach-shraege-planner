import type { Cabinet, Plan, Point2D, RoomPoints } from './types'

/** Query-Parameter für den Plan-Zustand */
export const STATE_PARAM = 's'

const defaultRoom: RoomPoints = {
  p1: { x: 0, y: 25 },
  p2: { x: 120, y: 240 },
  p3: { x: 300, y: 240 },
  p4: { x: 420, y: 25 },
}

/** Kompaktes Wire-Format (v1) – möglichst kurze URLs */
interface WireCabinetV1 {
  /** id */
  i: string
  /** label */
  l: string
  /** width */
  w: number
  /** height */
  h: number
  /** x */
  x: number
  /** y */
  y: number
  /** color */
  c: string
  /** fixed (1 = true, omitted = false) */
  f?: 1
}

interface WireStateV1 {
  v: 1
  /** room points as flat [p1x,p1y,p2x,p2y,p3x,p3y,p4x,p4y] */
  r: number[]
  /** cabinets */
  c: WireCabinetV1[]
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n)
}

function point(x: unknown, y: unknown, fallback: Point2D): Point2D {
  return {
    x: isFiniteNumber(x) ? x : fallback.x,
    y: isFiniteNumber(y) ? Math.max(0, y) : fallback.y,
  }
}

function roomFromFlat(r: unknown): RoomPoints {
  const arr = Array.isArray(r) ? r : []
  return {
    p1: point(arr[0], arr[1], defaultRoom.p1),
    p2: point(arr[2], arr[3], defaultRoom.p2),
    p3: point(arr[4], arr[5], defaultRoom.p3),
    p4: point(arr[6], arr[7], defaultRoom.p4),
  }
}

function cabinetFromWire(raw: unknown, index: number): Cabinet | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>

  const width = isFiniteNumber(o.w) ? Math.max(1, o.w) : null
  const height = isFiniteNumber(o.h) ? Math.max(1, o.h) : null
  const x = isFiniteNumber(o.x) ? o.x : null
  const y = isFiniteNumber(o.y) ? Math.max(0, o.y) : null
  if (width === null || height === null || x === null || y === null) return null

  const id = typeof o.i === 'string' && o.i ? o.i : `cab-${index}`
  const label = typeof o.l === 'string' && o.l ? o.l : 'Schrank'
  const color = typeof o.c === 'string' && /^#?[0-9a-fA-F]{3,8}$/.test(o.c)
    ? o.c.startsWith('#')
      ? o.c
      : `#${o.c}`
    : '#2980b9'

  const fixed = o.f === 1 || o.f === true

  return { id, label, width, height, x, y, color, fixed }
}

function toWire(plan: Plan): WireStateV1 {
  const { room, cabinets } = plan
  return {
    v: 1,
    r: [
      room.p1.x,
      room.p1.y,
      room.p2.x,
      room.p2.y,
      room.p3.x,
      room.p3.y,
      room.p4.x,
      room.p4.y,
    ],
    c: cabinets.map((cab) => ({
      i: cab.id,
      l: cab.label,
      w: cab.width,
      h: cab.height,
      x: cab.x,
      y: cab.y,
      c: cab.color,
      ...(cab.fixed ? { f: 1 as const } : {}),
    })),
  }
}

function fromWire(data: unknown): Plan | null {
  if (!data || typeof data !== 'object') return null
  const o = data as Record<string, unknown>
  if (o.v !== 1) return null

  const room = roomFromFlat(o.r)
  const list = Array.isArray(o.c) ? o.c : []
  const cabinets: Cabinet[] = []
  for (let i = 0; i < list.length; i++) {
    const cab = cabinetFromWire(list[i], i)
    if (cab) cabinets.push(cab)
  }

  return { room, cabinets }
}

/** UTF-8 safe base64url */
function encodeBase64Url(json: string): string {
  const bytes = new TextEncoder().encode(json)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function decodeBase64Url(value: string): string {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4))
  const binary = atob(padded + pad)
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

/** Plan → URL-Token */
export function encodePlanToToken(plan: Plan): string {
  const json = JSON.stringify(toWire(plan))
  return encodeBase64Url(json)
}

/** URL-Token → Plan (oder null bei Fehler) */
export function decodePlanFromToken(token: string): Plan | null {
  try {
    const json = decodeBase64Url(token)
    return fromWire(JSON.parse(json))
  } catch {
    return null
  }
}

function readTokenFromLocation(): string | null {
  // 1) ?s=...
  const params = new URLSearchParams(window.location.search)
  const fromQuery = params.get(STATE_PARAM)
  if (fromQuery) return fromQuery

  // 2) #s=... oder #/s=...
  const hash = window.location.hash.replace(/^#\/?/, '')
  if (!hash) return null
  if (hash.startsWith(`${STATE_PARAM}=`)) {
    return decodeURIComponent(hash.slice(STATE_PARAM.length + 1))
  }
  const hashParams = new URLSearchParams(hash)
  return hashParams.get(STATE_PARAM)
}

/** Liest den Plan aus der aktuellen URL */
export function loadPlanFromUrl(): Plan | null {
  const token = readTokenFromLocation()
  if (!token) return null
  return decodePlanFromToken(token)
}

/**
 * Schreibt den Plan in die URL (?s=...), ohne History-Eintrag zu spammen.
 * Selection o.ä. bleibt absichtlich draußen – nur sharebarer Inhalt.
 */
export function writePlanToUrl(plan: Plan): void {
  const token = encodePlanToToken(plan)
  const url = new URL(window.location.href)
  url.searchParams.set(STATE_PARAM, token)
  // Hash-Altlast entfernen, damit nicht zwei Quellen konkurrieren
  url.hash = ''
  const next = `${url.pathname}${url.search}`
  const current = `${window.location.pathname}${window.location.search}`
  if (next !== current) {
    window.history.replaceState(null, '', next)
  }
}

export function getDefaultPlan(): Plan {
  return {
    room: {
      p1: { ...defaultRoom.p1 },
      p2: { ...defaultRoom.p2 },
      p3: { ...defaultRoom.p3 },
      p4: { ...defaultRoom.p4 },
    },
    cabinets: [],
  }
}
