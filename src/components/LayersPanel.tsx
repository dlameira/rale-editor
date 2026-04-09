import { useRef, useState } from 'react'
import { useDrawStore } from '../store/useDrawStore'

export function LayersPanel() {
  const {
    layers, activeLayerId, showLayers,
    addLayer, deleteLayer, toggleLayerVisible,
    setActiveLayer, moveLayerUp, moveLayerDown,
  } = useDrawStore()

  const [pos, setPos]   = useState({ x: window.innerWidth - 224, y: 80 })
  const dragRef         = useRef<{ ox: number; oy: number; px: number; py: number } | null>(null)

  if (!showLayers) return null

  const onHeaderDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { ox: e.clientX, oy: e.clientY, px: pos.x, py: pos.y }
  }
  const onHeaderMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return
    const { ox, oy, px, py } = dragRef.current
    setPos({ x: px + e.clientX - ox, y: py + e.clientY - oy })
  }
  const onHeaderUp = () => { dragRef.current = null }

  const btn: React.CSSProperties = {
    background: 'none', border: 'none', color: '#888', cursor: 'pointer',
    fontSize: 14, padding: '0 4px', lineHeight: 1,
  }

  return (
    <div style={{
      position: 'fixed', top: pos.y, left: pos.x, width: 200,
      background: '#111', border: '1px solid #222', borderRadius: 8,
      zIndex: 20, userSelect: 'none', overflow: 'hidden',
    }}>
      {/* header */}
      <div
        onPointerDown={onHeaderDown} onPointerMove={onHeaderMove} onPointerUp={onHeaderUp}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '6px 10px', background: '#1a1a1a', cursor: 'grab', borderBottom: '1px solid #222' }}
      >
        <span style={{ color: '#555', fontSize: 11, letterSpacing: 1 }}>LAYERS</span>
        <button onClick={addLayer} style={{ ...btn, color: '#aaa', fontSize: 18, lineHeight: '14px' }} title="Nova layer (+)">+</button>
      </div>

      {/* layer list — index 0 = top */}
      <div style={{ maxHeight: 260, overflowY: 'auto' }}>
        {layers.map(layer => {
          const active = layer.id === activeLayerId
          return (
            <div
              key={layer.id}
              onClick={() => setActiveLayer(layer.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '5px 8px',
                background: active ? '#252525' : 'transparent',
                borderLeft: active ? '2px solid #555' : '2px solid transparent',
                cursor: 'pointer',
              }}
            >
              <button
                onClick={e => { e.stopPropagation(); toggleLayerVisible(layer.id) }}
                style={{ ...btn, opacity: layer.visible ? 1 : 0.3 }}
                title="Visibilidade"
              >
                ●
              </button>
              <span style={{ flex: 1, color: active ? '#ddd' : '#777', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {layer.name}
              </span>
            </div>
          )
        })}
      </div>

      {/* footer */}
      <div style={{ display: 'flex', gap: 2, padding: '5px 8px', borderTop: '1px solid #1e1e1e' }}>
        <button onClick={() => moveLayerUp(activeLayerId)}   style={btn} title="Mover acima">↑</button>
        <button onClick={() => moveLayerDown(activeLayerId)} style={btn} title="Mover abaixo">↓</button>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => deleteLayer(activeLayerId)}
          disabled={layers.length <= 1}
          style={{ ...btn, color: layers.length <= 1 ? '#333' : '#888' }}
          title="Deletar layer"
        >
          ×
        </button>
      </div>
    </div>
  )
}
