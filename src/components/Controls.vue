<script setup lang="ts">
import { reactive, ref, computed, watch } from 'vue'
import type { RoomPoints, RoomPointKey, Cabinet, ProjectSummary } from '../types'
import { ROOM_POINT_LABELS, getVirtualCorners } from '../types'
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
}>()

const nameDraft = ref(props.projectName)
const showLoadDialog = ref(false)

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
  label: 'Schrank',
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
    <section class="project-panel">
      <h2>Projekt</h2>
      <div class="field project-name-field">
        <label for="project-name">Name</label>
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
          Gespeichert {{ formatUpdatedAt(projectUpdatedAt) }} · localStorage
        </p>
      </div>
      <div class="project-actions">
        <button
          type="button"
          class="btn btn-project"
          title="Neues leeres Projekt – aktuelles bleibt gespeichert"
          @click="emit('newProject')"
        >
          Neu
        </button>
        <button
          type="button"
          class="btn btn-project"
          title="Kopie mit Index im Namen – Original bleibt gespeichert"
          @click="emit('copyProject')"
        >
          Kopieren
        </button>
        <button
          type="button"
          class="btn btn-project"
          title="Gespeichertes Projekt laden"
          @click="openLoadDialog"
        >
          Laden
        </button>
      </div>
    </section>

    <div v-if="showLoadDialog" class="modal-backdrop" @click.self="closeLoadDialog">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="load-title">
        <div class="modal-header">
          <h3 id="load-title">Projekt laden</h3>
          <button type="button" class="btn-icon" title="Schließen" @click="closeLoadDialog">
            ✕
          </button>
        </div>
        <p class="modal-hint">
          Aktuell: <strong>{{ projectName }}</strong> – wird vorher gespeichert.
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
                {{ p.cabinetCount }} Schrank/Schränke · {{ formatUpdatedAt(p.updatedAt) }}
                <span v-if="p.id === projectId"> · geöffnet</span>
              </small>
            </div>
            <button
              type="button"
              class="btn btn-load-one"
              :disabled="p.id === projectId"
              @click="onLoadProject(p.id)"
            >
              {{ p.id === projectId ? 'Aktiv' : 'Öffnen' }}
            </button>
          </li>
        </ul>
        <p v-else class="empty">Keine gespeicherten Projekte.</p>
        <button type="button" class="btn btn-modal-close" @click="closeLoadDialog">
          Schließen
        </button>
      </div>
    </div>

    <hr />

    <h2>Raum von der Seite</h2>
    <p class="hint">
      Pfad: <strong>P0 → P1 → P2 → P3 → P4 → PEnd</strong><br />
      P0/PEnd virtuell (immer h=0).<br />
      Alle Maße in <strong>cm</strong>.
    </p>

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
      <h3><span class="badge grey">P0</span> virt. unten links</h3>
      <div class="readonly">x = {{ virtual.p0.x }} cm · h = 0 cm (fix)</div>
    </div>

    <div v-for="key in pointKeys" :key="key" class="point-group">
      <h3>
        <span class="badge">{{ key.toUpperCase() }}</span>
        {{ ROOM_POINT_LABELS[key] }}
      </h3>
      <div class="field-row">
        <div class="field">
          <label>x (cm)</label>
          <input
            type="number"
            :value="room[key].x"
            step="5"
            @change="onPointX(key, $event)"
            @blur="onPointX(key, $event)"
          />
        </div>
        <div class="field">
          <label>h vom Boden (cm)</label>
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
      <h3><span class="badge grey">PEnd</span> virt. unten rechts</h3>
      <div class="readonly">x = {{ virtual.pEnd.x }} cm · h = 0 cm (fix)</div>
    </div>

    <hr />

    <h2>Schränke</h2>

    <div class="shift-row">
      <button
        type="button"
        class="btn btn-shift"
        :disabled="movableCount === 0"
        title="Gültige, nicht fixierte Schränke möglichst weit nach links"
        @click="emit('shiftCabinets', 'left')"
      >
        ← Nach links schieben
      </button>
      <button
        type="button"
        class="btn btn-shift"
        :disabled="movableCount === 0"
        title="Gültige, nicht fixierte Schränke möglichst weit nach rechts"
        @click="emit('shiftCabinets', 'right')"
      >
        Nach rechts schieben →
      </button>
    </div>
    <p v-if="movableCount > 0" class="shift-hint">
      {{ movableCount }} bewegliche Schrank/Schränke werden dicht gepackt.
      Fixierte und ungültige bleiben stehen.
    </p>

    <div v-if="cabinets.length === 0" class="empty">Noch keine Schränke.</div>

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
            <span v-if="cab.fixed" class="fixed-tag">fixiert</span>
            <span v-if="getValidation(cab).invalid" class="invalid-tag">
              {{ shortCabinetIssueLabel(getValidation(cab)) || 'ungültig' }}
            </span>
          </strong>
          <small>{{ cab.width }}×{{ cab.height }} cm · x={{ cab.x }}</small>
        </span>
        <button
          type="button"
          class="btn-icon"
          title="Löschen"
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
      <h3>Schrank bearbeiten</h3>
      <p v-if="selectedInvalid" class="invalid-msg">
        ⚠ {{ selectedIssueText }}
      </p>
      <label class="check fixed-toggle">
        <input
          type="checkbox"
          :checked="!!selected.fixed"
          @change="patchSelected({ fixed: ($event.target as HTMLInputElement).checked })"
        />
        Position & Größe fixieren
      </label>
      <p v-if="selected.fixed" class="fixed-msg">
        🔒 Fixiert – Position/Größe gesperrt, bleibt beim Schieben stehen.
      </p>
      <div class="field">
        <label>Bezeichnung</label>
        <input
          type="text"
          :value="selected.label"
          @input="patchSelected({ label: ($event.target as HTMLInputElement).value })"
        />
      </div>
      <div class="field-row">
        <div class="field">
          <label>Breite (cm)</label>
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
          <label>Höhe (cm)</label>
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
          <label>x von links (cm)</label>
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
          <label>x von rechts (cm)</label>
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
        <label>Bodenhöhe y (cm)</label>
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
        <label>Farbe</label>
        <input
          type="color"
          :value="selected.color"
          @input="patchSelected({ color: ($event.target as HTMLInputElement).value })"
        />
      </div>
      <button
        type="button"
        class="btn btn-delete"
        @click="emit('removeCabinet', selected.id)"
      >
        Schrank löschen
      </button>
    </div>

    <hr />

    <h2>Neuen Schrank hinzufügen</h2>

    <fieldset class="snap-group">
      <legend>Positionierung</legend>
      <label class="radio">
        <input v-model="snapMode" type="radio" value="none" />
        Kein Snapping
      </label>
      <label class="radio">
        <input v-model="snapMode" type="radio" value="left" />
        Snap to left
      </label>
      <label class="radio">
        <input v-model="snapMode" type="radio" value="right" />
        Snap to right
      </label>
      <p class="snap-hint">
        <template v-if="snapMode === 'none'">x/y manuell setzen.</template>
        <template v-else-if="snapMode === 'left'">
          Erste gültige Position von links (Bounds + keine Überlappung).
        </template>
        <template v-else>
          Erste gültige Position von rechts (Bounds + keine Überlappung).
        </template>
        Ohne gültige Stelle: horizontal mittig.
      </p>
    </fieldset>

    <div class="field">
      <label>Bezeichnung</label>
      <input v-model="newCabinet.label" type="text" />
    </div>
    <div class="field-row">
      <div class="field">
        <label>Breite (cm)</label>
        <input v-model.number="newCabinet.width" type="number" min="1" step="1" />
      </div>
      <div class="field">
        <label>Höhe (cm)</label>
        <input v-model.number="newCabinet.height" type="number" min="1" step="1" />
      </div>
    </div>
    <div class="field-row">
      <div class="field">
        <label>x von links (cm)</label>
        <input
          v-model.number="newCabinet.x"
          type="number"
          step="1"
          :disabled="!manualPosition"
        />
      </div>
      <div class="field">
        <label>x von rechts (cm)</label>
        <input
          v-model.number="newCabinetXRight"
          type="number"
          step="1"
          :disabled="!manualPosition"
        />
      </div>
    </div>
    <div class="field">
      <label>Bodenhöhe y (cm)</label>
      <input v-model.number="newCabinet.y" type="number" min="0" step="1" />
    </div>
    <div class="field">
      <label>Farbe</label>
      <input v-model="newCabinet.color" type="color" />
    </div>
    <button class="btn btn-add" type="button" @click="onAddCabinet">+ Schrank hinzufügen</button>

    <hr />

    <div class="actions">
      <span class="cabinet-count">
        {{ cabinetCount }} Schrank/Schränke
        <template v-if="invalidCount > 0">
          · <span class="invalid-count">{{ invalidCount }} ungültig</span>
        </template>
      </span>
      <button class="btn btn-reset" type="button" @click="emit('reset')">Zurücksetzen</button>
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
  overflow-y: auto;
}

