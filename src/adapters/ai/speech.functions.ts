/**
 * Dialog med AI-stemmer (DEC-0071): en replikk leses inn med karakterens stemme hos ElevenLabs (tekst til tale,
 * en prosjekteier har koblet til). Teksten hentes fra manuset på serveren – det som leses, er replikken slik
 * den står. Resultatet lagres i bøtta «assets» som en ny lydressurs; nettleseren lager ressursen og legger
 * lyden på dialogsporet (kommandoer som kan angres). Samme kostnadsport som bilder, video og lyd.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  L,
  type AssetMedia,
  SPEECH_LANGUAGE,
  SPEECH_MODEL,
  effortOf,
  estimateCostUsd,
  isUuid,
  newId,
  providerModel,
} from "@/core";
import { checkSchema, type AnyClient } from "@/adapters/storage/project-rows";

const BUCKET = "assets";
const MAX_SPEECH_JOBS_PER_USER_PER_HOUR = 300;

const isId = (x: unknown): x is string => typeof x === "string" && isUuid(x);

async function sha256(b: Uint8Array): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", b as unknown as ArrayBuffer);
  return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

async function editorAccess(supabase: unknown, projectId: string, userId: string) {
  const gate = await import("./ai-gate.server");
  const role = await gate.memberRole(supabase as AnyClient, projectId, userId);
  if ((gate.ROLE_RANK[role ?? ""] ?? 0) < gate.ROLE_RANK["editor"]!) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return { gate, db: supabaseAdmin as unknown as AnyClient };
}

export type VoicesResult =
  | {
      readonly ok: true;
      readonly voices: {
        voiceId: string;
        name: string;
        description: string;
        /** Lydprøve hos ElevenLabs (offentlig lenke), eller null. */
        previewUrl: string | null;
      }[];
    }
  | { readonly ok: false; readonly message: string };

/** Stemmene prosjektets ElevenLabs-konto har (navn og ID, aldri nøkkelen). */
export const listVoices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => {
    const x = (d ?? {}) as Record<string, unknown>;
    if (!isId(x["projectId"])) throw new Error(L("Ugyldig prosjekt", "Invalid project"));
    return { projectId: x["projectId"] };
  })
  .handler(async ({ data, context }): Promise<VoicesResult> => {
    const a = await editorAccess(context.supabase, data.projectId, context.userId);
    if (!a) return { ok: false, message: L("Du har ikke tilgang.", "You do not have access.") };
    const key = await a.gate.projectKey(a.db, data.projectId, "elevenlabs", context.userId);
    if (!key)
      return {
        ok: false,
        message: L(
          "Ingen av prosjektets eiere har koblet til ElevenLabs (AI-leverandører).",
          "None of the project's owners has connected ElevenLabs (AI providers).",
        ),
      };
    const { decryptKey } = await import("./key-vault.server");
    const { ADAPTERS, scrubSecret } = await import("./providers.server");
    let secret: string | null = null;
    try {
      secret = await decryptKey(key, {
        userId: key.user_id,
        provider: key.provider,
        rowId: key.id,
      });
      return { ok: true, voices: await ADAPTERS.elevenlabs.voices(secret) };
    } catch (e) {
      return {
        ok: false,
        message: L(
          `Stemmene kunne ikke hentes: ${scrubSecret((e as Error).message, secret).slice(0, 300)}`,
          `The voices could not be loaded: ${scrubSecret((e as Error).message, secret).slice(0, 300)}`,
        ),
      };
    }
  });

export type SpeechResult =
  | {
      readonly ok: true;
      readonly assetId: string;
      readonly versionId: string;
      readonly media: AssetMedia;
      readonly text: string;
      readonly costUsd: number | null;
    }
  | { readonly ok: false; readonly message: string };

