/**
 * AI-video for et segment av en scene (DEC-0069, REQ-0180, REQ-0289–0301, REQ-0504).
 *
 * Videoen lages hos leverandøren (det tar fra sekunder til minutter). Serveren starter jobben og lagrer
 * leverandørens jobb-ID i generation_jobs; jobben lever videre selv om fanen lukkes. Hvem som helst med
 * redigeringstilgang som åpner prosjektet, får jobben fulgt opp (pollVideoJob): når den er ferdig, henter
 * serveren videoen til lagringen (`<prosjekt>/films/<take>/ai-video.mp4`) og markerer jobben ferdig. Nettleseren
 * legger den så inn som ny versjon av scenen (AddTake, kind «ai_video») – 2D-scenen endres aldri.
 *
 * Kostnadsport som for bilder: bare redaktører, bekreftelse, faste grenser, prosjektets budsjett og
 * nøkkeleierens overordnede tak (anslag: pris per sekund × lengde).
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { adaptPromptForModel, effortOf, estimateCostUsd, isProviderId, isUuid, MAX_PROMPT_CHARS, isSceneVideoSourcePath, isSceneVideoRefPath, SCENE_VIDEO_SOURCE, newId, parseQualityProfileMeta, providerModel, takeIdFromLastFrame, type QualityProfileSnapshot } from "@/core";
import { checkSchema, type AnyClient } from "@/adapters/storage/project-rows";
import { validReferencePath } from "./gateway";

const BUCKET = "assets";
const MAX_VIDEO_JOBS_PER_USER_PER_HOUR = 20;
const MAX_VIDEO_JOBS_PER_PROJECT_PER_DAY = 100;
/** Høyst så mange videoer kan vente i køen per prosjekt. */
const MAX_QUEUED_PER_PROJECT = 300;

export interface StartVideoInput {
  readonly projectId: string;
  readonly occurrenceId: string;
  readonly segmentId: string | null;
  readonly prompt: string;
  readonly provider: string;
  readonly model: string;
  readonly seconds: number;
  readonly aspect: "16:9" | "9:16";
  /** Startbildet (sti i bøtta «assets»), eller null. */
  readonly startImagePath: string | null;
  readonly approved: true;
  /** Legg jobben i køen i stedet for å sende den nå (massegenerering, DEC-0070). */
  readonly queue?: boolean;
  /** 1 høy, 2 normal, 3 lav. */
  readonly priority?: 1 | 2 | 3;
  /** Flere kandidater for samme segment (1–4, mandat 19.7): så mange kan være i arbeid samtidig. */
  readonly candidates?: number;
  /**
   * Sammenheng i køen (DEC-0071): segmentet før i samme scene. Jobben venter i køen til videoen for det
   * segmentet er ferdig og siste bilde er lagret, og bruker det som startbilde.
   */
  readonly chainAfter?: string | null;
  /**
   * Video fra 2D-scenen (DEC-0083): 2D-scenen (bare bilde) lagt i lagringen. Modellen tegner den om; lengden
   * er bitens lengde. Startbildet brukes da ikke.
   */
  readonly sourceVideoPath?: string | null;
  /** Referansebilder av figurene (høyst modellens grense), stier i bøtta «assets». */
  readonly elementPaths?: readonly string[];
  /**
   * Andre referansebilder (DEC-0085): bakgrunnen og et samlebilde av figurer. Bibliotekets bilder eller
   * samlebilder lagt i `ai-source/`. Figurer og bilder til sammen høyst modellens grense.
   */
  readonly imagePaths?: readonly string[];
  /** Scenens lyd er med i videoen som sendes (DEC-0085). */
  readonly withAudio?: boolean;
  /** Hva som sendes: 2D-scenen eller en film (AI-video/opplastet). */
  readonly sourceKind?: "animatic" | "film";
  /** Bunten og biten jobben hører til (alle bitene som ble sendt sammen for scenen). */
  readonly piece?: {
    readonly batch: string;
    readonly index: number;
    readonly count: number;
    readonly startMs: number;
    readonly endMs: number;
  } | null;
  /** Kvalitetsprofilen videoen lages med (M8, REQ-0859): øyeblikksbilde i jobbens metadata. */
  readonly qualityProfile?: QualityProfileSnapshot | null;
}

