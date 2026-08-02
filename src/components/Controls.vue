<script setup lang="ts">
import { reactive, ref, computed, watch } from 'vue'
import type { RoomPoints, RoomPointKey, Cabinet, ProjectSummary } from '../types'
import { getVirtualCorners } from '../types'
import { t, roomPointLabel } from '../i18n'
import {
  validateCabinet,
  describeCabinetIssues,
  shortCabinetIssueLabel,
  resolveCabinetPlacement,
  type CabinetValidation,
  type SnapMode,
} from '../geometry'

const props = defineProps<{
  room: RoomPoints
  cabinets: Cabinet[]
  cabinetCount: number
  selectedCabinetId: string | null
  projectId: string
  projectName: string
  projectUpdatedAt: number
  projectList: ProjectSummary[]
  nameError: string | null
  canUndo: boolean
  canRedo: boolean
  shareStatus: string | null
  /** true = Raum-Sektion aufklappen (frisches Projekt / „Neu“) */
  preferRoomSectionOpen: boolean
}>()

const emit = defineEmits<{
  updateRoomPoint: [point: RoomPointKey, value: Partial<{ x: number; y: number }>]
  addCabinet: [cabinet: Cabinet]
  updateCabinet: [id: string, patch: Partial<Omit<Cabinet, 'id'>>]
  removeCabinet: [id: string]
  selectCabinet: [id: string | null]
  shiftCabinets: [direction: 'left' | 'right']
  reset: []
  setProjectName: [name: string]
  clearNameError: []
  newProject: []
  copyProject: []
  openProject: [id: string]
  refreshProjectList: []
  deleteProject: [id: string]
  undo: []
  redo: []
  copyShareLink: []
  closePanel: []
}>()

const nameDraft = ref(props.projectName)
const showLoadDialog = ref(false)
/** Bestätigungsdialog fürs Löschen: null = geschlossen, sonst das zu löschende Projekt */
const confirmDelete = ref<ProjectSummary | null>(null)
/** Raum-Sektion: zu, außer bei frischem Projekt */
const roomSectionOpen = ref(!!props.preferRoomSectionOpen)

// Bei Projektwechsel: aufklappen nur wenn frisches/neues Projekt, sonst zu
watch(
  () => [props.projectId, props.preferRoomSectionOpen] as const,
  ([, prefer]) => {
    roomSectionOpen.value = !!prefer
  },
)

function onShiftCabinets(direction: 'left' | 'right') {
  emit('shiftCabinets', direction)
  // Mobile: Menü nach dem Schieben schließen, damit das Ergebnis sichtbar ist
  if (typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches) {
    emit('closePanel')
  }
}

watch(
  () => props.projectName,
  (name) => {
    nameDraft.value = name
  },
)

function commitProjectName() {
  if (nameDraft.value.trim() === props.projectName) {
    nameDraft.value = props.projectName
    return
  }
  emit('setProjectName', nameDraft.value)
}

function onNameKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    ;(event.target as HTMLInputElement).blur()
  } else if (event.key === 'Escape') {
    nameDraft.value = props.projectName
    ;(event.target as HTMLInputElement).blur()
  }
}

watch(
  () => props.nameError,
  (err) => {
    if (err) nameDraft.value = props.projectName
  },
)

function openLoadDialog() {
  emit('refreshProjectList')
  showLoadDialog.value = true
}

function closeLoadDialog() {
  showLoadDialog.value = false
  confirmDelete.value = null
}

function askDeleteProject(p: ProjectSummary) {
  confirmDelete.value = p
}

function cancelDelete() {
  confirmDelete.value = null
}

function confirmDeleteProject() {
  if (!confirmDelete.value) return
  emit('deleteProject', confirmDelete.value.id)
  confirmDelete.value = null
}

function onLoadProject(id: string) {
  emit('openProject', id)
  showLoadDialog.value = false
}

function formatUpdatedAt(ts: number): string {
  if (!ts) return '–'
  try {
    return new Intl.DateTimeFormat('de-DE', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(ts))
  } catch {
    return new Date(ts).toLocaleString()
  }
}

const pointKeys: RoomPointKey[] = ['p1', 'p2', 'p3', 'p4']

const virtual = computed(() => getVirtualCorners(props.room))

/** Rechte Raumkante (PEnd.x) – Bezug für „x von rechts“ */
const roomRight = computed(() => virtual.value.pEnd.x)

/** x (links) ↔ x von rechts: right = roomRight - (x + width) */
function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function xFromRight(x: number, width: number): number {
  return round1(roomRight.value - (x + width))
}

function xFromLeftUsingRight(xRight: number, width: number): number {
  return round1(roomRight.value - width - xRight)
}

const selected = computed(
  () => props.cabinets.find((c) => c.id === props.selectedCabinetId) ?? null,
)

