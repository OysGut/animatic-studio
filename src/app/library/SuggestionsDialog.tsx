/**
 * Forslag fra manuset (REQ-0128): karakterer og steder som ikke finnes i biblioteket. Ingenting legges til
 * før brukeren har valgt det. Navn som ligner en eksisterende ressurs, kan legges til som alternativt navn
 * i stedet for som ny ressurs – men bare når brukeren velger det.
 */
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  ASSET_KIND_LABEL,
  displayName,
  newId,
  type Asset,
  type AssetFields,
  type LibrarySuggestion,
  type ProjectState,
} from "@/core";
import type { Commands } from "@/app/project/use-commands";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Choice = "skip" | "new" | "alias";

const key = (x: LibrarySuggestion) => `${x.kind}|${x.name}`;

/** Navnet en ny ressurs får: karakterer med stor forbokstav (MAJA → Maja), steder slik de står. */
function suggestedName(x: LibrarySuggestion): string {
  return x.kind === "character" ? displayName(x.name) : x.name;
}

function fieldsOf(a: Asset): AssetFields {
  return {
    kind: a.kind,
    name: a.name,
    names: a.names,
    description: a.description,
    category: a.category,
    tags: a.tags,
  };
}

export function SuggestionsDialog({
  open,
  onOpenChange,
  state,
  suggestions,
  cmds,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  state: ProjectState;
  suggestions: readonly LibrarySuggestion[];
  cmds: Commands;
}) {
  // Standard: nye navn uten likhet krysses av; mulige treff må brukeren ta stilling til selv
  const initial = useMemo(() => {
    const m: Record<string, Choice> = {};
    for (const s of suggestions) m[key(s)] = s.possibleMatch ? "skip" : "new";
    return m;
  }, [suggestions]);
  const [choice, setChoice] = useState<Record<string, Choice>>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setChoice(initial);
      setErr(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const chosenNew = suggestions.filter((s) => choice[key(s)] === "new");
  const chosenAlias = suggestions.filter((s) => choice[key(s)] === "alias" && s.possibleMatch);

  async function apply() {
    setBusy(true);
    setErr(null);
    try {
      if (chosenNew.length) {
        const r = await cmds.runAndWait(
          {
            type: "CreateAssets",
            assets: chosenNew.map((s) => ({
              assetId: newId<"asset">(),
              fields: {
                kind: s.kind,
                name: suggestedName(s),
                names: [],
                description: "",
                category: "",
                tags: [],
              },
            })),
          },
          chosenNew.length === 1
            ? `Ny ressurs «${suggestedName(chosenNew[0]!)}»`
            : `${chosenNew.length} nye ressurser fra manuset`,
        );
        if (r.error) {
          setErr(r.error);
          return;
        }
      }
      // Alternative navn samles per ressurs (én endring hver)
      const byAsset = new Map<string, string[]>();
      for (const s of chosenAlias) {
        const id = s.possibleMatch!.assetId;
        byAsset.set(id, [...(byAsset.get(id) ?? []), s.name]);
      }
      for (const [id, names] of byAsset) {
        const a = state.assets[id];
        if (!a) continue;
        const f = fieldsOf(a);
        const r = await cmds.runAndWait(
          {
            type: "UpdateAsset",
            assetId: a.id,
            fields: {
              ...f,
              names: [
                ...f.names,
                ...names.map((n) => ({ name: n, kind: "alias" as const, language: null })),
              ],
            },
          },
          `Alternativt navn for «${a.name}»`,
        );
        if (r.error) {
          setErr(r.error);
          return;
        }
      }
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  const groups = (["character", "location"] as const).map((k) => ({
    kind: k,
    items: suggestions.filter((s) => s.kind === k),
  }));
  const total = chosenNew.length + chosenAlias.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-[720px] overflow-y-auto border-border bg-surface-2">
        <DialogHeader>
          <DialogTitle>Forslag fra manuset</DialogTitle>
          <DialogDescription>
            Karakterer med replikk og steder i sceneoverskriftene som ikke finnes i biblioteket
            ennå. Ingenting legges til før du velger det. Navn som ligner en ressurs du allerede
            har, kan legges til som alternativt navn i stedet.
          </DialogDescription>
        </DialogHeader>
        {suggestions.length === 0 ? (
          <p className="text-[13px] text-text-secondary">Ingen forslag – alt er i biblioteket.</p>
        ) : null}
        {groups.map((g) =>
          g.items.length ? (
            <section key={g.kind} className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-medium uppercase tracking-[0.04em] text-text-tertiary">
                  {g.kind === "character" ? "Karakterer" : "Lokasjoner"} ({g.items.length})
                </h3>
                <button
                  type="button"
                  className="text-xs text-accent-brand hover:underline"
                  onClick={() =>
                    setChoice((c) => {
                      const n = { ...c };
                      for (const s of g.items) if (!s.possibleMatch) n[key(s)] = "new";
                      return n;
                    })
                  }
                >
                  Velg alle uten mulig treff
                </button>
                <button
                  type="button"
                  className="text-xs text-text-tertiary hover:text-text-primary hover:underline"
                  onClick={() =>
                    setChoice((c) => {
                      const n = { ...c };
                      for (const s of g.items) n[key(s)] = "skip";
                      return n;
                    })
                  }
                >
                  Velg ingen
                </button>
              </div>
              <ul className="border border-border bg-surface-1">
                {g.items.map((s) => {
                  const k = key(s);
                  const c = choice[k] ?? "skip";
                  return (
                    <li
                      key={k}
                      className="flex items-center gap-2 border-b border-border px-3 py-1.5 text-[13px] last:border-b-0"
                    >
                      <input
                        type="checkbox"
                        aria-label={`Legg til ${s.name}`}
                        checked={c !== "skip"}
                        onChange={(e) =>
                          setChoice((x) => ({
                            ...x,
                            [k]: e.target.checked ? (s.possibleMatch ? "alias" : "new") : "skip",
                          }))
                        }
                        className="size-3.5 accent-[var(--accent-brand)]"
                      />
                      <span className="min-w-0 flex-1 truncate text-text-primary">
                        {s.name}
                        <span className="ml-2 text-xs text-text-tertiary">
                          {s.scenes === 1 ? "1 scene" : `${s.scenes} scener`}
                        </span>
                      </span>
                      {s.possibleMatch ? (
                        <select
                          aria-label={`Hva skal ${s.name} bli?`}
                          value={c === "skip" ? "alias" : c}
                          onChange={(e) =>
                            setChoice((x) => ({ ...x, [k]: e.target.value as Choice }))
                          }
                          className="h-7 max-w-[300px] rounded-sm border border-border-control bg-surface-3 px-1.5 text-xs text-status-uncertain"
                          title="Usikker kobling – du avgjør"
                        >
                          <option value="alias">
                            Alternativt navn for «{s.possibleMatch.assetName}»?
                          </option>
                          <option value="new">Ny {ASSET_KIND_LABEL[s.kind].toLowerCase()}</option>
                        </select>
                      ) : (
                        <span className="text-xs text-text-tertiary">→ {suggestedName(s)}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null,
        )}
        {err ? (
          <p role="alert" className="text-xs text-status-danger">
            {err}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Avbryt
          </Button>
          <Button onClick={() => void apply()} disabled={busy || total === 0}>
            {busy ? <Loader2 className="animate-spin" /> : null}
            {total === 0 ? "Legg til" : `Legg til ${total}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
