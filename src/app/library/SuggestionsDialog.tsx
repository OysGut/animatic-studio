/**
 * Forslag fra manuset (REQ-0128): karakterer og steder som ikke finnes i biblioteket. Ingenting legges til
 * før brukeren har valgt det. Navn som ligner en eksisterende ressurs, kan legges til som alternativt navn
 * i stedet for som ny ressurs – men bare når brukeren velger det.
 */
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  ASSET_KIND_LABEL,
  SOURCE_NOTE_LABEL,
  displayName,
  nameKey,
  newId,
  suggestionAliases,
  type Asset,
  type AssetFields,
  type AssetKind,
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
type PickableKind = "character" | "animal" | "object" | "other";

const KIND_CHOICES: readonly PickableKind[] = ["character", "animal", "object", "other"];

const key = (x: LibrarySuggestion) => `${x.reason}|${x.name}`;

const GROUPS: readonly { reason: LibrarySuggestion["reason"]; title: string }[] = [
  { reason: "speaker", title: "Karakterer" },
  { reason: "named", title: "Navngitte ting uten replikk" },
  { reason: "heading", title: "Lokasjoner" },
  { reason: "object", title: "Objekter og rekvisitter" },
];

const hiddenStorageKey = (projectId: string) => `animatic:hidden-suggestions:${projectId}`;

