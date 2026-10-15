/**
 * Oppfølging av én AI-videojobb (DEC-0069, DEC-0070). BARE PÅ SERVEREN. Brukes både når nettleseren spør
 * (pollVideoJob) og av bakgrunnskøen (/api/public/cron/ai-jobs), så videoer hentes inn også når ingen har
 * prosjektet åpent. Ferdige videoer lagres i `<prosjekt>/films/<take>/ai-video.mp4`; bare én henter vinner.
 */
import {
  L,
  filmFilePath,
  lastFramePath,
  newId,
  SCENE_VIDEO_SOURCE,
  VIDEO_JOB_MAX_MS,
} from "@/core";
import type { KeyRow } from "./ai-gate.server";
import type { AnyClient } from "@/adapters/storage/project-rows";

const BUCKET = "assets";
export { VIDEO_JOB_MAX_MS };

export type PollVideoResult =
  | { readonly state: "running"; readonly progress?: number }
  | { readonly state: "done"; readonly resultPath: string }
  | { readonly state: "failed"; readonly message: string };

export async function followUpVideoJob(
  db: AnyClient,
  projectId: string,
  jobId: string,
): Promise<PollVideoResult> {
  const { data: row } = await db
    .from("generation_jobs")
    .select(
      // «*»: started_at finnes bare fra migrasjon 0025
      "*",
    )
    .eq("id", jobId)
    .eq("project_id", projectId)
    .maybeSingle();
  const job = row as {
    id: string;
    kind: string;
    provider: string;
    model: string;
    status: string;
    external_id: string | null;
    provider_key_id: string | null;
    created_at: string;
    started_at?: string | null;
    result_path: string | null;
  } | null;
  if (!job || job.kind !== "video")
    return { state: "failed", message: L("Jobben finnes ikke.", "The job does not exist.") };
  if (job.status === "done" && job.result_path)
    return { state: "done", resultPath: job.result_path };
  if (job.status === "queued") return { state: "running" };
  if (job.status !== "running")
    return { state: "failed", message: L("Jobben feilet.", "The job failed.") };
  const fail = async (
    message: string,
    status: "failed" | "lost" = "failed",
  ): Promise<PollVideoResult> => {
    await db
      .from("generation_jobs")
      .update({
        status,
        error: message.slice(0, 2000),
        finished_at: new Date().toISOString(),
      } as never)
      .eq("id", job.id)
      .eq("status", "running");
    return { state: "failed", message };
  };
  if (!job.external_id) {
    // Startet, men leverandøren svarte aldri (fanen ble lukket under oppstart): regnes som stoppet
    return Date.now() - Date.parse(job.started_at ?? job.created_at) > 10 * 60_000
      ? fail(
          L("Jobben kom aldri i gang hos leverandøren.", "The job never started at the provider."),
        )
      : { state: "running" };
  }
  // Tiden regnes fra jobben ble sendt (den kan ha ventet lenge i køen). Leverandøren spørres ALLTID først
  // (DEC-0086): en video som ble ferdig mens ingen hadde prosjektet åpent, skal hentes inn, ikke tapes.
  const tooOld = Date.now() - Date.parse(job.started_at ?? job.created_at) > VIDEO_JOB_MAX_MS;
  // Kan være belastet hos leverandøren: regnes med i taket
  const giveUp = () =>
    fail(
      L(
        "Leverandøren ble ikke ferdig med videoen innen sju dager.",
        "The provider did not finish the video within seven days.",
      ),
      "lost",
    );
  if (!job.provider_key_id)
    return fail(
      L(
        "Nøkkelen er fjernet, så videoen kan ikke hentes.",
        "The key was removed, so the video cannot be fetched.",
      ),
    );
  const { data: keyRow } = await db
    .from("ai_provider_keys")
    .select("id, user_id, provider, ciphertext, iv, key_version")
    .eq("id", job.provider_key_id)
    .maybeSingle();
  if (!keyRow)
    return fail(
      L(
        "Nøkkelen er fjernet, så videoen kan ikke hentes.",
        "The key was removed, so the video cannot be fetched.",
      ),
    );
  const k = keyRow as {
    id: string;
    user_id: string;
    provider: string;
    ciphertext: string;
    iv: string;
    key_version: number;
  };
  const { ADAPTERS, ProviderError, scrubSecret } = await import("./providers.server");
  let secret: string;
  try {
    const { decryptKey } = await import("./key-vault.server");
    secret = await decryptKey(k, { userId: k.user_id, provider: k.provider, rowId: k.id });
  } catch (e) {
    return fail((e as Error).message);
  }
  try {
    const adapter = ADAPTERS[job.provider as "openai" | "google" | "fal" | "runway"];
    if (!adapter || !("pollVideo" in adapter))
      return fail(L("Leverandøren lager ikke video.", "The provider does not make video."));
    const r = await adapter.pollVideo(secret, job.model, job.external_id);
    if (r.state === "running") {
      if (tooOld) return giveUp();
      if (typeof r.progress === "number")
        await db
          .from("generation_jobs")
          .update({ progress: Math.max(0, Math.min(1, r.progress)) } as never)
          .eq("id", job.id)
          .eq("status", "running");
      return r;
    }
    if (r.state === "failed") return fail(scrubSecret(r.message, secret));
    const takeId = newId<"take">();
    const path = filmFilePath(projectId, "generated", takeId, "ai-video.mp4");
    const { error: upErr } = await db.storage
      .from(BUCKET)
      .upload(path, new Blob([r.bytes as unknown as ArrayBuffer], { type: r.mimeType }), {
        contentType: r.mimeType.startsWith("video/") ? r.mimeType : "video/mp4",
        upsert: false,
      });
    if (upErr)
      throw new Error(
        L(
          `Videoen kunne ikke lagres: ${upErr.message}`,
          `The video could not be saved: ${upErr.message}`,
        ),
      );
    // Bare én henter vinner (samtidig oppfølging fra to faner): den andre ser jobben som ferdig
    const { data: won } = await db
      .from("generation_jobs")
      .update({
        status: "done",
        result_path: path,
        finished_at: new Date().toISOString(),
      } as never)
      .eq("id", job.id)
      .eq("status", "running")
      .select("id");
    if (!won || (won as unknown[]).length === 0) {
      await db.storage.from(BUCKET).remove([path]);
      const { data: now } = await db
        .from("generation_jobs")
        .select("result_path")
        .eq("id", job.id)
        .maybeSingle();
      const rp = (now as { result_path?: string | null } | null)?.result_path;
      return rp ? { state: "done", resultPath: rp } : { state: "running" };
    }
    return { state: "done", resultPath: path };
  } catch (e) {
    // Varig avslag fra leverandøren (ikke for mange forespørsler): stopp oppfølgingen
    if (e instanceof ProviderError && e.status >= 400 && e.status < 500 && e.status !== 429)
      return fail(scrubSecret(e.message, secret));
    if (tooOld) return giveUp();
    // Nettfeil: prøv igjen ved neste oppfølging (jobben står fortsatt hos leverandøren)
    // Aldri nøkkelen i loggen (REQ-0414): leverandøren kan gjenta den i feilteksten
    console.warn(
      // i18n-ignore
      "[videojobb] prøver igjen senere:",
      scrubSecret((e as Error).message, secret).slice(0, 200),
    );
    return { state: "running" };
  }
}