const selectedXRight = computed(() =>
  selected.value ? xFromRight(selected.value.x, selected.value.width) : 0,
)

function getValidation(cab: Cabinet): CabinetValidation {
  return validateCabinet(cab, props.room, props.cabinets)
}

const selectedValidation = computed(() =>
  selected.value ? getValidation(selected.value) : null,
)

const selectedInvalid = computed(() => selectedValidation.value?.invalid ?? false)

const selectedIssueText = computed(() =>
  selectedValidation.value ? describeCabinetIssues(selectedValidation.value) : '',
)

const invalidCount = computed(
  () => props.cabinets.filter((c) => getValidation(c).invalid).length,
)

/** Gültig, nicht fixiert → werden beim Schieben bewegt */
const movableCount = computed(
  () =>
    props.cabinets.filter((c) => !c.fixed && !getValidation(c).invalid).length,
)

const snapMode = ref<SnapMode>('left')

const newCabinet = reactive({
  label: t('cabinet_add.label'),
  width: 80,
  height: 180,
  x: 140,
  y: 0,
  color: '#2980b9',
})

const newCabinetXRight = computed({
  get: () => xFromRight(newCabinet.x, newCabinet.width),
  set: (right: number) => {
    if (!Number.isFinite(right)) return
    newCabinet.x = xFromLeftUsingRight(right, newCabinet.width)
  },
})

const manualPosition = computed(() => snapMode.value === 'none')

