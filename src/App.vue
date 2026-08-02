<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { usePlanner } from './composables/usePlanner'
import PlannerCanvas from './components/PlannerCanvas.vue'
import Controls from './components/Controls.vue'
import { t, getLocale } from './i18n'

const {
  plan,
  cabinetCount,
  selectedCabinetId,
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
  deleteProject,
  undo,
  redo,
  beginCoalesce,
  endCoalesce,
  copyShareLink,
  preferRoomSectionOpen,
} = usePlanner()

const controlsOpen = ref(false)
const isNarrow = ref(false)

function setBodyScrollLock(locked: boolean) {
  document.body.style.overflow = locked ? 'hidden' : ''
}

function checkNarrow() {
  isNarrow.value = window.matchMedia('(max-width: 900px)').matches
  if (!isNarrow.value) {
    controlsOpen.value = false
    setBodyScrollLock(false)
  }
}

function toggleControls() {
  controlsOpen.value = !controlsOpen.value
  setBodyScrollLock(controlsOpen.value && isNarrow.value)
}

function closeControls() {
  controlsOpen.value = false
  setBodyScrollLock(false)
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && controlsOpen.value) {
    closeControls()
  }
}

onMounted(() => {
  checkNarrow()
  window.addEventListener('resize', checkNarrow)
  window.addEventListener('keydown', onKeydown)
  document.title = t('app.title')
  document.documentElement.lang = getLocale()
})

onUnmounted(() => {
  window.removeEventListener('resize', checkNarrow)
  window.removeEventListener('keydown', onKeydown)
  setBodyScrollLock(false)
})
</script>

<template>
  <div class="app" :class="{ 'controls-open': controlsOpen && isNarrow }">
    <header class="header">
      <div class="header-text">
        <h1>{{ t('app.title') }}</h1>
        <p class="subtitle">
          <span class="project-label">{{ projectName }}</span>
          <span class="subtitle-rest">{{ t('app.subtitle') }}</span>
        </p>
      </div>
      <div class="header-actions">
        <button
          v-if="isNarrow"
          type="button"
          class="btn-header"
          :aria-expanded="controlsOpen"
          aria-controls="controls-panel"
          @click="toggleControls"
        >
          <span class="btn-header-icon" aria-hidden="true">{{ controlsOpen ? '✕' : '☰' }}</span>
          <span>{{ controlsOpen ? t('app.close') : t('app.menu') }}</span>
          <span v-if="!controlsOpen && cabinetCount > 0" class="badge-count">{{ cabinetCount }}</span>
        </button>
      </div>
    </header>

    <main class="main">
      <div
        v-if="controlsOpen && isNarrow"
        class="controls-backdrop"
        aria-hidden="true"
        @click="closeControls"
      />

      <aside
        id="controls-panel"
        class="controls-aside"
        :class="{ open: controlsOpen || !isNarrow }"
        :aria-hidden="isNarrow && !controlsOpen"
      >
        <Controls
          :room="plan.room"
          :cabinets="plan.cabinets"
          :cabinet-count="cabinetCount"
          :selected-cabinet-id="selectedCabinetId"
          :project-id="projectId"
          :project-name="projectName"
          :project-updated-at="projectUpdatedAt"
          :project-list="projectList"
          :name-error="nameError"
          :can-undo="canUndo"
          :can-redo="canRedo"
          :share-status="shareStatus"
          :prefer-room-section-open="preferRoomSectionOpen"
          @update-room-point="updateRoomPoint"
          @add-cabinet="addCabinet"
          @update-cabinet="updateCabinet"
          @remove-cabinet="removeCabinet"
          @select-cabinet="selectCabinet"
          @shift-cabinets="shiftCabinets"
          @reset="resetPlan"
          @set-project-name="setProjectName"
          @clear-name-error="clearNameError"
          @new-project="newProject"
          @copy-project="copyProject"
          @open-project="openProject"
          @refresh-project-list="refreshProjectList"
          @delete-project="deleteProject"
          @undo="undo"
          @redo="redo"
          @copy-share-link="copyShareLink"
          @close-panel="closeControls"
        />
      </aside>

      <PlannerCanvas
        :plan="plan"
        :selected-cabinet-id="selectedCabinetId"
        @select-cabinet="selectCabinet"
        @update-cabinet="updateCabinet"
        @begin-coalesce="beginCoalesce"
        @end-coalesce="endCoalesce"
      />
    </main>
  </div>
</template>

<style scoped>
.app {
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  background: #eef2f5;
}

.header {
  background: #2c3e50;
  color: #fff;
  padding: 12px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-shrink: 0;
  padding-top: max(12px, env(safe-area-inset-top));
  padding-left: max(16px, env(safe-area-inset-left));
  padding-right: max(16px, env(safe-area-inset-right));
}

.header-text {
  min-width: 0;
  flex: 1;
}

.header h1 {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.subtitle {
  margin: 3px 0 0;
  color: #bdc3c7;
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.project-label {
  color: #fff;
  font-weight: 600;
}

.subtitle-rest {
  color: #bdc3c7;
}

.header-actions {
  flex-shrink: 0;
}

.btn-header {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 8px 14px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.btn-header:hover,
.btn-header:focus-visible {
  background: rgba(255, 255, 255, 0.18);
  outline: none;
}

.btn-header-icon {
  font-size: 16px;
  line-height: 1;
}

.badge-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  padding: 0 6px;
  border-radius: 11px;
  background: #e74c3c;
  color: #fff;
  font-size: 12px;
  font-weight: 700;
}

.main {
  display: flex;
  gap: 20px;
  padding: 20px 24px;
  flex: 1;
  min-height: 0;
  align-items: stretch;
  position: relative;
}

.controls-aside {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.controls-aside :deep(.controls) {
  height: 100%;
}

.controls-backdrop {
  display: none;
}

/* --- Desktop --- */
@media (min-width: 901px) {
  .header {
    padding: 16px 28px;
    padding-top: max(16px, env(safe-area-inset-top));
  }

  .header h1 {
    font-size: 22px;
  }

  .subtitle {
    font-size: 13px;
  }

  .main {
    align-items: flex-start;
  }
}

/* --- Mobile / Tablet --- */
@media (max-width: 900px) {
  .main {
    flex-direction: column;
    gap: 0;
    padding: 0;
    overflow: hidden;
  }

  .controls-backdrop {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 40;
    background: rgba(0, 0, 0, 0.45);
    -webkit-tap-highlight-color: transparent;
  }

  .controls-aside {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    z-index: 50;
    width: min(100%, 400px);
    max-width: 100%;
    transform: translateX(100%);
    transition: transform 0.25s ease;
    padding-top: env(safe-area-inset-top);
    padding-bottom: env(safe-area-inset-bottom);
    padding-right: env(safe-area-inset-right);
    box-shadow: -8px 0 32px rgba(0, 0, 0, 0.2);
    background: #fff;
  }

  .controls-aside.open {
    transform: translateX(0);
  }

  /* Body scroll lock when drawer open – applied via class on app */
  .app.controls-open {
    overflow: hidden;
    height: 100vh;
    height: 100dvh;
  }
}
</style>
