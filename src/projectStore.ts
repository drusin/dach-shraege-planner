import type { Plan, Project, ProjectSummary } from './types'
import { t } from './i18n'
import { getDefaultPlan } from './urlState'

const STORAGE_KEY = 'dach-schraege-planner:projects:v1'
const ACTIVE_KEY = 'dach-schraege-planner:active-project-id'

interface StoreData {
  v: 1
  projects: Project[]
}

function cloneRoom(plan: Plan): Plan['room'] {
  return {
    p1: { ...plan.room.p1 },
    p2: { ...plan.room.p2 },
    p3: { ...plan.room.p3 },
    p4: { ...plan.room.p4 },
  }
}

export function clonePlan(plan: Plan): Plan {
  return {
    room: cloneRoom(plan),
    cabinets: plan.cabinets.map((c) => ({ ...c })),
  }
}

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function readStore(): StoreData {
  if (!canUseStorage()) return { v: 1, projects: [] }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return { v: 1, projects: [] }
    const parsed = JSON.parse(raw) as StoreData
    if (!parsed || parsed.v !== 1 || !Array.isArray(parsed.projects)) {
      return { v: 1, projects: [] }
    }
    return {
      v: 1,
      projects: parsed.projects
        .filter((p) => p && typeof p.id === 'string' && typeof p.name === 'string' && p.plan)
        .map((p) => ({
          id: p.id,
          name: p.name,
          plan: clonePlan(p.plan),
          updatedAt: typeof p.updatedAt === 'number' ? p.updatedAt : Date.now(),
          createdAt: typeof p.createdAt === 'number' ? p.createdAt : Date.now(),
        })),
    }
  } catch {
    return { v: 1, projects: [] }
  }
}

function writeStore(data: StoreData): void {
  if (!canUseStorage()) return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {
    // Quota / private mode – still keep in-memory behaviour via caller
  }
}

function readActiveId(): string | null {
  if (!canUseStorage()) return null
  try {
    return window.localStorage.getItem(ACTIVE_KEY)
  } catch {
    return null
  }
}

