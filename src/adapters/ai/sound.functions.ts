/**
 * Lyd med AI (DEC-0069; Mars: «og lyder?»): lydeffekter fra en beskrivelse via en leverandør prosjektets
 * eiere har koblet til (ElevenLabs). Resultatet lagres som ny versjon av en lydressurs i biblioteket;
 * nettleseren lager versjonen (AddAssetVersion), som kan angres. Samme kostnadsport som bilder og video.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { estimateCostUsd, isUuid, newId, providerModel, type AssetMedia } from "@/core";
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
      throw new Error("Ugyldig prosjekt");
    if (typeof x["assetId"] !== "string" || !isUuid(x["assetId"]))
      throw new Error("Ugyldig ressurs");
    const prompt = x["prompt"];
    if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 1000)
      throw new Error("Beskrivelsen mangler eller er for lang (høyst 1000 tegn)");
    if (x["provider"] !== "elevenlabs") throw new Error("Ukjent leverandør");
    if (typeof x["model"] !== "string" || x["model"].length > 120)
      throw new Error("Ugyldig modell");
    const seconds = x["seconds"];
    if (seconds !== null && (typeof seconds !== "number" || seconds < 0.5 || seconds > 30))
      throw new Error("Lengden må være 0,5–30 sekunder");
    if (x["approved"] !== true) throw new Error("Genereringen må bekreftes");
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
      return { ok: false, message: "Du har ikke tilgang til å generere i dette prosjektet." };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as AnyClient;
    const schema = await checkSchema(db);
    if (schema.kind === "missing" || schema.version < 24)
      return {
        ok: false,
        message:
          "Databasen er ikke oppdatert for AI-lyd. Lim inn meldingen i LOVABLE_SYNC.md i Lovable (migrasjon 0024).",
      };
    const { data: proj } = await db
      .from("projects")
      .select("*")
      .eq("id", data.projectId)
      .maybeSingle();
    if (!proj || (proj as { deleted_at?: string | null }).deleted_at)
      return { ok: false, message: "Prosjektet er slettet." };
    const { data: asset } = await db
      .from("assets")
      .select("id, kind")
      .eq("id", data.assetId)
      .eq("project_id", data.projectId)
      .maybeSingle();
    if (!asset || (asset as { kind: string }).kind !== "sound")
      return { ok: false, message: "Lyd kan bare lages for en lydressurs." };
    const m = providerModel(data.provider, data.model);
    if (!m || m.capability !== "sound") return { ok: false, message: "Ukjent lydmodell." };
    const key = await gate.projectKey(db, data.projectId, data.provider, context.userId);
    if (!key)
      return {
        ok: false,
        message:
          "Ingen av prosjektets eiere har koblet til ElevenLabs (AI-leverandører på prosjektlisten).",
      };
    // Ukjent lengde: anslaget regner med det lengste tjenesten kan lage (30 sekunder)
    const cost = estimateCostUsd(data.provider, data.model, { seconds: data.seconds ?? 30 });
    const hourAgo = new Date(Date.now() - 3600_000).toISOString();
    const limits = async (extra: number): Promise<string | null> => {
      const { count } = await db
        .from("generation_jobs")
        .select("id", { count: "exact", head: true })
        .eq("created_by", context.userId)
        .eq("kind", "sound")
        .gte("created_at", hourAgo);
      if ((count ?? 0) - extra >= MAX_SOUND_JOBS_PER_USER_PER_HOUR)
        return `Grensen på ${MAX_SOUND_JOBS_PER_USER_PER_HOUR} lyder i timen er nådd.`;
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
      params: { seconds: data.seconds, loop: data.loop },
    } as never);
    if (logErr) return { ok: false, message: `Jobben kunne ikke logges: ${logErr.message}` };
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
      if (!out.bytes.byteLength) throw new Error("Tjenesten svarte uten lyd.");
      const versionId = newId<"asset_version">();
      const path = `${data.projectId}/${data.assetId}/${versionId}/ai-lyd-${new Date().toISOString().slice(0, 10)}.mp3`;
      const { error: upErr } = await db.storage
        .from(BUCKET)
        .upload(path, new Blob([out.bytes as unknown as ArrayBuffer], { type: "audio/mpeg" }), {
          contentType: "audio/mpeg",
          upsert: false,
        });
      if (upErr) throw new Error(`Lyden kunne ikke lagres: ${upErr.message}`);
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
      const message = scrubSecret((e as Error).message || "Ukjent feil", secret).slice(0, 2000);
      await finish({ status: charged ? "lost" : "failed", error: message });
      return { ok: false, message: `Lyden ble ikke laget: ${message}` };
    }
  });
