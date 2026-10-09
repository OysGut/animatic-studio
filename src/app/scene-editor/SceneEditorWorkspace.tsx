/**
 * Sceneeditoren (M3 del 2, mandat kap. 11, DEC-0035): én 2D-scene per scene i manuset, bygget av lag
 * (bakgrunner, mellomgrunner, karakterer, objekter …) med bilder fra ressursbiblioteket eller fargeflater.
 * Kamera, tidslinje og avspilling kommer i neste leveranse (mandat kap. 12).
 */
import { Layers, Plus, Redo2, Undo2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  COMPOSITION_FORMATS,
  DEFAULT_COMPOSITION,
  compositionOfVariant,
  formatHeading,
  layerVersion,
  layersOf,
  mainProduction,
  newId,
  orderedOccurrences,
  type Composition,
  type ProjectState,
} from "@/core";
import { canEdit, useMembers, useProjectState } from "@/app/project/use-project";
import { useCommands, type Commands } from "@/app/project/use-commands";
import { SaveIndicator } from "@/app/script/ScriptWorkspace";
import { useImageUrls } from "@/app/library/asset-images";
import { Button } from "@/components/ui/button";
import { AddLayerDialog } from "./AddLayerDialog";
import { CompositionInspector, LayerInspector } from "./LayerInspector";
import { LayersPanel } from "./LayersPanel";
import { Stage } from "./Stage";

export function SceneEditorWorkspace({
  projectId,
  userId,
  initialOccurrenceId,
}: {
  projectId: string;
  userId: string;
  initialOccurrenceId: string | null;
}) {
  const query = useProjectState(projectId);
  const members = useMembers(projectId);
  const role = members.data?.find((m) => m.user_id === userId)?.role;
  const editable = canEdit(role);
  const cmds = useCommands(projectId, userId, editable);
  if (query.isLoading)
    return <p className="p-6 text-[13px] text-text-tertiary">Henter scenene …</p>;
  if (query.isError || !query.data)
    return (
      <div role="alert" className="p-6 text-[13px] text-status-danger">
        Scenene kunne ikke hentes.
        {query.error ? (
          <p className="mt-2 font-mono text-xs text-text-tertiary">
            Teknisk detalj: {query.error.message}
          </p>
        ) : null}
      </div>
    );
  return (
    <Editor
      state={query.data}
      editable={editable}
      roleKnown={members.isSuccess}
      cmds={cmds}
      initialOccurrenceId={initialOccurrenceId}
    />
  );
}

