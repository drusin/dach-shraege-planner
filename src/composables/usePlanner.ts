import { ref, computed, watch } from 'vue'
import type {
  Plan,
  RoomPointKey,
  Cabinet,
  Point2D,
  Project,
  ProjectSummary,
} from '../types'
import { DEFAULT_PROJECT_NAME } from '../types'
import { getDefaultPlan, loadPlanFromUrl, writePlanToUrl } from '../urlState'
import { packValidCabinets } from '../geometry'
import {
  bootstrapProject,
  clonePlan,
  createNewProject,
  duplicateProject,
  listProjectSummaries,
  loadProject,
  normalizeProjectName,
  persistActivePlan,
  renameProject,
} from '../projectStore'

function finiteOr(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) ? value : fallback
}

function projectToState(project: Project) {
  return {
    id: project.id,
    name: project.name,
    plan: clonePlan(project.plan),
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  }
}

export function usePlanner() {
  const boot = bootstrapProject(loadPlanFromUrl())

  const projectId = ref(boot.id)
  const projectName = ref(boot.name)
  const projectCreatedAt = ref(boot.createdAt)
  const projectUpdatedAt = ref(boot.updatedAt)
  const plan = ref<Plan>(clonePlan(boot.plan))
  const selectedCabinetId = ref<string | null>(null)
  const projectList = ref<ProjectSummary[]>(listProjectSummaries())
  const nameError = ref<string | null>(null)

  const cabinetCount = computed(() => plan.value.cabinets.length)

  const selectedCabinet = computed(
    () => plan.value.cabinets.find((c) => c.id === selectedCabinetId.value) ?? null,
  )

  let persistTimer: ReturnType<typeof setTimeout> | null = null
  let applyingProject = false

  function refreshProjectList() {
    projectList.value = listProjectSummaries()
  }

  function applyProject(project: Project) {
    applyingProject = true
    const state = projectToState(project)
    projectId.value = state.id
    projectName.value = state.name
    projectCreatedAt.value = state.createdAt
    projectUpdatedAt.value = state.updatedAt
    plan.value = state.plan
    selectedCabinetId.value = null
    nameError.value = null
    refreshProjectList()
    writePlanToUrl(state.plan)
    queueMicrotask(() => {
      applyingProject = false
    })
  }

  function persistNow() {
    if (applyingProject) return
    const saved = persistActivePlan(
      projectId.value,
      projectName.value,
      plan.value,
      projectCreatedAt.value,
    )
    projectUpdatedAt.value = saved.updatedAt
    refreshProjectList()
    writePlanToUrl(plan.value)
  }

  function schedulePersist() {
    if (applyingProject) return
    if (persistTimer) clearTimeout(persistTimer)
    persistTimer = setTimeout(() => {
      persistTimer = null
      persistNow()
    }, 150)
  }

  function flushPersist() {
    if (persistTimer) {
      clearTimeout(persistTimer)
      persistTimer = null
    }
    persistNow()
  }

  // Jede Plan-Änderung → localStorage + URL (debounced)
  watch(plan, () => schedulePersist(), { deep: true })

  // Bootstrap-Stand einmalig sichern
  persistNow()

  // Browser zurück/vor: URL-Plan in aktives Projekt übernehmen
  function onPopState() {
    const loaded = loadPlanFromUrl()
    if (!loaded) return
    applyingProject = true
    plan.value = clonePlan(loaded)
    selectedCabinetId.value = null
    queueMicrotask(() => {
      applyingProject = false
      persistNow()
    })
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

    if (patch.fixed !== undefined) cab.fixed = patch.fixed
    if (patch.label !== undefined) cab.label = patch.label
    if (patch.color !== undefined) cab.color = patch.color

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

  /** Aktuellen Plan im gleichen Projekt auf Defaults zurücksetzen */
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

  function clearNameError() {
    nameError.value = null
  }

  /** Projektname umbenennen – muss unique sein */
  function setProjectName(raw: string): boolean {
    nameError.value = null
    const normalized = normalizeProjectName(raw)
    if (!normalized) {
      nameError.value = 'Name darf nicht leer sein'
      return false
    }
    if (normalized === projectName.value) {
      return true
    }
    // Zuerst aktuellen Plan sichern, dann umbenennen
    flushPersist()
    const result = renameProject(projectId.value, normalized)
    if (!result.ok) {
      if (result.reason === 'taken') {
        nameError.value = 'Name ist bereits vergeben'
      } else if (result.reason === 'empty') {
        nameError.value = 'Name darf nicht leer sein'
      } else {
        nameError.value = 'Projekt nicht gefunden'
      }
      return false
    }
    projectName.value = result.project.name
    projectUpdatedAt.value = result.project.updatedAt
    nameError.value = null
    refreshProjectList()
    return true
  }

  /** Neues leeres Projekt; aktuelles bleibt im localStorage */
  function newProject() {
    flushPersist()
    const created = createNewProject(DEFAULT_PROJECT_NAME)
    applyProject(created)
  }

  /** Kopie mit Index im Namen; Original bleibt */
  function copyProject() {
    flushPersist()
    const source: Project = {
      id: projectId.value,
      name: projectName.value,
      plan: clonePlan(plan.value),
      createdAt: projectCreatedAt.value,
      updatedAt: projectUpdatedAt.value,
    }
    const copy = duplicateProject(source)
    applyProject(copy)
  }

  /** Gespeichertes Projekt laden */
  function openProject(id: string): boolean {
    if (id === projectId.value) return true
    flushPersist()
    const loaded = loadProject(id)
    if (!loaded) return false
    applyProject(loaded)
    return true
  }

  return {
    plan,
    cabinetCount,
    selectedCabinetId,
    selectedCabinet,
    projectId,
    projectName,
    projectUpdatedAt,
    projectList,
    nameError,
    addCabinet,
    removeCabinet,
    updateCabinet,
    selectCabinet,
    updateRoomPoint,
    resetPlan,
    shiftCabinets,
    setProjectName,
    clearNameError,
    newProject,
    copyProject,
    openProject,
    refreshProjectList,
  }
}
