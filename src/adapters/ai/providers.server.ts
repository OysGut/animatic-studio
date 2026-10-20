/**
 * Adaptere for AI-leverandørene brukerne kobler til med egne nøkler (DEC-0069, REQ-0269 leverandøruavhengig
 * arkitektur). BARE PÅ SERVEREN – importeres dynamisk i serverfunksjonene. Nøkkelen kommer dekryptert fra
 * key-vault.server.ts, brukes i ett kall og logges aldri.
 *
 * Hver leverandør kan: teste nøkkelen, lage bilde, starte og følge en videojobb, og lage lyd – det den
 * støtter (se katalogen i src/core/generation/providers.ts). Formatene følger leverandørenes egne
 * dokumentasjon (oktober 2026) og er ikke prøvd mot de ekte tjenestene herfra (KI-153).
 */
import { filterTextModels, type ProviderId, type TextProviderId } from "@/core";
import { t as tk } from "@/core/i18n/keyed";

const T_TEST = 20_000;
const T_IMAGE = 150_000;
const T_SUBMIT = 60_000;
const T_DOWNLOAD = 120_000;
const T_TEXT = 120_000;
/** Største video vi henter inn (lagringsgrensen og minnet i serverfunksjonen). */
export const MAX_VIDEO_BYTES = 300 * 1024 * 1024;

export interface ImageRequest {
  readonly key: string;
  readonly model: string;
  readonly prompt: string;
  readonly references: readonly Blob[];
  readonly purpose: "cutout" | "background";
  /** Valgt bildestørrelse (bare modeller som tar imot den). */
  readonly size?: "1K" | "2K" | "4K";
  /** Sideforhold (DEC-0080: karakterark er brede); standard ut fra bruken (figur 2:3, bakgrunn 3:2). */
  readonly aspect?: ImageAspect;
  /** Negativ beskrivelse (bare modeller med eget felt for det, f.eks. Qwen). */
  readonly negativePrompt?: string;
}

export type ImageAspect = "2:3" | "3:2" | "1:1" | "16:9";

/** Sideforholdet for forespørselen. */
export function aspectOf(r: Pick<ImageRequest, "aspect" | "purpose">): ImageAspect {
  return r.aspect ?? (r.purpose === "cutout" ? "2:3" : "3:2");
}

/** fal sine faste størrelser (Seedream, Qwen). */
function falImageSize(a: ImageAspect): string {
  return a === "2:3"
    ? "portrait_4_3"
    : a === "1:1"
      ? "square_hd"
      : a === "16:9"
        ? "landscape_16_9"
        : "landscape_4_3";
}

export interface UpscaleRequest {
  readonly key: string;
  readonly model: string;
  /** Midlertidig lenke til bildet. */
  readonly imageUrl: string;
  readonly factor: 2 | 4;
}

export interface VideoRequest {
  readonly key: string;
  readonly model: string;
  readonly prompt: string;
  /** Startbildet (bytes) og en midlertidig lenke til det (for leverandører som henter selv). */
  readonly image: { readonly blob: Blob; readonly url: string } | null;
  readonly seconds: number;
  readonly aspect: "16:9" | "9:16";
}

/**
 * Video fra 2D-scenen (DEC-0083): leverandøren tegner om en video. Lenkene er midlertidige og hentes av
 * leverandøren selv. Resultatet er like langt som videoen som sendes, og uten lyd.
 */
export interface VideoEditRequest {
  readonly key: string;
  readonly model: string;
  readonly prompt: string;
  readonly videoUrl: string;
  /** Referansebilder av figurene, i samme rekkefølge som @Element1, @Element2 … i beskrivelsen. */
  readonly elementUrls: readonly string[];
  /** Andre referansebilder (bakgrunn, samlebilde), i samme rekkefølge som @Image1 … (DEC-0085). */
  readonly imageUrls?: readonly string[];
  /** Lyden i videoen som sendes, skal være med i resultatet (DEC-0085). */
  readonly keepAudio?: boolean;
}

export type VideoPoll =
  | { readonly state: "running"; readonly progress?: number }
  | { readonly state: "done"; readonly bytes: Uint8Array; readonly mimeType: string }
  | { readonly state: "failed"; readonly message: string };

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/**
 * Base64 med Buffer der den finnes (Node/Workers med Node-støtte): langt mindre minne og CPU enn en
 * tegn-for-tegn-løkke. Store bilder (Nano Banana Pro, 2K–4K) ga «Internal server error» etter at bildet var
 * laget og fakturert (Mars 2026-10-13).
 */
const NodeBuffer = (globalThis as { Buffer?: typeof import("node:buffer").Buffer }).Buffer;
function b64(bytes: Uint8Array): string {
  if (NodeBuffer)
    return NodeBuffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("base64");
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
export function unb64(s: string): Uint8Array {
  if (NodeBuffer) {
    const b = NodeBuffer.from(s, "base64");
    return new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
  }
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
const bytesOf = async (b: Blob) => new Uint8Array(await b.arrayBuffer());
const mimeOf = (b: Blob) => (b.type && b.type.startsWith("image/") ? b.type : "image/png");

/**
 * Fjern nøkkelen (og ting som ligner nøkler) fra en feiltekst før den lagres eller vises. Feiltekster kan
 * leses av alle i prosjektet.
 */
export function scrubSecret(message: string, secret?: string | null): string {
  let m = message;
  if (secret && secret.length >= 6) m = m.split(secret).join("…");
  return m.replace(
    /\b(sk-[A-Za-z0-9_-]{8,}|AIza[0-9A-Za-z_-]{20,}|key_[A-Za-z0-9]{16,}|xi-[A-Za-z0-9]{16,})/g,
    "…",
  );
}

/** Feilteksten fra tjenesten (uten nøkler), kort. */
async function failure(res: Response): Promise<ProviderError> {
  const body = await res.text().catch(() => "");
  let detail = body;
  try {
    const j = JSON.parse(body) as Record<string, unknown>;
    const e = j["error"] as Record<string, unknown> | string | undefined;
    detail =
      (typeof e === "string" ? e : (e?.["message"] as string | undefined)) ??
      (j["detail"] ? JSON.stringify(j["detail"]) : undefined) ??
      (j["message"] as string | undefined) ??
      body;
  } catch {
    /* tekst */
  }
  return new ProviderError(
    `${res.status}: ${String(detail).replace(/\s+/g, " ").trim().slice(0, 300)}`,
    res.status,
  );
}

async function call(url: string, init: RequestInit, timeout: number): Promise<Response> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeout) });
  if (!res.ok) throw await failure(res);
  return res;
}

