<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import type { Plan, Point2D, Cabinet } from '../types'
import { ROOM_POINT_LABELS, getVirtualCorners, getRoomOutline } from '../types'
import { validateCabinet, shortCabinetIssueLabel } from '../geometry'

const props = defineProps<{
  plan: Plan
  selectedCabinetId: string | null
}>()

const emit = defineEmits<{
  selectCabinet: [id: string | null]
  updateCabinet: [id: string, patch: Partial<Omit<Cabinet, 'id'>>]
  beginCoalesce: []
  endCoalesce: []
}>()

const wrapRef = ref<HTMLDivElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)

const PADDING = 56

let resizeObserver: ResizeObserver | null = null
let raf = 0

/** Aktuelle View-Transform – für Hit-Tests wiederverwendet */
let view = {
  cssW: 0,
  cssH: 0,
  scale: 1,
  originX: 0,
  originY: 0,
  drawH: 0,
  minX: 0,
  minY: 0,
}

/** Drag nur in x-Richtung */
let drag: {
  id: string
  startClientX: number
  originX: number
  moved: boolean
  pointerId: number
} | null = null

const cursorStyle = ref('pointer')

function scheduleDraw() {
  cancelAnimationFrame(raf)
  raf = requestAnimationFrame(draw)
}

function getContentBounds() {
  const outline = getRoomOutline(props.plan.room)
  const cabinets = props.plan.cabinets
  const xs = [
    ...outline.map((p) => p.x),
    ...cabinets.flatMap((c) => [c.x, c.x + c.width]),
  ]
  const ys = [
    ...outline.map((p) => p.y),
    ...cabinets.flatMap((c) => [c.y, c.y + c.height]),
    0,
  ]

  let minX = Math.min(...xs)
  let maxX = Math.max(...xs)
  let minY = Math.min(...ys)
  let maxY = Math.max(...ys)

  if (!Number.isFinite(minX) || !Number.isFinite(maxX)) {
    minX = 0
    maxX = 100
  }
  if (!Number.isFinite(minY) || !Number.isFinite(maxY)) {
    minY = 0
    maxY = 100
  }
  if (maxX - minX < 1) maxX = minX + 1
  if (maxY - minY < 1) maxY = minY + 1

  return { minX, maxX, minY, maxY }
}

function toCanvas(p: Point2D) {
  return {
    cx: view.originX + (p.x - view.minX) * view.scale,
    cy: view.originY + view.drawH - (p.y - view.minY) * view.scale,
  }
}

function roundCm(n: number): number {
  return Math.round(n * 10) / 10
}

function getCabinetById(id: string): Cabinet | undefined {
  return props.plan.cabinets.find((c) => c.id === id)
}

function canvasLocalCoords(event: PointerEvent | MouseEvent) {
  const canvas = canvasRef.value
  if (!canvas) return null
  const rect = canvas.getBoundingClientRect()
  return {
    cx: event.clientX - rect.left,
    cy: event.clientY - rect.top,
  }
}

function cabinetRect(cab: Cabinet) {
  const bl = toCanvas({ x: cab.x, y: cab.y })
  const tr = toCanvas({ x: cab.x + cab.width, y: cab.y + cab.height })
  return {
    rx: bl.cx,
    ry: tr.cy,
    rw: tr.cx - bl.cx,
    rh: bl.cy - tr.cy,
  }
}

function hitTestCabinet(cx: number, cy: number): string | null {
  // von oben nach unten prüfen (zuletzt gezeichneter = „oben“)
  const list = props.plan.cabinets
  for (let i = list.length - 1; i >= 0; i--) {
    const cab = list[i]
    const { rx, ry, rw, rh } = cabinetRect(cab)
    if (cx >= rx && cx <= rx + rw && cy >= ry && cy <= ry + rh) {
      return cab.id
    }
  }
  return null
}

