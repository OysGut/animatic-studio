import { useEffect, useMemo, useRef, useState } from 'react';
import { calibrationStatus, layerVersion, newId, physicalLayerSizeMm, plateDistanceMm, versionImagePath, type ProjectState, type CompositionLayer, type MultiplaneRigSpec, type Command } from '@/core';
import { createMarkerHistory, editMarkers, undoMarkers, redoMarkers, markerValue, markerError, screenToFigureMm, snapToContour, type Marker, type MeasurePoint, type MeasureLine } from '@/core/print/measure';
import type { ContourResult } from '@/core/print/contour';
import { t } from '@/core/i18n/keyed';
import { useLanguage } from '@/app/i18n/language';
import { useImageUrls } from '@/app/library/asset-images';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ContourClient } from './contour-client';
import { formatLength, useRigUnits } from './units';
import { PrintPanel } from './PrintPanel';

type Tool = 'point' | 'line' | 'distance' | 'angle' | 'ratio';
const tools: readonly Tool[] = ['point','line','distance','angle','ratio'];
function pointsOf(m: Marker): readonly MeasurePoint[] {
  switch (m.kind) {
    case 'point': return [m.point];
    case 'line': case 'distance': return [m.line.a, m.line.b];
    case 'ratio': return m.distances.flatMap(l => [l.a, l.b]);
    case 'angle': return 'points' in m ? [...m.points] : m.lines.flatMap(l => [l.a, l.b]);
  }
}
function linesOf(m: Marker): readonly MeasureLine[] {
  switch (m.kind) {
    case 'point': return [];
    case 'line': case 'distance': return [m.line];
    case 'ratio': return m.distances;
    case 'angle': return 'points' in m ? [{ a: m.points[1], b: m.points[0] }, { a: m.points[1], b: m.points[2] }] : m.lines;
  }
}
function mapPoints(m: Marker, f: (p: MeasurePoint, i: number) => MeasurePoint): Marker {
  let i=0; const p=(v:MeasurePoint)=>f(v,i++);
  if (m.kind==='point') return {...m,point:p(m.point)};
  if (m.kind==='distance'||m.kind==='line') return {...m,line:{a:p(m.line.a),b:p(m.line.b)}};
  if(m.kind==='ratio') return {...m,distances:m.distances.map(l=>({a:p(l.a),b:p(l.b)})) as unknown as typeof m.distances};
  if(m.kind==='angle') return 'points' in m
    ? {...m,points:m.points.map(p) as unknown as typeof m.points}
    : {...m,lines:m.lines.map(l=>({a:p(l.a),b:p(l.b)})) as unknown as typeof m.lines};
  return m;
}
export function InspectionWindow({state,layer,spec,frame=0,onClose,onSave,editable=true}:{state:ProjectState;layer:CompositionLayer;spec:MultiplaneRigSpec;frame?:number;onClose:()=>void;onSave:(c:Command,label:string)=>string|null;editable?:boolean}) {
  useLanguage();
  const [unit,setUnit]=useRigUnits();
  const [history,setHistory]=useState(()=>createMarkerHistory());
  const [selected,setSelected]=useState<string|null>(null);
  const [tool,setTool]=useState<Tool>('distance');
  const [pending,setPending]=useState<MeasurePoint[]>([]);
  const [mode,setMode]=useState('line');
  const [name,setName]=useState('');
  const [error,setError]=useState<string|null>(null);
  const [zoom,setZoom]=useState(3);
  const [pan,setPan]=useState({x:40,y:40});
  const [pxMm,setPxMm]=useState(96/25.4);
  const [contour,setContour]=useState<ContourResult|null>(null);
  const [pixels,setPixels]=useState<{width:number;height:number}|null>(null);
  const svg=useRef<SVGSVGElement>(null);
  const space=useRef(false);
  const gesture=useRef<{x:number;y:number;pan:MeasurePoint; marker?:Marker|undefined; index?:number|undefined; start:MeasurePoint}|null>(null);
  const [draft,setDraft]=useState<Marker|null>(null);
  const client=useMemo(()=>new ContourClient(),[]);
  const version=layerVersion(state,layer,frame);
  // B-105a: proxy under 100 % zoom, originalen over 100 % (begge lenkene signeres; originalen lastes først ved bruk)
  const playbackPath=version?versionImagePath(version,'playback'):null;
  const images=useImageUrls(version?[...new Set([playbackPath,version.mediaPath] as string[])]:[]);
  const chosenPath=version?(zoom>1?version.mediaPath:playbackPath):null;
  const url=chosenPath?images.data?.[chosenPath]:null;
  const composition=state.compositions[layer.compositionId];
  const size=composition&&physicalLayerSizeMm(spec,layer,composition,frame);
  const w=size?.widthMm??1,h=size?.heightMm??1;
  const signature=JSON.stringify({layer,frame,size,version:version?.id,layers:state.layers});
  useEffect(()=>{
    let active=true; const abort=new AbortController(); setContour(null);setPixels(null);
    if(url&&size) void(async()=>{
      const response=await fetch(url,{signal:abort.signal});if(!response.ok)throw new Error();
      const bitmap=await createImageBitmap(await response.blob());
      const {width,height}=bitmap;let rgba:ArrayBuffer;
      try {const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw new Error();ctx.drawImage(bitmap,0,0);rgba=ctx.getImageData(0,0,width,height).data.buffer as ArrayBuffer;}finally{bitmap.close();}
      if(!active)return;setPixels({width,height});
      const result=await client.compute(signature,{rgba,width,height,layer,frame,layers:Object.values(state.layers).filter(l=>l.compositionId===layer.compositionId).map(layer=>({layer})),suggestionEnabled:true,cutHoles:true,strokeWidthMm:.1,mmPerPixel:w/width});
      if(active)setContour(result);
    })().catch(()=>{if(active)setError(t('app-rig.contour.failed'));});
    return()=>{active=false;abort.abort();client.cancel();};
  },[url,signature,client]);
  const fit=()=>{const r=svg.current?.getBoundingClientRect();if(r){const z=Math.max(.01,Math.min((r.width-80)/w,(r.height-80)/h));setZoom(z);setPan({x:(r.width-w*z)/2,y:(r.height-h*z)/2});}};
  useEffect(()=>{fit();},[w,h]);
  useEffect(()=>{const el=svg.current;if(!el)return;const wheel=(e:WheelEvent)=>{e.preventDefault();const r=el.getBoundingClientRect();if(!e.ctrlKey&&Math.abs(e.deltaX)>0){setPan(p=>({x:p.x-e.deltaX,y:p.y-e.deltaY}));return;}const factor=Math.exp(-e.deltaY*(e.deltaMode===1?.03:.0015));setZoom(z=>{const next=Math.max(.05,Math.min(200,z*factor));setPan(p=>({x:e.clientX-r.left-(e.clientX-r.left-p.x)*next/z,y:e.clientY-r.top-(e.clientY-r.top-p.y)*next/z}));return next;});};el.addEventListener('wheel',wheel,{passive:false});return()=>el.removeEventListener('wheel',wheel);},[]);
  const eventPoint=(e:{clientX:number;clientY:number;altKey:boolean})=>{const r=svg.current!.getBoundingClientRect();const p=screenToFigureMm({x:e.clientX-r.left,y:e.clientY-r.top},zoom,pan);return e.altKey?p:snapToContour(p,contour?.paths??[],7/zoom);};
  const label=(m:Marker)=>{try{const v=markerValue(m);if(typeof v==='number')return m.kind==='angle'?`${v.toFixed(1)}°`:formatLength(v,unit);if('decimal' in v)return `${v.decimal.toFixed(3)} (${v.percent.toFixed(1)}%)`;return `${formatLength(v.x,unit)}, ${formatLength(v.y,unit)}`;}catch{return t('app-inspect.invalid');}};
  const addPoint=(p:MeasurePoint)=>{const pts=[...pending,p];const required=tool==='point'?1:tool==='angle'||tool==='ratio'?4:2;if(pts.length<required){setPending(pts);return;}const id=newId();const line={a:pts[0]!,b:pts[1]!};const m:Marker=tool==='point'?{id,kind:'point',point:p}:tool==='angle'?{id,kind:'angle',lines:[line,{a:pts[2]!,b:pts[3]!}]}:tool==='ratio'?{id,kind:'ratio',distances:[line,{a:pts[2]!,b:pts[3]!}]}:{id,kind:tool,line};if(markerError(m)){setError(t('app-inspect.invalid'));setPending([]);return;}setHistory(s=>editMarkers(s,{type:'add',marker:m}));setSelected(id);setPending([]);};
  const markers=history.markers.map(m=>draft?.id===m.id?draft:m);
  const plate=spec.plates.find(p=>p.id===layer.rigPlateId);
  const dpi=pixels?Math.min(pixels.width/w,pixels.height/h)*25.4:null;
  return <Dialog open onOpenChange={open=>{if(!open)onClose();}}><DialogContent data-testid="inspect-window" className="flex max-h-[95vh] w-[95vw] max-w-none flex-col overflow-auto bg-surface-2 text-text-primary" onKeyDown={e=>{
    if(e.target instanceof HTMLInputElement||e.target instanceof HTMLSelectElement)return;
    if(e.code==='Space'){space.current=true;e.preventDefault();}
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.stopPropagation();setHistory(s=>e.shiftKey?redoMarkers(s):undoMarkers(s));}
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();e.stopPropagation();setHistory(redoMarkers);}
    if(selected&&e.key==='Delete'){e.preventDefault();e.stopPropagation();setHistory(s=>s.markers.some(m=>m.id===selected)?editMarkers(s,{type:'delete',id:selected}):s);setSelected(null);}
    if(selected&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();e.stopPropagation();const step=e.shiftKey?1:.1;setHistory(s=>{const m=s.markers.find(m=>m.id===selected);return m?editMarkers(s,{type:'move',marker:mapPoints(m,p=>({x:p.x+(e.key==='ArrowLeft'?-step:e.key==='ArrowRight'?step:0),y:p.y+(e.key==='ArrowUp'?-step:e.key==='ArrowDown'?step:0)}))}):s;});}
  }} onKeyUp={e=>{if(e.code==='Space')space.current=false;}}>
    <DialogTitle>{t('app-inspect.open')}</DialogTitle><DialogDescription>{t('app-inspect.help')}</DialogDescription>
    <div className="flex flex-wrap items-center gap-2">
      <Button data-testid="inspect-close" onClick={onClose}>{t('app-inspect.close')}</Button>
      <Button data-testid="inspect-zoom-in" aria-label={t('app-inspect.zoomIn')} onClick={()=>setZoom(z=>Math.min(200,z*1.2))}>+</Button>
      <Button data-testid="inspect-zoom-out" aria-label={t('app-inspect.zoomOut')} onClick={()=>setZoom(z=>Math.max(.05,z/1.2))}>−</Button>
      <Button data-testid="inspect-zoom-fit" onClick={fit}>{t('app-inspect.fit')}</Button>
      <Button data-testid="inspect-zoom-physical" onClick={()=>setZoom(pxMm)}>{t('app-inspect.physical')}</Button>
      <Button data-testid="inspect-unit-toggle" aria-label={t('app-inspect.units')} onClick={()=>setUnit(unit==='mm'?'in':'mm')}>{unit==='mm'?t('app-rig.unit-mm'):t('app-rig.unit-in')}</Button>
      <select data-testid="inspect-mode" aria-label={t('app-rig.contour.preview-aria')} value={mode} onChange={e=>setMode(e.target.value)} className="border border-border bg-surface-3 p-2"><option value="full">{t('app-rig.contour.mode-full')}</option><option value="line">{t('app-rig.contour.mode-line')}</option><option value="outline">{t('app-rig.contour.mode-outline')}</option></select>
    </div>
    <label className="text-xs">{t('app-inspect.ruler')}<input aria-label={t('app-inspect.ruler')} type="range" min={1} max={12} step={.01} value={pxMm} onChange={e=>setPxMm(Number(e.target.value))}/><span data-testid="inspect-screen-ruler" style={{width:50*pxMm}} className="block h-3 border-x border-b border-text-primary" /></label>
    <div className="flex flex-wrap gap-4 text-sm"><span data-testid="inspect-measure-width">{t('app-inspect.width')}: {formatLength(w,unit)}</span><span data-testid="inspect-measure-height">{t('app-inspect.height')}: {formatLength(h,unit)}</span><span data-testid="inspect-plate-level">{t('app-inspect.plate')}: {plate?`${formatLength(plate.heightMm,unit)} / ${formatLength(plateDistanceMm(spec,plate.id)??0,unit)}`:t('app-inspect.invalid')}</span><span data-testid="inspect-calibration-status">{calibrationStatus(spec)==='valid'?t('app-inspect.valid'):t('app-inspect.invalid')}</span></div>
    {mode!=='outline'&&dpi!==null&&dpi<150&&<p role="status" data-testid="inspect-dpi-warning">{t('app-inspect.dpi')} ({dpi.toFixed(0)})</p>}
    <div className="flex flex-wrap gap-2">{tools.map((kind)=><Button key={kind} data-testid={`inspect-tool-${kind}`} aria-pressed={tool===kind} onClick={()=>{setTool(kind);setPending([]);}}>{({point:t('app-inspect.point'),line:t('app-inspect.line'),distance:t('app-inspect.distance'),angle:t('app-inspect.angle'),ratio:t('app-inspect.ratio')} as Record<Tool,string>)[kind]}</Button>)}<Button disabled={!history.undoStack.length} onClick={()=>setHistory(undoMarkers)}>{t('app-inspect.undo')}</Button><Button disabled={!history.redoStack.length} onClick={()=>setHistory(redoMarkers)}>{t('app-inspect.redo')}</Button></div>
    <svg ref={svg} className="h-[45vh] min-h-64 w-full touch-none border border-border bg-surface-1" aria-label={t('app-rig.contour.preview-aria')} onPointerDown={e=>{
      if(space.current||e.pointerType==='touch'||e.button===1){e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);gesture.current={x:e.clientX,y:e.clientY,pan,start:eventPoint(e)};return;}
      if(e.button===0)addPoint(eventPoint(e));
    }} onPointerMove={e=>{const g=gesture.current;if(!g)return;if(!g.marker){setPan({x:g.pan.x+e.clientX-g.x,y:g.pan.y+e.clientY-g.y});return;}const point=eventPoint(e);const moved=mapPoints(g.marker,(p,i)=>g.index===undefined?{x:p.x+point.x-g.start.x,y:p.y+point.y-g.start.y}:i===g.index?point:p);setDraft(moved);}} onPointerUp={()=>{if(draft&&!markerError(draft))setHistory(s=>editMarkers(s,{type:'move',marker:draft}));setDraft(null);gesture.current=null;}} onPointerCancel={()=>{setDraft(null);gesture.current=null;}}>
      <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
        {mode!=='outline'&&url&&<image href={url} width={w} height={h} preserveAspectRatio="none"/>}
        <rect data-testid="inspect-bounds" width={w} height={h} className="fill-none stroke-border" strokeWidth={1/zoom}/>
        {mode!=='full'&&contour?.paths.map((p,i)=><path key={i} d={p.points.map((q,j)=>`${j?'L':'M'}${q.x},${q.y}`).join(' ')+'Z'} className="fill-none stroke-text-primary" strokeWidth={1/zoom}/>)}
        {pending.map((p,i)=><circle key={i} cx={p.x} cy={p.y} r={4/zoom} className="fill-text-primary"/>)}
        {markers.map(m=>{const pts=pointsOf(m);const lines=linesOf(m);const startDrag=(e:React.PointerEvent<SVGElement>,index?:number)=>{if(space.current)return;e.stopPropagation();e.currentTarget.setPointerCapture(e.pointerId);setSelected(m.id);gesture.current={x:e.clientX,y:e.clientY,pan,marker:m,index,start:eventPoint(e)};};return <g key={m.id} tabIndex={0} role="button" aria-label={label(m)} onFocus={()=>setSelected(m.id)} onPointerDown={e=>startDrag(e)} className="cursor-move text-text-primary focus:outline-none">
          {lines.map((l,i)=><line key={i} x1={l.a.x} y1={l.a.y} x2={l.b.x} y2={l.b.y} className={selected===m.id?'stroke-text-primary':'stroke-text-secondary'} strokeWidth={3/zoom}/>)}
          {m.kind==='angle'&&lines.length===2&&(()=>{const a=lines[0]!,b=lines[1]!;const r=18/zoom;const angle1=Math.atan2(a.b.y-a.a.y,a.b.x-a.a.x),angle2=Math.atan2(b.b.y-b.a.y,b.b.x-b.a.x);return <path d={`M ${a.a.x+r*Math.cos(angle1)} ${a.a.y+r*Math.sin(angle1)} A ${r} ${r} 0 0 ${Math.sin(angle2-angle1)>=0?1:0} ${a.a.x+r*Math.cos(angle2)} ${a.a.y+r*Math.sin(angle2)}`} className="fill-none stroke-text-primary" strokeWidth={1/zoom}/>;})()}
          {pts.map((p,i)=><circle key={i} cx={p.x} cy={p.y} r={5/zoom} className="fill-surface-2 stroke-text-primary" strokeWidth={2/zoom} onPointerDown={e=>startDrag(e,i)}/>)}
          <text x={pts[0]!.x+8/zoom} y={pts[0]!.y-8/zoom} fontSize={12/zoom} className="fill-text-primary">{label(m)}</text>
        </g>;})}
      </g>
    </svg>
    <div data-testid="inspect-marker-list" aria-label={t('app-inspect.markers')} className="flex flex-wrap gap-2">{markers.map(m=><div key={m.id} className="flex gap-1"><button onClick={()=>setSelected(m.id)} className="rounded border border-border p-1" aria-pressed={selected===m.id}>{label(m)}</button><button aria-label={t('app-inspect.delete')} onClick={()=>{setHistory(s=>editMarkers(s,{type:'delete',id:m.id}));setSelected(null);}}>×</button></div>)}</div>
    <PrintPanel state={state} layer={layer} spec={spec} frame={frame} contour={contour} url={url} mode={mode} width={w} height={h} pixels={pixels} unit={unit}/>
    {error&&<p role="alert">{error}</p>}
    <div className="flex gap-2"><input aria-label={t('app-inspect.name')} placeholder={t('app-inspect.name')} value={name} maxLength={80} onChange={e=>setName(e.target.value)} className="rounded border border-border bg-surface-3 p-2"/><Button data-testid="inspect-save-set" disabled={!editable||!name.trim()} onClick={()=>{const result=onSave({type:'SaveMeasureSet',set:{id:newId(),name:name.trim(),layerId:layer.id,frame,markers:history.markers,createdAt:new Date().toISOString()}},t('app-inspect.save'));if(result)setError(result);else onClose();}}>{t('app-inspect.save')}</Button><Button data-testid="inspect-discard" onClick={onClose}>{t('app-inspect.discard')}</Button></div>
  </DialogContent></Dialog>;
}
