/**
 * AI-generering av bilder gjennom Lovable AI Gateway (M5 del 1, DEC-0045). Mars har valgt å teste med
 * Lovable-arbeidsområdets egne kreditter; nøkkelen (LOVABLE_API_KEY) ligger bare på serveren i Lovable
 * Cloud og sendes aldri til nettleseren.
 *
 * Kostnadsport (mandat 19, secure-development): bare redaktører, eksplisitt bekreftelse for hver generering,
 * grense per bruker per time og per prosjekt per døgn, og logg over alt i generation_jobs (migrasjon 0010).
 * Resultatet lagres som en fil i bøtta «assets»; klienten lagrer versjonen med AddAssetVersion (samme vei
 * som opplasting), så ingenting i prosjektet endres uten en vanlig kommando som kan angres.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { type AssetMedia, type ImageSize, isProviderId, isUuid, MAX_ATTACHED_IMAGES, MAX_PROMPT_CHARS, parseQualityProfileMeta, type QualityProfileSnapshot } from "@/core";
import type { AnyClient } from "@/adapters/storage/project-rows";
import { ROLE_RANK, validReferencePath } from "./gateway";
import type { ImageAspect } from "./providers.server";
import { t } from "@/core/i18n/keyed";

// Modellene for innebygd bildegenerering står i kjernen (vises også i bekreftelsen, REQ-0280)
export { LOVABLE_CUTOUT_MODEL as CUTOUT_MODEL, LOVABLE_IMAGE_MODEL as IMAGE_MODEL } from "@/core";
/** Grenser som sikring mot løpske kostnader. */
export { MAX_PER_USER_PER_HOUR, MAX_PER_PROJECT_PER_DAY } from "./image-limits";

export interface GenerateImageInput {
  readonly projectId: string;
  readonly assetId: string;
  readonly prompt: string;
  /**
   * Bildene som sendes med (sti i bøtta), i rekkefølge: først ev. dagens bilde som skal beholdes, så
   * filmens forbildebilder (DEC-0066). Tom liste: bildet lages bare fra beskrivelsen.
   */
  readonly referencePaths: readonly string[];
  /** Det første bildet er dagens bilde av ressursen (beholdes); ellers er alle stilforbilder. */
  readonly identityFirst: boolean;
  readonly purpose: "cutout" | "background";
  /** Varianten bildet skal inn i (huskes i jobben, så «Legg inn» treffer riktig variant – KI-147). */
  readonly variantId?: string | null;
  /** Leverandør og modell (DEC-0069); «lovable» (innebygd) når ikke valgt. */
  readonly provider: string;
  readonly model: string | null;
  /** Valgt bildestørrelse (Mars 2026-10-13); bare for modeller som tar imot den. */
  readonly size?: ImageSize | null;
  /** Sideforhold (DEC-0080); standard ut fra bruken. */
  readonly aspect?: ImageAspect | null;
  /** Negativ beskrivelse for modeller som har eget felt (DEC-0080). */
  readonly negativePrompt?: string | null;
  /** «upscale»: oppskaler det ene forbildet (DEC-0080) i stedet for å lage et nytt bilde. */
  readonly operation?: "generate" | "upscale";
  /** Oppskalering: 2× eller 4×. */
  readonly upscaleFactor?: 2 | 4;
  /** Brukeren har bekreftet at genereringen bruker kreditter. */
  readonly approved: true;
  /** Kvalitetsprofilen bildet lages med (M8, REQ-0859): øyeblikksbilde i jobbens metadata. */
  readonly qualityProfile?: QualityProfileSnapshot | null;
  /**
   * B-105a: innstillingene prompten bygges fra på serveren (maler, stilregler og vedlegg). `prompt` er da
   * brukerens egen tekst (kan være tom: den automatiske beskrivelsen brukes), og vedleggene beregnes her.
   */
  readonly promptRequest?: unknown;
}

export type GenerateImageResult =
  | {
      readonly ok: true;
      readonly versionId: string;
      readonly media: AssetMedia;
      readonly model: string;
      readonly jobId: string;
    }
  | { readonly ok: false; readonly message: string };