function draw() {
  const canvas = canvasRef.value
  const wrap = wrapRef.value
  if (!canvas || !wrap) return

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const cssW = Math.max(wrap.clientWidth, 320)
  const cssH = Math.max(wrap.clientHeight, 360)

  const dpr = window.devicePixelRatio || 1
  canvas.width = Math.floor(cssW * dpr)
  canvas.height = Math.floor(cssH * dpr)
  canvas.style.width = `${cssW}px`
  canvas.style.height = `${cssH}px`
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  const bounds = getContentBounds()
  const worldW = bounds.maxX - bounds.minX
  const worldH = bounds.maxY - bounds.minY
  const scale = Math.min(
    (cssW - PADDING * 2) / worldW,
    (cssH - PADDING * 2) / worldH,
  )

  const drawW = worldW * scale
  const drawH = worldH * scale
  const originX = (cssW - drawW) / 2
  const originY = (cssH - drawH) / 2

  view = {
    cssW,
    cssH,
    scale,
    originX,
    originY,
    drawH,
    minX: bounds.minX,
    minY: bounds.minY,
  }

  // --- Himmel ---
  const sky = ctx.createLinearGradient(0, 0, 0, cssH)
  sky.addColorStop(0, '#7ec8e3')
  sky.addColorStop(1, '#c8eaf5')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, cssW, cssH)

  // --- Gitternetz (50 cm) ---
  const step = 50
  const startX = Math.floor(bounds.minX / step) * step
  const startY = Math.floor(bounds.minY / step) * step
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'
  ctx.lineWidth = 1
  for (let x = startX; x <= bounds.maxX + step; x += step) {
    const { cx } = toCanvas({ x, y: 0 })
    ctx.beginPath()
    ctx.moveTo(cx, 0)
    ctx.lineTo(cx, cssH)
    ctx.stroke()
  }
  for (let y = startY; y <= bounds.maxY + step; y += step) {
    const { cy } = toCanvas({ x: 0, y })
    ctx.beginPath()
    ctx.moveTo(0, cy)
    ctx.lineTo(cssW, cy)
    ctx.stroke()
  }

  const { room } = props.plan
  const outline = getRoomOutline(room)
  const { p0, pEnd } = getVirtualCorners(room)

  const c = {
    p0: toCanvas(p0),
    p1: toCanvas(room.p1),
    p2: toCanvas(room.p2),
    p3: toCanvas(room.p3),
    p4: toCanvas(room.p4),
    pEnd: toCanvas(pEnd),
  }

  // --- Außen-Boden ---
  const floorY = toCanvas({ x: 0, y: 0 }).cy
  ctx.fillStyle = '#8b5a2b'
  ctx.fillRect(0, floorY, cssW, Math.max(0, cssH - floorY))
  ctx.fillStyle = '#6d4420'
  ctx.fillRect(0, floorY, cssW, 6)

  // --- Raumfüllung ---
  ctx.beginPath()
  ctx.moveTo(c.p0.cx, c.p0.cy)
  ctx.lineTo(c.p1.cx, c.p1.cy)
  ctx.lineTo(c.p2.cx, c.p2.cy)
  ctx.lineTo(c.p3.cx, c.p3.cy)
  ctx.lineTo(c.p4.cx, c.p4.cy)
  ctx.lineTo(c.pEnd.cx, c.pEnd.cy)
  ctx.closePath()
  ctx.fillStyle = 'rgba(255, 248, 230, 0.94)'
  ctx.fill()

  strokeSegment(ctx, c.p0, c.pEnd, '#5d3a1a', 3)
  strokeSegment(ctx, c.p0, c.p1, '#2c3e50', 3)
  strokeSegment(ctx, c.p1, c.p2, '#c0392b', 4)
  strokeSegment(ctx, c.p2, c.p3, '#2c3e50', 3)
  strokeSegment(ctx, c.p3, c.p4, '#c0392b', 4)
  strokeSegment(ctx, c.p4, c.pEnd, '#2c3e50', 3)

  // --- Schränke ---
  for (const cab of props.plan.cabinets) {
    const selected = cab.id === props.selectedCabinetId
    const validation = validateCabinet(cab, room, props.plan.cabinets)
    const invalid = validation.invalid
    const { rx, ry, rw, rh } = cabinetRect(cab)

    ctx.fillStyle = 'rgba(0,0,0,0.12)'
    ctx.fillRect(rx + 3, ry + 3, rw, rh)

    // Grundfarbe;
    // bei Ungültig: leicht geröteter Overlay
    ctx.fillStyle = cab.color
    ctx.fillRect(rx, ry, rw, rh)
    if (invalid) {
      ctx.fillStyle = 'rgba(231, 76, 60, 0.45)'
      ctx.fillRect(rx, ry, rw, rh)

      // Schraffur
      ctx.save()
      ctx.beginPath()
      ctx.rect(rx, ry, rw, rh)
      ctx.clip()
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'
      ctx.lineWidth = 1.5
      const stepH = 8
      for (let x = rx - rh; x < rx + rw; x += stepH) {
        ctx.beginPath()
        ctx.moveTo(x, ry)
        ctx.lineTo(x + rh, ry + rh)
        ctx.stroke()
      }
      ctx.restore()
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.35)'
    ctx.lineWidth = 2
    ctx.strokeRect(rx + 5, ry + 5, Math.max(0, rw - 10), Math.max(0, rh - 10))
    ctx.beginPath()
    ctx.moveTo(rx + rw / 2, ry + 8)
    ctx.lineTo(rx + rw / 2, ry + rh - 8)
    ctx.stroke()

    if (invalid) {
      ctx.strokeStyle = '#c0392b'
      ctx.lineWidth = selected ? 4 : 3
      ctx.setLineDash([6, 4])
      ctx.strokeRect(rx - 1, ry - 1, rw + 2, rh + 2)
      ctx.setLineDash([])
    } else if (selected) {
      ctx.strokeStyle = cab.fixed ? '#7f8c8d' : '#f1c40f'
      ctx.lineWidth = 4
      ctx.strokeRect(rx - 2, ry - 2, rw + 4, rh + 4)
    } else if (cab.fixed) {
      ctx.strokeStyle = '#7f8c8d'
      ctx.lineWidth = 2
      ctx.setLineDash([4, 3])
      ctx.strokeRect(rx, ry, rw, rh)
      ctx.setLineDash([])
    } else {
      ctx.strokeStyle = shade(cab.color, -40)
      ctx.lineWidth = 2
      ctx.strokeRect(rx, ry, rw, rh)
    }

    // Handles nur wenn ausgewählt und nicht fixiert
    if (selected && !cab.fixed) {
      const handleColor = invalid ? '#c0392b' : '#f1c40f'
      drawHandle(ctx, rx, ry, handleColor)
      drawHandle(ctx, rx + rw, ry, handleColor)
      drawHandle(ctx, rx, ry + rh, handleColor)
      drawHandle(ctx, rx + rw, ry + rh, handleColor)
    }

    if (rw > 40 && rh > 30) {
      ctx.fillStyle = '#fff'
      ctx.font = 'bold 12px system-ui, sans-serif'
      const title = cab.fixed ? `🔒 ${cab.label}` : cab.label
      ctx.fillText(title, rx + 8, ry + 18)
      ctx.font = '11px system-ui, sans-serif'
      ctx.fillStyle = 'rgba(255,255,255,0.9)'
      ctx.fillText(`${cab.width}×${cab.height} cm`, rx + 8, ry + 34)
      if (invalid) {
        ctx.font = 'bold 11px system-ui, sans-serif'
        ctx.fillStyle = '#fff'
        const label = shortCabinetIssueLabel(validation)
        ctx.fillText(`⚠ ${label}`, rx + 8, ry + 50)
      }
    } else if (invalid && rw > 24) {
      ctx.font = 'bold 11px system-ui, sans-serif'
      ctx.fillStyle = '#fff'
      ctx.fillText('⚠', rx + 4, ry + 14)
    }
  }

  // Punkte
  drawPoint(ctx, c.p0, 'P0', 'virt. unten links', p0, true)
  drawPoint(ctx, c.pEnd, 'PEnd', 'virt. unten rechts', pEnd, true)
  drawPoint(ctx, c.p1, 'P1', ROOM_POINT_LABELS.p1, room.p1, false)
  drawPoint(ctx, c.p2, 'P2', ROOM_POINT_LABELS.p2, room.p2, false)
  drawPoint(ctx, c.p3, 'P3', ROOM_POINT_LABELS.p3, room.p3, false)
  drawPoint(ctx, c.p4, 'P4', ROOM_POINT_LABELS.p4, room.p4, false)

  // Info
  const roomWidth = pEnd.x - p0.x
  const roomHeight = Math.max(...outline.map((p) => p.y))
  ctx.fillStyle = 'rgba(0,0,0,0.55)'
  ctx.fillRect(12, 12, 250, 68)
  ctx.fillStyle = '#fff'
  ctx.font = '12px system-ui, sans-serif'
  ctx.fillText(`Raumbreite: ${fmt(roomWidth)} cm`, 22, 32)
  ctx.fillText(`max. Höhe: ${fmt(roomHeight)} cm`, 22, 50)
  ctx.fillText(
    `Wand l/r unter Schräge: ${fmt(room.p1.y)} / ${fmt(room.p4.y)} cm`,
    22,
    68,
  )
}

