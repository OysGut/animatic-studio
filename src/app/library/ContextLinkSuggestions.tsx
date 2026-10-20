/**
 * Forslag til kontekstuell kobling av betegnelser (M6, REQ-0127). Regler først (hvem som er til stede,
 * kjente kontekstnavn, sist nevnte karakter); de usikre kan vurderes av AI etter anslag og bekreftelse.
 * Ingenting kobles før brukeren godkjenner; valgte forslag lagres som kontekstnavn i én angregruppe.
 */
import { useServerFn } from "@tanstack/react-start";
import { Check, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import {
  contextLinkCommands,
  contextLinkPrompt,
  contextLinkSuggestions,
  contextLinkAssessmentsFromJson,
  contextLinkDefaultSelected,
  locale,
  formatHeading,
  L,
  newId,
  parseJsonLoose,
  tm,
  type Asset,
  type ContextLinkSuggestion,
  type ContextLinkAssessment,
  type ProjectState,
} from "@/core";
import { generateText } from "@/adapters/ai/text.functions";
import type { Commands } from "@/app/project/use-commands";
import { AiGlyph } from "@/app/design/icons/AiGlyph";
import { usd, useTextEstimate } from "@/app/storylab/storylab-data";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AssetThumb, useAssetCovers } from "./AssetThumb";

const OUT_TOKENS = 1200;