/**
 * Adressen til en ferdig fil kommer fra leverandørens svar: bare https og vanlige vertsnavn (ikke IP-adresser,
 * localhost eller interne navn), så serveren ikke kan lures til å hente fra interne tjenester.
 */
export function safeDownloadUrl(raw: string): URL | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  if (u.protocol !== "https:" || u.username || u.password) return null;
  if (!host.includes(".") || host.startsWith("[") || /^[\d.]+$/.test(host)) return null;
  if (/(^|\.)(localhost|local|internal|intranet|lan|home|corp)$/.test(host)) return null;
  if (host === "metadata.google.internal" || host.endsWith(".svc")) return null;
  return u;
}

/** Les svaret i biter og stopp ved grensen (også når lengden ikke er oppgitt). */
async function readLimited(res: Response, max: number): Promise<Uint8Array> {
  const len = Number(res.headers.get("content-length") ?? "0");
  if (len > max)
    throw new ProviderError(
      tk("adapters-ai-providers-server.read-limited.message.d8da813dcf12"),
      413,
    );
  if (!res.body) return new Uint8Array(0);
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => undefined);
      throw new ProviderError(
        tk("adapters-ai-providers-server.read-limited.message.d8da813dcf12.2"),
        413,
      );
    }
    parts.push(value);
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.byteLength;
  }
  return out;
}

/**
 * Hent en ferdig fil. Videresendinger følges for hånd (høyst 3), hver adresse kontrolleres, og nøkkelen sendes
 * bare til samme vert som den første adressen.
 */
async function download(url: string, headers: Record<string, string> = {}) {
  const first = safeDownloadUrl(url);
  if (!first)
    throw new ProviderError(
      tk("adapters-ai-providers-server.download.message.9e6d5abe9c39"),
      400,
    );
  let current: URL = first;
  const firstHost = first.host;
  for (let hop = 0; hop < 4; hop++) {
    const res: Response = await fetch(current.toString(), {
      headers: current.host === firstHost ? headers : {},
      redirect: "manual",
      signal: AbortSignal.timeout(T_DOWNLOAD),
    });
    if (res.status >= 300 && res.status < 400) {
      const loc: string | null = res.headers.get("location");
      const next: URL | null = loc ? safeDownloadUrl(new URL(loc, current).toString()) : null;
      if (!next)
        throw new ProviderError(
          tk("adapters-ai-providers-server.download.message.40918853ace9"),
          400,
        );
      current = next;
      continue;
    }
    if (!res.ok) throw await failure(res);
    const bytes = await readLimited(res, MAX_VIDEO_BYTES);
    return { bytes, mimeType: res.headers.get("content-type")?.split(";")[0] || "video/mp4" };
  }
  throw new ProviderError("For mange videresendinger.", 400);
}

/** Første base64-bilde i et svar (leverandørene legger det på litt ulike steder). */
export function findBase64Image(json: unknown): { data: string; mimeType: string } | null {
  const seen = new Set<unknown>();
  const walk = (x: unknown): { data: string; mimeType: string } | null => {
    if (!x || typeof x !== "object" || seen.has(x)) return null;
    seen.add(x);
    const o = x as Record<string, unknown>;
    for (const k of ["inlineData", "inline_data"]) {
      const d = o[k] as Record<string, unknown> | undefined;
      if (d && typeof d["data"] === "string")
        return {
          data: d["data"],
          mimeType: String(d["mimeType"] ?? d["mime_type"] ?? "image/png"),
        };
    }
    if (
      (o["type"] === "image" || "b64_json" in o) &&
      typeof (o["data"] ?? o["b64_json"]) === "string"
    )
      return {
        data: String(o["data"] ?? o["b64_json"]),
        mimeType: String(o["mime_type"] ?? o["mimeType"] ?? "image/png"),
      };
    for (const v of Object.values(o)) {
      const hit = walk(v);
      if (hit) return hit;
    }
    return null;
  };
  return walk(json);
}

// ---------------------------------------------------------------- OpenAI

const OPENAI = "https://api.openai.com/v1";
const openaiAuth = (key: string) => ({ Authorization: `Bearer ${key}` });

