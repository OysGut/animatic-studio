import { useRef } from "react";

/**
 * Dra-skille mellom panelene i manusutforskeren. Piltastene endrer bredden med 16 px. `sign` er 1 når
 * panelet ligger til venstre for skillet (dra mot høyre gjør det bredere), −1 når det ligger til høyre.
 */
export function PaneSplitter({ value, min, max, sign, label, testId, onChange }: { value: number; min: number; max: number; sign: 1 | -1; label: string; testId: string; onChange: (next: number, done: boolean) => void }) {
  const start = useRef<{ x: number; value: number } | null>(null);
  const last = useRef(value);
  return <div role="separator" aria-orientation="vertical" aria-label={label} aria-valuenow={Math.round(value)} aria-valuemin={min} aria-valuemax={max} tabIndex={0} data-testid={testId}
    className="relative w-1.5 shrink-0 cursor-col-resize bg-border hover:bg-accent-brand/60 focus-visible:bg-accent-brand focus-visible:outline-none"
    onPointerDown={(e) => { if (e.button > 0) return; e.currentTarget.setPointerCapture?.(e.pointerId); start.current = { x: e.clientX, value }; }}
    onPointerMove={(e) => { const s = start.current; if (!s) return; last.current = s.value + sign * (e.clientX - s.x); onChange(last.current, false); }}
    onPointerUp={() => { if (start.current) onChange(last.current, true); start.current = null; }}
    onPointerCancel={() => { start.current = null; }}
    onKeyDown={(e) => { if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return; e.preventDefault(); onChange(value + sign * (e.key === "ArrowRight" ? 16 : -16), true); }} />;
}
