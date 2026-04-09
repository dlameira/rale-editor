import { useDrawStore } from '../store/useDrawStore'

export function Toolbar() {
  const { tool, size, brushShape, setTool, setSize, setBrushShape } = useDrawStore()

  return (
    <div style={{
      position: 'fixed',
      left: 16,
      top: '50%',
      transform: 'translateY(-50%)',
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      background: '#111',
      border: '1px solid #222',
      borderRadius: 10,
      padding: '10px 8px',
      zIndex: 10,
      alignItems: 'center',
    }}>
      <ToolBtn label="B" active={tool === 'brush'}  onClick={() => setTool('brush')}  title="Brush (B)" />
      <ToolBtn label="E" active={tool === 'eraser'} onClick={() => setTool('eraser')} title="Eraser (E)" />
      <ToolBtn label="F" active={tool === 'fill'}   onClick={() => setTool('fill')}   title="Fill (G)" />
      <ToolBtn label="L" active={tool === 'line'}   onClick={() => setTool('line')}   title="Linha reta (L)" />
      <ToolBtn label="S" active={tool === 'select'} onClick={() => setTool('select')} title="Seleção (S)" />

      <Divider />

      {/* brush shape */}
      <div style={{ display: 'flex', gap: 4 }}>
        <ShapeBtn shape="round"  active={brushShape === 'round'}  onClick={() => setBrushShape('round')} />
        <ShapeBtn shape="square" active={brushShape === 'square'} onClick={() => setBrushShape('square')} />
      </div>

      <Divider />

      {/* size */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
        <input
          type="range"
          min={1}
          max={60}
          value={size}
          onChange={e => setSize(Number(e.target.value))}
          style={{ writingMode: 'vertical-lr', direction: 'rtl', height: 64, accentColor: '#fff' }}
          title="Brush size"
        />
        <span style={{ color: '#555', fontSize: 10 }}>{size}</span>
      </div>
    </div>
  )
}

function ToolBtn({ label, active, onClick, title }: { label: string; active: boolean; onClick: () => void; title: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: 32,
        height: 32,
        borderRadius: 6,
        border: 'none',
        background: active ? '#333' : 'transparent',
        color: active ? '#fff' : '#555',
        cursor: 'pointer',
        fontSize: 13,
        fontWeight: 600,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'background 0.1s, color 0.1s',
      }}
    >
      {label}
    </button>
  )
}

function Divider() {
  return <div style={{ width: '100%', height: 1, background: '#222', margin: '2px 0' }} />
}

function ShapeBtn({ shape, active, onClick }: { shape: 'round' | 'square'; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={shape === 'round' ? 'Brush redondo' : 'Brush quadrado'}
      style={{
        width: 22,
        height: 22,
        border: active ? '1.5px solid #fff' : '1px solid #444',
        background: 'transparent',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
        borderRadius: shape === 'round' ? '50%' : 3,
      }}
    >
      <div style={{
        width: 10,
        height: 10,
        background: active ? '#fff' : '#555',
        borderRadius: shape === 'round' ? '50%' : 2,
      }} />
    </button>
  )
}