export interface FollowUpSummary {
  /** Bilde-, lyd- og tekstjobber som ble stoppet av plattformen og nå er merket «lost». */
  readonly stopped?: number;
  readonly checked: number;
  readonly done: number;
  readonly failed: number;
  readonly running: number;
}

/**
 * Følg opp de eldste videojobbene som pågår (bakgrunnskøen). Hver jobb følges opp høyst én gang per runde,
 * innenfor et tidsbudsjett, så kallet blir ferdig før plattformens tidsgrense.
 */
export async function followUpRunningVideoJobs(
  db: AnyClient,
  opts: { readonly maxJobs?: number; readonly budgetMs?: number; readonly now?: () => number } = {},
): Promise<FollowUpSummary> {
  const now = opts.now ?? Date.now;
  const started = now();
  const budget = opts.budgetMs ?? 45_000;
  const { data } = await db
    .from("generation_jobs")
    .select("id, project_id")
    .eq("kind", "video")
    .eq("status", "running")
    .order("created_at", { ascending: true })
    .limit(opts.maxJobs ?? 25);
  const jobs = (data ?? []) as { id: string; project_id: string }[];
  let done = 0;
  let failed = 0;
  let running = 0;
  let checked = 0;
  for (const j of jobs) {
    if (now() - started > budget) break;
    checked++;
    try {
      const r = await followUpVideoJob(db, j.project_id, j.id);
      if (r.state === "done") done++;
      else if (r.state === "failed") failed++;
      else running++;
    } catch {
      running++;
    }
  }
  return { checked, done, failed, running };
}

