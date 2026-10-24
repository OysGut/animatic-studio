/** SB-8 compact delta-coded pen samples; portable and immutable. */
export const MAX_SKETCH_BYTES = 524288;
export const MAX_SKETCH_POINTS = 8192;
export const MAX_SKETCH_STROKES = 1024;
export type SketchTool = "pencil" | "brush" | "erase" | "fill" | "line" | "rect" | "ellipse";
export interface PenSample { readonly x:number; readonly y:number; readonly pressure:number; readonly tiltX:number; readonly tiltY:number; readonly time:number }
export interface SketchStroke { readonly id:string; readonly tool:SketchTool; readonly color:string; readonly size:number; readonly opacity:number; readonly curve:number; readonly smoothing:number; readonly points:readonly (readonly number[])[] }
export interface SketchSpec { readonly version:1; readonly role:"rough"|"clean"; readonly strokes:readonly SketchStroke[] }
export function packSamples(samples:readonly PenSample[]): readonly (readonly number[])[] {
  let x=0,y=0,time=0;
  return samples.map(p=>{const nx=Math.round(p.x*10),ny=Math.round(p.y*10),nt=Math.round(p.time);const row=[nx-x,ny-y,Math.round(p.pressure*1000),Math.round(p.tiltX),Math.round(p.tiltY),nt-time];x=nx;y=ny;time=nt;return row;});
}
export function unpackSamples(points:readonly (readonly number[])[]):PenSample[] {
  let x=0,y=0,time=0;
  return points.map(p=>{x+=p[0]??0;y+=p[1]??0;time+=p[5]??0;return{x:x/10,y:y/10,pressure:(p[2]??0)/1000,tiltX:p[3]??0,tiltY:p[4]??0,time};});
}
export function sketchValid(value:unknown):value is SketchSpec {
  if(!value||typeof value!=="object")return false;const s=value as SketchSpec;
  if(s.version!==1||!["rough","clean"].includes(s.role)||!Array.isArray(s.strokes)||s.strokes.length>MAX_SKETCH_STROKES||JSON.stringify(s).length>MAX_SKETCH_BYTES)return false;
  const ids=new Set<string>();
  return s.strokes.every(st=>{
    if(!st||typeof st.id!=="string"||!st.id||st.id.length>64||ids.has(st.id))return false;ids.add(st.id);
    if(!["pencil","brush","erase","fill","line","rect","ellipse"].includes(st.tool)||!/^#[0-9a-f]{6}$/i.test(st.color)||!Number.isFinite(st.size)||st.size<.1||st.size>512||!Number.isFinite(st.opacity)||st.opacity<0||st.opacity>1||!Number.isFinite(st.curve)||st.curve<.1||st.curve>4||!Number.isFinite(st.smoothing)||st.smoothing<0||st.smoothing>1||!Array.isArray(st.points)||!st.points.length||st.points.length>MAX_SKETCH_POINTS)return false;
    let x=0,y=0;return st.points.every((p:readonly number[])=>{if(!Array.isArray(p)||p.length!==6||!p.every(Number.isSafeInteger))return false;x+=p[0]??0;y+=p[1]??0;return Math.abs(x)<=163840&&Math.abs(y)<=163840&&(p[2]??-1)>=0&&(p[2]??1001)<=1000&&Math.abs(p[3]??91)<=90&&Math.abs(p[4]??91)<=90&&(p[5]??-1)>=0&&(p[5]??600001)<=600000;});
  });
}
export function appendStroke(spec:SketchSpec,stroke:SketchStroke):SketchSpec|null {const next={...spec,strokes:[...spec.strokes,stroke]};return sketchValid(next)?next:null;}
export function onionPanels<T extends{id:string}>(panels:readonly T[],id:string):{previous:T|null;next:T|null}{const i=panels.findIndex(p=>p.id===id);return i<0?{previous:null,next:null}:{previous:panels[i-1]??null,next:panels[i+1]??null};}
export function sampleSpeed(a:PenSample,b:PenSample):number{return Math.hypot(b.x-a.x,b.y-a.y)/Math.max(1,b.time-a.time);}