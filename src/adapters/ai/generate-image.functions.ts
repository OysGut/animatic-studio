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
import {
  adaptPromptForModel,
  type AssetMedia,
  effortOf,
  estimateCostUsd,
  isProviderId,
  isUuid,
  MAX_ATTACHED_IMAGES,
  MAX_PROMPT_CHARS,
  monthStartUtc,
  newId,
  providerModel,
  stripAttachedSection,
} from "@/core";
import { checkSchema, type AnyClient } from "@/adapters/storage/project-rows";
import { GATEWAY, ROLE_RANK, gatewayError, referenceImages, validReferencePath } from "./gateway";

// Modellene for innebygd bildegenerering står i kjernen (vises også i bekreftelsen, REQ-0280)
export { LOVABLE_CUTOUT_MODEL as CUTOUT_MODEL, LOVABLE_IMAGE_MODEL as IMAGE_MODEL } from "@/core";
import { LOVABLE_CUTOUT_MODEL as CUTOUT_MODEL, LOVABLE_IMAGE_MODEL as IMAGE_MODEL } from "@/core";
const BUCKET = "assets";
/** Grenser som sikring mot løpske kostnader. */
export const MAX_PER_USER_PER_HOUR = 30;
export const MAX_PER_PROJECT_PER_DAY = 200;

