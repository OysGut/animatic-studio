/**
 * Sidepanelet for tittel- og tekstscener (MTS MT6, §27–38): sidene er vanlige lag av typen «page» med
 * `activeRange` som synlighetsintervall og `pageTransition` som overgangen inn i siden. De lages, døpes om,
 * dupliseres og fjernes med de vanlige lagkommandoene, så alt kan angres.
 */
import { useMemo } from "react";
import {
  L,
  TRANSITION_KINDS,
  compositionDuration,
  keyBetween,
  layerFieldsOf,
  layersOf,
  newId,
  type Command,
  type Composition,
  type ProjectState,
  type TransitionKind,
} from "@/core";
import { PanelHeader } from "@/app/shell/workspace-chrome";
import { Button } from "@/components/ui/button";

const TRANSITION_LABEL: Record<TransitionKind, { nb: string; en: string }> = {
  cut: { nb: "Kutt", en: "Cut" },
  dissolve: { nb: "Tone", en: "Dissolve" },
  dip: { nb: "Via svart", en: "Dip to black" },
  dipWhite: { nb: "Via hvitt", en: "Dip to white" },
  wipe: { nb: "Visk", en: "Wipe" },
  push: { nb: "Skyv", en: "Push" },
  iris: { nb: "Irismaske", en: "Iris" },
};

export function PagesPanel({
  state,
  composition,
  editable,
  run,
  onSelect,
}: {
  state: ProjectState;
  composition: Composition;
  editable: boolean;
  run: (command: Command, label: string, group?: string) => string | null;
  onSelect: (layerId: string) => void;
}) {
  const duration = compositionDuration(state, composition);
  const pages = useMemo(
    () => layersOf(state, composition.id).filter((l) => l.kind === "page"),
    [state, composition.id],
  );

  const addPage = () => {
    const last = pages[pages.length - 1];
    const from = last?.activeRange?.to ?? 0;
    const layerId = newId<"composition_layer">();
    const error = run(
      {
        type: "AddLayers",
        layers: [
          {
            layerId: layerId as never,
            compositionId: composition.id,
            fields: {
              kind: "page",
              name: L(`Side ${pages.length + 1}`, `Page ${pages.length + 1}`),
              assetId: null,
              assetVariantId: null,
              versionId: null,
              fill: null,
              width: 1,
              height: 1,
              parallax: 1,
              transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 },
              keyframes: [],
              visible: true,
              locked: false,
              groupId: null,
              swaps: [],
              path: null,
              anchor: null,
              activeRange: { from, to: Math.min(duration, from + Math.round(duration / 3) || duration) },
              text: null,
              shape: null,
              effects: null,
              template: null,
              pageTransition: null,
            },
          },
        ],
      },
      L("Ny side", "New page"),
    );
    if (!error) onSelect(layerId);
  };

  const setTransition = (layerId: string, kind: TransitionKind) => {
    const layer = pages.find((p) => p.id === layerId);
    if (!layer) return;
    run(
      {
        type: "UpdateLayers",
        layers: [
          {
            layerId: layer.id,
            fields: {
              ...layerFieldsOf(layer),
              pageTransition: kind === "cut" ? null : { kind, frames: 12 },
            },
          },
        ],
      },
      L("Endre sideovergang", "Change page transition"),
    );
  };

  const duplicate = (layerId: string) => {
    const layer = pages.find((p) => p.id === layerId);
    if (!layer) return;
    const children = layersOf(state, composition.id).filter((l) => l.groupId === layerId);
    const newPageId = newId<"composition_layer>();
    const last = pages[pages.length - 1]!;
    const span = (layer.activeRange?.to ?? 0) - (layer.activeRange?.from ?? 0);
    const from = last.activeRange?.to ?? 0;
    run(
      {
        type: "AddLayers",
        layers: [
          {
            layerId: newPageId as never,
            compositionId: composition.id,
            fields: {
              ...layerFieldsOf(layer),
              name: `${layer.name} (${L("kopi", "copy")})`,
              activeRange: { from, to: Math.min(duration, from + span) },
            },
          },
          ...children.map((c) => ({
            layerId: newId<"composition_layer">() as never,
            compositionId: composition.id,
            fields: { ...layerFieldsOf(c), groupId: newPageId as never },
          })),
        ],
      },
      L("Dupliser siden", "Duplicate the page"),
    );
  };

  return (
    <section className="flex min-h-0 flex-col" data-testid="mts-pages-panel">
      <PanelHeader title={L("Sider", "Pages")} />
      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-2">
        {pages.length === 0 ? (
          <p className="text-xs text-text-tertiary">
            {L(
              "Siden deler tittelen eller tekstscenen i trinn. Hver side har sitt tidsrom og sin overgang.",
              "Pages divide the title or text scene into steps. Each page has its own time range and transition.",
            )}
          </p>
        ) : null}
        {pages.map((p, i) => (
          <div
            key={p.id}
            data-testid="mts-page-row"
            data-layer-id={p.id}
            className="flex items-center gap-2 rounded-sm border border-border bg-surface-1 px-2 py-1"
          >
            <button
              type="button"
              className="min-w-0 flex-1 truncate text-left text-[13px] text-text-primary hover:text-accent-brand"
              onClick={() => onSelect(p.id)}
            >
              {p.name || `${L("Side", "Page")} ${i + 1}`}
            </button>
            <span className="text-[11px] text-text-tertiary">
              {p.activeRange ? `${p.activeRange.from}–${p.activeRange.to}` : L("hele", "all")}
            </span>
            <select
              className="h-7 rounded-sm border border-border-control bg-surface-3 px-1 text-[12px] text-text-primary"
              aria-label={L("Overgang inn i siden", "Transition into the page")}
              data-testid="mts-page-transition"
              disabled={!editable}
              value={p.pageTransition?.kind ?? "cut"}
              onChange={(e) => setTransition(p.id, e.target.value as TransitionKind)}
            >
              {TRANSITION_KINDS.map((k) => (
                <option key={k} value={k}>
                  {L(TRANSITION_LABEL[k].nb, TRANSITION_LABEL[k].en)}
                </option>
              ))}
            </select>
            {editable ? (
              <Button
                size="sm"
                variant="ghost"
                data-testid="mts-page-duplicate"
                title={L("Dupliser siden med innholdet", "Duplicate the page with its content")}
                onClick={() => duplicate(p.id)}
              >
                {L("Dupliser", "Duplicate")}
              </Button>
            ) : null}
          </div>
        ))}
        {editable ? (
          <Button size="sm" variant="outline" data-testid="mts-add-page" onClick={addPage}>
            {L("Ny side", "New page")}
          </Button>
        ) : null}
      </div>
      <p className="px-2 pb-2 text-[11px] text-text-tertiary">
        {keyBetween ? "" : ""}
        {L(
          "Lagene i scenen legges inn i siden du velger. Tidsrommet dras i tidslinjen.",
          "The layers in the scene are placed in the page you select. The time range is dragged in the timeline.",
        )}
      </p>
    </section>
  );
}
