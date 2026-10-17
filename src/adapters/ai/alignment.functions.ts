/**
 * Ord-til-lyd på serveren (fase 2, bolk D, DEC-0095, REQ-0698/0699): opptaket og manusteksten sendes til
 * tjenesten brukeren valgte (først ElevenLabs Forced Alignment) med nøkkelen til en av prosjektets eiere.
 * Samme kostnadsport som annen AI: brukeren har godkjent kostnaden, budsjett og tak sjekkes før og etter
 * registrering, og jobben logges (som «sound» med task «alignment»). Svaret er ordene med tider; nettleseren
 * parer dem med manusets ord og lagrer koblingen med en kommando (kan angres og rettes for hånd).
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { estimateCostUsd, isUuid, L, newId, providerModel } from "@/core";
import { checkSchema, type AnyClient } from "@/adapters/storage/project-rows";

const BUCKET = "assets";
const MAX_ALIGNMENTS_PER_USER_PER_HOUR = 120;
/** Lengste opptak som analyseres her (en replikk eller en lyd, ikke en hel film). */
const MAX_AUDIO_MS = 15 * 60 * 1000;
const MAX_BYTES = 200 * 1024 * 1024;

export type AlignAudioResult =
  | {
      readonly ok: true;
      readonly words: readonly { text: string; start: number; end: number; loss: number | null }[];
      readonly loss: number | null;
      readonly model: string;
      /** Teksten som ble analysert (replikken slik den står nå). */
      readonly text: string;
      readonly costUsd: number | null;
    }
  | { readonly ok: false; readonly message: string };