export interface GenerateImageInput {
  readonly projectId: string;
  readonly assetId: string;
  readonly prompt: string;
  /**
   * Bildene som sendes med (sti i bøtta), i rekkefølge: først ev. dagens bilde som skal beholdes, så
   * filmens forbildebilder (DEC-0066). Tom liste: bildet lages bare fra beskrivelsen.
   */
  readonly referencePaths: readonly string[];
  /** Det første bildet er dagens bilde av ressursen (beholdes); ellers er alle stilforbilder. */
  readonly identityFirst: boolean;
  readonly purpose: "cutout" | "background";
  /** Varianten bildet skal inn i (huskes i jobben, så «Legg inn» treffer riktig variant – KI-147). */
  readonly variantId?: string | null;
  /** Leverandør og modell (DEC-0069); «lovable» (innebygd) når ikke valgt. */
  readonly provider: string;
  readonly model: string | null;
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

function validate(d: unknown): GenerateImageInput {
  if (!d || typeof d !== "object") throw new Error("Ugyldig forespørsel");
  const x = d as Record<string, unknown>;
  const projectId = x["projectId"];
  const assetId = x["assetId"];
  const prompt = x["prompt"];
  const refs = x["referencePaths"];
  if (typeof projectId !== "string" || !isUuid(projectId)) throw new Error("Ugyldig prosjekt");
  if (typeof assetId !== "string" || !isUuid(assetId)) throw new Error("Ugyldig ressurs");
  if (typeof prompt !== "string" || !prompt.trim() || prompt.length > MAX_PROMPT_CHARS)
    throw new Error("Beskrivelsen mangler eller er for lang");
  if (
    !Array.isArray(refs) ||
    refs.length > MAX_ATTACHED_IMAGES ||
    new Set(refs).size !== refs.length ||
    !refs.every((r) => validReferencePath(projectId, r))
  )
    throw new Error("Ugyldige forbildebilder");
  if (x["purpose"] !== "cutout" && x["purpose"] !== "background") throw new Error("Ugyldig bruk");
  if (x["approved"] !== true) throw new Error("Genereringen må bekreftes");
  return {
    projectId,
    assetId,
    prompt: prompt.trim(),
    referencePaths: refs as string[],
    identityFirst: x["identityFirst"] === true && (refs as string[]).length > 0,
    purpose: x["purpose"],
    variantId: typeof x["variantId"] === "string" && isUuid(x["variantId"]) ? x["variantId"] : null,
    provider: (() => {
      const p = x["provider"] ?? "lovable";
      if (!isProviderId(p)) throw new Error("Ukjent leverandør");
      return p;
    })(),
    model: (() => {
      const m = x["model"] ?? null;
      if (m !== null && (typeof m !== "string" || m.length > 120))
        throw new Error("Ugyldig modell");
      return m as string | null;
    })(),
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

export const generateImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validate)
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
    const own = data.provider !== "lovable";
    const key = process.env["LOVABLE_API_KEY"];
    if (!own && !key)
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
    const refCheck = await referenceImages(admin, data.projectId, data.referencePaths);
    if (!refCheck.ok) return { ok: false, message: refCheck.message };

    // Grenser (sikring mot løpske kostnader)
    const hourAgo = new Date(Date.now() - 3600_000).toISOString();
    const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
    const { count: mine } = await admin
      .from("generation_jobs")
      .select("id", { count: "exact", head: true })
      .eq("created_by", context.userId)
      .neq("kind", "prompt")
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
      .neq("kind", "prompt")
      .gte("created_at", dayAgo);
    if ((project ?? 0) >= MAX_PER_PROJECT_PER_DAY)
      return {
        ok: false,
        message: `Prosjektets grense på ${MAX_PER_PROJECT_PER_DAY} genereringer i døgnet er nådd.`,
      };

    // Prosjektets AI-budsjett (DEC-0053, REQ-0282/0284): kontrolleres etter at jobben er registrert
    // (se under), så samtidige genereringer ikke kan gå forbi rammen
    const budgeted = schema.version >= 14;
    const pr = proj as {
      ai_month_limit?: number | null;
      ai_price_per_image?: number | string | null;
    };
    const price =
      budgeted && pr.ai_price_per_image !== null && pr.ai_price_per_image !== undefined
        ? Number(pr.ai_price_per_image)
        : null;

    const model = own
      ? (data.model ?? "")
      : data.purpose === "cutout"
        ? process.env["ANIMATIC_CUTOUT_MODEL"] || CUTOUT_MODEL
        : process.env["ANIMATIC_IMAGE_MODEL"] || IMAGE_MODEL;
    // Egen nøkkel (DEC-0069): modellen må finnes i katalogen, nøkkelen hos en av prosjektets eiere, og
    // eierens kostnadstak må ha plass
    const gate = own ? await import("./ai-gate.server") : null;
    let ownKey: Awaited<ReturnType<NonNullable<typeof gate>["projectKey"]>> = null;
    let costUsd: number | null = null;
    if (own && gate) {
      if (schema.version < 24)
        return {
          ok: false,
          message:
            "Databasen er ikke oppdatert for egne AI-leverandører. Lim inn meldingen i LOVABLE_SYNC.md i Lovable (migrasjon 0024).",
        };
      const m = providerModel(data.provider, model);
      if (!m || m.capability !== "image")
        return { ok: false, message: "Modellen finnes ikke hos leverandøren." };
      ownKey = await gate.projectKey(admin, data.projectId, data.provider, context.userId);
      if (!ownKey)
        return {
          ok: false,
          message:
            "Ingen av prosjektets eiere har koblet til denne leverandøren (AI-leverandører på prosjektlisten).",
        };
      costUsd = estimateCostUsd(data.provider, model, { images: 1 });
      const capMsg = await gate.overAccountCap(admin, ownKey.user_id, costUsd ?? 0, false);
      if (capMsg) return { ok: false, message: capMsg };
    }
    const jobId = newId<"generation_job">();
    // Sporbarhet (DEC-0072, REQ-0257): params finnes fra migrasjon 0024
    const trace =
      schema.version >= 24
        ? await (
            await import("./trace.server")
          ).buildTrace(admin as AnyClient, data.projectId, {
            modelParams: { purpose: data.purpose, identityFirst: data.identityFirst ?? null },
            referencePaths: data.referencePaths,
          })
        : null;
    const { error: logErr } = await admin.from("generation_jobs").insert({
      id: jobId,
      project_id: data.projectId,
      kind: "image",
      ...(trace
        ? {
            params: {
              trace,
              // Innsatsnivået jobben ble kjørt med (mandat 19.3, REQ-0275)
              effort: effortOf(providerModel(data.provider, model)),
              ...(data.variantId ? { variantId: data.variantId } : {}),
            },
          }
        : {}),
      provider: data.provider,
      model,
      ...(ownKey
        ? { provider_key_id: ownKey.id, key_owner: ownKey.user_id, cost_usd: costUsd }
        : {}),
      prompt: data.prompt,
      asset_id: data.assetId,
      reference_path: data.referencePaths[0] ?? null,
      ...(schema.version >= 22 ? { reference_paths: data.referencePaths } : {}),
      status: "running",
      created_by: context.userId,
      ...(budgeted ? { estimated_cost: price } : {}),
    } as never);
    if (logErr) return { ok: false, message: `Genereringen kunne ikke logges: ${logErr.message}` };
    // Samtidige forespørsler: tell på nytt med denne jobben registrert
    {
      const [{ count: mineNow }, { count: projectNow }] = await Promise.all([
        admin
          .from("generation_jobs")
          .select("id", { count: "exact", head: true })
          .eq("created_by", context.userId)
          .neq("kind", "prompt")
          .gte("created_at", hourAgo),
        admin
          .from("generation_jobs")
          .select("id", { count: "exact", head: true })
          .eq("project_id", data.projectId)
          .neq("kind", "prompt")
          .gte("created_at", dayAgo),
      ]);
      if ((mineNow ?? 0) > MAX_PER_USER_PER_HOUR || (projectNow ?? 0) > MAX_PER_PROJECT_PER_DAY) {
        await admin.from("generation_jobs").delete().eq("id", jobId);
        return {
          ok: false,
          message: "Grensen for antall genereringer er nådd akkurat nå. Prøv igjen senere.",
        };
      }
    }
    if (budgeted && pr.ai_month_limit !== null && pr.ai_month_limit !== undefined) {
      const { count: used } = await admin
        .from("generation_jobs")
        .select("id", { count: "exact", head: true })
        .eq("project_id", data.projectId)
        .neq("status", "failed")
        .neq("kind", "prompt")
        .gte("created_at", monthStartUtc(new Date()).toISOString());
      if ((used ?? 0) > Number(pr.ai_month_limit)) {
        // Denne jobben (og eventuelle samtidige) går over rammen: den fjernes igjen, ingenting sendes
        await admin.from("generation_jobs").delete().eq("id", jobId);
        return {
          ok: false,
          message: `Prosjektets AI-budsjett for denne måneden (${pr.ai_month_limit} genereringer) er brukt opp. Eieren kan endre budsjettet på prosjektoversikten.`,
        };
      }
    }

    if (ownKey && gate) {
      const capMsg = await gate.overAccountCap(admin, ownKey.user_id, costUsd ?? 0, true);
      if (capMsg) {
        await admin.from("generation_jobs").delete().eq("id", jobId);
        return { ok: false, message: capMsg };
      }
    }

    const finish = async (patch: Record<string, unknown>) => {
      await admin
        .from("generation_jobs")
        .update({ ...patch, finished_at: new Date().toISOString() } as never)
        .eq("id", jobId);
    };

    if (ownKey) {
      // Egen leverandør: én forespørsel gjennom adapteren
      let charged = false;
      let secret: string | null = null;
      const { ADAPTERS, scrubSecret } = await import("./providers.server");
      try {
        const { decryptKey } = await import("./key-vault.server");
        secret = await decryptKey(ownKey, {
          userId: ownKey.user_id,
          provider: ownKey.provider,
          rowId: ownKey.id,
        });
        const references = await Promise.all(
          data.referencePaths.map(async (p) => {
            const { data: blob, error } = await admin.storage.from(BUCKET).download(p);
            if (error || !blob)
              throw new Error("Et forbildebilde kunne ikke hentes fra lagringen.");
            return blob;
          }),
        );
        // Modellens lengdegrense (DEC-0070): ellers avviser tjenesten beskrivelsen
        const m = providerModel(data.provider, model);
        const req = {
          key: secret,
          model,
          prompt: m ? adaptPromptForModel(data.prompt, m).text : data.prompt,
          references,
          purpose: data.purpose,
        };
        let out: { bytes: Uint8Array; mimeType: string };
        if (data.provider === "openai") out = await ADAPTERS.openai.image(req);
        else if (data.provider === "google") out = await ADAPTERS.google.image(req);
        else if (data.provider === "fal") {
          // fal henter forbildet selv: midlertidige lenker (10 minutter)
          const referenceUrls: string[] = [];
          for (const p of data.referencePaths) {
            const { data: signed } = await admin.storage.from(BUCKET).createSignedUrl(p, 600);
            if (signed?.signedUrl) referenceUrls.push(signed.signedUrl);
          }
          out = await ADAPTERS.fal.image({ ...req, referenceUrls });
        } else return { ok: false, message: "Leverandøren lager ikke bilder." };
        charged = true;
        const mimeType = ["image/png", "image/jpeg", "image/webp"].includes(out.mimeType)
          ? out.mimeType
          : "image/png";
        const ext = mimeType === "image/jpeg" ? "jpg" : mimeType === "image/webp" ? "webp" : "png";
        const versionId = newId<"asset_version">();
        const path = `${data.projectId}/${data.assetId}/${versionId}/ai-${new Date().toISOString().slice(0, 10)}.${ext}`;
        const { error: upErr } = await admin.storage
          .from(BUCKET)
          .upload(path, new Blob([out.bytes as unknown as ArrayBuffer], { type: mimeType }), {
            contentType: mimeType,
            upsert: false,
          });
        if (upErr) throw new Error(`Bildet kunne ikke lagres: ${upErr.message}`);
        const dims = mimeType === "image/png" ? pngSize(out.bytes) : { width: null, height: null };
        await finish({ status: "done", result_path: path });
        return {
          ok: true,
          versionId,
          model: `${data.provider}/${model}`,
          jobId,
          media: {
            path,
            mimeType,
            width: dims.width,
            height: dims.height,
            byteSize: out.bytes.byteLength,
            sha256: await sha256(out.bytes),
          },
        };
      } catch (e) {
        const message = scrubSecret((e as Error).message || "Ukjent feil", secret).slice(0, 2000);
        await finish({ status: charged ? "lost" : "failed", error: message });
        return { ok: false, message: `Genereringen stoppet: ${message}` };
      }
    }

    /** Tjenesten har laget bildet (og tatt betalt): feiler lagringen etterpå, teller jobben likevel. */
    let charged = false;
    try {
      const size = data.purpose === "cutout" ? "1024x1536" : "1536x1024";
      const background = data.purpose === "cutout" ? "transparent" : "opaque";
      const headers = { Authorization: `Bearer ${key!}`, "Lovable-API-Key": key! };
      const references = await Promise.all(
        data.referencePaths.map(async (p) => {
          const { data: blob, error } = await admin.storage.from(BUCKET).download(p);
          if (error || !blob) throw new Error("Et forbildebilde kunne ikke hentes fra lagringen.");
          return blob;
        }),
      );
      // Ikke alle modeller tar imot alle valg (f.eks. gjennomsiktig bakgrunn) eller flere bilder. Avviser
      // tjenesten forespørselen (400), prøves den igjen med færre valg og til slutt bare det første bildet –
      // hvert forsøk logges.
      const full = {
        size,
        ...(model.startsWith("openai/") ? { background, output_format: "png" } : {}),
      };
      // Faller tjenesten tilbake til ett bilde, må det være dagens bilde (et stilforbilde alene ville bli
      // redigert i stedet for brukt som stil); ellers lages bildet bare fra beskrivelsen
      const fallback = data.identityFirst ? 1 : 0;
      const attempts: { extra: Record<string, string>; images: number }[] = [
        { extra: full, images: references.length },
        { extra: { size }, images: references.length },
        ...(references.length > 1
          ? [
              { extra: full, images: fallback },
              { extra: { size }, images: fallback },
            ]
          : []),
        { extra: {}, images: Math.min(fallback, references.length) },
      ];
      /** Beskrivelsen når færre bilder sendes enn den omtaler. */
      const promptFor = (images: number) =>
        images === references.length
          ? data.prompt
          : `${stripAttachedSection(data.prompt)}${
              images === 1
                ? "\n\nATTACHED IMAGES\nImage 1: the current design of the subject. Keep who it is."
                : ""
            }`;
      const send = (extra: Record<string, string>, images: number) => {
        if (images > 0) {
          const form = new FormData();
          form.append("model", model);
          form.append("prompt", promptFor(images));
          form.append("n", "1");
          for (const [k, v] of Object.entries(extra)) form.append(k, v);
          references.slice(0, images).forEach((ref, i) => {
            const type = ref.type && ref.type.startsWith("image/") ? ref.type : "image/png";
            const ext = type === "image/jpeg" ? "jpg" : type === "image/webp" ? "webp" : "png";
            // Ett bilde: «image» (som før); flere: «image[]» (OpenAI-formatet for flere forbilder)
            form.append(
              images === 1 ? "image" : "image[]",
              new File([ref], `reference-${i + 1}.${ext}`, { type }),
            );
          });
          return fetch(`${GATEWAY}/images/edits`, {
            method: "POST",
            headers,
            body: form,
            signal: AbortSignal.timeout(150_000),
          });
        }
        return fetch(`${GATEWAY}/images/generations`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ model, prompt: promptFor(0), n: 1, ...extra }),
          signal: AbortSignal.timeout(150_000),
        });
      };
      let res: Response | null = null;
      const log: string[] = [];
      for (const { extra, images } of attempts) {
        res = await send(extra, images);
        if (res.ok) break;
        const body = await res.text().catch(() => "");
        log.push(
          `${res.status} [${Object.keys(extra).join(",") || "ingen valg"}; ${images} bilde(r)]: ${body.slice(0, 400)}`,
        );
        const retry = res.status === 400 && !/safety|policy|moderation/i.test(body);
        if (!retry) break;
      }
      if (res?.ok) charged = true;
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
      await finish({
        status: charged && budgeted ? "lost" : "failed",
        error: message.slice(0, 2000),
      });
      return { ok: false, message: `Genereringen stoppet: ${message}` };
    }
  });
