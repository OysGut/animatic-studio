/**
 * B-100 runde 3: spacing-drag på lagets felt i scenens tidslinje.
 * Hover viser hvilken del som berøres (oransje); Cmd/Ctrl + dra strekker eller krymper animasjonen fra
 * klikkpunktet, Shift gjelder hele animasjonen med klikkpunktet som anker. Én UpdateLayers ved slipp (én
 * angring), Escape avbryter. Rytme-drag ligger på linjal og tomrom i animasjonssporene, ikke her.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Command, CompositionLayer, ProjectState } from "@/core";
import { planSpacingDrag, spacingLayers, spacingSpan, type SpacingPlan } from "@/core/animation/spacing";
import { t } from "@/core/i18n/keyed";

export interface SpacingHover { readonly layerId: string; readonly frame: number; readonly whole: boolean; readonly dragging: boolean }

/** Tilstanden med planens lagfelt lagt inn (forhåndsvisning, ingen skriving). */
export function spacingPreviewState(s: ProjectState, plan: SpacingPlan): ProjectState {
  const cmd = plan.command as { layers?: { layerId: string; fields: Partial<CompositionLayer> }[] } | null;
  if (!cmd?.layers) return s;
  const layers = { ...s.layers };
  for (const x of cmd.layers) { const l = layers[x.layerId]; if (l) layers[x.layerId] = { ...l, ...x.fields } as CompositionLayer; }
  return { ...s, layers };
}

const limitText = (l: "merge" | "locked" | "start") =>
  l === "merge" ? t("b100.spacing.limit-merge") : l === "locked" ? t("b100.spacing.limit-locked") : t("b100.spacing.limit-start");

export function SpacingRow({ state, layer, ppf, trackLeft, durationFrames, editable, run, frameFromX, onHover, onPreview, children }: {
  state: ProjectState; layer: CompositionLayer; ppf: number; trackLeft: number; durationFrames: number; editable: boolean;
  run: (c: Command, label: string) => string | null; frameFromX: (clientX: number) => number;
  onHover: ((h: SpacingHover | null) => void) | null; onPreview: ((s: ProjectState | null) => void) | null;
  children: ReactNode;
}) {
  const span = spacingSpan(spacingLayers(state, layer.id));
  const [hover, setHover] = useState<{ frame: number; whole: boolean } | null>(null);
  const [drag, setDrag] = useState<{ anchor: number; x0: number; pointerId: number; plan: SpacingPlan | null } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const dragRef = useRef(drag); dragRef.current = drag;
  const cancel = () => { setDrag(null); onPreview?.(null); onHover?.(null); };
  useEffect(() => {
    if (!drag) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); cancel(); } };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!drag]);
  if (!span) return <>{children}</>;
  const inBlob = (f: number) => f >= span.start && f <= span.end;
  const plan = drag?.plan ?? null;
  const shownStart = plan ? plan.newStart : span.start;
  const shownEnd = plan ? plan.newEnd : span.end;
  const hl = hover ? (hover.whole ? { from: shownStart, to: shownEnd } : { from: hover.frame, to: shownEnd }) : null;
  return (
    <div
      className="relative"
      data-testid={`spacing-row-${layer.id}`}
      data-spacing-mode={drag ? "dragging" : hover ? "hover" : "idle"}
      style={hover ? { cursor: "ew-resize" } : undefined}
      onPointerMove={(e) => {
        const d = dragRef.current;
        if (d && e.pointerId === d.pointerId) {
          const delta = Math.round((e.clientX - d.x0) / ppf);
          const p = planSpacingDrag(state, layer.id, d.anchor, delta, { whole: e.shiftKey });
          setDrag({ ...d, plan: p });
          setHover({ frame: d.anchor, whole: e.shiftKey });
          setMessage(p.limit ? limitText(p.limit) : p.newEnd > durationFrames - 1 ? t("b100.spacing.beyond") : null);
          onPreview?.(p.command ? spacingPreviewState(state, p) : null);
          onHover?.({ layerId: layer.id, frame: d.anchor, whole: e.shiftKey, dragging: true });
          return;
        }
        const r = e.currentTarget.getBoundingClientRect();
        if (e.clientX - r.left < trackLeft) { if (hover) { setHover(null); onHover?.(null); } return; }
        const f = frameFromX(e.clientX);
        if (!inBlob(f)) { if (hover) { setHover(null); onHover?.(null); } return; }
        setHover({ frame: f, whole: e.shiftKey });
        onHover?.({ layerId: layer.id, frame: f, whole: e.shiftKey, dragging: false });
      }}
      onPointerLeave={() => { if (!dragRef.current) { setHover(null); onHover?.(null); } }}
      onPointerDownCapture={(e) => {
        if (e.button !== 0 || !(e.metaKey || e.ctrlKey) || !hover) return;
        e.preventDefault(); e.stopPropagation();
        if (!editable) return;
        if (layer.locked) { setMessage(t("b100.spacing.locked-layer")); return; }
        e.currentTarget.setPointerCapture(e.pointerId);
        setMessage(null);
        setDrag({ anchor: hover.frame, x0: e.clientX, pointerId: e.pointerId, plan: null });
      }}
      onPointerUp={(e) => {
        const d = dragRef.current;
        if (!d || e.pointerId !== d.pointerId) return;
        if (d.plan?.command) run(d.plan.command, t("b100.spacing.command"));
        setDrag(null); onPreview?.(null);
        if (!d.plan?.limit) setMessage(null);
      }}
      onPointerCancel={cancel}
      onLostPointerCapture={() => { if (dragRef.current) cancel(); }}
    >
      {children}
      {hl ? (
        <div aria-hidden data-testid="spacing-highlight" data-whole={hover?.whole ? "true" : "false"}
          className="pointer-events-none absolute inset-y-1 rounded-sm bg-accent-warm/30 ring-1 ring-accent-warm"
          style={{ left: trackLeft + hl.from * ppf, width: Math.max(2, (hl.to - hl.from) * ppf) }} />
      ) : null}
      {hover ? (
        <div aria-hidden data-testid="spacing-point" className="pointer-events-none absolute inset-y-0 w-0.5 bg-accent-warm"
          style={{ left: trackLeft + hover.frame * ppf }} />
      ) : null}
      {plan ? (
        <output data-testid="spacing-label" className="pointer-events-none absolute right-2 top-0 z-30 rounded-sm bg-accent-warm px-1.5 font-mono text-xs text-accent-fg">
          {t("b100.spacing.label", { delta: `${plan.delta >= 0 ? "+" : ""}${plan.delta}`, length: String(plan.newEnd - plan.newStart) })}
        </output>
      ) : null}
      {message ? (
        <p role="status" data-testid="spacing-message" className="pointer-events-none absolute left-2 top-0 z-30 rounded-sm bg-surface-2 px-1.5 text-xs text-text-primary"
          style={{ left: trackLeft }}>{message}</p>
      ) : null}
    </div>
  );
}