function writeActiveId(id: string): void {
  if (!canUseStorage()) return
  try {
    window.localStorage.setItem(ACTIVE_KEY, id)
  } catch {
    // ignore
  }
}

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `proj-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

/** Normalisiert Namen (trim); leere Strings → null */
export function normalizeProjectName(name: string): string | null {
  const trimmed = name.trim().replace(/\s+/g, ' ')
  return trimmed.length > 0 ? trimmed : null
}

/** Case-insensitive Unique-Check; excludeId = aktuelles Projekt beim Umbenennen */
export function isProjectNameTaken(
  name: string,
  excludeId?: string | null,
  projects?: Project[],
): boolean {
  const normalized = normalizeProjectName(name)
  if (!normalized) return false
  const list = projects ?? readStore().projects
  const lower = normalized.toLowerCase()
  return list.some(
    (p) => p.id !== excludeId && p.name.trim().toLowerCase() === lower,
  )
}

/**
 * Liefert einen eindeutigen Namen.
 * - base frei → base
 * - sonst base 2, base 3, …
 */
export function allocateUniqueName(
  base: string,
  excludeId?: string | null,
  projects?: Project[],
): string {
  const list = projects ?? readStore().projects
  const normalized = normalizeProjectName(base) ?? t('default_project_name')
  if (!isProjectNameTaken(normalized, excludeId, list)) return normalized

  // Wenn base schon auf " Name N" endet, Stamm ohne Index nutzen
  const stemMatch = normalized.match(/^(.*?)(?:\s+(\d+))?$/)
  const stem = (stemMatch?.[1] ?? normalized).trim() || t('default_project_name')

  let n = 2
  while (isProjectNameTaken(`${stem} ${n}`, excludeId, list)) {
    n += 1
    if (n > 10_000) return `${stem} ${Date.now()}`
  }
  return `${stem} ${n}`
}

export function listProjectSummaries(): ProjectSummary[] {
  return readStore()
    .projects.map((p) => ({
      id: p.id,
      name: p.name,
      updatedAt: p.updatedAt,
      createdAt: p.createdAt,
      cabinetCount: p.plan.cabinets?.length ?? 0,
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export function getProject(id: string): Project | null {
  const found = readStore().projects.find((p) => p.id === id)
  return found
    ? {
        ...found,
        plan: clonePlan(found.plan),
      }
    : null
}

export function getActiveProjectId(): string | null {
  return readActiveId()
}

/** Speichert / aktualisiert ein Projekt und setzt es aktiv */
export function saveProject(project: Project): Project {
  const data = readStore()
  const now = Date.now()
  const next: Project = {
    id: project.id,
    name: project.name,
    plan: clonePlan(project.plan),
    createdAt: project.createdAt || now,
    updatedAt: now,
  }

  const idx = data.projects.findIndex((p) => p.id === next.id)
  if (idx >= 0) {
    data.projects[idx] = {
      ...next,
      createdAt: data.projects[idx].createdAt || next.createdAt,
    }
  } else {
    data.projects.push(next)
  }

  writeStore(data)
  writeActiveId(next.id)
  return { ...next, plan: clonePlan(next.plan) }
}

/** Nur Name ändern (unique); gibt null bei Konflikt/leer zurück */
export function renameProject(
  id: string,
  rawName: string,
): { ok: true; project: Project } | { ok: false; reason: 'empty' | 'taken' | 'missing' } {
  const name = normalizeProjectName(rawName)
  if (!name) return { ok: false, reason: 'empty' }

  const data = readStore()
  const idx = data.projects.findIndex((p) => p.id === id)
  if (idx < 0) return { ok: false, reason: 'missing' }

  if (isProjectNameTaken(name, id, data.projects)) {
    return { ok: false, reason: 'taken' }
  }

  const now = Date.now()
  const updated: Project = {
    ...data.projects[idx],
    name,
    updatedAt: now,
    plan: clonePlan(data.projects[idx].plan),
  }
  data.projects[idx] = updated
  writeStore(data)
  return { ok: true, project: { ...updated, plan: clonePlan(updated.plan) } }
}

/** Neues leeres Projekt (Defaults), bisherige bleiben gespeichert */
export function createNewProject(preferredName = t('default_project_name')): Project {
  const data = readStore()
  const name = allocateUniqueName(preferredName, null, data.projects)
  const now = Date.now()
  const project: Project = {
    id: newId(),
    name,
    plan: getDefaultPlan(),
    createdAt: now,
    updatedAt: now,
  }
  data.projects.push(project)
  writeStore(data)
  writeActiveId(project.id)
  return { ...project, plan: clonePlan(project.plan) }
}

/**
 * Kopie des aktuellen Projekts.
 * Name: "Original 2", "Original 3", … – Original bleibt unverändert.
 */
export function duplicateProject(source: Project): Project {
  const data = readStore()
  const name = allocateUniqueName(source.name, null, data.projects)
  const now = Date.now()
  const project: Project = {
    id: newId(),
    name,
    plan: clonePlan(source.plan),
    // frische Cabinet-IDs vermeiden Kollisionen beim parallelen Bearbeiten
    createdAt: now,
    updatedAt: now,
  }
  // Cabinet-IDs neu vergeben
  project.plan = {
    room: cloneRoom(project.plan),
    cabinets: project.plan.cabinets.map((c) => ({
      ...c,
      id: newId(),
    })),
  }

  data.projects.push(project)
  writeStore(data)
  writeActiveId(project.id)
  return { ...project, plan: clonePlan(project.plan) }
}

/** Projekt laden und als aktiv setzen */
export function loadProject(id: string): Project | null {
  const project = getProject(id)
  if (!project) return null
  writeActiveId(project.id)
  return project
}

/** Löscht ein Projekt aus dem Store; true wenn es existierte */
export function deleteProject(id: string): boolean {
  const data = readStore()
  const idx = data.projects.findIndex((p) => p.id === id)
  if (idx < 0) return false
  data.projects.splice(idx, 1)
  writeStore(data)
  if (readActiveId() === id) {
    writeActiveId('')
  }
  return true
}

export interface BootstrapShare {
  plan: Plan
  /** optionaler Projektname aus dem Share-Link */
  name?: string | null
}

/**
 * Bootstrap:
 * 1) aktives Projekt aus localStorage
 * 2) sonst neuestes Projekt
 * 3) sonst neues Default-Projekt
 * Optional: Share-Link überschreibt Plan (und ggf. Name) des aktiven/neuen Projekts.
 * Bei Namenskonflikt wird ein eindeutiger Name vergeben ("Name 2", …).
 */
function isBootstrapShare(value: BootstrapShare | Plan): value is BootstrapShare {
  return (
    typeof value === 'object' &&
    value !== null &&
    'plan' in value &&
    typeof (value as BootstrapShare).plan === 'object' &&
    (value as BootstrapShare).plan !== null &&
    'room' in (value as BootstrapShare).plan
  )
}

export function bootstrapProject(shareFromUrl: BootstrapShare | Plan | null): Project {
  // Abwärtskompatibel: reiner Plan oder { plan, name }
  const share: BootstrapShare | null = !shareFromUrl
    ? null
    : isBootstrapShare(shareFromUrl)
      ? shareFromUrl
      : { plan: shareFromUrl }

  const data = readStore()
  const activeId = readActiveId()
  let project =
    (activeId ? data.projects.find((p) => p.id === activeId) : null) ??
    (data.projects.length
      ? [...data.projects].sort((a, b) => b.updatedAt - a.updatedAt)[0]
      : null)

  const sharedName = normalizeProjectName(share?.name ?? '')

  if (!project) {
    const preferred = sharedName ?? t('default_project_name')
    const created = createNewProject(preferred)
    if (share) {
      return saveProject({
        ...created,
        // createNewProject hat schon unique Name gesetzt
        plan: clonePlan(share.plan),
      })
    }
    return created
  }

  if (share) {
    const nextName = sharedName
      ? allocateUniqueName(sharedName, project.id, data.projects)
      : project.name
    return saveProject({
      ...project,
      name: nextName,
      plan: clonePlan(share.plan),
    })
  }

  writeActiveId(project.id)
  return {
    ...project,
    plan: clonePlan(project.plan),
  }
}

/** Plan des aktiven Projekts speichern (Autosave) */
export function persistActivePlan(
  projectId: string,
  name: string,
  plan: Plan,
  createdAt: number,
): Project {
  return saveProject({
    id: projectId,
    name,
    plan,
    createdAt,
    updatedAt: Date.now(),
  })
}
