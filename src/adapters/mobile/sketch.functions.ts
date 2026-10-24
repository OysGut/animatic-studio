import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isUuid } from "@/core";
import type { SketchStroke } from "@/core/storyboard/sketch";
import { t } from "@/core/i18n/keyed";
import { sketchValid } from "@/core/storyboard/sketch";
const fail=()=>new Error(t("sb8.session-error"));
async function digest(token:string){return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token)))).map(b=>b.toString(16).padStart(2,"0")).join("");}
function tokenInput(x:unknown){const d=x as {token?:unknown};if(typeof d?.token!=="string"||!/^sk_[A-Za-z0-9_-]{43}$/.test(d.token))throw fail();return d.token;}
export const createSketchSession=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).inputValidator((x:unknown)=>{const d=x as {projectId:string;panelId:string;layerId:string};if(!d||![d.projectId,d.panelId,d.layerId].every(isUuid))throw fail();return d;}).handler(async({data,context})=>{
  const db=context.supabase;
  const {data:member}=await db.from("project_members").select("role").eq("project_id",data.projectId).eq("user_id",context.userId).maybeSingle();if(!member||!["owner","editor"].includes(member.role))throw fail();
  const bytes=crypto.getRandomValues(new Uint8Array(32));const token="sk_"+btoa(String.fromCharCode(...bytes)).replaceAll("+","-").replaceAll("/","_").replaceAll("=","");
  const {supabaseAdmin}=await import("@/integrations/supabase/client.server");const admin=supabaseAdmin as unknown as import("@/adapters/storage/project-rows").AnyClient;
  const {data:session,error}=await admin.rpc("sketch_session_create",{p_project:data.projectId,p_panel:data.panelId,p_layer:data.layerId,p_actor:context.userId,p_hash:await digest(token)});if(error||!session)throw fail();return {token,sessionId:String(session)};
});
export const revokeSketchSession=createServerFn({method:"POST"}).middleware([requireSupabaseAuth]).inputValidator((x:{sessionId:string})=>{if(!isUuid(x.sessionId))throw fail();return x;}).handler(async({data,context})=>{const {supabaseAdmin}=await import("@/integrations/supabase/client.server");const db=supabaseAdmin as unknown as import("@/adapters/storage/project-rows").AnyClient;const {error}=await db.from("sketch_sessions").update({revoked:true}).eq("id",data.sessionId).eq("actor",context.userId);if(error)throw fail();return true;});
export const readSketchSession=createServerFn({method:"POST"}).inputValidator(tokenInput).handler(async({data})=>{
  const {setResponseHeader}=await import("@tanstack/react-start/server");setResponseHeader("Cache-Control","no-store");
  const {supabaseAdmin}=await import("@/integrations/supabase/client.server");const db=supabaseAdmin as unknown as import("@/adapters/storage/project-rows").AnyClient;const {data:s}=await db.rpc("sketch_session_lookup",{p_hash:await digest(data)});if(!s)throw fail();
  const {data:l}=await db.from("composition_layers").select("sketch").eq("id",s.layerId).single();const {data:p}=await db.from("compositions").select("width,height").eq("id",s.panelId).single();if(!l||!p)throw fail();return {spec:l.sketch as import("@/core/storyboard/sketch").SketchSpec,width:Number(p.width),height:Number(p.height)};
});
export const writeSketchSession=createServerFn({method:"POST"}).inputValidator((x:unknown)=>{const d=x as {token:string;stroke:SketchStroke;eraseIds?:string[];role?:"rough"|"clean";requestId:string};const token=tokenInput(d);if(!isUuid(d.requestId)||!sketchValid({version:1,role:"rough",strokes:d.stroke?[d.stroke]:[]})||d.eraseIds&&(!Array.isArray(d.eraseIds)||d.eraseIds.length>1024||d.eraseIds.some(i=>typeof i!=="string"||i.length>64))||d.role&&!['rough','clean'].includes(d.role))throw fail();return {...d,token};}).handler(async({data})=>{
  const {setResponseHeader}=await import("@tanstack/react-start/server");setResponseHeader("Cache-Control","no-store");
  const {supabaseAdmin}=await import("@/integrations/supabase/client.server");const db=supabaseAdmin as unknown as import("@/adapters/storage/project-rows").AnyClient;const hash=await digest(data.token);const {data:s}=await db.rpc("sketch_session_lookup",{p_hash:hash});if(!s)throw fail();
  const {loadProjectState}=await import("@/adapters/storage/project-rows");const {applyCommand,diffStates,layerFieldsOf}=await import("@/core");const state=await loadProjectState(db,s.projectId);const layer=state.layers[s.layerId];if(!layer?.sketch)throw fail();
  let strokes=layer.sketch.strokes.filter(st=>!data.eraseIds?.includes(st.id));if(data.stroke&&!strokes.some(st=>st.id===data.stroke.id))strokes=[...strokes,data.stroke];const sketch={...layer.sketch,role:data.role??layer.sketch.role,strokes};if(!sketchValid(sketch))throw new Error(t("sb8.limit"));
  const command:import("@/core").Command={type:"UpdateLayers",layers:[{layerId:layer.id,fields:{...layerFieldsOf(layer),sketch}}]};const result=applyCommand(state,{id:data.requestId as never,actor:s.actor,at:new Date().toISOString(),command});if(!result.ok)throw fail();
  const {error}=await db.rpc("sketch_session_apply",{p_hash:hash,p_id:data.requestId,p_command:command,p_inverse:result.inverse,p_changes:diffStates(state,result.state)});if(error)throw fail();return sketch;
});