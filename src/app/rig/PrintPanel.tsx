import { useMemo, useState } from 'react';
import { cameraAt, transformAt, sceneNumberOf, type ProjectState, type CompositionLayer, type MultiplaneRigSpec } from '@/core';
import { planPrint, type InfoField, type PrintItem, type PrintInput } from '@/core/print/pdf';
import { renderPdf } from '@/engine/export/rig-pdf';
import type { ContourResult } from '@/core/print/contour';
import { t } from '@/core/i18n/keyed';
import { useUiPref } from '@/app/account/ui-prefs';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/app/i18n/language';
import { PrintAnnotations } from './PrintAnnotations';
import { PrintJobSection } from './PrintJobSection';
import type { Command } from '@/core';

const validFields = (v: unknown): v is Record<string, boolean> => !!v && typeof v === 'object' && Object.values(v).every(x => typeof x === 'boolean');
type Paper = 'A4' | 'A3' | 'A5' | 'Letter' | 'Legal' | 'custom';
export function PrintPanel({ state, layer, spec, frame, contour, url, mode, width, height, pixels, unit, onSave, editable = true }: {
  state: ProjectState; layer: CompositionLayer; spec: MultiplaneRigSpec; frame: number; contour: ContourResult | null;
  url: string | undefined | null; mode: string; width: number; height: number; pixels: {width:number;height:number}|null; unit:'mm'|'in';
  /** Rigg R5: utskriftsjobber lagres som kommandoer. */
  onSave?: (c: Command, label: string) => string | null; editable?: boolean;
}) {
  const lang = useLanguage();
  const [fields, setFields] = useUiPref<Record<string, boolean>>('rigPrintFields', {}, validFields);
  const [paper,setPaper]=useState<Paper>('A4');
  const [orientation,setOrientation]=useState<'portrait'|'landscape'>('portrait');
  const [custom,setCustom]=useState({width:210,height:297});
  const [margins,setMargins]=useState({top:10,right:10,bottom:10,left:10});
  const [calibrate,setCalibrate]=useState(false), [length,setLength]=useState(100);
  const [reference,setReference]=useState(false), [sets,setSets]=useState<Record<string,boolean>>({});
  const [cutHoles,setCutHoles]=useState(true), [stroke,setStroke]=useState(.1);
  const [busy,setBusy]=useState(false), [error,setError]=useState(false);
  const comp=state.compositions[layer.compositionId], variant=comp&&state.variants[comp.variantId];
  const occurrence=Object.values(state.occurrences).find(o=>o.active&&o.variantId===variant?.id);
  const production=occurrence&&state.productions[occurrence.productionId];
  const asset=layer.assetId&&state.assets[layer.assetId];
  const plate=spec.plates.find(p=>p.id===layer.rigPlateId);
  const fps=production?.fps??state.project.fps;
  const rate=fps.num/fps.den, seconds=Math.floor(frame/rate), remaining=Math.round(frame-seconds*rate);
  const fieldNames={film:t('app-print.film'),scene:t('app-print.scene'),asset:t('app-print.asset'),time:t('app-print.time'),plate:t('app-print.plate'),size:t('app-print.size'),date:t('app-print.date')};
  const options:InfoField[]=[
    {key:'film',value:[state.project.name,production?.name].filter(Boolean).join(' / '),enabled:true},
    {key:'scene',value:[occurrence?sceneNumberOf(state,occurrence):'',variant?.heading.location].filter(Boolean).join(' · '),enabled:true},
    {key:'asset',value:asset&&asset.name!==layer.name?`${asset.name} / ${layer.name}`:layer.name,enabled:true},
    {key:'time',value:t('app-print.frame',{seconds,frames:remaining,absolute:frame}),enabled:true},
    {key:'plate',value:plate?`${plate.name} · ${plate.heightMm} mm`:'',enabled:true},
    {key:'size',value:`${width.toFixed(1)} × ${height.toFixed(1)} mm`,enabled:true},
    {key:'date',value:new Date().toLocaleDateString(lang),enabled:true},
  ];
  // Manusmerknader må ha en eksplisitt ressurskobling (oppgaven) eller tekstkobling
  // til en blokk som nevner ressursen. Generelle scenenotater er ikke figurnotater.
  const tasks=asset?asset.scenePlans??[]:[];
  for(const note of Object.values(state.annotations)) {
    const block=note.blockId?state.blocks[note.blockId]:undefined;
    const inScene=note.variantId===variant?.id||block?.variantId===variant?.id;
    const related=(note.taskId&&tasks.some(task=>task.taskId===note.taskId)) || (asset&&block?.text.toLocaleLowerCase().includes(asset.name.toLocaleLowerCase()));
    if(!note.removed&&inScene&&related) options.push({key:`note-${note.id}`,value:note.text,enabled:true,sceneId:variant?.sceneId??''});
  }
  for(const flag of Object.values(state.noteFlags)) {
    const block=Object.values(state.blocks).find(b=>b.id===state.audioClips[flag.targetId]?.blockId);
    if(!flag.removed&&flag.enabled&&block&&block.variantId===variant?.id&&asset&&block.text.toLocaleLowerCase().includes(asset.name.toLocaleLowerCase())) options.push({key:`flag-${flag.id}`,value:flag.text,enabled:true,sceneId:variant?.sceneId??''});
  }
  const savedSets=Object.values(state.measureSets??{}).filter(s=>!s.removed&&s.layerId===layer.id&&s.frame===frame);
  const printMode:PrintItem['mode']=mode==='outline'?'contour':mode==='full'?'figure':'figure-cut';
  const item:PrintItem={id:layer.id,sceneId:variant?.sceneId??'',size:{width,height},contour:contour??{source:'rectangle',widthMm:width,heightMm:height,pointCount:0,paths:[]},mode:printMode,
    fields:options.map(f=>({...f,enabled:fields[f.key]!==false})),upArrow:fields['arrow']!==false,reserveQr:fields['qr']!==false,
    rotationDeg:comp?transformAt(layer,frame).rotation-cameraAt(comp,frame).rotation:0,
    cutHoles,strokeWidthMm:stroke,measureSets:savedSets.filter(s=>sets[s.id]),
    ...(printMode!=='contour'?{image:{data:'preview',format:'PNG' as const,widthPx:pixels?.width??1,heightPx:pixels?.height??1}}:{})};
  const input:PrintInput={items:[item],paper:paper==='custom'?custom:paper,orientation,margins,technicalReference:reference,language:lang,...(calibrate?{calibration:{unit,length}}:{})};
  const planned=useMemo(()=>{try{return {plan:planPrint(input),failed:false};}catch{return {plan:null,failed:true};}},[JSON.stringify(input)]);
  const plan=planned.plan;
  const enabled=(key:string)=>fields[key]!==false;
  const toggle=(key:string,value:boolean)=>setFields({...fields,[key]:value});
  const loadImage=async():Promise<NonNullable<PrintItem['image']>>=>{
    if(!url)throw new Error();
    const response=await fetch(url);if(!response.ok)throw new Error();
    const blob=await response.blob();
    // WebP is losslessly decoded to PNG at exactly the original pixel dimensions.
    let data:Uint8Array, format:'PNG'|'JPEG';
    if(blob.type==='image/png'||blob.type==='image/jpeg'){data=new Uint8Array(await blob.arrayBuffer());format=blob.type==='image/png'?'PNG':'JPEG';}
    else {const bitmap=await createImageBitmap(blob);try{const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;const ctx=canvas.getContext('2d');if(!ctx)throw new Error();ctx.drawImage(bitmap,0,0);const png=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error()),'image/png'));data=new Uint8Array(await png.arrayBuffer());format='PNG';}finally{bitmap.close();}}
    return {data,format,widthPx:pixels?.width??1,heightPx:pixels?.height??1};
  };
  const create=async()=>{
    if(!contour||!plan)return;
    setBusy(true);setError(false);
    try {
      let printable=item;
      if(printMode!=='contour') printable={...item,image:await loadImage()};
      renderPdf(planPrint({...input,items:[printable]})).save(`${layer.name.replace(/[^\p{L}\p{N}_-]/gu,'_')}-${frame}.pdf`);
    }catch{setError(true);}finally{setBusy(false);}
  };
  const marginLabels={top:t('app-print.top'),right:t('app-print.right'),bottom:t('app-print.bottom'),left:t('app-print.left')};
  return <section data-testid="inspect-pdf-frame-slot" className="border-t border-border py-3 text-xs text-text-secondary">
    <h3 className="mb-2 font-semibold text-text-primary">{t('app-print.title')}</h3>
    <div className="flex flex-wrap gap-3">
      <label>{t('app-print.paper')}<select data-testid="print-paper" value={paper} onChange={e=>setPaper(e.target.value as Paper)} className="block border border-border bg-surface-3 p-1">{(['A4','A3','A5','Letter','Legal','custom'] as const).map(p=><option key={p} value={p}>{p==='custom'?t('app-print.custom'):p}</option>)}</select></label>
      <label>{t('app-print.orientation')}<select data-testid="print-orientation" value={orientation} onChange={e=>setOrientation(e.target.value as 'portrait'|'landscape')} className="block border border-border bg-surface-3 p-1"><option value="portrait">{t('app-print.portrait')}</option><option value="landscape">{t('app-print.landscape')}</option></select></label>
      {paper==='custom'&&(['width','height'] as const).map(k=><label key={k}>{k==='width'?t('app-print.width'):t('app-print.height')}<input data-testid={`print-custom-${k}`} type="number" min={50} value={custom[k]} onChange={e=>setCustom({...custom,[k]:Number(e.target.value)})} className="block w-24 border border-border bg-surface-3 p-1"/></label>)}
      {(['top','right','bottom','left'] as const).map(k=><label key={k}>{marginLabels[k]}<input data-testid={`print-margin-${k}`} type="number" min={0} value={margins[k]} onChange={e=>setMargins({...margins,[k]:Number(e.target.value)})} className="block w-24 border border-border bg-surface-3 p-1"/></label>)}
    </div>
    <div className="my-3 flex flex-wrap items-center gap-3"><label><input data-testid="print-calibration" type="checkbox" checked={calibrate} onChange={e=>{setCalibrate(e.target.checked);setLength(unit==='in'?4:100);}}/> {t('app-print.calibration')}</label>{calibrate&&<label>{t('app-print.length')} ({unit}) <input data-testid="print-ruler-length" type="number" min={unit==='in'?.125:1} step={unit==='in'?.125:1} value={length} onChange={e=>setLength(Number(e.target.value))} className="w-24 border border-border bg-surface-3 p-1"/></label>}<label><input data-testid="print-reference" type="checkbox" checked={reference} onChange={e=>setReference(e.target.checked)}/> {t('app-print.reference')}</label></div>
    {reference&&(savedSets.length?savedSets.map(s=><label key={s.id} className="mr-3"><input data-testid={`print-measure-set-${s.id}`} type="checkbox" checked={!!sets[s.id]} onChange={e=>setSets({...sets,[s.id]:e.target.checked})}/> {s.name}</label>):<p>{t('app-print.empty')}</p>)}
    <fieldset data-testid="print-fields" className="my-3"><legend>{t('app-print.fields')}</legend><div className="grid gap-1 md:grid-cols-2">{options.map(f=><label key={f.key} className="flex min-w-0 items-start gap-2"><input data-testid={`print-field-${f.key}`} type="checkbox" checked={enabled(f.key)} onChange={e=>toggle(f.key,e.target.checked)}/><span className="break-words">{fieldNames[f.key as keyof typeof fieldNames]??f.value}{f.key in fieldNames?`: ${f.value}`:''}</span></label>)}{(['arrow','qr'] as const).map(k=><label key={k}><input data-testid={`print-field-${k}`} type="checkbox" checked={enabled(k)} onChange={e=>toggle(k,e.target.checked)}/> {k==='arrow'?t('app-print.arrow'):t('app-print.qr')}</label>)}</div></fieldset>
    <div className="mb-2 flex gap-3"><label><input data-testid="print-cut-holes" type="checkbox" checked={cutHoles} onChange={e=>setCutHoles(e.target.checked)}/> {t('app-rig.contour.cut-holes')}</label><label>{t('app-rig.contour.stroke-width')}<input data-testid="print-stroke" type="number" min={.05} max={.3} step={.01} value={stroke} onChange={e=>setStroke(Number(e.target.value))} className="ml-2 w-20 border border-border bg-surface-3 p-1"/></label></div>
    <p role="status" className="mb-2">{t('app-print.warning')}</p>
    {plan&&<><p data-testid="print-page-count">{t('app-print.pages',{count:plan.sheets.length})}</p><div data-testid="print-preview" className="my-2 flex flex-wrap gap-3">{plan.sheets.map((sheet,i)=><svg key={i} viewBox={`0 0 ${plan.width} ${plan.height}`} className="h-80 max-w-full border border-border bg-surface-3" aria-label={`${t('app-print.paper')} ${i+1}`}>
      <rect x={0} y={0} width={plan.width} height={plan.height} className="fill-surface-1 stroke-text-primary" strokeWidth={.5}/><rect {...plan.content} className="fill-none stroke-text-tertiary" strokeDasharray="2 2" strokeWidth={.3}/>
      {sheet.overview&&plan.sheets.flatMap(s=>s.placements).filter(p=>p.item.id===sheet.overview?.itemId).map((p,j)=><rect key={j} x={10+p.source.x*.2} y={10+p.source.y*.2} width={p.source.width*.2} height={p.source.height*.2} className="fill-none stroke-text-secondary"/>)}
      {sheet.placements.map((p,j)=>{const clip=`print-${i}-${j}`;return <g key={j}><defs><clipPath id={clip}><rect {...p.rect}/></clipPath><clipPath id={`${clip}-contour`}><path d={p.item.contour.paths.map(path=>path.points.map((q,n)=>`${n?'L':'M'}${p.rect.x-p.source.x+q.x} ${p.rect.y-p.source.y+q.y}`).join(' ')+'Z').join(' ')} clipRule="evenodd"/></clipPath></defs><g clipPath={`url(#${clip})`}><g clipPath={`url(#${clip}-contour)`}>{printMode!=='contour'&&url&&<image href={url} x={p.rect.x-p.source.x} y={p.rect.y-p.source.y} width={width} height={height} preserveAspectRatio="none"/>}</g>{printMode!=='figure'&&p.item.contour.paths.filter(path=>cutHoles||!path.isHole).map((path,n)=><path key={n} d={path.points.map((q,k)=>`${k?'L':'M'}${p.rect.x-p.source.x+q.x} ${p.rect.y-p.source.y+q.y}`).join(' ')+'Z'} className="fill-none stroke-text-primary" strokeWidth={stroke}/>)}</g>{p.info.lines.map((text,n)=><text key={n} x={p.info.rect.x} y={p.info.rect.y+n*4} fontSize={2.8} className="fill-text-primary">{text}</text>)}<PrintAnnotations placement={p}/>{p.registration.map((q,n)=><path key={n} d={`M${q.x-2} ${q.y}h4 M${q.x} ${q.y-2}v4`} className="stroke-text-primary" strokeWidth={.1}/>)}{p.rows*p.columns>1&&<text x={p.rect.x} y={plan.height-12} fontSize={3} className="fill-text-primary">{t('print-pdf.tile',{row:p.row+1,column:p.column+1})}</text>}</g>;})}
      {plan.calibration&&<g>{plan.calibration.ticks.map((tick,j)=><g key={j}><line x1={plan.content.x+tick.mm} x2={plan.content.x+tick.mm} y1={plan.height-24} y2={plan.height-24-(tick.major?4:2)} className="stroke-text-primary" strokeWidth={.1}/>{tick.label&&<text x={plan.content.x+tick.mm} y={plan.height-20} fontSize={2.8} className="fill-text-primary">{tick.label}</text>}</g>)}</g>}
    </svg>)}</div></>}
    {(error||planned.failed)&&<p role="alert">{t('app-print.failure')}</p>}
    <Button data-testid="print-create-pdf" disabled={busy||!contour||!plan||(printMode!=='contour'&&!pixels)} onClick={()=>void create()}>{busy?t('app-print.busy'):t('app-print.create')}</Button>
    {onSave&&contour&&<PrintJobSection state={state} layer={layer} frame={frame} baseItem={item} input={{paper:input.paper??'A4',orientation,margins,technicalReference:false,language:lang,...(calibrate?{calibration:{unit,length}}:{})}} loadImage={loadImage} onSave={onSave} editable={editable} sceneLabel={options.find(f=>f.key==='scene')?.value||layer.name}/>}
  </section>;
}