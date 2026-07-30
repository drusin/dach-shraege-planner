import { ref, computed } from 'vue'
import type { Plan, RoomPoints, RoomPointKey, Cabinet, Point2D } from '../types'

/**
 * Default-Dachgeschoss (cm):
 * Wand unter der Schräge 25 cm.
 */
const defaultRoom: RoomPoints = {
  p1: { x: 0, y: 25 },
  p2: { x: 120, y: 240 },
  p3: { x: 300, y: 240 },
  p4: { x: 420, y: 25 },
}

function cloneRoom(room: RoomPoints): RoomPoints {
  return {
    p1: { ...room.p1 },
    p2: { ...room.p2 },
    p3: { ...room.p3 },
    p4: { ...room.p4 },
  }
}

function finiteOr(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) ? value : fallback
}

export function usePlanner() {
  const plan = ref<Plan>({
    room: cloneRoom(defaultRoom),
    cabinets: [],
  })

  const selectedCabinetId = ref<string | null>(null)

  const cabinetCount = computed(() => plan.value.cabinets.length)

  const selectedCabinet = computed(
    () => plan.value.cabinets.find((c) => c.id === selectedCabinetId.value) ?? null,
  )

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

    if (patch.label !== undefined) cab.label = patch.label
    if (patch.color !== undefined) cab.color = patch.color
    if (patch.width !== undefined) cab.width = Math.max(1, finiteOr(patch.width, cab.width))
    if (patch.height !== undefined) cab.height = Math.max(1, finiteOr(patch.height, cab.height))
    if (patch.x !== undefined) cab.x = finiteOr(patch.x, cab.x)
    if (patch.y !== undefined) cab.y = Math.max(0, finiteOr(patch.y, cab.y))
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
    plan.value = {
      room: cloneRoom(defaultRoom),
      cabinets: [],
    }
    selectedCabinetId.value = null
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
  }
}