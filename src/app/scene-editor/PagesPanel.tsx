/**
 * Sidepanelet for tittel- og tekstscener (MTS MT6, §27–38): sidene er vanlige lag av typen «page» med
 * `activeRange` som synlighetsintervall og `pageTransition` som overgangen inn i siden. De lages, døpes om,
 * dupliseres og fjernes med de vanlige lagkommandoene, så alt kan angres.
 */
import { useMemo } from "react";
import { TRANSITION_KINDS, compositionDuration, layerFieldsOf, layersOf, newId, type Command, type Composition, type ProjectState, type TransitionKind } from "@/core";
import { PanelHeader } from "@/app/shell/workspace-chrome";
import { Button } from "@/components/ui/button";
import { t, tLocalized } from "@/core/i18n/keyed";

const TRANSITION_LABEL: Record<TransitionKind, string> = tLocalized({ cut: "app-scene-editor-pages-panel.transition-cut", dissolve: "app-scene-editor-pages-panel.transition-dissolve", dip: "app-scene-editor-pages-panel.transition-dip", dipWhite: "app-scene-editor-pages-panel.transition-dipwhite", wipe: "app-scene-editor-pages-panel.transition-wipe", push: "app-scene-editor-pages-panel.transition-push", iris: "app-scene-editor-pages-panel.transition-iris" });

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
              name: t("app-scene-editor-pages-panel.name.name.476d269b640a", { value1: String(pages.length + 1) }),
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
      t("app-scene-editor-pages-panel.error.run.a0323c1e15b4"),
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
      t("app-scene-editor-pages-panel.set-transition.run.923a5513653e"),
    );
  };

  const duplicate = (layerId: string) => {
    const layer = pages.find((p) => p.id === layerId);
    if (!layer) return;
    const children = layersOf(state, composition.id).filter((l) => l.groupId === layerId);
    const newPageId = newId<"composition_layer">();
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
              name: `${layer.name} (${t("app-scene-editor-pages-panel.name.name.619c3ecea4f6")})`,
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
      t("app-scene-editor-pages-panel.duplicate.run.8d9e6e76d8d3"),
    );
  };

  return (
    <section className="flex min-h-0 flex-col" data-testid="mts-pages-panel">
      <PanelHeader title={t("app-scene-editor-pages-panel.pages-panel.title.650aa4bff1cb")} />
      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-2">
        {pages.length === 0 ? (
          <p className="text-xs text-text-tertiary">
            {t("app-scene-editor-pages-panel.pages-panel.p.5b2d7a7e97dc")}
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
              {p.name || `${t("app-scene-editor-pages-panel.pages-panel.button.8b0952ce532b")} ${i + 1}`}
            </button>
            <span className="text-[11px] text-text-tertiary">
              {p.activeRange ? `${p.activeRange.from}–${p.activeRange.to}` : t("app-scene-editor-pages-panel.pages-panel.span.b201fd8902c6")}
            </span>
            <select
              className="h-7 rounded-sm border border-border-control bg-surface-3 px-1 text-[12px] text-text-primary"
              aria-label={t("app-scene-editor-pages-panel.pages-panel.aria-label.22df8d40d321")}
              data-testid="mts-page-transition"
              disabled={!editable}
              value={p.pageTransition?.kind ?? "cut"}
              onChange={(e) => setTransition(p.id, e.target.value as TransitionKind)}
            >
              {TRANSITION_KINDS.map((k) => (
                <option key={k} value={k}>
                  {TRANSITION_LABEL[k]}
                </option>
              ))}
            </select>
            {editable ? (
              <Button
                size="sm"
                variant="ghost"
                data-testid="mts-page-duplicate"
                title={t("app-scene-editor-pages-panel.pages-panel.title.ace7a4250c6e")}
                onClick={() => duplicate(p.id)}
              >
                {t("app-scene-editor-pages-panel.pages-panel.button.6b4ee0b29749")}
              </Button>
            ) : null}
          </div>
        ))}
        {editable ? (
          <Button size="sm" variant="outline" data-testid="mts-add-page" onClick={addPage}>
            {t("app-scene-editor-pages-panel.pages-panel.button.2111edecfebf")}
          </Button>
        ) : null}
      </div>
      <p className="px-2 pb-2 text-[11px] text-text-tertiary">
        {t("app-scene-editor-pages-panel.pages-panel.p.deda5946ea31")}
      </p>
    </section>
  );
}
