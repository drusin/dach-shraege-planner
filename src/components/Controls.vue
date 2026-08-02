<script setup lang="ts">
import { reactive, ref, computed } from 'vue'
import type { RoomPoints, RoomPointKey, Cabinet } from '../types'
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
}>()

const emit = defineEmits<{
  updateRoomPoint: [point: RoomPointKey, value: Partial<{ x: number; y: number }>]
  addCabinet: [cabinet: Cabinet]
  updateCabinet: [id: string, patch: Partial<Omit<Cabinet, 'id'>>]
  removeCabinet: [id: string]
  selectCabinet: [id: string | null]
  reset: []
}>()

const pointKeys: RoomPointKey[] = ['p1', 'p2', 'p3', 'p4']

const virtual = computed(() => getVirtualCorners(props.room))

const selected = computed(
  () => props.cabinets.find((c) => c.id === props.selectedCabinetId) ?? null,
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

const snapMode = ref<SnapMode>('left')

const newCabinet = reactive({
  label: 'Schrank',
  width: 80,
  height: 180,
  x: 140,
  y: 0,
  color: '#2980b9',
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
</script>

<template>
  <div class="controls">
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

    <div v-if="cabinets.length === 0" class="empty">Noch keine Schränke.</div>

    <ul v-else class="cabinet-list">
      <li
        v-for="cab in cabinets"
        :key="cab.id"
        class="cabinet-item"
        :class="{
          active: cab.id === selectedCabinetId,
          invalid: getValidation(cab).invalid,
        }"
        @click="emit('selectCabinet', cab.id)"
      >
        <span class="swatch" :style="{ background: cab.color }" />
        <span class="cab-meta">
          <strong>
            {{ cab.label }}
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
    <div v-if="selected" class="edit-panel" :class="{ invalid: selectedInvalid }">
      <h3>Schrank bearbeiten</h3>
      <p v-if="selectedInvalid" class="invalid-msg">
        ⚠ {{ selectedIssueText }}
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
            @change="onSelectedNum('x', $event)"
            @blur="onSelectedNum('x', $event)"
          />
        </div>
        <div class="field">
          <label>Bodenhöhe y (cm)</label>
          <input
            type="number"
            :value="selected.y"
            min="0"
            step="1"
            @change="onSelectedNum('y', $event)"
            @blur="onSelectedNum('y', $event)"
          />
        </div>
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
        <label>Bodenhöhe y (cm)</label>
        <input v-model.number="newCabinet.y" type="number" min="0" step="1" />
      </div>
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
</style>