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
import {
  L,
  adaptPromptForModel,
  effortOf,
  estimateCostUsd,
  isProviderId,
  isUuid,
  MAX_PROMPT_CHARS,
  isSceneVideoSourcePath,
  isSceneVideoRefPath,
  SCENE_VIDEO_SOURCE,
  newId,
  providerModel,
  takeIdFromLastFrame,
} from "@/core";
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

const isId = (x: unknown): x is string => typeof x === "string" && isUuid(x);

function validateStart(d: unknown): StartVideoInput {
  const x = (d ?? {}) as Record<string, unknown>;
  if (!isId(x["projectId"]) || !isId(x["occurrenceId"]))
    throw new Error(L("Ugyldig scene", "Invalid scene"));
  if (x["segmentId"] !== null && !isId(x["segmentId"]))
    throw new Error(L("Ugyldig segment", "Invalid segment"));
  const prompt = x["prompt"];
  if (typeof prompt !== "string" || !prompt.trim() || prompt.length > MAX_PROMPT_CHARS)
    throw new Error(
      L("Beskrivelsen mangler eller er for lang", "The description is missing or too long"),
    );
  if (!isProviderId(x["provider"]) || x["provider"] === "lovable")
    throw new Error(L("Ukjent leverandør", "Unknown provider"));
  if (typeof x["model"] !== "string" || x["model"].length > 120)
    throw new Error(L("Ugyldig modell", "Invalid model"));
  const seconds = x["seconds"];
  if (typeof seconds !== "number" || !Number.isInteger(seconds) || seconds < 1 || seconds > 60)
    throw new Error(L("Ugyldig lengde", "Invalid length"));
  if (x["aspect"] !== "16:9" && x["aspect"] !== "9:16")
    throw new Error(L("Ugyldig format", "Invalid format"));
  const img = x["startImagePath"];
  if (img !== null && !validReferencePath(x["projectId"], img))
    throw new Error(L("Ugyldig startbilde", "Invalid start image"));
  if (x["approved"] !== true)
    throw new Error(L("Genereringen må bekreftes", "The generation must be confirmed"));
  // Video fra 2D-scenen (DEC-0083)
  const src = x["sourceVideoPath"] ?? null;
  if (src !== null && !isSceneVideoSourcePath(x["projectId"], src))
    throw new Error(L("Ugyldig video fra 2D-scenen", "Invalid video from the 2D scene"));
  const els = x["elementPaths"] ?? [];
  if (
    !Array.isArray(els) ||
    els.length > 4 ||
    els.some((e) => !validReferencePath(x["projectId"] as string, e)) ||
    new Set(els).size !== els.length
  )
    throw new Error(L("Ugyldige referansebilder", "Invalid reference images"));
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
    throw new Error(L("Ugyldige referansebilder", "Invalid reference images"));
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
    throw new Error(L("Ugyldig bit av scenen", "Invalid piece of the scene"));
  if (src !== null && (x["queue"] === true || img !== null))
    throw new Error(
      L(
        "Video fra 2D-scenen sendes uten kø og uten startbilde",
        "Video from the 2D scene is sent without queue and without a start image",
      ),
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
        message: L(
          "Du har ikke tilgang til å generere i dette prosjektet.",
          "You do not have access to generate in this project.",
        ),
      };
    const db = await admin();
    const schema = await checkSchema(db);
    if (schema.kind === "missing" || schema.version < (data.queue ? 25 : 24))
      return {
        ok: false,
        message: L(
          `Databasen er ikke oppdatert for AI-video${data.queue ? " i kø" : ""}. Kontakt administratoren for å oppdatere Animatic Studio."0025" : "0024"}).`,
          `The database is not up to date for AI video${data.queue ? " in the queue" : ""}. Contact the administrator to update Animatic Studio."0025" : "0024"}).`,
        ),
      };
    const { data: proj } = await db
      .from("projects")
      .select("*")
      .eq("id", data.projectId)
      .maybeSingle();
    if (!proj || (proj as { deleted_at?: string | null }).deleted_at)
      return { ok: false, message: L("Prosjektet er slettet.", "The project has been deleted.") };
    const { data: occ } = await db
      .from("scene_occurrences")
      .select("id")
      .eq("id", data.occurrenceId)
      .eq("project_id", data.projectId)
      .maybeSingle();
    if (!occ)
      return {
        ok: false,
        message: L("Scenen finnes ikke i prosjektet.", "The scene does not exist in the project."),
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
          message: L("Segmentet finnes ikke i scenen.", "The segment does not exist in the scene."),
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
          ? L(
              "Modellen kan ikke lage video fra 2D-scenen.",
              "The model cannot make video from the 2D scene.",
            )
          : L(
              "Modellen lager ikke video hos denne leverandøren.",
              "This model does not make video with this provider.",
            ),
      };
    if (fromScene) {
      const range = m.editSeconds!;
      if (data.seconds < range.min || data.seconds > range.max)
        return {
          ok: false,
          message: L(
            `Modellen tar imot ${range.min}–${range.max} sekunder om gangen.`,
            `The model accepts ${range.min}–${range.max} seconds at a time.`,
          ),
        };
      if ((data.elementPaths?.length ?? 0) + (data.imagePaths?.length ?? 0) > (m.maxElements ?? 0))
        return {
          ok: false,
          message: L(
            `Modellen tar imot høyst ${m.maxElements ?? 0} referansebilder.`,
            `The model accepts at most ${m.maxElements ?? 0} reference images.`,
          ),
        };
      // Videoen må ligge i lagringen (lastet opp av nettleseren like før)
      const { error: noVideo } = await db.storage
        .from(BUCKET)
        .createSignedUrl(data.sourceVideoPath!, 60);
      if (noVideo)
        return {
          ok: false,
          message: L(
            "Videoen av 2D-scenen finnes ikke i lagringen. Prøv igjen.",
            "The video of the 2D scene is not in storage. Try again.",
          ),
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
            message: L(
              "Et samlebilde av figurene finnes ikke i lagringen. Prøv igjen.",
              "A reference sheet of the figures is not in storage. Try again.",
            ),
          };
      }
    }
    // Modellens grenser gjelder uansett hva nettleseren sendte (DEC-0070)
    const adapted = adaptPromptForModel(data.prompt, m);
    if (adapted.blocked)
      return {
        ok: false,
        message: L(
          "Replikkene i segmentet er for lange for denne modellen (de må sendes ordrett). Del segmentet eller velg en annen modell.",
          "The lines in the segment are too long for this model (they must be sent verbatim). Split the segment or choose another model.",
        ),
      };
    const sentPrompt = adapted.text;
    if (!fromScene && m.durations && !m.durations.includes(data.seconds))
      return {
        ok: false,
        message: L(
          `Modellen kan lage ${m.durations.join(", ")} sekunder.`,
          `The model can make ${m.durations.join(", ")} seconds.`,
        ),
      };
    if (data.chainAfter) {
      // Bare rett etter segmentet like før i samme scene: aldri seg selv eller i ring (da ville jobben vente for alltid)
      if (!data.segmentId || data.chainAfter === data.segmentId)
        return {
          ok: false,
          message: L(
            "Et segment kan bare vente på segmentet før.",
            "A segment can only wait for the segment before it.",
          ),
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
          message: L(
            "Segmentet før finnes ikke i scenen.",
            "The segment before does not exist in the scene.",
          ),
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
        message: L("Denne modellen trenger et startbilde.", "This model needs a start image."),
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
            message: L(
              "Videoen startbildet kom fra, finnes ikke lenger.",
              "The video the start image came from no longer exists.",
            ),
          };
        const { error: missing } = await db.storage
          .from(BUCKET)
          .createSignedUrl(data.startImagePath, 60);
        if (missing)
          return {
            ok: false,
            message: L(
              "Siste bilde fra forrige segment ble ikke lagret. Legg inn videoen på nytt, eller velg et annet startbilde.",
              "The last frame of the previous segment was not saved. Add the video again, or choose another start image.",
            ),
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
        message: L(
          "Ingen av prosjektets eiere har koblet til denne leverandøren (AI-leverandører på prosjektlisten).",
          "None of the project's owners have connected this provider (AI providers on the project list).",
        ),
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
          return L(
            `Køen er full (${MAX_QUEUED_PER_PROJECT} videoer venter). Vent til noen er ferdige.`,
            `The queue is full (${MAX_QUEUED_PER_PROJECT} videos waiting). Wait until some are finished.`,
          );
      } else {
        if ((mine ?? 0) - extra >= MAX_VIDEO_JOBS_PER_USER_PER_HOUR)
          return L(
            `Grensen på ${MAX_VIDEO_JOBS_PER_USER_PER_HOUR} videoer i timen er nådd. Legg dem i kø i stedet.`,
            `The limit of ${MAX_VIDEO_JOBS_PER_USER_PER_HOUR} videos per hour has been reached. Queue them instead.`,
          );
        if ((day ?? 0) - extra >= MAX_VIDEO_JOBS_PER_PROJECT_PER_DAY)
          return L(
            `Prosjektets grense på ${MAX_VIDEO_JOBS_PER_PROJECT_PER_DAY} videoer i døgnet er nådd.`,
            `The project's limit of ${MAX_VIDEO_JOBS_PER_PROJECT_PER_DAY} videos per day has been reached.`,
          );
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
        message: L(
          "En video for dette segmentet lages allerede. Vent til den er ferdig.",
          "A video for this segment is already being made. Wait until it is finished.",
        ),
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
        message: L(
          `Jobben kunne ikke logges: ${logErr.message}`,
          `The job could not be logged: ${logErr.message}`,
        ),
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
      throw new Error(L("Ugyldig jobb", "Invalid job"));
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
      return { state: "failed", message: L("Ingen tilgang.", "No access.") };
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
      throw new Error(L("Ugyldig jobb", "Invalid job"));
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
      return { state: "failed", message: L("Ingen tilgang.", "No access.") };
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
        message: L("Denne videoen kan ikke hentes på nytt.", "This video cannot be fetched again."),
      };
    await db
      .from("generation_jobs")
      .update({ status: "running", error: null, finished_at: null } as never)
      .eq("id", data.jobId)
      .eq("status", "lost");
    const { followUpVideoJob } = await import("./video-followup.server");
    return followUpVideoJob(db, data.projectId, data.jobId);
  });
