import { ref, computed, watch } from 'vue'
import type { Plan, RoomPoints, RoomPointKey, Cabinet, Point2D } from '../types'
import {
  getDefaultPlan,
  loadPlanFromUrl,
  writePlanToUrl,
} from '../urlState'
import { packValidCabinets } from '../geometry'

function cloneRoom(room: RoomPoints): RoomPoints {
  return {
    p1: { ...room.p1 },
    p2: { ...room.p2 },
    p3: { ...room.p3 },
    p4: { ...room.p4 },
  }
}

function clonePlan(plan: Plan): Plan {
  return {
    room: cloneRoom(plan.room),
    cabinets: plan.cabinets.map((c) => ({ ...c })),
  }
}

function finiteOr(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) ? value : fallback
}

export function usePlanner() {
  const initial = loadPlanFromUrl() ?? getDefaultPlan()

  const plan = ref<Plan>(clonePlan(initial))
  const selectedCabinetId = ref<string | null>(null)

  const cabinetCount = computed(() => plan.value.cabinets.length)

  const selectedCabinet = computed(
    () => plan.value.cabinets.find((c) => c.id === selectedCabinetId.value) ?? null,
  )

  // URL live halten (debounced) – sharebarer Zustand
  let urlTimer: ReturnType<typeof setTimeout> | null = null
  watch(
    plan,
    (value) => {
      if (urlTimer) clearTimeout(urlTimer)
      urlTimer = setTimeout(() => writePlanToUrl(value), 150)
    },
    { deep: true, immediate: true },
  )

  // Browser zurück/vor: URL → State
  function onPopState() {
    const loaded = loadPlanFromUrl()
    plan.value = clonePlan(loaded ?? getDefaultPlan())
    selectedCabinetId.value = null
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('popstate', onPopState)
  }

  function addCabinet(cabinet: Cabinet) {
    plan.value.cabinets.push(cabinet)
    selectedCabinetId.value = cabinet.id
  }

  function removeCabinet(id: string) {
    plan.value.cabinets = plan.value.cabinets.filter((c) => c.id !== id)
    if (selectedCabinetId.value === id) {
      selectedCabinetId.value = plan.value.cabinets[0]?.id ?? null
    }
  }

  function updateCabinet(id: string, patch: Partial<Omit<Cabinet, 'id'>>) {
    const cab = plan.value.cabinets.find((c) => c.id === id)
    if (!cab) return

    // Fixierung darf immer umgeschaltet werden
    if (patch.fixed !== undefined) cab.fixed = patch.fixed

    // Label/Farbe auch bei fixierten Schränken erlauben
    if (patch.label !== undefined) cab.label = patch.label
    if (patch.color !== undefined) cab.color = patch.color

    // Position & Größe nur wenn nicht fixiert
    if (!cab.fixed) {
      if (patch.width !== undefined) cab.width = Math.max(1, finiteOr(patch.width, cab.width))
      if (patch.height !== undefined) cab.height = Math.max(1, finiteOr(patch.height, cab.height))
      if (patch.x !== undefined) cab.x = finiteOr(patch.x, cab.x)
      if (patch.y !== undefined) cab.y = Math.max(0, finiteOr(patch.y, cab.y))
    }
  }

  function selectCabinet(id: string | null) {
    selectedCabinetId.value = id
  }

  function updateRoomPoint(point: RoomPointKey, value: Partial<Point2D>) {
    const p = plan.value.room[point]
    if (value.x !== undefined) p.x = finiteOr(value.x, p.x)
    if (value.y !== undefined) p.y = Math.max(0, finiteOr(value.y, p.y))
  }

  function resetPlan() {
    plan.value = getDefaultPlan()
    selectedCabinetId.value = null
  }

  function shiftCabinets(direction: 'left' | 'right') {
    plan.value.cabinets = packValidCabinets(
      plan.value.cabinets,
      plan.value.room,
      direction,
    )
  }

  return {
    plan,
    cabinetCount,
    selectedCabinetId,
    selectedCabinet,
    addCabinet,
    removeCabinet,
    updateCabinet,
    selectCabinet,
    updateRoomPoint,
    resetPlan,
    shiftCabinets,
  }
}