function Editor({
  state,
  editable,
  roleKnown,
  cmds,
  initialOccurrenceId,
}: {
  state: ProjectState;
  editable: boolean;
  roleKnown: boolean;
  cmds: Commands;
  initialOccurrenceId: string | null;
}) {
  const productionId = mainProduction(state)?.id ?? Object.keys(state.productions)[0] ?? "";
  const occurrences = useMemo(() => orderedOccurrences(state, productionId), [state, productionId]);
  const [occurrenceId, setOccurrenceId] = useState<string | null>(
    () =>
      (initialOccurrenceId && state.occurrences[initialOccurrenceId]
        ? initialOccurrenceId
        : occurrences[0]?.id) ?? null,
  );
  const occurrence = occurrenceId ? state.occurrences[occurrenceId] : undefined;
  const variant = occurrence ? state.variants[occurrence.variantId] : undefined;
  const composition = variant ? compositionOfVariant(state, variant.id) : null;
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Valgt lag som er slettet eller tilhører en annen scene, velges bort
  const selectedLayer =
    selectedLayerId && composition
      ? (() => {
          const l = state.layers[selectedLayerId];
          return l && !l.removed && l.compositionId === composition.id ? l : null;
        })()
      : null;
  useEffect(() => {
    if (selectedLayerId && !selectedLayer) setSelectedLayerId(null);
  }, [selectedLayerId, selectedLayer]);

  // Signerte lenker for bildene i scenen
  const paths = useMemo(() => {
    if (!composition) return [];
    const out: string[] = [];
    for (const l of layersOf(state, composition.id)) {
      const v = layerVersion(state, l);
      if (v) out.push(v.mediaPath);
    }
    return out;
  }, [state, composition]);
  const urls = useImageUrls(paths);

  const hasComposition = useMemo(() => {
    const set = new Set<string>();
    for (const c of Object.values(state.compositions)) if (!c.removed) set.add(c.variantId);
    return set;
  }, [state.compositions]);

  function create(format: (typeof COMPOSITION_FORMATS)[number]) {
    if (!variant) return;
    setError(
      cmds.run(
        {
          type: "CreateComposition",
          compositionId: newId<"composition">(),
          variantId: variant.id,
          fields: { ...DEFAULT_COMPOSITION, width: format.width, height: format.height },
        },
        "Ny 2D-scene",
      ),
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border bg-surface-2 px-3">
        <span className="text-[13px] font-medium text-text-primary">Sceneeditor</span>
        <div className="mx-1 h-5 w-px bg-border" aria-hidden />
        <Button
          size="sm"
          variant="ghost"
          onClick={cmds.undo}
          disabled={!cmds.canUndo}
          title={cmds.undoLabel ? `Angre: ${cmds.undoLabel} (⌘Z)` : "Angre (⌘Z)"}
          aria-label={cmds.undoLabel ? `Angre: ${cmds.undoLabel}` : "Angre"}
        >
          <Undo2 />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={cmds.redo}
          disabled={!cmds.canRedo}
          title={cmds.redoLabel ? `Gjør om: ${cmds.redoLabel} (⇧⌘Z)` : "Gjør om (⇧⌘Z)"}
          aria-label={cmds.redoLabel ? `Gjør om: ${cmds.redoLabel}` : "Gjør om"}
        >
          <Redo2 />
        </Button>
        {editable && composition ? (
          <Button size="sm" variant="secondary" onClick={() => setAddOpen(true)}>
            <Plus />
            Legg til lag
          </Button>
        ) : null}
        <div className="ml-auto flex items-center gap-3">
          <SaveIndicator cmds={cmds} />
          {roleKnown && !editable ? (
            <span className="text-xs text-text-tertiary">Bare lesetilgang</span>
          ) : null}
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Scenene i manuset */}
        <nav
          aria-label="Scener"
          className="flex w-[232px] shrink-0 flex-col overflow-y-auto border-r border-border bg-surface-1 py-1"
        >
          <h2 className="px-3 pb-1 pt-2 text-xs font-medium uppercase tracking-[0.04em] text-text-tertiary">
            Scener
          </h2>
          {occurrences.length === 0 ? (
            <p className="px-3 text-xs text-text-tertiary">Ingen scener. Importer manuset først.</p>
          ) : null}
          {occurrences.map((o) => {
            const v = state.variants[o.variantId];
            const on = o.id === occurrenceId;
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => {
                  setOccurrenceId(o.id);
                  setSelectedLayerId(null);
                }}
                aria-current={on ? "true" : undefined}
                className={
                  "flex items-baseline gap-2 px-3 py-1 text-left text-[12px] " +
                  (on
                    ? "bg-accent-selection text-text-primary"
                    : "text-text-secondary hover:bg-surface-3 hover:text-text-primary") +
                  (o.active ? "" : " opacity-50")
                }
              >
                <span className="w-7 shrink-0 font-mono text-[11px] text-text-tertiary">
                  {o.productionNumber ?? "–"}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {v ? formatHeading(v.heading) : "?"}
                </span>
                {v && hasComposition.has(v.id) ? (
                  <Layers className="size-3 shrink-0 text-accent-brand" aria-label="Har 2D-scene" />
                ) : null}
              </button>
            );
          })}
        </nav>

        {/* Arbeidsflaten */}
        <main className="flex min-w-0 flex-1 flex-col bg-surface-0">
          {!occurrence || !variant ? (
            <p className="m-auto text-[13px] text-text-tertiary">Velg en scene.</p>
          ) : !composition ? (
            <EmptyScene
              title={formatHeading(variant.heading)}
              editable={editable}
              onCreate={create}
              error={error}
            />
          ) : (
            <Stage
              state={state}
              composition={composition}
              editable={editable}
              selectedLayerId={selectedLayer?.id ?? null}
              onSelect={setSelectedLayerId}
              run={cmds.run}
              imageUrls={urls.data ?? {}}
            />
          )}
        </main>

        {/* Lag og egenskaper */}
        {composition ? (
          <aside
            aria-label="Lag og egenskaper"
            className="flex w-[300px] shrink-0 flex-col overflow-y-auto border-l border-border bg-surface-1"
          >
            <LayersPanel
              state={state}
              composition={composition}
              editable={editable}
              selectedLayerId={selectedLayer?.id ?? null}
              onSelect={setSelectedLayerId}
              run={cmds.run}
            />
            <div className="border-t border-border">
              {selectedLayer ? (
                <LayerInspector
                  key={selectedLayer.id}
                  state={state}
                  composition={composition}
                  layer={selectedLayer}
                  editable={editable}
                  run={cmds.run}
                />
              ) : (
                <CompositionInspector
                  key={composition.id}
                  composition={composition}
                  editable={editable}
                  run={cmds.run}
                />
              )}
            </div>
          </aside>
        ) : null}
      </div>

      {composition && editable ? (
        <AddLayerDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          state={state}
          composition={composition}
          run={cmds.run}
          onAdded={setSelectedLayerId}
        />
      ) : null}
    </div>
  );
}

function EmptyScene({
  title,
  editable,
  onCreate,
  error,
}: {
  title: string;
  editable: boolean;
  onCreate: (f: (typeof COMPOSITION_FORMATS)[number]) => void;
  error: string | null;
}) {
  const [format, setFormat] = useState(0);
  return (
    <div className="m-auto flex max-w-[420px] flex-col items-center gap-3 text-center">
      <Layers className="size-8 text-text-tertiary" aria-hidden />
      <p className="text-[13px] text-text-secondary">
        <span className="font-medium text-text-primary">{title}</span> har ingen 2D-scene ennå.
      </p>
      {editable ? (
        <>
          <label className="flex items-center gap-2 text-xs text-text-secondary">
            Bildeformat
            <select
              value={format}
              onChange={(e) => setFormat(Number(e.target.value))}
              className="h-7 rounded-sm border border-border-control bg-surface-3 px-1.5 text-xs text-text-primary"
            >
              {COMPOSITION_FORMATS.map((f, i) => (
                <option key={f.label} value={i}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
          <Button onClick={() => onCreate(COMPOSITION_FORMATS[format]!)}>Lag 2D-scene</Button>
        </>
      ) : (
        <p className="text-xs text-text-tertiary">Du har bare lesetilgang.</p>
      )}
      {error ? (
        <p role="alert" className="text-xs text-status-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export type { Composition };
