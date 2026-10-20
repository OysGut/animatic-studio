import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { alignTranslationLines } from "@/adapters/ai/line-align.functions";
import { newId, linksAboveThreshold, uncertainLineScope, lineLinkStale, lineTargetText, confidencePercent, ratioTitle, discardedText, type Command, type ProjectState, type LineLinkFields } from "@/core";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { t as tk } from "@/core/i18n/keyed";
const control="h-7 rounded-sm border border-border-control bg-surface-3 px-1.5 text-xs text-text-primary";
const originLabel=(origin:string)=> origin === "rule" ? tk("app-script-line-link-review.origin-label.message.dca37679cfa3") : origin === "ai" ? tk("app-script-line-link-review.origin-label.message.c50aaf5eb6c9") : origin === "approved" ? tk("app-script-line-link-review.origin-label.message.aeead83cf526") : tk("app-script-line-link-review.origin-label.message.ea611054606a");
export function LineLinkReview({state,variantId,language,editable,run}:{state:ProjectState;variantId:string;language:string;editable:boolean;run:(c:Command,label:string)=>string|null}) {
  const call=useServerFn(alignTranslationLines);
  const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[filter,setFilter]=useState("all"),[threshold,setThreshold]=useState(0.8);
  const [estimate,setEstimate]=useState<{fingerprint:string;lines:number;profileName:string|null}|null>(null);
  const [proposals,setProposals]=useState<LineLinkFields[]>([]),[discarded,setDiscarded]=useState(0);
  const scope=uncertainLineScope(state,variantId,language);
  const scopedLinks=Object.values(state.translationLineLinks ?? {}).filter(l=>l.variantId===variantId&&l.language===language);
  const links=scopedLinks.filter(l=>!l.removed);
  const targets=[...Object.values(state.translations).filter(t=>!t.removed&&t.language===language&&t.blockId&&state.blocks[t.blockId]?.variantId===variantId),...Object.values(state.translationLines ?? {}).filter(u=>!u.removed&&u.language===language&&u.variantId===variantId).sort((a,b)=>a.ord-b.ord)];
  const unpairedCount=Object.values(state.translationLines ?? {}).filter(u=>!u.removed&&u.language===language&&u.variantId===variantId&&!links.some(l=>!lineLinkStale(state,l)&&l.targetTranslationIds.includes(u.id))).length;
  const sources=Object.values(state.blocks).filter(b=>!b.removed&&b.variantId===variantId&&b.kind!=="heading");
  const [adjusting,setAdjusting]=useState<string|null>(null);
  const [manualSource,setManualSource]=useState<string[]>([]),[manualTarget,setManualTarget]=useState<string[]>([]);
  function command(c:Command) {const problem=run(c,tk("app-script-line-link-review.problem.run.16e497f69302"));setError(problem);return !problem;}
  async function request(confirmed=false) {
    setBusy(true);setError(null);
    try {
      const r=await call({data:{projectId:state.project.id,variantId,language,confirmed,fingerprint:estimate?.fingerprint}});
      if (!r.ok) {setError(r.message);return;}
      if (r.estimate) {setEstimate({fingerprint:r.fingerprint,lines:r.lines,profileName:r.profileName});return;}
      setEstimate(null);setProposals(r.links);setDiscarded(r.discarded);
    } catch {setError(tk("app-script-line-link-review.request.set-error.72f29de43f04"));}
    finally {setBusy(false);}
  }
  const allRows=[...targets.flatMap(t=>"blockId" in t ? [t] : []).filter(t=>!scopedLinks.some(l=>l.targetTranslationIds.includes(t.id))).map(t=>({id:t.id,origin:"rule",confidence:t.status==="approved"?1:0.5,reason:"",sourceBlockIds:t.blockId?[t.blockId]:[],targetTranslationIds:[t.id],saved:false})),...links.map(l=>({...l,saved:true}))];
  const ruleApprovals=allRows.filter(l=>!l.saved && l.confidence >= threshold).map(l=>({linkId:newId(),fields:{variantId,language,sourceBlockIds:l.sourceBlockIds,targetTranslationIds:l.targetTranslationIds,origin:"rule" as const,confidence:l.confidence,reason:l.reason}}));
  return <>
    <Button size="sm" variant="outline" data-testid="line-links-open" onClick={()=>setOpen(true)}>{tk("app-script-line-link-review.line-link-review.button.0244a7caffef")}</Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent data-testid="line-links-dialog" className="max-h-[90vh] max-w-3xl overflow-y-auto border-border bg-surface-2">
      <DialogHeader><DialogTitle>{tk("app-script-line-link-review.line-link-review.dialog-title.aa204482d1ef")}</DialogTitle></DialogHeader>
      <div className="flex flex-wrap items-center gap-2">
        <select data-testid="line-links-filter" aria-label={tk("app-script-line-link-review.line-link-review.aria-label.9a1802fd6803")} className={control} value={filter} onChange={e=>setFilter(e.target.value)}>{["all","rule","ai","approved","manual"].map(o=><option key={o} value={o}>{o==="all"?tk("app-script-line-link-review.line-link-review.option.24596d8ebb46"):originLabel(o)}</option>)}</select>
        <label className="flex items-center gap-2 text-xs text-text-secondary">{tk("app-script-line-link-review.line-link-review.label.09f1de71bf43")}<input data-testid="line-links-threshold" type="number" min={0} max={1} step={0.05} className={control} value={threshold} onChange={e=>setThreshold(Number(e.target.value))}/></label>
        <Button size="sm" data-testid="line-links-approve-threshold" disabled={!editable||(!linksAboveThreshold(links.filter(l=>!lineLinkStale(state,l)),threshold).length&&!proposals.some(p=>p.confidence>=threshold)&&!ruleApprovals.length)} onClick={()=>{if (command({type:"ApproveLineLinks",linkIds:linksAboveThreshold(links.filter(l=>!lineLinkStale(state,l)),threshold),additions:[...ruleApprovals,...proposals.filter(p=>p.confidence>=threshold).map(fields=>({linkId:newId(),fields}))]})) setProposals(ps=>ps.filter(p=>p.confidence<threshold));}}>{tk("app-script-line-link-review.line-link-review.button.02cd0279d1ca")}</Button>
        <Button size="sm" variant="outline" data-testid="line-links-estimate" disabled={!editable||busy||!scope.targets.length} onClick={()=>void request()}>{busy?tk("app-script-line-link-review.line-link-review.button.4c75bb2f2c88"):tk("app-script-line-link-review.line-link-review.button.a0bca928a5a4")}</Button>
      </div>
      {estimate?<div data-testid="line-links-cost" className="flex flex-col gap-2 border-y border-border py-3 text-xs text-text-secondary">
        <p>{tk("app-script-line-link-review.line-link-review.p.2d546ce516b5", { lines: String(estimate.lines) })}</p>
        {estimate.profileName?<p>{tk("app-script-line-link-review.line-link-review.p.4b1b9331a285", { profileName: String(estimate.profileName) })}</p>:null}
        <Button size="sm" data-testid="line-links-confirm" disabled={busy} onClick={()=>void request(true)}>{tk("app-script-line-link-review.line-link-review.button.5160a7e9869e")}</Button>
      </div>:null}
      {unpairedCount?<p data-testid="line-links-unpaired" className="text-xs text-text-secondary">{tk("app-script-line-link-review.unpaired", { count: unpairedCount })}</p>:null}
      {discarded?<p data-testid="line-links-discarded" role="status" className="text-xs text-status-uncertain">{discardedText(discarded)}</p>:null}
      <div className="flex flex-col divide-y divide-border">
        {allRows.filter(l=>filter==="all"||filter===l.origin).map(l=><div key={l.id} data-testid="line-link-row" className="flex flex-col gap-2 py-2 text-xs">
          <span className="flex items-center gap-2 text-text-tertiary">{originLabel(l.origin)} · {confidencePercent(l.confidence)} · <span data-testid="line-link-ratio" title={ratioTitle(l.sourceBlockIds.length,l.targetTranslationIds.length)}>{l.sourceBlockIds.length}:{l.targetTranslationIds.length}</span>{l.saved&&lineLinkStale(state,l as never)?<span data-testid="line-link-stale" className="rounded-sm border border-status-uncertain px-1 text-status-uncertain">{tk("app-script-line-link-review.line-link-review.span.2712d78c6e75")}</span>:null}</span>
          <p className="text-text-secondary">{l.sourceBlockIds.map(id=>state.blocks[id]?.text).join(" / ")}</p><p className="text-text-primary">{l.targetTranslationIds.map(id=>lineTargetText(state,id)).join(" / ")}</p>{l.reason?<p className="text-text-tertiary">{l.reason}</p>:null}
          <div className="flex gap-2"><Button size="sm" variant="outline" disabled={!editable||(l.saved&&lineLinkStale(state,l as never))} onClick={()=>l.saved?command({type:"ApproveLineLinks",linkIds:[l.id]}):command({type:"SetLineLink",linkId:newId(),fields:{variantId,language,sourceBlockIds:l.sourceBlockIds,targetTranslationIds:l.targetTranslationIds,origin:"approved",confidence:l.confidence,reason:""}})}>{tk("app-script-line-link-review.line-link-review.button.6b9640842f63")}</Button>
            <Button size="sm" variant="ghost" disabled={!editable} onClick={()=>l.saved?command({type:"RejectLineLinks",linkIds:[l.id],removed:true}):command({type:"SetLineLink",linkId:newId(),fields:{variantId,language,sourceBlockIds:l.sourceBlockIds,targetTranslationIds:l.targetTranslationIds,origin:"rule",confidence:l.confidence,reason:""},removed:true})}>{tk("app-script-line-link-review.line-link-review.button.b1a3ee01db86")}</Button>
            <Button size="sm" variant="ghost" disabled={!editable} onClick={()=>{setAdjusting(l.saved ? l.id : null);setManualSource([...l.sourceBlockIds]);setManualTarget([...l.targetTranslationIds]);}}>{tk("app-script-line-link-review.line-link-review.button.aa1fed62325d")}</Button></div>
        </div>)}
        {proposals.filter(()=>filter==="all"||filter==="ai").map((l,i)=><div key={i} data-testid="line-link-proposal" className="flex flex-col gap-2 py-2 text-xs text-text-secondary"><span>{originLabel("ai")} · {confidencePercent(l.confidence)} · <span data-testid="line-link-ratio" title={ratioTitle(l.sourceBlockIds.length,l.targetTranslationIds.length)}>{l.sourceBlockIds.length}:{l.targetTranslationIds.length}</span></span><p>{l.sourceBlockIds.map(id=>state.blocks[id]?.text).join(" / ")}</p><p>{l.targetTranslationIds.map(id=>lineTargetText(state,id)).join(" / ")}</p><p>{l.reason}</p><div className="flex gap-2"><Button size="sm" onClick={()=>{if (command({type:"SetLineLink",linkId:newId(),fields:{...l,origin:"approved"}})) setProposals(ps=>ps.filter((_,k)=>i!==k));}}>{tk("app-script-line-link-review.line-link-review.button.6b9640842f63.2")}</Button><Button size="sm" variant="ghost" onClick={()=>setProposals(ps=>ps.filter((_,k)=>i!==k))}>{tk("app-script-line-link-review.line-link-review.button.b1a3ee01db86.2")}</Button><Button size="sm" variant="ghost" onClick={()=>{setAdjusting(null);setManualSource([...l.sourceBlockIds]);setManualTarget([...l.targetTranslationIds]);}}>{tk("app-script-line-link-review.line-link-review.button.aa1fed62325d.2")}</Button></div></div>)}
      </div>
      <fieldset disabled={!editable} className="grid grid-cols-2 gap-2 border-t border-border pt-3 text-xs text-text-secondary">
        <label>{tk("app-script-line-link-review.line-link-review.label.9de46a664f74")}<select multiple data-testid="line-links-sources" className="w-full border border-border-control bg-surface-3" value={manualSource} onChange={e=>setManualSource(Array.from(e.target.selectedOptions,o=>o.value))}>{sources.map(b=><option key={b.id} value={b.id}>{b.text}</option>)}</select></label>
        <label>{tk("app-script-line-link-review.line-link-review.label.4c0f17fbd986")}<select multiple data-testid="line-links-targets" className="w-full border border-border-control bg-surface-3" value={manualTarget} onChange={e=>setManualTarget(Array.from(e.target.selectedOptions,o=>o.value))}>{targets.map(t=><option key={t.id} value={t.id}>{t.text}</option>)}</select></label>
        <Button size="sm" data-testid="line-links-manual-save" disabled={!manualSource.length||!manualTarget.length} onClick={()=>command({type:"SetLineLink",linkId:adjusting ?? newId(),fields:{variantId,language,sourceBlockIds:manualSource,targetTranslationIds:manualTarget,origin:"manual",confidence:1,reason:""}})}>{tk("app-script-line-link-review.line-link-review.button.87a7e505a418")}</Button>
      </fieldset>
      {error?<p role="alert" className="text-xs text-status-danger">{error}</p>:null}
      <DialogFooter><Button variant="ghost" onClick={()=>setOpen(false)}>{tk("app-script-line-link-review.line-link-review.button.310d919f50c9")}</Button></DialogFooter>
    </DialogContent></Dialog>
  </>;
}
