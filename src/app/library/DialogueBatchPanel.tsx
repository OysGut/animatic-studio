import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { qualityProfileSnapshot, characterDialogueCoverage, selectedDialogueCounts, estimateCostUsd, formatUsd, newId, existingSpeechWarning, multilingualSpeechWarning, batchTimeEstimate, speechLanguageError, languageTagError, languageLabel, normalizeLanguageTag, DEFAULT_SPEECH_LANGUAGE, type ProjectState, type Asset, type AssetVoice } from "@/core";
import { createDialogueBatch, advanceDialogueBatch, resumeDialogueBatch, listDialogueBatches, undoDialogueBatchJob, reconfirmDialogueBatch } from "@/adapters/storage/dialogue-batch.functions";
import { QualityProfilePicker, QualityProfileBudget, useQualityProfile } from "@/app/ai/QualityProfilePicker";
import { VoiceControls } from "@/app/audio/VoiceControls";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { PanelHeader } from "@/app/shell/workspace-chrome";
import { listSpeechModels } from "@/adapters/ai/speech.functions";
import { t } from "@/core/i18n/keyed";

/**
 * DV5/DV6/DV7: massegenerering for én karakter i aktivt prosjekt. `drift` åpner samme dialog med bare de
 * røde replikkene valgt (R1–R6): samme kostnadsport, språkvalg og fremdrift.
 */
const nLines = (n: number) => n === 1 ? t("app-library-dialogue-batch-panel.n-lines.message.ab677ea9e6de") : t("app-library-dialogue-batch-panel.n-lines.message.79809ebc2d20", { n: String(n) });
const nScenes = (n: number) => n === 1 ? t("app-library-dialogue-batch-panel.n-scenes.message.6a8a01eafb3e") : t("app-library-dialogue-batch-panel.n-scenes.message.ee09e8bb0359", { n: String(n) });

