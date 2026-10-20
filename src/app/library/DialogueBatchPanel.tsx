import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { L, characterDialogueCoverage, selectedDialogueCounts, estimateCostUsd, formatUsd, newId, existingSpeechWarning, multilingualSpeechWarning, batchTimeEstimate, speechLanguageError, languageTagError, languageLabel, normalizeLanguageTag, DEFAULT_SPEECH_LANGUAGE, type ProjectState, type Asset, type AssetVoice } from "@/core";
import { createDialogueBatch, advanceDialogueBatch, resumeDialogueBatch, listDialogueBatches, undoDialogueBatchJob, reconfirmDialogueBatch } from "@/adapters/storage/dialogue-batch.functions";
import { VoiceControls } from "@/app/audio/VoiceControls";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { PanelHeader } from "@/app/shell/workspace-chrome";
import { listSpeechModels } from "@/adapters/ai/speech.functions";

/**
 * DV5/DV6/DV7: massegenerering for én karakter i aktivt prosjekt. `drift` åpner samme dialog med bare de
 * røde replikkene valgt (R1–R6): samme kostnadsport, språkvalg og fremdrift.
 */
const nLines = (n: number) => n === 1 ? L("1 replikk", "1 line") : L(`${n} replikker`, `${n} lines`);
const nScenes = (n: number) => n === 1 ? L("1 scene", "1 scene") : L(`${n} scener`, `${n} scenes`);

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
  const plans = mode === "split" ? groups.map(language => ({ language, voice: languageVoices[language] ?? (voice ? { ...voice, language } : null), lines: chosen.filter(l => languageOf(l.key, l.speechLanguage) === language) })) : [{ language: togetherLanguage, voice, lines: chosen }];
  const priced = plans.map(p => ({ ...p, cost: estimateCostUsd("elevenlabs", p.voice?.modelId ?? "eleven_v3", { characters: p.lines.reduce((n, l) => n + l.text.replace(/\s+/g, " ").trim().length, 0) }) }));
  const jobsKey = ["dialogue-batches", projectId];
  const jobs = useQuery({ queryKey: jobsKey, enabled: open, queryFn: () => listDialogueBatches({ data: { projectId } }), refetchInterval: open ? 5000 : false });
  const models = useQuery({ queryKey: ["speech-models", projectId], enabled: open, queryFn: () => listSpeechModels({ data: { projectId } }), staleTime: 300000 });
  const capabilityErrors = priced.flatMap(p => {
    const model = models.data?.ok ? models.data.models?.find(m => m.modelId === (p.voice?.modelId ?? "eleven_v3")) : null;
    const tagError = languageTagError(p.language);
    const problem = tagError ?? (model ? speechLanguageError(model, p.language) : L("Modellens språkstøtte er ikke bekreftet.", "The model's language support is not verified."));
    return problem ? [problem] : [];
  });
  const changed = () => { setConfirm(false); setRequests({}); };
  const choose = (keys: string[]) => { setSelected(new Set(keys)); changed(); };
  const productions = [...new Map(coverage.map(scene => [scene.productionId, scene])).values()];
  async function refresh() { await client.invalidateQueries({ queryKey: jobsKey }); await client.invalidateQueries({ queryKey: ["project-state", projectId] }); }
  async function start() {
    if (busy || priced.some(p => !p.voice || p.cost === null) || !chosen.length || !mode || capabilityErrors.length) return;
    setBusy(true); setError(null);
    const ids = Object.fromEntries(priced.map(p => [p.language, requests[p.language] ?? newId<"command">()]));
    setRequests(ids);
    try {
      for (const plan of priced) {
        if (!plan.voice) continue;
        const batch = await createDialogueBatch({ data: { projectId, characterId: asset.id, requestId: ids[plan.language], voice: plan.voice, approved: true,
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
  const statusLabel = (status: string) => status === "waiting" ? L("Venter", "Waiting") : status === "generating" ? L("Genererer", "Generating") : status === "ready" ? L("Lyd lagret, venter på innlegging", "Audio saved, awaiting placement") : status === "done" ? L("Ferdig", "Done") : status === "skipped" ? L("Hoppet over", "Skipped") : status === "undone" ? L("Angret", "Undone") : L("Feilet", "Failed");
  return <>
    <Button data-testid={drift ? "dialogue-drift-open" : "dialogue-batch-open"} size="sm" variant="secondary" disabled={!editable} onClick={() => { setVoice(asset.voice ?? null); setOpen(true); if (drift) setSelected(new Set(characterDialogueCoverage(state, asset.id).flatMap(s => s.lines.filter(l => l.drift).map(l => l.key)))); }}>{drift ? L("Generer alle røde replikker", "Generate all red lines") : L("Generer all tale for denne karakteren", "Generate all speech for this character")}</Button>
    <Dialog open={open} onOpenChange={value => { if (!busy) setOpen(value); }}><DialogContent data-testid="dialogue-batch-dialog" className="max-h-[90vh] max-w-4xl overflow-y-auto">
      <DialogTitle>{drift ? L(`Generer røde replikker · ${asset.name}`, `Generate red lines · ${asset.name}`) : L(`Generer tale · ${asset.name}`, `Generate speech · ${asset.name}`)}</DialogTitle>
      <p className="text-xs text-text-secondary">{L(`Prosjekt: ${state.project.name}`, `Project: ${state.project.name}`)}</p>
      {drift ? <p className="text-xs text-text-secondary">{L("Bare replikker der manuset er endret etter at lyden ble laget. Gamle versjoner beholdes.", "Only lines where the script changed after the audio was made. Old versions are kept.")}</p> : null}
      <div className="flex flex-wrap gap-2">{([ ["all", L("Alle", "All")], ["missing", L("Bare de som mangler", "Missing only")], ["partial", L("Delvise", "Partial")], ["drift", L("Bare røde", "Red only")] ] as const).map(([kind, label]) => <Button key={kind} data-testid={`dialogue-batch-${kind}`} size="sm" variant="secondary" disabled={busy} onClick={() => choose(coverage.filter(s => kind === "all" || (kind === "drift" ? s.drift > 0 : kind === "partial" ? s.missing > 0 && s.withAudio > 0 : s.missing > 0)).flatMap(s => s.lines.filter(l => kind === "drift" ? l.drift : kind !== "missing" || !l.hasAudio).map(l => l.key)))}>{label}</Button>)}</div>
      {!all.length ? <p role="status">{drift ? L("Karakteren har ingen røde replikker.", "This character has no red lines.") : L("Karakteren har ingen replikker i dette prosjektet.", "This character has no lines in this project.")}</p> : null}
      <div data-testid="dialogue-batch-coverage" className="flex flex-col gap-3">{productions.map(prod => <section key={prod.productionId} data-testid="dialogue-batch-production" data-production-id={prod.productionId} className="flex flex-col gap-3">
        <PanelHeader title={prod.productionName || (prod.productionKind === "main" ? L("Hovedfilm", "Main film") : L("Spinoff", "Spinoff"))} />
        {coverage.filter(scene => scene.productionId === prod.productionId).map(scene => <section key={scene.occurrenceId} className="border-b border-border pb-3">
        <label className="flex items-center gap-2 text-sm text-text-primary"><input type="checkbox" data-testid="dialogue-batch-scene" disabled={busy} checked={scene.lines.every(l => selected.has(l.key))} onChange={e => { const next = new Set(selected); scene.lines.forEach(l => e.target.checked ? next.add(l.key) : next.delete(l.key)); choose([...next]); }} />{scene.number} · {scene.title} {productions.length > 1 ? <span className="text-xs text-text-tertiary">· {scene.productionName}</span> : null}</label>
        <p className="text-xs text-text-secondary">{L(`${nLines(scene.total)} · ${scene.withAudio} med lyd · ${scene.missing} uten lyd · ${scene.drift} med avvik`, `${nLines(scene.total)} · ${scene.withAudio} with audio · ${scene.missing} without audio · ${scene.drift} with drift`)}</p>
        {scene.withAudio > 0 ? <p className="text-xs text-status-uncertain">{L("Ny generering overtar aktiv versjon for valgte replikker.", "New generation replaces the active choice for selected lines.")}</p> : null}
        {scene.lines.map(line => <div key={line.key} className="mt-2 flex flex-wrap items-center gap-2 text-xs"><label className="flex min-w-0 flex-1 items-center gap-2"><input type="checkbox" data-testid="dialogue-batch-line" data-drift={line.drift} disabled={busy} checked={selected.has(line.key)} onChange={e => { const next = new Set(selected); e.target.checked ? next.add(line.key) : next.delete(line.key); choose([...next]); }} /><span className={"break-words" + (line.drift ? " text-status-danger" : "")}>{line.text}</span></label>
          <label className="flex items-center gap-2 text-text-secondary">{L("Talespråk", "Speech language")}<input data-testid="dialogue-batch-line-language" aria-label={L("Replikkens talespråk (BCP-47)", "Line speech language (BCP-47)")} disabled={busy} value={languages[line.key] ?? line.speechLanguage} onChange={e => { setLanguages({ ...languages, [line.key]: e.target.value }); changed(); }} className="h-8 w-24 rounded-sm border border-border-control bg-surface-3 px-2" /><span data-testid="dialogue-batch-language-name">{languageTagError(languages[line.key] ?? line.speechLanguage) ? "" : languageLabel(languageOf(line.key, line.speechLanguage))}</span></label>
          <span className="text-text-tertiary">{L(`Oppdaget: ${languageLabel(line.detection.language)} · usikkert (manus: ${languageLabel(line.scriptLanguage)})`, `Detected: ${languageLabel(line.detection.language)} · uncertain (script: ${languageLabel(line.scriptLanguage)})`)}</span>
        </div>)}
      </section>)}</section>)}</div>
      <p data-testid="dialogue-batch-counts" className="text-xs text-text-primary">{L(`${nScenes(counts.scenes)} · ${nLines(counts.lines)} valgt · ${counts.missing} mangler lyd · ${counts.withAudio} har lyd · ${counts.drift} avvik`, `${nScenes(counts.scenes)} · ${nLines(counts.lines)} selected · ${counts.missing} missing audio · ${counts.withAudio} have audio · ${counts.drift} drift`)}</p>
      {detected.size > 1 || groups.length > 1 ? <p role="alert" className="text-xs text-status-uncertain">{multilingualSpeechWarning()}</p> : null}
      <fieldset className="flex flex-wrap gap-4 text-xs"><legend>{L("Språkfordeling", "Language grouping")}</legend>{([ ["together", L("Samlet generering (uttale er ikke garantert)", "Generate together (pronunciation is not guaranteed)")], ["split", L("Separate jobber etter språk", "Separate jobs by language")] ] as const).map(([value, label]) => <label key={value} className="flex items-center gap-2"><input data-testid={`dialogue-batch-${value}`} type="radio" name="dialogue-batch-mode" checked={mode === value} disabled={busy} onChange={() => { setMode(value); changed(); }} />{label}</label>)}</fieldset>
      {mode === "split" ? groups.map(language => <section key={language} data-testid="dialogue-language-job" className="border-t border-border pt-3"><PanelHeader title={languageLabel(language)} /><VoiceControls projectId={projectId} value={languageVoices[language] ?? (voice ? { ...voice, language } : null)} disabled={busy} onChange={v => { setLanguageVoices({ ...languageVoices, [language]: v ? { ...v, language } : null }); changed(); }} /></section>) : <VoiceControls projectId={projectId} value={voice} disabled={busy} onChange={v => { setVoice(v); changed(); }} />}
      {priced.map(p => { const time = batchTimeEstimate(p.lines); return <p key={p.language} data-testid="dialogue-batch-estimate" className="text-xs text-text-secondary">{L(`${nLines(p.lines.length)} · ${languageLabel(p.language)} · ${p.voice?.label ?? "stemme ikke valgt"} · ${p.voice?.modelId ?? "modell ikke valgt"} · kostnadsanslag: ${p.cost === null ? "ukjent" : formatUsd(p.cost)} · tidsanslag (usikkert): ${time ? `${time.minSeconds}–${time.maxSeconds} s, uten køventing` : "ukjent"}`, `${nLines(p.lines.length)} · ${languageLabel(p.language)} · ${p.voice?.label ?? "voice not chosen"} · ${p.voice?.modelId ?? "model not chosen"} · cost estimate: ${p.cost === null ? "unknown" : formatUsd(p.cost)} · time estimate (uncertain): ${time ? `${time.minSeconds}–${time.maxSeconds} s, excluding queue wait` : "unknown"}`)}</p>; })}
      {mode === "together" ? <p role="status" className="text-xs text-status-uncertain">{L(`Samlet jobb bruker ${languageLabel(togetherLanguage)} for alle valgte replikker. Linjenes egne talespråk brukes bare ved oppdeling.`, `The combined job uses ${languageLabel(togetherLanguage)} for all selected lines. Individual line languages apply only when splitting.`)}</p> : null}
      {capabilityErrors.map((message,i) => <p key={i} role="alert" className="text-xs text-status-danger">{message}</p>)}
      {counts.withAudio > 0 ? <p data-testid="dialogue-batch-warning" role="alert" className="text-xs text-status-uncertain">{existingSpeechWarning()}</p> : null}
      {confirm ? <section data-testid="dialogue-batch-confirm" className="border-t border-border pt-3"><PanelHeader title={L("Godkjenn kostnaden", "Approve cost")} /><p className="text-xs">{L(`${asset.name} · ${nScenes(counts.scenes)} · ${nLines(counts.lines)}`, `${asset.name} · ${nScenes(counts.scenes)} · ${nLines(counts.lines)}`)}</p>
        <Button data-testid="dialogue-batch-approve" disabled={busy || !!capabilityErrors.length} onClick={() => void start()}>{busy ? L("Genererer …", "Generating …") : L("Godkjenn og generer", "Approve and generate")}</Button>
        <Button variant="ghost" disabled={busy} onClick={() => setConfirm(false)}>{L("Avbryt", "Cancel")}</Button></section> : <Button data-testid="dialogue-batch-start" disabled={busy || !mode || !chosen.length || !!capabilityErrors.length || priced.some(p => !p.voice || p.cost === null)} onClick={() => setConfirm(true)}>{L("Kontroller og bekreft …", "Review and approve …")}</Button>}
      {error ? <p role="alert" className="text-xs text-status-danger">{error}</p> : null}
      {jobs.isError ? <p role="alert" className="text-xs text-status-danger">{L("Jobbene kunne ikke hentes. Prøv igjen etter at databasen er oppdatert.", "Jobs could not be loaded. Try again after the database is updated.")}<Button size="sm" variant="ghost" onClick={() => void jobs.refetch()}>{L("Prøv igjen", "Try again")}</Button></p> : null}
      {(jobs.data ?? []).map(job => { const done = job.items.filter(i => i.status === "done").length; const remaining = job.items.filter(i => i.status === "waiting" || (i.status === "failed" && i.retryable)); return <section key={job.id} data-testid="dialogue-batch-job" data-access-blocked={job.access_blocked === true} className="border-t border-border pt-3"><PanelHeader title={`${job.voice.label} · ${job.voice.modelId ?? ""}`} />
        <ul className="text-xs">{job.items.map(item => <li key={item.id} data-testid="dialogue-batch-progress" data-status={item.status} className="py-1">{state.blocks[item.block_id]?.text} · {languageLabel(item.language)} · {statusLabel(item.status)}{item.error ? <span role="alert" className="text-status-danger"> · {item.error}</span> : null}</li>)}</ul>
        {job.pause_reason ? <p role="alert" className="text-xs text-status-danger">{job.pause_reason}</p> : null}
        <div className="flex flex-wrap gap-2">
          {job.access_blocked ? <Button data-testid="dialogue-batch-reconfirm" size="sm" variant="secondary" disabled={busy} onClick={() => setReconfirm(job.id)}>{L("Tilgangen er tilbake – bekreft og fortsett …", "Access restored – confirm and continue …")}</Button>
            : <Button data-testid="dialogue-batch-resume" size="sm" variant="secondary" disabled={busy || job.status === "done"} onClick={() => void act(async () => { if (job.status !== "running") await resumeDialogueBatch({ data: { projectId, batchId: job.id } }); await advanceDialogueBatch({ data: { projectId, batchId: job.id } }); })}>{L("Gjenoppta / prøv feilede på nytt", "Resume / retry failed lines")}</Button>}
          <Button data-testid="dialogue-batch-undo" size="sm" variant="ghost" disabled={busy || !editable || done === 0} onClick={() => setUndoConfirm(job.id)}>{L("Angre hele jobben …", "Undo the whole job …")}</Button>
        </div>
        {reconfirm === job.id ? <section data-testid="dialogue-batch-reconfirm-panel" role="group" className="mt-2 border border-border p-2 text-xs">
          <p>{L(`${nLines(remaining.length)} gjenstår. Bare replikker leverandøren avviste før fakturering, og replikker som aldri ble sendt, kjøres. Ferdige replikker og uklare resultater kjøres ikke på nytt.`, `${nLines(remaining.length)} remaining. Only lines the provider rejected before billing, and lines never sent, will run. Finished lines and unclear results are not run again.`)}</p>
          <p>{L(`Kostnadsanslag: ${formatUsd(remaining.reduce((n, i) => n + (estimateCostUsd("elevenlabs", job.voice.modelId ?? "eleven_v3", { characters: (state.blocks[i.block_id]?.text ?? "").length }) ?? 0), 0))}`, `Cost estimate: ${formatUsd(remaining.reduce((n, i) => n + (estimateCostUsd("elevenlabs", job.voice.modelId ?? "eleven_v3", { characters: (state.blocks[i.block_id]?.text ?? "").length }) ?? 0), 0))}`)}</p>
          <Button data-testid="dialogue-batch-reconfirm-approve" size="sm" disabled={busy} onClick={() => void act(async () => { await reconfirmDialogueBatch({ data: { projectId, batchId: job.id, approved: true } }); setReconfirm(null); await advanceDialogueBatch({ data: { projectId, batchId: job.id } }); })}>{L("Godkjenn og fortsett", "Approve and continue")}</Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => setReconfirm(null)}>{L("Avbryt", "Cancel")}</Button>
        </section> : null}
        {undoConfirm === job.id ? <section data-testid="dialogue-batch-undo-panel" role="group" className="mt-2 border border-border p-2 text-xs">
          <p>{L(`${done === 1 ? "1 generert replikk" : `${done} genererte replikker`} angres. Den forrige aktive versjonen blir aktiv igjen. Ingen eldre lyd eller redigering slettes, og ingenting genereres på nytt.`, `${done === 1 ? "1 generated line" : `${done} generated lines`} will be undone. The previous active version becomes active again. No older audio or edits are deleted, and nothing is generated again.`)}</p>
          <Button data-testid="dialogue-batch-undo-approve" size="sm" disabled={busy} onClick={() => void act(async () => { await undoDialogueBatchJob({ data: { projectId, batchId: job.id } }); setUndoConfirm(null); })}>{L("Angre hele jobben", "Undo the whole job")}</Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => setUndoConfirm(null)}>{L("Avbryt", "Cancel")}</Button>
        </section> : null}
      </section>; })}
    </DialogContent></Dialog>
  </>;
}
