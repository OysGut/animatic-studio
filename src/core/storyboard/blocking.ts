/** SB-9: compact panel-local blocking; geometry is advisory and never moves production layers. */
import type { Composition, ProjectState, Transition } from "../model";
import { compareStory } from "../continuity";

export interface Point { readonly x: number; readonly y: number }
export interface BlockingCharacter extends Point { readonly id: string; readonly facing: number; readonly movement: number | null }
export interface BlockingCamera extends Point { readonly id: string; readonly heading: number; readonly focal: number; readonly sensor: number }
export interface BlockingPlan {
  readonly width: number; readonly height: number;
  readonly walls: readonly (readonly [number, number, number, number])[];
  readonly objects: readonly { readonly name: string; readonly x: number; readonly y: number; readonly width: number; readonly height: number }[];
  readonly characters: readonly BlockingCharacter[];
  readonly cameras: readonly BlockingCamera[];
  readonly cameraId: string | null;
  readonly axis: readonly [string, string] | null;
  /** Key includes both panels and their geometry: changed blocking invalidates old approvals. */
  readonly approvals: Readonly<Record<string, string>>;
}
export const MAX_BLOCKING_BYTES = 10000;
export const EMPTY_BLOCKING: BlockingPlan = { width: 10, height: 8, walls: [[0,0,10,0],[10,0,10,8],[10,8,0,8],[0,8,0,0]], objects: [], characters: [], cameras: [], cameraId: null, axis: null, approvals: {} };
const finite = (v: number) => Number.isFinite(v) && Math.abs(v) <= 10000;
export function blockingValid(p: BlockingPlan): boolean {
  return !!p && typeof p === "object" && finite(p.width) && p.width > 0 && finite(p.height) && p.height > 0
    && Array.isArray(p.walls) && p.walls.length <= 100 && p.walls.every(w => Array.isArray(w) && w.length === 4 && w.every(finite))
    && Array.isArray(p.objects) && p.objects.length <= 50 && p.objects.every(o => typeof o.name === "string" && o.name.length <= 100 && [o.x,o.y,o.width,o.height].every(finite) && o.width > 0 && o.height > 0)
    && Array.isArray(p.characters) && p.characters.length <= 50 && p.characters.every(c => typeof c.id === "string" && c.id.length <= 100 && [c.x,c.y,c.facing].every(finite) && (c.movement === null || finite(c.movement)))
    && new Set(p.characters.map(c=>c.id)).size === p.characters.length
    && Array.isArray(p.cameras) && p.cameras.length <= 20 && p.cameras.every(c => typeof c.id === "string" && c.id.length <= 100 && [c.x,c.y,c.heading,c.focal,c.sensor].every(finite) && c.focal > 0 && c.sensor > 0)
    && new Set(p.cameras.map(c=>c.id)).size === p.cameras.length
    && (p.cameraId === null || p.cameras.some(c=>c.id === p.cameraId))
    && (p.axis === null || (Array.isArray(p.axis) && p.axis.length === 2 && p.axis[0] !== p.axis[1] && p.axis.every(id=>p.characters.some(c=>c.id===id))))
    && !!p.approvals && typeof p.approvals === "object" && !Array.isArray(p.approvals) && Object.keys(p.approvals).length <= 30 && Object.entries(p.approvals).every(([k,v])=>k.length<=2000 && typeof v === "string" && v.trim().length > 0 && v.length <= 500)
    && JSON.stringify(p).length <= MAX_BLOCKING_BYTES;
}
export function blockingOf(p: Composition): BlockingPlan | null {
  const plan = p.storyboard?.blocking; return plan && blockingValid(plan) ? plan : null;
}
/** Horizontal and vertical angles in degrees, for an explicit sensor width and panel aspect. */
export function fieldOfView(focal: number, sensor: number, aspect: number) {
  if (![focal,sensor,aspect].every(v=>Number.isFinite(v)&&v>0)) throw new RangeError("Invalid camera geometry");
  return { horizontal: 2*Math.atan(sensor/(2*focal))*180/Math.PI, vertical: 2*Math.atan(sensor/(aspect*2*focal))*180/Math.PI };
}
export function axisSide(a: Point,b: Point,camera: Point): -1|0|1 {
  const cross=(b.x-a.x)*(camera.y-a.y)-(b.y-a.y)*(camera.x-a.x);
  return Math.abs(cross)<1e-7 ? 0 : cross>0 ? 1 : -1;
}
export function screenDirection(angle: number, cameraHeading: number): -1|0|1 {
  const projection = Math.sin((angle-cameraHeading)*Math.PI/180);
  return Math.abs(projection)<1e-7 ? 0 : projection>0 ? 1 : -1;
}
export type BlockingIssue = { readonly kind: "axis"|"gaze"|"movement"; readonly panelId: string; readonly previousId: string; readonly characterId: string|null; readonly key: string };
export function blockingIssues(previous: Composition,current: Composition): BlockingIssue[] {
  const a=blockingOf(previous),b=blockingOf(current);
  const ca=a?.cameras.find(c=>c.id===a.cameraId),cb=b?.cameras.find(c=>c.id===b.cameraId);
  if(!a||!b||!ca||!cb)return [];
  const out:BlockingIssue[]=[];
  const add=(kind:BlockingIssue["kind"], characterId:string|null) => {
    const geometry=JSON.stringify([a.characters,ca,b.characters,cb,b.axis]);
    let hash=2166136261;for(let i=0;i<geometry.length;i++)hash=Math.imul(hash^geometry.charCodeAt(i),16777619);
    const key=[previous.id,current.id,kind,characterId??"",(hash>>>0).toString(16)].join("|");
    if(!b.approvals[key]?.trim())out.push({kind,panelId:current.id,previousId:previous.id,characterId,key});
  };
  if(b.axis){const [id1,id2]=b.axis;const a1=a.characters.find(c=>c.id===id1),a2=a.characters.find(c=>c.id===id2),b1=b.characters.find(c=>c.id===id1),b2=b.characters.find(c=>c.id===id2);
    if(a1&&a2&&b1&&b2&&axisSide(a1,a2,ca)*axisSide(b1,b2,cb)<0)add("axis",null);
  }
  for(const c of b.characters){const old=a.characters.find(v=>v.id===c.id);if(!old)continue;
    if(screenDirection(old.facing,ca.heading)*screenDirection(c.facing,cb.heading)<0)add("gaze",c.id);
    if(old.movement!==null&&c.movement!==null&&screenDirection(old.movement,ca.heading)*screenDirection(c.movement,cb.heading)<0)add("movement",c.id);
  }
  return out;
}
export function continuityPanels(s:ProjectState,productionId:string):Composition[] {
  return Object.values(s.compositions).filter(p=>p.kind==="storyboard"&&!p.removed&&p.active!==false&&p.occurrenceId&&s.occurrences[p.occurrenceId]?.productionId===productionId&&s.occurrences[p.occurrenceId]?.active)
    .sort((a,b)=>{const oa=a.occurrenceId?s.occurrences[a.occurrenceId]:undefined,ob=b.occurrenceId?s.occurrences[b.occurrenceId]:undefined;return (oa&&ob?compareStory(s,oa.sceneId,ob.sceneId):0)||(a.orderKey??"").localeCompare(b.orderKey??"")||a.id.localeCompare(b.id);});
}
export function continuityBlockingIssues(s:ProjectState,productionId:string):BlockingIssue[]{
  const panels=continuityPanels(s,productionId);return panels.flatMap((p,i)=>{const prev=panels[i-1];return prev?blockingIssues(prev,p):[];});
}
export function transitionValid(v:Transition):boolean{return !!v&&["cut","dissolve","dip","dipWhite","wipe"].includes(v.kind)&&Number.isInteger(v.frames)&&v.frames>=0&&v.frames<=600&&(v.kind!=="cut"||v.frames===0)&&typeof v.overlap==="boolean"&&[undefined,"left","right","up","down"].includes(v.direction);}
export function panelTransition(p:Composition):Transition|null { const v=p.storyboard?.transition;return v&&transitionValid(v)?v:null; }