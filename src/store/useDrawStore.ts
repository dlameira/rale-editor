import { create } from 'zustand'

export type Tool        = 'brush' | 'eraser' | 'fill' | 'line' | 'select'
export type BrushShape  = 'round' | 'square'

interface DrawStore {
  tool:        Tool
  color:       string
  size:        number
  brushShape:  BrushShape
  usedColors:  string[]
  setTool:        (tool: Tool) => void
  setColor:       (color: string) => void
  setSize:        (size: number) => void
  setBrushShape:  (shape: BrushShape) => void
  addUsedColor:   (color: string) => void
}

export const useDrawStore = create<DrawStore>((set, get) => ({
  tool:        'brush',
  color:       '#ffffff',
  size:        8,
  brushShape:  'round',
  usedColors:  [],
  setTool:       (tool)  => set({ tool }),
  setColor:      (color) => set({ color }),
  setSize:       (size)  => set({ size }),
  setBrushShape: (brushShape) => set({ brushShape }),
  addUsedColor:  (color) => {
    const { usedColors } = get()
    if (!usedColors.includes(color)) {
      set({ usedColors: [...usedColors, color] })
    }
  },
}))
