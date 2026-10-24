import { useEffect, useRef, useState } from "react";
import { Pencil, Paintbrush, Eraser, PaintBucket, Minus, Square, Circle, Move, FlipHorizontal, RotateCcw, ZoomIn, ZoomOut, Undo2, Redo2, Download, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { t } from "@/core/i18n/keyed";
import { appendStroke, packSamples, unpackSamples, MAX_SKETCH_POINTS, type SketchSpec, type SketchStroke, type SketchTool, type PenSample } from "@/core/storyboard/sketch";
import { paintStroke } from "@/engine/compositor/sketch";
import { drawFrame } from "@/engine/compositor/canvas";
import type { Frame } from "@/core";

const toolNames={pencil:()=>t("sb8.pencil"),brush:()=>t("sb8.brush"),erase:()=>t("sb8.erase"),fill:()=>t("sb8.fill"),line:()=>t("sb8.line"),rect:()=>t("sb8.rect"),ellipse:()=>t("sb8.ellipse")};
const tools=[{id:"pencil",Icon:Pencil},{id:"brush",Icon:Paintbrush},{id:"erase",Icon:Eraser},{id:"fill",Icon:PaintBucket},{id:"line",Icon:Minus},{id:"rect",Icon:Square},{id:"ellipse",Icon:Circle}] as const;
export interface SketchCanvasProps {
  width:number;height:number;spec:SketchSpec;save:(s:SketchSpec)=>void;disabled?:boolean;palette?:readonly string[]|undefined;
  backdrop?:Frame|undefined;previous?:Frame|undefined;next?:Frame|undefined;undo:()=>void;redo:()=>void;canUndo:boolean;canRedo:boolean;
}
/** Shared desktop/mobile drawing surface. View transforms never enter project commands. */
export function SketchCanvas({width,height,spec,save,disabled=false,palette=[],backdrop,previous,next,undo,redo,canUndo,canRedo}:SketchCanvasProps){
  const canvas=useRef<HTMLCanvasElement>(null),host=useRef<HTMLDivElement>(null),pending=useRef<PenSample[]>([]),pointer=useRef<number|null>(null),penActive=useRef(false),raf=useRef<number|null>(null),live=useRef<SketchStroke|null>(null);
  const [tool,setTool]=useState<SketchTool>("pencil"),[pan,setPan]=useState(false),[size,setSize]=useState(6),[opacity,setOpacity]=useState(1),[smoothing,setSmoothing]=useState(.3),[curve,setCurve]=useState(1),[color,setColor]=useState(palette[0]??""),[eraseMode,setEraseMode]=useState("area"),[onion,setOnion]=useState(false),[onionOpacity,setOnionOpacity]=useState(.25),[light,setLight]=useState(false),[view,setView]=useState({zoom:1,x:0,y:0,rotation:0,flip:false}),[error,setError]=useState("");
  const current=useRef({spec,save,view,tool,size,opacity,smoothing,curve,color,disabled,pan,eraseMode});current.current={spec,save,view,tool,size,opacity,smoothing,curve,color,disabled,pan,eraseMode};
  useEffect(()=>{if(color)return;const c=document.createElement("canvas").getContext("2d");if(!c)return;c.fillStyle=getComputedStyle(document.documentElement).getPropertyValue("--text-primary").trim();c.fillRect(0,0,1,1);const p=c.getImageData(0,0,1,1).data;setColor("#"+[p[0]??0,p[1]??0,p[2]??0].map(v=>v.toString(16).padStart(2,"0")).join(""));},[color]);
  const repaint=useRef(()=>{});
  repaint.current=()=>{const el=canvas.current,ctx=el?.getContext("2d");if(!el||!ctx)return;ctx.clearRect(0,0,width,height);for(const st of current.current.spec.strokes)paintStroke(ctx,st,width,height);if(live.current)paintStroke(ctx,live.current,width,height);};
  const schedule=()=>{if(raf.current!==null)return;raf.current=requestAnimationFrame(()=>{raf.current=null;repaint.current();});};
  useEffect(()=>{schedule();return()=>{if(raf.current!==null){cancelAnimationFrame(raf.current);raf.current=null;}};},[spec,width,height]);
  const anchorZoom=(factor:number,px:number,py:number)=>setView(v=>{const zoom=Math.min(8,Math.max(.1,v.zoom*factor)),k=zoom/v.zoom;return{...v,zoom,x:px-(px-v.x)*k,y:py-(py-v.y)*k};});
  useEffect(()=>{const el=host.current;if(!el)return;const wheel=(e:WheelEvent)=>{e.preventDefault();const r=el.getBoundingClientRect();anchorZoom(Math.exp(-e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?100:1)*.0015),e.clientX-r.left-r.width/2,e.clientY-r.top-r.height/2);};el.addEventListener("wheel",wheel,{passive:false});return()=>el.removeEventListener("wheel",wheel);},[]);
  const coords=(e:PointerEvent):PenSample=>{const el=canvas.current;if(!el)return{x:0,y:0,pressure:.5,tiltX:0,tiltY:0,time:0};const r=el.getBoundingClientRect();const centerX=r.left+r.width/2,centerY=r.top+r.height/2;const h=host.current?.getBoundingClientRect();const base=Math.min((h?.width??width)/width,(h?.height??height)/height)*.9;const v=current.current.view;const angle=-v.rotation*Math.PI/180,dx=(e.clientX-centerX)/(base*v.zoom),dy=(e.clientY-centerY)/(base*v.zoom);return{x:Math.max(0,Math.min(width,(dx*Math.cos(angle)-dy*Math.sin(angle))*(v.flip?-1:1)+width/2)),y:Math.max(0,Math.min(height,dx*Math.sin(angle)+dy*Math.cos(angle)+height/2)),pressure:e.pointerType==="pen"?e.pressure||.02:.5,tiltX:e.tiltX||0,tiltY:e.tiltY||0,time:e.timeStamp};};
  const start=(e:React.PointerEvent<HTMLCanvasElement>)=>{if(disabled||pointer.current!==null||(e.pointerType==="touch"&&penActive.current))return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);pointer.current=e.pointerId;penActive.current=e.pointerType==="pen";pending.current=[coords(e.nativeEvent)];setError("");if(!pan){live.current={id:crypto.randomUUID(),tool:e.shiftKey?"line":tool,color,size,opacity,curve,smoothing,points:packSamples(pending.current)};schedule();}};
  const move=(e:React.PointerEvent<HTMLCanvasElement>)=>{if(pointer.current!==e.pointerId)return;if(pan){setView(v=>({...v,x:v.x+e.movementX,y:v.y+e.movementY}));return;}const events=e.nativeEvent.getCoalescedEvents?.()??[e.nativeEvent];for(const event of events){if(pending.current.length>=MAX_SKETCH_POINTS)break;pending.current.push(coords(event));}if(live.current)live.current={...live.current,points:packSamples(pending.current)};schedule();};
  const finish=(e:React.PointerEvent<HTMLCanvasElement>,cancel=false)=>{if(pointer.current!==e.pointerId)return;pointer.current=null;penActive.current=false;if(!cancel&&!pan&&live.current){let nextSpec:SketchSpec|null;if(tool==="erase"&&eraseMode==="stroke"){const samples=pending.current;nextSpec={...spec,strokes:spec.strokes.filter(st=>!unpackSamples(st.points).some(p=>samples.some(s=>Math.hypot(s.x-p.x,s.y-p.y)<size)))};}else nextSpec=appendStroke(spec,live.current);if(nextSpec)save(nextSpec);else setError(t("sb8.limit"));}live.current=null;pending.current=[];schedule();};
  const exportPng=()=>{const el=canvas.current;if(!el)return;el.toBlob(blob=>{if(!blob)return;const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="sketch.png";a.click();URL.revokeObjectURL(url);},"image/png");};
  const layers=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{const ctx=layers.current?.getContext("2d");if(!ctx)return;ctx.clearRect(0,0,width,height);if(backdrop){drawFrame(ctx,backdrop,{images:new Map()});}if(light)ctx.globalAlpha=.25; if(onion){for(const frame of [previous,next])if(frame){ctx.save();ctx.globalAlpha=onionOpacity;const temp=document.createElement("canvas");temp.width=width;temp.height=height;const c=temp.getContext("2d");if(c){drawFrame(c,frame,{images:new Map(),background:"transparent",placeholders:false});ctx.drawImage(temp,0,0);}ctx.restore();}}},[backdrop,previous,next,light,onion,onionOpacity,width,height]);
  return <div className="flex min-h-0 flex-1 flex-col bg-surface-0" data-testid="sb8-drawing">
    <div role="toolbar" aria-label={t("sb8.tools")} className="flex flex-wrap items-center gap-1 border-b border-border p-2">
      {tools.map(({id,Icon})=><Button key={id} size="icon" variant={tool===id&&!pan?"secondary":"ghost"} title={toolNames[id]()} aria-label={toolNames[id]()} aria-pressed={tool===id&&!pan} disabled={disabled} onClick={()=>{setTool(id);setPan(false);}}><Icon/></Button>)}
      <Button size="icon" variant={pan?"secondary":"ghost"} title={t("sb8.pan")} aria-label={t("sb8.pan")} onClick={()=>setPan(!pan)}><Move/></Button>
      <Button size="icon" variant="ghost" aria-label={t("sb3.undo")} title={t("sb3.undo")} disabled={!canUndo} onClick={undo}><Undo2/></Button><Button size="icon" variant="ghost" aria-label={t("sb3.redo")} title={t("sb3.redo")} disabled={!canRedo} onClick={redo}><Redo2/></Button>
      <Button size="icon" variant="ghost" title={t("sb8.flip")} aria-label={t("sb8.flip")} onClick={()=>setView(v=>({...v,flip:!v.flip}))}><FlipHorizontal/></Button><Button size="icon" variant="ghost" title={t("sb8.rotate")} aria-label={t("sb8.rotate")} onClick={()=>setView(v=>({...v,rotation:(v.rotation+15)%360}))}><RotateCcw/></Button>
      <Button size="icon" variant="ghost" aria-label={t("sb8.zoom-in")} title={t("sb8.zoom-in")} onClick={()=>anchorZoom(1.2,0,0)}><ZoomIn/></Button><Button size="icon" variant="ghost" aria-label={t("sb8.zoom-out")} title={t("sb8.zoom-out")} onClick={()=>anchorZoom(1/1.2,0,0)}><ZoomOut/></Button><Button size="icon" variant="ghost" aria-label={t("sb8.export")} title={t("sb8.export")} onClick={exportPng}><Download/></Button>
      <input type="color" aria-label={t("sb3.color")} value={color} onChange={e=>setColor(e.target.value)} className="h-8 w-8"/>
      {palette.map(c=><input key={c} type="color" aria-label={t("sb8.palette")} value={c} readOnly onClick={()=>setColor(c)} className="h-6 w-6"/>)}
    </div>
    <div className="flex flex-wrap gap-3 border-b border-border p-2 text-xs">
      {([{label:t("sb3.size"),value:size,min:.1,max:128,step:.1,set:setSize},{label:t("sb8.opacity"),value:opacity,min:.05,max:1,step:.05,set:setOpacity},{label:t("sb8.smoothing"),value:smoothing,min:0,max:1,step:.05,set:setSmoothing},{label:t("sb8.pressure"),value:curve,min:.1,max:4,step:.1,set:setCurve},{label:t("sb8.onion-opacity"),value:onionOpacity,min:0,max:1,step:.05,set:setOnionOpacity}]).map(c=><label key={c.label} className="flex items-center gap-1">{c.label}<input type="range" min={c.min} max={c.max} step={c.step} value={c.value} onChange={e=>c.set(Number(e.target.value))} className="w-20"/></label>)}
      <label><input type="checkbox" checked={onion} onChange={e=>setOnion(e.target.checked)}/>{t("sb8.onion")}</label><label><input type="checkbox" checked={light} onChange={e=>setLight(e.target.checked)}/>{t("sb8.light")}</label>
      {tool==="erase"?<label><input type="checkbox" checked={eraseMode==="stroke"} onChange={e=>setEraseMode(e.target.checked?"stroke":"area")}/>{t("sb8.stroke-eraser")}</label>:null}
      <Button size="sm" variant="ghost" disabled={disabled} onClick={()=>save({...spec,role:spec.role==="rough"?"clean":"rough"})}><Layers/>{spec.role==="rough"?t("sb8.rough"):t("sb8.clean")}</Button>
    </div>
    {error?<p role="alert" className="text-status-danger">{error}</p>:null}
    <div ref={host} className="relative min-h-80 flex-1 overflow-hidden touch-none" data-testid="sb8-canvas-host">
      <div className="absolute inset-0 flex items-center justify-center" style={{transform:`translate(${view.x}px,${view.y}px) rotate(${view.rotation}deg) scale(${view.zoom}) scaleX(${view.flip?-1:1})`}}>
        <div className="relative max-h-[90%] max-w-[90%]" style={{aspectRatio:`${width}/${height}`,width:"90%"}}>
          <canvas ref={layers} width={width} height={height} className="pointer-events-none absolute inset-0 size-full"/>
          <canvas ref={canvas} width={width} height={height} className="relative block size-full touch-none" aria-label={t("sb8.canvas")} data-testid="sb8-canvas" onPointerDown={start} onPointerMove={move} onPointerUp={e=>finish(e)} onPointerCancel={e=>finish(e,true)} onContextMenu={e=>e.preventDefault()}/>
        </div>
      </div>
    </div>
  </div>;
}