export const generateSpeech = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => {
    const x = (d ?? {}) as Record<string, unknown>;
    if (!isId(x["projectId"]) || !isId(x["blockId"]))
      throw new Error(L("Ugyldig replikk", "Invalid line"));
    if (typeof x["voiceId"] !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(x["voiceId"]))
      throw new Error(L("Ugyldig stemme", "Invalid voice"));
    if (x["approved"] !== true)
      throw new Error(L("Genereringen må bekreftes", "The generation must be confirmed"));
    return { projectId: x["projectId"], blockId: x["blockId"], voiceId: x["voiceId"] };
  })
  .handler(async ({ data, context }): Promise<SpeechResult> => {
    const a = await editorAccess(context.supabase, data.projectId, context.userId);
    if (!a)
      return {
        ok: false,
        message: L(
          "Du har ikke tilgang til å generere i dette prosjektet.",
          "You do not have access to generate in this project.",
        ),
      };
    const { gate, db } = a;
    const schema = await checkSchema(db);
    if (schema.kind === "missing" || schema.version < 24)
      return {
        ok: false,
        message: L(
          "Databasen er ikke oppdatert for AI-tale. Lim inn meldingen i LOVABLE_SYNC.md i Lovable.",
          "The database is not updated for AI speech. Paste the message in LOVABLE_SYNC.md into Lovable.",
        ),
      };
    const { data: proj } = await db
      .from("projects")
      .select("*")
      .eq("id", data.projectId)
      .maybeSingle();
    if (!proj || (proj as { deleted_at?: string | null }).deleted_at)
      return { ok: false, message: L("Prosjektet er slettet.", "The project has been deleted.") };
    // Teksten fra manuset (ikke fra nettleseren)
    const { data: block } = await db
      .from("script_blocks")
      .select("id, kind, text, removed")
      .eq("id", data.blockId)
      .eq("project_id", data.projectId)
      .maybeSingle();
    const b = block as { kind: string; text: string; removed: boolean } | null;
    if (!b || b.removed || b.kind !== "dialogue")
      return {
        ok: false,
        message: L("Bare replikker kan leses inn.", "Only lines can be read aloud."),
      };
    const text = b.text.replace(/\s+/g, " ").trim();
    const m = providerModel("elevenlabs", SPEECH_MODEL);
    if (!text || !m) return { ok: false, message: L("Replikken er tom.", "The line is empty.") };
    if (text.length > (m.maxPromptChars ?? 5000))
      return {
        ok: false,
        message: L(
          "Replikken er for lang til å leses inn i én del.",
          "The line is too long to be read aloud in one part.",
        ),
      };
    const key = await gate.projectKey(db, data.projectId, "elevenlabs", context.userId);
    if (!key)
      return {
        ok: false,
        message: L(
          "Ingen av prosjektets eiere har koblet til ElevenLabs (AI-leverandører).",
          "None of the project's owners has connected ElevenLabs (AI providers).",
        ),
      };
    const cost = estimateCostUsd("elevenlabs", SPEECH_MODEL, { characters: text.length });
    const hourAgo = new Date(Date.now() - 3600_000).toISOString();
    const limits = async (extra: number): Promise<string | null> => {
      const { count } = await db
        .from("generation_jobs")
        .select("id", { count: "exact", head: true })
        .eq("created_by", context.userId)
        .eq("kind", "sound")
        .gte("created_at", hourAgo);
      if ((count ?? 0) - extra >= MAX_SPEECH_JOBS_PER_USER_PER_HOUR)
        return L(
          `Grensen på ${MAX_SPEECH_JOBS_PER_USER_PER_HOUR} lyder i timen er nådd.`,
          `The limit of ${MAX_SPEECH_JOBS_PER_USER_PER_HOUR} sounds per hour has been reached.`,
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
      provider: "elevenlabs",
      model: SPEECH_MODEL,
      prompt: text,
      status: "running",
      created_by: context.userId,
      provider_key_id: key.id,
      key_owner: key.user_id,
      cost_usd: cost,
      params: {
        speech: true,
        // Innsatsnivået jobben ble kjørt med (mandat 19.3, REQ-0275)
        effort: effortOf(providerModel("elevenlabs", SPEECH_MODEL)),
        voiceId: data.voiceId,
        blockId: data.blockId,
        // Sporbarhet (DEC-0072, REQ-0257)
        trace: await (
          await import("./trace.server")
        ).buildTrace(db, data.projectId, { modelParams: { voiceId: data.voiceId } }),
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
      await db.from("generation_jobs").delete().eq("id", jobId).eq("status", "running");
      return { ok: false, message: after };
    }
    const finish = (patch: Record<string, unknown>) =>
      db
        .from("generation_jobs")
        .update({ ...patch, finished_at: new Date().toISOString() } as never)
        .eq("id", jobId);
    let charged = false;
    let secret: string | null = null;
    const { ADAPTERS, ProviderError, scrubSecret } = await import("./providers.server");
    try {
      const { decryptKey } = await import("./key-vault.server");
      secret = await decryptKey(key, {
        userId: key.user_id,
        provider: key.provider,
        rowId: key.id,
      });
      charged = true;
      const out = await ADAPTERS.elevenlabs.speech({
        key: secret,
        model: SPEECH_MODEL,
        voiceId: data.voiceId,
        text,
        language: SPEECH_LANGUAGE,
      });
      if (!out.bytes.byteLength)
        throw new Error(L("Tjenesten svarte uten lyd.", "The service replied without sound."));
      const assetId = newId<"asset">();
      const versionId = newId<"asset_version">();
      const path = `${data.projectId}/${assetId}/${versionId}/ai-tale.mp3`;
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
        assetId,
        versionId,
        text,
        costUsd: cost,
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
      const rejected = e instanceof ProviderError && e.status >= 400 && e.status < 500;
      await finish({ status: charged && !rejected ? "lost" : "failed", error: message });
      return {
        ok: false,
        message: L(
          `Replikken ble ikke lest inn: ${message}`,
          `The line could not be read aloud: ${message}`,
        ),
      };
    }
  });
