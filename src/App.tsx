import { useEffect } from 'react'
import { Canvas } from './components/Canvas'
import { Toolbar } from './components/Toolbar'
import { FloatingPalette } from './components/FloatingPalette'
import { LayersPanel } from './components/LayersPanel'
import { useDrawStore } from './store/useDrawStore'

export default function App() {
  const setTool        = useDrawStore(s => s.setTool)
  const setBrushShape  = useDrawStore(s => s.setBrushShape)
  const setShowLayers  = useDrawStore(s => s.setShowLayers)
  const showLayers     = useDrawStore(s => s.showLayers)
  const setShowToolbar = useDrawStore(s => s.setShowToolbar)
  const showToolbar    = useDrawStore(s => s.showToolbar)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if ((e.target as HTMLElement).closest('input, textarea')) return
      switch (e.key.toLowerCase()) {
        case 'b': {
          const { tool, brushShape } = useDrawStore.getState()
          if (tool === 'brush') setBrushShape(brushShape === 'round' ? 'square' : 'round')
          else setTool('brush')
          break
        }
        case 'g': setTool('fill');        break
        case 'e': setTool('eraser');      break
        case 'l': setTool('line');        break
        case 's': setTool('select');      break
        case 'i': setTool('eyedropper'); break
        case 'tab':
          e.preventDefault()
          setShowLayers(!showLayers)
          break
        case '`':
          setShowToolbar(!showToolbar)
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setTool, setBrushShape, setShowLayers, showLayers, setShowToolbar, showToolbar])

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#000', overflow: 'hidden', position: 'relative' }}>
      <Canvas />
      <Toolbar />
      <FloatingPalette />
      <LayersPanel />
    </div>
  )
}
