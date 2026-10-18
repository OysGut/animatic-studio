/**
 * Skrivehjelp i manuset (T2): omskriving, neste replikk, scene fra beskrivelse eller canvasnode, språkvask,
 * formatsjekk (gratis, uten AI) og oversettelsesutkast til engelsk. Alt kommer som forslag med diff; ingenting
 * skrives i manuset før brukeren velger «Bruk» eller «Bruk valgte» (én angregruppe med vanlige kommandoer).
 * Kostnaden bekreftes før det første kallet i økten, deretter vises en løpende sum.
 */
import { useServerFn } from "@tanstack/react-start";
import { useBlocker } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  L,
  REWRITE_MODES,
  buildAssistPrompt,
  canSaveAsTrial,
  formatCheck,
  newId,
  orderedOccurrences,
  planApplyProposal,
  planTrialNotes,
  proposalConflicts,
  proposalFromReply,
  sceneNumberOf,
  type AssistKind,
  type AssistPrompt,
  type AssistRequest,
  type ProjectState,
  type Proposal,
  type RewriteMode,
} from "@/core";
import { scriptAssist } from "@/adapters/ai/script-assist.functions";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ToolbarButton } from "@/app/shell/workspace-chrome";
import { usd, useTextEstimate } from "@/app/storylab/storylab-data";
import type { Commands } from "@/app/project/use-commands";
import type { Selection } from "../ScriptPageView";
import { ProposalDiff } from "./ProposalDiff";

export type AssistAction = "rewrite" | "next_line" | "format";
export interface AssistTrigger {
  readonly action: AssistAction;
  readonly blockIds: readonly string[];
  readonly nonce: number;
}

const MODE_LABEL: Record<RewriteMode, () => string> = {
  shorter: () => L("Kortere", "Shorter"),
  clearer: () => L("Tydeligere", "Clearer"),
  spoken: () => L("Mer muntlig", "More spoken"),
  tone: () => L("Annen tone …", "Different tone …"),
  free: () => L("Fritt ønske …", "Free request …"),
};

const ACTION_LABEL: Record<AssistKind, () => string> = {
  rewrite: () => L("Skriv om", "Rewrite"),
  next_line: () => L("Neste replikk", "Next line"),
  scene: () => L("Ny scene", "New scene"),
  polish: () => L("Språkvask", "Language polish"),
  translate: () => L("Oversettelsesutkast", "Translation draft"),
};