function drawHandle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color = '#f1c40f',
) {
  ctx.fillStyle = color
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.rect(x - 4, y - 4, 8, 8)
  ctx.fill()
  ctx.stroke()
}

function fmt(n: number): string {
  return Number.isFinite(n) ? String(Math.round(n * 10) / 10) : '–'
}

function strokeSegment(
  ctx: CanvasRenderingContext2D,
  a: { cx: number; cy: number },
  b: { cx: number; cy: number },
  color: string,
  width: number,
) {
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(a.cx, a.cy)
  ctx.lineTo(b.cx, b.cy)
  ctx.stroke()
}

function drawPoint(
  ctx: CanvasRenderingContext2D,
  pt: { cx: number; cy: number },
  label: string,
  desc: string,
  raw: Point2D,
  virtual: boolean,
) {
  ctx.beginPath()
  ctx.arc(pt.cx, pt.cy, virtual ? 7 : 8, 0, Math.PI * 2)
  ctx.fillStyle = '#fff'
  ctx.fill()
  ctx.beginPath()
  ctx.arc(pt.cx, pt.cy, virtual ? 5 : 6, 0, Math.PI * 2)
  ctx.fillStyle = virtual ? '#7f8c8d' : '#e74c3c'
  ctx.fill()
  if (virtual) {
    ctx.setLineDash([3, 2])
    ctx.strokeStyle = '#7f8c8d'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(pt.cx, pt.cy, 9, 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])
  }

  let offsetX = 12
  let align: CanvasTextAlign = 'left'
  let offsetY = -10

  if (label === 'P0' || label === 'P1') {
    offsetX = -12
    align = 'right'
  }
  if (label === 'P0' || label === 'PEnd') {
    offsetY = 20
  }
  if (label === 'P2') {
    offsetX = -8
    align = 'right'
    offsetY = -14
  }
  if (label === 'P3') {
    offsetX = 12
    align = 'left'
    offsetY = -14
  }
  if (label === 'P4' || label === 'PEnd') {
    offsetX = 12
    align = 'left'
  }

  ctx.textAlign = align
  ctx.font = (virtual ? 'italic ' : 'bold ') + '12px system-ui, sans-serif'
  ctx.fillStyle = virtual ? '#555' : '#1a1a1a'
  ctx.fillText(label, pt.cx + offsetX, pt.cy + offsetY)
  ctx.font = '10px system-ui, sans-serif'
  ctx.fillStyle = '#555'
  ctx.fillText(desc, pt.cx + offsetX, pt.cy + offsetY + 13)
  ctx.fillStyle = '#777'
  ctx.fillText(`x=${fmt(raw.x)}  h=${fmt(raw.y)}`, pt.cx + offsetX, pt.cy + offsetY + 26)
  ctx.textAlign = 'left'
}

