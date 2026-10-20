/**
 * «Legg til element i scenen …» (DEC-0088, Mars 15.10.2026): velg fritt i biblioteket, eller lag en helt ny ting
 * som ikke står i manuset. Elementet legges inn i scenen; så spør programmet om det også skal inn i andre scener
 * (hurtigvalg som «Alle scener med Maja») og om manuset skal få en merknad i disse scenene. I de andre scenene
 * dras det inn for hånd («Dra det inn selv») – der vises det med gul ramme til det er gjort.
 */
import { useMemo, useState } from "react";
import { Check, Search } from "lucide-react";
import {
  ASSET_KIND_LABEL,
  L,
  coverVersion,
  formatHeading,
  newId,
  orderedOccurrences,
  planNoteText,
  sceneChoices,
  sceneNumberOf,
  sortedAssets,
  type AssetKind,
  type ProjectState,
} from "@/core";
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
      L(`Nytt element «${n}»`, `New element “${n}”`),
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
    const label = L(
      `«${asset?.name ?? ""}» skal inn i ${ids.length === 1 ? "1 scene" : `${ids.length} scener`}`,
      `“${asset?.name ?? ""}” should be in ${ids.length === 1 ? "1 scene" : `${ids.length} scenes`}`,
    );
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
      <DialogContent
        className="max-h-[86vh] max-w-[760px] overflow-y-auto border-border bg-surface-2"
        data-testid="add-element"
      >
        {step === "choose" ? (
          <>
            <DialogHeader>
              <DialogTitle>
                {L("Legg til element i scenen", "Add element to the scene")}
              </DialogTitle>
              <DialogDescription>
                {L(
                  "Velg fritt i biblioteket, eller lag en helt ny ting som ikke står i manuset.",
                  "Choose freely from the library, or make something completely new that is not in the script.",
                )}
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
                    ? L("Fra biblioteket", "From the library")
                    : L("Lag ny", "Make new")}
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
                    placeholder={L("Søk i biblioteket", "Search the library")}
                    aria-label={L("Søk i biblioteket", "Search the library")}
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
                              <img src={url} alt="" className="h-full w-full object-contain p-1" />
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
                    {L("Ingenting i biblioteket passer.", "Nothing in the library matches.")}
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <label className="flex flex-col gap-1 text-xs text-text-secondary">
                  {L("Navn", "Name")}
                  <input
                    autoFocus
                    value={name}
                    maxLength={200}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={L("f.eks. Teddybjørn", "e.g. Teddy bear")}
                    className={field}
                    data-testid="add-element-name"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-text-secondary">
                  {L("Type", "Type")}
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
                  {L(
                    "Elementet legges i biblioteket og i scenen. Etterpå kan du laste opp et bilde eller lage det med AI.",
                    "The element is added to the library and the scene. Afterwards you can upload an image or make one with AI.",
                  )}
                </p>
                <Button
                  size="sm"
                  className="self-start"
                  disabled={!name.trim()}
                  onClick={createNew}
                  data-testid="add-element-create"
                >
                  {L("Lag og legg i scenen", "Create and add to the scene")}
                </Button>
              </div>
            )}
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>
                {L(
                  `Skal «${asset?.name ?? ""}» også inn i andre scener?`,
                  `Should “${asset?.name ?? ""}” also be in other scenes?`,
                )}
              </DialogTitle>
              <DialogDescription>
                {L(
                  "Elementet er lagt inn i denne scenen. I scenene du velger, vises det med gul ramme i «I denne scenen» til du har dratt det inn på lerretet.",
                  "The element has been added to this scene. In the scenes you choose, it is shown with a yellow frame in “In this scene” until you have dragged it onto the canvas.",
                )}
              </DialogDescription>
            </DialogHeader>
            {!plansReady ? (
              <p className="text-xs text-status-uncertain">
                {L(
                  "Databasen må oppdateres (migrasjon 0034) før elementet kan planlegges i flere scener.",
                  "The database must be updated (migration 0034) before the element can be planned in several scenes.",
                )}
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
                  {L(
                    "Legg en merknad i manuset i disse scenene",
                    "Put a note in the script in these scenes",
                  )}
                </label>
                {withNote ? (
                  <textarea
                    value={note}
                    rows={3}
                    maxLength={2000}
                    onChange={(e) => setNote(e.target.value)}
                    aria-label={L("Merknaden", "The note")}
                    className="rounded-sm border border-border-control bg-surface-3 px-2 py-1.5 text-xs text-text-primary"
                  />
                ) : null}
              </>
            )}
            {error ? <p className="text-xs text-status-danger">{error}</p> : null}
            <DialogFooter className="gap-2">
              <Button variant="ghost" size="sm" onClick={close}>
                {L("Bare denne scenen", "Only this scene")}
              </Button>
              <Button
                size="sm"
                disabled={!plansReady || !selected.size}
                onClick={plan}
                data-testid="add-element-plan"
              >
                {L(`Legg til i ${selected.size} scener`, `Add to ${selected.size} scenes`)}
              </Button>
            </DialogFooter>
          </>
        )}
        {step === "choose" && error ? <p className="text-xs text-status-danger">{error}</p> : null}
      </DialogContent>
    </Dialog>
  );
}