export function WritingPanel({
  projectId,
  state,
  productionId,
  selection,
  editable,
  cmds,
  authorName,
  getSelectedBlockIds,
  trigger,
  onSelect,
}: {
  projectId: string;
  state: ProjectState;
  productionId: string;
  selection: Selection;
  editable: boolean;
  cmds: Commands;
  authorName: string;
  getSelectedBlockIds: () => string[];
  trigger: AssistTrigger | null;
  onSelect: (s: Selection) => void;
}) {
  const call = useServerFn(scriptAssist);
  const [mode, setMode] = useState<RewriteMode>("clearer");
  const [instruction, setInstruction] = useState("");
  const [characterId, setCharacterId] = useState<string>("");
  const [description, setDescription] = useState("");
  const [nodeId, setNodeId] = useState<string>("");
  const [nodeConfirmed, setNodeConfirmed] = useState(false);
  const [targets, setTargets] = useState<readonly string[]>([]);
  const [pending, setPending] = useState<{ request: AssistRequest; prompt: AssistPrompt } | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; retry: AssistRequest | null } | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [leaving, setLeaving] = useState<"scene" | "route" | null>(null);
  const instructionRef = useRef<HTMLTextAreaElement | null>(null);

  const occ = selection.occurrenceId ? state.occurrences[selection.occurrenceId] : undefined;
  const characters = useMemo(
    () => Object.values(state.assets).filter((a) => !a.removed && (a.kind === "character" || a.kind === "animal")),
    [state.assets],
  );
  const sceneNodes = useMemo(
    () => Object.values(state.canvasNodes).filter((n) => !n.removed && n.kind === "scene"),
    [state.canvasNodes],
  );
  const node = nodeId ? state.canvasNodes[nodeId] : undefined;
  const nodeUsedIn = useMemo(() => {
    if (!node?.sceneId) return null;
    const o = orderedOccurrences(state, productionId).find((x) => x.sceneId === node.sceneId);
    return o ? (sceneNumberOf(state, o) ?? "?") : "?";
  }, [node, state, productionId]);
  const conflicts = useMemo(() => (proposal ? proposalConflicts(state, proposal) : new Set<string>()), [proposal, state]);
  const est = useTextEstimate(
    "script",
    pending ? pending.prompt.system.length + pending.prompt.user.length : 0,
    pending?.prompt.maxTokens ?? 1,
  );

  const currentTargets = () => {
    const ids = getSelectedBlockIds();
    return ids.length ? ids : selection.blockId ? [selection.blockId] : [];
  };

  // Hurtigtast eller kontekstmeny
  useEffect(() => {
    if (!trigger) return;
    setTargets(trigger.blockIds);
    if (trigger.action === "format") runFormat();
    else if (trigger.action === "rewrite") setTimeout(() => instructionRef.current?.focus(), 30);
    else if (trigger.action === "next_line") start("next_line", trigger.blockIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger?.nonce]);

  // Bytte av scene med et forslag som ikke er lagret
  useEffect(() => {
    if (proposal && proposal.occurrenceId && selection.occurrenceId !== proposal.occurrenceId && !leaving)
      setLeaving("scene");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection.occurrenceId]);
  // Lukke manuset (navigere bort) med et forslag som ikke er lagret
  const blocker = useBlocker({ shouldBlockFn: () => proposal !== null, withResolver: true, enableBeforeUnload: () => proposal !== null });
  useEffect(() => {
    if (blocker.status === "blocked") setLeaving("route");
  }, [blocker.status]);

  function request(kind: AssistKind, blockIds: readonly string[]): AssistRequest {
    const base = { kind, productionId, occurrenceId: occ?.id ?? null, blockIds: [] as string[] };
    if (kind === "rewrite")
      return { ...base, blockIds: [...blockIds], mode, ...(instruction.trim() ? { instruction: instruction.trim() } : {}) };
    if (kind === "polish" || kind === "translate") return { ...base, blockIds: [...blockIds] };
    if (kind === "next_line") {
      const after = blockIds[blockIds.length - 1] ?? selection.blockId ?? null;
      return {
        ...base,
        afterBlockId: after,
        characterAssetId: characterId || characters[0]?.id || null,
        ...(instruction.trim() ? { instruction: instruction.trim() } : {}),
      };
    }
    return {
      ...base,
      ...(nodeId ? { canvasNodeId: nodeId } : {}),
      ...(description.trim() ? { description: description.trim() } : {}),
    };
  }

  function start(kind: AssistKind, blockIds = targets.length ? targets : currentTargets()) {
    setError(null);
    if (proposal) return setError({ message: L("Velg først hva som skal skje med forslaget som ligger her.", "First choose what to do with the current suggestion."), retry: null });
    if (kind === "scene" && node?.sceneId && !nodeConfirmed)
      return setError({ message: L("Bekreft at du vil lage en ny, separat scene fra noden.", "Confirm that you want to create a new, separate scene from the node."), retry: null });
    const r = request(kind, blockIds);
    const built = buildAssistPrompt(state, r);
    if (!built.ok) return setError({ message: built.message, retry: null });
    if (!confirmed) return setPending({ request: r, prompt: built.prompt });
    void send(r, built.prompt);
  }

  async function send(r: AssistRequest, prompt: AssistPrompt) {
    setBusy(true);
    setError(null);
    const snapshot = cmds.current() ?? state;
    try {
      const res = await call({ data: { projectId, request: r } });
      if (!res.ok) return setError({ message: res.message, retry: r });
      setTotal((t) => t + (Number.isFinite(res.costUsd) ? res.costUsd : 0));
      const p = proposalFromReply(snapshot, r, prompt, res.text, { costUsd: res.costUsd, usedFallback: res.usedFallback });
      if (!p || (p.items.length === 0 && !p.headingFix))
        return setError({
          message: p
            ? L("Forslaget var likt teksten som står der.", "The suggestion equals the current text.")
            : L("Svaret fra AI kunne ikke leses. Prøv igjen.", "The AI reply could not be read. Try again."),
          retry: p ? null : r,
        });
      setProposal(p);
      setPicked(new Set([...p.items.map((i) => i.key), ...(p.headingFix ? ["heading"] : [])]));
    } catch (e) {
      setError({ message: e instanceof Error ? e.message : String(e), retry: r });
    } finally {
      setBusy(false);
    }
  }

  function runFormat() {
    setError(null);
    if (!occ) return setError({ message: L("Velg en scene", "Select a scene"), retry: null });
    if (proposal) return setError({ message: L("Velg først hva som skal skje med forslaget som ligger her.", "First choose what to do with the current suggestion."), retry: null });
    const p = formatCheck(state, productionId, occ.id);
    if (p.items.length === 0 && !p.headingFix)
      return setError({ message: L("Formatet ser riktig ut. Ingenting å rette.", "The format looks right. Nothing to fix."), retry: null });
    setProposal(p);
    setPicked(new Set([...p.items.map((i) => i.key), ...(p.headingFix ? ["heading"] : [])]));
  }

  function finish() {
    setProposal(null);
    setPicked(new Set());
    setTargets([]);
    setNodeConfirmed(false);
  }

  function runAll(plan: ReturnType<typeof planApplyProposal>, label: string): boolean {
    if (!plan.ok) {
      setError({ message: plan.message, retry: null });
      return false;
    }
    const group = newId();
    for (const c of plan.commands) {
      const e = cmds.run(c, label, group);
      if (e) {
        setError({ message: e, retry: null });
        return false;
      }
    }
    return true;
  }

  function apply(keys: ReadonlySet<string>) {
    if (!proposal) return;
    const now = cmds.current() ?? state;
    const plan = planApplyProposal(now, proposal, keys);
    if (runAll(plan, L(`${ACTION_LABEL[proposal.kind === "format" ? "polish" : proposal.kind]()}: bruk forslaget`, `${ACTION_LABEL[proposal.kind === "format" ? "polish" : proposal.kind]()}: use suggestion`))) {
      if (plan.ok && proposal.kind === "scene" && plan.occurrenceId) {
        finish();
        onSelect({ occurrenceId: plan.occurrenceId, blockId: null });
        return;
      }
      finish();
    }
  }

  function saveTrial(): boolean {
    if (!proposal) return false;
    const ok = runAll(planTrialNotes(cmds.current() ?? state, proposal, picked, authorName), L("Lagre som forsøksvis redigering", "Save as trial edit"));
    if (ok) finish();
    return ok;
  }

  function resolveLeave(choice: "trial" | "discard" | "cancel") {
    const kind = leaving;
    if (choice === "trial" && !saveTrial()) return;
    if (choice === "discard") finish();
    setLeaving(null);
    if (kind === "route") {
      if (choice === "cancel") blocker.reset?.();
      else blocker.proceed?.();
    } else if (choice === "cancel" && proposal?.occurrenceId) {
      onSelect({ occurrenceId: proposal.occurrenceId, blockId: null });
    }
  }

  if (!editable)
    return (
      <p className="p-3 text-[13px] text-text-secondary" data-testid="assist-readonly">
        {L("Skrivehjelpen krever redigeringstilgang.", "The writing assistant requires edit access.")}
      </p>
    );

  const n = targets.length || currentTargets().length;
  const disabled = busy || !!proposal;

  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3 text-[13px]" data-testid="assist-panel">
      {total > 0 ? (
        <p className="text-[12px] text-text-tertiary" data-testid="assist-total">
          {L(`Brukt i økten: ${usd(total)}`, `Spent this session: ${usd(total)}`)}
        </p>
      ) : null}

      {proposal ? (
        <section className="space-y-3" data-testid="assist-proposal" data-kind={proposal.kind}>
          <h3 className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
            {proposal.kind === "format" ? L("Formatsjekk", "Format check") : ACTION_LABEL[proposal.kind]()}
          </h3>
          {proposal.usedFallback ? (
            <p className="text-[12px] text-text-tertiary" data-testid="assist-fallback-note">
              {L("Den innebygde AI-en ble brukt fordi ingen egen tekstleverandør kunne brukes.", "The built-in AI was used because no own text provider could be used.")}
            </p>
          ) : null}
          {proposal.kind === "translate" ? (
            <p className="text-[12px] text-text-secondary">
              {L("Utkastet lagres som usikker oversettelse og må godkjennes. Det norske manuset endres ikke.", "The draft is saved as an uncertain translation and must be approved. The Norwegian script is not changed.")}
            </p>
          ) : null}
          <ProposalDiff
            proposal={proposal}
            picked={picked}
            conflicts={conflicts}
            onToggle={(k) => setPicked((s) => { const x = new Set(s); if (x.has(k)) x.delete(k); else x.add(k); return x; })}
          />
          {conflicts.size > 0 ? (
            <p role="alert" className="text-[12px] text-status-danger" data-testid="assist-conflict-note">
              {L("Noen linjer er endret av noen andre etter at forslaget ble laget. De kan ikke brukes; lag forslaget på nytt.", "Some lines were changed by someone else after the suggestion was made. They cannot be used; create the suggestion again.")}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <ToolbarButton variant="primary" data-testid="assist-apply" disabled={conflicts.size > 0} onClick={() => apply(new Set([...proposal.items.map((i) => i.key), ...(proposal.headingFix ? ["heading"] : [])]))}>
              {L("Bruk", "Use")}
            </ToolbarButton>
            <ToolbarButton data-testid="assist-apply-selected" onClick={() => apply(picked)}>
              {L("Bruk valgte", "Use selected")}
            </ToolbarButton>
            {canSaveAsTrial(proposal) ? (
              <ToolbarButton data-testid="assist-trial" onClick={saveTrial}>
                {L("Lagre som forsøksvis redigering", "Save as trial edit")}
              </ToolbarButton>
            ) : null}
            <ToolbarButton data-testid="assist-discard" onClick={finish}>
              {L("Forkast", "Discard")}
            </ToolbarButton>
          </div>
        </section>
      ) : null}

      {pending ? (
        <section className="space-y-2 rounded-sm border border-border p-2" data-testid="assist-cost">
          <p className="text-text-secondary">
            {est.loading
              ? L("Finner tekst-AI …", "Finding text AI …")
              : est.error
                ? est.error
                : L(`${ACTION_LABEL[pending.request.kind]()} · ${est.label} · anslått ${usd(est.usd)}`, `${ACTION_LABEL[pending.request.kind]()} · ${est.label} · estimated ${usd(est.usd)}`)}
          </p>
          <div className="flex gap-2">
            <ToolbarButton
              variant="primary"
              data-testid="assist-confirm"
              disabled={est.loading || !!est.error}
              onClick={() => {
                const p = pending;
                setPending(null);
                setConfirmed(true);
                void send(p.request, p.prompt);
              }}
            >
              {L("Bekreft og send", "Confirm and send")}
            </ToolbarButton>
            <ToolbarButton data-testid="assist-cancel" onClick={() => setPending(null)}>
              {L("Avbryt", "Cancel")}
            </ToolbarButton>
          </div>
        </section>
      ) : null}

      {busy ? (
        <p className="flex items-center gap-2 text-text-secondary" data-testid="assist-busy">
          <Loader2 className="size-4 animate-spin" />
          {L("Skriver forslaget …", "Writing the suggestion …")}
        </p>
      ) : null}
      {error ? (
        <div role="alert" className="space-y-1 text-[12px] text-status-danger" data-testid="assist-error">
          <p>{error.message}</p>
          {error.retry ? (
            <ToolbarButton data-testid="assist-retry" onClick={() => start(error.retry!.kind, error.retry!.blockIds)}>
              {L("Prøv igjen", "Try again")}
            </ToolbarButton>
          ) : null}
        </div>
      ) : null}

      <section className="space-y-2">
        <h3 className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">{L("Skriv om", "Rewrite")}</h3>
        <p className="text-[12px] text-text-tertiary" data-testid="assist-target-count">
          {n ? L(`${n} linjer valgt`, `${n} lines selected`) : L("Marker en replikk eller handling i manuset.", "Select a line or action in the script.")}
        </p>
        <select className="w-full rounded-sm border border-border bg-surface-2 px-2 py-1" value={mode} onChange={(e) => setMode(e.target.value as RewriteMode)} data-testid="assist-rewrite-mode" aria-label={L("Hvordan", "How")}>
          {REWRITE_MODES.map((m) => (
            <option key={m} value={m}>{MODE_LABEL[m]()}</option>
          ))}
        </select>
        <Textarea ref={instructionRef} rows={2} value={instruction} maxLength={500} onChange={(e) => setInstruction(e.target.value)} placeholder={L("Ønske (valgfritt) – f.eks. «mer sint»", "Request (optional) – e.g. “angrier”")} data-testid="assist-instruction" />
        <div className="flex flex-wrap gap-2">
          <ToolbarButton disabled={disabled || !n} onClick={() => start("rewrite")} data-testid="assist-rewrite" title={L("Skriv om (Alt + Shift + R)", "Rewrite (Alt + Shift + R)")}>
            {L("Skriv om …", "Rewrite …")}
          </ToolbarButton>
          <ToolbarButton disabled={disabled || !n} onClick={() => start("polish")} data-testid="assist-polish">
            {L("Språkvask", "Language polish")}
          </ToolbarButton>
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">{L("Neste replikk", "Next line")}</h3>
        <select className="w-full rounded-sm border border-border bg-surface-2 px-2 py-1" value={characterId || characters[0]?.id || ""} onChange={(e) => setCharacterId(e.target.value)} data-testid="assist-character" aria-label={L("Karakter", "Character")}>
          {characters.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
        <ToolbarButton disabled={disabled || !occ || characters.length === 0} onClick={() => start("next_line")} data-testid="assist-next-line" title={L("Neste replikk (Alt + Shift + N)", "Next line (Alt + Shift + N)")}>
          {L("Foreslå neste replikk", "Suggest next line")}
        </ToolbarButton>
        <p className="text-[11px] text-text-tertiary">
          {L("Karakteren vet bare det Story Lab sier at den vet på dette tidspunktet.", "The character only knows what Story Lab says it knows at this point.")}
        </p>
      </section>

      <section className="space-y-2">
        <h3 className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">{L("Ny scene", "New scene")}</h3>
        <select className="w-full rounded-sm border border-border bg-surface-2 px-2 py-1" value={nodeId} onChange={(e) => { setNodeId(e.target.value); setNodeConfirmed(false); }} data-testid="assist-scene-node" aria-label={L("Scenenode", "Scene node")}>
          <option value="">{L("Fra beskrivelse", "From description")}</option>
          {sceneNodes.map((c) => (
            <option key={c.id} value={c.id}>{c.title || L("(uten tittel)", "(untitled)")}</option>
          ))}
        </select>
        {nodeUsedIn ? (
          <label className="flex items-start gap-2 text-[12px] text-status-warning" data-testid="assist-node-used">
            <input type="checkbox" checked={nodeConfirmed} onChange={(e) => setNodeConfirmed(e.target.checked)} data-testid="assist-node-confirm" />
            {L(`Noden er allerede brukt i scene ${nodeUsedIn}. Lag likevel en ny, separat scene (den eksisterende endres ikke).`, `The node is already used in scene ${nodeUsedIn}. Create a new, separate scene anyway (the existing one is not changed).`)}
          </label>
        ) : null}
        <Textarea rows={3} value={description} maxLength={2000} onChange={(e) => setDescription(e.target.value)} placeholder={L("Kort beskrivelse av scenen", "Short description of the scene")} data-testid="assist-scene-description" />
        <ToolbarButton disabled={disabled || (!description.trim() && !nodeId)} onClick={() => start("scene")} data-testid="assist-scene">
          {L("Lag utkast til scene", "Draft a scene")}
        </ToolbarButton>
        <p className="text-[11px] text-text-tertiary">
          {occ ? L("Settes inn etter den valgte scenen.", "Inserted after the selected scene.") : L("Settes inn til slutt.", "Inserted at the end.")}
        </p>
      </section>

      <section className="space-y-2">
        <h3 className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">{L("Sjekk og oversettelse", "Check and translation")}</h3>
        <div className="flex flex-wrap gap-2">
          <ToolbarButton disabled={disabled || !occ} onClick={runFormat} data-testid="assist-format" title={L("Formatsjekk, gratis (Alt + Shift + F)", "Format check, free (Alt + Shift + F)")}>
            {L("Formatsjekk", "Format check")}
          </ToolbarButton>
          <ToolbarButton disabled={disabled || !occ} onClick={() => start("translate")} data-testid="assist-translate">
            {L("Engelsk utkast", "English draft")}
          </ToolbarButton>
        </div>
      </section>

      <Dialog open={leaving !== null} onOpenChange={(o) => (o ? null : resolveLeave("cancel"))}>
        <DialogContent data-testid="assist-leave-dialog">
          <DialogHeader>
            <DialogTitle>{L("Forkast forslaget?", "Discard the suggestion?")}</DialogTitle>
            <DialogDescription>
              {L("Forslaget fra skrivehjelpen er ikke brukt eller lagret.", "The suggestion from the writing assistant has not been used or saved.")}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap justify-end gap-2">
            <ToolbarButton data-testid="assist-leave-trial" disabled={!proposal || !canSaveAsTrial(proposal)} onClick={() => resolveLeave("trial")}>
              {L("Lagre som forsøksvis redigering", "Save as trial edit")}
            </ToolbarButton>
            <ToolbarButton data-testid="assist-leave-discard" onClick={() => resolveLeave("discard")}>
              {L("Forkast", "Discard")}
            </ToolbarButton>
            <ToolbarButton variant="primary" data-testid="assist-leave-cancel" onClick={() => resolveLeave("cancel")}>
              {L("Avbryt", "Cancel")}
            </ToolbarButton>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
