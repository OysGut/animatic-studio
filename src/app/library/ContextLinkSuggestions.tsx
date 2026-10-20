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
  contextLinksFromJson,
  formatHeading,
  L,
  newId,
  parseJsonLoose,
  tm,
  type Asset,
  type ContextLinkSuggestion,
  type ProjectState,
} from "@/core";
import { generateText } from "@/adapters/ai/text.functions";
import type { Commands } from "@/app/project/use-commands";
import { AiGlyph } from "@/app/design/icons/AiGlyph";
import { usd, useTextEstimate } from "@/app/storylab/storylab-data";
import { Button } from "@/components/ui/button";

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
  const [ai, setAi] = useState<ReadonlyMap<string, string | null>>(new Map());
  // Forslagene for denne ressursen: regelens valg, eller AI-ens valg for de usikre
  const mine = all.filter((x) => (ai.has(x.key) ? ai.get(x.key) === asset.id : x.assetId === asset.id));
  const uncertain = all.filter((x) => x.confidence === "uncertain" && x.candidates.includes(asset.id) && !ai.has(x.key));
  const [picked, setPicked] = useState<ReadonlySet<string> | null>(null);
  const chosen = picked ?? new Set(mine.filter((x) => x.confidence === "sure" || ai.has(x.key)).map((x) => x.key));
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
      const m = contextLinksFromJson(parseJsonLoose(r.text), uncertain);
      setAi(new Map([...ai, ...m]));
      setPicked(null);
    } catch (e) {
      setErr(tm((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  function approve() {
    const accepted = mine.filter((x) => chosen.has(x.key)).map((x) => ({ ...x, assetId: asset.id }));
    const list = contextLinkCommands(state, accepted);
    const group = newId();
    for (const c of list) {
      const e = cmds.run(c, L("Koble betegnelser", "Link terms"), group);
      if (e) return setErr(e);
    }
    setErr(null);
    setPicked(null);
    setDone(
      L(
        `${accepted.length} ${accepted.length === 1 ? "linje er koblet" : "linjer er koblet"} til ${asset.name}. Kan angres.`,
        `${accepted.length} ${accepted.length === 1 ? "line is linked" : "lines are linked"} to ${asset.name}. Can be undone.`,
      ),
    );
  }

  return (
    <section data-testid="context-link-suggestions" aria-label={L("Forslag til koblinger", "Suggested links")} className="flex flex-col gap-1.5">
      <h4 className="text-xs font-medium text-text-primary">{L("Forslag til koblinger fra konteksten", "Suggested links from the context")}</h4>
      {mine.length ? (
        <ul className="max-h-56 overflow-y-auto border border-border bg-surface-1">
          {mine.map((x) => (
            <li key={x.key} data-testid="context-link-row" className="border-b border-border last:border-b-0">
              <label className="flex items-start gap-2 px-2 py-1 text-xs">
                <input
                  type="checkbox"
                  disabled={!editable}
                  checked={chosen.has(x.key)}
                  onChange={(e) => {
                    const n = new Set(chosen);
                    if (e.target.checked) n.add(x.key);
                    else n.delete(x.key);
                    setPicked(n);
                  }}
                />
                <span className="min-w-0">
                  <span className="block text-[11px] text-text-tertiary">
                    {scene(x.occurrenceId)} · «{x.word}» · {ruleText(x)}
                  </span>
                  <span className="line-clamp-2 text-text-primary">{state.blocks[x.blockId]?.text}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
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
