/**
 * AI-generering av bilder gjennom Lovable AI Gateway (M5 del 1, DEC-0045). Mars har valgt å teste med
 * Lovable-arbeidsområdets egne kreditter; nøkkelen (LOVABLE_API_KEY) ligger bare på serveren i Lovable
 * Cloud og sendes aldri til nettleseren.
 *
 * Kostnadsport (mandat 19, secure-development): bare redaktører, eksplisitt bekreftelse for hver generering,
 * grense per bruker per time og per prosjekt per døgn, og logg over alt i generation_jobs (migrasjon 0010).
 * Resultatet lagres som en fil i bøtta «assets»; klienten lagrer versjonen med AddAssetVersion (samme vei
 * som opplasting), så ingenting i prosjektet endres uten en vanlig kommando som kan angres.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isUuid, newId, MAX_PROMPT_CHARS, type AssetMedia } from "@/core";
import { checkSchema, type AnyClient } from "@/adapters/storage/project-rows";

export const IMAGE_MODEL = "openai/gpt-image-2";
const GATEWAY = "https://ai.gateway.lovable.dev/v1";
const BUCKET = "assets";
/** Grenser som sikring mot løpske kostnader. */
export const MAX_PER_USER_PER_HOUR = 30;
export const MAX_PER_PROJECT_PER_DAY = 200;

export interface GenerateImageInput {
  readonly projectId: string;
  readonly assetId: string;
  readonly prompt: string;
  /** Bilde som sendes med som forbilde (sti i bøtta), eller null. */
  readonly referencePath: string | null;
  readonly purpose: "cutout" | "background";
  /** Brukeren har bekreftet at genereringen bruker kreditter. */
  readonly approved: true;
}

export type GenerateImageResult =
  | {
      readonly ok: true;
      readonly versionId: string;
      readonly media: AssetMedia;
      readonly model: string;
      readonly jobId: string;
    }
  | { readonly ok: false; readonly message: string };

const ROLE_RANK: Record<string, number> = { viewer: 1, commenter: 2, editor: 3, owner: 4 };

function validate(d: unknown): GenerateImageInput {
  if (!d || typeof d !== "object") throw new Error("Ugyldig forespørsel");
  const x = d as Record<string, unknown>;
  const projectId = x["projectId"];
  const assetId = x["assetId"];
  const prompt = x["prompt"];
  const ref = x["referencePath"];
  if (typeof projectId !== "string" || !isUuid(projectId)) throw new Error("Ugyldig prosjekt");
  if (typeof assetId !== "string" || !isUuid(assetId)) throw new Error("Ugyldig ressurs");
  if (typeof prompt !== "string" || !prompt.trim() || prompt.length > MAX_PROMPT_CHARS)
    throw new Error("Beskrivelsen mangler eller er for lang");
  if (
    ref !== null &&
    (typeof ref !== "string" ||
      !ref.startsWith(`${projectId}/`) ||
      ref.includes("..") ||
      ref.length > 600)
  )
    throw new Error("Ugyldig forbilde");
  if (x["purpose"] !== "cutout" && x["purpose"] !== "background") throw new Error("Ugyldig bruk");
  if (x["approved"] !== true) throw new Error("Genereringen må bekreftes");
  return {
    projectId,
    assetId,
    prompt: prompt.trim(),
    referencePath: ref as string | null,
    purpose: x["purpose"],
    approved: true,
  };
}

/** Bredde og høyde fra PNG-hodet (IHDR), ellers null. */
function pngSize(b: Uint8Array): { width: number | null; height: number | null } {
  if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
    return { width: v.getUint32(16), height: v.getUint32(20) };
  }
  return { width: null, height: null };
}

async function sha256(b: Uint8Array): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", b as unknown as ArrayBuffer);
  return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

