/**
 * Ny avledet produksjon (spinoff, trailer, kortfilm …) fra utvalgte scener, eller flere scener i en
 * eksisterende produksjon (M7 del 1, DEC-0057, REQ-0353–0355, REQ-0359/0360). Scenene gjenbrukes som
 * referanser til samme scene – hovedfilmen endres ikke.
 */
import { useMemo, useState } from "react";
import {
  L,
  PRODUCTION_KIND_LABEL,
  addScenesCommands,
  applyCommand,
  deriveProductionCommands,
  formatHeading,
  newId,
  orderedOccurrences,
  sortedProductions,
  type ProductionKind,
  type ProjectState,
} from "@/core";
import type { Commands } from "@/app/project/use-commands";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const KINDS: readonly Exclude<ProductionKind, "main">[] = [
  "spinoff",
  "trailer",
  "teaser",
  "short",
  "pitch",
  "pilot",
  "alternative",
  "other",
];

const control =
  "h-8 rounded-sm border border-border-control bg-surface-3 px-2 text-[13px] text-text-primary";

export function ProductionDialog({
  state,
  cmds,
  open,
  onOpenChange,
  addTo,
  onCreated,
}: {
  state: ProjectState;
  cmds: Commands;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Legg scener til i denne produksjonen (i stedet for å lage en ny). */
  addTo?: string | null;
  onCreated?: (productionId: string) => void;
}) {
  const productions = sortedProductions(state);
  const target = addTo ? state.productions[addTo] : undefined;
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [kind, setKind] = useState<Exclude<ProductionKind, "main">>("spinoff");
  const [sourceId, setSourceId] = useState(
    () => productions.find((p) => p.id !== addTo)?.id ?? productions[0]?.id ?? "",
  );
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [err, setErr] = useState<string | null>(null);
  const occs = useMemo(() => orderedOccurrences(state, sourceId), [state, sourceId]);
  // Scener produksjonen har fra før
  const already = useMemo(
    () =>
      new Set(
        addTo
          ? Object.values(state.occurrences)
              .filter((o) => o.productionId === addTo)
              .map((o) => o.sceneId)
          : [],
      ),
    [state.occurrences, addTo],
  );
  // Scener kilden har egen versjon av, kan ikke gjenbrukes direkte (de tilhører kilden)
  const ownedBySource = (variantId: string) =>
    state.variants[variantId]?.ownerProductionId !== null;
  const choosable = occs.filter((o) => !already.has(o.sceneId) && !ownedBySource(o.variantId));

  function reset() {
    setName("");
    setNote("");
    setPicked(new Set());
    setErr(null);
  }

  function submit() {
    const ids = occs.filter((o) => picked.has(o.id)).map((o) => o.id);
    const group = newId();
    let commands;
    let createdId: string | null = null;
    if (target) {
      commands = addScenesCommands(state, target.id, ids);
      if (!commands.length) {
        setErr(L("Velg minst én scene.", "Choose at least one scene."));
        return;
      }
    } else {
      if (!name.trim()) {
        setErr(L("Gi produksjonen et navn.", "Give the production a name."));
        return;
      }
      createdId = newId<"production">();
      commands = deriveProductionCommands(state, {
        productionId: createdId,
        name: name.trim(),
        kind,
        parentProductionId: sourceId,
        occurrenceIds: ids,
      });
      // Notatet om hva produksjonen er (DEC-0082), vises på prosjektlisten
      if (note.trim())
        commands = [
          ...commands,
          {
            type: "SetProductionNote" as const,
            productionId: createdId as never,
            note: note.trim(),
          },
        ];
    }
    // Prøv alt på en kopi først, så det ikke blir en halvferdig produksjon
    let probe = state;
    for (const c of commands) {
      const r = applyCommand(probe, {
        id: newId<"command">(),
        actor: "00000000-0000-7000-8000-000000000000" as never,
        at: new Date().toISOString(),
        command: c,
      });
      if (!r.ok) {
        setErr(r.error.message);
        return;
      }
      probe = r.state;
    }
    for (const c of commands) {
      const e = cmds.run(
        c,
        target
          ? L(`Scener lagt til i «${target.name}»`, `Scenes added to “${target.name}”`)
          : L(`Ny produksjon «${name.trim()}»`, `New production “${name.trim()}”`),
        group,
      );
      if (e) {
        setErr(e);
        return;
      }
    }
    reset();
    onOpenChange(false);
    if (createdId) onCreated?.(createdId);
  }

  const toggle = (id: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-h-[88vh] max-w-[620px] overflow-y-auto border-border bg-surface-2">
        <DialogHeader>
          <DialogTitle>
            {target
              ? L(`Legg til scener i «${target.name}»`, `Add scenes to “${target.name}”`)
              : L("Ny produksjon", "New production")}
          </DialogTitle>
          <DialogDescription>
            {target
              ? L(
                  "Scenene gjenbrukes – endrer du dem her, får produksjonen sin egen versjon, og den andre produksjonen endres ikke.",
                  "The scenes are reused – if you change them here, the production gets its own version, and the other production is not changed.",
                )
              : L(
                  "En spinoff, trailer eller kortfilm med egne scener, egen rekkefølge og egen film. Scener du velger, gjenbrukes – hovedfilmen endres ikke.",
                  "A spin-off, trailer or short film with its own scenes, its own order and its own film. Scenes you choose are reused – the main film is not changed.",
                )}
          </DialogDescription>
        </DialogHeader>
        {target ? null : (
          <div className="flex flex-wrap gap-2">
            <label className="flex min-w-[220px] flex-1 flex-col gap-1 text-xs text-text-tertiary">
              {L("Navn", "Name")}
              <Input
                value={name}
                maxLength={200}
                autoFocus
                placeholder={L(
                  "F.eks. «Filmtittel – kortversjon»",
                  "E.g. “Film title – short version”",
                )}
                onChange={(e) => setName(e.target.value)}
                className="h-8 bg-surface-3 text-[13px]"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-text-tertiary">
              {L("Type", "Type")}
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as typeof kind)}
                className={control}
              >
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {PRODUCTION_KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex w-full flex-col gap-1 text-xs text-text-tertiary">
              {L("Notat (valgfritt)", "Note (optional)")}
              <textarea
                value={note}
                maxLength={2000}
                rows={2}
                placeholder={L(
                  "Hva er denne versjonen? F.eks. «Kortversjon til festivalen, uten prologen»",
                  "What is this version? E.g. “Short version for the festival, without the prologue”",
                )}
                onChange={(e) => setNote(e.target.value)}
                className="resize-y rounded-sm border border-border-control bg-surface-3 px-2 py-1.5 text-[13px] text-text-primary"
              />
            </label>
          </div>
        )}
        <div className="flex items-center gap-2 text-xs text-text-tertiary">
          <span>{L("Scener fra", "Scenes from")}</span>
          <select
            aria-label={L("Hent scener fra", "Take scenes from")}
            value={sourceId}
            onChange={(e) => {
              setSourceId(e.target.value);
              setPicked(new Set());
            }}
            className={control}
          >
            {productions
              .filter((p) => p.id !== addTo)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
          <button
            type="button"
            className="ml-auto text-text-secondary hover:text-text-primary"
            onClick={() =>
              setPicked(
                picked.size === choosable.length ? new Set() : new Set(choosable.map((o) => o.id)),
              )
            }
          >
            {picked.size === choosable.length && choosable.length
              ? L("Velg ingen", "Select none")
              : L("Velg alle", "Select all")}
          </button>
        </div>
        <ul
          aria-label={L("Scener", "Scenes")}
          className="flex max-h-[44vh] flex-col overflow-y-auto border border-border"
        >
          {occs.map((o) => {
            const v = state.variants[o.variantId];
            const has = already.has(o.sceneId);
            const owned = ownedBySource(o.variantId);
            return (
              <li key={o.id}>
                <label
                  className={
                    "grid grid-cols-[18px_40px_1fr] items-center gap-2 px-2 py-1 text-[13px] hover:bg-surface-3" +
                    (has || !o.active ? " text-text-tertiary" : " text-text-primary")
                  }
                >
                  <input
                    type="checkbox"
                    disabled={has || owned}
                    checked={has || picked.has(o.id)}
                    onChange={() => toggle(o.id)}
                    className="size-3.5 accent-[var(--accent-brand)]"
                  />
                  <span className="tabular text-right font-mono text-xs">
                    {o.productionNumber ?? "–"}
                  </span>
                  <span className="truncate">
                    {v ? formatHeading(v.heading) : L("Scene", "Scene")}
                    {has
                      ? L(" · finnes allerede", " · already included")
                      : owned
                        ? L(
                            " · egen versjon i denne produksjonen",
                            " · own version in this production",
                          )
                        : !o.active
                          ? L(" · deaktivert", " · deactivated")
                          : ""}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
        <p className="text-xs text-text-tertiary">
          {picked.size === 1
            ? L("1 scene valgt.", "1 scene selected.")
            : L(`${picked.size} scener valgt.`, `${picked.size} scenes selected.`)}
          {target
            ? ""
            : L(
                " Du kan også lage produksjonen tom og skrive nye scener i manuset.",
                " You can also create the production empty and write new scenes in the script.",
              )}
        </p>
        {err ? (
          <p role="alert" className="text-xs text-status-danger">
            {err}
          </p>
        ) : null}
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => {
              reset();
              onOpenChange(false);
            }}
          >
            {L("Avbryt", "Cancel")}
          </Button>
          <Button onClick={submit}>{target ? L("Legg til", "Add") : L("Opprett", "Create")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
