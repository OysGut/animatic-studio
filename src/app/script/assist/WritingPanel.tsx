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
import { REWRITE_MODES, buildAssistPrompt, canSaveAsTrial, formatCheck, newId, orderedOccurrences, planApplyProposal, planTrialNotes, proposalConflicts, proposalFromReply, sceneNumberOf, type AssistKind, type AssistPrompt, type AssistRequest, type ProjectState, type Proposal, type RewriteMode } from "@/core";
import { scriptAssist } from "@/adapters/ai/script-assist.functions";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ToolbarButton } from "@/app/shell/workspace-chrome";
import { usd, useTextEstimate } from "@/app/storylab/storylab-data";
import type { Commands } from "@/app/project/use-commands";
import type { Selection } from "../ScriptPageView";
import { ProposalDiff } from "./ProposalDiff";
import { t as tk } from "@/core/i18n/keyed";

export type AssistAction = AssistKind | "format";
export interface AssistTrigger {
  readonly action: AssistAction;
  readonly mode?: RewriteMode;
  readonly blockIds: readonly string[];
  readonly nonce: number;
}

const MODE_LABEL: Record<RewriteMode, () => string> = {
  shorter: () => tk("app-script-assist-writing-panel.shorter.shorter.70b8b641bf6c"),
  clearer: () => tk("app-script-assist-writing-panel.clearer.clearer.7d65981f9153"),
  spoken: () => tk("app-script-assist-writing-panel.spoken.spoken.436b7111f43e"),
  tone: () => tk("app-script-assist-writing-panel.tone.tone.9368c47275de"),
  free: () => tk("app-script-assist-writing-panel.free.free.7abc0e4fe3d2"),
};

