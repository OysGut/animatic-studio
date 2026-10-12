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
  adaptPromptForModel,
  effortOf,
  estimateCostUsd,
  isProviderId,
  isUuid,
  MAX_PROMPT_CHARS,
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
  if (!isId(x["projectId"]) || !isId(x["occurrenceId"])) throw new Error("Ugyldig scene");
  if (x["segmentId"] !== null && !isId(x["segmentId"])) throw new Error("Ugyldig segment");
  const prompt = x["prompt"];
  if (typeof prompt !== "string" || !prompt.trim() || prompt.length > MAX_PROMPT_CHARS)
    throw new Error("Beskrivelsen mangler eller er for lang");
  if (!isProviderId(x["provider"]) || x["provider"] === "lovable")
    throw new Error("Ukjent leverandør");
  if (typeof x["model"] !== "string" || x["model"].length > 120) throw new Error("Ugyldig modell");
  const seconds = x["seconds"];
  if (typeof seconds !== "number" || !Number.isInteger(seconds) || seconds < 1 || seconds > 60)
    throw new Error("Ugyldig lengde");
  if (x["aspect"] !== "16:9" && x["aspect"] !== "9:16") throw new Error("Ugyldig format");
  const img = x["startImagePath"];
  if (img !== null && !validReferencePath(x["projectId"], img))
    throw new Error("Ugyldig startbilde");
  if (x["approved"] !== true) throw new Error("Genereringen må bekreftes");
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
      return { ok: false, message: "Du har ikke tilgang til å generere i dette prosjektet." };
    const db = await admin();
    const schema = await checkSchema(db);
    if (schema.kind === "missing" || schema.version < (data.queue ? 25 : 24))
      return {
        ok: false,
        message: `Databasen er ikke oppdatert for AI-video${data.queue ? " i kø" : ""}. Lim inn meldingen i LOVABLE_SYNC.md i Lovable (migrasjon ${data.queue ? "0025" : "0024"}).`,
      };
    const { data: proj } = await db
      .from("projects")
      .select("*")
      .eq("id", data.projectId)
      .maybeSingle();
    if (!proj || (proj as { deleted_at?: string | null }).deleted_at)
      return { ok: false, message: "Prosjektet er slettet." };
    const { data: occ } = await db
      .from("scene_occurrences")
      .select("id")
      .eq("id", data.occurrenceId)
      .eq("project_id", data.projectId)
      .maybeSingle();
    if (!occ) return { ok: false, message: "Scenen finnes ikke i prosjektet." };
    if (data.segmentId) {
      const { data: seg } = await db
        .from("production_segments")
        .select("id")
        .eq("id", data.segmentId)
        .eq("occurrence_id", data.occurrenceId)
        .maybeSingle();
      if (!seg) return { ok: false, message: "Segmentet finnes ikke i scenen." };
    }
    const m = providerModel(data.provider, data.model);
    if (!m || m.capability !== "video")
      return { ok: false, message: "Modellen lager ikke video hos denne leverandøren." };
    // Modellens grenser gjelder uansett hva nettleseren sendte (DEC-0070)
    const adapted = adaptPromptForModel(data.prompt, m);
    if (adapted.blocked)
      return {
        ok: false,
        message:
          "Replikkene i segmentet er for lange for denne modellen (de må sendes ordrett). Del segmentet eller velg en annen modell.",
      };
    const sentPrompt = adapted.text;
    if (m.durations && !m.durations.includes(data.seconds))
      return { ok: false, message: `Modellen kan lage ${m.durations.join(", ")} sekunder.` };
    if (data.chainAfter) {
      // Bare rett etter segmentet like før i samme scene: aldri seg selv eller i ring (da ville jobben vente for alltid)
      if (!data.segmentId || data.chainAfter === data.segmentId)
        return { ok: false, message: "Et segment kan bare vente på segmentet før." };
      const { data: segs } = await db
        .from("production_segments")
        .select("id, order_key")
        .eq("occurrence_id", data.occurrenceId);
      const order = ((segs ?? []) as { id: string; order_key: string }[])
        .slice()
        .sort((a, b) => (a.order_key < b.order_key ? -1 : a.order_key > b.order_key ? 1 : 0));
      const at = order.findIndex((g) => g.id === data.segmentId);
      if (at <= 0 || order[at - 1]!.id !== data.chainAfter)
        return { ok: false, message: "Segmentet før finnes ikke i scenen." };
    }
    if (
      !data.startImagePath &&
      !data.chainAfter &&
      (data.provider === "runway" || data.provider === "fal")
    )
      return { ok: false, message: "Denne modellen trenger et startbilde." };
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
          return { ok: false, message: "Videoen startbildet kom fra, finnes ikke lenger." };
        const { error: missing } = await db.storage
          .from(BUCKET)
          .createSignedUrl(data.startImagePath, 60);
        if (missing)
          return {
            ok: false,
            message:
              "Siste bilde fra forrige segment ble ikke lagret. Legg inn videoen på nytt, eller velg et annet startbilde.",
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
        message:
          "Ingen av prosjektets eiere har koblet til denne leverandøren (AI-leverandører på prosjektlisten).",
      };
    const cost = estimateCostUsd(data.provider, data.model, { seconds: data.seconds });

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
          return `Køen er full (${MAX_QUEUED_PER_PROJECT} videoer venter). Vent til noen er ferdige.`;
      } else {
        if ((mine ?? 0) - extra >= MAX_VIDEO_JOBS_PER_USER_PER_HOUR)
          return `Grensen på ${MAX_VIDEO_JOBS_PER_USER_PER_HOUR} videoer i timen er nådd. Legg dem i kø i stedet.`;
        if ((day ?? 0) - extra >= MAX_VIDEO_JOBS_PER_PROJECT_PER_DAY)
          return `Prosjektets grense på ${MAX_VIDEO_JOBS_PER_PROJECT_PER_DAY} videoer i døgnet er nådd.`;
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
    dup = data.segmentId ? dup.eq("segment_id", data.segmentId) : dup.is("segment_id", null);
    const { count: running } = await dup;
    if ((running ?? 0) >= (data.candidates ?? 1))
      return {
        ok: false,
        message: "En video for dette segmentet lages allerede. Vent til den er ferdig.",
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
        effort: effortOf(providerModel(data.provider, data.model)),
        ...(data.chainAfter ? { chainAfter: data.chainAfter } : {}),
        // Sporbarhet (DEC-0072, REQ-0257)
        trace: await (
          await import("./trace.server")
        ).buildTrace(db, data.projectId, {
          modelParams: { seconds: data.seconds, aspect: data.aspect },
          referencePaths: [data.startImagePath],
          occurrenceId: data.occurrenceId,
          segmentId: data.segmentId,
        }),
      },
    } as never);
    if (logErr) return { ok: false, message: `Jobben kunne ikke logges: ${logErr.message}` };
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
    if (!isId(x["projectId"]) || !isId(x["jobId"])) throw new Error("Ugyldig jobb");
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
      return { state: "failed", message: "Ingen tilgang." };
    const { followUpVideoJob } = await import("./video-followup.server");
    return followUpVideoJob(await admin(), data.projectId, data.jobId);
  });
