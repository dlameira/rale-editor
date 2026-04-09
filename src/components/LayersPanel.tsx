import { useRef, useState } from 'react'
import { useDrawStore } from '../store/useDrawStore'

export function LayersPanel() {
  const {
    layers, activeLayerId, showLayers,
    addLayer, deleteLayer, toggleLayerVisible,
    setActiveLayer, moveLayerUp, moveLayerDown, reorderLayers,
  } = useDrawStore()

  // panel drag
  const [pos, setPos]     = useState({ x: window.innerWidth - 224, y: 80 })
  const panelDragRef      = useRef<{ ox: number; oy: number; px: number; py: number } | null>(null)

  // layer reorder drag
  const listRef           = useRef<HTMLDivElement>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [overIdx, setOverIdx]       = useState<number | null>(null)
  const rowDragRef        = useRef<{ id: string; startX: number; startY: number; moved: boolean } | null>(null)

  if (!showLayers) return null

  // ── panel drag ─────────────────────────────────────────────────────────────
  const onHeaderDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return
    e.currentTarget.setPointerCapture(e.pointerId)
    panelDragRef.current = { ox: e.clientX, oy: e.clientY, px: pos.x, py: pos.y }
  }
  const onHeaderMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!panelDragRef.current) return
    const { ox, oy, px, py } = panelDragRef.current
    setPos({ x: px + e.clientX - ox, y: py + e.clientY - oy })
  }
  const onHeaderUp = () => { panelDragRef.current = null }

  // ── layer reorder ──────────────────────────────────────────────────────────
  const calcOverIdx = (clientY: number): number => {
    const list = listRef.current
    if (!list) return layers.length
    const rows = [...list.children] as HTMLElement[]
    for (let i = 0; i < rows.length; i++) {
      const rect = rows[i].getBoundingClientRect()
      if (clientY < rect.top + rect.height / 2) return i
    }
    return rows.length
  }

  const onRowPointerDown = (e: React.PointerEvent<HTMLDivElement>, id: string) => {
    if ((e.target as HTMLElement).tagName === 'BUTTON') return  // deixar botões funcionarem
    e.currentTarget.setPointerCapture(e.pointerId)
    rowDragRef.current = { id, startX: e.clientX, startY: e.clientY, moved: false }
  }

  const onRowPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = rowDragRef.current
    if (!r) return
    const dist = Math.abs(e.clientX - r.startX) + Math.abs(e.clientY - r.startY)
    if (!r.moved && dist > 6) {
      r.moved = true
      setDraggingId(r.id)
    }
    if (r.moved) {
      const idx = calcOverIdx(e.clientY)
      setOverIdx(idx)
    }
  }

  const onRowPointerUp = (_e: React.PointerEvent<HTMLDivElement>) => {
    const r = rowDragRef.current
    if (!r) return
    if (r.moved && overIdx !== null) {
      reorderLayers(r.id, overIdx)
    } else {
      setActiveLayer(r.id)
    }
    rowDragRef.current = null
    setDraggingId(null)
    setOverIdx(null)
  }

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
        <button onClick={addLayer} style={{ ...btn, color: '#aaa', fontSize: 18, lineHeight: '14px' }} title="Nova layer">+</button>
      </div>

      {/* layer list */}
      <div ref={listRef} style={{ maxHeight: 260, overflowY: 'auto' }}>
        {layers.map((layer, i) => {
          const active   = layer.id === activeLayerId
          const isDragging = layer.id === draggingId
          return (
            <div key={layer.id}>
              {/* drop indicator acima */}
              {draggingId && overIdx === i && (
                <div style={{ height: 2, background: '#4a9eff', margin: '0 4px' }} />
              )}

              <div
                onPointerDown={e => onRowPointerDown(e, layer.id)}
                onPointerMove={onRowPointerMove}
                onPointerUp={onRowPointerUp}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '5px 8px',
                  background: active ? '#252525' : 'transparent',
                  borderLeft: active ? '2px solid #555' : '2px solid transparent',
                  cursor: isDragging ? 'grabbing' : 'grab',
                  opacity: isDragging ? 0.4 : 1,
                  transition: 'opacity 0.1s',
                }}
              >
                <button
                  onClick={e => { e.stopPropagation(); toggleLayerVisible(layer.id) }}
                  style={{ ...btn, opacity: layer.visible ? 1 : 0.3 }}
                  title="Visibilidade"
                >
                  ●
                </button>
                <span style={{
                  flex: 1, color: active ? '#ddd' : '#777', fontSize: 12,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {layer.name}
                </span>
              </div>

              {/* drop indicator abaixo do último */}
              {draggingId && overIdx === i + 1 && i === layers.length - 1 && (
                <div style={{ height: 2, background: '#4a9eff', margin: '0 4px' }} />
              )}
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
