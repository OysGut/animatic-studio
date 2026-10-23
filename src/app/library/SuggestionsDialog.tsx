/**
 * Forslag fra manuset (REQ-0128): karakterer og steder som ikke finnes i biblioteket. Ingenting legges til
 * før brukeren har valgt det. Navn som ligner en eksisterende ressurs, kan legges til som alternativt navn
 * i stedet for som ny ressurs – men bare når brukeren velger det.
 */
import { ResizableDialogContent } from "@/app/shared/ResizableDialogContent";
import { requestReanalyze, useAnalysisRows, useAnalysisStatus } from "./entity-analysis-store";
import { analysisScenes, mergeAnalysis } from "@/core/library/analysis-hash";
import type { AIClassification } from "@/core/library/classification-prompt";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { collation, ASSET_KIND_LABEL, SOURCE_NOTE_LABEL, displayName, nameKey, mainProduction, newId, suggestionAliases, type Asset, type AssetFields, type AssetKind, type LibrarySuggestion, type ProjectState } from "@/core";
import type { Commands } from "@/app/project/use-commands";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { t } from "@/core/i18n/keyed";
import { tm } from "@/core/i18n";

type Choice = "skip" | "new" | "alias";
type PickableKind = "character" | "animal" | "object" | "location" | "environment" | "sound";

const KIND_CHOICES: readonly PickableKind[] = ["character", "animal", "object", "location", "environment", "sound"];

const key = (x: LibrarySuggestion) => `${x.reason}|${x.name}`;