function parseNum(event: Event): number | null {
  const raw = (event.target as HTMLInputElement).value
  if (raw.trim() === '') return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

function onPointX(key: RoomPointKey, event: Event) {
  const n = parseNum(event)
  if (n === null) return
  emit('updateRoomPoint', key, { x: n })
}

function onPointY(key: RoomPointKey, event: Event) {
  const n = parseNum(event)
  if (n === null) return
  emit('updateRoomPoint', key, { y: Math.max(0, n) })
}

function onAddCabinet() {
  const draft = {
    id: crypto.randomUUID(),
    label: newCabinet.label,
    width: newCabinet.width,
    height: newCabinet.height,
    x: newCabinet.x,
    y: newCabinet.y,
    color: newCabinet.color,
  }

  const placed = resolveCabinetPlacement(
    draft,
    props.room,
    props.cabinets,
    snapMode.value,
  )

  emit('addCabinet', {
    ...draft,
    x: placed.x,
    y: placed.y,
  })
}

function copySelectedCabinet() {
  if (!props.selectedCabinetId) return
  const source = props.cabinets.find((c) => c.id === props.selectedCabinetId)
  if (!source) return

  const draft = {
    id: crypto.randomUUID(),
    label: source.label,
    width: source.width,
    height: source.height,
    x: source.x + 10,
    y: source.y,
    color: source.color,
  }

  const placed = resolveCabinetPlacement(
    draft,
    props.room,
    props.cabinets,
    snapMode.value,
  )

  emit('addCabinet', {
    ...draft,
    x: placed.x,
    y: placed.y,
  })
}

const snapModeLabel = computed(() => t(`snap_mode.${snapMode.value}`))

function patchSelected(patch: Partial<Omit<Cabinet, 'id'>>) {
  if (!props.selectedCabinetId) return
  emit('updateCabinet', props.selectedCabinetId, patch)
}

function onSelectedNum(
  field: 'width' | 'height' | 'x' | 'y',
  event: Event,
) {
  const n = parseNum(event)
  if (n === null) return
  patchSelected({ [field]: n })
}

/** „x von rechts“ → speichert intern weiterhin x von links */
function onSelectedXRight(event: Event) {
  if (!selected.value) return
  const n = parseNum(event)
  if (n === null) return
  patchSelected({ x: xFromLeftUsingRight(n, selected.value.width) })
}
</script>

<template>
  <div class="controls">
    <div class="mobile-bar">
      <h2 class="mobile-bar-title">{{ t('controls.title') }}</h2>
      <button
        type="button"
        class="btn-icon"
        :title="t('controls.close')"
        :aria-label="t('controls.close')"
        @click="emit('closePanel')"
      >
        ✕
      </button>
    </div>

    <section class="project-panel">
      <h2>{{ t('project.section') }}</h2>
      <div class="field project-name-field">
        <label for="project-name">{{ t('project.name') }}</label>
        <input
          id="project-name"
          v-model="nameDraft"
          type="text"
          maxlength="80"
          autocomplete="off"
          spellcheck="false"
          :class="{ error: !!nameError }"
          @input="emit('clearNameError')"
          @keydown="onNameKeydown"
          @blur="commitProjectName"
        />
        <p v-if="nameError" class="name-error">{{ nameError }}</p>
        <p v-else class="name-hint">
          {{ t('project.saved_hint', { updatedAt: formatUpdatedAt(projectUpdatedAt) }) }}
        </p>
      </div>
      <div class="project-actions">
        <button
          type="button"
          class="btn btn-project"
          :title="t('project.btn_new_title')"
          @click="emit('newProject')"
        >
          {{ t('project.btn_new') }}
        </button>
        <button
          type="button"
          class="btn btn-project"
          :title="t('project.btn_copy_title')"
          @click="emit('copyProject')"
        >
          {{ t('project.btn_copy') }}
        </button>
        <button
          type="button"
          class="btn btn-project"
          :title="t('project.btn_load_title')"
          @click="openLoadDialog"
        >
          {{ t('project.btn_load') }}
        </button>
      </div>
      <div class="history-actions">
        <button
          type="button"
          class="btn btn-history"
          :title="t('project.btn_undo_title')"
          :disabled="!canUndo"
          @click="emit('undo')"
        >
          {{ t('project.btn_undo') }}
        </button>
        <button
          type="button"
          class="btn btn-history"
          :title="t('project.btn_redo_title')"
          :disabled="!canRedo"
          @click="emit('redo')"
        >
          {{ t('project.btn_redo') }}
        </button>
      </div>
      <p class="history-hint">{{ t('project.history_hint') }}</p>
      <button
        type="button"
        class="btn btn-share"
        :title="t('project.btn_share_title')"
        @click="emit('copyShareLink')"
      >
        {{ t('project.btn_share') }}
      </button>
      <p v-if="shareStatus" class="share-status">{{ shareStatus }}</p>
    </section>

    <div v-if="showLoadDialog" class="modal-backdrop" @click.self="closeLoadDialog">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="load-title">
        <div class="modal-header">
          <h3 id="load-title">{{ t('load_dialog.title') }}</h3>
          <button type="button" class="btn-icon" :title="t('controls.close')" @click="closeLoadDialog">
            ✕
          </button>
        </div>
        <p class="modal-hint">
          {{ t('load_dialog.current_hint', { name: projectName }) }}
        </p>
        <ul v-if="projectList.length" class="project-list">
          <li
            v-for="p in projectList"
            :key="p.id"
            class="project-item"
            :class="{ current: p.id === projectId }"
          >
            <div class="project-meta">
              <strong>{{ p.name }}</strong>
              <small>
                {{ t('cabinet.count', { count: p.cabinetCount }) }} · {{ formatUpdatedAt(p.updatedAt) }}
                <span v-if="p.id === projectId"> · {{ t('load_dialog.current_badge') }}</span>
              </small>
            </div>
            <div class="project-item-actions">
              <button
                type="button"
                class="btn btn-load-one"
                :disabled="p.id === projectId"
                @click="onLoadProject(p.id)"
              >
                {{ p.id === projectId ? t('load_dialog.active') : t('load_dialog.open') }}
              </button>
              <button
                type="button"
                class="btn btn-delete-one"
                :title="t('load_dialog.delete_title')"
                @click="askDeleteProject(p)"
              >
                🗑
              </button>
            </div>
          </li>
        </ul>
        <p v-else class="empty">{{ t('load_dialog.empty') }}</p>
        <button type="button" class="btn btn-modal-close" @click="closeLoadDialog">
          {{ t('load_dialog.btn_close') }}
        </button>
      </div>
    </div>

    <!-- Bestätigungsdialog: Projekt löschen -->
    <div v-if="confirmDelete" class="modal-backdrop" @click.self="cancelDelete">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="delete-title">
        <div class="modal-header">
          <h3 id="delete-title">{{ t('delete_dialog.title') }}</h3>
          <button type="button" class="btn-icon" :title="t('controls.close')" @click="cancelDelete">
            ✕
          </button>
        </div>
        <p class="modal-hint">
          {{ t('delete_dialog.confirm_hint', { name: confirmDelete.name }) }}
        </p>
        <div class="modal-actions-row">
          <button type="button" class="btn btn-modal-close" @click="cancelDelete">
            {{ t('delete_dialog.btn_cancel') }}
          </button>
          <button
            type="button"
            class="btn btn-delete-confirm"
            @click="confirmDeleteProject"
          >
            {{ t('delete_dialog.btn_delete') }}
          </button>
        </div>
      </div>
    </div>

    <hr />

    <section class="collapsible-section">
      <button
        type="button"
        class="section-toggle"
        :aria-expanded="roomSectionOpen"
        aria-controls="room-section-body"
        @click="roomSectionOpen = !roomSectionOpen"
      >
        <h2>{{ t('room.section') }}</h2>
        <span class="section-chevron" aria-hidden="true">{{ roomSectionOpen ? '▾' : '▸' }}</span>
      </button>

      <div v-show="roomSectionOpen" id="room-section-body" class="section-body">
        <p class="hint" v-html="t('room.path_hint')" />

        <div class="diagram" aria-hidden="true">
          <svg viewBox="0 0 160 80" width="100%" height="80">
            <rect x="0" y="62" width="160" height="18" fill="#8b5a2b" />
            <polygon
              points="12,62 12,48 40,12 100,12 128,48 128,62"
              fill="#fff8e6"
              stroke="#2c3e50"
              stroke-width="1.5"
            />
            <line x1="12" y1="62" x2="12" y2="48" stroke="#2c3e50" stroke-width="2.5" />
            <line x1="12" y1="48" x2="40" y2="12" stroke="#c0392b" stroke-width="3" />
            <line x1="40" y1="12" x2="100" y2="12" stroke="#2c3e50" stroke-width="2.5" />
            <line x1="100" y1="12" x2="128" y2="48" stroke="#c0392b" stroke-width="3" />
            <line x1="128" y1="48" x2="128" y2="62" stroke="#2c3e50" stroke-width="2.5" />
            <circle cx="12" cy="62" r="3.5" fill="#7f8c8d" />
            <circle cx="12" cy="48" r="3.5" fill="#e74c3c" />
            <circle cx="40" cy="12" r="3.5" fill="#e74c3c" />
            <circle cx="100" cy="12" r="3.5" fill="#e74c3c" />
            <circle cx="128" cy="48" r="3.5" fill="#e74c3c" />
            <circle cx="128" cy="62" r="3.5" fill="#7f8c8d" />
            <text x="16" y="70" font-size="8" fill="#555">P0</text>
            <text x="16" y="50" font-size="8" fill="#333" font-weight="bold">P1</text>
            <text x="42" y="10" font-size="8" fill="#333" font-weight="bold">P2</text>
            <text x="102" y="10" font-size="8" fill="#333" font-weight="bold">P3</text>
            <text x="132" y="50" font-size="8" fill="#333" font-weight="bold">P4</text>
            <text x="132" y="70" font-size="8" fill="#555">PEnd</text>
          </svg>
        </div>

        <div class="point-group virtual">
          <h3><span class="badge grey">P0</span> {{ t('room.virtual_bottom_left') }}</h3>
          <div class="readonly">{{ t('room.readonly_virtual', { x: virtual.p0.x }) }}</div>
        </div>

        <div v-for="key in pointKeys" :key="key" class="point-group">
          <h3>
            <span class="badge">{{ key.toUpperCase() }}</span>
            {{ roomPointLabel(key) }}
          </h3>
          <div class="field-row">
            <div class="field">
              <label>{{ t('room.label_x') }}</label>
              <input
                type="number"
                :value="room[key].x"
                step="5"
                @change="onPointX(key, $event)"
                @blur="onPointX(key, $event)"
              />
            </div>
            <div class="field">
              <label>{{ t('room.label_y') }}</label>
              <input
                type="number"
                :value="room[key].y"
                min="0"
                step="5"
                @change="onPointY(key, $event)"
                @blur="onPointY(key, $event)"
              />
            </div>
          </div>
        </div>

        <div class="point-group virtual">
          <h3><span class="badge grey">PEnd</span> {{ t('room.virtual_bottom_right') }}</h3>
          <div class="readonly">{{ t('room.readonly_virtual', { x: virtual.pEnd.x }) }}</div>
        </div>
      </div>
    </section>

    <hr />

    <h2>{{ t('cabinet.section') }}</h2>

    <div class="shift-row">
      <button
        type="button"
        class="btn btn-shift"
        :disabled="movableCount === 0"
        :title="t('cabinet.shift_left_title')"
        @click="onShiftCabinets('left')"
      >
        {{ t('cabinet.shift_left') }}
      </button>
      <button
        type="button"
        class="btn btn-shift"
        :disabled="movableCount === 0"
        :title="t('cabinet.shift_right_title')"
        @click="onShiftCabinets('right')"
      >
        {{ t('cabinet.shift_right') }}
      </button>
    </div>
    <p v-if="movableCount > 0" class="shift-hint">
      {{ t('cabinet.shift_hint', { count: movableCount }) }}
    </p>

    <div v-if="cabinets.length === 0" class="empty">{{ t('cabinet.empty') }}</div>

    <ul v-else class="cabinet-list">
      <li
        v-for="cab in cabinets"
        :key="cab.id"
        class="cabinet-item"
        :class="{
          active: cab.id === selectedCabinetId,
          invalid: getValidation(cab).invalid,
          fixed: !!cab.fixed,
        }"
        @click="emit('selectCabinet', cab.id)"
      >
        <span class="swatch" :style="{ background: cab.color }" />
        <span class="cab-meta">
          <strong>
            {{ cab.label }}
            <span v-if="cab.fixed" class="fixed-tag">{{ t('cabinet.fixed_tag') }}</span>
            <span v-if="getValidation(cab).invalid" class="invalid-tag">
              {{ shortCabinetIssueLabel(getValidation(cab)) || t('cabinet.invalid_tag') }}
            </span>
          </strong>
          <small>{{ cab.width }}×{{ cab.height }} cm · x={{ cab.x }}</small>
        </span>
        <button
          type="button"
          class="btn-icon"
          :title="t('cabinet.delete_title')"
          @click.stop="emit('removeCabinet', cab.id)"
        >
          ✕
        </button>
      </li>
    </ul>

    <!-- Bearbeitung des gewählten Schranks -->
    <div
      v-if="selected"
      class="edit-panel"
      :class="{ invalid: selectedInvalid, fixed: !!selected.fixed }"
    >
      <h3>{{ t('cabinet_edit.title') }}</h3>
      <p v-if="selectedInvalid" class="invalid-msg">
        {{ t('cabinet_edit.invalid_msg', { reason: selectedIssueText }) }}
      </p>
      <label class="check fixed-toggle">
        <input
          type="checkbox"
          :checked="!!selected.fixed"
          @change="patchSelected({ fixed: ($event.target as HTMLInputElement).checked })"
        />
        {{ t('cabinet_edit.fixed_label') }}
      </label>
      <p v-if="selected.fixed" class="fixed-msg">
        {{ t('cabinet_edit.fixed_msg') }}
      </p>
      <div class="field">
        <label>{{ t('cabinet_edit.label') }}</label>
        <input
          type="text"
          :value="selected.label"
          @input="patchSelected({ label: ($event.target as HTMLInputElement).value })"
        />
      </div>
      <div class="field-row">
        <div class="field">
          <label>{{ t('cabinet_edit.width') }}</label>
          <input
            type="number"
            :value="selected.width"
            min="1"
            step="1"
            :disabled="!!selected.fixed"
            @change="onSelectedNum('width', $event)"
            @blur="onSelectedNum('width', $event)"
          />
        </div>
        <div class="field">
          <label>{{ t('cabinet_edit.height') }}</label>
          <input
            type="number"
            :value="selected.height"
            min="1"
            step="1"
            :disabled="!!selected.fixed"
            @change="onSelectedNum('height', $event)"
            @blur="onSelectedNum('height', $event)"
          />
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label>{{ t('cabinet_edit.x_left') }}</label>
          <input
            type="number"
            :value="selected.x"
            step="1"
            :disabled="!!selected.fixed"
            @change="onSelectedNum('x', $event)"
            @blur="onSelectedNum('x', $event)"
          />
        </div>
        <div class="field">
          <label>{{ t('cabinet_edit.x_right') }}</label>
          <input
            type="number"
            :value="selectedXRight"
            step="1"
            :disabled="!!selected.fixed"
            @change="onSelectedXRight($event)"
            @blur="onSelectedXRight($event)"
          />
        </div>
      </div>
      <div class="field">
        <label>{{ t('cabinet_edit.y') }}</label>
        <input
          type="number"
          :value="selected.y"
          min="0"
          step="1"
          :disabled="!!selected.fixed"
          @change="onSelectedNum('y', $event)"
          @blur="onSelectedNum('y', $event)"
        />
      </div>
      <div class="field">
        <label>{{ t('cabinet_edit.color') }}</label>
        <input
          type="color"
          :value="selected.color"
          @input="patchSelected({ color: ($event.target as HTMLInputElement).value })"
        />
      </div>
      <button
        type="button"
        class="btn btn-copy"
        :title="t('cabinet_edit.btn_copy_title')"
        @click="copySelectedCabinet"
      >
        {{ t('cabinet_edit.btn_copy') }}
      </button>
      <p class="copy-hint" v-html="t('cabinet_edit.copy_hint', { snapMode: snapModeLabel })" />
      <button
        type="button"
        class="btn btn-delete"
        @click="emit('removeCabinet', selected.id)"
      >
        {{ t('cabinet_edit.btn_delete') }}
      </button>
    </div>

    <hr />

    <h2>{{ t('cabinet_add.section') }}</h2>

    <fieldset class="snap-group">
      <legend>{{ t('cabinet_add.positioning') }}</legend>
      <label class="radio">
        <input v-model="snapMode" type="radio" value="none" />
        {{ t('cabinet_add.snap_none') }}
      </label>
      <label class="radio">
        <input v-model="snapMode" type="radio" value="left" />
        {{ t('cabinet_add.snap_left') }}
      </label>
      <label class="radio">
        <input v-model="snapMode" type="radio" value="right" />
        {{ t('cabinet_add.snap_right') }}
      </label>
      <p class="snap-hint">
        <template v-if="snapMode === 'none'">{{ t('cabinet_add.snap_hint_none') }}</template>
        <template v-else-if="snapMode === 'left'">{{ t('cabinet_add.snap_hint_left') }}</template>
        <template v-else>{{ t('cabinet_add.snap_hint_right') }}</template>
        {{ t('cabinet_add.snap_hint_fallback') }}
      </p>
    </fieldset>

    <div class="field">
      <label>{{ t('cabinet_add.label') }}</label>
      <input v-model="newCabinet.label" type="text" />
    </div>
    <div class="field-row">
      <div class="field">
        <label>{{ t('cabinet_add.width') }}</label>
        <input v-model.number="newCabinet.width" type="number" min="1" step="1" />
      </div>
      <div class="field">
        <label>{{ t('cabinet_add.height') }}</label>
        <input v-model.number="newCabinet.height" type="number" min="1" step="1" />
      </div>
    </div>
    <div class="field-row">
      <div class="field">
        <label>{{ t('cabinet_add.x_left') }}</label>
        <input
          v-model.number="newCabinet.x"
          type="number"
          step="1"
          :disabled="!manualPosition"
        />
      </div>
      <div class="field">
        <label>{{ t('cabinet_add.x_right') }}</label>
        <input
          v-model.number="newCabinetXRight"
          type="number"
          step="1"
          :disabled="!manualPosition"
        />
      </div>
    </div>
    <div class="field">
      <label>{{ t('cabinet_add.y') }}</label>
      <input v-model.number="newCabinet.y" type="number" min="0" step="1" />
    </div>
    <div class="field">
      <label>{{ t('cabinet_add.color') }}</label>
      <input v-model="newCabinet.color" type="color" />
    </div>
    <button class="btn btn-add" type="button" @click="onAddCabinet">{{ t('cabinet_add.btn_add') }}</button>

    <hr />

    <div class="actions">
      <span class="cabinet-count">
        {{ t('cabinet.count', { count: cabinetCount }) }}
        <template v-if="invalidCount > 0">
          · <span class="invalid-count">{{ t('cabinet.invalid_count', { count: invalidCount }) }}</span>
        </template>
      </span>
      <button class="btn btn-reset" type="button" @click="emit('reset')">{{ t('cabinet.btn_reset') }}</button>
    </div>
  </div>
