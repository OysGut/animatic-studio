/**
 * Lagliste for 2D-scenen: forreste lag øverst. Valg, synlighet, lås og rekkefølge (knapper og dra-og-slipp).
 */
import { ChevronDown, ChevronUp, Eye, EyeOff, Lock, Unlock } from "lucide-react";
import { useMemo, useState } from "react";
import {
  LAYER_KIND_LABEL,
  layerVersion,
  layersOf,
  type Command,
  type Composition,
  type CompositionLayer,
  type ProjectState,
} from "@/core";
import { useImageUrls } from "@/app/library/asset-images";
import { layerFieldsOf as fieldsOf } from "@/core";

interface Props {
  readonly state: ProjectState;
  readonly composition: Composition;
  readonly editable: boolean;
  readonly selectedLayerId: string | null;
  readonly onSelect: (id: string | null) => void;
  readonly run: (command: Command, label: string) => string | null;
}

const iconButton =
  "inline-flex size-6 shrink-0 items-center justify-center rounded-sm text-text-secondary hover:bg-surface-3 hover:text-text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent";

export function LayersPanel({
  state,
  composition,
  editable,
  selectedLayerId,
  onSelect,
  run,
}: Props) {
  // Bakerst først (som i modellen); listen vises med forreste lag øverst
  const back = useMemo(() => layersOf(state, composition.id), [state, composition.id]);
  const front = useMemo(() => [...back].reverse(), [back]);
  const paths = useMemo(() => {
    const out: string[] = [];
    for (const l of back) {
      const v = layerVersion(state, l);
      if (v) out.push(v.mediaPath);
    }
    return out;
  }, [state, back]);
  const urls = useImageUrls(paths).data;
  const [error, setError] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ id: string; after: boolean } | null>(null);

  function exec(command: Command, label: string) {
    setError(run(command, label));
  }

  function toggle(l: CompositionLayer, key: "visible" | "locked") {
    const f = fieldsOf(l);
    const next = { ...f, [key]: !f[key] };
    exec(
      { type: "UpdateLayers", layers: [{ layerId: l.id, fields: next }] },
      key === "visible"
        ? l.visible
          ? "Skjul lag"
          : "Vis lag"
        : l.locked
          ? "Lås opp lag"
          : "Lås lag",
    );
  }

  function moveBefore(layerId: string, beforeLayerId: string | null, label: string) {
    exec(
      { type: "MoveLayer", layerId: layerId as never, beforeLayerId: beforeLayerId as never },
      label,
    );
  }

  function forward(l: CompositionLayer) {
    const i = back.findIndex((x) => x.id === l.id);
    if (i < 0 || i >= back.length - 1) return;
    moveBefore(l.id, back[i + 2]?.id ?? null, "Flytt lag fram");
  }

  function backward(l: CompositionLayer) {
    const i = back.findIndex((x) => x.id === l.id);
    const target = back[i - 1];
    if (i <= 0 || !target) return;
    moveBefore(l.id, target.id, "Flytt lag bak");
  }

  /** Slipp `dragged` rett foran (after=false: over målet i listen) eller rett bak målraden. */
  function dropOn(draggedId: string, targetId: string, inFront: boolean) {
    if (draggedId === targetId) return;
    const i = back.findIndex((x) => x.id === draggedId);
    const j = back.findIndex((x) => x.id === targetId);
    if (i < 0 || j < 0) return;
    let before: string | null;
    if (inFront) {
      let k = j + 1;
      if (back[k]?.id === draggedId) k++;
      before = back[k]?.id ?? null;
    } else {
      before = targetId;
    }
    const currentNext = back[i + 1]?.id ?? null;
    if (before === currentNext) return; // ligger allerede der
    moveBefore(draggedId, before, "Flytt lag");
  }

  return (
    <section aria-label="Lag" className="flex flex-col py-1">
      <h2 className="px-3 pb-1 pt-2 text-xs font-medium uppercase tracking-[0.04em] text-text-tertiary">
        Lag ({back.length})
      </h2>
      {back.length === 0 ? (
        <p className="px-3 pb-2 text-xs text-text-tertiary">Ingen lag ennå. Bruk «Legg til lag».</p>
      ) : (
        <ul className="flex max-h-[280px] flex-col overflow-y-auto">
          {front.map((l, idx) => {
            const on = l.id === selectedLayerId;
            const version = layerVersion(state, l);
            const url = version ? urls?.[version.mediaPath] : undefined;
            const isFront = idx === 0;
            const isBack = idx === front.length - 1;
            const dropping = drop?.id === l.id && dragId !== null && dragId !== l.id;
            return (
              <li
                key={l.id}
                draggable={editable}
                onDragStart={(e) => {
                  setDragId(l.id);
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", l.id);
                }}
                onDragEnd={() => {
                  setDragId(null);
                  setDrop(null);
                }}
                onDragOver={(e) => {
                  if (!dragId) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  const r = e.currentTarget.getBoundingClientRect();
                  const after = e.clientY > r.top + r.height / 2;
                  setDrop((d) =>
                    d && d.id === l.id && d.after === after ? d : { id: l.id, after },
                  );
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const r = e.currentTarget.getBoundingClientRect();
                  const lower = e.clientY > r.top + r.height / 2;
                  if (dragId) dropOn(dragId, l.id, !lower);
                  setDragId(null);
                  setDrop(null);
                }}
                className={
                  "group relative flex items-center gap-1 pr-2 " +
                  (on ? "bg-accent-selection" : "hover:bg-surface-3") +
                  (dragId === l.id ? " opacity-50" : "")
                }
              >
                {dropping ? (
                  <span
                    aria-hidden
                    className={
                      "pointer-events-none absolute inset-x-0 h-0.5 bg-accent-brand " +
                      (drop.after ? "bottom-0" : "top-0")
                    }
                  />
                ) : null}
                <button
                  type="button"
                  onClick={() => onSelect(l.id)}
                  aria-pressed={on}
                  className="flex min-w-0 flex-1 items-center gap-2 py-1 pl-3 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <span
                    aria-hidden
                    className="h-5 w-8 shrink-0 overflow-hidden rounded-sm border border-border bg-surface-3"
                    style={l.fill && l.assetId === null ? { backgroundColor: l.fill } : undefined}
                  >
                    {url ? <img src={url} alt="" className="size-full object-cover" /> : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={
                        "block truncate text-[13px] " +
                        (l.visible ? "text-text-primary" : "text-text-tertiary")
                      }
                    >
                      {l.name || "Uten navn"}
                    </span>
                    <span className="block truncate text-[11px] text-text-tertiary">
                      {LAYER_KIND_LABEL[l.kind]}
                    </span>
                  </span>
                </button>
                {editable ? (
                  <span
                    className={
                      "items-center " +
                      (on ? "flex" : "hidden group-focus-within:flex group-hover:flex")
                    }
                  >
                    <button
                      type="button"
                      className={iconButton}
                      onClick={() => forward(l)}
                      disabled={isFront}
                      aria-label="Flytt lag fram"
                      title="Fram"
                    >
                      <ChevronUp className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      className={iconButton}
                      onClick={() => backward(l)}
                      disabled={isBack}
                      aria-label="Flytt lag bak"
                      title="Bak"
                    >
                      <ChevronDown className="size-3.5" />
                    </button>
                  </span>
                ) : null}
                {editable ? (
                  <button
                    type="button"
                    className={iconButton}
                    onClick={() => toggle(l, "visible")}
                    aria-label={l.visible ? "Skjul lag" : "Vis lag"}
                    title={l.visible ? "Skjul lag" : "Vis lag"}
                  >
                    {l.visible ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                  </button>
                ) : l.visible ? null : (
                  <EyeOff className="size-3.5 text-text-tertiary" aria-label="Skjult" />
                )}
                {editable ? (
                  <button
                    type="button"
                    className={
                      iconButton +
                      (l.locked
                        ? " !text-accent-brand"
                        : on
                          ? ""
                          : " !text-text-tertiary hover:!text-text-primary")
                    }
                    onClick={() => toggle(l, "locked")}
                    aria-label={l.locked ? "Lås opp lag" : "Lås lag"}
                    title={l.locked ? "Lås opp lag" : "Lås lag"}
                  >
                    {l.locked ? <Lock className="size-3.5" /> : <Unlock className="size-3.5" />}
                  </button>
                ) : l.locked ? (
                  <Lock className="size-3.5 text-text-tertiary" aria-label="Låst" />
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {error ? (
        <p role="alert" className="px-3 pt-1 text-xs text-status-danger">
          {error}
        </p>
      ) : null}
    </section>
  );
}
