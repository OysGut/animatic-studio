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
import { englishLanguageName } from "@/core/translation/language-tags";
import { getUiLanguage } from "@/core/i18n";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  cleanVisualBrief,
  cleanWrittenPrompt,
  styleAnalysisSystem,
  VISUAL_BRIEF_SYSTEM,
  isUuid,
  newId,
  promptWriterUserText,
  MAX_ATTACHED_IMAGES_ANY,
  MAX_PROMPT_CHARS,
  PROMPT_WRITER_SYSTEM,
  SCENE_DESCRIPTION_SYSTEM,
  promptWithFactSheet,
  withFactSheet,
  type Command,
  type FactSheetRef,
} from "@/core";

import { checkSchema, type AnyClient } from "@/adapters/storage/project-rows";
import {
  GATEWAY,
  ROLE_RANK,
  gatewayError,
  isUnknownModelError,
  referenceImages,
  validReferencePath,
} from "./gateway";
import { t } from "@/core/i18n/keyed";

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
export type WriteTask = "prompt" | "style" | "visual" | "scene";

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
  | {
      readonly ok: true;
      readonly prompt: string;
      readonly model: string;
      readonly jobId: string;
      /** Faktaarket ble laget nå fra manuset og lagret (for angrelisten). */
      readonly factSheet?: { readonly commandId: string; readonly inverse: Command; readonly affected: readonly string[] };
    }
  | { readonly ok: false; readonly message: string; readonly retry?: true };

