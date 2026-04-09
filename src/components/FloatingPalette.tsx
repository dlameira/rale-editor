import { useRef, useState, useEffect } from 'react'
import { useDrawStore } from '../store/useDrawStore'

// ─── color utils ─────────────────────────────────────────────────────────────

function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d   = max - min
  const s   = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h   = max === r ? (g - b) / d + (g < b ? 6 : 0)
            : max === g ? (b - r) / d + 2
            :              (r - g) / d + 4
  return [h * 60, s, l]
}

function hslToHex(h: number, s: number, l: number): string {
  s = Math.max(0, Math.min(1, s))
  l = Math.max(0, Math.min(1, l))
  const c  = (1 - Math.abs(2 * l - 1)) * s
  const x  = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m  = l - c / 2
  let r = 0, g = 0, b = 0
  if      (h < 60)  { r = c; g = x; b = 0 }
  else if (h < 120) { r = x; g = c; b = 0 }
  else if (h < 180) { r = 0; g = c; b = x }
  else if (h < 240) { r = 0; g = x; b = c }
  else if (h < 300) { r = x; g = 0; b = c }
  else              { r = c; g = 0; b = x }
  const hex = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, '0')
  return `#${hex(r)}${hex(g)}${hex(b)}`
}

// grid: rows = saturation (vivid→muted), cols = lightness (dark→light)
const SAT_LEVELS   = [1.0, 0.75, 0.5, 0.25]
const LIGHT_LEVELS = [0.12, 0.25, 0.38, 0.52, 0.65, 0.80]

function generateVariations(hex: string): string[][] {
  const [h, s] = hexToHsl(hex)
  return SAT_LEVELS.map(sF =>
    LIGHT_LEVELS.map(lV => hslToHex(h, s * sF, lV))
  )
}

function sortColors(colors: string[]): string[] {
  return [...colors].sort((a, b) => {
    const [ha, sa, la] = hexToHsl(a)
    const [hb, sb, lb] = hexToHsl(b)
    const aGrey = sa < 0.12
    const bGrey = sb < 0.12
    if (aGrey && bGrey) return lb - la
    if (aGrey) return 1
    if (bGrey) return -1
    if (Math.abs(ha - hb) > 8) return ha - hb
    return lb - la
  })
}

// ─── component ───────────────────────────────────────────────────────────────

type VariationState = { color: string; rect: DOMRect }

