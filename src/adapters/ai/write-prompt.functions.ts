/**
 * AI skriver bildebeskrivelsen (DEC-0066, REQ-0589). Mars 11.10.2026: «trenger maksimal god beskrivelse» –
 * kostnaden er godkjent, og filmens bilder kan sendes med.
 *
 * Grunnlaget (briefen) er beskrivelsen programmet har satt sammen fra filmens visuelle stil, ressursen,
 * scenene og godkjente bilder. En språkmodell i Lovable AI Gateway leser den, ser forbildebildene og skriver
 * én presis beskrivelse på engelsk. Ingenting i prosjektet endres: teksten går tilbake til brukeren, som
 * leser og endrer den før et bilde genereres (to steg med bekreftelse som før).
 *
 * Kostnadsport: bare redaktører, eget tak per bruker per time, logg i generation_jobs (kind «prompt»,
 * migrasjon 0022). Slike kall koster en brøkdel av et bilde og teller ikke i bildebudsjettet.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  cleanVisualBrief,
  cleanWrittenPrompt,
  STYLE_ANALYSIS_SYSTEM,
  VISUAL_BRIEF_SYSTEM,
  isUuid,
  newId,
  promptWriterUserText,
  MAX_ATTACHED_IMAGES,
  MAX_PROMPT_CHARS,
  PROMPT_WRITER_SYSTEM,
} from "@/core";
import { L } from "@/core";
import { checkSchema, type AnyClient } from "@/adapters/storage/project-rows";
import {
  GATEWAY,
  ROLE_RANK,
  gatewayError,
  isUnknownModelError,
  referenceImages,
  validReferencePath,
} from "./gateway";

/**
 * Språkmodellene som prøves, i rekkefølge (den første Lovable kjenner). Kan overstyres med
 * ANIMATIC_TEXT_MODEL i Lovable Cloud. Gemini ser bilder og skriver godt engelsk.
 */
export const TEXT_MODELS = [
  "google/gemini-3.1-pro-preview",
  "google/gemini-3.8-flash",
  "google/gemini-3-flash-preview",
  "google/gemini-2.5-flash",
] as const;
export const MAX_PROMPT_JOBS_PER_USER_PER_HOUR = 60;
export const MAX_PROMPT_JOBS_PER_PROJECT_PER_DAY = 400;
/** Bilder større enn dette sendes ikke til språkmodellen (de sendes likevel til bildemodellen). */
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
/** Til sammen (minnet på serveren). */
const MAX_TOTAL_IMAGE_BYTES = 12 * 1024 * 1024;
const BUCKET = "assets";

/**
 * Oppgaven (DEC-0080): «prompt» skriver bildebeskrivelsen (som før); «style» analyserer stilen i
 * forbildebildene (svar som JSON); «visual» lager det visuelle faktaarket for en ressurs. For «style» og
 * «visual» er `brief` selve brukermeldingen (laget i kjernen).
 */
export type WriteTask = "prompt" | "style" | "visual";

export interface WritePromptInput {
  readonly projectId: string;
  /** Ressursen (ikke for stilanalysen, som gjelder hele filmen). */
  readonly assetId: string | null;
  readonly task: WriteTask;
  readonly brief: string;
  readonly purpose: "cutout" | "background";
  /** Bildene som skal sendes med til bildemodellen, i samme rekkefølge, med hva de viser. */
  readonly images: readonly { readonly path: string; readonly label: string }[];
  /** Brukeren har bedt om det (koster litt). */
  readonly approved: true;
}

export type WritePromptResult =
  | { readonly ok: true; readonly prompt: string; readonly model: string; readonly jobId: string }
  | { readonly ok: false; readonly message: string };

