import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AiGlyph } from "@/app/design/icons/AiGlyph";
import { useRevealNew } from "@/app/shared/reveal";
import { Button } from "@/components/ui/button";
import { Thumbnail } from "@/app/shared/Thumbnail";
import { useImageUrls } from "@/app/library/asset-images";
import { useProjectProviders } from "@/app/ai/use-project-providers";
import { estimateStoryboardAi, generateStoryboardAi, recoverStoryboardCandidate, type StoryboardAiRequest } from "@/adapters/ai/storyboard.functions";
import { adoptServerHistory } from "@/app/project/use-commands";
import { rasterPanelInput, fitCandidateImage } from "./ai-images";
import { panelOutputPlan } from "@/core/storyboard/ai-output";
import { planAiPanels } from "@/core/storyboard/ai-proposals";
import { automaticPanelBasis, panelAiCapabilities, panelResourceLayers } from "@/core/storyboard/ai";
import { providersFor, newId, layerVersion, layerFieldsOf, panelDetails, panelKeyAfter, SHOT_TYPES, SHOT_ANGLES, defaultLayerFields, keyBetween, layersOf, type Composition, type ProjectState, type AssetMedia, type Command } from "@/core";
import type { Commands } from "@/app/project/use-commands";
import { t } from "@/core/i18n/keyed";

