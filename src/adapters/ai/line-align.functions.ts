/** B-050: fixed server-built scene-local prompts. Service-paid translation-align; never an open proxy. */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { L, isUuid, languageTagError, lineAlignmentPrompt, parseLineAlignment, uncertainLineScope } from "@/core";
import type { AnyClient } from "@/adapters/storage/project-rows";
interface Input { projectId: string; variantId: string; language: string; confirmed?: boolean; fingerprint?: string | undefined }
function validate(x: Input): Input {
  if (!x || !isUuid(x.projectId) || !isUuid(x.variantId) || languageTagError(x.language) || ["nb","no"].includes(x.language)) throw new Error(L("Ugyldig scene eller språk.","Invalid scene or language."));
  return {projectId:x.projectId,variantId:x.variantId,language:x.language,confirmed:x.confirmed === true,fingerprint: typeof x.fingerprint === "string" ? x.fingerprint.slice(0,100) : undefined};
}
export const alignTranslationLines = createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth]).inputValidator(validate)
  .handler(async ({data,context}) => {
    const { memberRole, ROLE_RANK }=await import("./ai-gate.server");
    const role=await memberRole(context.supabase as unknown as AnyClient,data.projectId,context.userId);
    if ((ROLE_RANK[role ?? ""] ?? 0) < (ROLE_RANK["editor"] ?? 2)) return {ok:false as const,message:L("Du har ikke tilgang.","Access denied.")};
    const {loadProjectState}=await import("@/adapters/storage/project-rows");
    const state=await loadProjectState(context.supabase as unknown as AnyClient,data.projectId);
    const scope=uncertainLineScope(state,data.variantId,data.language);
    if (!state.variants[data.variantId] || scope.targets.length > 40 || scope.sources.length > 40) return {ok:false as const,message:L("Velg en scene med høyst 40 usikre linjer.","Choose a scene with at most 40 uncertain lines.")};
    const prompt=lineAlignmentPrompt(state,data.variantId,data.language);
    const bytes=new TextEncoder().encode(prompt.user);
    const hash=await crypto.subtle.digest("SHA-256",bytes);
    const fingerprint=Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,"0")).join("");
    // B-047 built-in service pays; M8 does not select a paid image/video/speech model for this text task.
    if (!data.confirmed) return {ok:true as const,estimate:true as const,costUsd:0,servicePaid:true,fingerprint,lines:scope.targets.length,profileName:state.project.activeQualityProfileId ? state.qualityProfiles[state.project.activeQualityProfileId]?.name ?? null : null};
    if (data.fingerprint !== fingerprint) return {ok:false as const,message:L("Linjer er endret. Kontroller anslaget og bekreft på nytt.","Lines changed. Check the estimate and confirm again.")};
    if (!scope.targets.length) return {ok:true as const,estimate:false as const,links:[],discarded:0};
    const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
    const {runServiceAi}=await import("./service-ai.server");
    const result=await runServiceAi({admin:supabaseAdmin as unknown as AnyClient,projectId:data.projectId,userId:context.userId,task:"translation_align",system:prompt.system,user:prompt.user,maxTokens:4000});
    if (!result.ok) return {ok:false as const,message:result.message};
    return {ok:true as const,estimate:false as const,...parseLineAlignment(result.text,state,data.variantId,data.language)};
  });
