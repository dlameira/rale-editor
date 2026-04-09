import { useRef, useEffect, useCallback } from 'react'
import { getStroke } from 'perfect-freehand'
import { useDrawStore } from '../store/useDrawStore'
import type { LayerMeta } from '../store/useDrawStore'

// ─── constants ───────────────────────────────────────────────────────────────

// Large fixed canvas — 4K square gives ~16M pixels per layer to draw on.
// Snapshots cost 16 MB per layer (manageable). Infinite expansion caused OOM.
const DOC_W = 4096
const DOC_H = 4096

// ─── helpers ─────────────────────────────────────────────────────────────────

function drawDashedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.save()
  ctx.lineWidth = 1; ctx.setLineDash([6, 4])
  ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.strokeRect(x, y, w, h)
  ctx.lineDashOffset = 5; ctx.strokeStyle = '#fff'; ctx.strokeRect(x, y, w, h)
  ctx.restore()
}

function getPathFromStroke(stroke: number[][]): Path2D {
  if (!stroke.length) return new Path2D()
  const path = new Path2D()
  path.moveTo(stroke[0][0], stroke[0][1])
  for (let i = 1; i < stroke.length - 1; i++) {
    const cx = (stroke[i][0] + stroke[i+1][0]) / 2
    const cy = (stroke[i][1] + stroke[i+1][1]) / 2
    path.quadraticCurveTo(stroke[i][0], stroke[i][1], cx, cy)
  }
  path.closePath()
  return path
}

function parseColor(color: string): [number, number, number, number] {
  const tmp = document.createElement('canvas'); tmp.width = tmp.height = 1
  const ctx = tmp.getContext('2d', { willReadFrequently: true })!
  ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1)
  const d = ctx.getImageData(0, 0, 1, 1).data
  return [d[0], d[1], d[2], d[3]]
}

function floodFill(canvas: HTMLCanvasElement, sx: number, sy: number, fillColor: string) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  const { width, height } = canvas
  const img  = ctx.getImageData(0, 0, width, height)
  const data = img.data
  const x0 = Math.round(sx), y0 = Math.round(sy)
  if (x0 < 0 || y0 < 0 || x0 >= width || y0 >= height) return
  const base   = (y0 * width + x0) * 4
  const target = [data[base], data[base+1], data[base+2], data[base+3]]
  const fill   = parseColor(fillColor)
  if (target.every((v, i) => v === fill[i])) return
  const TOLERANCE = 40
  const match = (i: number) =>
    Math.abs(data[i]-target[0])+Math.abs(data[i+1]-target[1])+
    Math.abs(data[i+2]-target[2])+Math.abs(data[i+3]-target[3]) <= TOLERANCE
  const visited = new Uint8Array(width * height)
  const stack   = [y0 * width + x0]
  while (stack.length) {
    const idx = stack.pop()!
    if (visited[idx] || !match(idx*4)) continue
    visited[idx] = 1
    const i4 = idx*4
    data[i4]=fill[0]; data[i4+1]=fill[1]; data[i4+2]=fill[2]; data[i4+3]=fill[3]
    const col = idx%width, row = Math.floor(idx/width)
    if (col>0)        stack.push(idx-1)
    if (col<width-1)  stack.push(idx+1)
    if (row>0)        stack.push(idx-width)
    if (row<height-1) stack.push(idx+width)
  }
  const expandSmart = () => {
    for (let idx = 0; idx < width*height; idx++) {
      if (!visited[idx]) continue
      const col = idx%width, row = Math.floor(idx/width)
      const neighbors = [col>0?idx-1:-1, col<width-1?idx+1:-1, row>0?idx-width:-1, row<height-1?idx+width:-1]
      for (const nidx of neighbors) {
        if (nidx<0 || visited[nidx]) continue
        const ni4=nidx*4, na=data[ni4+3]
        if (na>0&&na<230) { data[ni4]=fill[0];data[ni4+1]=fill[1];data[ni4+2]=fill[2];data[ni4+3]=255;visited[nidx]=1;continue }
        if (na<128) continue
        const cCol=nidx%width, cRow=Math.floor(nidx/width)
        const cn=[cCol>0?nidx-1:-1,cCol<width-1?nidx+1:-1,cRow>0?nidx-width:-1,cRow<height-1?nidx+width:-1]
        let sR=0,sG=0,sB=0,sN=0
        for (const nnidx of cn) {
          if (nnidx<0||visited[nnidx]) continue
          const nn4=nnidx*4; if (data[nn4+3]<128) continue
          const d=Math.abs(data[nn4]-target[0])+Math.abs(data[nn4+1]-target[1])+Math.abs(data[nn4+2]-target[2])
          if (d>60){sR+=data[nn4];sG+=data[nn4+1];sB+=data[nn4+2];sN++}
        }
        const dToTarget=Math.abs(data[ni4]-target[0])+Math.abs(data[ni4+1]-target[1])+Math.abs(data[ni4+2]-target[2])
        const shouldFill=sN>0?dToTarget<=(Math.abs(data[ni4]-sR/sN)+Math.abs(data[ni4+1]-sG/sN)+Math.abs(data[ni4+2]-sB/sN)):dToTarget<=200
        if (shouldFill){data[ni4]=fill[0];data[ni4+1]=fill[1];data[ni4+2]=fill[2];data[ni4+3]=255;visited[nidx]=1}
      }
    }
  }
  expandSmart(); expandSmart()
  ctx.putImageData(img, 0, 0)
}

