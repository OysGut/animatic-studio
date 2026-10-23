/**
 * Avstandssporet under valgt lag på tidslinjen: et klassisk spacing-diagram. Hvert bilde langs banen får et
 * merke der x er hvor langt laget har kommet (andel av strekningen) over banens tidsrom, så merkene samler
 * seg der laget går sakte og sprer seg der det går fort. Dataene er de samme som merkene i scenen
 * (pathSpacingMarks) og utkastet er det samme (motion-draft). Tegnes på canvas; bare dette sporet
 * abonnerer på utkastet og avspillingshodet, ikke hele tidslinjen.
 */
import { useEffect, useMemo, useRef } from "react";
import type { CompositionLayer } from "@/core";
import { pathSpacingMarks } from "@/core/animation/path-spacing";
import { t } from "@/core/i18n/keyed";
import { useShownPath } from "./motion-draft";
import { useFrame, type FrameStore } from "./use-playback";

export const SPACING_TRACK_H = 14;
const MAX_CANVAS_PX = 16000;

export function PathSpacingTrack({ layer, ppf, gutter, labelCss, playback }: {
  layer: CompositionLayer; ppf: number; gutter: number; labelCss: string; playback: { readonly store: FrameStore };
}) {
  const path = useShownPath(layer.id, layer.path);
  const keyframes = layer.keyframes;
  const marks = useMemo(() => (path ? pathSpacingMarks(path, keyframes.map((k) => k.frame)) : []), [path, keyframes]);
  const start = path ? Math.round(path.startFrame) : 0;
  const end = path ? Math.round(path.endFrame) : 0;
  // Bare bildet innenfor banen betyr noe for sporet; ellers tegnes det ikke på nytt
  const frame = useFrame(playback, (f) => (f < start ? -1 : f > end ? -2 : f));
  const ref = useRef<HTMLCanvasElement>(null);
  const width = Math.min(MAX_CANVAS_PX, Math.max(1, (end - start) * ppf));

  useEffect(() => {
    const c = ref.current;
    if (!c || !marks.length) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(width * dpr);
    c.height = Math.round(SPACING_TRACK_H * dpr);
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, SPACING_TRACK_H);
    const cs = getComputedStyle(c);
    const accent = cs.getPropertyValue("--accent-brand").trim() || "currentColor";
    const warm = cs.getPropertyValue("--accent-warm").trim() || accent;
    const mid = SPACING_TRACK_H / 2;
    ctx.globalAlpha = 0.35; ctx.fillStyle = accent; ctx.fillRect(0, mid - 0.5, width, 1); ctx.globalAlpha = 1;
    for (const m of marks) {
      const x = Math.min(width - 1, Math.max(1, m.progress * width));
      const now = m.frame === frame;
      if (m.held) {
        ctx.strokeStyle = warm; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(x, mid, 2.5, 0, Math.PI * 2); ctx.stroke();
      } else {
        const h = m.key ? SPACING_TRACK_H - 2 : 7;
        ctx.fillStyle = m.key ? warm : accent;
        ctx.fillRect(x - (m.key ? 1 : 0.5), mid - h / 2, m.key ? 2 : 1, h);
      }
      if (now) { ctx.fillStyle = warm; ctx.beginPath(); ctx.arc(x, mid, 3.5, 0, Math.PI * 2); ctx.fill(); }
    }
  }, [marks, frame, width]);

  if (!path || !marks.length) return null;
  return (
    <div className="flex border-b border-border bg-surface-2/40" style={{ height: SPACING_TRACK_H }} data-testid={`path-spacing-track-${layer.id}`}>
      <div className="sticky left-0 z-20 flex shrink-0 items-center border-r border-border-strong bg-surface-2 px-2 text-[10px] text-text-tertiary"
        style={{ width: labelCss }}>
        <span className="truncate">{t("pathSpacing.track")}</span>
      </div>
      <div style={{ width: gutter }} className="shrink-0" aria-hidden="true" />
      <div className="relative" style={{ height: SPACING_TRACK_H, flex: "1 0 auto" }}>
        <canvas ref={ref} role="img" aria-label={t("pathSpacing.aria")} data-marks={marks.map((m) => m.progress.toFixed(4)).join(" ")}
          data-frame={frame} className="pointer-events-none absolute top-0"
          style={{ left: start * ppf, width, height: SPACING_TRACK_H }} />
      </div>
    </div>
  );
}