</template>

<style scoped>
.controls {
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 18px;
  width: 320px;
  flex-shrink: 0;
  font-size: 14px;
  max-height: calc(100vh - 120px);
  max-height: calc(100dvh - 120px);
  overflow-y: auto;
  overflow-x: hidden;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
}

@media (max-width: 900px) {
  .controls {
    width: 100%;
    max-width: none;
    height: 100%;
    max-height: none;
    border: none;
    border-radius: 0;
    padding: 12px 16px 28px;
  }

  .mobile-bar {
    display: flex;
  }
}

h2 {
  margin: 0 0 4px;
  font-size: 16px;
  color: #2c3e50;
}

.collapsible-section {
  margin: 0;
}

.section-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  margin: 0;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  text-align: left;
  color: inherit;
  font: inherit;
}

.section-toggle h2 {
  margin: 0;
  flex: 1;
}

.section-chevron {
  flex-shrink: 0;
  font-size: 14px;
  color: #7f8c8d;
  line-height: 1;
}

.section-body {
  margin-top: 4px;
}

h3 {
  margin: 0 0 8px;
  font-size: 12px;
  color: #444;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
}

.badge {
  background: #e74c3c;
  color: #fff;
  border-radius: 4px;
  padding: 1px 6px;
  font-size: 11px;
}

