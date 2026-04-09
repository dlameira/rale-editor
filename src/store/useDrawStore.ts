import { create } from 'zustand'

export type Tool        = 'brush' | 'eraser' | 'fill' | 'line' | 'select' | 'eyedropper'
export type BrushShape  = 'round' | 'square'

export interface LayerMeta {
  id:      string
  name:    string
  visible: boolean
  opacity: number   // 0–100
}

let _seq = 0
export function mkLayer(name?: string): LayerMeta {
  _seq++
  return { id: `layer-${Date.now()}-${_seq}`, name: name ?? `Layer ${_seq}`, visible: true, opacity: 100 }
}

interface DrawStore {
  tool:          Tool
  color:         string
  size:          number
  brushShape:    BrushShape
  usedColors:    string[]
  layers:        LayerMeta[]
  activeLayerId: string
  showLayers:    boolean

  setTool:             (tool: Tool) => void
  setColor:            (color: string) => void
  setSize:             (size: number) => void
  setBrushShape:       (shape: BrushShape) => void
  addUsedColor:        (color: string) => void
  addLayer:            () => void
  deleteLayer:         (id: string) => void
  toggleLayerVisible:  (id: string) => void
  setActiveLayer:      (id: string) => void
  moveLayerUp:         (id: string) => void
  moveLayerDown:       (id: string) => void
  reorderLayers:       (fromId: string, toIndex: number) => void
  setShowLayers:       (v: boolean) => void
}

const first = mkLayer('Layer 1')

export const useDrawStore = create<DrawStore>((set, get) => ({
  tool:          'brush',
  color:         '#ffffff',
  size:          8,
  brushShape:    'round',
  usedColors:    [],
  layers:        [first],
  activeLayerId: first.id,
  showLayers:    false,

  setTool:       (tool)  => set({ tool }),
  setColor:      (color) => set({ color }),
  setSize:       (size)  => set({ size }),
  setBrushShape: (brushShape) => set({ brushShape }),
  addUsedColor:  (color) => {
    if (!get().usedColors.includes(color)) set({ usedColors: [...get().usedColors, color] })
  },

  addLayer: () => {
    const layer = mkLayer()
    const { layers, activeLayerId } = get()
    const idx = layers.findIndex(l => l.id === activeLayerId)
    const next = [...layers]
    next.splice(idx, 0, layer)  // insert above active
    set({ layers: next, activeLayerId: layer.id })
  },

  deleteLayer: (id) => {
    const { layers } = get()
    if (layers.length <= 1) return
    const next = layers.filter(l => l.id !== id)
    const activeLayerId = get().activeLayerId === id
      ? next[Math.max(0, layers.findIndex(l => l.id === id) - 1)].id
      : get().activeLayerId
    set({ layers: next, activeLayerId })
  },

  toggleLayerVisible: (id) => set({
    layers: get().layers.map(l => l.id === id ? { ...l, visible: !l.visible } : l)
  }),

  setActiveLayer: (id) => set({ activeLayerId: id }),

  moveLayerUp: (id) => {
    const { layers } = get()
    const i = layers.findIndex(l => l.id === id)
    if (i <= 0) return
    const next = [...layers]
    ;[next[i - 1], next[i]] = [next[i], next[i - 1]]
    set({ layers: next })
  },

  moveLayerDown: (id) => {
    const { layers } = get()
    const i = layers.findIndex(l => l.id === id)
    if (i >= layers.length - 1) return
    const next = [...layers]
    ;[next[i], next[i + 1]] = [next[i + 1], next[i]]
    set({ layers: next })
  },

  reorderLayers: (fromId, toIndex) => {
    const { layers } = get()
    const fromIndex = layers.findIndex(l => l.id === fromId)
    if (fromIndex === -1 || fromIndex === toIndex) return
    const next = [...layers]
    const [removed] = next.splice(fromIndex, 1)
    next.splice(toIndex > fromIndex ? toIndex - 1 : toIndex, 0, removed)
    set({ layers: next })
  },

  setShowLayers: (showLayers) => set({ showLayers }),
}))
