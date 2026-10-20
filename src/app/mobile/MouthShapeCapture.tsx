/** Mobile rig capture is staged locally and sent only after explicit confirmation. */
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { t } from "@/core/i18n/keyed";
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
    c.toBlob(b => { if (!b) { setError(t("app-mobile-mouth-shape-capture.confirm.set-error.17d2c3892754")); return; } onConfirm(new File([b], `${slot.replaceAll(":", "-")}.png`, { type: "image/png" })); setUrl(null); }, "image/png");
  }
  return <section data-testid="ca4-mobile-capture" className="flex flex-col gap-3">
    <img data-testid="ca4-mobile-reference" src={referenceUrl} alt={t("app-mobile-mouth-shape-capture.mouth-shape-capture.alt.9b203899a3a2")} className="max-h-48 w-full object-contain" />
    <Button data-testid="ca4-mobile-choose" onClick={() => input.current?.click()}>{t("app-mobile-mouth-shape-capture.mouth-shape-capture.button.c3c17126cc7a")}</Button>
    <input ref={input} data-testid="ca4-mobile-file" type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) { setUrl(URL.createObjectURL(f)); setZoom(1); setRotation(0); setX(0); setY(0); } e.target.value = ""; }} />
    {url ? <><div className="aspect-square overflow-hidden border border-border bg-media"><img ref={image} src={url} alt={t("app-mobile-mouth-shape-capture.mouth-shape-capture.alt.0717ee88f750")} className="h-full w-full object-contain" style={{ transform: `translate(${x * 100}%, ${y * 100}%) rotate(${rotation}deg) scale(${zoom})` }} /></div>
    <div className="grid grid-cols-2 gap-2 text-xs text-text-secondary">{[{ key: "zoom", label: t("app-mobile-mouth-shape-capture.label.label.d571cbee54ad"), value: zoom, min: .25, max: 4, step: .05, set: setZoom }, { key: "rotation", label: t("app-mobile-mouth-shape-capture.label.label.d51c258d1682"), value: rotation, min: -180, max: 180, step: 1, set: setRotation }, { key: "x", label: t("app-mobile-mouth-shape-capture.label.label.a5b8b512fa39"), value: x, min: -.5, max: .5, step: .01, set: setX }, { key: "y", label: t("app-mobile-mouth-shape-capture.label.label.996955ff337f"), value: y, min: -.5, max: .5, step: .01, set: setY }].map(c => <label key={c.key}>{c.label}<input data-testid={`ca4-mobile-${c.key}`} aria-label={c.label} className="w-full accent-accent-brand" type="range" min={c.min} max={c.max} step={c.step} value={c.value} onChange={e => c.set(Number(e.target.value))} /></label>)}</div>
    <Button variant="secondary" data-testid="ca4-mobile-fit" onClick={() => { setZoom(1); setRotation(0); setX(0); setY(0); }}>{t("app-mobile-mouth-shape-capture.mouth-shape-capture.button.9042ef0b2a73")}</Button><Button data-testid="ca4-mobile-confirm" onClick={confirm}>{t("app-mobile-mouth-shape-capture.mouth-shape-capture.button.58453435899f")}</Button><Button variant="ghost" onClick={() => setUrl(null)}>{t("app-mobile-mouth-shape-capture.mouth-shape-capture.button.dd856c2b6496")}</Button></> : null}
    {error ? <p role="alert" className="text-xs text-status-danger">{error}</p> : null}
  </section>;
}
