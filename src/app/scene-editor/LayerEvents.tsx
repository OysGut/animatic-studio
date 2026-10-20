/**
 * Hendelser i manuset for et lag (DEC-0051, REQ-0095/0096): en handling eller replikk kobles til et
 * tidspunkt der laget gjør noe i 2D-scenen. En blokk kan ha flere hendelser, og et lag kan høre til flere
 * blokker. Tiden er i 2D-scenens egen tid, så koblingen følger 2D-scenen også når klippet kuttes.
 */
import { PanelHeader } from "@/app/shell/workspace-chrome";
import { Link2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { blocksOfVariant, locale, mainProduction, newId, type Command, type Composition, type CompositionLayer, type ProjectState } from "@/core";
import { Button } from "@/components/ui/button";
import { t, tLocalized } from "@/core/i18n/keyed";

type Run = (command: Command, label: string) => string | null;

const KIND: Record<string, string> = tLocalized({ action: "app-scene-editor-layer-events.kind.action.e64ea10b7b2f", dialogue: "app-scene-editor-layer-events.kind.dialogue.c95ea972d0f7", shot: "app-scene-editor-layer-events.kind.shot.d3a47dd2bccc" });

export function LayerEvents({
  state,
  composition,
  layer,
  editable,
  frame,
  run,
  onSeek,
}: {
  state: ProjectState;
  composition: Composition;
  layer: CompositionLayer;
  editable: boolean;
  frame: number;
  run: Run;
  onSeek?: (frame: number) => void;
}) {
  const fps = state.project.fps.num / state.project.fps.den;
  // Scenen i hovedfilmen (koblinger hører til en sceneforekomst)
  const occurrence = useMemo(() => {
    const main = mainProduction(state)?.id;
    const all = Object.values(state.occurrences).filter(
      (o) => o.variantId === composition.variantId,
    );
    return all.find((o) => o.productionId === main && o.active) ?? all[0] ?? null;
  }, [state, composition.variantId]);
  const blocks = useMemo(
    () =>
      blocksOfVariant(state, composition.variantId).filter(
        (b) => b.kind === "action" || b.kind === "dialogue" || b.kind === "shot",
      ),
    [state, composition.variantId],
  );
  const links = Object.values(state.timeLinks)
    .filter((l) => !l.removed && l.layerId === layer.id)
    .sort((a, b) => a.startMs - b.startMs);
  const [blockId, setBlockId] = useState("");
  const [error, setError] = useState<string | null>(null);
  if (!occurrence) return null;
  const snippet = (text: string) => (text.length > 48 ? `${text.slice(0, 46)} …` : text);
  const seconds = (ms: number) => `${(Math.round(ms / 100) / 10).toLocaleString(locale())} s`;

  function add() {
    if (!blockId || !occurrence) return;
    setError(
      run(
        {
          type: "AddTimeLinks",
          links: [
            {
              linkId: newId() as never,
              fields: {
                occurrenceId: occurrence.id,
                blockId: blockId as never,
                startMs: Math.max(0, Math.round((frame / fps) * 1000)),
                endMs: null,
                layerId: layer.id,
              },
            },
          ],
        },
        t("app-scene-editor-layer-events.add.run.e12744833915"),
      ),
    );
  }

  return (
    <section aria-label={t("app-scene-editor-layer-events.layer-events.aria-label.930f91e65691")} className="mb-4">
      <PanelHeader as="h3" className="-mx-3 mb-1.5" title={t("app-scene-editor-layer-events.layer-events.title.930f91e65691")} />
      {links.length === 0 ? (
        <p className="text-xs text-text-tertiary">
          {t("app-scene-editor-layer-events.layer-events.p.650860773421")}
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {links.map((l) => {
            const b = state.blocks[l.blockId];
            return (
              <li
                key={l.id}
                className="flex items-center gap-1.5 rounded-sm bg-surface-2 px-1.5 py-1 text-xs"
              >
                <button
                  type="button"
                  onClick={() => onSeek?.(Math.round((l.startMs / 1000) * fps))}
                  className="shrink-0 font-mono text-[11px] text-text-secondary hover:text-text-primary"
                  title={t("app-scene-editor-layer-events.layer-events.title.ba8e885ef2b9")}
                >
                  {seconds(l.startMs)}
                </button>
                <span className="min-w-0 flex-1 truncate text-text-primary" title={b?.text}>
                  {b
                    ? `${KIND[b.kind] ?? ""}: ${snippet(b.text)}`
                    : t("app-scene-editor-layer-events.layer-events.span.d7bad2b14058")}
                </span>
                {editable ? (
                  <button
                    type="button"
                    aria-label={t("app-scene-editor-layer-events.layer-events.aria-label.25c5a29fd17d")}
                    onClick={() =>
                      setError(
                        run(
                          { type: "SetTimeLinksRemoved", linkIds: [l.id], removed: true },
                          t("app-scene-editor-layer-events.layer-events.run.fd84ecf1cfe6"),
                        ),
                      )
                    }
                    className="rounded-sm p-0.5 text-text-tertiary hover:text-status-danger"
                  >
                    <X className="size-3" />
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {editable && blocks.length > 0 ? (
        <div className="mt-1.5 flex items-center gap-1.5">
          <select
            aria-label={t("app-scene-editor-layer-events.layer-events.aria-label.d95b6ea98816")}
            value={blockId}
            onChange={(e) => setBlockId(e.target.value)}
            className="h-7 min-w-0 flex-1 rounded-sm border border-border-control bg-surface-3 px-1 text-xs text-text-primary"
          >
            <option value="">
              {t("app-scene-editor-layer-events.layer-events.option.7d8f8b82bd92")}
            </option>
            {blocks.map((b) => (
              <option key={b.id} value={b.id}>
                {KIND[b.kind] ?? ""}: {snippet(b.text)}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            variant="secondary"
            disabled={!blockId}
            onClick={add}
            title={t("app-scene-editor-layer-events.layer-events.title.aada8349175f")}
          >
            <Link2 className="size-3.5" />
            {t("app-scene-editor-layer-events.layer-events.button.0a688c48831e")}
          </Button>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="mt-1 text-xs text-status-danger">
          {error}
        </p>
      ) : null}
    </section>
  );
}
