import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { SketchCanvas } from "@/app/storyboard/SketchCanvas";
import { readSketchSession, writeSketchSession } from "@/adapters/mobile/sketch.functions";
import { t } from "@/core/i18n/keyed";
import type { SketchSpec } from "@/core/storyboard/sketch";
export function MobileSketch({token}:{token:string}){
  const [data,setData]=useState<{spec:SketchSpec;width:number;height:number}|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false),[undoStack,setUndo]=useState<SketchSpec[]>([]),[redoStack,setRedo]=useState<SketchSpec[]>([]);
  const load=()=>{setError("");void readSketchSession({data:token}).then(setData).catch(()=>setError(t("sb8.session-error")));};useEffect(load,[token]);
  const save=async(spec:SketchSpec,history:"edit"|"undo"|"redo"="edit")=>{if(!data||busy)return;setBusy(true);setError("");const before=data.spec;const added=spec.strokes.find(st=>!before.strokes.some(old=>old.id===st.id));const erased=before.strokes.filter(st=>!spec.strokes.some(n=>n.id===st.id)).map(st=>st.id);
    try{const saved=await writeSketchSession({data:{token,requestId:crypto.randomUUID(),...(added?{stroke:added}:{}),eraseIds:erased,role:spec.role}});if(history==="edit"){setUndo(s=>[...s,before]);setRedo([]);}else if(history==="undo"){setUndo(s=>s.slice(0,-1));setRedo(s=>[...s,before]);}else{setRedo(s=>s.slice(0,-1));setUndo(s=>[...s,before]);}setData({...data,spec:saved});}catch{setError(t("sb8.session-error"));}finally{setBusy(false);}};
  return <main className="flex h-dvh flex-col bg-bg-app text-text-primary" data-testid="sb8-mobile">
    <header className="flex items-center gap-2 border-b border-border p-2"><h1 className="text-sm font-semibold">{t("sb8.mobile-title")}</h1>{busy?<span role="status">{t("sb8.saving")}</span>:null}</header>
    {error?<div role="alert" className="p-2 text-status-danger">{error}<Button variant="outline" onClick={load}>{t("sb8.retry")}</Button></div>:null}
    {data?<SketchCanvas {...data} disabled={busy} save={s=>void save(s)} undo={()=>{const s=undoStack.at(-1);if(s)void save(s,"undo");}} redo={()=>{const s=redoStack.at(-1);if(s)void save(s,"redo");}} canUndo={!busy&&undoStack.length>0} canRedo={!busy&&redoStack.length>0}/>:<p role="status" className="p-4">{t("sb8.loading")}</p>}
  </main>;
}