export type StartVideoResult =
  | {
      readonly ok: true;
      readonly jobId: string;
      readonly costUsd: number | null;
      readonly queued?: boolean;
    }
  | { readonly ok: false; readonly message: string };

export type { PollVideoResult } from "./video-followup.server";
import type { PollVideoResult } from "./video-followup.server";
import { t } from "@/core/i18n/keyed";

const isId = (x: unknown): x is string => typeof x === "string" && isUuid(x);

function validateStart(d: unknown): StartVideoInput {
  const x = (d ?? {}) as Record<string, unknown>;
  if (!isId(x["projectId"]) || !isId(x["occurrenceId"]))
    throw new Error(t("adapters-ai-video-functions.validate-start.message.aa56ebab8071"));
  if (x["segmentId"] !== null && !isId(x["segmentId"]))
    throw new Error(t("adapters-ai-video-functions.validate-start.message.22e92c105364"));
  const prompt = x["prompt"];
  if (typeof prompt !== "string" || !prompt.trim() || prompt.length > MAX_PROMPT_CHARS)
    throw new Error(
      t("adapters-ai-video-functions.validate-start.message.560da14d69de"),
    );
  if (!isProviderId(x["provider"]) || x["provider"] === "lovable")
    throw new Error(t("adapters-ai-video-functions.validate-start.message.3b42c8e8e536"));
  if (typeof x["model"] !== "string" || x["model"].length > 120)
    throw new Error(t("adapters-ai-video-functions.validate-start.message.32bb0f7612a2"));
  const seconds = x["seconds"];
  if (typeof seconds !== "number" || !Number.isInteger(seconds) || seconds < 1 || seconds > 60)
    throw new Error(t("adapters-ai-video-functions.validate-start.message.85b48512f5b3"));
  if (x["aspect"] !== "16:9" && x["aspect"] !== "9:16")
    throw new Error(t("adapters-ai-video-functions.validate-start.message.dd57fa8b436e"));
  const img = x["startImagePath"];
  if (img !== null && !validReferencePath(x["projectId"], img))
    throw new Error(t("adapters-ai-video-functions.validate-start.message.da96ef511596"));
  if (x["approved"] !== true)
    throw new Error(t("adapters-ai-video-functions.validate-start.message.68ce8e8d99e9"));
  // Video fra 2D-scenen (DEC-0083)
  const src = x["sourceVideoPath"] ?? null;
  if (src !== null && !isSceneVideoSourcePath(x["projectId"], src))
    throw new Error(t("adapters-ai-video-functions.validate-start.message.43720d3cd24e"));
  const els = x["elementPaths"] ?? [];
  if (
    !Array.isArray(els) ||
    els.length > 4 ||
    els.some((e) => !validReferencePath(x["projectId"] as string, e)) ||
    new Set(els).size !== els.length
  )
    throw new Error(t("adapters-ai-video-functions.validate-start.message.47b4ff6dc06b"));
  const imgs = x["imagePaths"] ?? [];
  if (
    !Array.isArray(imgs) ||
    imgs.length > 4 ||
    imgs.some(
      (e) =>
        !validReferencePath(x["projectId"] as string, e) &&
        !isSceneVideoRefPath(x["projectId"] as string, e),
    ) ||
    new Set(imgs).size !== imgs.length ||
    els.length + imgs.length > 4
  )
    throw new Error(t("adapters-ai-video-functions.validate-start.message.47b4ff6dc06b.2"));
  const pc = (x["piece"] ?? null) as Record<string, unknown> | null;
  const int = (v: unknown) => typeof v === "number" && Number.isInteger(v);
  if (
    src !== null &&
    (!pc ||
      !isId(pc["batch"]) ||
      !int(pc["index"]) ||
      !int(pc["count"]) ||
      (pc["count"] as number) < 1 ||
      (pc["count"] as number) > 200 ||
      (pc["index"] as number) < 0 ||
      (pc["index"] as number) >= (pc["count"] as number) ||
      !int(pc["startMs"]) ||
      !int(pc["endMs"]) ||
      (pc["startMs"] as number) < 0 ||
      (pc["endMs"] as number) <= (pc["startMs"] as number))
  )
    throw new Error(t("adapters-ai-video-functions.validate-start.message.83a5235cc206"));
  if (src !== null && (x["queue"] === true || img !== null))
    throw new Error(
      t("adapters-ai-video-functions.validate-start.message.a34743baf2b3"),
    );
  return {
    projectId: x["projectId"],
    occurrenceId: x["occurrenceId"],
    segmentId: (x["segmentId"] as string | null) ?? null,
    prompt: prompt.trim(),
    provider: x["provider"],
    model: x["model"],
    seconds,
    aspect: x["aspect"],
    startImagePath: (img as string | null) ?? null,
    approved: true,
    queue: x["queue"] === true,
    chainAfter: x["queue"] === true && isId(x["chainAfter"]) ? x["chainAfter"] : null,
    candidates:
      typeof x["candidates"] === "number" && Number.isInteger(x["candidates"])
        ? Math.min(4, Math.max(1, x["candidates"]))
        : 1,
    priority: x["priority"] === 1 || x["priority"] === 3 ? x["priority"] : 2,
    sourceVideoPath: src as string | null,
    elementPaths: els as string[],
    imagePaths: imgs as string[],
    withAudio: src !== null && x["withAudio"] === true,
    sourceKind: x["sourceKind"] === "film" ? "film" : "animatic",
    piece:
      src !== null && pc
        ? {
            batch: pc["batch"] as string,
            index: pc["index"] as number,
            count: pc["count"] as number,
            startMs: pc["startMs"] as number,
            endMs: pc["endMs"] as number,
          }
        : null,
    qualityProfile: parseQualityProfileMeta(x["qualityProfile"]),
  };
}

