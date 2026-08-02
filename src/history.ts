import type { Plan } from './types'
import { clonePlan } from './projectStore'

/** Snapshot eines rückgängig machbaren Zustands (nur Plan + Auswahl) */
export interface HistorySnapshot {
  plan: Plan
  selectedCabinetId: string | null
}

const DEFAULT_LIMIT = 100

/**
 * Undo/Redo-Stack – nur im Speicher, nicht in URL/localStorage-Projekten.
 * Pro Projekt frisch anlegen (beim Wechsel leeren).
 */
export function createHistory(limit = DEFAULT_LIMIT) {
  let past: HistorySnapshot[] = []
  let future: HistorySnapshot[] = []
  let last: HistorySnapshot | null = null

  function cloneSnap(snap: HistorySnapshot): HistorySnapshot {
    return {
      plan: clonePlan(snap.plan),
      selectedCabinetId: snap.selectedCabinetId,
    }
  }

  function samePlan(a: Plan, b: Plan): boolean {
    // Schneller struktureller Vergleich über JSON (Plan ist klein)
    return JSON.stringify(a) === JSON.stringify(b)
  }

  /** Startpunkt setzen (Bootstrap / Projektwechsel) – leert Stacks */
  function reset(snap: HistorySnapshot) {
    past = []
    future = []
    last = cloneSnap(snap)
  }

  /**
   * Nach einer Benutzer-Änderung aufrufen.
   * Schiebt den bisherigen Stand auf den Undo-Stack.
   * Identische Pläne werden ignoriert (keine leeren Steps).
   */
  function push(next: HistorySnapshot) {
    if (!last) {
      last = cloneSnap(next)
      return
    }
    if (samePlan(last.plan, next.plan)) {
      // Auswahl-only: last mitziehen, kein History-Eintrag
      last = {
        plan: last.plan,
        selectedCabinetId: next.selectedCabinetId,
      }
      return
    }
    past.push(cloneSnap(last))
    if (past.length > limit) past.shift()
    future = []
    last = cloneSnap(next)
  }

  /**
   * Während kontinuierlicher Interaktion (z.B. Drag):
   * erster Move → normal push, weitere Moves → nur last aktualisieren
   * (ein Undo-Schritt für den gesamten Drag).
   */
  function replaceLast(next: HistorySnapshot) {
    if (!last) {
      last = cloneSnap(next)
      return
    }
    last = cloneSnap(next)
  }

  function canUndo(): boolean {
    return past.length > 0
  }

  function canRedo(): boolean {
    return future.length > 0
  }

  function undo(): HistorySnapshot | null {
    if (!last || past.length === 0) return null
    const prev = past.pop()!
    future.push(cloneSnap(last))
    last = cloneSnap(prev)
    return cloneSnap(last)
  }

  function redo(): HistorySnapshot | null {
    if (!last || future.length === 0) return null
    const nxt = future.pop()!
    past.push(cloneSnap(last))
    last = cloneSnap(nxt)
    return cloneSnap(last)
  }

  function undoDepth(): number {
    return past.length
  }

  function redoDepth(): number {
    return future.length
  }

  return {
    reset,
    push,
    replaceLast,
    canUndo,
    canRedo,
    undo,
    redo,
    undoDepth,
    redoDepth,
  }
}

export type History = ReturnType<typeof createHistory>
