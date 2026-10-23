/**
 * «Legg til element i scenen …» (DEC-0088, Mars 15.10.2026): velg fritt i biblioteket, eller lag en helt ny ting
 * som ikke står i manuset. Elementet legges inn i scenen; så spør programmet om det også skal inn i andre scener
 * (hurtigvalg som «Alle scener med Maja») og om manuset skal få en merknad i disse scenene. I de andre scenene
 * dras det inn for hånd («Dra det inn selv») – der vises det med gul ramme til det er gjort.
 */
import { Thumbnail } from "@/app/shared/Thumbnail";
import { useMemo, useState } from "react";
import { Check, Search } from "lucide-react";
import { ASSET_KIND_LABEL, coverVersion, formatHeading, newId, orderedOccurrences, planNoteText, sceneChoices, sceneNumberOf, sortedAssets, type AssetKind, type ProjectState } from "@/core";
import type { Commands } from "@/app/project/use-commands";
import { useImageUrls } from "@/app/library/asset-images";
import { AssetSymbolIcon } from "@/app/library/AssetSymbolIcon";
import { useSchemaAtLeast } from "@/app/shell/use-schema";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { t as tk } from "@/core/i18n/keyed";

const KINDS: AssetKind[] = ["object", "character", "animal", "location", "environment", "other"];
const field =
  "h-8 rounded-sm border border-border-control bg-surface-3 px-2 text-[13px] text-text-primary";