function gatewayError(status: number, body: string): string {
  if (status === 402)
    return "Lovable-kredittene i arbeidsområdet er brukt opp. Fyll på i Lovable og prøv igjen.";
  if (status === 429) return "For mange forespørsler akkurat nå. Vent et minutt og prøv igjen.";
  if (status === 401 || status === 403)
    return "AI-tjenesten i Lovable godtok ikke nøkkelen. Sjekk at Lovable AI er slått på for prosjektet.";
  if (status === 400 && /safety|policy|moderation/i.test(body))
    return "AI-tjenesten avviste beskrivelsen (innholdsregler). Endre beskrivelsen og prøv igjen.";
  // Tjenestens egen forklaring (ingen hemmeligheter), kortet ned, så feilen kan forstås og rettes
  const detail = (() => {
    try {
      const j = JSON.parse(body.slice(body.indexOf("{"))) as {
        error?: { message?: string } | string;
        message?: string;
      };
      return typeof j.error === "string" ? j.error : (j.error?.message ?? j.message ?? "");
    } catch {
      return body;
    }
  })()
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
  return `AI-tjenesten svarte med feil ${status}${detail ? `: ${detail}` : "."}`;
}

export const generateImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validate)
  .handler(async ({ data, context }): Promise<GenerateImageResult> => {
    const userDb = context.supabase as unknown as AnyClient;
    const { data: member } = await userDb
      .from("project_members")
      .select("role")
      .eq("project_id", data.projectId)
      .eq("user_id", context.userId)
      .is("removed_at", null)
      .maybeSingle();
    if ((ROLE_RANK[(member as { role?: string } | null)?.role ?? ""] ?? 0) < ROLE_RANK["editor"]!)
      return { ok: false, message: "Du har ikke tilgang til å generere i dette prosjektet." };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as AnyClient;
    const schema = await checkSchema(admin);
    if (schema.kind === "missing" || schema.version < 10)
      return {
        ok: false,
        message:
          "Databasen mangler loggen for AI-generering. Lim inn meldingen i LOVABLE_SYNC.md i Lovable (migrasjon 0010).",
      };
    const key = process.env["LOVABLE_API_KEY"];
    if (!key)
      return {
        ok: false,
        message:
          "AI er ikke slått på for prosjektet i Lovable (LOVABLE_API_KEY mangler). Se LOVABLE_SYNC.md.",
      };

    // Et slettet prosjekt kan ikke få nye bilder (DEC-0046)
    const { data: proj } = await admin
      .from("projects")
      .select("*")
      .eq("id", data.projectId)
      .maybeSingle();
    if (!proj || (proj as { deleted_at?: string | null }).deleted_at)
      return { ok: false, message: "Prosjektet er slettet." };

    const { data: asset } = await admin
      .from("assets")
      .select("id, kind")
      .eq("id", data.assetId)
      .eq("project_id", data.projectId)
      .maybeSingle();
    if (!asset) return { ok: false, message: "Ressursen finnes ikke i prosjektet." };
    if ((asset as { kind: string }).kind === "sound")
      return { ok: false, message: "Lyd kan ikke genereres som bilde." };

    // Grenser (sikring mot løpske kostnader)
    const hourAgo = new Date(Date.now() - 3600_000).toISOString();
    const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
    const { count: mine } = await admin
      .from("generation_jobs")
      .select("id", { count: "exact", head: true })
      .eq("created_by", context.userId)
      .gte("created_at", hourAgo);
    if ((mine ?? 0) >= MAX_PER_USER_PER_HOUR)
      return {
        ok: false,
        message: `Grensen på ${MAX_PER_USER_PER_HOUR} genereringer i timen er nådd. Prøv igjen senere.`,
      };
    const { count: project } = await admin
      .from("generation_jobs")
      .select("id", { count: "exact", head: true })
      .eq("project_id", data.projectId)
      .gte("created_at", dayAgo);
    if ((project ?? 0) >= MAX_PER_PROJECT_PER_DAY)
      return {
        ok: false,
        message: `Prosjektets grense på ${MAX_PER_PROJECT_PER_DAY} genereringer i døgnet er nådd.`,
      };

    const model = process.env["ANIMATIC_IMAGE_MODEL"] || IMAGE_MODEL;
    const jobId = newId<"generation_job">();
    const { error: logErr } = await admin.from("generation_jobs").insert({
      id: jobId,
      project_id: data.projectId,
      kind: "image",
      provider: "lovable",
      model,
      prompt: data.prompt,
      asset_id: data.assetId,
      reference_path: data.referencePath,
      status: "running",
      created_by: context.userId,
    } as never);
    if (logErr) return { ok: false, message: `Genereringen kunne ikke logges: ${logErr.message}` };

    const finish = async (patch: Record<string, unknown>) => {
      await admin
        .from("generation_jobs")
        .update({ ...patch, finished_at: new Date().toISOString() } as never)
        .eq("id", jobId);
    };

    try {
      const size = data.purpose === "cutout" ? "1024x1536" : "1536x1024";
      const background = data.purpose === "cutout" ? "transparent" : "opaque";
      const headers = { Authorization: `Bearer ${key}`, "Lovable-API-Key": key };
      let reference: Blob | null = null;
      if (data.referencePath) {
        const { data: blob, error } = await admin.storage.from(BUCKET).download(data.referencePath);
        if (error || !blob) throw new Error("Forbildet kunne ikke hentes fra lagringen.");
        reference = blob;
      }
      // Ikke alle modeller tar imot alle valg (f.eks. gjennomsiktig bakgrunn). Avviser tjenesten
      // forespørselen (400), prøves den igjen med færre valg – hvert forsøk logges.
      const attempts: Record<string, string>[] = [
        { size, ...(model.startsWith("openai/") ? { background, output_format: "png" } : {}) },
        { size },
        {},
      ];
      const send = (extra: Record<string, string>) => {
        if (reference) {
          const form = new FormData();
          form.append("model", model);
          form.append("prompt", data.prompt);
          form.append("n", "1");
          for (const [k, v] of Object.entries(extra)) form.append(k, v);
          const type =
            reference.type && reference.type.startsWith("image/") ? reference.type : "image/png";
          const ext = type === "image/jpeg" ? "jpg" : type === "image/webp" ? "webp" : "png";
          form.append("image", new File([reference], `reference.${ext}`, { type }));
          return fetch(`${GATEWAY}/images/edits`, { method: "POST", headers, body: form });
        }
        return fetch(`${GATEWAY}/images/generations`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ model, prompt: data.prompt, n: 1, ...extra }),
        });
      };
      let res: Response | null = null;
      const log: string[] = [];
      for (const extra of attempts) {
        res = await send(extra);
        if (res.ok) break;
        const body = await res.text().catch(() => "");
        log.push(
          `${res.status} [${Object.keys(extra).join(",") || "ingen valg"}]: ${body.slice(0, 400)}`,
        );
        const retry = res.status === 400 && !/safety|policy|moderation/i.test(body);
        if (!retry) break;
      }
      if (!res || !res.ok) {
        const last = log[log.length - 1] ?? "";
        const status = res?.status ?? 0;
        await finish({ status: "failed", error: log.join("\n").slice(0, 2000) });
        return { ok: false, message: gatewayError(status, last) };
      }
      if (log.length > 0)
        // Vellykket etter færre valg: noter hvorfor, så det kan rettes
        console.warn("[generateImage] lyktes etter nye forsøk:", log.join(" | ").slice(0, 600));
      const json = (await res.json()) as { data?: { b64_json?: string; url?: string }[] };
      const first = json.data?.[0];
      let bytes: Uint8Array;
      if (first?.b64_json) bytes = Uint8Array.from(atob(first.b64_json), (c) => c.charCodeAt(0));
      else if (first?.url) bytes = new Uint8Array(await (await fetch(first.url)).arrayBuffer());
      else throw new Error("AI-tjenesten svarte uten bilde.");

      const versionId = newId<"asset_version">();
      const date = new Date().toISOString().slice(0, 10);
      const path = `${data.projectId}/${data.assetId}/${versionId}/ai-${date}.png`;
      const { error: upErr } = await admin.storage
        .from(BUCKET)
        .upload(path, new Blob([bytes as unknown as ArrayBuffer], { type: "image/png" }), {
          contentType: "image/png",
          upsert: false,
        });
      if (upErr) throw new Error(`Bildet kunne ikke lagres: ${upErr.message}`);
      const dims = pngSize(bytes);
      await finish({ status: "done", result_path: path });
      return {
        ok: true,
        versionId,
        model,
        jobId,
        media: {
          path,
          mimeType: "image/png",
          width: dims.width,
          height: dims.height,
          byteSize: bytes.byteLength,
          sha256: await sha256(bytes),
        },
      };
    } catch (e) {
      const message = (e as Error).message || "Ukjent feil";
      await finish({ status: "failed", error: message.slice(0, 2000) });
      return { ok: false, message: `Genereringen stoppet: ${message}` };
    }
  });