export function ContextLinkSuggestions({
  state,
  asset,
  productionId,
  editable,
  cmds,
}: {
  state: ProjectState;
  asset: Asset;
  productionId: string;
  editable: boolean;
  cmds: Commands;
}) {
  const all = useMemo(() => contextLinkSuggestions(state, productionId), [state, productionId]);
  const [ai, setAi] = useState<ReadonlyMap<string, ContextLinkAssessment>>(new Map());
  const [targets, setTargets] = useState<ReadonlyMap<string, string>>(new Map());
  // Panelets forslag blir værende når brukeren bytter mål, også til en annen ressurs.
  const mine = all.filter((x) => x.assetId === asset.id || ai.get(x.key)?.assetId === asset.id || targets.has(x.key));
  const uncertain = all.filter((x) => x.confidence === "uncertain" && x.candidates.includes(asset.id) && !ai.has(x.key));
  const target = (x: ContextLinkSuggestion) => targets.get(x.key) ?? (ai.has(x.key) ? ai.get(x.key)?.assetId ?? null : x.assetId);
  const [picked, setPicked] = useState<ReadonlyMap<string, boolean>>(new Map());
  const chosen = new Set(mine.filter((x) => target(x) && (picked.get(x.key) ?? contextLinkDefaultSelected(x, ai.has(x.key), targets.has(x.key)))).map((x) => x.key));
  const options = Object.values(state.assets).filter((a) => !a.removed && !a.archived && a.kind !== "sound");
  const covers = useAssetCovers(state, options.map((a) => a.id));
  const groups = new Map<string, ContextLinkSuggestion[]>();
  for (const x of mine) {
    const key = JSON.stringify([x.word.toLocaleLowerCase(locale()), state.blocks[x.blockId]?.text, target(x), ai.has(x.key) ? "ai" : x.rule]);
    const group = groups.get(key) ?? [];
    group.push(x);
    groups.set(key, group);
  }
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const prompt = useMemo(() => contextLinkPrompt(state, uncertain), [state, uncertain]);
  const est = useTextEstimate("general", prompt.system.length + prompt.user.length, OUT_TOKENS);
  const gen = useServerFn(generateText);
  if (mine.length === 0 && uncertain.length === 0 && !done) return null;

  const scene = (occId: string) => {
    const o = state.occurrences[occId];
    const v = o ? state.variants[o.variantId] : null;
    return v ? formatHeading(v.heading) : "";
  };
  const ruleText = (x: ContextLinkSuggestion) =>
    ai.has(x.key)
      ? L("AI-vurdering", "AI assessment")
      : x.rule === "present"
        ? L("den eneste av dem i scenen", "the only one of them in the scene")
        : x.rule === "known_context"
          ? L("samme betegnelse er koblet før", "the same term has been linked before")
          : L("sist nevnte karakter (usikkert)", "last mentioned character (uncertain)");

  async function askAi() {
    setConfirm(false);
    setBusy(true);
    setErr(null);
    try {
      const r = await gen({
        data: { projectId: state.project.id, task: "general", json: true, system: prompt.system, messages: [{ role: "user", content: prompt.user }], maxTokens: OUT_TOKENS },
      });
      if (!r.ok) return setErr(tm(r.message));
      const m = contextLinkAssessmentsFromJson(parseJsonLoose(r.text), uncertain);
      setAi(new Map([...ai, ...m]));
      setPicked((prev) => {
        const next = new Map(prev);
        for (const key of m.keys()) next.set(key, false);
        return next;
      });
    } catch (e) {
      setErr(tm((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  function approve() {
    const accepted = mine.flatMap((x) => {
      const assetId = target(x);
      return chosen.has(x.key) && assetId ? [{ ...x, assetId }] : [];
    });
    const list = contextLinkCommands(state, accepted);
    const group = newId();
    for (const c of list) {
      const e = cmds.run(c, L("Koble betegnelser", "Link terms"), group);
      if (e) return setErr(e);
    }
    setErr(null);
    setPicked(new Map());
    setDone(
      L(
        `${accepted.length} ${accepted.length === 1 ? "linje er koblet" : "linjer er koblet"}. Kan angres.`,
        `${accepted.length} ${accepted.length === 1 ? "line is linked" : "lines are linked"}. Can be undone.`,
      ),
    );
  }

  return (
    <section data-testid="context-link-suggestions" aria-label={L("Forslag til koblinger", "Suggested links")} className="flex flex-col gap-1.5">
      <h4 className="text-xs font-medium text-text-primary">{L("Forslag til koblinger fra konteksten", "Suggested links from the context")}</h4>
      {mine.length ? (
        <div className="max-h-80 overflow-y-auto border border-border bg-surface-1">
          {[...groups].map(([key, group]) => (
            <div key={key} data-testid="context-link-group" className="border-b border-border last:border-b-0">
              {group.length > 1 ? <p data-testid="context-link-repeat" className="px-2 py-1 text-xs text-text-secondary">{L(
                `Samme ord og linje i ${group.length} sceneforekomster; samme foreslåtte mål og begrunnelse.`,
                `Same word and line in ${group.length} scene occurrences; same proposed target and reason.`,
              )}</p> : null}
              <ul>
                {group.map((x) => {
                  const id = target(x);
                  const assessed = ai.get(x.key);
                  const score = targets.has(x.key) ? null : assessed?.confidence ?? null;
                  return <li key={x.key} data-testid="context-link-row" className="flex items-start gap-2 px-2 py-2 text-xs">
                    <input type="checkbox" disabled={!editable || !id} aria-label={L(`Velg kobling for «${x.word}» i ${scene(x.occurrenceId)}`, `Select link for “${x.word}” in ${scene(x.occurrenceId)}`)}
                      checked={chosen.has(x.key)} onChange={(e) => setPicked(new Map(picked).set(x.key, e.target.checked))} />
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <div data-testid="context-link-target" className="flex min-w-0 items-center gap-2 text-text-primary">
                        <span>«{x.word}» →</span>
                        {id ? <AssetThumb state={state} assetId={id} url={covers[id]} size="sm" /> : null}
                        <Select value={id ?? ""} disabled={!editable} onValueChange={(value) => {
                          setTargets(new Map(targets).set(x.key, value));
                          setPicked(new Map(picked).set(x.key, false));
                        }}>
                          <SelectTrigger data-testid="context-link-target-select" aria-label={L("Målressurs", "Target asset")} className="h-8 min-w-0 flex-1 text-xs"><SelectValue placeholder={L("Ingen sikker kobling", "No clear link")} /></SelectTrigger>
                          <SelectContent>{options.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <span className="text-text-tertiary">{scene(x.occurrenceId)} · {targets.has(x.key) ? L("Manuelt mål", "Manual target") : ruleText(x)}</span>
                      <span data-testid="context-link-confidence" className="text-text-secondary">{score !== null
                        ? L(`Sikkerhet: ${new Intl.NumberFormat(locale(), { maximumFractionDigits: 0 }).format(score * 100)} %`, `Confidence: ${new Intl.NumberFormat(locale(), { maximumFractionDigits: 0 }).format(score * 100)} %`)
                        : L("Sikkerhet: ikke tallfestet", "Confidence: not quantified")}</span>
                      <span className="line-clamp-2 text-text-primary">{state.blocks[x.blockId]?.text}</span>
                    </div>
                  </li>;
                })}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
      {editable && mine.length ? (
        <Button size="sm" variant="secondary" className="self-start" data-testid="context-link-approve" disabled={chosen.size === 0} onClick={approve}>
          <Check />
          {L(`Godkjenn ${chosen.size} ${chosen.size === 1 ? "kobling" : "koblinger"}`, `Approve ${chosen.size} ${chosen.size === 1 ? "link" : "links"}`)}
        </Button>
      ) : null}
      {editable && uncertain.length ? (
        confirm ? (
          <div role="alertdialog" aria-label={L("Bekreft AI-vurdering", "Confirm AI assessment")} className="flex flex-col gap-1.5 rounded-sm border border-border bg-surface-2 p-2 text-xs">
            <p data-testid="context-link-cost" className="text-text-primary">
              {L(
                `${uncertain.length} usikre ${uncertain.length === 1 ? "linje" : "linjer"} · ${est.label} · anslått ${usd(est.usd)}. Vil du fortsette?`,
                `${uncertain.length} uncertain ${uncertain.length === 1 ? "line" : "lines"} · ${est.label} · estimated ${usd(est.usd)}. Do you want to continue?`,
              )}
            </p>
            <div className="flex gap-2">
              <Button size="sm" data-testid="context-link-ai-run" onClick={() => void askAi()} disabled={busy || !!est.error}>
                <AiGlyph /> {L("Ja, la AI vurdere", "Yes, let AI assess")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>
                {L("Avbryt", "Cancel")}
              </Button>
            </div>
          </div>
        ) : (
          <Button size="sm" variant="ghost" className="self-start" data-testid="context-link-ai" disabled={busy || est.loading} onClick={() => setConfirm(true)}>
            {busy ? <Loader2 className="animate-spin" /> : <AiGlyph />}
            {L(`La AI vurdere ${uncertain.length} usikre …`, `Let AI assess ${uncertain.length} uncertain …`)}
          </Button>
        )
      ) : null}
      {done ? <p role="status" className="text-xs text-status-success">{done}</p> : null}
      {err ? <p role="alert" className="text-xs text-status-danger">{err}</p> : null}
    </section>
  );
}