function validate(d: unknown): WritePromptInput {
  if (!d || typeof d !== "object") throw new Error(L("Ugyldig forespørsel", "Invalid request"));
  const x = d as Record<string, unknown>;
  const projectId = x["projectId"];
  const assetId = x["assetId"];
  const brief = x["brief"];
  const images = x["images"];
  if (typeof projectId !== "string" || !isUuid(projectId))
    throw new Error(L("Ugyldig prosjekt", "Invalid project"));
  const task: WriteTask =
    x["task"] === "style" || x["task"] === "visual" ? (x["task"] as WriteTask) : "prompt";
  if (task !== "style" && (typeof assetId !== "string" || !isUuid(assetId)))
    throw new Error(L("Ugyldig ressurs", "Invalid asset"));
  if (
    task === "style" &&
    assetId !== null &&
    assetId !== undefined &&
    (typeof assetId !== "string" || !isUuid(assetId))
  )
    throw new Error(L("Ugyldig ressurs", "Invalid asset"));
  if (typeof brief !== "string" || !brief.trim() || brief.length > MAX_PROMPT_CHARS)
    throw new Error(L("Grunnlaget mangler eller er for langt", "The basis is missing or too long"));
  if (x["purpose"] !== "cutout" && x["purpose"] !== "background")
    throw new Error(L("Ugyldig bruk", "Invalid use"));
  if (
    !Array.isArray(images) ||
    images.length > MAX_ATTACHED_IMAGES ||
    !images.every(
      (i) =>
        i &&
        typeof i === "object" &&
        validReferencePath(projectId, (i as Record<string, unknown>)["path"]) &&
        typeof (i as Record<string, unknown>)["label"] === "string" &&
        ((i as Record<string, unknown>)["label"] as string).length <= 300,
    )
  )
    throw new Error(L("Ugyldige bilder", "Invalid images"));
  if (x["approved"] !== true) throw new Error(L("Må bekreftes", "Must be confirmed"));
  return {
    projectId,
    assetId: typeof assetId === "string" ? assetId : null,
    task,
    brief: brief.trim(),
    purpose: x["purpose"],
    images: images as { path: string; label: string }[],
    approved: true,
  };
}

/** Base64 uten Node-Buffer (serveren kan kjøre i en Worker). */
function base64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Svaret fra chat/completions: tekst som streng eller som deler. */
function messageText(json: unknown): string {
  const c = (json as { choices?: { message?: { content?: unknown } }[] })?.choices?.[0]?.message
    ?.content;
  if (typeof c === "string") return c;
  if (Array.isArray(c))
    return c.map((p) => (p && typeof p === "object" && "text" in p ? String(p.text) : "")).join("");
  return "";
}

