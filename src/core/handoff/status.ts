/**
 * C-1: status surface per scene, asset and panel: «In progress in …», «Returned, awaiting approval» and
 * conflict. Pure; computed from hand-off rows, so it never writes and never applies anything.
 */
export type HandoffRowStatus = "out" | "returned" | "conflict" | "closed" | "revoked";
export interface HandoffRow {
  readonly id: string;
  readonly targetKind: "asset" | "panel" | "clip" | "scene";
  readonly targetId: string;
  readonly assetId: string | null;
  readonly sceneId: string | null;
  readonly adapter: string;
  readonly format: string;
  readonly status: HandoffRowStatus;
  readonly expiresAt: string;
  readonly candidateVersionId: string | null;
  readonly createdAt: string;
}
export type SurfaceStatus =
  | { readonly kind: "conflict"; readonly rows: readonly HandoffRow[] }
  | { readonly kind: "returned"; readonly rows: readonly HandoffRow[] }
  | { readonly kind: "out"; readonly rows: readonly HandoffRow[]; readonly adapters: readonly string[] };

const PRIORITY = { conflict: 0, returned: 1, out: 2 } as const;

export function isOpen(r: HandoffRow, nowMs: number): boolean {
  if (r.status === "closed" || r.status === "revoked") return false;
  return r.status !== "out" || Date.parse(r.expiresAt) > nowMs;
}
export function rowsFor(rows: readonly HandoffRow[], target: { kind: "asset" | "panel" | "clip" | "scene"; id: string }): HandoffRow[] {
  return rows.filter((r) =>
    (r.targetKind === target.kind && r.targetId === target.id) ||
    (target.kind === "asset" && r.assetId === target.id) ||
    (target.kind === "scene" && r.sceneId === target.id));
}
/** Most important open status for a target: conflict, then returned, then out. Null when nothing is open. */
export function surfaceStatus(rows: readonly HandoffRow[], target: { kind: "asset" | "panel" | "clip" | "scene"; id: string }, nowMs: number): SurfaceStatus | null {
  const open = rowsFor(rows, target).filter((r) => isOpen(r, nowMs));
  if (!open.length) return null;
  const kind = open.map((r) => r.status as keyof typeof PRIORITY).sort((a, b) => PRIORITY[a] - PRIORITY[b])[0]!;
  const sel = open.filter((r) => r.status === kind);
  return kind === "out" ? { kind, rows: sel, adapters: [...new Set(sel.map((r) => r.adapter))] } : { kind, rows: sel };
}