function readHidden(projectId: string): string[] {
  try {
    const raw = window.localStorage.getItem(hiddenStorageKey(projectId));
    if (!raw) return [];
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeHidden(projectId: string, keys: readonly string[]): void {
  try {
    if (keys.length) window.localStorage.setItem(hiddenStorageKey(projectId), JSON.stringify(keys));
    else window.localStorage.removeItem(hiddenStorageKey(projectId));
  } catch {
    // Uten lagring fungerer skjuling bare så lenge siden er åpen
  }
}

const scenesLabel = (n: number) => (n === 1 ? "1 scene" : `${n} scener`);

/** Navnet en ny ressurs får: karakterer med stor forbokstav (MAJA → Maja), objekter med stor forbokstav, ellers som de står. */
function suggestedName(x: LibrarySuggestion): string {
  if (x.kind === "character") return displayName(x.name);
  if (x.kind === "object") return x.name.charAt(0).toLocaleUpperCase("nb") + x.name.slice(1);
  return x.name;
}

/** Beviset under navnet: scenenumre og andre skrivemåter som er slått sammen. */
function evidence(x: LibrarySuggestion): string {
  const parts: string[] = [];
  if (x.sceneNumbers.length)
    parts.push(`Scene ${x.sceneNumbers.join(", ")}${x.scenes > x.sceneNumbers.length ? " …" : ""}`);
  let text = parts.join("");
  if (x.sources.length) {
    const also = x.sources
      .map((r) => `${r.name} (${SOURCE_NOTE_LABEL[r.note]}, ${scenesLabel(r.scenes)})`)
      .join(", ");
    text += `${text ? " · " : ""}også: ${also}`;
  }
  return text;
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
  projectId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  state: ProjectState;
  suggestions: readonly LibrarySuggestion[];
  cmds: Commands;
  projectId: string;
}) {
  // Standard: sikre nye navn krysses av; mulige treff og gjetninger må brukeren ta stilling til selv
  const initial = useMemo(() => {
    const m: Record<string, Choice> = {};
    for (const s of suggestions) m[key(s)] = s.possibleMatch || s.uncertain ? "skip" : "new";
    return m;
  }, [suggestions]);
  const [choice, setChoice] = useState<Record<string, Choice>>(initial);
  const [kindChoice, setKindChoice] = useState<Record<string, PickableKind>>({});
  const [hidden, setHidden] = useState<readonly string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setChoice(initial);
      setKindChoice({});
      setHidden(readHidden(projectId));
      setErr(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const hiddenSet = useMemo(() => new Set(hidden), [hidden]);
  const visible = suggestions.filter((s) => !hiddenSet.has(key(s)));
  const kindOf = (s: LibrarySuggestion): AssetKind =>
    s.kindUncertain ? (kindChoice[key(s)] ?? "character") : s.kind;

  function hide(k: string) {
    const next = [...new Set([...hidden, k])];
    setHidden(next);
    writeHidden(projectId, next);
  }
  function showHidden() {
    setHidden([]);
    writeHidden(projectId, []);
  }

  const chosenNew = visible.filter((s) => choice[key(s)] === "new");
  const chosenAlias = visible.filter((s) => choice[key(s)] === "alias" && s.possibleMatch);
  const hiddenCount = suggestions.filter((s) => hiddenSet.has(key(s))).length;

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
                kind: kindOf(s),
                name: suggestedName(s),
                names: suggestionAliases(s, suggestedName(s)).map((n) => ({
                  name: n,
                  kind: "alias" as const,
                  language: null,
                })),
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
        const a = state.assets[id];
        if (!a) continue;
        byAsset.set(id, [...(byAsset.get(id) ?? []), s.name, ...suggestionAliases(s, a.name)]);
      }
      for (const [id, names] of byAsset) {
        const a = state.assets[id];
        if (!a) continue;
        const f = fieldsOf(a);
        const seen = new Set([a.name, ...f.names.map((n) => n.name)].map(nameKey));
        const add: string[] = [];
        for (const n of names) {
          const k = nameKey(n);
          if (!k || seen.has(k)) continue;
          seen.add(k);
          add.push(n);
        }
        if (!add.length) continue;
        const r = await cmds.runAndWait(
          {
            type: "UpdateAsset",
            assetId: a.id,
            fields: {
              ...f,
              names: [
                ...f.names,
                ...add.map((n) => ({ name: n, kind: "alias" as const, language: null })),
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

  const groups = GROUPS.map((g) => ({
    ...g,
    items: visible.filter((s) => s.reason === g.reason),
  }));
  const total = chosenNew.length + chosenAlias.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-[720px] overflow-y-auto border-border bg-surface-2">
        <DialogHeader>
          <DialogTitle>Forslag fra manuset</DialogTitle>
          <DialogDescription>
            Karakterer, navngitte ting, steder og ting som går igjen i manuset, men som ikke finnes
            i biblioteket ennå. Ingenting legges til før du velger det. Usikre forslag er ikke valgt
            på forhånd. Andre skrivemåter blir alternative navn, så ressursen finnes i alle scenene.
          </DialogDescription>
        </DialogHeader>
        {visible.length === 0 && hiddenCount === 0 ? (
          <p className="text-[13px] text-text-secondary">Ingen forslag – alt er i biblioteket.</p>
        ) : null}
        {groups.map((g) =>
          g.items.length ? (
            <section key={g.reason} className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-medium uppercase tracking-[0.04em] text-text-tertiary">
                  {g.title} ({g.items.length})
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
                  const kind = kindOf(s);
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
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-text-primary">
                          {s.name}
                          <span className="ml-2 text-xs text-text-tertiary">
                            {scenesLabel(s.scenes)}
                          </span>
                          {s.uncertain ? (
                            <span
                              className="ml-2 text-xs text-status-uncertain"
                              title="Gjetning fra teksten – sjekk før du legger til"
                            >
                              usikker
                            </span>
                          ) : null}
                        </div>
                        <div className="truncate text-xs text-text-tertiary" title={evidence(s)}>
                          {evidence(s)}
                        </div>
                      </div>
                      {s.kindUncertain && c === "new" ? (
                        <select
                          aria-label={`Hva slags type er ${s.name}?`}
                          value={kindChoice[k] ?? "character"}
                          onChange={(e) =>
                            setKindChoice((x) => ({ ...x, [k]: e.target.value as PickableKind }))
                          }
                          className="h-7 rounded-sm border border-border-control bg-surface-3 px-1.5 text-xs text-text-primary"
                        >
                          {KIND_CHOICES.map((o) => (
                            <option key={o} value={o}>
                              {ASSET_KIND_LABEL[o]}
                            </option>
                          ))}
                        </select>
                      ) : null}
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
                          <option value="new">Ny {ASSET_KIND_LABEL[kind].toLowerCase()}</option>
                        </select>
                      ) : (
                        <span className="text-xs text-text-tertiary">→ {suggestedName(s)}</span>
                      )}
                      <button
                        type="button"
                        className="text-xs text-text-tertiary hover:text-text-primary"
                        title="Ikke foreslå igjen"
                        onClick={() => hide(k)}
                      >
                        Skjul
                      </button>
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
        <div className="flex items-center justify-end gap-2">
          {hiddenCount > 0 ? (
            <button
              type="button"
              className="mr-auto text-xs text-text-tertiary hover:text-text-primary hover:underline"
              onClick={showHidden}
            >
              Vis skjulte ({hiddenCount})
            </button>
          ) : null}
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
