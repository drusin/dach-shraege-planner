<script setup lang="ts">
import { usePlanner } from './composables/usePlanner'
import PlannerCanvas from './components/PlannerCanvas.vue'
import Controls from './components/Controls.vue'

const {
  plan,
  cabinetCount,
  selectedCabinetId,
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
} = usePlanner()
</script>

<template>
  <div class="app">
    <header class="header">
      <div class="header-text">
        <h1>Dachschräge Planer</h1>
        <p class="subtitle">
          <span class="project-label">{{ projectName }}</span>
          · Seitenansicht · Zustand in URL & localStorage
        </p>
      </div>
    </header>
    <main class="main">
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
      />
      <PlannerCanvas
        :plan="plan"
        :selected-cabinet-id="selectedCabinetId"
        @select-cabinet="selectCabinet"
        @update-cabinet="updateCabinet"
      />
    </main>
  </div>
</template>

<style scoped>
.app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: #eef2f5;
}

.header {
  background: #2c3e50;
  color: #fff;
  padding: 16px 28px;
}

.header h1 {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
}

.subtitle {
  margin: 4px 0 0;
  color: #bdc3c7;
  font-size: 13px;
}

.project-label {
  color: #fff;
  font-weight: 600;
}

.main {
  display: flex;
  gap: 20px;
  padding: 20px 24px;
  flex: 1;
  align-items: flex-start;
}
</style>