export const alignAudio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => {
    const x = (d ?? {}) as Record<string, unknown>;
    for (const k of ["projectId", "versionId", "blockId"])
      if (typeof x[k] !== "string" || !isUuid(x[k] as string))
        throw new Error(L("Ugyldig forespørsel", "Invalid request"));
    if (x["provider"] !== "elevenlabs") throw new Error(L("Ukjent tjeneste", "Unknown service"));
    if (x["approved"] !== true)
      throw new Error(L("Kostnaden må godkjennes først", "The cost must be approved first"));
    return {
      projectId: x["projectId"] as string,
      versionId: x["versionId"] as string,
      blockId: x["blockId"] as string,
      provider: "elevenlabs" as const,
      model: "forced-alignment",
    };
  })
  .handler(async ({ data, context }): Promise<AlignAudioResult> => {
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
          "Du har ikke tilgang til å analysere lyd i dette prosjektet.",
          "You do not have access to analyse audio in this project.",
        ),
      };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as AnyClient;
    const schema = await checkSchema(db);
    if (schema.kind === "missing" || schema.version < 37)
      return {
        ok: false,
        message: L(
          "Databasen mangler ord-til-lyd. Den må oppdateres (migrasjon 0037).",
          "The database is missing word alignment. It must be updated (migration 0037).",
        ),
      };
    const { data: proj } = await db
      .from("projects")
      .select("*")
      .eq("id", data.projectId)
      .maybeSingle();
    if (!proj || (proj as { deleted_at?: string | null }).deleted_at)
      return { ok: false, message: L("Prosjektet er slettet.", "The project has been deleted.") };
    const { data: ver } = await db
      .from("asset_versions")
      .select("id, variant_id, media_path, mime_type, duration_ms, byte_size_big")
      .eq("id", data.versionId)
      .eq("project_id", data.projectId)
      .maybeSingle();
    const v = ver as {
      variant_id: string;
      media_path: string;
      mime_type: string;
      duration_ms: number | null;
      byte_size_big: number | null;
    } | null;
    if (!v || v.duration_ms === null || !v.mime_type.startsWith("audio/"))
      return { ok: false, message: L("Fant ikke opptaket.", "The recording was not found.") };
    if (v.duration_ms > MAX_AUDIO_MS || (v.byte_size_big ?? 0) > MAX_BYTES)
      return {
        ok: false,
        message: L(
          "Opptaket er for langt for ord-til-lyd (høyst 15 minutter).",
          "The recording is too long for word alignment (15 minutes at most).",
        ),
      };
    const { data: block } = await db
      .from("script_blocks")
      .select("id, kind, text")
      .eq("id", data.blockId)
      .eq("project_id", data.projectId)
      .maybeSingle();
    const b = block as { kind: string; text: string } | null;
    if (!b || b.kind !== "dialogue" || !b.text.trim())
      return { ok: false, message: L("Fant ikke replikken.", "The line was not found.") };
    const aiGate = await (
      await import("@/adapters/account/ai-models.server")
    ).modelGate(db, data.provider, data.model);
    if (aiGate.message) return { ok: false, message: aiGate.message };
    const m = providerModel(data.provider, data.model, aiGate.settings);
    if (!m || m.capability !== "alignment")
      return { ok: false, message: L("Ukjent tjeneste.", "Unknown service.") };
    const key = await gate.projectKey(db, data.projectId, data.provider, context.userId);
    if (!key)
      return {
        ok: false,
        message: L(
          "Ingen av prosjektets eiere har koblet til ElevenLabs (AI-leverandører på prosjektlisten).",
          "None of the project's owners has connected ElevenLabs (AI providers on the project list).",
        ),
      };
    const seconds = v.duration_ms / 1000;
    const cost = estimateCostUsd(data.provider, data.model, { seconds }, aiGate.settings);
    const hourAgo = new Date(Date.now() - 3600_000).toISOString();
    const limits = async (extra: number): Promise<string | null> => {
      const { count } = await db
        .from("generation_jobs")
        .select("id", { count: "exact", head: true })
        .eq("created_by", context.userId)
        .eq("kind", "sound")
        .gte("created_at", hourAgo);
      if ((count ?? 0) - extra >= MAX_ALIGNMENTS_PER_USER_PER_HOUR)
        return L(
          `Grensen på ${MAX_ALIGNMENTS_PER_USER_PER_HOUR} lydjobber i timen er nådd.`,
          `The limit of ${MAX_ALIGNMENTS_PER_USER_PER_HOUR} audio jobs per hour has been reached.`,
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
      prompt: L(`Ord-til-lyd: ${b.text.slice(0, 900)}`, `Word alignment: ${b.text.slice(0, 900)}`),
      asset_id: null,
      status: "running",
      created_by: context.userId,
      provider_key_id: key.id,
      key_owner: key.user_id,
      cost_usd: cost,
      params: { task: "alignment", seconds, versionId: data.versionId, blockId: data.blockId },
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
    let secret: string | null = null;
    const { ADAPTERS, scrubSecret } = await import("./providers.server");
    try {
      const { data: file, error: dlErr } = await db.storage.from(BUCKET).download(v.media_path);
      if (dlErr || !file)
        throw new Error(L("Opptaket kunne ikke hentes.", "The recording could not be fetched."));
      const { decryptKey } = await import("./key-vault.server");
      secret = await decryptKey(key, {
        userId: key.user_id,
        provider: key.provider,
        rowId: key.id,
      });
      const out = await ADAPTERS.elevenlabs.align({
        key: secret,
        audio: file,
        fileName: v.media_path.split("/").pop() ?? "opptak", // i18n-ignore: filnavn
        text: b.text,
      });
      await finish({ status: "done" });
      return {
        ok: true,
        words: out.words,
        loss: out.loss,
        model: `${data.provider}/${data.model}`,
        text: b.text,
        costUsd: cost,
      };
    } catch (e) {
      const message = scrubSecret(
        (e as Error).message || L("Ukjent feil", "Unknown error"),
        secret,
      ).slice(0, 2000);
      await finish({ status: "failed", error: message });
      return {
        ok: false,
        message: L(
          `Analysen feilet: ${message}. Du kan koble ordene for hånd.`,
          `The analysis failed: ${message}. You can link the words by hand.`,
        ),
      };
    }
  });