async function admin(): Promise<AnyClient> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as AnyClient;
}

export const startVideoGeneration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validateStart)
  .handler(async ({ data, context }): Promise<StartVideoResult> => {
    const gate = await import("./ai-gate.server");
    const role = await gate.memberRole(
      context.supabase as unknown as AnyClient,
      data.projectId,
      context.userId,
    );
    if ((gate.ROLE_RANK[role ?? ""] ?? 0) < gate.ROLE_RANK["editor"]!)
      return {
        ok: false,
        message: t("adapters-ai-video-functions.message.message.2edc2ee76050"),
      };
    const db = await admin();
    const schema = await checkSchema(db);
    if (schema.kind === "missing" || schema.version < (data.queue ? 25 : 24))
      return {
        ok: false,
        message: data.queue ? t("adapters-ai-video-functions.database-outdated-queue") : t("adapters-ai-video-functions.database-outdated"),
      };
    const { data: proj } = await db
      .from("projects")
      .select("*")
      .eq("id", data.projectId)
      .maybeSingle();
    if (!proj || (proj as { deleted_at?: string | null }).deleted_at)
      return { ok: false, message: t("adapters-ai-video-functions.message.message.c25ac148352f") };
    const { data: occ } = await db
      .from("scene_occurrences")
      .select("id")
      .eq("id", data.occurrenceId)
      .eq("project_id", data.projectId)
      .maybeSingle();
    if (!occ)
      return {
        ok: false,
        message: t("adapters-ai-video-functions.message.message.38182ff7ece2"),
      };
    if (data.segmentId) {
      const { data: seg } = await db
        .from("production_segments")
        .select("id")
        .eq("id", data.segmentId)
        .eq("occurrence_id", data.occurrenceId)
        .maybeSingle();
      if (!seg)
        return {
          ok: false,
          message: t("adapters-ai-video-functions.message.message.f98405bd68b5"),
        };
    }
    // Administrator kan ha slått av leverandøren eller modellen for alle (DEC-0088, migrasjon 0034)
    const aiGate = await (
      await import("@/adapters/account/ai-models.server")
    ).modelGate(db, data.provider, data.model);
    if (aiGate.message) return { ok: false, message: aiGate.message };
    const m = providerModel(data.provider, data.model, aiGate.settings);
    const fromScene = !!data.sourceVideoPath;
    if (!m || m.capability !== (fromScene ? "video_edit" : "video"))
      return {
        ok: false,
        message: fromScene
          ? t("adapters-ai-video-functions.message.message.16f8a9935786")
          : t("adapters-ai-video-functions.message.message.abc9a2f7e75c"),
      };
    if (fromScene) {
      const range = m.editSeconds!;
      if (data.seconds < range.min || data.seconds > range.max)
        return {
          ok: false,
          message: t("adapters-ai-video-functions.message.message.c4ad00bcbc04", { min: String(range.min), max: String(range.max) }),
        };
      if ((data.elementPaths?.length ?? 0) + (data.imagePaths?.length ?? 0) > (m.maxElements ?? 0))
        return {
          ok: false,
          message: t("adapters-ai-video-functions.message.message.1c8e93f08936", { value1: String(m.maxElements ?? 0) }),
        };
      // Videoen må ligge i lagringen (lastet opp av nettleseren like før)
      const { error: noVideo } = await db.storage
        .from(BUCKET)
        .createSignedUrl(data.sourceVideoPath!, 60);
      if (noVideo)
        return {
          ok: false,
          message: t("adapters-ai-video-functions.message.message.dacb922f21a0"),
        };
      const fromLibrary = [
        ...(data.elementPaths ?? []),
        ...(data.imagePaths ?? []).filter((p) => !isSceneVideoRefPath(data.projectId, p)),
      ];
      if (fromLibrary.length) {
        const { referenceImages } = await import("./gateway");
        const ok = await referenceImages(db, data.projectId, fromLibrary);
        if (!ok.ok) return { ok: false, message: ok.message };
      }
      // Samlebildene må ligge i lagringen (laget av nettleseren like før)
      for (const p of (data.imagePaths ?? []).filter((x) =>
        isSceneVideoRefPath(data.projectId, x),
      )) {
        const { error: noRef } = await db.storage.from(BUCKET).createSignedUrl(p, 60);
        if (noRef)
          return {
            ok: false,
            message: t("adapters-ai-video-functions.message.message.f8abcb80d156"),
          };
      }
    }
    // Modellens grenser gjelder uansett hva nettleseren sendte (DEC-0070)
    const adapted = adaptPromptForModel(data.prompt, m);
    if (adapted.blocked)
      return {
        ok: false,
        message: t("adapters-ai-video-functions.message.message.1f59f462f56c"),
      };
    const sentPrompt = adapted.text;
    if (!fromScene && m.durations && !m.durations.includes(data.seconds))
      return {
        ok: false,
        message: t("adapters-ai-video-functions.message.message.f2d9358d8d89", { value1: String(m.durations.join(", ")) }),
      };
    if (data.chainAfter) {
      // Bare rett etter segmentet like før i samme scene: aldri seg selv eller i ring (da ville jobben vente for alltid)
      if (!data.segmentId || data.chainAfter === data.segmentId)
        return {
          ok: false,
          message: t("adapters-ai-video-functions.message.message.bc36642718c0"),
        };
      const { data: segs } = await db
        .from("production_segments")
        .select("id, order_key")
        .eq("occurrence_id", data.occurrenceId);
      const order = ((segs ?? []) as { id: string; order_key: string }[])
        .slice()
        .sort((a, b) => (a.order_key < b.order_key ? -1 : a.order_key > b.order_key ? 1 : 0));
      const at = order.findIndex((g) => g.id === data.segmentId);
      if (at <= 0 || order[at - 1]!.id !== data.chainAfter)
        return {
          ok: false,
          message: t("adapters-ai-video-functions.message.message.4dc9c685b962"),
        };
    }
    if (
      !fromScene &&
      !data.startImagePath &&
      !data.chainAfter &&
      (data.provider === "runway" || data.provider === "fal")
    )
      return {
        ok: false,
        message: t("adapters-ai-video-functions.message.message.1ba8858a8b90"),
      };
    if (data.startImagePath) {
      // Siste bilde fra forrige segment (REQ-0263): må høre til en AI-video i prosjektet
      const fromTake = takeIdFromLastFrame(data.projectId, data.startImagePath);
      if (fromTake) {
        const { data: take } = await db
          .from("takes")
          .select("id")
          .eq("id", fromTake)
          .eq("project_id", data.projectId)
          .eq("kind", "ai_video")
          .maybeSingle();
        if (!take)
          return {
            ok: false,
            message: t("adapters-ai-video-functions.message.message.aeeb902284c9"),
          };
        const { error: missing } = await db.storage
          .from(BUCKET)
          .createSignedUrl(data.startImagePath, 60);
        if (missing)
          return {
            ok: false,
            message: t("adapters-ai-video-functions.message.message.b244cb5ba52d"),
          };
      } else {
        const { referenceImages } = await import("./gateway");
        const ok = await referenceImages(db, data.projectId, [data.startImagePath]);
        if (!ok.ok) return { ok: false, message: ok.message };
      }
    }
    const key = await gate.projectKey(db, data.projectId, data.provider, context.userId);
    if (!key)
      return {
        ok: false,
        message: t("adapters-ai-video-functions.message.message.7c30ecd24ee8"),
      };
    const cost = estimateCostUsd(
      data.provider,
      data.model,
      { seconds: data.seconds },
      aiGate.settings,
    );

    // Faste grenser, prosjektets budsjett og eierens tak – før og etter registrering
    const hourAgo = new Date(Date.now() - 3600_000).toISOString();
    const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
    const limits = async (extra: number): Promise<string | null> => {
      const [{ count: mine }, { count: day }] = await Promise.all([
        db
          .from("generation_jobs")
          .select("id", { count: "exact", head: true })
          .eq("created_by", context.userId)
          .eq("kind", "video")
          .gte("created_at", hourAgo),
        db
          .from("generation_jobs")
          .select("id", { count: "exact", head: true })
          .eq("project_id", data.projectId)
          .eq("kind", "video")
          .gte("created_at", dayAgo),
      ]);
      // Køen styrer selv takten mot leverandøren; da gjelder bare grensen for hvor mange som kan stå i kø
      if (data.queue) {
        const { count: waiting } = await db
          .from("generation_jobs")
          .select("id", { count: "exact", head: true })
          .eq("project_id", data.projectId)
          .eq("status", "queued");
        if ((waiting ?? 0) - extra >= MAX_QUEUED_PER_PROJECT)
          return t("adapters-ai-video-functions.limits.create-server-fn-method-post-middleware-require-supabase-auth-validator-validate-start-handler.10f27efe5b4f", { MAX_QUEUED_PER_PROJECT: String(MAX_QUEUED_PER_PROJECT) });
      } else {
        if ((mine ?? 0) - extra >= MAX_VIDEO_JOBS_PER_USER_PER_HOUR)
          return t("adapters-ai-video-functions.limits.create-server-fn-method-post-middleware-require-supabase-auth-validator-validate-start-handler.4706ca649b88", { MAX_VIDEO_JOBS_PER_USER_PER_HOUR: String(MAX_VIDEO_JOBS_PER_USER_PER_HOUR) });
        if ((day ?? 0) - extra >= MAX_VIDEO_JOBS_PER_PROJECT_PER_DAY)
          return t("adapters-ai-video-functions.limits.create-server-fn-method-post-middleware-require-supabase-auth-validator-validate-start-handler.72406f6d70bc", { MAX_VIDEO_JOBS_PER_PROJECT_PER_DAY: String(MAX_VIDEO_JOBS_PER_PROJECT_PER_DAY) });
      }
      const budget = await gate.overProjectBudget(
        db,
        data.projectId,
        (proj as { ai_month_limit?: number | null }).ai_month_limit,
        extra === 1,
      );
      if (budget) return budget;
      return gate.overAccountCap(db, key.user_id, cost ?? 0, extra === 1);
    };
    const before = await limits(0);
    if (before) return { ok: false, message: before };
    // Samme segment er allerede i arbeid (dobbeltklikk, «Generer alle» to ganger): ikke betal to ganger
    let dup = db
      .from("generation_jobs")
      .select("id", { count: "exact", head: true })
      .eq("project_id", data.projectId)
      .eq("kind", "video")
      .in("status", ["queued", "running"])
      .eq("occurrence_id", data.occurrenceId);
    dup = data.piece
      ? // Video fra 2D-scenen: samme bit i samme bunt
        dup.eq("params->>batch", data.piece.batch).eq("params->>piece", String(data.piece.index))
      : data.segmentId
        ? dup.eq("segment_id", data.segmentId)
        : dup.is("segment_id", null);
    const { count: running } = await dup;
    if ((running ?? 0) >= (data.candidates ?? 1))
      return {
        ok: false,
        message: t("adapters-ai-video-functions.message.message.ce01d6c0a6fb"),
      };

    const jobId = newId<"generation_job">();
    const { error: logErr } = await db.from("generation_jobs").insert({
      id: jobId,
      project_id: data.projectId,
      kind: "video",
      provider: data.provider,
      model: data.model,
      prompt: sentPrompt,
      reference_path: data.startImagePath,
      status: data.queue ? "queued" : "running",
      // Kolonnene for køen finnes fra migrasjon 0025
      ...(schema.version >= 25
        ? {
            priority: data.priority,
            queue_position: Date.now(),
            started_at: data.queue ? null : new Date().toISOString(),
          }
        : {}),
      created_by: context.userId,
      occurrence_id: data.occurrenceId,
      segment_id: data.segmentId,
      provider_key_id: key.id,
      key_owner: key.user_id,
      cost_usd: cost,
      params: {
        seconds: data.seconds,
        aspect: data.aspect,
        // Innsatsnivået jobben ble kjørt med (mandat 19.3, REQ-0275)
        effort: effortOf(providerModel(data.provider, data.model, aiGate.settings)),
        // Kvalitetsprofilen videoen ble laget med (M8, REQ-0859): et øyeblikksbilde
        ...(data.qualityProfile ? { qualityProfile: data.qualityProfile } : {}),
        ...(data.chainAfter ? { chainAfter: data.chainAfter } : {}),
        // Video fra 2D-scenen (DEC-0083): kilden, bunten og biten, og figurenes referansebilder
        ...(data.piece
          ? {
              source: SCENE_VIDEO_SOURCE,
              sourceVideoPath: data.sourceVideoPath,
              elementPaths: data.elementPaths ?? [],
              imagePaths: data.imagePaths ?? [],
              withAudio: !!data.withAudio,
              sourceKind: data.sourceKind ?? "animatic",
              batch: data.piece.batch,
              piece: data.piece.index,
              pieces: data.piece.count,
              startMs: data.piece.startMs,
              endMs: data.piece.endMs,
            }
          : {}),
        // Sporbarhet (DEC-0072, REQ-0257)
        trace: await (
          await import("./trace.server")
        ).buildTrace(db, data.projectId, {
          modelParams: { seconds: data.seconds, aspect: data.aspect },
          referencePaths: data.piece
            ? [
                data.sourceVideoPath ?? null,
                ...(data.elementPaths ?? []),
                ...(data.imagePaths ?? []),
              ]
            : [data.startImagePath],
          occurrenceId: data.occurrenceId,
          segmentId: data.segmentId,
        }),
      },
    } as never);
    if (logErr)
      return {
        ok: false,
        message: t("adapters-ai-video-functions.message.message.939e0af974ce", { message: String(logErr.message) }),
      };
    const after = await limits(1);
    if (after) {
      // Bare en jobb som fortsatt venter eller ikke er sendt, tas bort (køen kan ha rukket å sende den)
      await db
        .from("generation_jobs")
        .delete()
        .eq("id", jobId)
        .in("status", data.queue ? ["queued"] : ["running"])
        .is("external_id", null);
      return { ok: false, message: after };
    }

    if (data.queue) {
      // Køen sender jobben når det er ledig plass hos leverandøren (høyst 3 samtidig per nøkkel)
      const { pumpVideoQueue } = await import("./video-followup.server");
      await pumpVideoQueue(db, { projectId: data.projectId });
      return { ok: true, jobId, costUsd: cost, queued: true };
    }
    const { submitVideoJob } = await import("./video-followup.server");
    const r = await submitVideoJob(db, jobId);
    return r.ok ? { ok: true, jobId, costUsd: cost } : { ok: false, message: r.message };
  });