function shade(hex: string, amount: number): string {
  const n = hex.replace('#', '')
  const num = parseInt(n.length === 3 ? n.split('').map((c) => c + c).join('') : n, 16)
  const r = Math.min(255, Math.max(0, ((num >> 16) & 0xff) + amount))
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + amount))
  const b = Math.min(255, Math.max(0, (num & 0xff) + amount))
  return `rgb(${r},${g},${b})`
}

function updateHoverCursor(event: PointerEvent) {
  if (drag) return
  const local = canvasLocalCoords(event)
  if (!local) {
    cursorStyle.value = 'pointer'
    return
  }
  const id = hitTestCabinet(local.cx, local.cy)
  if (!id) {
    cursorStyle.value = 'default'
    return
  }
  const cab = getCabinetById(id)
  cursorStyle.value = cab && !cab.fixed ? 'grab' : 'pointer'
}

function onPointerDown(event: PointerEvent) {
  if (event.button !== 0) return
  const canvas = canvasRef.value
  const local = canvasLocalCoords(event)
  if (!canvas || !local) return

  const id = hitTestCabinet(local.cx, local.cy)
  emit('selectCabinet', id)

  if (!id) return
  const cab = getCabinetById(id)
  if (!cab || cab.fixed) return

  drag = {
    id,
    startClientX: event.clientX,
    originX: cab.x,
    moved: false,
    pointerId: event.pointerId,
  }
  emit('beginCoalesce')
  canvas.setPointerCapture(event.pointerId)
  cursorStyle.value = 'grabbing'
  event.preventDefault()
}

