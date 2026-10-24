/**
 * Selve bildegenereringen (kostnadsport, budsjett, leverandør og lagring), delt mellom enkeltgenerering
 * (generateImage) og masseharmoniseringen (P8). Bare server. Prompter og nøkler logges aldri.
 *
 * Massejobb (`existingJobId`): jobben er reservert og budsjettet kontrollert da brukeren godkjente den samlede
 * kostnaden; her oppdateres den reserverte jobben (ingen ny rad), og resultatet lagres som kvittering i
 * jobbens params før det returneres.
 */
import { assetFilePath, adaptPromptForModel, effortOf, estimateCostUsd, type ImageSize, imageSizesOf, newId, providerModel, stripAttachedSection, withFactSheet, MAX_PROMPT_CHARS } from "@/core";
import { checkSchema, type AnyClient } from "@/adapters/storage/project-rows";
import { GATEWAY, gatewayError, referenceImages } from "./gateway";
import { builtInImageModel, LOVABLE_CUTOUT_MODEL as CUTOUT_MODEL, LOVABLE_IMAGE_MODEL as IMAGE_MODEL } from "@/core";
import { MAX_PER_PROJECT_PER_DAY, MAX_PER_USER_PER_HOUR } from "./image-limits";
import type { GenerateImageInput, GenerateImageResult } from "./generate-image.functions";
import { t } from "@/core/i18n/keyed";

const BUCKET = "assets";

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