function validate(d: unknown): GenerateImageInput {
  if (!d || typeof d !== "object") throw new Error(t("adapters-ai-generate-image-functions.validate.message.24c08eed08ff"));
  const x = d as Record<string, unknown>;
  const projectId = x["projectId"];
  const assetId = x["assetId"];
  const prompt = x["prompt"];
  const hasRequest = x["promptRequest"] !== undefined && x["promptRequest"] !== null;
  const refs = hasRequest ? [] : x["referencePaths"];
  if (typeof projectId !== "string" || !isUuid(projectId))
    throw new Error(t("adapters-ai-generate-image-functions.validate.message.945ebc1deb28"));
  if (typeof assetId !== "string" || !isUuid(assetId))
    throw new Error(t("adapters-ai-generate-image-functions.validate.message.cfa60d63843d"));
  if (typeof prompt !== "string" || (!hasRequest && !prompt.trim()) || prompt.length > MAX_PROMPT_CHARS)
    throw new Error(
      t("adapters-ai-generate-image-functions.validate.message.61920e7c8aa3"),
    );
  if (
    !Array.isArray(refs) ||
    refs.length > MAX_ATTACHED_IMAGES ||
    new Set(refs).size !== refs.length ||
    !refs.every((r) => validReferencePath(projectId, r))
  )
    throw new Error(t("adapters-ai-generate-image-functions.validate.message.5536a8eb7feb"));
  if (x["purpose"] !== "cutout" && x["purpose"] !== "background")
    throw new Error(t("adapters-ai-generate-image-functions.validate.message.8f0cad8cb879"));
  if (x["approved"] !== true)
    throw new Error(t("adapters-ai-generate-image-functions.validate.message.b947e66a1d8f"));
  return {
    projectId,
    assetId,
    prompt: prompt.trim(),
    referencePaths: refs as string[],
    identityFirst: x["identityFirst"] === true && (refs as string[]).length > 0,
    purpose: x["purpose"],
    variantId: typeof x["variantId"] === "string" && isUuid(x["variantId"]) ? x["variantId"] : null,
    provider: (() => {
      const p = x["provider"] ?? "lovable";
      if (!isProviderId(p)) throw new Error(t("adapters-ai-generate-image-functions.provider.const-p-x-provider-lovable-if-is-provider-id-p-throw-new-error-l-ukjent-leverand-r-unknown-provider-return-p.23a7d4680ec5"));
      return p;
    })(),
    model: (() => {
      const m = x["model"] ?? null;
      if (m !== null && (typeof m !== "string" || m.length > 120))
        throw new Error(t("adapters-ai-generate-image-functions.model.const-m-x-model-null-if-m-null-typeof-m-string-m-length-120-throw-new-error-l-ugyldig-modell-invalid-model-return-m-as-string-null.205cfe8019b1"));
      return m as string | null;
    })(),
    size: (() => {
      const z = x["size"] ?? null;
      if (z !== null && z !== "1K" && z !== "2K" && z !== "4K")
        throw new Error(t("adapters-ai-generate-image-functions.size.const-z-x-size-null-if-z-null-z-1k-z-2k-z-4k-throw-new-error-l-ugyldig-st-rrelse-invalid-size-return-z-as-image-size-null.e38baf0dce9e"));
      return z as ImageSize | null;
    })(),
    aspect: (() => {
      const a = x["aspect"] ?? null;
      if (a !== null && a !== "2:3" && a !== "3:2" && a !== "1:1" && a !== "16:9")
        throw new Error(t("adapters-ai-generate-image-functions.aspect.const-a-x-aspect-null-if-a-null-a-2-3-a-3-2-a-1-1-a-16-9-throw-new-error-l-ugyldig-sideforhold-invalid-aspect-ratio-return-a-as-image-aspect-null.d51d1fdb55af"));
      return a as ImageAspect | null;
    })(),
    negativePrompt: (() => {
      const n = x["negativePrompt"] ?? null;
      if (n !== null && (typeof n !== "string" || n.length > 2000))
        throw new Error(t("adapters-ai-generate-image-functions.negative-prompt.const-n-x-negative-prompt-null-if-n-null-typeof-n-string-n-length-2000-throw-new-error-l-ugyldig-negativ-beskrivelse-invalid-negative-description-return-n-as-string-null-trim-null.89827b70a08a"));
      return (n as string | null)?.trim() || null;
    })(),
    operation: x["operation"] === "upscale" ? "upscale" : "generate",
    upscaleFactor: x["upscaleFactor"] === 4 ? 4 : 2,
    approved: true,
    qualityProfile: parseQualityProfileMeta(x["qualityProfile"]),
    ...(hasRequest ? { promptRequest: x["promptRequest"] } : {}),
  };
}

export const generateImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validate)
  .handler(async ({ data, context }): Promise<GenerateImageResult> => {
    const userDb = context.supabase as unknown as AnyClient;
    const { data: member } = await userDb
      .from("project_members")
      .select("role")
      .eq("project_id", data.projectId)
      .eq("user_id", context.userId)
      .is("removed_at", null)
      .maybeSingle();
    if ((ROLE_RANK[(member as { role?: string } | null)?.role ?? ""] ?? 0) < ROLE_RANK["editor"]!)
      return {
        ok: false,
        message: t("adapters-ai-generate-image-functions.message.message.eec2e586f194"),
      };

    let input: GenerateImageInput = data;
    if (data.promptRequest !== undefined) {
      // B-105a: malene og vedleggene settes sammen her, fra prosjektet lest med brukerens tilgang (RLS)
      const { imagePromptRequest, composeImagePrompt, finalImagePrompt } = await import("./image-prompts.server");
      const req = imagePromptRequest.safeParse(data.promptRequest);
      if (!req.success || req.data.assetId !== data.assetId && req.data.kind !== "part")
        return { ok: false, message: t("adapters-ai-generate-image-functions.validate.message.24c08eed08ff") };
      const { loadProjectState } = await import("@/adapters/storage/project-rows");
      const state = await loadProjectState(userDb as never, data.projectId);
      const c = composeImagePrompt(state, req.data);
      if (!c) return { ok: false, message: t("adapters-ai-generate-image-functions.validate.message.cfa60d63843d") };
      const prompt = finalImagePrompt(c, data.prompt);
      if (!prompt.trim() || prompt.length > MAX_PROMPT_CHARS || c.referencePaths.length > MAX_ATTACHED_IMAGES ||
        !c.referencePaths.every((r) => validReferencePath(data.projectId, r)))
        return { ok: false, message: t("adapters-ai-generate-image-functions.validate.message.5536a8eb7feb") };
      const { promptRequest: _r, ...rest } = data;
      input = {
        ...rest,
        prompt,
        referencePaths: c.referencePaths,
        identityFirst: c.identityFirst,
        ...(c.negative ? { negativePrompt: c.negative } : {}),
      };
    }
    const { runImageGeneration } = await import("./image-run.server");
    return runImageGeneration(input, { userId: context.userId, supabase: context.supabase });
  });