export function FloatingPalette() {
  const { color, usedColors, setColor, setTool, tool } = useDrawStore()
  const pickerRef    = useRef<HTMLInputElement>(null)
  const paletteRef   = useRef<HTMLDivElement>(null)
  const variationRef = useRef<HTMLDivElement>(null)

  const [pos, setPos] = useState({ x: 80, y: -1 })
  const dragging  = useRef(false)
  const dragStart = useRef({ mx: 0, my: 0, px: 0, py: 0 })

  const [variation, setVariation] = useState<VariationState | null>(null)

  useEffect(() => {
    setPos(p => ({ ...p, y: window.innerHeight / 2 - 100 }))
  }, [])

  // drag
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return
      setPos({
        x: dragStart.current.px + e.clientX - dragStart.current.mx,
        y: dragStart.current.py + e.clientY - dragStart.current.my,
      })
    }
    const onUp = () => { dragging.current = false }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup',   onUp)
    }
  }, [])

  // fechar painel de variações ao clicar fora
  useEffect(() => {
    if (!variation) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (variationRef.current?.contains(t)) return
      if (paletteRef.current?.contains(t)) return
      setVariation(null)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [variation])

  // fechar com Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setVariation(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const startDrag = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, input')) return
    dragging.current = true
    dragStart.current = { mx: e.clientX, my: e.clientY, px: pos.x, py: pos.y }
  }

  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const didHold   = useRef(false)

  const pickActive = (c: string) => {
    setColor(c)
    if (tool === 'eraser' || tool === 'fill' || tool === 'line') setTool('brush')
  }

  const handleSwatchMouseDown = (c: string, e: React.MouseEvent<HTMLButtonElement>) => {
    didHold.current = false
    const rect = e.currentTarget.getBoundingClientRect()
    holdTimer.current = setTimeout(() => {
      didHold.current = true
      setVariation(prev => prev?.color === c ? null : { color: c, rect })
    }, 300)
  }

  const handleSwatchMouseUp = (c: string) => {
    if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null }
    if (!didHold.current) {
      // clique rápido → seleciona cor
      pickActive(c)
      setVariation(null)
    }
  }

  const handleSwatchMouseLeave = () => {
    if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null }
  }

  const handleVariationPick = (c: string) => {
    pickActive(c)
    setVariation(null)
  }

  const sorted = sortColors(usedColors)

  // posição do painel de variações: à direita da paleta
  const varTop  = variation ? Math.max(8, variation.rect.top - 32) : 0
  const varLeft = variation ? variation.rect.right + 10 : 0

  return (
    <>
      {/* paleta principal */}
      <div
        ref={paletteRef}
        onMouseDown={startDrag}
        style={{
          position: 'fixed',
          left: pos.x,
          top:  pos.y,
          zIndex: 20,
          background: '#111',
          border: '1px solid #222',
          borderRadius: 12,
          padding: '10px 10px 8px',
          minWidth: 52,
          maxWidth: 64,
          cursor: 'grab',
          userSelect: 'none',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 6,
        }}
      >
        {/* cor ativa — clicar abre o color picker */}
        <div
          title="Clique para escolher nova cor"
          style={{
            width: 32, height: 32,
            borderRadius: 6,
            background: tool === 'eraser' ? 'transparent' : color,
            border: tool === 'eraser' ? '2px dashed #444' : '2px solid #fff',
            flexShrink: 0,
            cursor: 'pointer',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <input
            ref={pickerRef}
            type="color"
            value={color}
            onChange={e => pickActive(e.target.value)}
            style={{
              position: 'absolute', inset: 0,
              width: '100%', height: '100%',
              opacity: 0, cursor: 'pointer', border: 'none', padding: 0,
            }}
          />
        </div>

        <div style={{ width: '100%', height: 1, background: '#222' }} />

        {/* cores usadas */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
          {sorted.map(c => (
            <button
              key={c}
              onMouseDown={e => handleSwatchMouseDown(c, e)}
              onMouseUp={() => handleSwatchMouseUp(c)}
              title={c}
              style={{
                width: 28, height: 28,
                borderRadius: '50%',
                background: c,
                border: variation?.color === c
                  ? '2px solid #fff'
                  : c === color && tool !== 'eraser'
                    ? '2px solid rgba(255,255,255,0.6)'
                    : '2px solid transparent',
                cursor: 'pointer',
                padding: 0,
                outline: 'none',
                flexShrink: 0,
                boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
                transition: 'transform 0.1s',
              }}
              onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.15)')}
              onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; handleSwatchMouseLeave() }}
            />
          ))}
        </div>

      </div>

      {/* painel de variações */}
      {variation && (
        <div
          ref={variationRef}
          style={{
            position: 'fixed',
            left: varLeft,
            top:  varTop,
            zIndex: 21,
            background: '#111',
            border: '1px solid #2a2a2a',
            borderRadius: 10,
            padding: 8,
            display: 'flex',
            flexDirection: 'column',
            gap: 3,
            boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
          }}
        >
          {generateVariations(variation.color).map((row, ri) => (
            <div key={ri} style={{ display: 'flex', gap: 3 }}>
              {row.map((c, ci) => (
                <button
                  key={ci}
                  onClick={() => handleVariationPick(c)}
                  title={c}
                  style={{
                    width: 22, height: 22,
                    borderRadius: 4,
                    background: c,
                    border: c === color ? '2px solid #fff' : '2px solid transparent',
                    cursor: 'pointer',
                    padding: 0,
                    outline: 'none',
                    transition: 'transform 0.1s, border-color 0.1s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.25)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.5)' }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.borderColor = c === color ? '#fff' : 'transparent' }}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </>
  )
}