export async function runImageGeneration(
  data: GenerateImageInput,
  ctx: { userId: string; supabase: unknown },
  opts: { existingJobId?: string; storyboardTrace?: Readonly<Record<string, unknown>>; panelDimensions?: { width: number; height: number }; panelAspect?: import("./providers.server").ImageAspect; panelMask?: Blob; panelSketch?: Blob } = {},
): Promise<GenerateImageResult> {
  const batch = !!opts.existingJobId;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as unknown as AnyClient;
  const schema = await checkSchema(admin);
  if (schema.kind === "missing" || schema.version < 10)
    return {
      ok: false,
      message: t("adapters-ai-image-run-server.message.message.d132ffa15512"),
    };
  const own = data.provider !== "lovable";
  if (data.operation === "upscale" && !own)
    return {
      ok: false,
      message: t("adapters-ai-image-run-server.message.message.81113e80ff60"),
    };
  const key = process.env["LOVABLE_API_KEY"];
  if (!own && !key)
    return {
      ok: false,
      message: t("adapters-ai-image-run-server.message.message.a886c40aa9f9"),
    };

  // Et slettet prosjekt kan ikke få nye bilder (DEC-0046)
  const { data: proj } = await admin
    .from("projects")
    .select("*")
    .eq("id", data.projectId)
    .maybeSingle();
  if (!proj || (proj as { deleted_at?: string | null }).deleted_at)
    return { ok: false, message: t("adapters-ai-image-run-server.message.message.387c93fe625f") };

  const { data: asset } = await admin
    .from("assets")
    .select("id, kind, visual_brief")
    .eq("id", data.assetId)
    .eq("project_id", data.projectId)
    .maybeSingle();
  if (!asset)
    return {
      ok: false,
      message: t("adapters-ai-image-run-server.message.message.4cf31cd6afc2"),
    };
  if ((asset as { kind: string }).kind === "sound")
    return {
      ok: false,
      message: t("adapters-ai-image-run-server.message.message.09ccaf585ad5"),
    };
  // Faktaarket gjelder alltid (Øystein 23.10): mangler det i teksten, legges det til her på serveren
  {
    const sheet = (asset as { visual_brief?: string | null }).visual_brief ?? "";
    if (sheet.trim() && data.operation !== "upscale")
      data = { ...data, prompt: withFactSheet(data.prompt, sheet, MAX_PROMPT_CHARS) };
  }
  const refCheck = await referenceImages(admin, data.projectId, data.referencePaths);
  if (!refCheck.ok) return { ok: false, message: refCheck.message };

  // Grenser (sikring mot løpske kostnader)
  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
  const { count: mine } = await admin
    .from("generation_jobs")
    .select("id", { count: "exact", head: true })
    .eq("created_by", ctx.userId)
    .neq("kind", "prompt")
    .gte("created_at", hourAgo);
  if (!batch && (mine ?? 0) >= MAX_PER_USER_PER_HOUR)
    return {
      ok: false,
      message: t("adapters-ai-image-run-server.message.message.f634b8b27798", { MAX_PER_USER_PER_HOUR: String(MAX_PER_USER_PER_HOUR) }),
    };
  const { count: project } = await admin
    .from("generation_jobs")
    .select("id", { count: "exact", head: true })
    .eq("project_id", data.projectId)
    .neq("kind", "prompt")
    .gte("created_at", dayAgo);
  if (!batch && (project ?? 0) >= MAX_PER_PROJECT_PER_DAY)
    return {
      ok: false,
      message: t("adapters-ai-image-run-server.message.message.ae7bddb6ab0e", { MAX_PER_PROJECT_PER_DAY: String(MAX_PER_PROJECT_PER_DAY) }),
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
: builtInImageModel(data.model, data.purpose, {
        image: process.env["ANIMATIC_IMAGE_MODEL"] || IMAGE_MODEL,
        cutout: process.env["ANIMATIC_CUTOUT_MODEL"] || CUTOUT_MODEL,
      });
  // Administrator kan ha slått av leverandøren eller modellen for alle (DEC-0088, migrasjon 0034); egne
  // modeller (lagt til av administrator) finnes bare i innstillingene, som sendes videre under
  const aiGate = await (
    await import("@/adapters/account/ai-models.server")
  ).modelGate(admin, data.provider, model);
  if (aiGate.message) return { ok: false, message: aiGate.message };
  // Egen nøkkel (DEC-0069): modellen må finnes i katalogen, nøkkelen hos en av prosjektets eiere, og
  // eierens kostnadstak må ha plass
  const gate = own ? await import("./ai-gate.server") : null;
  let ownKey: Awaited<ReturnType<NonNullable<typeof gate>["projectKey"]>> = null;
  let costUsd: number | null = null;
  let size: ImageSize | null = null;
  if (own && gate) {
    if (schema.version < 24)
      return {
        ok: false,
        message: t("adapters-ai-image-run-server.message.message.1fb2430caade"),
      };
    const m = providerModel(data.provider, model, aiGate.settings);
    const want = data.operation === "upscale" ? "upscale" : "image";
    if (!m || m.capability !== want)
      return {
        ok: false,
        message: t("adapters-ai-image-run-server.message.message.1acc76ad53fd"),
      };
    if (want === "upscale" && data.referencePaths.length !== 1)
      return {
        ok: false,
        message: t("adapters-ai-image-run-server.message.message.1e599be03c56"),
      };
    if (want === "image" && m.requiresImage && data.referencePaths.length === 0)
      return {
        ok: false,
        message: t("adapters-ai-image-run-server.message.message.83727ffb6b6d"),
      };
    ownKey = await gate.projectKey(admin, data.projectId, data.provider, ctx.userId);
    if (!ownKey)
      return {
        ok: false,
        message: t("adapters-ai-image-run-server.message.message.31480f9aea4d"),
      };
    // Størrelsen modellen kan lage (ellers modellens standard)
    const sz = imageSizesOf(providerModel(data.provider, model, aiGate.settings));
    size = data.size && sz.sizes.includes(data.size) ? data.size : sz.standard;
    if (want === "upscale") {
      // Prisen følger størrelsen på resultatet (megapiksler): målene fra biblioteket
      const { data: src } = await admin
        .from("asset_versions")
        .select("width, height")
        .eq("project_id", data.projectId)
        .eq("media_path", data.referencePaths[0]!)
        .maybeSingle();
      const w = Number((src as { width?: number | null } | null)?.width ?? 0);
      const h = Number((src as { height?: number | null } | null)?.height ?? 0);
      const f = data.upscaleFactor ?? 2;
      // Ukjent størrelse: regnes som 2048 × 2048 (et øvre anslag for arbeidskopiene)
      const mp = ((w > 0 && h > 0 ? w * h : 2048 * 2048) * f * f) / 1_000_000;
      costUsd = estimateCostUsd(data.provider, model, { megapixels: mp }, aiGate.settings);
    } else
      costUsd = estimateCostUsd(
        data.provider,
        model,
        { images: 1, ...(size ? { size } : {}) },
        aiGate.settings,
      );
    const capMsg = batch ? null : await gate.overAccountCap(admin, ownKey.user_id, costUsd ?? 0, false);
    if (capMsg) return { ok: false, message: capMsg };
  }
  const jobId = opts.existingJobId ?? newId<"generation_job">();
  // Sporbarhet (DEC-0072, REQ-0257): params finnes fra migrasjon 0024
  const trace =
    schema.version >= 24
      ? await (
          await import("./trace.server")
        ).buildTrace(admin as AnyClient, data.projectId, {
          modelParams: {
            purpose: data.purpose,
            identityFirst: data.identityFirst ?? null,
            ...(size ? { size } : {}),
            ...(data.aspect ? { aspect: data.aspect } : {}),
            ...(data.negativePrompt ? { negativePrompt: data.negativePrompt } : {}),
            ...(data.operation === "upscale"
              ? { operation: "upscale", upscaleFactor: data.upscaleFactor ?? 2 }
              : {}),
          },
          referencePaths: data.referencePaths,
        })
      : null;
  let batchParams: Record<string, unknown> = {};
  const logErrBox: { error: { message: string } | null } = { error: null };
  const jobRow = {
    id: jobId,
    project_id: data.projectId,
    kind: "image",
    ...(trace || data.qualityProfile || opts.storyboardTrace
      ? {
          params: {
            ...(trace ? { trace } : {}),
            // Innsatsnivået jobben ble kjørt med (mandat 19.3, REQ-0275)
            effort: effortOf(providerModel(data.provider, model, aiGate.settings)),
            // Kvalitetsprofilen bildet ble laget med (M8, REQ-0859): et øyeblikksbilde
            ...(data.qualityProfile ? { qualityProfile: data.qualityProfile } : {}),
            ...(data.variantId ? { variantId: data.variantId } : {}),
            ...(opts.storyboardTrace ? { storyboard: opts.storyboardTrace } : {}),
          },
        }
      : {}),
    provider: data.provider,
    model,
    ...(ownKey
      ? { provider_key_id: ownKey.id, key_owner: ownKey.user_id, cost_usd: costUsd }
      : {}),
    prompt: opts.storyboardTrace ? "[storyboard]" : data.prompt,
    asset_id: data.assetId,
    reference_path: data.referencePaths[0] ?? null,
    ...(schema.version >= 22 ? { reference_paths: data.referencePaths } : {}),
    status: "running",
    created_by: ctx.userId,
    ...(budgeted ? { estimated_cost: price } : {}),
  } as Record<string, unknown>;
  if (batch) {
    // Massejobb: jobben ble reservert (og budsjettet kontrollert) da jobben ble godkjent
    const { data: prev } = await admin.from("generation_jobs").select("params").eq("id", jobId).maybeSingle();
    batchParams = { ...(((prev as { params?: Record<string, unknown> } | null)?.params) ?? {}), ...((jobRow["params"] as Record<string, unknown> | undefined) ?? {}) };
    const { id: _id, created_by: _c, ...rest } = jobRow;
    void _id; void _c;
    jobRow["params"] = batchParams;
    Object.assign(rest, { params: batchParams });
    const { error } = await admin.from("generation_jobs").update(rest as never).eq("id", jobId);
    logErrBox.error = error;
  } else {
    const { error } = await admin.from("generation_jobs").insert(jobRow as never);
    logErrBox.error = error;
  }
  const logErr = logErrBox.error;
  if (logErr)
    return {
      ok: false,
      message: t("adapters-ai-image-run-server.message.message.67144c40f299", { message: String(logErr.message) }),
    };
  // Samtidige forespørsler: tell på nytt med denne jobben registrert
  if (!batch) {
    const [{ count: mineNow }, { count: projectNow }] = await Promise.all([
      admin
        .from("generation_jobs")
        .select("id", { count: "exact", head: true })
        .eq("created_by", ctx.userId)
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
        message: t("adapters-ai-image-run-server.message.message.f5c81beffbff"),
      };
    }
  }
  if (!batch && budgeted && pr.ai_month_limit !== null && pr.ai_month_limit !== undefined) {
    // Månedsstarten i prosjektets budsjettidssone (G-3 del 2) – samme grense som databasetriggerne
    const { data: monthSince, error: pe } = await admin.rpc("project_period_start", {
      p_project: data.projectId,
      p_unit: "month",
    });
    if (pe || typeof monthSince !== "string") throw new Error(String(pe?.message ?? "project_period_start"));
    const { count: used } = await admin
      .from("generation_jobs")
      .select("id", { count: "exact", head: true })
      .eq("project_id", data.projectId)
      .neq("status", "failed")
      .neq("kind", "prompt")
      .gte("created_at", monthSince);
    if ((used ?? 0) > Number(pr.ai_month_limit)) {
      // Denne jobben (og eventuelle samtidige) går over rammen: den fjernes igjen, ingenting sendes
      await admin.from("generation_jobs").delete().eq("id", jobId);
      return {
        ok: false,
        message: t("adapters-ai-image-run-server.message.message.d81aa0c6f0c1", { ai_month_limit: String(pr.ai_month_limit) }),
      };
    }
  }

  if (!batch && ownKey && gate) {
    const capMsg = await gate.overAccountCap(admin, ownKey.user_id, costUsd ?? 0, true);
    if (capMsg) {
      await admin.from("generation_jobs").delete().eq("id", jobId);
      return { ok: false, message: capMsg };
    }
  }

  const finish = async (patch: Record<string, unknown>, receipt?: unknown) => {
    // Massejobb: kvitteringen lagres varig på jobben før noe annet, så et fakturert resultat aldri kjøres på nytt
    const extra = (batch || opts.storyboardTrace) && receipt ? { params: { ...(batch ? batchParams : (jobRow["params"] as Record<string, unknown> ?? {})), result: receipt } } : {};
    await admin
      .from("generation_jobs")
      .update({ ...patch, ...extra, finished_at: new Date().toISOString() } as never)
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
      // Oppskalering: tjenesten henter bildet selv (lenke), så det lastes ikke ned her
      const references =
        data.operation === "upscale"
          ? []
          : await Promise.all(
              data.referencePaths.map(async (p) => {
                const { data: blob, error } = await admin.storage.from(BUCKET).download(p);
                if (error || !blob)
                  throw new Error(
                    t("adapters-ai-image-run-server.references.data-reference-paths-map.f7d305e7282b"),
                  );
                return blob;
              }),
            );
      // Modellens lengdegrense (DEC-0070): ellers avviser tjenesten beskrivelsen
      const m = providerModel(data.provider, model, aiGate.settings);
      const req = {
        key: secret,
        model,
        prompt: m ? adaptPromptForModel(data.prompt, m).text : data.prompt,
        references,
        purpose: data.purpose,
        ...(size ? { size } : {}),
        ...(data.aspect ? { aspect: data.aspect } : {}),
        ...(opts.panelAspect ? { aspect: opts.panelAspect } : {}),
        ...(opts.panelDimensions ? { dimensions: opts.panelDimensions } : {}),
        ...(opts.panelMask ? { mask: opts.panelMask } : {}),
        ...(opts.panelSketch ? { sketch: opts.panelSketch } : {}),
        ...(data.negativePrompt ? { negativePrompt: data.negativePrompt } : {}),
      };
      let out: { bytes: Uint8Array; mimeType: string };
      if (data.operation === "upscale") {
        if (data.provider !== "fal")
          return {
            ok: false,
            message: t("adapters-ai-image-run-server.message.message.3754efa28d38"),
          };
        const { data: signed } = await admin.storage
          .from(BUCKET)
          .createSignedUrl(data.referencePaths[0]!, 600);
        if (!signed?.signedUrl)
          throw new Error(
            t("adapters-ai-image-run-server.run-image-generation.message.ce98260c0ee2"),
          );
        out = await ADAPTERS.fal.upscale({
          key: secret,
          model,
          imageUrl: signed.signedUrl,
          factor: data.upscaleFactor ?? 2,
        });
      } else if (data.provider === "openai") out = await ADAPTERS.openai.image(req);
      else if (data.provider === "google") out = await ADAPTERS.google.image(req);
      else if (data.provider === "fal") {
        // fal henter forbildet selv: midlertidige lenker (10 minutter)
        const referenceUrls: string[] = [];
        for (const p of data.referencePaths) {
          const { data: signed } = await admin.storage.from(BUCKET).createSignedUrl(p, 600);
          if (signed?.signedUrl) referenceUrls.push(signed.signedUrl);
        }
        out = await ADAPTERS.fal.image({ ...req, referenceUrls });
      } else
        return {
          ok: false,
          message: t("adapters-ai-image-run-server.message.message.323549d2230f"),
        };
      charged = true;
      const mimeType = ["image/png", "image/jpeg", "image/webp"].includes(out.mimeType)
        ? out.mimeType
        : "image/png";
      const ext = mimeType === "image/jpeg" ? "jpg" : mimeType === "image/webp" ? "webp" : "png";
      const versionId = newId<"asset_version">();
      const path = assetFilePath(
        data.projectId,
        "generated",
        data.assetId,
        versionId,
        `${data.operation === "upscale" ? "upscale" : "ai"}-${new Date().toISOString().slice(0, 10)}.${ext}`,
      );
      const { error: upErr } = await admin.storage
        .from(BUCKET)
        .upload(path, new Blob([out.bytes as unknown as ArrayBuffer], { type: mimeType }), {
          contentType: mimeType,
          upsert: false,
        });
      if (upErr)
        throw new Error(
          t("adapters-ai-image-run-server.run-image-generation.message.9a64b624be20", { message: String(upErr.message) }),
        );
      const dims = mimeType === "image/png" ? pngSize(out.bytes) : { width: null, height: null };
      const done: GenerateImageResult = {
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
    await finish({ status: "done", result_path: path }, done);
    return done;
    } catch (e) {
      const message = scrubSecret(
        (e as Error).message || t("adapters-ai-image-run-server.message.scrub-secret.c72966a8534f"),
        secret,
      ).slice(0, 2000);
      await finish({ status: charged ? "lost" : "failed", error: opts.storyboardTrace ? "storyboard_provider_error" : message });
      return {
        ok: false,
        message: t("adapters-ai-image-run-server.message.message.eb194f33ae99", { message: String(message) }),
      };
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
        if (error || !blob)
          throw new Error(
            t("adapters-ai-image-run-server.references.data-reference-paths-map.f7d305e7282b.2"),
          );
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
        // i18n-ignore: intern logg i databasen, vises ikke
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
      // Bare status og valg i serverloggen, aldri leverandørens svartekst (kan gjenta prompten, Ø-11)
      console.warn("[generateImage] lyktes etter nye forsøk:", log.map((l) => l.split("]:")[0] + "]").join(" | ").slice(0, 600)); // i18n-ignore
    const json = (await res.json()) as { data?: { b64_json?: string; url?: string }[] };
    const first = json.data?.[0];
    let bytes: Uint8Array;
    if (first?.b64_json) bytes = (await import("./providers.server")).unb64(first.b64_json);
    else if (first?.url) bytes = new Uint8Array(await (await fetch(first.url)).arrayBuffer());
    else
      throw new Error(
        t("adapters-ai-image-run-server.run-image-generation.message.ebf5f139d2c4"),
      );

    const versionId = newId<"asset_version">();
    const date = new Date().toISOString().slice(0, 10);
    const path = assetFilePath(
      data.projectId,
      "generated",
      data.assetId,
      versionId,
      `ai-${date}.png`,
    );
    const { error: upErr } = await admin.storage
      .from(BUCKET)
      .upload(path, new Blob([bytes as unknown as ArrayBuffer], { type: "image/png" }), {
        contentType: "image/png",
        upsert: false,
      });
    if (upErr)
      throw new Error(
        t("adapters-ai-image-run-server.run-image-generation.message.9a64b624be20.2", { message: String(upErr.message) }),
      );
    const dims = pngSize(bytes);
    const done: GenerateImageResult = {
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
    await finish({ status: "done", result_path: path }, done);
    return done;
  } catch (e) {
    const message = (e as Error).message || t("adapters-ai-image-run-server.message.message.c72966a8534f");
    await finish({
      status: charged && budgeted ? "lost" : "failed",
      error: message.slice(0, 2000),
    });
    return {
      ok: false,
      message: t("adapters-ai-image-run-server.message.message.eb194f33ae99.2", { message: String(message) }),
    };
  }
}