const openai = {
  async test(key: string) {
    await call(`${OPENAI}/models`, { headers: openaiAuth(key) }, T_TEST);
  },
  async image(r: ImageRequest) {
    const a = aspectOf(r);
    const size = a === "2:3" ? "1024x1536" : a === "1:1" ? "1024x1024" : "1536x1024";
    let res: Response;
    if (r.references.length) {
      const form = new FormData();
      form.append("model", r.model);
      form.append("prompt", r.prompt);
      form.append("size", size);
      if (r.purpose === "cutout") form.append("background", "transparent");
      r.references.forEach((b, i) =>
        form.append(
          r.references.length === 1 ? "image" : "image[]",
          new File([b], `ref-${i + 1}.png`, { type: mimeOf(b) }),
        ),
      );
      res = await call(
        `${OPENAI}/images/edits`,
        { method: "POST", headers: openaiAuth(r.key), body: form },
        T_IMAGE,
      );
    } else {
      res = await call(
        `${OPENAI}/images/generations`,
        {
          method: "POST",
          headers: { ...openaiAuth(r.key), "Content-Type": "application/json" },
          body: JSON.stringify({
            model: r.model,
            prompt: r.prompt,
            size,
            n: 1,
            ...(r.purpose === "cutout" ? { background: "transparent" } : {}),
          }),
        },
        T_IMAGE,
      );
    }
    const img = findBase64Image(await res.json());
    if (!img)
      throw new ProviderError(
        tk("adapters-ai-providers-server.image.message.8717fc472f21"),
        502,
      );
    return { bytes: unb64(img.data), mimeType: "image/png" };
  },
  async startVideo(r: VideoRequest) {
    const form = new FormData();
    form.append("model", r.model);
    form.append("prompt", r.prompt);
    form.append("seconds", String(r.seconds));
    form.append("size", r.aspect === "16:9" ? "1280x720" : "720x1280");
    if (r.image)
      form.append(
        "input_reference",
        new File([r.image.blob], "start.png", { type: mimeOf(r.image.blob) }),
      );
    const res = await call(
      `${OPENAI}/videos`,
      { method: "POST", headers: openaiAuth(r.key), body: form },
      T_SUBMIT,
    );
    const j = (await res.json()) as { id?: string };
    if (!j.id)
      throw new ProviderError(
        tk("adapters-ai-providers-server.start-video.message.f60f354802e8"),
        502,
      );
    return j.id;
  },
  async pollVideo(key: string, _model: string, id: string): Promise<VideoPoll> {
    const res = await call(
      `${OPENAI}/videos/${encodeURIComponent(id)}`,
      { headers: openaiAuth(key) },
      T_TEST,
    );
    const j = (await res.json()) as {
      status?: string;
      progress?: number;
      error?: { message?: string };
    };
    if (j.status === "completed") {
      const d = await download(
        `${OPENAI}/videos/${encodeURIComponent(id)}/content`,
        openaiAuth(key),
      );
      return { state: "done", ...d };
    }
    if (j.status === "failed")
      return {
        state: "failed",
        message: j.error?.message ?? tk("adapters-ai-providers-server.message.message.0ddf8402a72b"),
      };
    return {
      state: "running",
      ...(typeof j.progress === "number" ? { progress: j.progress } : {}),
    };
  },
};

// ---------------------------------------------------------------- Google Gemini

const GEMINI = "https://generativelanguage.googleapis.com/v1beta";
const geminiAuth = (key: string) => ({ "x-goog-api-key": key });

const google = {
  async test(key: string) {
    await call(`${GEMINI}/models?pageSize=1`, { headers: geminiAuth(key) }, T_TEST);
  },
  async image(r: ImageRequest) {
    const refs = await Promise.all(
      r.references.map(async (b) => ({ mime: mimeOf(b), data: b64(await bytesOf(b)) })),
    );
    const aspect = aspectOf(r);
    // Interactions API (gjeldende dokumentasjon); faller tilbake til generateContent hvis den ikke finnes
    let res: Response;
    try {
      res = await call(
        `${GEMINI}/interactions`,
        {
          method: "POST",
          headers: { ...geminiAuth(r.key), "Content-Type": "application/json" },
          body: JSON.stringify({
            model: r.model,
            input: [
              { type: "text", text: r.prompt },
              ...refs.map((x) => ({ type: "image", mime_type: x.mime, data: x.data })),
            ],
            response_format: {
              type: "image",
              aspect_ratio: aspect,
              // Store bilder sendes som JPEG (frilegging trenger PNG): mindre svar og mindre minne
              mime_type: r.purpose === "cutout" ? "image/png" : "image/jpeg",
              ...(r.size ? { image_size: r.size } : {}),
            },
          }),
        },
        T_IMAGE,
      );
    } catch (e) {
      if (!(e instanceof ProviderError) || (e.status !== 404 && e.status !== 400)) throw e;
      res = await call(
        `${GEMINI}/models/${encodeURIComponent(r.model)}:generateContent`,
        {
          method: "POST",
          headers: { ...geminiAuth(r.key), "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: r.prompt },
                  ...refs.map((x) => ({ inlineData: { mimeType: x.mime, data: x.data } })),
                ],
              },
            ],
            generationConfig: {
              responseModalities: ["IMAGE"],
              imageConfig: { aspectRatio: aspect, ...(r.size ? { imageSize: r.size } : {}) },
            },
          }),
        },
        T_IMAGE,
      );
    }
    let json: unknown = await res.json();
    const img = findBase64Image(json);
    json = null; // svaret kan være titalls MB: slipp det før bildet pakkes ut
    if (!img)
      throw new ProviderError(
        tk("adapters-ai-providers-server.image.message.8717fc472f21.2"),
        502,
      );
    return { bytes: unb64(img.data), mimeType: img.mimeType };
  },
  async startVideo(r: VideoRequest) {
    const image = r.image
      ? { inlineData: { mimeType: mimeOf(r.image.blob), data: b64(await bytesOf(r.image.blob)) } }
      : undefined;
    const res = await call(
      `${GEMINI}/models/${encodeURIComponent(r.model)}:predictLongRunning`,
      {
        method: "POST",
        headers: { ...geminiAuth(r.key), "Content-Type": "application/json" },
        body: JSON.stringify({
          instances: [{ prompt: r.prompt, ...(image ? { image } : {}) }],
          parameters: { aspectRatio: r.aspect, durationSeconds: r.seconds, resolution: "720p" },
        }),
      },
      T_SUBMIT,
    );
    const j = (await res.json()) as { name?: string };
    if (!j.name)
      throw new ProviderError(
        tk("adapters-ai-providers-server.start-video.message.f60f354802e8.2"),
        502,
      );
    return j.name;
  },
  async pollVideo(key: string, _model: string, name: string): Promise<VideoPoll> {
    // Operasjonsnavnet kommer fra Google; bare den kjente formen godtas (ingen vilkårlige adresser)
    if (!/^models\/[\w.-]+\/operations\/[\w.-]+$/.test(name))
      return { state: "failed", message: tk("adapters-ai-providers-server.message.message.870b50c7270e") };
    const res = await call(`${GEMINI}/${name}`, { headers: geminiAuth(key) }, T_TEST);
    const j = (await res.json()) as {
      done?: boolean;
      error?: { message?: string };
      response?: { generateVideoResponse?: { generatedSamples?: { video?: { uri?: string } }[] } };
    };
    if (!j.done) return { state: "running" };
    if (j.error)
      return {
        state: "failed",
        message: j.error.message ?? tk("adapters-ai-providers-server.message.message.0ddf8402a72b.2"),
      };
    const uri = j.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
    if (!uri)
      return {
        state: "failed",
        message: tk("adapters-ai-providers-server.message.message.963db10a3e74"),
      };
    if (!uri.startsWith("https://generativelanguage.googleapis.com/"))
      return {
        state: "failed",
        message: tk("adapters-ai-providers-server.message.message.42c98c0484e9"),
      };
    return { state: "done", ...(await download(uri, geminiAuth(key))) };
  },
};