.badge.grey {
  background: #7f8c8d;
}

.hint {
  font-size: 12px;
  color: #888;
  margin: 0 0 12px;
  line-height: 1.45;
}

.diagram {
  background: #7ec8e3;
  border-radius: 6px;
  padding: 4px 4px 0;
  margin-bottom: 14px;
  border: 2px solid #2c3e50;
}

.point-group {
  background: #f7f8fa;
  border-radius: 6px;
  padding: 10px 12px;
  margin-bottom: 8px;
  border-left: 3px solid #e74c3c;
}

.point-group.virtual {
  border-left-color: #7f8c8d;
  background: #f0f0f0;
}

.readonly {
  font-size: 12px;
  color: #666;
  font-family: ui-monospace, monospace;
}

.empty {
  font-size: 12px;
  color: #999;
  margin: 8px 0 12px;
}

.shift-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 8px 0 6px;
}

.btn-shift {
  flex: 1 1 120px;
  background: #34495e;
  color: #fff;
  padding: 10px 6px;
  font-size: 12px;
}
.btn-shift:hover:not(:disabled) {
  background: #2c3e50;
}
.btn-shift:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.shift-hint {
  margin: 0 0 10px;
  font-size: 11px;
  color: #888;
  line-height: 1.35;
}

.cabinet-list {
  list-style: none;
  margin: 10px 0 12px;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.cabinet-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 10px;
  min-height: 48px;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  cursor: pointer;
  background: #fafafa;
  transition: border-color 0.15s, background 0.15s;
  -webkit-tap-highlight-color: transparent;
}