// ─── types ───────────────────────────────────────────────────────────────────

type LayerSnap = { layerId: string; data: ImageData }

// ─── component ───────────────────────────────────────────────────────────────

export function Canvas() {
  const committedRef = useRef<HTMLCanvasElement>(null)
  const previewRef   = useRef<HTMLCanvasElement>(null)
  const cursorRef    = useRef<HTMLCanvasElement>(null)
  const wrapperRef   = useRef<HTMLDivElement>(null)
  const overlayRef   = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isDrawing  = useRef(false)
  const points     = useRef<[number, number, number][]>([])
  const lineStart  = useRef<[number, number] | null>(null)
  const historyRef = useRef<LayerSnap[][]>([])
  const isPanning  = useRef(false)
  const panStart   = useRef({ mx: 0, my: 0, px: 0, py: 0 })

  const selectionRect   = useRef<{ x: number; y: number; w: number; h: number } | null>(null)
  const selStartCanvas  = useRef<{ x: number; y: number } | null>(null)
  const clipboard       = useRef<ImageData | null>(null)
  const floatingPaste   = useRef<{ data: ImageData; x: number; y: number } | null>(null)
  const floatingDragOff = useRef<{ dx: number; dy: number } | null>(null)

  const layerCanvasesRef = useRef<Map<string, HTMLCanvasElement>>(new Map())

  // dirty-rect tracking — only clear/draw what actually changed each frame
  const strokeBoundsRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null)
  const cursorBoundsRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null)

  // pan X/Y = screen position of canvas pixel (0,0)
  const zoomRef = useRef(1)
  const panX    = useRef(0)
  const panY    = useRef(0)

  const { tool, color, size, brushShape, layers } = useDrawStore()
  const toolRef       = useRef(tool)
  const colorRef      = useRef(color)
  const sizeRef       = useRef(size)
  const brushShapeRef = useRef(brushShape)
  useEffect(() => { toolRef.current = tool },        [tool])
  useEffect(() => { colorRef.current = color },      [color])
  useEffect(() => { brushShapeRef.current = brushShape }, [brushShape])

  // ── transform ─────────────────────────────────────────────────────────────

  const applyTransform = useCallback(() => {
    if (!wrapperRef.current) return
    wrapperRef.current.style.transform = `translate(${panX.current}px,${panY.current}px) scale(${zoomRef.current})`
  }, [])

  // ── layer canvas management ───────────────────────────────────────────────

  const renderComposite = useCallback(() => {
    const committed = committedRef.current; if (!committed) return
    const ctx = committed.getContext('2d')!
    const { layers: ls } = useDrawStore.getState()
    ctx.clearRect(0, 0, committed.width, committed.height)
    for (let i = ls.length-1; i >= 0; i--) {
      const layer = ls[i]; if (!layer.visible) continue
      const cv = layerCanvasesRef.current.get(layer.id); if (!cv) continue
      ctx.globalAlpha = layer.opacity / 100
      ctx.drawImage(cv, 0, 0)
    }
    ctx.globalAlpha = 1
  }, [])

  // composite only a dirty rectangle — used during strokes for speed
  const renderCompositeRect = useCallback((x: number, y: number, w: number, h: number) => {
    const committed = committedRef.current; if (!committed) return
    const ctx = committed.getContext('2d')!
    const { layers: ls } = useDrawStore.getState()
    ctx.save()
    ctx.clearRect(x, y, w, h)
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip()
    for (let i = ls.length-1; i >= 0; i--) {
      const layer = ls[i]; if (!layer.visible) continue
      const cv = layerCanvasesRef.current.get(layer.id); if (!cv) continue
      ctx.globalAlpha = layer.opacity / 100
      ctx.drawImage(cv, 0, 0)
    }
    ctx.globalAlpha = 1; ctx.restore()
  }, [])

  const getActiveLayerCanvas = useCallback((): HTMLCanvasElement => {
    const { activeLayerId } = useDrawStore.getState()
    return layerCanvasesRef.current.get(activeLayerId) ?? committedRef.current!
  }, [])

  useEffect(() => {
    const canvases = layerCanvasesRef.current
    for (const layer of layers) {
      if (!canvases.has(layer.id)) {
        const cv = document.createElement('canvas')
        cv.width = DOC_W; cv.height = DOC_H
        canvases.set(layer.id, cv)
      }
    }
    const ids = new Set(layers.map(l => l.id))
    for (const id of [...canvases.keys()]) { if (!ids.has(id)) canvases.delete(id) }
    renderComposite()
  }, [layers, renderComposite])

  // ── cursor ────────────────────────────────────────────────────────────────

  const drawCursor = useCallback((x: number, y: number) => {
    const cv  = cursorRef.current!
    const ctx = cv.getContext('2d')!
    // Clear the previous cursor rect. Use the UNION of old and new bounds so a
    // size change mid-hover doesn't leave the old (larger) cursor visible.
    const r   = Math.max(sizeRef.current / 2, 1)
    const pad = 4
    const next = { x: x-r-pad-2, y: y-r-pad-22, w: r*2+pad*2+22, h: r*2+pad*2+44 }
    const prev = cursorBoundsRef.current
    if (prev) {
      const cx = Math.min(prev.x, next.x), cy = Math.min(prev.y, next.y)
      ctx.clearRect(cx, cy,
        Math.max(prev.x+prev.w, next.x+next.w) - cx,
        Math.max(prev.y+prev.h, next.y+next.h) - cy)
    }
    cursorBoundsRef.current = next

    if (toolRef.current === 'eraser') {
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2)
      ctx.strokeStyle='rgba(255,255,255,0.7)'; ctx.lineWidth=1.5; ctx.stroke()
    } else if (toolRef.current === 'fill') {
      ctx.fillStyle=colorRef.current; ctx.fillRect(x, y-14, 10, 10)
      ctx.strokeStyle='rgba(255,255,255,0.4)'; ctx.lineWidth=1; ctx.strokeRect(x, y-14, 10, 10)
    } else if (toolRef.current === 'line') {
      ctx.strokeStyle=colorRef.current; ctx.lineWidth=1
      ctx.beginPath(); ctx.moveTo(x-8,y); ctx.lineTo(x+8,y); ctx.moveTo(x,y-8); ctx.lineTo(x,y+8); ctx.stroke()
      if (lineStart.current) {
        const [lx,ly]=lineStart.current
        ctx.beginPath(); ctx.arc(lx,ly,3,0,Math.PI*2); ctx.fillStyle=colorRef.current; ctx.fill()
      }
    } else if (toolRef.current === 'select') {
      ctx.strokeStyle='#fff'; ctx.lineWidth=1.5
      ctx.beginPath(); ctx.moveTo(x-9,y); ctx.lineTo(x+9,y); ctx.moveTo(x,y-9); ctx.lineTo(x,y+9); ctx.stroke()
    } else if (toolRef.current === 'eyedropper') {
      const committed=committedRef.current; let sampled=colorRef.current
      if (committed) {
        const px=Math.round(x), py=Math.round(y)
        if (px>=0&&py>=0&&px<committed.width&&py<committed.height) {
          const d=committed.getContext('2d')!.getImageData(px,py,1,1).data
          sampled=`rgb(${d[0]},${d[1]},${d[2]})`
        }
      }
      ctx.fillStyle=sampled; ctx.fillRect(x+4,y-16,12,12)
      ctx.strokeStyle='rgba(255,255,255,0.7)'; ctx.lineWidth=1; ctx.strokeRect(x+4,y-16,12,12)
      ctx.strokeStyle='#fff'; ctx.lineWidth=1.5
      ctx.beginPath(); ctx.moveTo(x-7,y); ctx.lineTo(x+7,y); ctx.moveTo(x,y-7); ctx.lineTo(x,y+7); ctx.stroke()
    } else {
      const s=sizeRef.current
      if (brushShapeRef.current==='square') {
        ctx.fillStyle=colorRef.current; ctx.fillRect(x-s/2,y-s/2,s,s)
        ctx.strokeStyle='rgba(255,255,255,0.25)'; ctx.lineWidth=1; ctx.strokeRect(x-s/2,y-s/2,s,s)
      } else {
        ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fillStyle=colorRef.current; ctx.fill()
        ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.strokeStyle='rgba(255,255,255,0.25)'; ctx.lineWidth=1; ctx.stroke()
      }
    }
  }, [])

  // ── brush stroke ──────────────────────────────────────────────────────────

  const renderStroke = useCallback((pts: [number,number,number][], fillColor: string) => {
    const pv  = previewRef.current!
    const ctx = pv.getContext('2d')!
    const physSize = sizeRef.current

    // Always clear the full preview canvas — dirty-rect partial clears cause
    // ghosting artifacts because getStroke() paths can extend beyond the input
    // point bounding box (smoothing/tapering pushes pixels outside it).
    ctx.clearRect(0, 0, pv.width, pv.height)

    if (!pts.length) { strokeBoundsRef.current = null; return }

    // Track cumulative stroke bounds (used only by flushSegment → renderCompositeRect)
    const pad = physSize + 4
    let minX=pts[0][0], minY=pts[0][1], maxX=pts[0][0], maxY=pts[0][1]
    for (const [px,py] of pts) { if(px<minX)minX=px;if(px>maxX)maxX=px;if(py<minY)minY=py;if(py>maxY)maxY=py }
    const nb = { x: minX-pad, y: minY-pad, w: maxX-minX+pad*2, h: maxY-minY+pad*2 }
    const prev = strokeBoundsRef.current
    strokeBoundsRef.current = prev ? {
      x: Math.min(prev.x, nb.x), y: Math.min(prev.y, nb.y),
      w: Math.max(prev.x+prev.w, nb.x+nb.w) - Math.min(prev.x, nb.x),
      h: Math.max(prev.y+prev.h, nb.y+nb.h) - Math.min(prev.y, nb.y),
    } : nb

    if (brushShapeRef.current==='square') {
      ctx.save(); ctx.fillStyle=ctx.strokeStyle=fillColor; ctx.lineWidth=physSize
      ctx.lineCap='square'; ctx.lineJoin='miter'
      if (pts.length===1) { ctx.fillRect(pts[0][0]-physSize/2,pts[0][1]-physSize/2,physSize,physSize) }
      else { ctx.beginPath(); ctx.moveTo(pts[0][0],pts[0][1]); for(let i=1;i<pts.length;i++) ctx.lineTo(pts[i][0],pts[i][1]); ctx.stroke() }
      ctx.restore()
    } else {
      const stroke = getStroke(pts, { size: physSize, thinning: 0.4, smoothing: 0.5, streamline: 0.5 })
      ctx.fillStyle = fillColor; ctx.fill(getPathFromStroke(stroke))
    }
  }, [])

  // ── selection overlay ─────────────────────────────────────────────────────

  const drawSelectionOverlay = useCallback(() => {
    const pv = previewRef.current; if (!pv) return
    const ctx = pv.getContext('2d')!
    ctx.clearRect(0, 0, pv.width, pv.height)
    if (floatingPaste.current) {
      const { data, x, y } = floatingPaste.current
      const tmp = document.createElement('canvas'); tmp.width=data.width; tmp.height=data.height
      tmp.getContext('2d')!.putImageData(data, 0, 0)
      ctx.drawImage(tmp, x, y); drawDashedRect(ctx, x, y, data.width, data.height); return
    }
    if (selectionRect.current) {
      const { x, y, w, h } = selectionRect.current
      if (w>0&&h>0) drawDashedRect(ctx, x, y, w, h)
    }
  }, [])

  const commitFloatingPaste = useCallback(() => {
    if (!floatingPaste.current) return
    const { data, x, y } = floatingPaste.current
    const tmp = document.createElement('canvas'); tmp.width=data.width; tmp.height=data.height
    tmp.getContext('2d')!.putImageData(data, 0, 0)
    getActiveLayerCanvas().getContext('2d')!.drawImage(tmp, x, y)
    floatingPaste.current = null
    previewRef.current!.getContext('2d')!.clearRect(0,0,previewRef.current!.width,previewRef.current!.height)
    renderComposite()
  }, [getActiveLayerCanvas, renderComposite])

  // ── snapshot ──────────────────────────────────────────────────────────────

  const saveSnapshot = useCallback(() => {
    const { layers: ls } = useDrawStore.getState()
    const snap: LayerSnap[] = ls.flatMap(layer => {
      const cv = layerCanvasesRef.current.get(layer.id); if (!cv) return []
      return [{ layerId: layer.id, data: cv.getContext('2d')!.getImageData(0,0,cv.width,cv.height) }]
    })
    historyRef.current.push(snap)
    if (historyRef.current.length > 20) historyRef.current.shift()
  }, [])

  // ── flush / commit stroke ─────────────────────────────────────────────────

  const flushPreviewToLayer = useCallback(() => {
    const activeCanvas = getActiveLayerCanvas()
    const preview = previewRef.current!
    const ctx = activeCanvas.getContext('2d')!
    if (toolRef.current==='eraser') ctx.globalCompositeOperation='destination-out'
    ctx.drawImage(preview, 0, 0)
    ctx.globalCompositeOperation='source-over'
    preview.getContext('2d')!.clearRect(0,0,preview.width,preview.height)
    strokeBoundsRef.current = null
  }, [getActiveLayerCanvas])

  const flushSegment = useCallback((dirtyRect?: { x: number; y: number; w: number; h: number }) => {
    if (!isDrawing.current || !points.current.length) return
    // Keep last 5 points as the continuation seed, with pressure=0.
    // This prevents the 1-point gap that made getStroke() produce a broken/empty
    // path right after a flush, causing the jitter / "wrong refresh rate" feel.
    // pressure=0 tapers the seed to zero width → invisible double-draw on the layer.
    const tail = points.current.slice(-5).map(([x,y]) => [x, y, 0] as [number,number,number])
    flushPreviewToLayer()
    points.current = tail
    if (dirtyRect) renderCompositeRect(dirtyRect.x, dirtyRect.y, dirtyRect.w, dirtyRect.h)
    else renderComposite()
  }, [flushPreviewToLayer, renderComposite, renderCompositeRect])

  const commitStroke = useCallback(() => {
    flushPreviewToLayer()
    if (toolRef.current!=='eraser') useDrawStore.getState().addUsedColor(colorRef.current)
    points.current=[]; isDrawing.current=false
    renderComposite()
  }, [flushPreviewToLayer, renderComposite])

  // when brush size changes mid-stroke → seamlessly start new segment
  useEffect(() => { flushSegment(); sizeRef.current = size }, [size, flushSegment])

  // cleanup on tool switch
  useEffect(() => {
    if (tool!=='line') lineStart.current=null
    if (tool!=='select') {
      if (floatingPaste.current) { saveSnapshot(); commitFloatingPaste() }
      selectionRect.current=null
    }
    const p=previewRef.current; if (p) p.getContext('2d')!.clearRect(0,0,p.width,p.height)
  }, [tool, commitFloatingPaste, saveSnapshot])

  // ── zoom ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) {
        e.preventDefault()
        const { size: sz, setSize } = useDrawStore.getState()
        setSize(Math.min(Math.max(sz + (e.deltaY<0?1:-1), 1), 60)); return
      }
      e.preventDefault()
      const factor  = e.deltaY < 0 ? 1.12 : 1/1.12
      const newZoom = Math.min(Math.max(zoomRef.current * factor, 0.02), 50)
      const wx = (e.clientX - panX.current) / zoomRef.current
      const wy = (e.clientY - panY.current) / zoomRef.current
      panX.current = e.clientX - wx * newZoom
      panY.current = e.clientY - wy * newZoom
      zoomRef.current = newZoom
      applyTransform()
    }
    window.addEventListener('wheel', onWheel, { passive: false })
    return () => window.removeEventListener('wheel', onWheel)
  }, [applyTransform])

  // ── save / load project ───────────────────────────────────────────────────

  const saveProject = useCallback(() => {
    const { layers: ls } = useDrawStore.getState()
    const layerData = ls.map(layer => ({
      id: layer.id, name: layer.name, visible: layer.visible, opacity: layer.opacity,
      imageData: layerCanvasesRef.current.get(layer.id)?.toDataURL('image/png') ?? null,
    }))
    const json = JSON.stringify({ version: 2, docW: DOC_W, docH: DOC_H, layers: layerData })
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob); const a = document.createElement('a')
    a.download=`drawing-${Date.now()}.rale`; a.href=url; a.click(); URL.revokeObjectURL(url)
  }, [])

  const loadProject = useCallback((file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string)
        const metas: LayerMeta[] = []
        const canvases = layerCanvasesRef.current
        canvases.clear()
        for (const cv of [committedRef.current!, previewRef.current!, cursorRef.current!]) { cv.width=DOC_W; cv.height=DOC_H }
        const promises = (data.layers as any[]).map((ld: any) => {
          const meta: LayerMeta = { id: ld.id, name: ld.name, visible: ld.visible, opacity: ld.opacity }
          metas.push(meta)
          const cv = document.createElement('canvas'); cv.width=DOC_W; cv.height=DOC_H; canvases.set(ld.id, cv)
          if (!ld.imageData) return Promise.resolve()
          return new Promise<void>(resolve => {
            const img = new Image()
            img.onload = () => { cv.getContext('2d')!.drawImage(img, 0, 0); resolve() }
            img.onerror = () => resolve(); img.src = ld.imageData
          })
        })
        Promise.all(promises).then(() => {
          useDrawStore.getState().setLayers(metas, metas[0]?.id)
          historyRef.current=[]; renderComposite()
        })
      } catch (err) { console.error('Failed to load project:', err) }
    }
    reader.readAsText(file)
  }, [renderComposite])

  // ── keyboard ──────────────────────────────────────────────────────────────

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey||e.metaKey)&&e.shiftKey&&e.key.toLowerCase()==='s') { e.preventDefault(); saveProject(); return }
      if ((e.ctrlKey||e.metaKey)&&!e.shiftKey&&e.key==='s') {
        e.preventDefault()
        const link=document.createElement('a'); link.download=`drawing-${Date.now()}.png`
        link.href=committedRef.current!.toDataURL('image/png'); link.click(); return
      }
      if ((e.ctrlKey||e.metaKey)&&e.key==='o') { e.preventDefault(); fileInputRef.current?.click(); return }
      if ((e.ctrlKey||e.metaKey)&&e.key==='z') {
        e.preventDefault()
        const hist=historyRef.current; if (!hist.length) return
        for (const { layerId, data } of hist.pop()!) {
          const cv=layerCanvasesRef.current.get(layerId)
          if (cv) cv.getContext('2d')!.putImageData(data, 0, 0)
        }
        renderComposite(); return
      }
      if ((e.ctrlKey||e.metaKey)&&e.key==='c') {
        const sel=selectionRect.current; if (!sel||sel.w<=0||sel.h<=0) return
        e.preventDefault()
        clipboard.current=committedRef.current!.getContext('2d')!.getImageData(sel.x,sel.y,sel.w,sel.h); return
      }
      if ((e.ctrlKey||e.metaKey)&&e.key==='v') {
        if (!clipboard.current) return; e.preventDefault()
        const data=clipboard.current
        const cx=(window.innerWidth/2 - panX.current)/zoomRef.current - data.width/2
        const cy=(window.innerHeight/2 - panY.current)/zoomRef.current - data.height/2
        if (floatingPaste.current){saveSnapshot();commitFloatingPaste()}
        floatingPaste.current={data, x:Math.round(cx), y:Math.round(cy)}
        useDrawStore.getState().setTool('select'); drawSelectionOverlay(); return
      }
      if (e.key==='Enter') { if(floatingPaste.current){saveSnapshot();commitFloatingPaste()}; return }
      if (e.key==='Escape') {
        lineStart.current=null
        if (floatingPaste.current) { floatingPaste.current=null; previewRef.current!.getContext('2d')!.clearRect(0,0,previewRef.current!.width,previewRef.current!.height) }
        selectionRect.current=null
        const pv=previewRef.current; if(pv) pv.getContext('2d')!.clearRect(0,0,pv.width,pv.height)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [renderComposite, saveSnapshot, commitFloatingPaste, drawSelectionOverlay, saveProject])

  // ── event setup ───────────────────────────────────────────────────────────

  useEffect(() => {
    const committed = committedRef.current!
    const preview   = previewRef.current!
    const cursor    = cursorRef.current!

    committed.width=preview.width=cursor.width  =DOC_W
    committed.height=preview.height=cursor.height=DOC_H

    // initial zoom: fill viewport (whichever axis needs more zoom)
    const initZoom = Math.max(window.innerWidth / DOC_W, window.innerHeight / DOC_H)
    zoomRef.current = initZoom
    panX.current = (window.innerWidth  - DOC_W * initZoom) / 2
    panY.current = (window.innerHeight - DOC_H * initZoom) / 2
    applyTransform()
    renderComposite()

    // screen → canvas coordinates
    const getPos = (e: PointerEvent): [number, number, number] => [
      (e.clientX - panX.current) / zoomRef.current,
      (e.clientY - panY.current) / zoomRef.current,
      e.pressure || 0.5,
    ]

    const onDown = (e: PointerEvent) => {
      if (e.button===1) {
        e.preventDefault(); isPanning.current=true
        panStart.current={mx:e.clientX,my:e.clientY,px:panX.current,py:panY.current}
        overlayRef.current!.setPointerCapture(e.pointerId); return
      }
      if (e.button!==0) return
      const [x,y,pressure]=getPos(e)

      if (toolRef.current==='eyedropper') {
        const px=Math.round(x),py=Math.round(y)
        if (px<0||py<0||px>=committed.width||py>=committed.height) return
        const d=committed.getContext('2d')!.getImageData(px,py,1,1).data
        const hex='#'+[d[0],d[1],d[2]].map(v=>v.toString(16).padStart(2,'0')).join('')
        const{setColor,addUsedColor}=useDrawStore.getState(); setColor(hex); addUsedColor(hex); return
      }

      if (toolRef.current==='select') {
        const fp=floatingPaste.current, sr=selectionRect.current
        const inFp=fp&&x>=fp.x&&x<=fp.x+fp.data.width&&y>=fp.y&&y<=fp.y+fp.data.height
        const inSr=!fp&&sr&&x>=sr.x&&x<=sr.x+sr.w&&y>=sr.y&&y<=sr.y+sr.h
        if (inFp){floatingDragOff.current={dx:x-fp!.x,dy:y-fp!.y};overlayRef.current!.setPointerCapture(e.pointerId);return}
        if (inSr){
          const{x:sx,y:sy,w,h}=sr!; saveSnapshot()
          const ac=getActiveLayerCanvas()
          const data=ac.getContext('2d')!.getImageData(sx,sy,w,h)
          ac.getContext('2d')!.clearRect(sx,sy,w,h)
          floatingPaste.current={data,x:sx,y:sy}; selectionRect.current=null
          floatingDragOff.current={dx:x-sx,dy:y-sy}
          renderComposite(); drawSelectionOverlay(); overlayRef.current!.setPointerCapture(e.pointerId); return
        }
        if (fp){saveSnapshot();commitFloatingPaste()}
        else if (sr){selectionRect.current=null;preview.getContext('2d')!.clearRect(0,0,preview.width,preview.height)}
        selStartCanvas.current={x,y}; selectionRect.current={x,y,w:0,h:0}
        overlayRef.current!.setPointerCapture(e.pointerId); return
      }

      if (toolRef.current==='fill') {
        saveSnapshot(); useDrawStore.getState().addUsedColor(colorRef.current)
        floodFill(getActiveLayerCanvas(), x, y, colorRef.current); renderComposite(); return
      }

      const isLineMode=toolRef.current==='line'||(e.shiftKey&&(toolRef.current==='brush'||toolRef.current==='eraser'))
      if (isLineMode) {
        if (!lineStart.current){lineStart.current=[x,y]}
        else {
          saveSnapshot()
          if (toolRef.current!=='eraser') useDrawStore.getState().addUsedColor(colorRef.current)
          const ac=getActiveLayerCanvas(); const ctx=ac.getContext('2d')!
          ctx.save()
          if (toolRef.current==='eraser') ctx.globalCompositeOperation='destination-out'
          ctx.strokeStyle=toolRef.current==='eraser'?'rgba(0,0,0,1)':colorRef.current
          ctx.lineWidth=sizeRef.current; ctx.lineCap=brushShapeRef.current==='square'?'square':'round'
          ctx.beginPath(); ctx.moveTo(lineStart.current[0],lineStart.current[1]); ctx.lineTo(x,y); ctx.stroke()
          ctx.globalCompositeOperation='source-over'; ctx.restore(); renderComposite()
          lineStart.current=(e.shiftKey||toolRef.current==='line')?[x,y]:null
          if (!lineStart.current) preview.getContext('2d')!.clearRect(0,0,preview.width,preview.height)
        }
        return
      }

      saveSnapshot()
      overlayRef.current!.setPointerCapture(e.pointerId)
      isDrawing.current=true; points.current=[[x,y,pressure]]
      renderStroke(points.current, toolRef.current==='eraser'?'rgba(0,0,0,1)':colorRef.current)
    }

    const onMove = (e: PointerEvent) => {
      if (isPanning.current) {
        panX.current=panStart.current.px+e.clientX-panStart.current.mx
        panY.current=panStart.current.py+e.clientY-panStart.current.my
        applyTransform(); return
      }
      const [x,y,pressure]=getPos(e)
      drawCursor(x,y)

      if (toolRef.current==='select') {
        if (floatingDragOff.current&&floatingPaste.current) {
          floatingPaste.current={...floatingPaste.current,x:Math.round(x-floatingDragOff.current.dx),y:Math.round(y-floatingDragOff.current.dy)}
          drawSelectionOverlay(); return
        }
        if (selStartCanvas.current) {
          const{x:sx,y:sy}=selStartCanvas.current
          selectionRect.current={x:Math.min(sx,x),y:Math.min(sy,y),w:Math.abs(x-sx),h:Math.abs(y-sy)}
          drawSelectionOverlay()
        }
        return
      }
      if (lineStart.current) {
        const ctx=preview.getContext('2d')!; ctx.clearRect(0,0,preview.width,preview.height)
        ctx.save(); ctx.strokeStyle=colorRef.current; ctx.lineWidth=sizeRef.current
        ctx.lineCap='round'; ctx.setLineDash([6,5])
        ctx.beginPath(); ctx.moveTo(lineStart.current[0],lineStart.current[1]); ctx.lineTo(x,y); ctx.stroke(); ctx.restore()
        return
      }
      if (!isDrawing.current) return
      points.current.push([x,y,pressure])
      // periodic mini-flush: keeps point count small → getStroke stays fast
      if (points.current.length > 60) {
        flushSegment(strokeBoundsRef.current ?? undefined)
      }
      renderStroke(points.current, toolRef.current==='eraser'?'rgba(0,0,0,1)':colorRef.current)
    }

    const onUp = (e: PointerEvent) => {
      if (e.button===1){isPanning.current=false;return}
      if (toolRef.current==='select'){floatingDragOff.current=null;selStartCanvas.current=null;drawSelectionOverlay();return}
      if (isDrawing.current) commitStroke()
    }
    const onLeave = () => {
      if (cursorBoundsRef.current){
        const{x,y,w,h}=cursorBoundsRef.current; cursor.getContext('2d')!.clearRect(x,y,w,h)
        cursorBoundsRef.current=null
      }
      if (isDrawing.current) commitStroke()
    }

    const overlay=overlayRef.current!
    overlay.addEventListener('pointerdown', onDown)
    overlay.addEventListener('pointermove', onMove)
    overlay.addEventListener('pointerup',   onUp)
    overlay.addEventListener('pointerleave',onLeave)
    return () => {
      overlay.removeEventListener('pointerdown', onDown)
      overlay.removeEventListener('pointermove', onMove)
      overlay.removeEventListener('pointerup',   onUp)
      overlay.removeEventListener('pointerleave',onLeave)
    }
  }, [renderStroke, commitStroke, drawCursor, drawSelectionOverlay,
      commitFloatingPaste, saveSnapshot, renderComposite, getActiveLayerCanvas,
      flushSegment, applyTransform])

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <div
        ref={wrapperRef}
        style={{ position: 'absolute', top: 0, left: 0, width: DOC_W, height: DOC_H, transformOrigin: '0 0' }}
      >
        <canvas ref={committedRef} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }} />
        <canvas ref={previewRef}   style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }} />
        <canvas ref={cursorRef}    style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }} />
      </div>
      <div ref={overlayRef} style={{ position: 'absolute', inset: 0, cursor: 'none', zIndex: 5 }} />
      <input ref={fileInputRef} type="file" accept=".rale" style={{ display: 'none' }}
        onChange={e => { const f=e.target.files?.[0]; if(f) loadProject(f); e.target.value='' }} />
    </div>
  )
}