const ACTION_LABEL: Record<AssistKind, () => string> = {
  rewrite: () => tk("app-script-assist-writing-panel.rewrite.rewrite.76a5ce3418b9"),
  next_line: () => tk("app-script-assist-writing-panel.next-line.next-line.1490bfd1ff20"),
  scene: () => tk("app-script-assist-writing-panel.scene.scene.13c588bb4adb"),
  polish: () => tk("app-script-assist-writing-panel.polish.polish.69d5e3c4db13"),
  translate: () => tk("app-script-assist-writing-panel.translate.translate.da820a6133de"),
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
    if (trigger.mode) setMode(trigger.mode);
    if (trigger.action === "format") runFormat();
    else if (trigger.action === "rewrite" && (!trigger.mode || trigger.mode === "tone" || trigger.mode === "free"))
      setTimeout(() => instructionRef.current?.focus(), 30);
    else if (trigger.action !== "scene") start(trigger.action, trigger.blockIds, trigger.mode);
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

  function request(kind: AssistKind, blockIds: readonly string[], m: RewriteMode = mode): AssistRequest {
    const base = { kind, productionId, occurrenceId: occ?.id ?? null, blockIds: [] as string[] };
    if (kind === "rewrite")
      return { ...base, blockIds: [...blockIds], mode: m, ...(instruction.trim() ? { instruction: instruction.trim() } : {}) };
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

  function start(kind: AssistKind, blockIds = targets.length ? targets : currentTargets(), m?: RewriteMode) {
    setError(null);
    if (proposal) return setError({ message: tk("app-script-assist-writing-panel.message.message.7af3a5936177"), retry: null });
    if (kind === "scene" && node?.sceneId && !nodeConfirmed)
      return setError({ message: tk("app-script-assist-writing-panel.message.message.90dcf736606e"), retry: null });
    const r = request(kind, blockIds, m ?? mode);
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
            ? tk("app-script-assist-writing-panel.message.message.15e2caef7bae")
            : tk("app-script-assist-writing-panel.message.message.baaab6399d2f"),
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
    if (!occ) return setError({ message: tk("app-script-assist-writing-panel.message.message.14df613ff48d"), retry: null });
    if (proposal) return setError({ message: tk("app-script-assist-writing-panel.message.message.7af3a5936177.2"), retry: null });
    const p = formatCheck(state, productionId, occ.id);
    if (p.items.length === 0 && !p.headingFix)
      return setError({ message: tk("app-script-assist-writing-panel.message.message.e1bad6be0010"), retry: null });
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
    if (runAll(plan, tk("app-script-assist-writing-panel.apply.run-all.9e6cf43795f7", { value1: String(ACTION_LABEL[proposal.kind === "format" ? "polish" : proposal.kind]()) }))) {
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
    const ok = runAll(planTrialNotes(cmds.current() ?? state, proposal, picked, authorName), tk("app-script-assist-writing-panel.ok.run-all.68f6cb19b556"));
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
        {tk("app-script-assist-writing-panel.writing-panel.p.1e9d27df40e5")}
      </p>
    );

  const n = targets.length || currentTargets().length;
  const disabled = busy || !!proposal;

  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3 text-[13px]" data-testid="assist-panel">
      {total > 0 ? (
        <p className="text-[12px] text-text-tertiary" data-testid="assist-total">
          {tk("app-script-assist-writing-panel.writing-panel.p.dd43db7101ec", { value1: String(usd(total)) })}
        </p>
      ) : null}

      {proposal ? (
        <section className="space-y-3" data-testid="assist-proposal" data-kind={proposal.kind}>
          <h3 className="text-chrome-label font-medium uppercase tracking-label text-text-tertiary">
            {proposal.kind === "format" ? tk("app-script-assist-writing-panel.writing-panel.h3.590e2bab5227") : ACTION_LABEL[proposal.kind]()}
          </h3>
          {proposal.usedFallback ? (
            <p className="text-[12px] text-text-tertiary" data-testid="assist-fallback-note">
              {tk("app-script-assist-writing-panel.writing-panel.p.2f7fa4e2c4f0")}
            </p>
          ) : null}
          {proposal.kind === "translate" ? (
            <p className="text-[12px] text-text-secondary">
              {tk("app-script-assist-writing-panel.writing-panel.p.44cd5e7686d9")}
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
              {tk("app-script-assist-writing-panel.writing-panel.p.8c550f9bedc7")}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <ToolbarButton variant="primary" data-testid="assist-apply" disabled={conflicts.size > 0} onClick={() => apply(new Set([...proposal.items.map((i) => i.key), ...(proposal.headingFix ? ["heading"] : [])]))}>
              {tk("app-script-assist-writing-panel.writing-panel.toolbar-button.e57e96fc3197")}
            </ToolbarButton>
            <ToolbarButton data-testid="assist-apply-selected" onClick={() => apply(picked)}>
              {tk("app-script-assist-writing-panel.writing-panel.toolbar-button.636fb5cc2174")}
            </ToolbarButton>
            {canSaveAsTrial(proposal) ? (
              <ToolbarButton data-testid="assist-trial" onClick={saveTrial}>
                {tk("app-script-assist-writing-panel.writing-panel.toolbar-button.ca9ac6b005f1")}
              </ToolbarButton>
            ) : null}
            <ToolbarButton data-testid="assist-discard" onClick={finish}>
              {tk("app-script-assist-writing-panel.writing-panel.toolbar-button.c78619b71c82")}
            </ToolbarButton>
          </div>
        </section>
      ) : null}

      {pending ? (
        <section className="space-y-2 rounded-sm border border-border p-2" data-testid="assist-cost">
          <p className="text-text-secondary">
            {est.loading
              ? tk("app-script-assist-writing-panel.writing-panel.p.90049b80cbee")
              : est.error
                ? est.error
                : tk("app-script-assist-writing-panel.writing-panel.p.7934c771bc6b", { value1: String(ACTION_LABEL[pending.request.kind]()), label: String(est.label), value3: String(usd(est.usd)) })}
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
              {tk("app-script-assist-writing-panel.writing-panel.toolbar-button.cd9bd339bf7b")}
            </ToolbarButton>
            <ToolbarButton data-testid="assist-cancel" onClick={() => setPending(null)}>
              {tk("app-script-assist-writing-panel.writing-panel.toolbar-button.1a3c3eeef360")}
            </ToolbarButton>
          </div>
        </section>
      ) : null}

      {busy ? (
        <p className="flex items-center gap-2 text-text-secondary" data-testid="assist-busy">
          <Loader2 className="size-4 animate-spin" />
          {tk("app-script-assist-writing-panel.writing-panel.p.f1f37da2bc0c")}
        </p>
      ) : null}
      {error ? (
        <div role="alert" className="space-y-1 text-[12px] text-status-danger" data-testid="assist-error">
          <p>{error.message}</p>
          {error.retry ? (
            <ToolbarButton data-testid="assist-retry" onClick={() => start(error.retry!.kind, error.retry!.blockIds)}>
              {tk("app-script-assist-writing-panel.writing-panel.toolbar-button.b8422687ce0d")}
            </ToolbarButton>
          ) : null}
        </div>
      ) : null}

      <section className="space-y-2">
        <h3 className="text-chrome-label font-medium uppercase tracking-label text-text-tertiary">{tk("app-script-assist-writing-panel.writing-panel.h3.518079e7996d")}</h3>
        <p className="text-[12px] text-text-tertiary" data-testid="assist-target-count">
          {n ? tk("app-script-assist-writing-panel.writing-panel.p.108152a12280", { n: String(n) }) : tk("app-script-assist-writing-panel.writing-panel.p.d03ff48004e9")}
        </p>
        <select className="w-full rounded-sm border border-border bg-surface-2 px-2 py-1" value={mode} onChange={(e) => setMode(e.target.value as RewriteMode)} data-testid="assist-rewrite-mode" aria-label={tk("app-script-assist-writing-panel.writing-panel.aria-label.57398425b791")}>
          {REWRITE_MODES.map((m) => (
            <option key={m} value={m}>{MODE_LABEL[m]()}</option>
          ))}
        </select>
        <Textarea ref={instructionRef} rows={2} value={instruction} maxLength={500} onChange={(e) => setInstruction(e.target.value)} placeholder={tk("app-script-assist-writing-panel.writing-panel.placeholder.19a8262143f4")} data-testid="assist-instruction" />
        <div className="flex flex-wrap gap-2">
          <ToolbarButton disabled={disabled || !n} onClick={() => start("rewrite")} data-testid="assist-rewrite" title={tk("app-script-assist-writing-panel.writing-panel.title.37e3eb3bd717")}>
            {tk("app-script-assist-writing-panel.writing-panel.toolbar-button.43722c49eb65")}
          </ToolbarButton>
          <ToolbarButton disabled={disabled || !n} onClick={() => start("polish")} data-testid="assist-polish">
            {tk("app-script-assist-writing-panel.writing-panel.toolbar-button.5289d6353b39")}
          </ToolbarButton>
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-chrome-label font-medium uppercase tracking-label text-text-tertiary">{tk("app-script-assist-writing-panel.writing-panel.h3.5313a20c9ef1")}</h3>
        <select className="w-full rounded-sm border border-border bg-surface-2 px-2 py-1" value={characterId || characters[0]?.id || ""} onChange={(e) => setCharacterId(e.target.value)} data-testid="assist-character" aria-label={tk("app-script-assist-writing-panel.writing-panel.aria-label.69bc44d36779")}>
          {characters.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
        <ToolbarButton disabled={disabled || !occ || characters.length === 0} onClick={() => start("next_line")} data-testid="assist-next-line" title={tk("app-script-assist-writing-panel.writing-panel.title.16f70c48ca1c")}>
          {tk("app-script-assist-writing-panel.writing-panel.toolbar-button.23f00f6c1c0c")}
        </ToolbarButton>
        <p className="text-[11px] text-text-tertiary">
          {tk("app-script-assist-writing-panel.writing-panel.p.fe382f665edf")}
        </p>
      </section>

      <section className="space-y-2">
        <h3 className="text-chrome-label font-medium uppercase tracking-label text-text-tertiary">{tk("app-script-assist-writing-panel.writing-panel.h3.4a397a4ff149")}</h3>
        <select className="w-full rounded-sm border border-border bg-surface-2 px-2 py-1" value={nodeId} onChange={(e) => { setNodeId(e.target.value); setNodeConfirmed(false); }} data-testid="assist-scene-node" aria-label={tk("app-script-assist-writing-panel.writing-panel.aria-label.f841199ba2fc")}>
          <option value="">{tk("app-script-assist-writing-panel.writing-panel.option.26060d25bd2b")}</option>
          {sceneNodes.map((c) => (
            <option key={c.id} value={c.id}>{c.title || tk("app-script-assist-writing-panel.writing-panel.option.2645a4404858")}</option>
          ))}
        </select>
        {nodeUsedIn ? (
          <label className="flex items-start gap-2 text-[12px] text-status-warning" data-testid="assist-node-used">
            <input type="checkbox" checked={nodeConfirmed} onChange={(e) => setNodeConfirmed(e.target.checked)} data-testid="assist-node-confirm" />
            {tk("app-script-assist-writing-panel.writing-panel.label.a82aed4cd888", { nodeUsedIn: String(nodeUsedIn) })}
          </label>
        ) : null}
        <Textarea rows={3} value={description} maxLength={2000} onChange={(e) => setDescription(e.target.value)} placeholder={tk("app-script-assist-writing-panel.writing-panel.placeholder.958e91747e11")} data-testid="assist-scene-description" />
        <ToolbarButton disabled={disabled || (!description.trim() && !nodeId)} onClick={() => start("scene")} data-testid="assist-scene">
          {tk("app-script-assist-writing-panel.writing-panel.toolbar-button.d71e27f8f32f")}
        </ToolbarButton>
        <p className="text-[11px] text-text-tertiary">
          {occ ? tk("app-script-assist-writing-panel.writing-panel.p.8a7c9a9beee1") : tk("app-script-assist-writing-panel.writing-panel.p.2a57ffaf683a")}
        </p>
      </section>

      <section className="space-y-2">
        <h3 className="text-chrome-label font-medium uppercase tracking-label text-text-tertiary">{tk("app-script-assist-writing-panel.writing-panel.h3.6da054cfe2f1")}</h3>
        <div className="flex flex-wrap gap-2">
          <ToolbarButton disabled={disabled || !occ} onClick={runFormat} data-testid="assist-format" title={tk("app-script-assist-writing-panel.writing-panel.title.75814a344cfa")}>
            {tk("app-script-assist-writing-panel.writing-panel.toolbar-button.590e2bab5227")}
          </ToolbarButton>
          <ToolbarButton disabled={disabled || !occ} onClick={() => start("translate")} data-testid="assist-translate">
            {tk("app-script-assist-writing-panel.writing-panel.toolbar-button.51ceafe95950")}
          </ToolbarButton>
        </div>
      </section>

      <Dialog open={leaving !== null} onOpenChange={(o) => (o ? null : resolveLeave("cancel"))}>
        <DialogContent data-testid="assist-leave-dialog">
          <DialogHeader>
            <DialogTitle>{tk("app-script-assist-writing-panel.writing-panel.dialog-title.ae97a7441a9d")}</DialogTitle>
            <DialogDescription>
              {tk("app-script-assist-writing-panel.writing-panel.dialog-description.97a83106d7f0")}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap justify-end gap-2">
            <ToolbarButton data-testid="assist-leave-trial" disabled={!proposal || !canSaveAsTrial(proposal)} onClick={() => resolveLeave("trial")}>
              {tk("app-script-assist-writing-panel.writing-panel.toolbar-button.ca9ac6b005f1.2")}
            </ToolbarButton>
            <ToolbarButton data-testid="assist-leave-discard" onClick={() => resolveLeave("discard")}>
              {tk("app-script-assist-writing-panel.writing-panel.toolbar-button.c78619b71c82.2")}
            </ToolbarButton>
            <ToolbarButton variant="primary" data-testid="assist-leave-cancel" onClick={() => resolveLeave("cancel")}>
              {tk("app-script-assist-writing-panel.writing-panel.toolbar-button.1a3c3eeef360.2")}
            </ToolbarButton>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