export function DialogueBatchPanel({ state, asset, projectId, editable, drift = false }: { state: ProjectState; asset: Asset; projectId: string; editable: boolean; drift?: boolean }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [voice, setVoice] = useState<AssetVoice | null>(asset.voice ?? null);
  const [mode, setMode] = useState<"" | "together" | "split">("");
  const [languageVoices, setLanguageVoices] = useState<Record<string, AssetVoice | null>>({});
  const [languages, setLanguages] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requests, setRequests] = useState<Record<string, string>>({});
  const [reconfirm, setReconfirm] = useState<string | null>(null);
  const [undoConfirm, setUndoConfirm] = useState<string | null>(null);
  const client = useQueryClient();
  const fullCoverage = characterDialogueCoverage(state, asset.id);
  const coverage = drift ? fullCoverage.map(scene => ({ ...scene, lines: scene.lines.filter(l => l.drift) })).filter(scene => scene.lines.length) : fullCoverage;
  const all = coverage.flatMap(s => s.lines);
  const chosen = all.filter(l => selected.has(l.key));
  const counts = selectedDialogueCounts(chosen);
  const languageOf = (key: string, fallback: string) => normalizeLanguageTag(languages[key] ?? fallback);
  const groups = [...new Set(chosen.map(l => languageOf(l.key, l.speechLanguage)))];
  const detected = new Set(all.map(l => l.detection.language));
  const togetherLanguage = normalizeLanguageTag(voice?.language ?? DEFAULT_SPEECH_LANGUAGE);
  const quality = useQualityProfile(state, chosen.length);
  const profileVoice = (v: AssetVoice | null) => v ? { ...v, modelId: v.modelId ?? quality.profile?.spec.models?.speech ?? "eleven_v3" } : null;
  const plans = mode === "split" ? groups.map(language => ({ language, voice: profileVoice(languageVoices[language] ?? (voice ? { ...voice, language } : null)), lines: chosen.filter(l => languageOf(l.key, l.speechLanguage) === language) })) : [{ language: togetherLanguage, voice: profileVoice(voice), lines: chosen }];
  const priced = plans.map(p => ({ ...p, cost: estimateCostUsd("elevenlabs", p.voice?.modelId ?? "eleven_v3", { characters: p.lines.reduce((n, l) => n + l.text.replace(/\s+/g, " ").trim().length, 0) }) }));
  const jobsKey = ["dialogue-batches", projectId];
  const jobs = useQuery({ queryKey: jobsKey, enabled: open, queryFn: () => listDialogueBatches({ data: { projectId } }), refetchInterval: open ? 5000 : false });
  const models = useQuery({ queryKey: ["speech-models", projectId], enabled: open, queryFn: () => listSpeechModels({ data: { projectId } }), staleTime: 300000 });
  const capabilityErrors = priced.flatMap(p => {
    const model = models.data?.ok ? models.data.models?.find(m => m.modelId === (p.voice?.modelId ?? "eleven_v3")) : null;
    const tagError = languageTagError(p.language);
    const problem = tagError ?? (model ? speechLanguageError(model, p.language) : t("app-library-dialogue-batch-panel.problem.priced-flat-map.d7e96012835a"));
    return problem ? [problem] : [];
  });
  const changed = () => { setConfirm(false); setRequests({}); };
  const choose = (keys: string[]) => { setSelected(new Set(keys)); changed(); };
  const productions = [...new Map(coverage.map(scene => [scene.productionId, scene])).values()];
  async function refresh() { await client.invalidateQueries({ queryKey: jobsKey }); await client.invalidateQueries({ queryKey: ["project-state", projectId] }); }
  async function start() {
    if (busy || priced.some(p => !p.voice || p.cost === null) || !chosen.length || !mode || capabilityErrors.length || quality.budgetError) return;
    setBusy(true); setError(null);
    const ids = Object.fromEntries(priced.map(p => [p.language, requests[p.language] ?? newId<"command">()]));
    setRequests(ids);
    try {
      for (const plan of priced) {
        if (!plan.voice) continue;
        const batch = await createDialogueBatch({ data: { projectId, characterId: asset.id, requestId: ids[plan.language], voice: { ...plan.voice, qualityProfile: quality.profile ? qualityProfileSnapshot(quality.profile) : null }, approved: true,
          lines: plan.lines.map(l => ({ key: l.key, revision: l.scriptRevision, language: mode === "split" ? plan.language : togetherLanguage })) } });
        await advanceDialogueBatch({ data: { projectId, batchId: batch.id } });
      }
      setConfirm(false); await refresh();
    } catch (e) { setError((e as Error).message); await refresh(); }
    finally { setBusy(false); }
  }
  async function act(fn: () => Promise<unknown>) {
    setBusy(true); setError(null);
    try { await fn(); await refresh(); }
    catch (e) { setError((e as Error).message); await refresh(); } finally { setBusy(false); }
  }
  const statusLabel = (status: string) => status === "waiting" ? t("app-library-dialogue-batch-panel.status-label.message.b5dda3bfc7cc") : status === "generating" ? t("app-library-dialogue-batch-panel.status-label.message.457092640c4c") : status === "ready" ? t("app-library-dialogue-batch-panel.status-label.message.42fbee116985") : status === "done" ? t("app-library-dialogue-batch-panel.status-label.message.eb79e9c2781e") : status === "skipped" ? t("app-library-dialogue-batch-panel.status-label.message.70cf34d3aed5") : status === "undone" ? t("app-library-dialogue-batch-panel.status-label.message.c6b034bb50bf") : t("app-library-dialogue-batch-panel.status-label.message.6828d92e3cf5");
  return <>
    <Button data-testid={drift ? "dialogue-drift-open" : "dialogue-batch-open"} size="sm" variant="secondary" disabled={!editable} onClick={() => { setVoice(asset.voice ?? null); setOpen(true); if (drift) setSelected(new Set(characterDialogueCoverage(state, asset.id).flatMap(s => s.lines.filter(l => l.drift).map(l => l.key)))); }}>{drift ? t("app-library-dialogue-batch-panel.dialogue-batch-panel.button.ec605ea6dbe1") : t("app-library-dialogue-batch-panel.dialogue-batch-panel.button.b9a59a117620")}</Button>
    <Dialog open={open} onOpenChange={value => { if (!busy) setOpen(value); }}><DialogContent data-testid="dialogue-batch-dialog" className="max-h-[90vh] max-w-4xl overflow-y-auto">
      <DialogTitle>{drift ? t("app-library-dialogue-batch-panel.dialogue-batch-panel.dialog-title.c8a21a538ae9", { name: String(asset.name) }) : t("app-library-dialogue-batch-panel.dialogue-batch-panel.dialog-title.eb6809e8aa30", { name: String(asset.name) })}</DialogTitle>
      <QualityProfilePicker state={state} value={quality.choice} disabled={busy} onChange={v => { quality.setChoice(v); setVoice(old => { if (!old) return old; const { modelId: _modelId, ...rest } = old; return rest; }); setLanguageVoices({}); changed(); }} /><QualityProfileBudget error={quality.budgetError} />
      <p className="text-xs text-text-secondary">{t("app-library-dialogue-batch-panel.dialogue-batch-panel.p.79c0af393463", { name: String(state.project.name) })}</p>
      {drift ? <p className="text-xs text-text-secondary">{t("app-library-dialogue-batch-panel.dialogue-batch-panel.p.7da59b56e966")}</p> : null}
      <div className="flex flex-wrap gap-2">{([ ["all", t("app-library-dialogue-batch-panel.dialogue-batch-panel.all-l-alle-all-missing-l-bare-de-som-mangler-missing-only-partial-l-delvise-partial-drift-l-bare-r-de-red-only-as-const-map.17a44628720c")], ["missing", t("app-library-dialogue-batch-panel.dialogue-batch-panel.all-l-alle-all-missing-l-bare-de-som-mangler-missing-only-partial-l-delvise-partial-drift-l-bare-r-de-red-only-as-const-map.4bffcf0b95b3")], ["partial", t("app-library-dialogue-batch-panel.dialogue-batch-panel.all-l-alle-all-missing-l-bare-de-som-mangler-missing-only-partial-l-delvise-partial-drift-l-bare-r-de-red-only-as-const-map.65c8ac485275")], ["drift", t("app-library-dialogue-batch-panel.dialogue-batch-panel.all-l-alle-all-missing-l-bare-de-som-mangler-missing-only-partial-l-delvise-partial-drift-l-bare-r-de-red-only-as-const-map.cdaa0a2de64d")] ] as const).map(([kind, label]) => <Button key={kind} data-testid={`dialogue-batch-${kind}`} size="sm" variant="secondary" disabled={busy} onClick={() => choose(coverage.filter(s => kind === "all" || (kind === "drift" ? s.drift > 0 : kind === "partial" ? s.missing > 0 && s.withAudio > 0 : s.missing > 0)).flatMap(s => s.lines.filter(l => kind === "drift" ? l.drift : kind !== "missing" || !l.hasAudio).map(l => l.key)))}>{label}</Button>)}</div>
      {!all.length ? <p role="status">{drift ? t("app-library-dialogue-batch-panel.dialogue-batch-panel.p.9644ddb3b5a7") : t("app-library-dialogue-batch-panel.dialogue-batch-panel.p.1bea062fb01f")}</p> : null}
      <div data-testid="dialogue-batch-coverage" className="flex flex-col gap-3">{productions.map(prod => <section key={prod.productionId} data-testid="dialogue-batch-production" data-production-id={prod.productionId} className="flex flex-col gap-3">
        <PanelHeader title={prod.productionName || (prod.productionKind === "main" ? t("app-library-dialogue-batch-panel.dialogue-batch-panel.title.92cd10ba4e5f") : t("app-library-dialogue-batch-panel.dialogue-batch-panel.title.248fce054d07"))} />
        {coverage.filter(scene => scene.productionId === prod.productionId).map(scene => <section key={scene.occurrenceId} className="border-b border-border pb-3">
        <label className="flex items-center gap-2 text-sm text-text-primary"><input type="checkbox" data-testid="dialogue-batch-scene" disabled={busy} checked={scene.lines.every(l => selected.has(l.key))} onChange={e => { const next = new Set(selected); scene.lines.forEach(l => e.target.checked ? next.add(l.key) : next.delete(l.key)); choose([...next]); }} />{scene.number} · {scene.title} {productions.length > 1 ? <span className="text-xs text-text-tertiary">· {scene.productionName}</span> : null}</label>
        <p className="text-xs text-text-secondary">{t("app-library-dialogue-batch-panel.dialogue-batch-panel.p.0902f15b2c74", { value1: String(nLines(scene.total)), withAudio: String(scene.withAudio), missing: String(scene.missing), drift: String(scene.drift) })}</p>
        {scene.withAudio > 0 ? <p className="text-xs text-status-uncertain">{t("app-library-dialogue-batch-panel.dialogue-batch-panel.p.b4378c022e42")}</p> : null}
        {scene.lines.map(line => <div key={line.key} className="mt-2 flex flex-wrap items-center gap-2 text-xs"><label className="flex min-w-0 flex-1 items-center gap-2"><input type="checkbox" data-testid="dialogue-batch-line" data-drift={line.drift} disabled={busy} checked={selected.has(line.key)} onChange={e => { const next = new Set(selected); e.target.checked ? next.add(line.key) : next.delete(line.key); choose([...next]); }} /><span className={"break-words" + (line.drift ? " text-status-danger" : "")}>{line.text}</span></label>
          <label className="flex items-center gap-2 text-text-secondary">{t("app-library-dialogue-batch-panel.dialogue-batch-panel.label.c973bc410925")}<input data-testid="dialogue-batch-line-language" aria-label={t("app-library-dialogue-batch-panel.dialogue-batch-panel.aria-label.87b20602c68c")} disabled={busy} value={languages[line.key] ?? line.speechLanguage} onChange={e => { setLanguages({ ...languages, [line.key]: e.target.value }); changed(); }} className="h-8 w-24 rounded-sm border border-border-control bg-surface-3 px-2" /><span data-testid="dialogue-batch-language-name">{languageTagError(languages[line.key] ?? line.speechLanguage) ? "" : languageLabel(languageOf(line.key, line.speechLanguage))}</span></label>
          <span className="text-text-tertiary">{t("app-library-dialogue-batch-panel.dialogue-batch-panel.span.d681c9919a41", { value1: String(languageLabel(line.detection.language)), value2: String(languageLabel(line.scriptLanguage)) })}</span>
        </div>)}
      </section>)}</section>)}</div>
      <p data-testid="dialogue-batch-counts" className="text-xs text-text-primary">{t("app-library-dialogue-batch-panel.dialogue-batch-panel.p.4d26b68ba378", { value1: String(nScenes(counts.scenes)), value2: String(nLines(counts.lines)), missing: String(counts.missing), withAudio: String(counts.withAudio), drift: String(counts.drift) })}</p>
      {detected.size > 1 || groups.length > 1 ? <p role="alert" className="text-xs text-status-uncertain">{multilingualSpeechWarning()}</p> : null}
      <fieldset className="flex flex-wrap gap-4 text-xs"><legend>{t("app-library-dialogue-batch-panel.dialogue-batch-panel.legend.0366981f563b")}</legend>{([ ["together", t("app-library-dialogue-batch-panel.dialogue-batch-panel.together-l-samlet-generering-uttale-er-ikke-garantert-generate-together-pronunciation-is-not-guaranteed-split-l-separate-jobber-etter-spr-k-separate-jobs-by-language-as-const-map.22f5f0e8f14d")], ["split", t("app-library-dialogue-batch-panel.dialogue-batch-panel.together-l-samlet-generering-uttale-er-ikke-garantert-generate-together-pronunciation-is-not-guaranteed-split-l-separate-jobber-etter-spr-k-separate-jobs-by-language-as-const-map.21c128fe5ef4")] ] as const).map(([value, label]) => <label key={value} className="flex items-center gap-2"><input data-testid={`dialogue-batch-${value}`} type="radio" name="dialogue-batch-mode" checked={mode === value} disabled={busy} onChange={() => { setMode(value); changed(); }} />{label}</label>)}</fieldset>
      {mode === "split" ? groups.map(language => <section key={language} data-testid="dialogue-language-job" className="border-t border-border pt-3"><PanelHeader title={languageLabel(language)} /><VoiceControls projectId={projectId} value={languageVoices[language] ?? (voice ? { ...voice, language } : null)} disabled={busy} onChange={v => { setLanguageVoices({ ...languageVoices, [language]: v ? { ...v, language } : null }); changed(); }} /></section>) : <VoiceControls projectId={projectId} value={profileVoice(voice)} disabled={busy} onChange={v => { setVoice(v); changed(); }} />}
      {priced.map(p => { const time = batchTimeEstimate(p.lines); return <p key={p.language} data-testid="dialogue-batch-estimate" className="text-xs text-text-secondary">{t("app-library-dialogue-batch-panel.batch-estimate", {
  lines: nLines(p.lines.length),
  language: languageLabel(p.language),
  voice: p.voice?.label ?? t("app-library-dialogue-batch-panel.batch-estimate-no-voice"),
  model: p.voice?.modelId ?? t("app-library-dialogue-batch-panel.batch-estimate-no-model"),
  cost: p.cost === null ? t("app-library-dialogue-batch-panel.batch-estimate-unknown") : formatUsd(p.cost),
  time: time ? t("app-library-dialogue-batch-panel.batch-estimate-time", { min: time.minSeconds, max: time.maxSeconds }) : t("app-library-dialogue-batch-panel.batch-estimate-unknown"),
})}</p>; })}
      {mode === "together" ? <p role="status" className="text-xs text-status-uncertain">{t("app-library-dialogue-batch-panel.dialogue-batch-panel.p.c8b3dc76b305", { value1: String(languageLabel(togetherLanguage)) })}</p> : null}
      {capabilityErrors.map((message,i) => <p key={i} role="alert" className="text-xs text-status-danger">{message}</p>)}
      {counts.withAudio > 0 ? <p data-testid="dialogue-batch-warning" role="alert" className="text-xs text-status-uncertain">{existingSpeechWarning()}</p> : null}
      {confirm ? <section data-testid="dialogue-batch-confirm" className="border-t border-border pt-3"><PanelHeader title={t("app-library-dialogue-batch-panel.dialogue-batch-panel.title.f0bbe50a8e0d")} /><p className="text-xs">{t("app-library-dialogue-batch-panel.dialogue-batch-panel.p.c8052572c564", { name: String(asset.name), value2: String(nScenes(counts.scenes)), value3: String(nLines(counts.lines)) })}</p>
        <Button data-testid="dialogue-batch-approve" disabled={busy || !!quality.budgetError || !!capabilityErrors.length} onClick={() => void start()}>{busy ? t("app-library-dialogue-batch-panel.dialogue-batch-panel.button.2ea5e9b5dba0") : t("app-library-dialogue-batch-panel.dialogue-batch-panel.button.0e6909d73478")}</Button>
        <Button variant="ghost" disabled={busy} onClick={() => setConfirm(false)}>{t("app-library-dialogue-batch-panel.dialogue-batch-panel.button.a15edbc27cc2")}</Button></section> : <Button data-testid="dialogue-batch-start" disabled={busy || !!quality.budgetError || !mode || !chosen.length || !!capabilityErrors.length || priced.some(p => !p.voice || p.cost === null)} onClick={() => setConfirm(true)}>{t("app-library-dialogue-batch-panel.dialogue-batch-panel.button.bc8f11b553f0")}</Button>}
      {error ? <p role="alert" className="text-xs text-status-danger">{error}</p> : null}
      {jobs.isError ? <p role="alert" className="text-xs text-status-danger">{t("app-library-dialogue-batch-panel.dialogue-batch-panel.p.47d870d6b0dd")}<Button size="sm" variant="ghost" onClick={() => void jobs.refetch()}>{t("app-library-dialogue-batch-panel.dialogue-batch-panel.button.a520a133610f")}</Button></p> : null}
      {(jobs.data ?? []).map(job => { const done = job.items.filter(i => i.status === "done").length; const remaining = job.items.filter(i => i.status === "waiting" || (i.status === "failed" && i.retryable)); return <section key={job.id} data-testid="dialogue-batch-job" data-access-blocked={job.access_blocked === true} className="border-t border-border pt-3"><PanelHeader title={`${job.voice.label} · ${job.voice.modelId ?? ""}`} />
        <ul className="text-xs">{job.items.map(item => <li key={item.id} data-testid="dialogue-batch-progress" data-status={item.status} className="py-1">{state.blocks[item.block_id]?.text} · {languageLabel(item.language)} · {statusLabel(item.status)}{item.error ? <span role="alert" className="text-status-danger"> · {item.error}</span> : null}</li>)}</ul>
        {job.pause_reason ? <p role="alert" className="text-xs text-status-danger">{job.pause_reason}</p> : null}
        <div className="flex flex-wrap gap-2">
          {job.access_blocked ? <Button data-testid="dialogue-batch-reconfirm" size="sm" variant="secondary" disabled={busy} onClick={() => setReconfirm(job.id)}>{t("app-library-dialogue-batch-panel.dialogue-batch-panel.button.e597cefbc23f")}</Button>
            : <Button data-testid="dialogue-batch-resume" size="sm" variant="secondary" disabled={busy || job.status === "done"} onClick={() => void act(async () => { if (job.status !== "running") await resumeDialogueBatch({ data: { projectId, batchId: job.id } }); await advanceDialogueBatch({ data: { projectId, batchId: job.id } }); })}>{t("app-library-dialogue-batch-panel.dialogue-batch-panel.button.7fc310d62e47")}</Button>}
          <Button data-testid="dialogue-batch-undo" size="sm" variant="ghost" disabled={busy || !editable || done === 0} onClick={() => setUndoConfirm(job.id)}>{t("app-library-dialogue-batch-panel.dialogue-batch-panel.button.6b5fb6a751ce")}</Button>
        </div>
        {reconfirm === job.id ? <section data-testid="dialogue-batch-reconfirm-panel" role="group" className="mt-2 border border-border p-2 text-xs">
          <p>{t("app-library-dialogue-batch-panel.dialogue-batch-panel.p.f3f51d97bc79", { value1: String(nLines(remaining.length)) })}</p>
          <p>{t("app-library-dialogue-batch-panel.dialogue-batch-panel.p.ee4afe5ba0fc", { value1: String(formatUsd(remaining.reduce((n, i) => n + (estimateCostUsd("elevenlabs", job.voice.modelId ?? "eleven_v3", { characters: (state.blocks[i.block_id]?.text ?? "").length }) ?? 0), 0))) })}</p>
          <Button data-testid="dialogue-batch-reconfirm-approve" size="sm" disabled={busy} onClick={() => void act(async () => { await reconfirmDialogueBatch({ data: { projectId, batchId: job.id, approved: true } }); setReconfirm(null); await advanceDialogueBatch({ data: { projectId, batchId: job.id } }); })}>{t("app-library-dialogue-batch-panel.dialogue-batch-panel.button.70d7aeff1526")}</Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => setReconfirm(null)}>{t("app-library-dialogue-batch-panel.dialogue-batch-panel.button.a15edbc27cc2.2")}</Button>
        </section> : null}
        {undoConfirm === job.id ? <section data-testid="dialogue-batch-undo-panel" role="group" className="mt-2 border border-border p-2 text-xs">
          <p>{t("app-library-dialogue-batch-panel.batch-undo", { count: done })}</p>
          <Button data-testid="dialogue-batch-undo-approve" size="sm" disabled={busy} onClick={() => void act(async () => { await undoDialogueBatchJob({ data: { projectId, batchId: job.id } }); setUndoConfirm(null); })}>{t("app-library-dialogue-batch-panel.dialogue-batch-panel.button.80e7d4ecec2a")}</Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => setUndoConfirm(null)}>{t("app-library-dialogue-batch-panel.dialogue-batch-panel.button.a15edbc27cc2.3")}</Button>
        </section> : null}
      </section>; })}
    </DialogContent></Dialog>
  </>;
}