const GROUPS: readonly { kind: PickableKind; title: string }[] = [
  { kind: "character", get title() { return t("app-library-suggestions-dialog.groups.message.f9db2ebcc3ce"); } },
  { kind: "animal", get title() { return t("app-library-suggestions-dialog.groups.message.155fef7d52d3"); } },
  { kind: "object", get title() { return t("app-library-suggestions-dialog.groups.message.ab9a17e4c764"); } },
  { kind: "location", get title() { return t("app-library-suggestions-dialog.groups.message.43bc4e836b38"); } },
  { kind: "environment", get title() { return t("app-library-suggestions-dialog.groups.message.b7ca8ee8c932"); } },
  { kind: "sound", get title() { return t("app-library-suggestions-dialog.groups.message.a882465a46e5"); } },
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

const scenesLabel = (n: number) => (n === 1 ? "1 scene" : t("app-library-suggestions-dialog.scenes-label.message.734392b9f1e2", { n: String(n) }));

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
    text += `${text ? " · " : ""}${t("app-library-suggestions-dialog.evidence.message.f769d67daa37")}: ${also}`;
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
    } catch { setErr(t("app-library-suggestions-dialog.improve.set-err.cb3dda3f758f")); }
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
            ? t("app-library-suggestions-dialog.r.cmds-run-and-wait.7d185f257bb1", { value1: String(suggestedName(firstNew)) })
            : t("app-library-suggestions-dialog.r.cmds-run-and-wait.20d5f32ac0e0", { length: String(chosenNew.length) }),
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
          t("app-library-suggestions-dialog.r.cmds-run-and-wait.8aa1d568cfcd", { name: String(a.name) }),
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
      <ResizableDialogContent sizeKey="library-suggestions" data-testid="library-suggestions" className="max-h-[90vh] max-w-[720px] overflow-y-auto border-border bg-surface-2">
        <DialogHeader>
          <DialogTitle>{t("app-library-suggestions-dialog.suggestions-dialog.dialog-title.21b282998039")}</DialogTitle>
          <DialogDescription>
            {t("app-library-suggestions-dialog.suggestions-dialog.dialog-description.21b282998039")}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" data-testid="library-suggestions-ai" disabled={busy || aiBusy || status.kind === "running" || !visible.length} onClick={() => void improve()}>{aiBusy || status.kind === "running" ? <Loader2 className="animate-spin" /> : null}{t("app-library-suggestions-dialog.suggestions-dialog.button.b615a940aa13")}</Button>
          <p role="status" data-testid="library-suggestions-ai-status" className="text-xs text-text-secondary">
            {status.kind === "running"
              ? t("app-library-suggestions-dialog.suggestions-dialog.p.e852504da973")
              : aiCount
                ? t("app-library-suggestions-dialog.suggestions-dialog.p.38f98c0c8465", { aiCount: String(aiCount) })
                : t("app-library-suggestions-dialog.suggestions-dialog.p.60f96d69d7f1")}
          </p>
        </div>
        {visible.length === 0 && hiddenCount === 0 ? (
          <p className="text-[13px] text-text-secondary">
            {t("app-library-suggestions-dialog.suggestions-dialog.p.b68e2fbc2597")}
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
                  {t("app-library-suggestions-dialog.suggestions-dialog.button.b63fb3c6cd31")}
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
                  {t("app-library-suggestions-dialog.suggestions-dialog.button.5028d6d9cd00")}
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
                        aria-label={t("app-library-suggestions-dialog.suggestions-dialog.aria-label.1bcd0bc19178", { name: String(s.name) })}
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
                          <span className="ml-2 text-xs text-status-uncertain" data-testid="library-suggestion-confidence">{confidenceOf(s) === "high" ? t("app-library-suggestions-dialog.suggestions-dialog.span.be034ba6f970") : confidenceOf(s) === "medium" ? t("app-library-suggestions-dialog.suggestions-dialog.span.430eb7822403") : t("app-library-suggestions-dialog.suggestions-dialog.span.5ae2efe875b3")}</span>
                        </div>
                        <p className="break-words text-xs text-text-secondary">{ai[s.name]?.reason ?? (s.evidence ? tm(s.evidence) : "")}</p>
                        {ai[s.name]?.aliasOf && suggestions.some((candidate) => candidate.name === ai[s.name]?.aliasOf) ? <p className="break-words text-xs text-status-uncertain">{t("app-library-suggestions-dialog.suggestions-dialog.p.7c076dc7459a", { aliasOf: String(ai[s.name]?.aliasOf) })}</p> : null}
                        <div className="truncate text-xs text-text-tertiary" title={evidence(s)}>
                          {evidence(s)}
                        </div>
                      </div>
                        <select
                          aria-label={t("app-library-suggestions-dialog.suggestions-dialog.aria-label.cc62a984fdab", { name: String(s.name) })}
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
                          aria-label={t("app-library-suggestions-dialog.suggestions-dialog.aria-label.d0912c5df509", { name: String(s.name) })}
                          value={c === "skip" ? "alias" : c}
                          onChange={(e) =>
                            setChoice((x) => ({ ...x, [k]: e.target.value as Choice }))
                          }
                          className="h-7 max-w-[300px] rounded-sm border border-border-control bg-surface-3 px-1.5 text-xs text-status-uncertain"
                          title={t("app-library-suggestions-dialog.suggestions-dialog.title.d7acf2e6e4fe")}
                        >
                          <option value="alias">
                            {t("app-library-suggestions-dialog.suggestions-dialog.option.13b268fecac1", { assetName: String(s.possibleMatch.assetName) })}
                          </option>
                          <option value="new">
                            {t("app-library-suggestions-dialog.suggestions-dialog.option.9ca86e9fbf34")} {ASSET_KIND_LABEL[kind].toLowerCase()}
                          </option>
                        </select>
                      ) : (
                        <span className="text-xs text-text-tertiary">→ {suggestedName(s)}</span>
                      )}
                      <Button variant="ghost" size="sm"
                        type="button"
                        className="text-xs text-text-tertiary hover:text-text-primary"
                        title={t("app-library-suggestions-dialog.suggestions-dialog.title.20a9a87ce2cb")}
                        onClick={() => hide(k)}
                      >
                        {t("app-library-suggestions-dialog.suggestions-dialog.button.2399d033d0dc")}
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
              {t("app-library-suggestions-dialog.suggestions-dialog.button.14f757443b5f", { hiddenCount: String(hiddenCount) })}
            </Button>
          ) : null}
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("app-library-suggestions-dialog.suggestions-dialog.button.a4b8512b9376")}
          </Button>
          <Button data-testid="library-suggestions-add" onClick={() => void apply()} disabled={busy || aiBusy || total === 0}>
            {busy ? <Loader2 className="animate-spin" /> : null}
            {total === 0 ? t("app-library-suggestions-dialog.suggestions-dialog.button.19b6a4999c76") : t("app-library-suggestions-dialog.suggestions-dialog.button.99116cd19559", { total: String(total) })}
          </Button>
        </div>
      </ResizableDialogContent>
    </Dialog>
  );
}
