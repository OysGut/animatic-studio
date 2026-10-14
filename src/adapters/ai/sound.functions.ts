/**
 * Lyd med AI (DEC-0069; Mars: «og lyder?»): lydeffekter fra en beskrivelse via en leverandør prosjektets
 * eiere har koblet til (ElevenLabs). Resultatet lagres som ny versjon av en lydressurs i biblioteket;
 * nettleseren lager versjonen (AddAssetVersion), som kan angres. Samme kostnadsport som bilder og video.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  type AssetMedia,
  effortOf,
  estimateCostUsd,
  isUuid,
  L,
  locale,
  newId,
  providerModel,
} from "@/core";
import { checkSchema, type AnyClient } from "@/adapters/storage/project-rows";

const BUCKET = "assets";
const MAX_SOUND_JOBS_PER_USER_PER_HOUR = 60;

export type GenerateSoundResult =
  | {
      readonly ok: true;
      readonly versionId: string;
      readonly media: AssetMedia;
      readonly model: string;
    }
  | { readonly ok: false; readonly message: string };

async function sha256(b: Uint8Array): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", b as unknown as ArrayBuffer);
  return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

export const generateSound = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => {
    const x = (d ?? {}) as Record<string, unknown>;
    if (typeof x["projectId"] !== "string" || !isUuid(x["projectId"]))
      throw new Error(L("Ugyldig prosjekt", "Invalid project"));
    if (typeof x["assetId"] !== "string" || !isUuid(x["assetId"]))
      throw new Error(L("Ugyldig ressurs", "Invalid asset"));
    const prompt = x["prompt"];
    if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 1000)
      throw new Error(
        L(
          "Beskrivelsen mangler eller er for lang (høyst 1000 tegn)",
          "The description is missing or too long (1000 characters at most)",
        ),
      );
    if (x["provider"] !== "elevenlabs") throw new Error(L("Ukjent leverandør", "Unknown provider"));
    if (typeof x["model"] !== "string" || x["model"].length > 120)
      throw new Error(L("Ugyldig modell", "Invalid model"));
    const seconds = x["seconds"];
    // Tidsbegrensningen står i leverandørkatalogen (REQ-0273)
    const lim = providerModel("elevenlabs", x["model"])?.soundSeconds ?? { min: 0.5, max: 30 };
    if (
      seconds !== null &&
      (typeof seconds !== "number" ||
        !Number.isFinite(seconds) ||
        seconds < lim.min ||
        seconds > lim.max)
    )
      throw new Error(
        L(
          `Lengden må være ${lim.min.toLocaleString(locale())}–${lim.max.toLocaleString(locale())} sekunder`,
          `The length must be ${lim.min.toLocaleString(locale())}–${lim.max.toLocaleString(locale())} seconds`,
        ),
      );
    if (x["approved"] !== true)
      throw new Error(L("Genereringen må bekreftes", "The generation must be confirmed"));
    return {
      projectId: x["projectId"],
      assetId: x["assetId"],
      prompt: prompt.trim(),
      provider: "elevenlabs" as const,
      model: x["model"],
      seconds: (seconds as number | null) ?? null,
      loop: x["loop"] === true,
    };
  })
  .handler(async ({ data, context }): Promise<GenerateSoundResult> => {
    const gate = await import("./ai-gate.server");
    const role = await gate.memberRole(
      context.supabase as unknown as AnyClient,
      data.projectId,
      context.userId,
    );
    if ((gate.ROLE_RANK[role ?? ""] ?? 0) < gate.ROLE_RANK["editor"]!)
      return {
        ok: false,
        message: L(
          "Du har ikke tilgang til å generere i dette prosjektet.",
          "You do not have access to generate in this project.",
        ),
      };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as AnyClient;
    const schema = await checkSchema(db);
    if (schema.kind === "missing" || schema.version < 24)
      return {
        ok: false,
        message: L(
          "Databasen er ikke oppdatert for AI-lyd. Lim inn meldingen i LOVABLE_SYNC.md i Lovable (migrasjon 0024).",
          "The database is not updated for AI sound. Paste the message in LOVABLE_SYNC.md into Lovable (migration 0024).",
        ),
      };
    const { data: proj } = await db
      .from("projects")
      .select("*")
      .eq("id", data.projectId)
      .maybeSingle();
    if (!proj || (proj as { deleted_at?: string | null }).deleted_at)
      return { ok: false, message: L("Prosjektet er slettet.", "The project has been deleted.") };
    const { data: asset } = await db
      .from("assets")
      .select("id, kind")
      .eq("id", data.assetId)
      .eq("project_id", data.projectId)
      .maybeSingle();
    if (!asset || (asset as { kind: string }).kind !== "sound")
      return {
        ok: false,
        message: L(
          "Lyd kan bare lages for en lydressurs.",
          "Sound can only be made for a sound asset.",
        ),
      };
    const m = providerModel(data.provider, data.model);
    if (!m || m.capability !== "sound")
      return { ok: false, message: L("Ukjent lydmodell.", "Unknown sound model.") };
    const key = await gate.projectKey(db, data.projectId, data.provider, context.userId);
    if (!key)
      return {
        ok: false,
        message: L(
          "Ingen av prosjektets eiere har koblet til ElevenLabs (AI-leverandører på prosjektlisten).",
          "None of the project's owners has connected ElevenLabs (AI providers on the project list).",
        ),
      };
    // Ukjent lengde: anslaget regner med det lengste modellen kan lage (katalogen, REQ-0273)
    const longest = providerModel(data.provider, data.model)?.soundSeconds?.max ?? 30;
    const cost = estimateCostUsd(data.provider, data.model, { seconds: data.seconds ?? longest });
    const hourAgo = new Date(Date.now() - 3600_000).toISOString();
    const limits = async (extra: number): Promise<string | null> => {
      const { count } = await db
        .from("generation_jobs")
        .select("id", { count: "exact", head: true })
        .eq("created_by", context.userId)
        .eq("kind", "sound")
        .gte("created_at", hourAgo);
      if ((count ?? 0) - extra >= MAX_SOUND_JOBS_PER_USER_PER_HOUR)
        return L(
          `Grensen på ${MAX_SOUND_JOBS_PER_USER_PER_HOUR} lyder i timen er nådd.`,
          `The limit of ${MAX_SOUND_JOBS_PER_USER_PER_HOUR} sounds per hour has been reached.`,
        );
      const budget = await gate.overProjectBudget(
        db,
        data.projectId,
        (proj as { ai_month_limit?: number | null }).ai_month_limit,
        extra === 1,
      );
      return budget ?? gate.overAccountCap(db, key.user_id, cost ?? 0, extra === 1);
    };
    const before = await limits(0);
    if (before) return { ok: false, message: before };
    const jobId = newId<"generation_job">();
    const { error: logErr } = await db.from("generation_jobs").insert({
      id: jobId,
      project_id: data.projectId,
      kind: "sound",
      provider: data.provider,
      model: data.model,
      prompt: data.prompt,
      asset_id: data.assetId,
      status: "running",
      created_by: context.userId,
      provider_key_id: key.id,
      key_owner: key.user_id,
      cost_usd: cost,
      params: {
        seconds: data.seconds,
        loop: data.loop,
        // Innsatsnivået jobben ble kjørt med (mandat 19.3, REQ-0275)
        effort: effortOf(providerModel(data.provider, data.model)),
        // Sporbarhet (DEC-0072, REQ-0257)
        trace: await (
          await import("./trace.server")
        ).buildTrace(db, data.projectId, {
          modelParams: { seconds: data.seconds, loop: data.loop },
        }),
      },
    } as never);
    if (logErr)
      return {
        ok: false,
        message: L(
          `Jobben kunne ikke logges: ${logErr.message}`,
          `The job could not be logged: ${logErr.message}`,
        ),
      };
    const after = await limits(1);
    if (after) {
      await db.from("generation_jobs").delete().eq("id", jobId);
      return { ok: false, message: after };
    }
    const finish = (patch: Record<string, unknown>) =>
      db
        .from("generation_jobs")
        .update({ ...patch, finished_at: new Date().toISOString() } as never)
        .eq("id", jobId);
    let charged = false;
    let secret: string | null = null;
    const { ADAPTERS, scrubSecret } = await import("./providers.server");
    try {
      const { decryptKey } = await import("./key-vault.server");
      secret = await decryptKey(key, {
        userId: key.user_id,
        provider: key.provider,
        rowId: key.id,
      });
      const out = await ADAPTERS.elevenlabs.sound({
        key: secret,
        model: data.model,
        prompt: data.prompt,
        seconds: data.seconds,
        loop: data.loop,
      });
      charged = true;
      if (!out.bytes.byteLength)
        throw new Error(L("Tjenesten svarte uten lyd.", "The service replied without sound."));
      const versionId = newId<"asset_version">();
      // i18n-ignore: lagringssti i bøtta, ikke vist
      const path = `${data.projectId}/${data.assetId}/${versionId}/ai-lyd-${new Date().toISOString().slice(0, 10)}.mp3`;
      const { error: upErr } = await db.storage
        .from(BUCKET)
        .upload(path, new Blob([out.bytes as unknown as ArrayBuffer], { type: "audio/mpeg" }), {
          contentType: "audio/mpeg",
          upsert: false,
        });
      if (upErr)
        throw new Error(
          L(
            `Lyden kunne ikke lagres: ${upErr.message}`,
            `The sound could not be saved: ${upErr.message}`,
          ),
        );
      await finish({ status: "done", result_path: path });
      return {
        ok: true,
        versionId,
        model: `${data.provider}/${data.model}`,
        media: {
          path,
          mimeType: "audio/mpeg",
          width: null,
          height: null,
          byteSize: out.bytes.byteLength,
          sha256: await sha256(out.bytes),
        },
      };
    } catch (e) {
      const message = scrubSecret(
        (e as Error).message || L("Ukjent feil", "Unknown error"),
        secret,
      ).slice(0, 2000);
      await finish({ status: charged ? "lost" : "failed", error: message });
      return {
        ok: false,
        message: L(`Lyden ble ikke laget: ${message}`, `The sound was not made: ${message}`),
      };
    }
  });
