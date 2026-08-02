import { ref, computed, watch, onUnmounted } from 'vue'
import type {
  Plan,
  RoomPointKey,
  Cabinet,
  Point2D,
  Project,
  ProjectSummary,
} from '../types'
import { DEFAULT_PROJECT_NAME } from '../types'
import {
  buildShareUrl,
  getDefaultPlan,
  loadSharedFromUrl,
  writePlanToUrl,
} from '../urlState'
import { packValidCabinets } from '../geometry'
import {
  allocateUniqueName,
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
import { createHistory, type HistorySnapshot } from '../history'

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
  const boot = bootstrapProject(loadSharedFromUrl())

  const projectId = ref(boot.id)
  const projectName = ref(boot.name)
  const projectCreatedAt = ref(boot.createdAt)
  const projectUpdatedAt = ref(boot.updatedAt)
  const plan = ref<Plan>(clonePlan(boot.plan))
  const selectedCabinetId = ref<string | null>(null)
  const projectList = ref<ProjectSummary[]>(listProjectSummaries())
  const nameError = ref<string | null>(null)

  const canUndo = ref(false)
  const canRedo = ref(false)
  /** Feedback für „Share-Link kopieren“ */
  const shareStatus = ref<string | null>(null)
  let shareStatusTimer: ReturnType<typeof setTimeout> | null = null

  const cabinetCount = computed(() => plan.value.cabinets.length)

  const selectedCabinet = computed(
    () => plan.value.cabinets.find((c) => c.id === selectedCabinetId.value) ?? null,
  )

  const history = createHistory()

  let persistTimer: ReturnType<typeof setTimeout> | null = null
  let historyTimer: ReturnType<typeof setTimeout> | null = null
  /** true während applyProject / undo / redo */
  let silenceHistory = false
  /** kontinuierliche Interaktion (Drag) → ein History-Eintrag */
  let coalescing = false
  let coalescingStarted = false

  function snapshot(): HistorySnapshot {
    return {
      plan: clonePlan(plan.value),
      selectedCabinetId: selectedCabinetId.value,
    }
  }

  function syncHistoryFlags() {
    canUndo.value = history.canUndo()
    canRedo.value = history.canRedo()
  }

  function refreshProjectList() {
    projectList.value = listProjectSummaries()
  }

  function applySnapshot(snap: HistorySnapshot) {
    silenceHistory = true
    plan.value = clonePlan(snap.plan)
    selectedCabinetId.value =
      snap.selectedCabinetId &&
      snap.plan.cabinets.some((c) => c.id === snap.selectedCabinetId)
        ? snap.selectedCabinetId
        : null
    queueMicrotask(() => {
      silenceHistory = false
    })
  }

  function applyProject(project: Project) {
    silenceHistory = true
    if (historyTimer) {
      clearTimeout(historyTimer)
      historyTimer = null
    }
    coalescing = false
    coalescingStarted = false

    const state = projectToState(project)
    projectId.value = state.id
    projectName.value = state.name
    projectCreatedAt.value = state.createdAt
    projectUpdatedAt.value = state.updatedAt
    plan.value = state.plan
    selectedCabinetId.value = null
    nameError.value = null
    refreshProjectList()
    writePlanToUrl(state.plan, state.name)
    history.reset({
      plan: clonePlan(state.plan),
      selectedCabinetId: null,
    })
    syncHistoryFlags()
    queueMicrotask(() => {
      silenceHistory = false
    })
  }

  function persistNow() {
    const saved = persistActivePlan(
      projectId.value,
      projectName.value,
      plan.value,
      projectCreatedAt.value,
    )
    projectUpdatedAt.value = saved.updatedAt
    refreshProjectList()
    writePlanToUrl(plan.value, projectName.value)
  }

  function schedulePersist() {
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

  function commitHistoryNow() {
    if (silenceHistory || coalescing) return
    history.push(snapshot())
    syncHistoryFlags()
  }

  /** Debounced History – fasst schnelle Eingaben zusammen */
  function scheduleHistoryCommit() {
    if (silenceHistory) return
    if (coalescing) {
      if (!coalescingStarted) {
        history.push(snapshot())
        coalescingStarted = true
        syncHistoryFlags()
      } else {
        history.replaceLast(snapshot())
      }
      return
    }
    if (historyTimer) clearTimeout(historyTimer)
    historyTimer = setTimeout(() => {
      historyTimer = null
      commitHistoryNow()
    }, 350)
  }

  function flushHistoryCommit() {
    if (historyTimer) {
      clearTimeout(historyTimer)
      historyTimer = null
    }
    commitHistoryNow()
  }

  /** Drag starten: ein Undo-Schritt für die ganze Geste */
  function beginCoalesce() {
    flushHistoryCommit()
    coalescing = true
    coalescingStarted = false
  }

  function endCoalesce() {
    if (!coalescing) return
    coalescing = false
    coalescingStarted = false
    syncHistoryFlags()
  }

  watch(
    plan,
    () => {
      if (!silenceHistory) scheduleHistoryCommit()
      schedulePersist()
    },
    { deep: true },
  )

  history.reset(snapshot())
  syncHistoryFlags()
  persistNow()

  function undo() {
    flushHistoryCommit()
    endCoalesce()
    const snap = history.undo()
    if (!snap) return
    applySnapshot(snap)
    syncHistoryFlags()
    schedulePersist()
  }

  function redo() {
    flushHistoryCommit()
    endCoalesce()
    const snap = history.redo()
    if (!snap) return
    applySnapshot(snap)
    syncHistoryFlags()
    schedulePersist()
  }

  function onPopState() {
    const loaded = loadSharedFromUrl()
    if (!loaded) return
    flushHistoryCommit()
    silenceHistory = true
    plan.value = clonePlan(loaded.plan)
    if (loaded.name) {
      const result = renameProject(projectId.value, loaded.name)
      if (result.ok) {
        projectName.value = result.project.name
        projectUpdatedAt.value = result.project.updatedAt
      } else if (result.reason === 'taken') {
        // Namenskonflikt → eindeutige Variante setzen
        const unique = allocateUniqueName(loaded.name, projectId.value)
        const retry = renameProject(projectId.value, unique)
        if (retry.ok) {
          projectName.value = retry.project.name
          projectUpdatedAt.value = retry.project.updatedAt
        }
      }
    }
    selectedCabinetId.value = null
    // URL-Navigation als neuer History-Schritt
    history.push(snapshot())
    syncHistoryFlags()
    queueMicrotask(() => {
      silenceHistory = false
      persistNow()
    })
  }

  function isEditableTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false
    const tag = target.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
    if (target.isContentEditable) return true
    return !!target.closest('input, textarea, select, [contenteditable="true"]')
  }

  function onKeyDown(event: KeyboardEvent) {
    if (isEditableTarget(event.target)) return
    const mod = event.ctrlKey || event.metaKey
    if (!mod) return
    const key = event.key.toLowerCase()
    if (key === 'z' && !event.shiftKey) {
      event.preventDefault()
      undo()
    } else if (key === 'y' || (key === 'z' && event.shiftKey)) {
      event.preventDefault()
      redo()
    }
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('popstate', onPopState)
    window.addEventListener('keydown', onKeyDown)
  }

  function setShareStatus(msg: string | null) {
    if (shareStatusTimer) {
      clearTimeout(shareStatusTimer)
      shareStatusTimer = null
    }
    shareStatus.value = msg
    if (msg) {
      shareStatusTimer = setTimeout(() => {
        shareStatus.value = null
        shareStatusTimer = null
      }, 2000)
    }
  }

  async function copyShareLink(): Promise<boolean> {
    flushHistoryCommit()
    flushPersist()
    const url = buildShareUrl(plan.value, projectName.value)
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url)
      } else {
        // Fallback ohne Clipboard-API
        const ta = document.createElement('textarea')
        ta.value = url
        ta.setAttribute('readonly', '')
        ta.style.position = 'fixed'
        ta.style.left = '-9999px'
        document.body.appendChild(ta)
        ta.select()
        const ok = document.execCommand('copy')
        document.body.removeChild(ta)
        if (!ok) throw new Error('copy failed')
      }
      setShareStatus('Link kopiert')
      return true
    } catch {
      setShareStatus('Kopieren fehlgeschlagen')
      return false
    }
  }

  onUnmounted(() => {
    if (typeof window === 'undefined') return
    window.removeEventListener('popstate', onPopState)
    window.removeEventListener('keydown', onKeyDown)
    if (persistTimer) clearTimeout(persistTimer)
    if (historyTimer) clearTimeout(historyTimer)
    if (shareStatusTimer) clearTimeout(shareStatusTimer)
  })

  function addCabinet(cabinet: Cabinet) {
    flushHistoryCommit()
    plan.value.cabinets.push(cabinet)
    selectedCabinetId.value = cabinet.id
  }

  function removeCabinet(id: string) {
    flushHistoryCommit()
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

  function resetPlan() {
    flushHistoryCommit()
    plan.value = getDefaultPlan()
    selectedCabinetId.value = null
  }

  function shiftCabinets(direction: 'left' | 'right') {
    flushHistoryCommit()
    plan.value.cabinets = packValidCabinets(
      plan.value.cabinets,
      plan.value.room,
      direction,
    )
  }

  function clearNameError() {
    nameError.value = null
  }

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
    writePlanToUrl(plan.value, projectName.value)
    return true
  }

  function newProject() {
    flushHistoryCommit()
    flushPersist()
    const created = createNewProject(DEFAULT_PROJECT_NAME)
    applyProject(created)
  }

  function copyProject() {
    flushHistoryCommit()
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

  function openProject(id: string): boolean {
    if (id === projectId.value) return true
    flushHistoryCommit()
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
    canUndo,
    canRedo,
    shareStatus,
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
    undo,
    redo,
    beginCoalesce,
    endCoalesce,
    copyShareLink,
  }
}