.cabinet-item:hover {
  border-color: #2980b9;
}

.cabinet-item.active {
  border-color: #f1c40f;
  background: #fffbea;
  box-shadow: inset 0 0 0 1px #f1c40f;
}

.cabinet-item.invalid {
  border-color: #e74c3c;
  background: #fdecea;
}

.cabinet-item.invalid.active {
  border-color: #c0392b;
  box-shadow: inset 0 0 0 1px #c0392b;
}

.cabinet-item.fixed {
  border-style: dashed;
}

.fixed-tag {
  display: inline-block;
  margin-left: 6px;
  padding: 0 5px;
  border-radius: 3px;
  background: #7f8c8d;
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  vertical-align: middle;
  text-transform: uppercase;
}

.check.fixed-toggle {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 0 10px;
  padding: 8px 0;
  min-height: 44px;
  font-size: 13px;
  font-weight: 600;
  color: #2c3e50;
  cursor: pointer;
  text-transform: none;
}

.check.fixed-toggle input {
  width: auto;
  margin: 0;
  accent-color: #7f8c8d;
}

.fixed-msg {
  margin: 0 0 10px;
  padding: 8px 10px;
  border-radius: 4px;
  background: #eaecee;
  color: #4d5656;
  font-size: 12px;
  line-height: 1.35;
}