/**
 * Bilder, lyd og AI-skrevne beskrivelser lages i ett kall. Står en slik jobb fortsatt som «pågår» etter
 * 15 minutter, ble kallet stoppet av plattformen; den merkes «lost» (kan ha kostet, teller i taket) så
 * listen ikke viser den som pågående for alltid (KI-145).
 */
export async function markStoppedSyncJobs(
  db: AnyClient,
  now = Date.now(),
  /** Bare dette prosjektet (når nettleseren gjør jobben, DEC-0073); ellers alle. */
  projectId?: string,
): Promise<number> {
  const base = db
    .from("generation_jobs")
    .update({
      status: "lost",
      error: L(
        "Stoppet underveis (ingen svar innen 15 minutter).",
        "Stopped partway (no reply within 15 minutes).",
      ),
      finished_at: new Date(now).toISOString(),
    } as never)
    .in("kind", ["image", "sound", "prompt"])
    .eq("status", "running")
    .lt("created_at", new Date(now - 15 * 60_000).toISOString());
  const { data } = await (projectId ? base.eq("project_id", projectId) : base).select("id");
  return ((data ?? []) as unknown[]).length;
}

/** Høyst så mange videoer kjører samtidig hos leverandøren per nøkkel (REQ-0301). */
export const MAX_PARALLEL_PER_KEY = 3;

interface JobForSubmit {
  readonly id: string;
  readonly provider: string;
  readonly model: string;
  readonly prompt: string;
  readonly reference_path: string | null;
  readonly provider_key_id: string | null;
  readonly params: {
    seconds?: number;
    aspect?: "16:9" | "9:16";
    /** Video fra 2D-scenen (DEC-0083). */
    source?: string;
    sourceVideoPath?: string;
    elementPaths?: string[];
    imagePaths?: string[];
    withAudio?: boolean;
  } | null;
}

/**
 * Send en registrert videojobb til leverandøren og lagre leverandørens jobb-ID. Jobben må stå som «running»
 * (sendes) – køen setter den dit først. Et klart avslag fra leverandøren gir «failed» (koster ikke);
 * tidsavbrudd og nettfeil etter innsending gir «lost» (kan ha kostet, teller i taket).
 */