export const pollVideoJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => {
    const x = (d ?? {}) as Record<string, unknown>;
    if (!isId(x["projectId"]) || !isId(x["jobId"]))
      throw new Error(t("adapters-ai-video-functions.poll-video-job.create-server-fn-method-post-middleware-require-supabase-auth-validator.e6ba7f8ab950"));
    return { projectId: x["projectId"], jobId: x["jobId"] };
  })
  .handler(async ({ data, context }): Promise<PollVideoResult> => {
    const gate = await import("./ai-gate.server");
    const role = await gate.memberRole(
      context.supabase as unknown as AnyClient,
      data.projectId,
      context.userId,
    );
    if ((gate.ROLE_RANK[role ?? ""] ?? 0) < gate.ROLE_RANK["editor"]!)
      return { state: "failed", message: t("adapters-ai-video-functions.message.message.43e67adffce2") };
    const { followUpVideoJob } = await import("./video-followup.server");
    return followUpVideoJob(await admin(), data.projectId, data.jobId);
  });

/**
 * Hent en video som ble merket «Betalt, ikke lagret» på nytt (DEC-0086). Jobben settes tilbake til «pågår»
 * og leverandøren spørres med den lagrede jobb-ID-en; ingenting sendes på nytt, så det koster ikke noe.
 * Gir leverandøren ikke videoen (for gammel, feilet), merkes jobben igjen.
 */