.edit-panel.fixed {
  border-color: #95a5a6;
}

.invalid-tag {
  display: inline-block;
  margin-left: 6px;
  padding: 0 5px;
  border-radius: 3px;
  background: #e74c3c;
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  vertical-align: middle;
  text-transform: uppercase;
}

.invalid-msg {
  margin: 0 0 10px;
  padding: 8px 10px;
  border-radius: 4px;
  background: #f5b7b1;
  color: #7b241c;
  font-size: 12px;
  line-height: 1.35;
}

.edit-panel.invalid {
  border-color: #e74c3c;
  background: #fdf2f1;
}

.invalid-count {
  color: #c0392b;
  font-weight: 700;
}

.swatch {
  width: 14px;
  height: 14px;
  border-radius: 3px;
  border: 1px solid rgba(0, 0, 0, 0.15);
  flex-shrink: 0;
}

.cab-meta {
  display: flex;
  flex-direction: column;
  gap: 1px;
  flex: 1;
  min-width: 0;
}

.cab-meta strong {
  font-size: 13px;
  color: #2c3e50;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cab-meta small {
  font-size: 11px;
  color: #888;
}

.btn-icon {
  border: none;
  background: transparent;
  color: #999;
  cursor: pointer;
  font-size: 16px;
  padding: 8px;
  min-width: 40px;
  min-height: 40px;
  border-radius: 4px;
  line-height: 1;
  flex-shrink: 0;
  -webkit-tap-highlight-color: transparent;
}
.btn-icon:hover {
  background: #fdecea;
  color: #c0392b;
}

.edit-panel {
  background: #fffbea;
  border: 1px solid #f1c40f;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 8px;
}

.edit-panel h3 {
  margin-bottom: 10px;
  color: #2c3e50;
  font-size: 13px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-bottom: 8px;
}

.field-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.field-row .field {
  flex: 1 1 120px;
  margin-bottom: 0;
  min-width: 120px;
}

label {
  font-size: 11px;
  color: #666;
  font-weight: 600;
  text-transform: uppercase;
}

input {
  padding: 8px 10px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 13px;
  font-family: inherit;
  width: 100%;
  min-height: 40px;
}

input[type='color'] {
  height: 44px;
  min-height: 44px;
  padding: 2px;
  cursor: pointer;
}

input[type='checkbox'],
input[type='radio'] {
  min-height: 0;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

hr {
  border: none;
  border-top: 1px solid #eee;
  margin: 16px 0;
}

.btn {
  width: 100%;
  padding: 12px 10px;
  min-height: 44px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.15s;
  -webkit-tap-highlight-color: transparent;
}

.snap-group {
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  padding: 10px 12px 8px;
  margin: 0 0 12px;
  background: #f7f8fa;
}

.snap-group legend {
  padding: 0 4px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  color: #666;
}

.radio {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: #333;
  margin-bottom: 4px;
  padding: 8px 0;
  min-height: 40px;
  cursor: pointer;
  text-transform: none;
  font-weight: 500;
}

.radio input {
  width: auto;
  margin: 0;
  accent-color: #2980b9;
}

.snap-hint {
  margin: 6px 0 0;
  font-size: 11px;
  color: #888;
  line-height: 1.35;
}

input:disabled {
  background: #eee;
  color: #999;
  cursor: not-allowed;
}

.btn-add {
  background: #2980b9;
  color: #fff;
  margin-top: 4px;
}
.btn-add:hover {
  background: #2471a3;
}

.btn-copy {
  background: #d5e8d4;
  color: #1e6b3b;
  margin-top: 4px;
}
.btn-copy:hover {
  background: #27ae60;
  color: #fff;
}

.copy-hint {
  margin: 4px 0 12px;
  font-size: 11px;
  color: #666;
  line-height: 1.4;
}

.btn-delete {
  background: #f5b7b1;
  color: #922b21;
  margin-top: 4px;
}
.btn-delete:hover {
  background: #e74c3c;
  color: #fff;
}

.btn-reset {
  background: #e74c3c;
  color: #fff;
}
.btn-reset:hover {
  background: #c0392b;
}

.actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cabinet-count {
  font-size: 12px;
  color: #888;
}

/* --- Projekt --- */
.project-panel {
  margin-bottom: 4px;
}

.project-name-field input.error {
  border-color: #e74c3c;
  background: #fdf2f1;
}

.name-error {
  margin: 4px 0 0;
  font-size: 11px;
  color: #c0392b;
  font-weight: 600;
}

.name-hint {
  margin: 4px 0 0;
  font-size: 11px;
  color: #888;
}

.project-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}