export async function submitVideoJob(
  db: AnyClient,
  jobId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { data: row } = await db
    .from("generation_jobs")
    .select("id, provider, model, prompt, reference_path, provider_key_id, params")
    .eq("id", jobId)
    .maybeSingle();
  const job = row as JobForSubmit | null;
  if (!job) return { ok: false, message: L("Jobben finnes ikke.", "The job does not exist.") };
  const end = async (status: "failed" | "lost", message: string) =>
    db
      .from("generation_jobs")
      .update({ status, error: message, finished_at: new Date().toISOString() } as never)
      .eq("id", jobId)
      .eq("status", "running");
  const keyRemoved = L("Nøkkelen er fjernet.", "The key was removed.");
  if (!job.provider_key_id) {
    await end("failed", keyRemoved);
    return { ok: false, message: keyRemoved };
  }
  const { data: keyData } = await db
    .from("ai_provider_keys")
    .select("id, user_id, provider, ciphertext, iv, key_version")
    .eq("id", job.provider_key_id)
    .maybeSingle();
  const key = keyData as KeyRow | null;
  if (!key) {
    await end("failed", keyRemoved);
    return { ok: false, message: keyRemoved };
  }
  let secret: string | null = null;
  let submitted = false;
  const { ADAPTERS, ProviderError, scrubSecret } = await import("./providers.server");
  try {
    const { decryptKey } = await import("./key-vault.server");
    secret = await decryptKey(key, { userId: key.user_id, provider: key.provider, rowId: key.id });
    let image: { blob: Blob; url: string } | null = null;
    if (job.reference_path) {
      const { data: blob } = await db.storage.from(BUCKET).download(job.reference_path);
      const { data: signed } = await db.storage
        .from(BUCKET)
        .createSignedUrl(job.reference_path, 3600);
      if (!blob || !signed?.signedUrl)
        throw new Error(
          L("Startbildet kunne ikke hentes.", "The start image could not be fetched."),
        );
      image = { blob, url: signed.signedUrl };
    }
    const adapter = ADAPTERS[job.provider as "openai" | "google" | "fal" | "runway"];
    if (!adapter || !("startVideo" in adapter))
      throw new Error(L("Leverandøren lager ikke video.", "The provider does not make video."));
    // Video fra 2D-scenen (DEC-0083): videoen og figurenes bilder sendes som midlertidige lenker
    if (job.params?.source === SCENE_VIDEO_SOURCE) {
      if (!("editVideo" in adapter))
        throw new Error(
          L(
            "Leverandøren kan ikke lage video fra 2D-scenen.",
            "The provider cannot make video from the 2D scene.",
          ),
        );
      const sign = async (path: string, what: string) => {
        const { data: signed } = await db.storage.from(BUCKET).createSignedUrl(path, 3600);
        if (!signed?.signedUrl)
          throw new Error(L(`${what} kunne ikke hentes.`, `${what} could not be fetched.`));
        return signed.signedUrl;
      };
      const videoUrl = await sign(
        job.params.sourceVideoPath ?? "",
        L("Videoen av 2D-scenen", "The video of the 2D scene"),
      );
      const elementUrls: string[] = [];
      for (const p of job.params.elementPaths ?? [])
        elementUrls.push(await sign(p, L("Et referansebilde", "A reference image")));
      const imageUrls: string[] = [];
      for (const p of job.params.imagePaths ?? [])
        imageUrls.push(await sign(p, L("Et referansebilde", "A reference image")));
      submitted = true;
      const editId = await adapter.editVideo({
        key: secret,
        model: job.model,
        prompt: job.prompt,
        videoUrl,
        elementUrls,
        imageUrls,
        keepAudio: !!job.params.withAudio,
      });
      const { error: idErr2 } = await db
        .from("generation_jobs")
        .update({ external_id: editId } as never)
        .eq("id", jobId)
        .eq("status", "running");
      if (idErr2) {
        await end(
          "lost",
          L(
            `Jobben startet, men kunne ikke registreres: ${idErr2.message}`,
            `The job started, but could not be registered: ${idErr2.message}`,
          ),
        );
        return {
          ok: false,
          message: L(
            "Videoen ble startet hos leverandøren, men kunne ikke registreres her. Den regnes med i kostnadstaket.",
            "The video was started at the provider, but could not be registered here. It counts towards the cost limit.",
          ),
        };
      }
      return { ok: true };
    }
    submitted = true;
    const externalId = await adapter.startVideo({
      key: secret,
      model: job.model,
      prompt: job.prompt,
      image,
      seconds: job.params?.seconds ?? 5,
      aspect: job.params?.aspect ?? "16:9",
    });
    const { error: idErr } = await db
      .from("generation_jobs")
      .update({ external_id: externalId } as never)
      .eq("id", jobId)
      .eq("status", "running");
    if (idErr) {
      await end(
        "lost",
        L(
          `Jobben startet, men kunne ikke registreres: ${idErr.message}`,
          `The job started, but could not be registered: ${idErr.message}`,
        ),
      );
      return {
        ok: false,
        message: L(
          "Videoen ble startet hos leverandøren, men kunne ikke registreres her. Den regnes med i kostnadstaket.",
          "The video was started at the provider, but could not be registered here. It counts towards the cost limit.",
        ),
      };
    }
    return { ok: true };
  } catch (e) {
    const message = scrubSecret(
      (e as Error).message || L("Ukjent feil", "Unknown error"),
      secret,
    ).slice(0, 2000);
    // For mange forespørsler (429): jobben er ikke startet hos leverandøren og legges tilbake i køen
    // (DEC-0073) i stedet for å feile – den sendes igjen når det er plass
    if (e instanceof ProviderError && e.status === 429) {
      await db
        .from("generation_jobs")
        .update({ status: "queued", started_at: null } as never)
        .eq("id", jobId)
        .eq("status", "running");
      return {
        ok: false,
        message: L(
          "Leverandøren er opptatt. Videoen ligger i kø og sendes når det er plass.",
          "The provider is busy. The video is queued and will be sent when there is room.",
        ),
      };
    }
    const rejected = e instanceof ProviderError && e.status >= 400 && e.status < 600;
    await end(submitted && !rejected ? "lost" : "failed", message);
    return {
      ok: false,
      message: L(
        `Videoen kunne ikke startes: ${message}`,
        `The video could not be started: ${message}`,
      ),
    };
  }
}