export function AddElementDialog({
  open,
  onOpenChange,
  state,
  productionId,
  occurrenceId,
  cmds,
  onPlace,
  onNeedsImage,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  state: ProjectState;
  productionId: string;
  occurrenceId: string;
  cmds: Commands;
  /** Legg elementet inn i scenen man står i (nytt lag). Gir feilmelding eller null. */
  onPlace: (assetId: string) => string | null;
  /** Et nytt element uten bilde: åpne bildevalget (last opp eller lag med AI). */
  onNeedsImage: (assetId: string) => void;
}) {
  const plansReady = useSchemaAtLeast(34);
  const [step, setStep] = useState<"choose" | "others">("choose");
  const [tab, setTab] = useState<"library" | "new">("library");
  const [query, setQuery] = useState("");
  const [name, setName] = useState("");
  const [kind, setKind] = useState<AssetKind>("object");
  const [picked, setPicked] = useState<{ assetId: string; isNew: boolean } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [withNote, setWithNote] = useState(true);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const assets = useMemo(
    () =>
      sortedAssets(state).filter(
        (a) =>
          !a.archived &&
          a.kind !== "sound" &&
          (!query.trim() ||
            [a.name, ...a.names.map((n) => n.name)].some((n) =>
              n.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
            )),
      ),
    [state, query],
  );
  const covers = useMemo(
    () => assets.slice(0, 120).map((a) => [a.id, coverVersion(state, a.id)] as const),
    [assets, state],
  );
  const urls = useImageUrls(covers.flatMap(([, v]) => (v ? [v.mediaPath] : [])));
  const here = state.occurrences[occurrenceId as never];
  const hereNumber = here ? sceneNumberOf(state, here) : null;
  const scenes = useMemo(
    () => orderedOccurrences(state, productionId).filter((o) => o.active && o.id !== occurrenceId),
    [state, productionId, occurrenceId],
  );
  const choices = useMemo(
    () => (picked ? sceneChoices(state, productionId, occurrenceId) : []),
    [picked, state, productionId, occurrenceId],
  );
  const asset = picked ? state.assets[picked.assetId] : undefined;

  function reset() {
    setStep("choose");
    setTab("library");
    setQuery("");
    setName("");
    setPicked(null);
    setSelected(new Set());
    setWithNote(true);
    setNote("");
    setError(null);
  }
  function close() {
    const p = picked;
    reset();
    onOpenChange(false);
    if (p?.isNew) onNeedsImage(p.assetId);
  }

  function choose(assetId: string, isNew: boolean) {
    const err = onPlace(assetId);
    if (err) return setError(err);
    setPicked({ assetId, isNew });
    setNote(planNoteText(state.assets[assetId]?.name ?? name.trim(), hereNumber));
    setError(null);
    setStep("others");
  }

  function createNew() {
    const n = name.trim().replace(/\s+/g, " ");
    if (!n) return;
    const assetId = newId<"asset">();
    const err = cmds.run(
      {
        type: "CreateAssets",
        assets: [
          {
            assetId: assetId as never,
            fields: { kind, name: n, names: [], description: "", category: "", tags: [] },
          },
        ],
      },
      tk("app-scene-editor-add-element-dialog.err.cmds-run.ad9d4f5ccd6b", { n: String(n) }),
    );
    if (err) return setError(err);
    // Setteren over gir ny tilstand først ved neste tegning; laget legges inn med samme ID
    setTimeout(() => choose(assetId, true), 0);
  }

  function toggle(ids: readonly string[], on: boolean) {
    setSelected((cur) => {
      const n = new Set(cur);
      for (const id of ids) {
        if (on) n.add(id);
        else n.delete(id);
      }
      return n;
    });
  }

  function plan() {
    if (!picked || !selected.size) return close();
    const ids = scenes.filter((o) => selected.has(o.id)).map((o) => o.id);
    const taskId = newId();
    const group = newId();
    const label = tk("app-scene-editor-add-element-dialog.should-be-in", { name: asset?.name ?? "", count: ids.length });
    let err = cmds.run(
      {
        type: "PlanAssetInScenes",
        assetId: picked.assetId as never,
        taskId,
        fromOccurrenceId: occurrenceId,
        occurrenceIds: ids,
      },
      label,
      group,
    );
    if (!err && withNote && note.trim()) {
      const variants = [
        ...new Set(ids.map((id) => state.occurrences[id as never]?.variantId).filter(Boolean)),
      ] as string[];
      err = cmds.run(
        {
          type: "AddAnnotations",
          annotations: variants.map((variantId) => ({
            annotationId: newId<"annotation">(),
            blockId: null,
            variantId: variantId as never,
            start: 0,
            end: 0,
            quote: "",
            text: note.trim(),
            authorName: "",
            source: "system" as const,
            taskId,
          })),
        },
        label,
        group,
      );
    }
    if (err) return setError(err);
    close();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(o) : close())}>
      <DialogContent uiId="V-088"
        className="max-h-[86vh] max-w-[760px] overflow-y-auto border-border bg-surface-2"
        data-testid="add-element"
      >
        {step === "choose" ? (
          <>
            <DialogHeader>
              <DialogTitle>
                {tk("app-scene-editor-add-element-dialog.add-element-dialog.dialog-title.21e41779eba7")}
              </DialogTitle>
              <DialogDescription>
                {tk("app-scene-editor-add-element-dialog.add-element-dialog.dialog-description.e0266ac2c131")}
              </DialogDescription>
            </DialogHeader>
            <div role="tablist" className="flex gap-1">
              {(["library", "new"] as const).map((t) => (
                <button
                  key={t}
                  role="tab"
                  type="button"
                  aria-selected={tab === t}
                  onClick={() => setTab(t)}
                  className={
                    "rounded-sm px-3 py-1 text-xs " +
                    (tab === t
                      ? "bg-accent-selection text-text-primary"
                      : "text-text-secondary hover:bg-surface-3")
                  }
                >
                  {t === "library"
                    ? tk("app-scene-editor-add-element-dialog.add-element-dialog.button.7845792738d4")
                    : tk("app-scene-editor-add-element-dialog.add-element-dialog.button.715202aa3c5f")}
                </button>
              ))}
            </div>
            {tab === "library" ? (
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-1.5 rounded-sm border border-border-control bg-surface-3 px-2">
                  <Search className="size-3.5 text-text-tertiary" aria-hidden />
                  <input
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={tk("app-scene-editor-add-element-dialog.add-element-dialog.placeholder.28565d5f0cb2")}
                    aria-label={tk("app-scene-editor-add-element-dialog.add-element-dialog.aria-label.28565d5f0cb2")}
                    className="h-8 flex-1 bg-transparent text-[13px] text-text-primary outline-none"
                  />
                </label>
                <ul className="grid max-h-[50vh] grid-cols-3 gap-1.5 overflow-y-auto sm:grid-cols-4">
                  {covers.map(([id, v]) => {
                    const a = state.assets[id]!;
                    const url = v ? urls.data?.[v.mediaPath] : undefined;
                    return (
                      <li key={id}>
                        <button
                          type="button"
                          onClick={() => choose(id, false)}
                          className="flex w-full flex-col overflow-hidden rounded-sm border border-border bg-surface-1 text-left hover:border-accent-brand"
                          data-testid="add-element-asset"
                        >
                          <span className="flex h-20 items-center justify-center bg-surface-3">
                            {url ? (
                              <Thumbnail src={url} alt="" className="h-full w-full p-1" />
                            ) : (
                              <AssetSymbolIcon state={state} assetId={id} className="size-10" />
                            )}
                          </span>
                          <span className="truncate px-1.5 pt-1 text-[12px] text-text-primary">
                            {a.name}
                          </span>
                          <span className="truncate px-1.5 pb-1 text-[11px] text-text-tertiary">
                            {ASSET_KIND_LABEL[a.kind]}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {!covers.length ? (
                  <p className="text-xs text-text-tertiary">
                    {tk("app-scene-editor-add-element-dialog.add-element-dialog.p.3556924e9db7")}
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <label className="flex flex-col gap-1 text-xs text-text-secondary">
                  {tk("app-scene-editor-add-element-dialog.add-element-dialog.label.b7df704af6a3")}
                  <input
                    autoFocus
                    value={name}
                    maxLength={200}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={tk("app-scene-editor-add-element-dialog.add-element-dialog.placeholder.f11f9ccc04ea")}
                    className={field}
                    data-testid="add-element-name"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-text-secondary">
                  {tk("app-scene-editor-add-element-dialog.add-element-dialog.label.844b59ee8d8d")}
                  <select
                    value={kind}
                    onChange={(e) => setKind(e.target.value as AssetKind)}
                    className={field}
                  >
                    {KINDS.map((k) => (
                      <option key={k} value={k}>
                        {ASSET_KIND_LABEL[k]}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="text-[11px] text-text-tertiary">
                  {tk("app-scene-editor-add-element-dialog.add-element-dialog.p.2bfdeb81ee6f")}
                </p>
                <Button
                  size="sm"
                  className="self-start"
                  disabled={!name.trim()}
                  onClick={createNew}
                  data-testid="add-element-create"
                >
                  {tk("app-scene-editor-add-element-dialog.add-element-dialog.button.324952ab3d21")}
                </Button>
              </div>
            )}
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>
                {tk("app-scene-editor-add-element-dialog.add-element-dialog.dialog-title.805e7b3aafaa", { value1: String(asset?.name ?? "") })}
              </DialogTitle>
              <DialogDescription>
                {tk("app-scene-editor-add-element-dialog.add-element-dialog.dialog-description.f350a4599790")}
              </DialogDescription>
            </DialogHeader>
            {!plansReady ? (
              <p className="text-xs text-status-uncertain">
                {tk("app-scene-editor-add-element-dialog.add-element-dialog.p.2008d92f1b3d")}
              </p>
            ) : (
              <>
                {choices.length ? (
                  <div className="flex flex-wrap gap-1.5" data-testid="add-element-choices">
                    {choices.map((c) => {
                      const on = c.occurrenceIds.every((id) => selected.has(id));
                      return (
                        <button
                          key={c.key}
                          type="button"
                          aria-pressed={on}
                          onClick={() => toggle(c.occurrenceIds, !on)}
                          className={
                            "flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs " +
                            (on
                              ? "border-accent-warm bg-accent-warm/15 text-text-primary"
                              : "border-border text-text-secondary hover:bg-surface-3")
                          }
                        >
                          {on ? <Check className="size-3" aria-hidden /> : null}
                          {c.label} ({c.occurrenceIds.length})
                        </button>
                      );
                    })}
                  </div>
                ) : null}
                <ul className="max-h-[36vh] overflow-y-auto rounded-sm border border-border">
                  {scenes.map((o) => {
                    const v = state.variants[o.variantId];
                    return (
                      <li key={o.id} className="border-b border-border/60 last:border-b-0">
                        <label className="flex items-center gap-2 px-2 py-1 text-xs text-text-secondary">
                          <input
                            type="checkbox"
                            checked={selected.has(o.id)}
                            onChange={(e) => toggle([o.id], e.target.checked)}
                          />
                          <span className="w-10 shrink-0 text-right text-text-tertiary">
                            {sceneNumberOf(state, o) ?? ""}
                          </span>
                          <span className="truncate text-text-primary">
                            {v ? formatHeading(v.heading) : ""}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
                <label className="flex items-center gap-1.5 text-xs text-text-secondary">
                  <input
                    type="checkbox"
                    checked={withNote}
                    onChange={(e) => setWithNote(e.target.checked)}
                    data-testid="add-element-note"
                  />
                  {tk("app-scene-editor-add-element-dialog.add-element-dialog.label.a247b7645252")}
                </label>
                {withNote ? (
                  <textarea
                    value={note}
                    rows={3}
                    maxLength={2000}
                    onChange={(e) => setNote(e.target.value)}
                    aria-label={tk("app-scene-editor-add-element-dialog.add-element-dialog.aria-label.a5a88d65524a")}
                    className="rounded-sm border border-border-control bg-surface-3 px-2 py-1.5 text-xs text-text-primary"
                  />
                ) : null}
              </>
            )}
            {error ? <p className="text-xs text-status-danger">{error}</p> : null}
            <DialogFooter className="gap-2">
              <Button variant="ghost" size="sm" onClick={close}>
                {tk("app-scene-editor-add-element-dialog.add-element-dialog.button.1aa321bb9f11")}
              </Button>
              <Button
                size="sm"
                disabled={!plansReady || !selected.size}
                onClick={plan}
                data-testid="add-element-plan"
              >
                {tk("app-scene-editor-add-element-dialog.add-element-dialog.button.ac3336f2b0d6", { size: String(selected.size) })}
              </Button>
            </DialogFooter>
          </>
        )}
        {step === "choose" && error ? <p className="text-xs text-status-danger">{error}</p> : null}
      </DialogContent>
    </Dialog>
  );
}