// ---------------------------------------------------------------- fal.ai

const FAL_QUEUE = "https://queue.fal.run";
const falAuth = (key: string) => ({ Authorization: `Key ${key}` });
/** Bare kjente modeller (modell-ID-en går inn i adressen). */
const FAL_MODEL = /^fal-ai\/[a-z0-9./-]+$/;

async function falRun(key: string, model: string, input: Record<string, unknown>) {
  const res = await call(
    `${FAL_QUEUE}/${model}`,
    {
      method: "POST",
      headers: { ...falAuth(key), "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
    T_SUBMIT,
  );
  const j = (await res.json()) as { request_id?: string };
  if (!j.request_id)
    throw new ProviderError(
      tk("adapters-ai-providers-server.fal-run.message.d14cfe249470"),
      502,
    );
  return j.request_id;
}

/**
 * Status og resultat ligger under app-ID-en (eier/app), ikke hele endepunktet:
 * «fal-ai/flux-pro/kontext/text-to-image» spørres på «fal-ai/flux-pro/requests/…».
 * Hele stien gir 405 – jobben er da allerede betalt (funnet av Mars 2026-10-13).
 */
export function falAppId(model: string): string {
  return model.split("/").slice(0, 2).join("/");
}

async function falPoll(key: string, model: string, id: string) {
  const base = `${FAL_QUEUE}/${falAppId(model)}/requests/${encodeURIComponent(id)}`;
  const st = (await (await call(`${base}/status`, { headers: falAuth(key) }, T_TEST)).json()) as {
    status?: string;
    error?: string;
  };
  if (st.status !== "COMPLETED") return { done: false as const };
  const res = await fetch(base, { headers: falAuth(key), signal: AbortSignal.timeout(T_TEST) });
  if (!res.ok) return { done: true as const, error: (await failure(res)).message };
  return { done: true as const, result: (await res.json()) as Record<string, unknown> };
}

const fal = {
  async test(key: string) {
    // fal har ingen gratis «hvem er jeg»: modellisten krever gyldig nøkkel
    await call("https://api.fal.ai/v1/models?limit=1", { headers: falAuth(key) }, T_TEST);
  },
  async image(r: ImageRequest & { referenceUrls: readonly string[] }) {
    const refs = r.referenceUrls;
    const aspect = aspectOf(r);
    let model: string;
    let input: Record<string, unknown>;
    if (r.model.startsWith("fal-ai/bytedance/seedream")) {
      // Seedream (DEC-0080): redigering med opptil 10 forbilder, ellers tekst til bilde
      model = refs.length ? `${r.model}/edit` : `${r.model}/text-to-image`;
      input = {
        prompt: r.prompt,
        ...(refs.length ? { image_urls: refs.slice(0, 10) } : {}),
        image_size: falImageSize(aspect),
        num_images: 1,
      };
    } else if (r.model.startsWith("fal-ai/qwen-image-edit")) {
      // Qwen-Image-Edit: endrer bilder (krever forbilde), har negativ beskrivelse
      if (!refs.length)
        throw new ProviderError(
          tk("adapters-ai-providers-server.image.message.d0a954759e5b"),
          400,
        );
      model = r.model;
      input = {
        prompt: r.prompt,
        image_urls: refs.slice(0, 4),
        image_size: falImageSize(aspect),
        num_images: 1,
        output_format: "png",
        ...(r.negativePrompt ? { negative_prompt: r.negativePrompt } : {}),
      };
    } else {
      // FLUX Kontext: med forbilde redigering (ett bilde); uten: tekst til bilde
      model = refs.length ? r.model : `${r.model}/text-to-image`;
      input = {
        prompt: r.prompt,
        ...(refs.length ? { image_url: refs[0] } : {}),
        aspect_ratio: aspect,
        num_images: 1,
        output_format: "png",
      };
    }
    if (!FAL_MODEL.test(model)) throw new ProviderError(tk("adapters-ai-providers-server.image.message.e90326fd1a56"), 400);
    const id = await falRun(r.key, model, input);
    const deadline = Date.now() + T_IMAGE;
    while (Date.now() < deadline) {
      await new Promise((ok) => setTimeout(ok, 2500));
      const p = await falPoll(r.key, model, id);
      if (!p.done) continue;
      if ("error" in p)
        throw new ProviderError(
          p.error ?? tk("adapters-ai-providers-server.image.message.bb0e3972e203"),
          502,
        );
      const url = (p.result["images"] as { url?: string }[] | undefined)?.[0]?.url;
      if (!url)
        throw new ProviderError(
          tk("adapters-ai-providers-server.image.message.8717fc472f21.3"),
          502,
        );
      const d = await download(url);
      return {
        bytes: d.bytes,
        mimeType: d.mimeType.startsWith("image/") ? d.mimeType : "image/png",
      };
    }
    throw new ProviderError(
      tk("adapters-ai-providers-server.image.message.8fe0e5a85b98"),
      504,
    );
  },
  /** Oppskalering (DEC-0080): SeedVR2 (skarpere) eller Clarity (med AI-detaljer). */
  async upscale(r: UpscaleRequest) {
    if (!FAL_MODEL.test(r.model))
      throw new ProviderError(tk("adapters-ai-providers-server.upscale.message.b327f2c053a7"), 400);
    let input: Record<string, unknown>;
    if (r.model.startsWith("fal-ai/seedvr"))
      input = {
        image_url: r.imageUrl,
        upscale_mode: "factor",
        upscale_factor: r.factor,
        output_format: "png",
      };
    else if (r.model.startsWith("fal-ai/clarity-upscaler"))
      input = {
        image_url: r.imageUrl,
        upscale_factor: r.factor,
        // Lite «kreativitet» og høy likhet: bildet skal bli skarpere, ikke tegnes om
        creativity: 0.2,
        resemblance: 0.85,
      };
    else
      throw new ProviderError(tk("adapters-ai-providers-server.upscale.message.5aa67ddbf871"), 400);
    const id = await falRun(r.key, r.model, input);
    const deadline = Date.now() + T_IMAGE;
    while (Date.now() < deadline) {
      await new Promise((ok) => setTimeout(ok, 2500));
      const p = await falPoll(r.key, r.model, id);
      if (!p.done) continue;
      if ("error" in p)
        throw new ProviderError(
          p.error ?? tk("adapters-ai-providers-server.upscale.message.f0751c7e72eb"),
          502,
        );
      const url = (p.result["image"] as { url?: string } | undefined)?.url;
      if (!url)
        throw new ProviderError(
          tk("adapters-ai-providers-server.upscale.message.0bf4fbe4f680"),
          502,
        );
      const d = await download(url);
      return {
        bytes: d.bytes,
        mimeType: d.mimeType.startsWith("image/") ? d.mimeType : "image/png",
      };
    }
    throw new ProviderError(
      tk("adapters-ai-providers-server.upscale.message.029afeaf1e8e"),
      504,
    );
  },
  async startVideo(r: VideoRequest) {
    if (!FAL_MODEL.test(r.model))
      throw new ProviderError(tk("adapters-ai-providers-server.start-video.message.4ffaa865df92"), 400);
    if (!r.image)
      throw new ProviderError(
        tk("adapters-ai-providers-server.start-video.message.534bc6ed5194"),
        400,
      );
    return falRun(r.key, r.model, {
      prompt: r.prompt,
      start_image_url: r.image.url,
      duration: String(r.seconds),
      generate_audio: false,
    });
  },
  /** Kling O3 Edit (DEC-0083): videoen er @Video1, figurene @Element1 … med bildet som forside. */
  async editVideo(r: VideoEditRequest) {
    if (!FAL_MODEL.test(r.model) || !r.model.includes("video-to-video"))
      throw new ProviderError(tk("adapters-ai-providers-server.edit-video.message.453bff21f388"), 400);
    return falRun(r.key, r.model, {
      prompt: r.prompt,
      video_url: r.videoUrl,
      ...(r.elementUrls.length
        ? {
            elements: r.elementUrls.map((url) => ({
              frontal_image_url: url,
              reference_image_urls: [url],
            })),
          }
        : {}),
      ...(r.imageUrls?.length ? { image_urls: [...r.imageUrls] } : {}),
      // Lyden legges inn som eget, dempet lydspor i programmet (DEC-0085); uten lyd sendt: ingen lyd
      keep_audio: !!r.keepAudio,
    });
  },
  async pollVideo(key: string, model: string, id: string): Promise<VideoPoll> {
    if (!FAL_MODEL.test(model))
      return { state: "failed", message: tk("adapters-ai-providers-server.message.message.16611b15f502") };
    const p = await falPoll(key, model, id);
    if (!p.done) return { state: "running" };
    if ("error" in p)
      return {
        state: "failed",
        message: p.error ?? tk("adapters-ai-providers-server.message.message.0ddf8402a72b.3"),
      };
    const url = (p.result["video"] as { url?: string } | undefined)?.url;
    if (!url)
      return {
        state: "failed",
        message: tk("adapters-ai-providers-server.message.message.9c48c8e488e3"),
      };
    return { state: "done", ...(await download(url)) };
  },
};

// ---------------------------------------------------------------- Runway

const RUNWAY = "https://api.dev.runwayml.com/v1";
const runwayAuth = (key: string) => ({
  Authorization: `Bearer ${key}`,
  "X-Runway-Version": "2024-11-06",
});

const runway = {
  async test(key: string) {
    await call(`${RUNWAY}/organization`, { headers: runwayAuth(key) }, T_TEST);
  },
  async startVideo(r: VideoRequest) {
    if (!r.image)
      throw new ProviderError(
        tk("adapters-ai-providers-server.start-video.message.3f59de44c40f"),
        400,
      );
    const res = await call(
      `${RUNWAY}/image_to_video`,
      {
        method: "POST",
        headers: { ...runwayAuth(r.key), "Content-Type": "application/json" },
        body: JSON.stringify({
          model: r.model,
          promptImage: r.image.url,
          promptText: r.prompt.slice(0, 1000),
          ratio: r.aspect === "16:9" ? "1280:720" : "720:1280",
          duration: r.seconds,
        }),
      },
      T_SUBMIT,
    );
    const j = (await res.json()) as { id?: string };
    if (!j.id)
      throw new ProviderError(
        tk("adapters-ai-providers-server.start-video.message.f60f354802e8.3"),
        502,
      );
    return j.id;
  },
  /** Aleph 2 (DEC-0083): tegner om videoen etter teksten (ingen referansebilder av figurene). */
  async editVideo(r: VideoEditRequest) {
    if (r.model !== "aleph2") throw new ProviderError(tk("adapters-ai-providers-server.edit-video.message.453bff21f388.2"), 400);
    const res = await call(
      `${RUNWAY}/video_to_video`,
      {
        method: "POST",
        headers: { ...runwayAuth(r.key), "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "aleph2",
          videoUri: r.videoUrl,
          promptText: r.prompt.slice(0, 1000),
        }),
      },
      T_SUBMIT,
    );
    const j = (await res.json()) as { id?: string };
    if (!j.id)
      throw new ProviderError(
        tk("adapters-ai-providers-server.edit-video.message.37e81dd816c2"),
        502,
      );
    return j.id;
  },
  async pollVideo(key: string, _model: string, id: string): Promise<VideoPoll> {
    const res = await call(
      `${RUNWAY}/tasks/${encodeURIComponent(id)}`,
      { headers: runwayAuth(key) },
      T_TEST,
    );
    const j = (await res.json()) as {
      status?: string;
      output?: string[];
      failure?: string;
      progress?: number;
    };
    if (j.status === "SUCCEEDED" && j.output?.[0])
      return { state: "done", ...(await download(j.output[0])) };
    if (j.status === "FAILED" || j.status === "CANCELLED")
      return {
        state: "failed",
        message: j.failure ?? tk("adapters-ai-providers-server.message.message.0ddf8402a72b.4"),
      };
    return {
      state: "running",
      ...(typeof j.progress === "number" ? { progress: j.progress } : {}),
    };
  },
};

// ---------------------------------------------------------------- ElevenLabs

const ELEVEN = "https://api.elevenlabs.io/v1";
const elevenAuth = (key: string) => ({ "xi-api-key": key });

const elevenlabs = {
  async test(key: string) {
    await call(`${ELEVEN}/models`, { headers: elevenAuth(key) }, T_TEST);
  },
  async sound(r: {
    key: string;
    model: string;
    prompt: string;
    seconds: number | null;
    loop: boolean;
  }) {
    const res = await call(
      `${ELEVEN}/sound-generation?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: { ...elevenAuth(r.key), "Content-Type": "application/json" },
        body: JSON.stringify({
          text: r.prompt,
          model_id: r.model,
          prompt_influence: 0.3,
          loop: r.loop,
          ...(r.seconds ? { duration_seconds: Math.min(30, Math.max(0.5, r.seconds)) } : {}),
        }),
      },
      T_IMAGE,
    );
    return { bytes: new Uint8Array(await res.arrayBuffer()), mimeType: "audio/mpeg" };
  },
  /**
   * Ord-til-lyd (DEC-0095): manusteksten kobles til tidsrom i lyden. Svar i sekunder med usikkerhet per ord.
   * https://elevenlabs.io/docs/api-reference/forced-alignment/create
   */
  async align(r: { key: string; audio: Blob; fileName: string; text: string }) {
    const form = new FormData();
    form.append("file", r.audio, r.fileName);
    form.append("text", r.text);
    const res = await call(
      `${ELEVEN}/forced-alignment`,
      { method: "POST", headers: elevenAuth(r.key), body: form },
      T_IMAGE,
    );
    const j = (await res.json()) as {
      words?: { text?: unknown; start?: unknown; end?: unknown; loss?: unknown }[];
      loss?: unknown;
    };
    const words = (j.words ?? [])
      .filter(
        (w) =>
          typeof w.text === "string" &&
          typeof w.start === "number" &&
          typeof w.end === "number" &&
          Number.isFinite(w.start) &&
          Number.isFinite(w.end),
      )
      .slice(0, 5000)
      .map((w) => ({
        text: String(w.text).slice(0, 200),
        start: w.start as number,
        end: w.end as number,
        loss: typeof w.loss === "number" && Number.isFinite(w.loss) ? w.loss : null,
      }));
    return {
      words,
      loss: typeof j.loss === "number" && Number.isFinite(j.loss) ? j.loss : null,
    };
  },
  /** Stemmene kontoen har tilgang til (navn og ID), DEC-0071. */
  async voices(
    key: string,
  ): Promise<{ voiceId: string; name: string; description: string; previewUrl: string | null }[]> {
    const res = await call(`${ELEVEN}/voices`, { headers: elevenAuth(key) }, T_TEST);
    const j = (await res.json()) as {
      voices?: {
        voice_id?: string;
        name?: string;
        labels?: Record<string, string>;
        preview_url?: string;
      }[];
    };
    return (j.voices ?? [])
      .filter((v) => typeof v.voice_id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(v.voice_id))
      .map((v) => ({
        voiceId: v.voice_id!,
        name: String(v.name ?? v.voice_id).slice(0, 120),
        description: Object.values(v.labels ?? {})
          .filter((x) => typeof x === "string")
          .join(", ")
          .slice(0, 200),
        // Lydprøve (offentlig lenke hos ElevenLabs) så stemmen kan høres før den velges
        previewUrl:
          typeof v.preview_url === "string" && safeDownloadUrl(v.preview_url)
            ? v.preview_url
            : null,
      }));
  },
  /** DV4: provider's current TTS models and language capabilities. */
  async speechModels(key: string): Promise<import("@/core/dialogue/voice").SpeechModel[]> {
    const res = await call(`${ELEVEN}/models`, { headers: elevenAuth(key) }, T_TEST);
    const rows = await res.json() as { model_id?: string; name?: string; can_do_text_to_speech?: boolean; languages?: { language_id: string; name: string }[]; maximum_text_length_per_request?: number; character_cost_multiplier?: number }[];
    return rows.filter(m => m.can_do_text_to_speech && typeof m.model_id === "string")
      .map(m => ({ modelId: String(m.model_id), name: String(m.name ?? m.model_id).slice(0, 120),
        languages: (m.languages ?? []).filter(l => typeof l.language_id === "string" && typeof l.name === "string").map(l => ({ code: l.language_id, name: l.name })),
        maxCharacters: typeof m.maximum_text_length_per_request === "number" ? m.maximum_text_length_per_request : null,
        costMultiplier: typeof m.character_cost_multiplier === "number" ? m.character_cost_multiplier : null }));
  },
  /** Tale fra tekst med en bestemt stemme (MP3), DEC-0071. */
  async speech(r: {
    key: string;
    model: string;
    voiceId: string;
    text: string;
    language?: string;
    settings?: import("@/core/dialogue/voice").SpeechSettings;
  }) {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(r.voiceId))
      throw new ProviderError(tk("adapters-ai-providers-server.speech.message.e0271e6c8eb0"), 400);
    const res = await call(
      `${ELEVEN}/text-to-speech/${encodeURIComponent(r.voiceId)}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: { ...elevenAuth(r.key), "Content-Type": "application/json" },
        body: JSON.stringify({
          text: r.text,
          model_id: r.model,
          ...(r.settings ? { voice_settings: r.settings } : {}),
          // Uten språk gjetter modellen – og norsk ble lest som dansk
          ...(r.language ? { language_code: r.language } : {}),
        }),
      },
      T_IMAGE,
    );
    return { bytes: await readLimited(res, 50 * 1024 * 1024), mimeType: "audio/mpeg" };
  },
};