/**
 * Send ventende videojobber i køen (prioritet, så rekkefølge) når nøkkelen har ledig plass. Hver jobb tas
 * med en betinget oppdatering (queued → running), så to samtidige kall aldri sender samme jobb.
 */
export async function pumpVideoQueue(
  db: AnyClient,
  opts: { readonly projectId?: string; readonly max?: number; readonly budgetMs?: number } = {},
): Promise<number> {
  const started = Date.now();
  let q = db
    .from("generation_jobs")
    .select("id, project_id, provider_key_id, key_owner, cost_usd, params")
    .eq("kind", "video")
    .eq("status", "queued");
  if (opts.projectId) q = q.eq("project_id", opts.projectId);
  // Et stort vindu, så jobber for andre nøkler ikke venter bak en full nøkkel
  const { data } = await q
    .order("priority", { ascending: true })
    .order("queue_position", { ascending: true })
    .limit(opts.max ?? 200);
  const waiting = (data ?? []) as {
    id: string;
    project_id: string;
    provider_key_id: string | null;
    key_owner?: string | null;
    cost_usd?: number | string | null;
    params?: { chainAfter?: string } | null;
  }[];
  // Slettede prosjekter: jobbene avbrytes (de er ikke sendt, så de koster ingenting)
  const projectIds = [...new Set(waiting.map((j) => j.project_id))];
  const deleted = new Set<string>();
  if (projectIds.length) {
    const { data: projs } = await db.from("projects").select("id, deleted_at").in("id", projectIds);
    for (const p of (projs ?? []) as { id: string; deleted_at: string | null }[])
      if (p.deleted_at) deleted.add(p.id);
    for (const id of projectIds)
      if (!((projs ?? []) as { id: string }[]).some((p) => p.id === id)) deleted.add(id);
  }
  const busy = new Map<string, number>();
  let sent = 0;
  for (const j of waiting) {
    if (Date.now() - started > (opts.budgetMs ?? 40_000)) break;
    if (deleted.has(j.project_id)) {
      await db
        .from("generation_jobs")
        .update({
          status: "failed",
          error: L(
            "Prosjektet er slettet; jobben ble ikke sendt (kostet ingenting).",
            "The project was deleted; the job was not sent (it cost nothing).",
          ),
          finished_at: new Date().toISOString(),
        } as never)
        .eq("id", j.id)
        .eq("status", "queued");
      continue;
    }
    // Sammenheng (DEC-0071): vent på siste bilde fra segmentet før
    if (j.params?.chainAfter) {
      const c = await resolveChain(db, j.project_id, j.params.chainAfter);
      if (c.state === "wait") continue;
      if (c.state === "failed") {
        await db
          .from("generation_jobs")
          .update({
            status: "failed",
            error: c.message,
            finished_at: new Date().toISOString(),
          } as never)
          .eq("id", j.id)
          .eq("status", "queued");
        continue;
      }
      await db
        .from("generation_jobs")
        .update({ reference_path: c.path } as never)
        .eq("id", j.id)
        .eq("status", "queued");
    }
    const k = j.provider_key_id;
    if (k && !busy.has(k)) {
      const { count } = await db
        .from("generation_jobs")
        .select("id", { count: "exact", head: true })
        .eq("kind", "video")
        .eq("status", "running")
        .eq("provider_key_id", k);
      busy.set(k, count ?? 0);
    }
    if (k && (busy.get(k) ?? 0) >= MAX_PARALLEL_PER_KEY) continue;
    // Kostnadstaket kan være senket etter at jobben ble lagt i kø (INV-12): sjekk igjen før sending
    if (j.key_owner) {
      const { overAccountCap } = await import("./ai-gate.server");
      const capMsg = await overAccountCap(db, j.key_owner, Number(j.cost_usd ?? 0), true);
      if (capMsg) {
        await db
          .from("generation_jobs")
          .update({
            status: "failed",
            error: L(
              `${capMsg} Jobben ble ikke sendt (kostet ingenting).`,
              `${capMsg} The job was not sent (it cost nothing).`,
            ),
            finished_at: new Date().toISOString(),
          } as never)
          .eq("id", j.id)
          .eq("status", "queued");
        continue;
      }
    }
    const { data: won } = await db
      .from("generation_jobs")
      .update({ status: "running", started_at: new Date().toISOString() } as never)
      .eq("id", j.id)
      .eq("status", "queued")
      .select("id");
    if (!won || (won as unknown[]).length === 0) continue;
    // Telles på nytt etter at jobben er tatt (KI-175): har en annen fane tatt en jobb samtidig og grensen er
    // passert, får de som startet først plassene (startet, så ID – likt for alle faner). Taperen legges tilbake
    // i kø før den sendes (ingen betaling); neste runde prøver igjen.
    if (k) {
      const { data: first } = await db
        .from("generation_jobs")
        .select("id, started_at")
        .eq("kind", "video")
        .eq("status", "running")
        .eq("provider_key_id", k);
      // Sorteres her (få rader per nøkkel), så rekkefølgen er lik uansett database
      const winners = ((first ?? []) as { id: string; started_at: string | null }[])
        .sort(
          (a, b) =>
            (a.started_at ?? "").localeCompare(b.started_at ?? "") || a.id.localeCompare(b.id),
        )
        .slice(0, MAX_PARALLEL_PER_KEY)
        .map((r) => r.id);
      if (winners.length >= MAX_PARALLEL_PER_KEY && !winners.includes(j.id)) {
        await db
          .from("generation_jobs")
          .update({ status: "queued", started_at: null } as never)
          .eq("id", j.id)
          .eq("status", "running");
        busy.set(k, MAX_PARALLEL_PER_KEY);
        continue;
      }
      busy.set(k, (busy.get(k) ?? 0) + 1);
    }
    // Uten nøkkel feiler jobben straks i submitVideoJob («Nøkkelen er fjernet»)
    const r = await submitVideoJob(db, j.id);
    if (r.ok) sent++;
    else if (k) busy.set(k, Math.max(0, (busy.get(k) ?? 1) - 1));
  }
  return sent;
}