const ctl = "w-full min-w-0 rounded-sm border border-border-control bg-surface-1 px-2 py-1 text-[13px] text-text-primary";
interface Candidate { versionId: string; media: AssetMedia; trace: unknown; assetId: string; variantId: string }
export function PanelAi({ state, panel, cmds, editable, mask }: { state: ProjectState; panel: Composition; cmds: Commands; editable: boolean; mask: StoryboardAiRequest["mask"] }) {
  const available = useProjectProviders(state.project.id);
  const ids = new Set((available.data?.providers ?? []).filter(id => id !== "lovable"));
  const imageChoices = providersFor("image", ids).flatMap(p => p.models.map(m => ({ key: `${p.provider.id}|${m.id}`, provider: p.provider.id, model: m })));
  const textChoices = providersFor("text", ids).flatMap(p => p.models.map(m => ({ key: `${p.provider.id}|${m.id}`, provider: p.provider.id, model: m })));
  const [pick, setPick] = useState(""); const [textPick, setTextPick] = useState("");
  const choice = imageChoices.find(c => c.key === pick) ?? imageChoices[0];
  const textChoice = textChoices.find(c => c.key === textPick) ?? textChoices[0];
  const caps = choice ? panelAiCapabilities(choice.model) : null;
  const [basis, setBasis] = useState<StoryboardAiRequest["basis"]>(automaticPanelBasis(state, panel));
  const [style, setStyle] = useState<StoryboardAiRequest["style"]>("line");
  const [action, setAction] = useState<StoryboardAiRequest["action"]>("image");
  const [count, setCount] = useState(1); const [visualNotes, setVisual] = useState(false);
  const [refs, setRefs] = useState<string[]>([]); const [sketch, setSketch] = useState(""); const [second, setSecond] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const [quote, setQuote] = useState<{ cost: number; studyCost: number; request: StoryboardAiRequest } | null>(null);
  const [received, setReceived] = useState<Candidate[]>([]); const [text, setText] = useState("");
  const [textJobId, setTextJobId] = useState("");
  const [recovery, setRecovery] = useState("");
  const [nativeMask, setNativeMask] = useState("");
  const savedCandidates = layersOf(state, panel.id).flatMap(l => { const v = l.versionId ? state.assetVersions[l.versionId] : null; if (!v || !l.assetId || !l.assetVariantId) return []; try { const trace = JSON.parse(v.note) as { panelId?: string }; if (trace.panelId !== panel.id) return []; return [{ versionId: v.id, assetId: l.assetId, variantId: l.assetVariantId, trace, media: { path: v.mediaPath, mimeType: v.mimeType, width: v.width, height: v.height, byteSize: v.byteSize, sha256: v.sha256, durationMs: v.durationMs } }]; } catch { return []; } });
  const candidates = [...savedCandidates, ...received.filter(c => !savedCandidates.some(s => s.versionId === c.versionId))];
  const resultsRef = useRef<HTMLDivElement>(null);
  const flash = useRevealNew(resultsRef, candidates.map(c => c.versionId));
  const estimate = useServerFn(estimateStoryboardAi); const generate = useServerFn(generateStoryboardAi);
  const recover = useServerFn(recoverStoryboardCandidate);
  const versions = Object.values(state.assetVersions).filter(v => !v.removed && v.mimeType.startsWith("image/"));
  const approved = versions.filter(v => state.assetVariants[v.variantId]?.approvedVersionId === v.id);
  const urls = useImageUrls(candidates.map(c => c.media.path)).data ?? {};
  const exportedSketch=versions.filter(v=>{try{const meta=JSON.parse(v.note);return meta.kind==="sketch"&&meta.panelId===panel.id;}catch{return false;}}).at(-1);
  const sketchLayers = layersOf(state, panel.id).filter(l => l.visible && l.sketch?.strokes.length);
  const output = choice ? panelOutputPlan(panel, mask, choice.model) : null;
  const makeRequest = (): StoryboardAiRequest => ({ projectId: state.project.id, panelId: panel.id, revision: panel.revision, action, secondPanelId: second || null, basis, style, visualNotes, sketchVersionId: (!sketch.startsWith("layer:") && sketch) || exportedSketch?.id || panelResourceLayers(state, panel).flatMap(l => { const v = layerVersion(state, l); return v ? [v.id] : []; })[0] || null, references: refs, mask, provider: choice?.provider ?? "", model: choice?.model.id ?? "", textProvider: textChoice?.provider ?? "", textModel: textChoice?.model.id ?? "", count, assetId: null, approved: false });
  const getQuote = async () => {
    setBusy(true); setError(null);
    try {
      await cmds.whenIdle(); let request = makeRequest();
      const fresh = cmds.current() ?? state;
      const layerId = sketch.startsWith("layer:") ? sketch.slice(6) : !sketch ? sketchLayers[0]?.id ?? null : null;
      const actualBasis = action === "clean" ? "sketch" : basis;
      if ((action === "image" || action === "clean") && (actualBasis === "composition" || (actualBasis === "sketch" && layerId))) {
        const structureVersionId = await rasterPanelInput(fresh, panel, actualBasis, layerId, cmds);
        request = { ...request, basis: actualBasis, structureVersionId, sketchLayerId: layerId, sketchVersionId: actualBasis === "sketch" ? structureVersionId : null };
      }
      request = { ...request, maskVersionId: nativeMask || null };
      const r = await estimate({ data: request }); if (r.ok && r.cost !== null) setQuote({ cost: r.cost, studyCost: r.studyCost, request: { ...request, quoteHash: r.quoteHash, maxCost: r.cost } }); else setError(r.ok ? t("sb7.unavailable") : r.message);
    }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const execute = async () => {
    if (!quote) return;
    setBusy(true); setError(null);
    const request = { ...quote.request, approved: true };
    setQuote(null);
    try {
      let assetId = "", variantId = "";
      if (request.action === "image" || request.action === "clean") {
        assetId = newId<"asset">(); variantId = newId<"asset_variant">(); const group = newId();
        let e = await cmds.runAndWait({ type: "CreateAssets", assets: [{ assetId: assetId as never, fields: { kind: "other", name: panel.name || t("sb7.candidate"), names: [], description: "", category: "", tags: [] } }] }, t("sb7.candidate"), group);
        if (e.error) throw Error(e.error);
        e = await cmds.runAndWait({ type: "CreateAssetVariant", assetId: assetId as never, variantId: variantId as never, fields: { name: t("sb7.candidate"), style: "other", appearance: "" } }, t("sb7.candidate"), group);
        if (e.error) throw Error(e.error);
      }
      const result = await generate({ data: { ...request, assetId: assetId || null } });
      if ("candidates" in result && result.candidates) {
        for (const c of result.candidates) {
          adoptServerHistory(state.project.id, c.history, t("sb7.candidate"));
          setReceived(old => [...old, { versionId: c.versionId, media: c.media, trace: c.trace, assetId, variantId }]);
        }
      }
      if ("recoveryJobId" in result && result.recoveryJobId) setRecovery(result.recoveryJobId);
      if (!result.ok) setError(result.message);
      else if ("text" in result && typeof result.text === "string") { setText(result.text); setTextJobId("trace" in result ? String(result.trace.jobId ?? "") : ""); }
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const acceptText = () => {
    const group = newId();
    if (action === "describe") { cmds.run({ type: "SetStoryboardDetails", panelId: panel.id, details: { ...panelDetails(panel), fields: { ...panelDetails(panel).fields, description: text, ai_job: textJobId } } }, t("sb7.describe"), group); setText(""); return; }
    try {
      const commands = planAiPanels(state, panel, text, textJobId);
      for (const c of commands) { const e = cmds.run(c, t("sb7.confirm"), group); if (e) throw Error(e); }
      setText("");
    } catch (e) { setError((e as Error).message); }
  };
  const acceptCandidate = async (c: Candidate) => {
    setBusy(true); setError(null);
    try {
      await cmds.whenIdle(); const fresh = cmds.current() ?? state;
      const layer = layersOf(fresh, panel.id).find(l => l.versionId === c.versionId);
      if (!layer) throw Error(t("sb7.stale"));
      const trace = c.trace as { output?: { ratio: number; adaptation: string } };
      let versionId = c.versionId, assetId = c.assetId, assetVariantId = c.variantId;
      if (trace.output?.adaptation === "contain") {
        versionId = await fitCandidateImage(fresh, panel, c.media.path, trace.output.ratio, cmds, c.versionId);
        const after = cmds.current() ?? state, version = after.assetVersions[versionId], variant = version ? after.assetVariants[version.variantId] : null;
        if (!variant) throw Error(t("sb7.stale")); assetId = variant.assetId; assetVariantId = variant.id;
      }
      const r = await cmds.runAndWait({ type: "UpdateLayers", layers: [{ layerId: layer.id, fields: { ...layerFieldsOf(layer), assetId: assetId as never, assetVariantId: assetVariantId as never, versionId: versionId as never, visible: true } }] }, t("sb7.accept"));
      if (r.error) throw Error(r.error);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return <section className="space-y-2 border-t border-border pt-3" data-testid="sb7-ai">
    <h3 className="flex items-center gap-1 text-[13px] font-semibold"><AiGlyph className="size-4"/>{t("sb7.title")}</h3>
    <select aria-label={t("sb7.action")} className={ctl} value={action} disabled={busy} onChange={e => { setAction(e.target.value as typeof action); setQuote(null); setText(""); }}>
      <option value="image">{t("sb7.image")}</option><option value="coverage">{t("sb7.coverage")}</option><option value="between">{t("sb7.between")}</option>{caps?.sketch ? <option value="clean">{t("sb7.clean")}</option> : null}<option value="describe">{t("sb7.describe")}</option>
    </select>
    {(action === "image" || action === "clean") ? <>
      <select aria-label={t("sb7.model")} className={ctl} value={choice?.key ?? ""} onChange={e => { setPick(e.target.value); setQuote(null); }}><option value="" disabled>{t("sb7.unavailable")}</option>{imageChoices.map(c => <option key={c.key} value={c.key}>{c.model.label}</option>)}</select>
      <select aria-label={t("sb7.basis")} className={ctl} value={basis} onChange={e => { setBasis(e.target.value as typeof basis); setQuote(null); }}><option value="script">{t("sb7.script")}</option>{caps?.imageToImage ? <><option value="composition">{t("sb7.composition")}</option><option value="sketch">{t("sb7.sketch")}</option></> : null}</select>
      {(basis === "sketch" || action === "clean") && caps?.sketch ? <select aria-label={t("sb7.sketch")} className={ctl} value={sketch} onChange={e => { setSketch(e.target.value); setQuote(null); }}><option value="">{t("sb7.sketch")}</option>{sketchLayers.map(l => <option key={l.id} value={`layer:${l.id}`}>{t("sb8.sketch")} · {l.name}</option>)}{versions.map(v => <option key={v.id} value={v.id}>{state.assets[state.assetVariants[v.variantId]?.assetId ?? ""]?.name} · v{v.number}</option>)}</select> : null}
      {output ? <p className="text-[11px] text-text-secondary">{output.native ? t("sb7.native-format") : t("sb7.fit-format", { format: output.aspect })}</p> : null}
      {caps?.mask ? <select className={ctl} aria-label={t("sb7.native-mask")} value={nativeMask} onChange={e => { setNativeMask(e.target.value); setQuote(null); }}><option value="">{t("sb7.no-mask")}</option>{versions.filter(v => v.mimeType === "image/png").map(v => <option key={v.id} value={v.id}>{state.assets[state.assetVariants[v.variantId]?.assetId ?? ""]?.name} · v{v.number}</option>)}</select> : null}
      <select aria-label={t("sb7.style")} className={ctl} value={style} onChange={e => { setStyle(e.target.value as typeof style); setQuote(null); }}><option value="line">{t("sb7.line")}</option><option value="grey">{t("sb7.grey")}</option><option value="color">{t("sb7.color")}</option></select>
      {caps && caps.references > 0 ? <fieldset className="max-h-32 overflow-auto text-[11px]"><legend>{t("sb7.references", { limit: String(caps.references) })}</legend>{approved.map(v => <label key={v.id} className="flex gap-1"><input type="checkbox" checked={refs.includes(v.id)} disabled={!refs.includes(v.id) && refs.length >= caps.references} onChange={e => { setRefs(e.target.checked ? [...refs, v.id] : refs.filter(id => id !== v.id)); setQuote(null); }}/>{state.assets[state.assetVariants[v.variantId]?.assetId ?? ""]?.name} · v{v.number}</label>)}</fieldset> : null}
      <label className="flex gap-1 text-[11px]"><input type="checkbox" checked={visualNotes} onChange={e => { setVisual(e.target.checked); setQuote(null); }}/>{t("sb7.visual-notes")}</label>
    </> : null}
    {action === "between" ? <select aria-label={t("sb7.end-panel")} className={ctl} value={second} onChange={e => { setSecond(e.target.value); setQuote(null); }}><option value="">{t("sb7.end-panel")}</option>{Object.values(state.compositions).filter(p => p.kind === "storyboard" && !p.removed && p.occurrenceId === panel.occurrenceId && p.id !== panel.id).map(p => <option key={p.id} value={p.id}>{p.name || panelDetails(p).number}</option>)}</select> : null}
    <select aria-label={t("sb7.text-model")} className={ctl} value={textChoice?.key ?? ""} onChange={e => { setTextPick(e.target.value); setQuote(null); }}><option value="" disabled>{t("sb7.unavailable")}</option>{textChoices.map(c => <option key={c.key} value={c.key}>{c.model.label}</option>)}</select>
    {action !== "describe" ? <label className="block text-[11px]">{t("sb7.count")}<input className={ctl} type="number" min={1} max={4} value={count} onChange={e => { setCount(Math.max(1, Math.min(4, Number(e.target.value) || 1))); setQuote(null); }}/></label> : null}
    {quote ? <div className="space-y-2" data-testid="sb7-cost"><p className="text-[13px]">{t("sb7.cost", { cost: quote.cost.toFixed(4), study: quote.studyCost.toFixed(4) })}</p><Button size="sm" disabled={busy || !editable} onClick={() => void execute()}>{t("sb7.confirm")}</Button><Button size="sm" variant="ghost" onClick={() => setQuote(null)}>{t("sb5.setup-cancel")}</Button></div> : <Button size="sm" disabled={busy || !editable || !textChoice || ((action === "image" || action === "clean") && !choice)} onClick={() => void getQuote()}>{busy ? t("sb7.working") : t("sb7.estimate")}</Button>}
    {error ? <p role="alert" className="text-[13px] text-status-danger">{error}</p> : null}
    {recovery ? <Button size="sm" disabled={busy} onClick={() => { setBusy(true); void recover({ data: { projectId: state.project.id, panelId: panel.id, jobId: recovery } }).then(r => { adoptServerHistory(state.project.id, r.history, t("sb7.candidate")); setReceived(old => [...old, r]); setRecovery(""); }).catch(e => setError((e as Error).message)).finally(() => setBusy(false)); }}>{t("sb7.recover")}</Button> : null}
    {text ? <div className="space-y-1"><textarea className={ctl} aria-label={t("sb7.result")} value={text} onChange={e => setText(e.target.value)}/><Button size="sm" disabled={!editable} onClick={acceptText}>{t("sb7.accept")}</Button></div> : null}
    <div ref={resultsRef} className="flex flex-wrap gap-2">{candidates.map(c => <div key={c.versionId} data-reveal-id={c.versionId} className={"w-28 " + (flash === c.versionId ? "ring-2 ring-accent-selection" : "")}><div className="aspect-video"><Thumbnail src={urls[c.media.path]} alt={t("sb7.candidate")}/></div><Button size="sm" disabled={!editable || busy} onClick={() => void acceptCandidate(c)}>{t("sb7.accept")}</Button></div>)}</div>
  </section>;
}