.btn-project {
  flex: 1 1 80px;
  width: auto;
  padding: 10px 6px;
  font-size: 12px;
  background: #34495e;
  color: #fff;
}
.btn-project:hover {
  background: #2c3e50;
}

.history-actions {
  display: flex;
  gap: 6px;
  margin-top: 8px;
}

.btn-history {
  flex: 1;
  width: auto;
  padding: 10px 6px;
  font-size: 12px;
  background: #5d6d7e;
  color: #fff;
}
.btn-history:hover:not(:disabled) {
  background: #4a5a6a;
}
.btn-history:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.history-hint {
  margin: 6px 0 0;
  font-size: 11px;
  color: #888;
}

.btn-share {
  margin-top: 10px;
  background: #16a085;
  color: #fff;
  font-size: 13px;
  padding: 9px 10px;
}
.btn-share:hover {
  background: #138d75;
}

.share-status {
  margin: 6px 0 0;
  font-size: 12px;
  font-weight: 600;
  color: #16a085;
  text-align: center;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 0;
}

@media (min-width: 560px) {
  .modal-backdrop {
    align-items: center;
    padding: 20px;
  }
}

.modal {
  background: #fff;
  border-radius: 10px 10px 0 0;
  width: min(420px, 100%);
  max-height: min(85dvh, 560px);
  overflow: auto;
  padding: 16px 18px max(18px, env(safe-area-inset-bottom));
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25);
  -webkit-overflow-scrolling: touch;
}

@media (min-width: 560px) {
  .modal {
    border-radius: 10px;
    max-height: min(70vh, 560px);
    padding: 16px 18px 18px;
  }
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}

.modal-header h3 {
  margin: 0;
  font-size: 16px;
  color: #2c3e50;
}

.modal-hint {
  margin: 0 0 12px;
  font-size: 12px;
  color: #666;
  line-height: 1.4;
}

.project-list {
  list-style: none;
  margin: 0 0 12px;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.project-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  min-height: 56px;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  background: #fafafa;
}

.project-item.current {
  border-color: #2980b9;
  background: #ebf5fb;
}

.project-item-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.btn-delete-one {
  width: auto;
  flex-shrink: 0;
  padding: 10px 12px;
  font-size: 12px;
  background: #f5b7b1;
  color: #922b21;
  border: none;
  border-radius: 6px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.15s;
  -webkit-tap-highlight-color: transparent;
}
.btn-delete-one:hover {
  background: #e74c3c;
  color: #fff;
}

.modal-actions-row {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}
.modal-actions-row .btn {
  flex: 1;
}

.btn-delete-confirm {
  background: #e74c3c;
  color: #fff;
}
.btn-delete-confirm:hover {
  background: #c0392b;
}

.project-meta {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.project-meta strong {
  font-size: 13px;
  color: #2c3e50;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.project-meta small {
  font-size: 11px;
  color: #888;
}

.btn-load-one {
  width: auto;
  flex-shrink: 0;
  padding: 10px 14px;
  font-size: 12px;
  background: #2980b9;
  color: #fff;
}
.btn-load-one:hover:not(:disabled) {
  background: #2471a3;
}
.btn-load-one:disabled {
  opacity: 0.55;
  cursor: default;
  background: #7f8c8d;
}

.btn-modal-close {
  background: #ecf0f1;
  color: #2c3e50;
}
.btn-modal-close:hover {
  background: #d5dbdb;
}

/* Sticky top bar inside drawer (mobile) */
.mobile-bar {
  display: none;
  position: sticky;
  top: 0;
  z-index: 2;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin: -12px -16px 12px;
  padding: 10px 12px;
  background: #fff;
  border-bottom: 1px solid #eee;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.mobile-bar-title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: #2c3e50;
}
</style>