/**
 * Startbildet for et segment som venter på segmentet før (DEC-0071, REQ-0263): siste bilde i den nyeste
 * ferdige videoen for det segmentet, når nettleseren har lagret det (det skjer når videoen legges inn).
 * «wait»: forrige video lages fortsatt eller er ikke lagt inn ennå. «failed»: forrige segment fikk ingen video.
 */
/** Så lenge venter en sammenhengende jobb på siste bilde etter at videoen før er ferdig. */
export const CHAIN_FRAME_WAIT_MS = 30 * 60 * 1000;

export async function resolveChain(
  db: AnyClient,
  projectId: string,
  segmentId: string,
): Promise<
  { state: "wait" } | { state: "ready"; path: string } | { state: "failed"; message: string }
> {
  const { data } = await db
    .from("generation_jobs")
    .select("status, result_path, created_at, finished_at")
    .eq("project_id", projectId)
    .eq("kind", "video")
    .eq("segment_id", segmentId)
    .order("created_at", { ascending: false })
    .limit(20);
  const jobs = (data ?? []) as {
    status: string;
    result_path: string | null;
    finished_at?: string | null;
  }[];
  // Den nyeste jobben som ikke feilet, avgjør (et nytt forsøk som pågår, går foran en eldre ferdig video)
  const latest = jobs.find((x) => x.status !== "failed" && x.status !== "lost");
  if (latest && (latest.status === "queued" || latest.status === "running"))
    return { state: "wait" };
  if (latest && latest.status === "done" && latest.result_path) {
    const path = lastFramePath(latest.result_path);
    if (!path)
      return {
        state: "failed",
        message: L(
          "Forrige segments video har en ukjent sti.",
          "The previous segment's video has an unknown path.",
        ),
      };
    const { error } = await db.storage.from(BUCKET).createSignedUrl(path, 60);
    if (!error) return { state: "ready", path };
    // Siste bilde lagres av nettleseren når videoen legges inn. Kommer det ikke, venter jobben ikke for alltid
    const done = latest.finished_at ? Date.parse(latest.finished_at) : NaN;
    if (Number.isFinite(done) && Date.now() - done > CHAIN_FRAME_WAIT_MS)
      return {
        state: "failed",
        message: L(
          "Siste bilde fra segmentet før ble ikke lagret (det skjer når prosjektet er åpent i en nettleser). Start segmentet på nytt (kostet ingenting).",
          "The last image from the previous segment was not saved (this happens when the project is open in a browser). Start the segment again (it cost nothing).",
        ),
      };
    return { state: "wait" };
  }
  return {
    state: "failed",
    message: L(
      "Segmentet før fikk ingen video, så dette kunne ikke starte fra siste bilde (kostet ingenting).",
      "The previous segment got no video, so this could not start from its last image (it cost nothing).",
    ),
  };
}