// ---------------------------------------------------------------- Felles

// ---------------------------------------------------------------- tekst (T1)

export interface TextMessage {
  readonly role: "user" | "assistant";
  readonly content: string;
}

export interface TextRequest {
  readonly key: string;
  readonly model: string;
  readonly system?: string;
  readonly messages: readonly TextMessage[];
  readonly maxTokens: number;
  readonly temperature?: number;
  /** Svaret skal være ren JSON. */
  readonly json?: boolean;
}

export interface TextResult {
  readonly text: string;
  readonly usage: { readonly inputTokens: number; readonly outputTokens: number };
  readonly model: string;
}

const JSON_INSTRUCTION =
  "Reply with a single valid JSON value only, without code fences or commentary.";

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

function emptyReply(): ProviderError {
  return new ProviderError(
    tk("adapters-ai-providers-server.empty-reply.message.45ba3697587f"),
    502,
  );
}

function refusal(): ProviderError {
  return new ProviderError(
    tk("adapters-ai-providers-server.refusal.message.53311a1dd763"),
    422,
  );
}

/** Kontrollerer JSON-svaret (fjerner eventuelle kodegjerder). */
function checkJson(text: string): string {
  const t = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/, "")
    .trim();
  try {
    JSON.parse(t);
  } catch {
    throw new ProviderError(
      tk("adapters-ai-providers-server.check-json.message.3351ebadc995"),
      502,
    );
  }
  return t;
}