export const writeImagePrompt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validate)
  .handler(async ({ data, context }): Promise<WritePromptResult> => {
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
          "Du har ikke tilgang til å bruke AI i dette prosjektet.",
          "You do not have access to use AI in this project.",
        ),
      };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as AnyClient;
    const schema = await checkSchema(admin);
    if (schema.kind === "missing" || schema.version < 22)
      return {
        ok: false,
        message: L(
          "Databasen er ikke oppdatert for AI-skrevne beskrivelser. Lim inn meldingen i LOVABLE_SYNC.md i Lovable (migrasjon 0022).",
          "The database is not updated for AI-written descriptions. Paste the message in LOVABLE_SYNC.md into Lovable (migration 0022).",
        ),
      };
    const key = process.env["LOVABLE_API_KEY"];
    if (!key)
      return {
        ok: false,
        message: L(
          "AI er ikke slått på for prosjektet i Lovable (LOVABLE_API_KEY mangler). Se LOVABLE_SYNC.md.",
          "AI is not turned on for the project in Lovable (LOVABLE_API_KEY is missing). See LOVABLE_SYNC.md.",
        ),
      };

    const { data: proj } = await admin
      .from("projects")
      .select("*")
      .eq("id", data.projectId)
      .maybeSingle();
    if (!proj || (proj as { deleted_at?: string | null }).deleted_at)
      return { ok: false, message: L("Prosjektet er slettet.", "The project has been deleted.") };
    // Eieren har slått av AI (budsjett 0): heller ingen AI-skrevne beskrivelser
    if ((proj as { ai_month_limit?: number | null }).ai_month_limit === 0)
      return {
        ok: false,
        message: L(
          "AI er slått av for prosjektet (budsjettet er 0). Eieren kan endre det på prosjektoversikten.",
          "AI is turned off for the project (the budget is 0). The owner can change this on the project overview.",
        ),
      };
    if (data.assetId) {
      const { data: asset } = await admin
        .from("assets")
        .select("id, kind")
        .eq("id", data.assetId)
        .eq("project_id", data.projectId)
        .maybeSingle();
      if (!asset)
        return {
          ok: false,
          message: L(
            "Ressursen finnes ikke i prosjektet.",
            "The asset does not exist in the project.",
          ),
        };
      if ((asset as { kind: string }).kind === "sound" && data.task !== "visual")
        return {
          ok: false,
          message: L(
            "Lyd kan ikke få en bildebeskrivelse.",
            "Sound cannot get an image description.",
          ),
        };
    } else if (data.task !== "style")
      return { ok: false, message: L("Ressursen mangler.", "The asset is missing.") };
    const refCheck = await referenceImages(
      admin,
      data.projectId,
      data.images.map((i) => i.path),
    );
    if (!refCheck.ok) return { ok: false, message: refCheck.message };

    const hourAgo = new Date(Date.now() - 3600_000).toISOString();
    const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
    /** Over grensene? (`extra`: denne jobben er allerede registrert og telles med.) */
    const overLimit = async (extra: number): Promise<string | null> => {
      const [{ count: mine }, { count: project }] = await Promise.all([
        admin
          .from("generation_jobs")
          .select("id", { count: "exact", head: true })
          .eq("created_by", context.userId)
          .eq("kind", "prompt")
          .gte("created_at", hourAgo),
        admin
          .from("generation_jobs")
          .select("id", { count: "exact", head: true })
          .eq("project_id", data.projectId)
          .eq("kind", "prompt")
          .gte("created_at", dayAgo),
      ]);
      if ((mine ?? 0) - extra >= MAX_PROMPT_JOBS_PER_USER_PER_HOUR)
        return L(
          `Grensen på ${MAX_PROMPT_JOBS_PER_USER_PER_HOUR} AI-beskrivelser i timen er nådd. Prøv igjen senere.`,
          `The limit of ${MAX_PROMPT_JOBS_PER_USER_PER_HOUR} AI descriptions per hour has been reached. Try again later.`,
        );
      if ((project ?? 0) - extra >= MAX_PROMPT_JOBS_PER_PROJECT_PER_DAY)
        return L(
          `Prosjektets grense på ${MAX_PROMPT_JOBS_PER_PROJECT_PER_DAY} AI-beskrivelser i døgnet er nådd.`,
          `The project's limit of ${MAX_PROMPT_JOBS_PER_PROJECT_PER_DAY} AI descriptions per day has been reached.`,
        );
      return null;
    };
    const before = await overLimit(0);
    if (before) return { ok: false, message: before };

    const override = process.env["ANIMATIC_TEXT_MODEL"];
    const models: readonly string[] = override ? [override] : TEXT_MODELS;
    const jobId = newId<"generation_job">();
    const { error: logErr } = await admin.from("generation_jobs").insert({
      id: jobId,
      project_id: data.projectId,
      kind: "prompt",
      provider: "lovable",
      model: models[0]!,
      prompt: data.brief,
      asset_id: data.assetId,
      reference_path: data.images[0]?.path ?? null,
      reference_paths: data.images.map((i) => i.path),
      // Sporbarhet (DEC-0072, REQ-0257): systeminstruksen og bildene som ble sendt
      ...(schema.version >= 24
        ? {
            params: {
              trace: await (
                await import("./trace.server")
              ).buildTrace(admin as AnyClient, data.projectId, {
                systemInstruction:
                  data.task === "style"
                    ? "style-analysis"
                    : data.task === "visual"
                      ? "visual-brief"
                      : "prompt-writer",
                modelParams: { purpose: data.purpose, images: data.images.length },
                referencePaths: data.images.map((i) => i.path),
              }),
            },
          }
        : {}),
      status: "running",
      created_by: context.userId,
    } as never);
    if (logErr)
      return {
        ok: false,
        message: L(
          `Kallet kunne ikke logges: ${logErr.message}`,
          `The call could not be logged: ${logErr.message}`,
        ),
      };
    // Samtidige forespørsler: tell på nytt med denne jobben registrert
    const after = await overLimit(1);
    if (after) {
      await admin.from("generation_jobs").delete().eq("id", jobId);
      return { ok: false, message: after };
    }
    const finish = async (patch: Record<string, unknown>) => {
      await admin
        .from("generation_jobs")
        .update({ ...patch, finished_at: new Date().toISOString() } as never)
        .eq("id", jobId);
    };

    try {
      // Bildene som data-URL-er (tjenesten trenger ikke tilgang til lagringen). Et bilde som ikke kan
      // hentes eller er for stort, hoppes over, og språkmodellen får vite det.
      const parts: Record<string, unknown>[] = [];
      const labels: string[] = [];
      let total = 0;
      for (const [n, img] of data.images.entries()) {
        // Størrelsen er kjent fra biblioteket: store bilder hentes ikke i det hele tatt
        const known = refCheck.sizes.get(img.path) ?? Infinity;
        if (known > MAX_IMAGE_BYTES || total + known > MAX_TOTAL_IMAGE_BYTES) {
          labels.push(`${img.label} (not shown to you)`);
          continue;
        }
        const { data: blob } = await admin.storage.from(BUCKET).download(img.path);
        if (!blob || blob.size > MAX_IMAGE_BYTES) {
          labels.push(`${img.label} (not shown to you)`);
          continue;
        }
        const type = blob.type && blob.type.startsWith("image/") ? blob.type : "image/png";
        const bytes = new Uint8Array(await blob.arrayBuffer());
        total += bytes.byteLength;
        labels.push(img.label);
        parts.push({ type: "text", text: `Image ${n + 1}:` });
        parts.push({
          type: "image_url",
          image_url: { url: `data:${type};base64,${base64(bytes)}` },
        });
      }
      // Stilanalysen og faktaarket: briefen er brukermeldingen; bilder som ikke kunne vises, nevnes
      const skipped = labels.filter((l) => l.endsWith("(not shown to you)"));
      const text =
        data.task === "prompt"
          ? promptWriterUserText({ brief: data.brief, purpose: data.purpose, imageLabels: labels })
          : `${data.brief}${skipped.length ? `\n\nNot shown to you: ${skipped.join("; ")}` : ""}`;
      const system =
        data.task === "style"
          ? STYLE_ANALYSIS_SYSTEM
          : data.task === "visual"
            ? VISUAL_BRIEF_SYSTEM
            : PROMPT_WRITER_SYSTEM;
      const headers = {
        Authorization: `Bearer ${key}`,
        "Lovable-API-Key": key,
        "Content-Type": "application/json",
      };
      const log: string[] = [];
      for (const model of models) {
        const res = await fetch(`${GATEWAY}/chat/completions`, {
          method: "POST",
          headers,
          signal: AbortSignal.timeout(90_000),
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: system },
              { role: "user", content: [{ type: "text", text }, ...parts] },
            ],
          }),
        });
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          log.push(`${model}: ${res.status} ${body.slice(0, 300)}`);
          // Ukjent modell hos Lovable: prøv neste. Alt annet (kreditter, innholdsregler …) stopper.
          if (isUnknownModelError(res.status, body)) continue;
          await finish({ status: "failed", model, error: log.join("\n").slice(0, 2000) });
          return { ok: false, message: gatewayError(res.status, body) };
        }
        const raw = messageText(await res.json());
        const written =
          data.task === "visual"
            ? cleanVisualBrief(raw)
            : data.task === "style"
              ? raw.trim().slice(0, 12000) || null
              : cleanWrittenPrompt(raw);
        if (!written) {
          await finish({
            status: "failed",
            model,
            error: L("Tomt svar fra språkmodellen", "Empty reply from the language model"),
          });
          return {
            ok: false,
            message: L(
              "AI-tjenesten svarte uten tekst. Prøv igjen.",
              "The AI service replied without text. Try again.",
            ),
          };
        }
        // i18n-ignore: serverlogg for utvikleren
        if (log.length) console.warn("[writeImagePrompt] modeller hoppet over:", log.join(" | "));
        await finish({ status: "done", model, result_text: written });
        return { ok: true, prompt: written, model, jobId };
      }
      await finish({ status: "failed", error: log.join("\n").slice(0, 2000) });
      return {
        ok: false,
        message: L(
          "Lovable kjente ikke igjen noen av språkmodellene. Sett ANIMATIC_TEXT_MODEL i Lovable Cloud (se LOVABLE_SYNC.md).",
          "Lovable did not recognise any of the language models. Set ANIMATIC_TEXT_MODEL in Lovable Cloud (see LOVABLE_SYNC.md).",
        ),
      };
    } catch (e) {
      const message = (e as Error).message || L("Ukjent feil", "Unknown error");
      await finish({ status: "failed", error: message.slice(0, 2000) });
      return {
        ok: false,
        message:
          (e as Error).name === "TimeoutError"
            ? L(
                "AI-tjenesten brukte for lang tid. Prøv igjen.",
                "The AI service took too long. Try again.",
              )
            : L(
                `Beskrivelsen ble ikke skrevet: ${message}`,
                `The description was not written: ${message}`,
              ),
      };
    }
  });
