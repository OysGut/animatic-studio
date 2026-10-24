/**
 * C-1 status surface: «In progress in …», «Returned, awaiting approval» or a conflict, for an asset,
 * panel, audio clip or scene. Shown in the library, the scene editor and the storyboard panel. Read-only.
 */
import { useContext } from "react";
import { QueryClientContext } from "@tanstack/react-query";
import { surfaceStatus, type HandoffRow } from "@/core/handoff";
import { ADAPTERS } from "@/core/connectors";
import { t } from "@/core/i18n/keyed";
import { useHandoffs } from "./use-handoffs";

export function statusText(s: ReturnType<typeof surfaceStatus>): string | null {
  if (!s) return null;
  if (s.kind === "conflict") return t("c1.status.conflict");
  if (s.kind === "returned") return t("c1.status.returned");
  const names = s.adapters.map((id) => ADAPTERS.find((a) => a.id === id)?.name ?? id);
  return t("c1.status.out", { app: names.join(", ") });
}

export function HandoffStatusView({ rows, target, now = Date.now() }: { rows: readonly HandoffRow[]; target: { kind: "asset" | "panel" | "clip" | "scene"; id: string }; now?: number }) {
  const s = surfaceStatus(rows, target, now);
  const text = statusText(s);
  if (!s || !text) return null;
  const tone = s.kind === "conflict" ? "border-destructive text-destructive" : s.kind === "returned" ? "border-accent-brand text-accent-brand" : "border-border text-muted-foreground";
  return (
    <span data-testid="handoff-status" data-status={s.kind} role="status" className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs ${tone}`}>
      {text}
    </span>
  );
}

/** Renders nothing outside a query client (isolated component tests and previews without the app shell). */
export function HandoffStatus(props: { projectId: string; target: { kind: "asset" | "panel" | "clip" | "scene"; id: string } }) {
  return useContext(QueryClientContext) ? <HandoffStatusLive {...props} /> : null;
}
function HandoffStatusLive({ projectId, target }: { projectId: string; target: { kind: "asset" | "panel" | "clip" | "scene"; id: string } }) {
  const rows = useHandoffs(projectId);
  return <HandoffStatusView rows={rows} target={target} />;
}
