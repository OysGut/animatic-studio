/**
 * Forslag fra manuset (REQ-0128): karakterer og steder som ikke finnes i biblioteket. Ingenting legges til
 * før brukeren har valgt det. Navn som ligner en eksisterende ressurs, kan legges til som alternativt navn
 * i stedet for som ny ressurs – men bare når brukeren velger det.
 */
import { requestReanalyze, useAnalysisRows, useAnalysisStatus } from "./entity-analysis-store";
import { analysisScenes, mergeAnalysis } from "@/core/library/analysis-hash";
import type { AIClassification } from "@/core/library/classification-prompt";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  L,
  collation,
  ASSET_KIND_LABEL,
  SOURCE_NOTE_LABEL,
  displayName,
  nameKey,
  mainProduction,
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
type PickableKind = "character" | "animal" | "object" | "location" | "environment" | "sound";

const KIND_CHOICES: readonly PickableKind[] = ["character", "animal", "object", "location", "environment", "sound"];

const key = (x: LibrarySuggestion) => `${x.reason}|${x.name}`;

const GROUPS: readonly { kind: PickableKind; title: string }[] = [
  { kind: "character", get title() { return L("Karakterer", "Characters"); } },
  { kind: "animal", get title() { return L("Dyr", "Animals"); } },
  { kind: "object", get title() { return L("Objekter", "Objects"); } },
  { kind: "location", get title() { return L("Steder", "Locations"); } },
  { kind: "environment", get title() { return L("Miljø", "Environments"); } },
  { kind: "sound", get title() { return L("Lyd", "Sound"); } },
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

const scenesLabel = (n: number) => (n === 1 ? "1 scene" : L(`${n} scener`, `${n} scenes`));

/** Navnet en ny ressurs får: karakterer med stor forbokstav (MAJA → Maja), objekter med stor forbokstav, ellers som de står. */
function suggestedName(x: LibrarySuggestion): string {
  if (x.kind === "character") return displayName(x.name);
  if (x.kind === "object") return x.name.charAt(0).toLocaleUpperCase(collation()) + x.name.slice(1);
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
    text += `${text ? " · " : ""}${L("også", "also")}: ${also}`;
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
  // Automatisk analyse med den innebygde AI-en (OG2): lagret per scene, gjelder bare uendrede scener
  const stored = useAnalysisRows(projectId);
  const status = useAnalysisStatus(projectId);
  const [aiBusy, setAIBusy] = useState(false);
  const ai = useMemo<Record<string, AIClassification>>(() => {
    const prod = mainProduction(state);
    return prod && stored.length ? mergeAnalysis(suggestions, stored, analysisScenes(state, prod.id)) : {};
  }, [state, suggestions, stored]);
  const aiCount = Object.keys(ai).length;
  // Standard: sikre nye navn krysses av; mulige treff og gjetninger må brukeren ta stilling til selv
  const initial = useMemo(() => {
    const m: Record<string, Choice> = {};
    for (const s of suggestions) m[key(s)] = s.possibleMatch || (s.confidence ? s.confidence !== "high" : s.uncertain) ? "skip" : "new";
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
  const kindOf = (s: LibrarySuggestion): AssetKind => kindChoice[key(s)] ?? ai[s.name]?.kind ?? s.kind;
  const confidenceOf = (s: LibrarySuggestion) => ai[s.name]?.confidence ?? s.confidence ?? (s.uncertain ? "low" : "high");
  async function improve() {
    setAIBusy(true); setErr(null);
    try {
      const e = await requestReanalyze(projectId);
      if (e) setErr(e);
    } catch { setErr(L("Analysen feilet. Prøv igjen.", "The analysis failed. Try again.")); }
    finally { setAIBusy(false); }
  }

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
      const firstNew = chosenNew[0];
      if (firstNew) {
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
            ? L(
                `Ny ressurs «${suggestedName(firstNew)}»`,
                `New asset “${suggestedName(firstNew)}”`,
              )
            : L(
                `${chosenNew.length} nye ressurser fra manuset`,
                `${chosenNew.length} new assets from the script`,
              ),
        );
        if (r.error) {
          setErr(r.error);
          return;
        }
      }
      // Alternative navn samles per ressurs (én endring hver)
      const byAsset = new Map<string, string[]>();
      for (const s of chosenAlias) {
        const id = s.possibleMatch?.assetId;
        if (!id) continue;
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
          L(`Alternativt navn for «${a.name}»`, `Alternative name for “${a.name}”`),
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
    items: visible.filter((s) => kindOf(s) === g.kind),
  }));
  const total = chosenNew.length + chosenAlias.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="library-suggestions" className="max-h-[90vh] max-w-[720px] overflow-y-auto border-border bg-surface-2">
        <DialogHeader>
          <DialogTitle>{L("Forslag fra manuset", "Suggestions from the script")}</DialogTitle>
          <DialogDescription>
            {L("Forslag fra manuset", "Suggestions from the script")}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" data-testid="library-suggestions-ai" disabled={busy || aiBusy || status.kind === "running" || !visible.length} onClick={() => void improve()}>{aiBusy || status.kind === "running" ? <Loader2 className="animate-spin" /> : null}{L("Analyser på nytt", "Analyse again")}</Button>
          <p role="status" data-testid="library-suggestions-ai-status" className="text-xs text-text-secondary">
            {status.kind === "running"
              ? L("Analyserer manuset …", "Analysing the script …")
              : aiCount
                ? L(`Typene for ${aiCount} forslag er satt av den innebygde AI-en.`, `The types of ${aiCount} suggestions were set by the built-in AI.`)
                : L("Typene bygger på manusreglene.", "The types are based on script rules.")}
          </p>
        </div>
        {visible.length === 0 && hiddenCount === 0 ? (
          <p className="text-[13px] text-text-secondary">
            {L(
              "Ingen forslag – alt er i biblioteket.",
              "No suggestions – everything is in the library.",
            )}
          </p>
        ) : null}
        {groups.map((g) =>
          g.items.length ? (
            <section key={g.kind} data-testid="library-suggestions-group" data-kind={g.kind} className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-medium uppercase tracking-[0.04em] text-text-tertiary">
                  {g.title} ({g.items.length})
                </h3>
                <Button variant="ghost" size="sm"
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
                  {L("Velg alle uten mulig treff", "Select all without a possible match")}
                </Button>
                <Button variant="ghost" size="sm"
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
                  {L("Velg ingen", "Select none")}
                </Button>
              </div>
              <ul className="border border-border bg-surface-1">
                {g.items.map((s) => {
                  const k = key(s);
                  const c = choice[k] ?? "skip";
                  const kind = kindOf(s);
                  return (
                    <li
                      key={k}
                      data-testid="library-suggestion" data-name={s.name} data-kind={kind}
                      className="flex items-center gap-2 border-b border-border px-3 py-1.5 text-[13px] last:border-b-0"
                    >
                      <input
                        type="checkbox"
                        aria-label={L(`Legg til ${s.name}`, `Add ${s.name}`)}
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
                          <span className="ml-2 text-xs text-status-uncertain" data-testid="library-suggestion-confidence">{confidenceOf(s) === "high" ? L("Sikker", "Confident") : confidenceOf(s) === "medium" ? L("Trolig", "Likely") : L("Usikker", "Uncertain")}</span>
                        </div>
                        <p className="break-words text-xs text-text-secondary">{ai[s.name]?.reason ?? s.evidence ?? ""}</p>
                        {ai[s.name]?.aliasOf && suggestions.some((candidate) => candidate.name === ai[s.name]?.aliasOf) ? <p className="break-words text-xs text-status-uncertain">{L(`Mulig samme som «${ai[s.name]?.aliasOf}» – du avgjør`, `Possibly the same as “${ai[s.name]?.aliasOf}” – you decide`)}</p> : null}
                        <div className="truncate text-xs text-text-tertiary" title={evidence(s)}>
                          {evidence(s)}
                        </div>
                      </div>
                        <select
                          aria-label={L(
                            `Hva slags type er ${s.name}?`,
                            `What kind of ${s.name} is it?`,
                          )}
                          data-testid="library-suggestion-kind"
                          value={kind}
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
                      {s.possibleMatch ? (
                        <select
                          aria-label={L(`Hva skal ${s.name} bli?`, `What should ${s.name} become?`)}
                          value={c === "skip" ? "alias" : c}
                          onChange={(e) =>
                            setChoice((x) => ({ ...x, [k]: e.target.value as Choice }))
                          }
                          className="h-7 max-w-[300px] rounded-sm border border-border-control bg-surface-3 px-1.5 text-xs text-status-uncertain"
                          title={L("Usikker kobling – du avgjør", "Uncertain link – you decide")}
                        >
                          <option value="alias">
                            {L(
                              `Alternativt navn for «${s.possibleMatch.assetName}»?`,
                              `Alternative name for “${s.possibleMatch.assetName}”?`,
                            )}
                          </option>
                          <option value="new">
                            {L("Ny", "New")} {ASSET_KIND_LABEL[kind].toLowerCase()}
                          </option>
                        </select>
                      ) : (
                        <span className="text-xs text-text-tertiary">→ {suggestedName(s)}</span>
                      )}
                      <Button variant="ghost" size="sm"
                        type="button"
                        className="text-xs text-text-tertiary hover:text-text-primary"
                        title={L("Ikke foreslå igjen", "Do not suggest again")}
                        onClick={() => hide(k)}
                      >
                        {L("Skjul", "Hide")}
                      </Button>
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
            <Button variant="ghost" size="sm"
              type="button"
              className="mr-auto text-xs text-text-tertiary hover:text-text-primary hover:underline"
              onClick={showHidden}
            >
              {L(`Vis skjulte (${hiddenCount})`, `Show hidden (${hiddenCount})`)}
            </Button>
          ) : null}
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {L("Avbryt", "Cancel")}
          </Button>
          <Button data-testid="library-suggestions-add" onClick={() => void apply()} disabled={busy || aiBusy || total === 0}>
            {busy ? <Loader2 className="animate-spin" /> : null}
            {total === 0 ? L("Legg til", "Add") : L(`Legg til ${total}`, `Add ${total}`)}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
