import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { L, characterDialogueCoverage, selectedDialogueCounts, estimateCostUsd, formatUsd, newId, existingSpeechWarning, multilingualSpeechWarning, batchTimeEstimate, speechLanguageError, languageTagError, type ProjectState, type Asset, type AssetVoice } from "@/core";
import { createDialogueBatch, advanceDialogueBatch, resumeDialogueBatch, listDialogueBatches } from "@/adapters/ai/dialogue-batch.functions";
import { VoiceControls } from "@/app/audio/VoiceControls";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { PanelHeader } from "@/app/shell/workspace-chrome";
import { listSpeechModels } from "@/adapters/ai/speech.functions";

export function DialogueBatchPanel({ state, asset, projectId, editable }: { state: ProjectState; asset: Asset; projectId: string; editable: boolean }) {
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
  const client = useQueryClient();
  const coverage = characterDialogueCoverage(state, asset.id);
  const all = coverage.flatMap(s => s.lines);
  const chosen = all.filter(l => selected.has(l.key));
  const counts = selectedDialogueCounts(chosen);
  const languageOf = (key: string, fallback: string) => languages[key] ?? fallback;
  const groups = [...new Set(chosen.map(l => languageOf(l.key, l.speechLanguage)))];
  const detected = new Set(all.map(l => l.detection.language));
  const plans = mode === "split" ? groups.map(language => ({ language, voice: languageVoices[language] ?? (voice ? { ...voice, language } : null), lines: chosen.filter(l => languageOf(l.key, l.speechLanguage) === language) })) : [{ language: voice?.language ?? "no", voice, lines: chosen }];
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
          lines: plan.lines.map(l => ({ key: l.key, revision: l.scriptRevision, language: mode === "split" ? plan.language : plan.voice?.language ?? "no" })) } });
        await advanceDialogueBatch({ data: { projectId, batchId: batch.id } });
      }
      setConfirm(false); await refresh();
    } catch (e) { setError((e as Error).message); await refresh(); }
    finally { setBusy(false); }
  }
  async function advance(id: string, resume: boolean) {
    setBusy(true); setError(null);
    try { if (resume) await resumeDialogueBatch({ data: { projectId, batchId: id } }); await advanceDialogueBatch({ data: { projectId, batchId: id } }); await refresh(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <>
    <Button data-testid="dialogue-batch-open" size="sm" variant="secondary" disabled={!editable} onClick={() => { setVoice(asset.voice ?? null); setOpen(true); }}>{L("Generer all tale for denne karakteren", "Generate all speech for this character")}</Button>
    <Dialog open={open} onOpenChange={value => { if (!busy) setOpen(value); }}><DialogContent data-testid="dialogue-batch-dialog" className="max-h-[90vh] max-w-4xl overflow-y-auto">
      <DialogTitle>{L(`Generer tale · ${asset.name}`, `Generate speech · ${asset.name}`)}</DialogTitle>
      <p className="text-xs text-text-secondary">{L(`Prosjekt: ${state.project.name}`, `Project: ${state.project.name}`)}</p>
      <div className="flex flex-wrap gap-2">{([ ["all", L("Alle", "All")], ["missing", L("Bare de som mangler", "Missing only")], ["partial", L("Delvise", "Partial")] ] as const).map(([kind, label]) => <Button key={kind} data-testid={`dialogue-batch-${kind}`} size="sm" variant="secondary" disabled={busy} onClick={() => choose(coverage.filter(s => kind === "all" || (kind === "partial" ? s.missing > 0 && s.withAudio > 0 : s.missing > 0)).flatMap(s => s.lines.filter(l => kind !== "missing" || !l.hasAudio).map(l => l.key)))}>{label}</Button>)}</div>
      {!all.length ? <p role="status">{L("Karakteren har ingen replikker i dette prosjektet.", "This character has no lines in this project.")}</p> : null}
      <div data-testid="dialogue-batch-coverage" className="flex flex-col gap-3">{coverage.map(scene => <section key={scene.occurrenceId} className="border-b border-border pb-3">
        <label className="flex items-center gap-2 text-sm text-text-primary"><input type="checkbox" data-testid="dialogue-batch-scene" disabled={busy} checked={scene.lines.every(l => selected.has(l.key))} onChange={e => { const next = new Set(selected); scene.lines.forEach(l => e.target.checked ? next.add(l.key) : next.delete(l.key)); choose([...next]); }} />{scene.number} · {scene.title}</label>
        <p className="text-xs text-text-secondary">{L(`${scene.total} replikker · ${scene.withAudio} med lyd · ${scene.missing} uten lyd · ${scene.drift} med avvik`, `${scene.total} lines · ${scene.withAudio} with audio · ${scene.missing} without audio · ${scene.drift} with drift`)}</p>
        {scene.withAudio > 0 ? <p className="text-xs text-status-uncertain">{L("Ny generering overtar aktiv versjon for valgte replikker.", "New generation replaces the active choice for selected lines.")}</p> : null}
        {scene.lines.map(line => <div key={line.key} className="mt-2 flex flex-wrap items-center gap-2 text-xs"><label className="flex min-w-0 flex-1 items-center gap-2"><input type="checkbox" data-testid="dialogue-batch-line" disabled={busy} checked={selected.has(line.key)} onChange={e => { const next = new Set(selected); e.target.checked ? next.add(line.key) : next.delete(line.key); choose([...next]); }} /><span className="break-words">{line.text}</span></label>
          <label className="flex items-center gap-2 text-text-secondary">{L("Talespråk", "Speech language")}<input data-testid="dialogue-batch-line-language" aria-label={L("Replikkens talespråk", "Line speech language")} disabled={busy} value={languageOf(line.key, line.speechLanguage)} onChange={e => { setLanguages({ ...languages, [line.key]: e.target.value }); changed(); }} className="h-8 w-24 rounded-sm border border-border-control bg-surface-3 px-2" /></label>
          <span className="text-text-tertiary">{L(`Oppdaget: ${line.detection.language} · usikkert (manus: ${line.scriptLanguage})`, `Detected: ${line.detection.language} · uncertain (script: ${line.scriptLanguage})`)}</span>
        </div>)}
      </section>)}</div>
      <p data-testid="dialogue-batch-counts" className="text-xs text-text-primary">{L(`${counts.scenes} scener · ${counts.lines} replikker valgt · ${counts.missing} mangler lyd · ${counts.withAudio} har lyd · ${counts.drift} avvik`, `${counts.scenes} scenes · ${counts.lines} selected lines · ${counts.missing} missing audio · ${counts.withAudio} have audio · ${counts.drift} drift`)}</p>
      {detected.size > 1 || groups.length > 1 ? <p role="alert" className="text-xs text-status-uncertain">{multilingualSpeechWarning()}</p> : null}
      <fieldset className="flex flex-wrap gap-4 text-xs"><legend>{L("Språkfordeling", "Language grouping")}</legend>{([ ["together", L("Samlet generering (uttale er ikke garantert)", "Generate together (pronunciation is not guaranteed)")], ["split", L("Separate jobber etter språk", "Separate jobs by language")] ] as const).map(([value, label]) => <label key={value} className="flex items-center gap-2"><input data-testid={`dialogue-batch-${value}`} type="radio" name="dialogue-batch-mode" checked={mode === value} disabled={busy} onChange={() => { setMode(value); changed(); }} />{label}</label>)}</fieldset>
      {mode === "split" ? groups.map(language => <section key={language} data-testid="dialogue-language-job" className="border-t border-border pt-3"><PanelHeader title={language} /><VoiceControls projectId={projectId} value={languageVoices[language] ?? (voice ? { ...voice, language } : null)} disabled={busy} onChange={v => { setLanguageVoices({ ...languageVoices, [language]: v ? { ...v, language } : null }); changed(); }} /></section>) : <VoiceControls projectId={projectId} value={voice} disabled={busy} onChange={v => { setVoice(v); changed(); }} />}
      {priced.map(p => <p key={p.language} className="text-xs text-text-secondary">{L(`${p.lines.length} replikker · ${p.language} · ${p.voice?.label ?? "—"} · ${p.voice?.modelId ?? "—"} · kostnadsanslag: ${p.cost === null ? "ukjent" : formatUsd(p.cost)} · tidsanslag: ukjent (usikkert)`, `${p.lines.length} lines · ${p.language} · ${p.voice?.label ?? "—"} · ${p.voice?.modelId ?? "—"} · cost estimate: ${p.cost === null ? "unknown" : formatUsd(p.cost)} · time estimate: unknown (uncertain)`)}</p>)}
      {priced.map(p => { const time = batchTimeEstimate(p.lines); return time ? <p key={p.language} className="text-xs text-text-tertiary">{L(`${p.language} · usikkert arbeidsanslag: ${time.minSeconds}–${time.maxSeconds} sekunder, uten køventing. Leverandørens svartid er ikke bekreftet.`, `${p.language} · uncertain planning estimate: ${time.minSeconds}–${time.maxSeconds} seconds, excluding queue wait. Provider response time is not verified.`)}</p> : null; })}
      {mode === "together" ? <p role="status" className="text-xs text-status-uncertain">{L(`Samlet jobb bruker ${voice?.language ?? "no"} for alle valgte replikker. Linjenes egne talespråk brukes bare ved oppdeling.`, `The combined job uses ${voice?.language ?? "no"} for all selected lines. Individual line languages apply only when splitting.`)}</p> : null}
      {capabilityErrors.map((message,i) => <p key={i} role="alert" className="text-xs text-status-danger">{message}</p>)}
      {counts.withAudio > 0 ? <p data-testid="dialogue-batch-warning" role="alert" className="text-xs text-status-uncertain">{existingSpeechWarning()}</p> : null}
      {confirm ? <section data-testid="dialogue-batch-confirm" className="border-t border-border pt-3"><PanelHeader title={L("Godkjenn kostnaden", "Approve cost")} /><p className="text-xs">{L(`${asset.name} · ${counts.scenes} scener · ${counts.lines} replikker`, `${asset.name} · ${counts.scenes} scenes · ${counts.lines} lines`)}</p>
        <Button data-testid="dialogue-batch-approve" disabled={busy || !!capabilityErrors.length} onClick={() => void start()}>{busy ? L("Genererer …", "Generating …") : L("Godkjenn og generer", "Approve and generate")}</Button>
        <Button variant="ghost" disabled={busy} onClick={() => setConfirm(false)}>{L("Avbryt", "Cancel")}</Button></section> : <Button data-testid="dialogue-batch-start" disabled={busy || !mode || !chosen.length || !!capabilityErrors.length || priced.some(p => !p.voice || p.cost === null)} onClick={() => setConfirm(true)}>{L("Kontroller og bekreft …", "Review and approve …")}</Button>}
      {error ? <p role="alert" className="text-xs text-status-danger">{error}</p> : null}
      {jobs.isError ? <p role="alert" className="text-xs text-status-danger">{L("Jobbene kunne ikke hentes. Prøv igjen etter at databasen er oppdatert.", "Jobs could not be loaded. Try again after the database is updated.")}<Button size="sm" variant="ghost" onClick={() => void jobs.refetch()}>{L("Prøv igjen", "Try again")}</Button></p> : null}
      {(jobs.data ?? []).map(job => <section key={job.id} data-testid="dialogue-batch-job" className="border-t border-border pt-3"><PanelHeader title={`${job.voice.label} · ${job.voice.modelId ?? ""}`} />
        <ul className="text-xs">{job.items.map(item => <li key={item.id} data-testid="dialogue-batch-progress" className="py-1">{state.blocks[item.block_id]?.text} · {item.language} · {item.status === "waiting" ? L("Venter", "Waiting") : item.status === "generating" ? L("Genererer", "Generating") : item.status === "ready" ? L("Lyd lagret, venter på innlegging", "Audio saved, awaiting placement") : item.status === "done" ? L("Ferdig", "Done") : item.status === "skipped" ? L("Hoppet over", "Skipped") : L("Feilet", "Failed")}{item.error ? <span role="alert" className="text-status-danger"> · {item.error}</span> : null}</li>)}</ul>
        {job.pause_reason ? <p role="alert" className="text-xs text-status-danger">{job.pause_reason}</p> : null}
        <Button data-testid="dialogue-batch-resume" size="sm" variant="secondary" disabled={busy} onClick={() => void advance(job.id, job.status !== "running")}>{L("Gjenoppta / prøv feilede på nytt", "Resume / retry failed lines")}</Button>
      </section>)}
    </DialogContent></Dialog>
  </>;
}