export const refetchVideoJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => {
    const x = (d ?? {}) as Record<string, unknown>;
    if (!isId(x["projectId"]) || !isId(x["jobId"]))
      throw new Error(t("adapters-ai-video-functions.refetch-video-job.create-server-fn-method-post-middleware-require-supabase-auth-validator.bed951724cd1"));
    return { projectId: x["projectId"], jobId: x["jobId"] };
  })
  .handler(async ({ data, context }): Promise<PollVideoResult> => {
    const gate = await import("./ai-gate.server");
    const role = await gate.memberRole(
      context.supabase as unknown as AnyClient,
      data.projectId,
      context.userId,
    );
    if ((gate.ROLE_RANK[role ?? ""] ?? 0) < gate.ROLE_RANK["editor"]!)
      return { state: "failed", message: t("adapters-ai-video-functions.message.message.43e67adffce2.2") };
    const db = await admin();
    const { data: row } = await db
      .from("generation_jobs")
      .select("id, kind, status, external_id, provider_key_id")
      .eq("id", data.jobId)
      .eq("project_id", data.projectId)
      .maybeSingle();
    const job = row as {
      kind: string;
      status: string;
      external_id: string | null;
      provider_key_id: string | null;
    } | null;
    if (!job || job.kind !== "video" || job.status !== "lost" || !job.external_id)
      return {
        state: "failed",
        message: t("adapters-ai-video-functions.message.message.61d9b06904f4"),
      };
    await db
      .from("generation_jobs")
      .update({ status: "running", error: null, finished_at: null } as never)
      .eq("id", data.jobId)
      .eq("status", "lost");
    const { followUpVideoJob } = await import("./video-followup.server");
    return followUpVideoJob(db, data.projectId, data.jobId);
  });