function onPointerMove(event: PointerEvent) {
  if (!drag) {
    updateHoverCursor(event)
    return
  }
  if (event.pointerId !== drag.pointerId) return

  const dxPx = event.clientX - drag.startClientX
  if (!drag.moved && Math.abs(dxPx) < 2) return

  drag.moved = true
  const dxCm = view.scale === 0 ? 0 : dxPx / view.scale
  const nextX = roundCm(drag.originX + dxCm)
  const cab = getCabinetById(drag.id)
  if (!cab || cab.fixed) return
  if (cab.x === nextX) return
  emit('updateCabinet', drag.id, { x: nextX })
}

function endDrag(event: PointerEvent) {
  if (!drag || event.pointerId !== drag.pointerId) return
  const canvas = canvasRef.value
  if (canvas?.hasPointerCapture(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId)
  }
  drag = null
  emit('endCoalesce')
  updateHoverCursor(event)
}

function onPointerUp(event: PointerEvent) {
  endDrag(event)
}

function onPointerCancel(event: PointerEvent) {
  endDrag(event)
}

onMounted(async () => {
  await nextTick()
  scheduleDraw()
  if (wrapRef.value) {
    resizeObserver = new ResizeObserver(() => scheduleDraw())
    resizeObserver.observe(wrapRef.value)
  }
  const canvas = canvasRef.value
  canvas?.addEventListener('pointerdown', onPointerDown)
  canvas?.addEventListener('pointermove', onPointerMove)
  canvas?.addEventListener('pointerup', onPointerUp)
  canvas?.addEventListener('pointercancel', onPointerCancel)
})

onUnmounted(() => {
  cancelAnimationFrame(raf)
  resizeObserver?.disconnect()
  const canvas = canvasRef.value
  canvas?.removeEventListener('pointerdown', onPointerDown)
  canvas?.removeEventListener('pointermove', onPointerMove)
  canvas?.removeEventListener('pointerup', onPointerUp)
  canvas?.removeEventListener('pointercancel', onPointerCancel)
})

watch(() => props.plan, scheduleDraw, { deep: true })
watch(() => props.selectedCabinetId, scheduleDraw)
</script>

<template>
  <div ref="wrapRef" class="canvas-wrap">
    <canvas
      ref="canvasRef"
      class="planner-canvas"
      :style="{ cursor: cursorStyle }"
    />
  </div>
</template>

<style scoped>
.canvas-wrap {
  flex: 1;
  min-width: 0;
  min-height: 420px;
  height: calc(100vh - 120px);
  border: 3px solid #2c3e50;
  border-radius: 6px;
  overflow: hidden;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.12);
  background: #7ec8e3;
}

.planner-canvas {
  display: block;
  width: 100%;
  height: 100%;
  touch-action: none;
  user-select: none;
}
</style>