function validate(d: unknown): WritePromptInput {
  if (!d || typeof d !== "object") throw new Error(t("adapters-ai-write-prompt-functions.validate.message.24c66c979741"));
  const x = d as Record<string, unknown>;
  const projectId = x["projectId"];
  const assetId = x["assetId"];
  const brief = x["brief"];
  const images = x["images"];
  if (typeof projectId !== "string" || !isUuid(projectId))
    throw new Error(t("adapters-ai-write-prompt-functions.validate.message.d45c41b36f46"));
  const task: WriteTask =
    x["task"] === "style" || x["task"] === "visual" || x["task"] === "scene"
      ? (x["task"] as WriteTask)
      : "prompt";
  // Stilanalysen og scenebeskrivelsen (DEC-0085) gjelder ikke én ressurs
  const noAsset = task === "style" || task === "scene";
  if (!noAsset && (typeof assetId !== "string" || !isUuid(assetId)))
    throw new Error(t("adapters-ai-write-prompt-functions.validate.message.2e5f5bfc8390"));
  if (
    noAsset &&
    assetId !== null &&
    assetId !== undefined &&
    (typeof assetId !== "string" || !isUuid(assetId))
  )
    throw new Error(t("adapters-ai-write-prompt-functions.validate.message.2e5f5bfc8390.2"));
  if (typeof brief !== "string" || !brief.trim() || brief.length > MAX_PROMPT_CHARS)
    throw new Error(t("adapters-ai-write-prompt-functions.validate.message.15b01622c845"));
  if (x["purpose"] !== "cutout" && x["purpose"] !== "background")
    throw new Error(t("adapters-ai-write-prompt-functions.validate.message.01be383379b4"));
  if (
    !Array.isArray(images) ||
    images.length > MAX_ATTACHED_IMAGES_ANY ||
    !images.every(
      (i) =>
        i &&
        typeof i === "object" &&
        validReferencePath(projectId, (i as Record<string, unknown>)["path"]) &&
        typeof (i as Record<string, unknown>)["label"] === "string" &&
        ((i as Record<string, unknown>)["label"] as string).length <= 300,
    )
  )
    throw new Error(t("adapters-ai-write-prompt-functions.validate.message.7c43592e8298"));
  if (x["approved"] !== true) throw new Error(t("adapters-ai-write-prompt-functions.validate.message.08a4f82d9e0f"));
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
        message: t("adapters-ai-write-prompt-functions.message.message.4c2d9120af7b"),
      };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as AnyClient;
    const schema = await checkSchema(admin);
    if (schema.kind === "missing" || schema.version < 22)
      return {
        ok: false,
        message: t("adapters-ai-write-prompt-functions.message.message.9c28c20f674f"),
      };
    // Teksten skrives med Lovable AI: administrator kan ha slått av hele leverandøren (DEC-0088)
    const aiGate = await (
      await import("@/adapters/account/ai-models.server")
    ).modelGate(admin, "lovable", "*");
    if (aiGate.message) return { ok: false, message: aiGate.message };
    const key = process.env["LOVABLE_API_KEY"];
    if (!key)
      return {
        ok: false,
        message: t("adapters-ai-write-prompt-functions.message.message.ba89f8049a83"),
      };

    const { data: proj } = await admin
      .from("projects")
      .select("*")
      .eq("id", data.projectId)
      .maybeSingle();
    if (!proj || (proj as { deleted_at?: string | null }).deleted_at)
      return { ok: false, message: t("adapters-ai-write-prompt-functions.message.message.f05bbb72b752") };
    // Eieren har slått av AI (budsjett 0): heller ingen AI-skrevne beskrivelser
    if ((proj as { ai_month_limit?: number | null }).ai_month_limit === 0)
      return {
        ok: false,
        message: t("adapters-ai-write-prompt-functions.message.message.d64d724438d3"),
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
          message: t("adapters-ai-write-prompt-functions.message.message.13c801507797"),
        };
      if ((asset as { kind: string }).kind === "sound" && data.task !== "visual")
        return {
          ok: false,
          message: t("adapters-ai-write-prompt-functions.message.message.4ac1e529f99b"),
        };
    } else if (data.task !== "style" && data.task !== "scene")
      return { ok: false, message: t("adapters-ai-write-prompt-functions.message.message.3c24378f2971") };
    const refCheck = await referenceImages(
      admin,
      data.projectId,
      data.images.map((i) => i.path),
    );
    if (!refCheck.ok) return { ok: false, message: refCheck.message };

    /** Ett kall til språkmodellen med egen rad i generation_jobs. */
    const runJob = async (job: {
      readonly task: WriteTask;
      readonly brief: string;
      readonly images: readonly { readonly path: string; readonly label: string }[];
      readonly factSheet?: FactSheetRef;
    }): Promise<WritePromptResult> => {
      const jobRefs = await referenceImages(admin, data.projectId, job.images.map((i) => i.path));
      if (!jobRefs.ok) return { ok: false, message: jobRefs.message };
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
          return t("adapters-ai-write-prompt-functions.over-limit.create-server-fn-method-post-middleware-require-supabase-auth-validator-validate-handler.1e3043f207e3", { MAX_PROMPT_JOBS_PER_USER_PER_HOUR: String(MAX_PROMPT_JOBS_PER_USER_PER_HOUR) });
        if ((project ?? 0) - extra >= MAX_PROMPT_JOBS_PER_PROJECT_PER_DAY)
          return t("adapters-ai-write-prompt-functions.over-limit.create-server-fn-method-post-middleware-require-supabase-auth-validator-validate-handler.0690a800b7e9", { MAX_PROMPT_JOBS_PER_PROJECT_PER_DAY: String(MAX_PROMPT_JOBS_PER_PROJECT_PER_DAY) });
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
        prompt: job.brief,
        asset_id: data.assetId,
        reference_path: job.images[0]?.path ?? null,
        reference_paths: job.images.map((i) => i.path),
        // Sporbarhet (DEC-0072, REQ-0257): systeminstruksen og bildene som ble sendt
        ...(schema.version >= 24
          ? {
              params: {
                trace: await (
                  await import("./trace.server")
                ).buildTrace(admin as AnyClient, data.projectId, {
                  systemInstruction:
                    job.task === "style"
                      ? "style-analysis"
                      : job.task === "visual"
                        ? "visual-brief"
                        : job.task === "scene"
                          ? "scene-description"
                          : "prompt-writer",
                  modelParams: { purpose: data.purpose, images: job.images.length },
                  referencePaths: job.images.map((i) => i.path),
                }),
                // Faktaarket prompten bygger på (Øystein 23.10): revisjon, digest og studiens jobb, aldri teksten på nytt
                ...(job.factSheet ? { factSheet: job.factSheet } : {}),
              },
            }
          : {}),
        status: "running",
        created_by: context.userId,
      } as never);
      if (logErr)
        return {
          ok: false,
          message: t("adapters-ai-write-prompt-functions.message.message.6d99dd724293", { message: String(logErr.message) }),
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
        for (const [n, img] of job.images.entries()) {
          // Størrelsen er kjent fra biblioteket: store bilder hentes ikke i det hele tatt
          const known = jobRefs.sizes.get(img.path) ?? Infinity;
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
          job.task === "prompt"
            ? promptWriterUserText({ brief: job.brief, purpose: data.purpose, imageLabels: labels })
            : `${job.brief}${skipped.length ? `\n\nNot shown to you: ${skipped.join("; ")}` : ""}`;
        const system =
          job.task === "style"
            ? styleAnalysisSystem(englishLanguageName(getUiLanguage()))
            : job.task === "visual"
              ? VISUAL_BRIEF_SYSTEM
              : job.task === "scene"
                ? SCENE_DESCRIPTION_SYSTEM
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
            job.task === "visual"
              ? cleanVisualBrief(raw)
              : job.task === "scene"
                ? raw
                    .trim()
                    .replace(/^```\w*\n?|```$/g, "")
                    .trim()
                    .slice(0, 2000) || null
                : job.task === "style"
                  ? raw.trim().slice(0, 12000) || null
                  : cleanWrittenPrompt(raw);
          if (!written) {
            await finish({
              status: "failed",
              model,
              error: t("adapters-ai-write-prompt-functions.error.error.1a7750bd2314"),
            });
            return {
              ok: false,
              message: t("adapters-ai-write-prompt-functions.message.message.830de55e747f"),
            };
          }
          // i18n-ignore: serverlogg for utvikleren
          // Bare modell og status i serverloggen: leverandørens svartekst kan gjenta prompten (Ø-11)
          if (log.length) console.warn("[writeImagePrompt] modeller hoppet over:", log.map((l) => l.split(" ").slice(0, 2).join(" ")).join(" | "));
          await finish({ status: "done", model, result_text: written });
          return { ok: true, prompt: written, model, jobId };
        }
        await finish({ status: "failed", error: log.join("\n").slice(0, 2000) });
        return {
          ok: false,
          message: t("adapters-ai-write-prompt-functions.message.message.0012d8d8fe9d"),
        };
      } catch (e) {
        const message = (e as Error).message || t("adapters-ai-write-prompt-functions.message.create-server-fn-method-post-middleware-require-supabase-auth-validator-validate-handler.a8b89351ac49");
        await finish({ status: "failed", error: message.slice(0, 2000) });
        return {
          ok: false,
          message:
            (e as Error).name === "TimeoutError"
              ? t("adapters-ai-write-prompt-functions.message.message.5ae5eeb17079")
              : t("adapters-ai-write-prompt-functions.message.message.6494594d3f6e", { message: String(message) }),
        };
      }
    };

    // Faktaarket brukes alltid når AI skriver bildeteksten for en ressurs (Øystein 23.10)
    if (data.task !== "prompt" || !data.assetId)
      return runJob({ task: data.task, brief: data.brief, images: data.images });
    const { loadFactSheetSubject, saveFactSheet, sha256Hex } = await import("@/adapters/storage/fact-sheet.server");
    const assetId = data.assetId;
    const subject = await loadFactSheetSubject(admin, data.projectId, assetId);
    if (!subject)
      return { ok: false, message: t("adapters-ai-write-prompt-functions.message.message.13c801507797") };
    const out = await promptWithFactSheet({
      existing: subject.sheet
        ? { text: subject.sheet, ref: { assetRevision: subject.revision, digest: await sha256Hex(subject.sheet) } }
        : null,
      study: async () => {
        if (!subject.study) return { ok: false, message: t("factSheet.error.save") };
        const r = await runJob({ task: "visual", brief: subject.study.text, images: subject.study.images });
        return r.ok ? { ok: true, text: r.prompt, jobId: r.jobId } : { ok: false, message: r.message };
      },
      save: async (text) => {
        const r = await saveFactSheet(admin, data.projectId, context.userId, assetId, text);
        return r.ok
          ? { ok: true, ref: { assetRevision: r.revision, digest: await sha256Hex(text) }, saved: r.saved }
          : r;
      },
      write: (sheet, ref) =>
        runJob({
          task: "prompt",
          brief: withFactSheet(data.brief, sheet, MAX_PROMPT_CHARS),
          images: data.images,
          factSheet: ref,
        }),
    });
    if (!out.ok)
      return { ok: false, retry: true, message: t("factSheet.error.study", { message: out.message }) };
    if (!out.result.ok) return out.result;
    return { ...out.result, ...(out.saved ? { factSheet: out.saved } : {}) };
  });
