/**
 * Scenenavigator (mandat 2, 4.4): alle sceneforekomster i produksjonen i rekkefølge, også deaktiverte.
 * Flytting her er samme handling som i filmtidslinjen (MoveOccurrence, UX P5). Deaktivering er ikke sletting.
 */
import { AlertTriangle, GripVertical } from "lucide-react";
import { useState, type DragEvent, type KeyboardEvent } from "react";
import {
  formatHeading,
  keyBetween,
  orderedOccurrences,
  type ProjectState,
  type SceneOccurrence,
} from "@/core";
import { Switch } from "@/components/ui/switch";
import { uncertainVariants } from "./script-helpers";

interface Props {
  readonly state: ProjectState;
  readonly productionId: string;
  readonly startPages: Readonly<Record<string, number>>;
  readonly selectedOcc: string | null;
  readonly editable: boolean;
  readonly onSelect: (occurrenceId: string) => void;
  readonly onMove: (occurrenceId: string, orderKey: string, label: string) => void;
  readonly onToggleActive: (occurrenceId: string, active: boolean) => void;
}

export function SceneNavigator({
  state,
  productionId,
  startPages,
  selectedOcc,
  editable,
  onSelect,
  onMove,
  onToggleActive,
}: Props) {
  const occs = orderedOccurrences(state, productionId);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const uncertain = uncertainVariants(state);
  const uncertainSet = new Set(occs.filter((o) => uncertain.has(o.variantId)).map((o) => o.id));

  function moveTo(id: string, index: number) {
    const from = occs.findIndex((o) => o.id === id);
    if (from < 0 || index < 0 || index > occs.length || index === from || index === from + 1)
      return;
    const before = index > 0 ? (occs[index - 1]?.orderKey ?? null) : null;
    const after = occs[index]?.orderKey ?? null;
    const o = occs[from]!;
    onMove(id, keyBetween(before, after), `Flytt scene ${o.productionNumber ?? ""}`.trim());
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    if (dragId !== null && dropIndex !== null) moveTo(dragId, dropIndex);
    setDragId(null);
    setDropIndex(null);
  }

  function onKey(e: KeyboardEvent, o: SceneOccurrence, i: number) {
    if (e.altKey && editable && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      moveTo(o.id, e.key === "ArrowUp" ? i - 1 : i + 2);
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = occs[i + (e.key === "ArrowDown" ? 1 : -1)];
      if (next) {
        onSelect(next.id);
        document.getElementById(`nav-${next.id}`)?.focus();
      }
    }
  }

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-border px-3 text-[11px] font-medium uppercase tracking-[0.04em] text-text-tertiary">
        <span>Scener</span>
        <span className="tabular normal-case tracking-normal">
          {occs.filter((o) => o.active).length} aktive av {occs.length}
        </span>
      </div>
      <ol
        aria-label="Scener i produksjonen. Alt + pil flytter valgt scene."
        className="min-h-0 flex-1 overflow-y-auto py-1"
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
      >
        {occs.map((o, i) => {
          const v = state.variants[o.variantId];
          const merged = state.scenes[o.sceneId]?.mergedIntoSceneId != null;
          const selected = o.id === selectedOcc;
          return (
            <li
              key={o.id}
              onDragOver={(e) => {
                if (!dragId) return;
                e.preventDefault();
                const r = e.currentTarget.getBoundingClientRect();
                setDropIndex(e.clientY < r.top + r.height / 2 ? i : i + 1);
              }}
              className="relative"
            >
              {dropIndex === i && dragId ? <DropLine /> : null}
              <div
                draggable={editable && !merged}
                onDragStart={(e) => {
                  setDragId(o.id);
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", o.id);
                }}
                onDragEnd={() => {
                  setDragId(null);
                  setDropIndex(null);
                }}
                className={
                  "group grid grid-cols-[14px_1fr_auto] items-center gap-1.5 px-2 py-1.5 text-[13px] " +
                  (selected ? "bg-accent-selection" : "hover:bg-surface-3") +
                  (o.active ? "" : " opacity-60") +
                  (dragId === o.id ? " opacity-40" : "")
                }
              >
                <GripVertical
                  className={
                    "size-3.5 text-text-tertiary " +
                    (editable && !merged
                      ? "cursor-grab opacity-0 group-hover:opacity-100"
                      : "opacity-0")
                  }
                  aria-hidden
                />
                <button
                  type="button"
                  id={`nav-${o.id}`}
                  tabIndex={selected || (!selectedOcc && i === 0) ? 0 : -1}
                  aria-current={selected ? "true" : undefined}
                  onClick={() => onSelect(o.id)}
                  onKeyDown={(e) => onKey(e, o, i)}
                  className="grid min-w-0 cursor-pointer grid-cols-[34px_1fr] items-center gap-1.5 text-left outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                >
                  <span className="tabular truncate text-right font-mono text-xs text-text-secondary">
                    {o.productionNumber ?? "–"}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-text-primary">
                      {v ? formatHeading(v.heading) : "—"}
                    </span>
                    <span className="flex items-center gap-1.5 text-[11px] text-text-tertiary">
                      {o.active ? (
                        <span className="tabular">s. {startPages[o.id] ?? "–"}</span>
                      ) : (
                        <span>{merged ? "Sammenslått" : "Deaktivert"}</span>
                      )}
                      {uncertainSet.has(o.id) ? (
                        <span className="flex items-center gap-0.5 text-status-uncertain">
                          <AlertTriangle className="size-3" aria-hidden />
                          Usikker
                        </span>
                      ) : null}
                      {v && v.ownerProductionId !== null ? <span>Egen variant</span> : null}
                    </span>
                  </span>
                </button>
                <Switch
                  checked={o.active}
                  disabled={!editable || merged}
                  onCheckedChange={(on) => onToggleActive(o.id, on)}
                  aria-label={`${o.active ? "Deaktiver" : "Aktiver"} scene ${o.productionNumber ?? "uten nummer"}`}
                  className="scale-75"
                />
              </div>
            </li>
          );
        })}
        {dropIndex === occs.length && dragId ? (
          <li className="relative h-1" aria-hidden>
            <DropLine />
          </li>
        ) : null}
      </ol>
    </div>
  );
}

function DropLine() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-2 -top-px h-0.5 bg-accent-brand"
    />
  );
}
