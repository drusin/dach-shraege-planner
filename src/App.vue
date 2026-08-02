<script setup lang="ts">
import { usePlanner } from './composables/usePlanner'
import PlannerCanvas from './components/PlannerCanvas.vue'
import Controls from './components/Controls.vue'

const {
  plan,
  cabinetCount,
  selectedCabinetId,
  addCabinet,
  removeCabinet,
  updateCabinet,
  selectCabinet,
  updateRoomPoint,
  resetPlan,
  shiftCabinets,
} = usePlanner()
</script>

<template>
  <div class="app">
    <header class="header">
      <h1>Dachschräge Planer</h1>
      <p class="subtitle">
        Seitenansicht · P0 → P1 → P2 → P3 → P4 → PEnd · Zustand in der URL (teilbar)
      </p>
    </header>
    <main class="main">
      <Controls
        :room="plan.room"
        :cabinets="plan.cabinets"
        :cabinet-count="cabinetCount"
        :selected-cabinet-id="selectedCabinetId"
        @update-room-point="updateRoomPoint"
        @add-cabinet="addCabinet"
        @update-cabinet="updateCabinet"
        @remove-cabinet="removeCabinet"
        @select-cabinet="selectCabinet"
        @shift-cabinets="shiftCabinets"
        @reset="resetPlan"
      />
      <PlannerCanvas
        :plan="plan"
        :selected-cabinet-id="selectedCabinetId"
        @select-cabinet="selectCabinet"
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

.main {
  display: flex;
  gap: 20px;
  padding: 20px 24px;
  flex: 1;
  align-items: flex-start;
}
</style>