h2 {
  margin: 0 0 4px;
  font-size: 16px;
  color: #2c3e50;
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
  gap: 8px;
  margin: 8px 0 6px;
}

.btn-shift {
  flex: 1;
  background: #34495e;
  color: #fff;
  padding: 8px 6px;
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
  padding: 8px 10px;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  cursor: pointer;
  background: #fafafa;
  transition: border-color 0.15s, background 0.15s;
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
  gap: 8px;
  margin: 0 0 10px;
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
  font-size: 14px;
  padding: 2px 6px;
  border-radius: 4px;
  line-height: 1;
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
  gap: 8px;
}
.field-row .field {
  flex: 1;
  margin-bottom: 0;
}

label {
  font-size: 11px;
  color: #666;
  font-weight: 600;
  text-transform: uppercase;
}

input {
  padding: 6px 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 13px;
  font-family: inherit;
  width: 100%;
}

input[type='color'] {
  height: 36px;
  padding: 2px;
  cursor: pointer;
}

hr {
  border: none;
  border-top: 1px solid #eee;
  margin: 16px 0;
}

.btn {
  width: 100%;
  padding: 10px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
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
  gap: 8px;
  font-size: 13px;
  color: #333;
  margin-bottom: 6px;
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
  gap: 6px;
  margin-top: 10px;
}

.btn-project {
  flex: 1;
  width: auto;
  padding: 8px 6px;
  font-size: 12px;
  background: #34495e;
  color: #fff;
}
.btn-project:hover {
  background: #2c3e50;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.modal {
  background: #fff;
  border-radius: 10px;
  width: min(420px, 100%);
  max-height: min(70vh, 560px);
  overflow: auto;
  padding: 16px 18px 18px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25);
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
  padding: 10px 12px;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  background: #fafafa;
}

.project-item.current {
  border-color: #2980b9;
  background: #ebf5fb;
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
  padding: 7px 12px;
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
</style>