/** Resonneringsmodeller hos OpenAI avviser temperature. */
const OPENAI_REASONING = /^(o\d|gpt-5)/;

/** OpenAI og xAI (samme format): Chat Completions. */
async function openaiCompatText(
  base: string,
  provider: "openai" | "xai",
  r: TextRequest,
): Promise<TextResult> {
  const messages = [
    ...(r.system || r.json
      ? [
          {
            role: "system",
            content: [r.system, r.json ? JSON_INSTRUCTION : ""].filter(Boolean).join("\n\n"),
          },
        ]
      : []),
    ...r.messages.map((m) => ({ role: m.role, content: m.content })),
  ];
  const skipTemp = provider === "openai" && OPENAI_REASONING.test(r.model);
  const body: Record<string, unknown> = {
    model: r.model,
    messages,
    ...(provider === "openai"
      ? { max_completion_tokens: r.maxTokens }
      : { max_tokens: r.maxTokens }),
    ...(r.temperature !== undefined && !skipTemp ? { temperature: r.temperature } : {}),
    ...(r.json ? { response_format: { type: "json_object" } } : {}),
  };
  const res = await call(
    `${base}/chat/completions`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${r.key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    T_TEXT,
  );
  const j = (await res.json()) as {
    model?: string;
    choices?: { message?: { content?: unknown; refusal?: unknown }; finish_reason?: string }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const c = j.choices?.[0];
  if (c?.message?.refusal || c?.finish_reason === "content_filter") throw refusal();
  const content = c?.message?.content;
  const text =
    typeof content === "string"
      ? content
      : Array.isArray(content)
        ? content
            .map((p) =>
              p && typeof p === "object" ? String((p as { text?: unknown }).text ?? "") : "",
            )
            .join("")
        : "";
  if (!text.trim()) throw emptyReply();
  return {
    text: r.json ? checkJson(text) : text,
    usage: {
      inputTokens: num(j.usage?.prompt_tokens),
      outputTokens: num(j.usage?.completion_tokens),
    },
    model: typeof j.model === "string" ? j.model : r.model,
  };
}

async function listIds(url: string, headers: Record<string, string>): Promise<string[]> {
  const res = await call(url, { headers }, T_TEST);
  const j = (await res.json()) as { data?: { id?: unknown }[] };
  return (j.data ?? []).map((m) => m.id).filter((x): x is string => typeof x === "string");
}

const ANTHROPIC = "https://api.anthropic.com/v1";
export const ANTHROPIC_VERSION = "2023-06-01";
const anthropicAuth = (key: string) => ({
  "x-api-key": key,
  "anthropic-version": ANTHROPIC_VERSION,
});

const anthropic = {
  async test(key: string) {
    await call(`${ANTHROPIC}/models?limit=1`, { headers: anthropicAuth(key) }, T_TEST);
  },
  async listTextModels(key: string) {
    return filterTextModels(
      "anthropic",
      await listIds(`${ANTHROPIC}/models?limit=1000`, anthropicAuth(key)),
    );
  },
  async text(r: TextRequest): Promise<TextResult> {
    const system = [r.system, r.json ? JSON_INSTRUCTION : ""].filter(Boolean).join("\n\n");
    const res = await call(
      `${ANTHROPIC}/messages`,
      {
        method: "POST",
        headers: { ...anthropicAuth(r.key), "Content-Type": "application/json" },
        body: JSON.stringify({
          model: r.model,
          max_tokens: r.maxTokens,
          ...(system ? { system } : {}),
          messages: r.messages.map((m) => ({ role: m.role, content: m.content })),
          ...(r.temperature !== undefined ? { temperature: Math.min(1, r.temperature) } : {}),
        }),
      },
      T_TEXT,
    );
    const j = (await res.json()) as {
      model?: string;
      stop_reason?: string;
      content?: { type?: string; text?: string }[];
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    if (j.stop_reason === "refusal") throw refusal();
    const text = (j.content ?? [])
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("");
    if (!text.trim()) throw emptyReply();
    return {
      text: r.json ? checkJson(text) : text,
      usage: { inputTokens: num(j.usage?.input_tokens), outputTokens: num(j.usage?.output_tokens) },
      model: typeof j.model === "string" ? j.model : r.model,
    };
  },
};

const XAI = "https://api.x.ai/v1";
const xai = {
  async test(key: string) {
    await call(`${XAI}/models`, { headers: { Authorization: `Bearer ${key}` } }, T_TEST);
  },
  async listTextModels(key: string) {
    return filterTextModels(
      "xai",
      await listIds(`${XAI}/models`, { Authorization: `Bearer ${key}` }),
    );
  },
  text: (r: TextRequest) => openaiCompatText(XAI, "xai", r),
};

const openaiText = {
  async listTextModels(key: string) {
    return filterTextModels("openai", await listIds(`${OPENAI}/models`, openaiAuth(key)));
  },
  text: (r: TextRequest) => openaiCompatText(OPENAI, "openai", r),
};

const googleText = {
  async listTextModels(key: string) {
    const res = await call(`${GEMINI}/models?pageSize=1000`, { headers: geminiAuth(key) }, T_TEST);
    const j = (await res.json()) as {
      models?: { name?: unknown; supportedGenerationMethods?: unknown }[];
    };
    const ids = (j.models ?? [])
      .filter(
        (m) =>
          Array.isArray(m.supportedGenerationMethods) &&
          m.supportedGenerationMethods.includes("generateContent"),
      )
      .map((m) => (typeof m.name === "string" ? m.name.replace(/^models\//, "") : ""));
    return filterTextModels("google", ids);
  },
  async text(r: TextRequest): Promise<TextResult> {
    if (!/^[A-Za-z0-9._-]+$/.test(r.model))
      throw new ProviderError(tk("adapters-ai-providers-server.text.message.8fcd27b791ff"), 400);
    const system = [r.system, r.json ? JSON_INSTRUCTION : ""].filter(Boolean).join("\n\n");
    const res = await call(
      `${GEMINI}/models/${r.model}:generateContent`,
      {
        method: "POST",
        headers: { ...geminiAuth(r.key), "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
          contents: r.messages.map((m) => ({
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: m.content }],
          })),
          generationConfig: {
            maxOutputTokens: r.maxTokens,
            ...(r.temperature !== undefined ? { temperature: r.temperature } : {}),
            ...(r.json ? { responseMimeType: "application/json" } : {}),
          },
        }),
      },
      T_TEXT,
    );
    const j = (await res.json()) as {
      modelVersion?: string;
      promptFeedback?: { blockReason?: string };
      candidates?: { finishReason?: string; content?: { parts?: { text?: string }[] } }[];
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };
    const c = j.candidates?.[0];
    if (j.promptFeedback?.blockReason || c?.finishReason === "SAFETY") throw refusal();
    const text = (c?.content?.parts ?? []).map((p) => p.text ?? "").join("");
    if (!text.trim()) throw emptyReply();
    return {
      text: r.json ? checkJson(text) : text,
      usage: {
        inputTokens: num(j.usageMetadata?.promptTokenCount),
        outputTokens: num(j.usageMetadata?.candidatesTokenCount),
      },
      model: typeof j.modelVersion === "string" ? j.modelVersion : r.model,
    };
  },
};

/** Tekstadapterne. Strømming kan senere legges til som `streamText(r)` ved siden av `text(r)`. */
export const TEXT_ADAPTERS: Record<
  TextProviderId,
  {
    text(r: TextRequest): Promise<TextResult>;
    listTextModels(key: string): Promise<string[]>;
  }
> = { anthropic, openai: openaiText, google: googleText, xai };

export function generateProviderText(p: TextProviderId, r: TextRequest): Promise<TextResult> {
  return TEXT_ADAPTERS[p].text(r);
}

export const ADAPTERS = { openai, google, fal, runway, elevenlabs, anthropic, xai } as const;

export type KeyedProvider = Exclude<ProviderId, "lovable">;

/**
 * Test nøkkelen. «ok»: tjenesten godtok den. «rejected»: tjenesten avviste den (feil eller slettet nøkkel).
 * «unknown»: kunne ikke avgjøres (nett, tjenesten nede); «limited»: gyldig, men uten kreditt eller begrenset.
 */
export async function testProviderKey(
  provider: KeyedProvider,
  key: string,
): Promise<{ result: "ok" | "rejected" | "limited" | "unknown"; message: string | null }> {
  try {
    await ADAPTERS[provider].test(key);
    return { result: "ok", message: null };
  } catch (e) {
    const status = e instanceof ProviderError ? e.status : 0;
    const text = (e as Error).message ?? "";
    if (
      status === 401 ||
      status === 403 ||
      (status === 400 && /API_KEY_INVALID|API key not valid|invalid api key/i.test(text))
    )
      return {
        result: "rejected",
        message: tk("adapters-ai-providers-server.message.message.8a7a46a947dc"),
      };
    if (status === 402 || status === 429)
      return {
        result: "limited",
        message: tk("adapters-ai-providers-server.message.message.e3a9f0978b39"),
      };
    return {
      result: "unknown",
      message: tk("adapters-ai-providers-server.message.message.e2e4db6d8f9a", { value1: String((e as Error).message.slice(0, 120)) }),
    };
  }
}
