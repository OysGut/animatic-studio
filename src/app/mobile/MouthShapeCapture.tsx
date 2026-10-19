/** Mobile rig capture is staged locally and sent only after explicit confirmation. */
import { useEffect, useRef, useState } from "react";
import { L } from "@/core";
import { Button } from "@/components/ui/button";
export function MouthShapeCapture({ referenceUrl, slot, onConfirm }: { referenceUrl: string; slot: string; onConfirm: (f: File) => void }) {
  const [url, setUrl] = useState<string | null>(null), [zoom, setZoom] = useState(1), [rotation, setRotation] = useState(0), [x, setX] = useState(0), [y, setY] = useState(0), [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null), image = useRef<HTMLImageElement>(null);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  function confirm() {
    const i = image.current; if (!i?.complete || !i.naturalWidth) return;
    const c = document.createElement("canvas"); c.width = 640; c.height = 640; const ctx = c.getContext("2d"); if (!ctx) return;
    ctx.translate(320 + x * 640, 320 + y * 640); ctx.rotate(rotation * Math.PI / 180);
    const fit = Math.min(640 / i.naturalWidth, 640 / i.naturalHeight) * zoom;
    ctx.scale(fit, fit); ctx.drawImage(i, -i.naturalWidth / 2, -i.naturalHeight / 2);
    c.toBlob(b => { if (!b) { setError(L("Bildet kunne ikke sendes", "The image could not be sent")); return; } onConfirm(new File([b], `${slot.replaceAll(":", "-")}.png`, { type: "image/png" })); setUrl(null); }, "image/png");
  }
  return <section data-testid="ca4-mobile-capture" className="flex flex-col gap-3">
    <img data-testid="ca4-mobile-reference" src={referenceUrl} alt={L("Referansebilde", "Reference image")} className="max-h-48 w-full object-contain" />
    <Button data-testid="ca4-mobile-choose" onClick={() => input.current?.click()}>{L("Fotografer eller velg bilde", "Take or choose a picture")}</Button>
    <input ref={input} data-testid="ca4-mobile-file" type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) { setUrl(URL.createObjectURL(f)); setZoom(1); setRotation(0); setX(0); setY(0); } e.target.value = ""; }} />
    {url ? <><div className="aspect-square overflow-hidden border border-border bg-media"><img ref={image} src={url} alt={L("Forhåndsvisning", "Preview")} className="h-full w-full object-contain" style={{ transform: `translate(${x * 100}%, ${y * 100}%) rotate(${rotation}deg) scale(${zoom})` }} /></div>
    <div className="grid grid-cols-2 gap-2 text-xs text-text-secondary">{[{ key: "zoom", label: L("Zoom", "Zoom"), value: zoom, min: .25, max: 4, step: .05, set: setZoom }, { key: "rotation", label: L("Rotasjon", "Rotation"), value: rotation, min: -180, max: 180, step: 1, set: setRotation }, { key: "x", label: L("Flytt X", "Move X"), value: x, min: -.5, max: .5, step: .01, set: setX }, { key: "y", label: L("Flytt Y", "Move Y"), value: y, min: -.5, max: .5, step: .01, set: setY }].map(c => <label key={c.key}>{c.label}<input data-testid={`ca4-mobile-${c.key}`} aria-label={c.label} className="w-full accent-accent-brand" type="range" min={c.min} max={c.max} step={c.step} value={c.value} onChange={e => c.set(Number(e.target.value))} /></label>)}</div>
    <Button variant="secondary" data-testid="ca4-mobile-fit" onClick={() => { setZoom(1); setRotation(0); setX(0); setY(0); }}>{L("Tilpass rammen", "Fit frame")}</Button><Button data-testid="ca4-mobile-confirm" onClick={confirm}>{L("Bekreft og send", "Confirm and send")}</Button><Button variant="ghost" onClick={() => setUrl(null)}>{L("Avbryt", "Cancel")}</Button></> : null}
    {error ? <p role="alert" className="text-xs text-status-danger">{error}</p> : null}
  </section>;
}
