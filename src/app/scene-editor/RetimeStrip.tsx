/**
 * Før/etter-stripe for ny scenevarighet (SV1): to rader i samme målestokk med mellomrom (fleksibel tid),
 * låste tidsrom og den nye tiden. Bare visning.
 */
import { L, type LockedRange, type RetimeReport } from "@/core";
import { t } from "@/core/i18n/keyed";

export function RetimeStrip({
  report,
  locked,
  fps,
}: {
  report: RetimeReport;
  locked: readonly LockedRange[];
  fps: number;
}) {
  const max = Math.max(report.beforeFrames, report.afterFrames, 1);
  const pct = (f: number) => `${(Math.max(0, f) / max) * 100}%`;
  const row = (
    label: string,
    frames: number,
    gaps: readonly { startFrame: number; endFrame: number }[],
    testId: string,
    extra?: { from: number; to: number } | null,
  ) => (
    <div className="flex items-center gap-2" data-testid={testId}>
      <span className="w-12 shrink-0 text-xs text-text-tertiary">{label}</span>
      <div className="relative h-4 flex-1 rounded-sm bg-surface-1">
        <div
          className="absolute inset-y-0 left-0 rounded-sm bg-surface-3"
          style={{ width: pct(frames) }}
        />
        {gaps.map((g, i) => (
          <div
            key={i}
            className="absolute inset-y-1 rounded-sm bg-accent-brand/40"
            style={{ left: pct(g.startFrame), width: pct(g.endFrame - g.startFrame) }}
          />
        ))}
        {testId === "retime-strip-before"
          ? locked.map((r) => (
              <div
                key={r.id}
                title={r.label}
                className="absolute inset-y-0 border-x border-accent-warm bg-accent-warm/30"
                style={{ left: pct(r.startFrame), width: pct(r.endFrame - r.startFrame) }}
              />
            ))
          : null}
        {extra ? (
          <div
            className="absolute inset-y-0 bg-status-success/40"
            style={{ left: pct(extra.from), width: pct(extra.to - extra.from) }}
          />
        ) : null}
      </div>
      <span className="w-14 shrink-0 text-right font-mono text-xs text-text-secondary">
        {(frames / fps).toFixed(2)} s
      </span>
    </div>
  );
  const d = report.afterFrames - report.beforeFrames;
  const added =
    d > 0 && report.method === "start"
      ? { from: 0, to: d }
      : d > 0 && report.method === "end"
        ? { from: report.beforeFrames, to: report.afterFrames }
        : null;
  return (
    <div className="space-y-1" aria-label={t("app-scene-editor-retime-strip.retime-strip.aria-label.b6cc61e4c670")}>
      {row(t("app-scene-editor-retime-strip.retime-strip.row.7d2da0fb7e9b"), report.beforeFrames, report.gapsBefore, "retime-strip-before")}
      {row(t("app-scene-editor-retime-strip.retime-strip.row.c05c0181828c"), report.afterFrames, report.gapsAfter, "retime-strip-after", added)}
    </div>
  );
}
