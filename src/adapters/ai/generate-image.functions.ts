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
import {
  type AssetMedia,
  type ImageSize,
  isProviderId,
  isUuid,
  MAX_ATTACHED_IMAGES,
  MAX_PROMPT_CHARS,
  parseQualityProfileMeta,
  type QualityProfileSnapshot,
  L,
} from "@/core";
import type { AnyClient } from "@/adapters/storage/project-rows";
import { ROLE_RANK, validReferencePath } from "./gateway";
import type { ImageAspect } from "./providers.server";

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
  if (!d || typeof d !== "object") throw new Error(L("Ugyldig forespørsel", "Invalid request"));
  const x = d as Record<string, unknown>;
  const projectId = x["projectId"];
  const assetId = x["assetId"];
  const prompt = x["prompt"];
  const refs = x["referencePaths"];
  if (typeof projectId !== "string" || !isUuid(projectId))
    throw new Error(L("Ugyldig prosjekt", "Invalid project"));
  if (typeof assetId !== "string" || !isUuid(assetId))
    throw new Error(L("Ugyldig ressurs", "Invalid asset"));
  if (typeof prompt !== "string" || !prompt.trim() || prompt.length > MAX_PROMPT_CHARS)
    throw new Error(
      L("Beskrivelsen mangler eller er for lang", "The description is missing or too long"),
    );
  if (
    !Array.isArray(refs) ||
    refs.length > MAX_ATTACHED_IMAGES ||
    new Set(refs).size !== refs.length ||
    !refs.every((r) => validReferencePath(projectId, r))
  )
    throw new Error(L("Ugyldige forbildebilder", "Invalid reference images"));
  if (x["purpose"] !== "cutout" && x["purpose"] !== "background")
    throw new Error(L("Ugyldig bruk", "Invalid use"));
  if (x["approved"] !== true)
    throw new Error(L("Genereringen må bekreftes", "The generation must be confirmed"));
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
      if (!isProviderId(p)) throw new Error(L("Ukjent leverandør", "Unknown provider"));
      return p;
    })(),
    model: (() => {
      const m = x["model"] ?? null;
      if (m !== null && (typeof m !== "string" || m.length > 120))
        throw new Error(L("Ugyldig modell", "Invalid model"));
      return m as string | null;
    })(),
    size: (() => {
      const z = x["size"] ?? null;
      if (z !== null && z !== "1K" && z !== "2K" && z !== "4K")
        throw new Error(L("Ugyldig størrelse", "Invalid size"));
      return z as ImageSize | null;
    })(),
    aspect: (() => {
      const a = x["aspect"] ?? null;
      if (a !== null && a !== "2:3" && a !== "3:2" && a !== "1:1" && a !== "16:9")
        throw new Error(L("Ugyldig sideforhold", "Invalid aspect ratio"));
      return a as ImageAspect | null;
    })(),
    negativePrompt: (() => {
      const n = x["negativePrompt"] ?? null;
      if (n !== null && (typeof n !== "string" || n.length > 2000))
        throw new Error(L("Ugyldig negativ beskrivelse", "Invalid negative description"));
      return (n as string | null)?.trim() || null;
    })(),
    operation: x["operation"] === "upscale" ? "upscale" : "generate",
    upscaleFactor: x["upscaleFactor"] === 4 ? 4 : 2,
    approved: true,
    qualityProfile: parseQualityProfileMeta(x["qualityProfile"]),
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
        message: L(
          "Du har ikke tilgang til å generere i dette prosjektet.",
          "You do not have access to generate in this project.",
        ),
      };

    const { runImageGeneration } = await import("./image-run.server");
    return runImageGeneration(data, { userId: context.userId, supabase: context.supabase });
  });
