/**
 * Adaptere for AI-leverandørene brukerne kobler til med egne nøkler (DEC-0069, REQ-0269 leverandøruavhengig
 * arkitektur). BARE PÅ SERVEREN – importeres dynamisk i serverfunksjonene. Nøkkelen kommer dekryptert fra
 * key-vault.server.ts, brukes i ett kall og logges aldri.
 *
 * Hver leverandør kan: teste nøkkelen, lage bilde, starte og følge en videojobb, og lage lyd – det den
 * støtter (se katalogen i src/core/generation/providers.ts). Formatene følger leverandørenes egne
 * dokumentasjon (oktober 2026) og er ikke prøvd mot de ekte tjenestene herfra (KI-153).
 */
import type { ProviderId } from "@/core";

const T_TEST = 20_000;
const T_IMAGE = 150_000;
const T_SUBMIT = 60_000;
const T_DOWNLOAD = 120_000;
/** Største video vi henter inn (lagringsgrensen og minnet i serverfunksjonen). */
export const MAX_VIDEO_BYTES = 300 * 1024 * 1024;

export interface ImageRequest {
  readonly key: string;
  readonly model: string;
  readonly prompt: string;
  readonly references: readonly Blob[];
  readonly purpose: "cutout" | "background";
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

function b64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
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
  if (len > max) throw new ProviderError("Filen er for stor til å hentes inn.", 413);
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
      throw new ProviderError("Filen er for stor til å hentes inn.", 413);
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
  if (!first) throw new ProviderError("Uventet adresse til filen.", 400);
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
      if (!next) throw new ProviderError("Uventet videresending av filen.", 400);
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
    const size = r.purpose === "cutout" ? "1024x1536" : "1536x1024";
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
    if (!img) throw new ProviderError("Tjenesten svarte uten bilde.", 502);
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
    if (!j.id) throw new ProviderError("Tjenesten svarte uten jobb-ID.", 502);
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
      return { state: "failed", message: j.error?.message ?? "Videoen kunne ikke lages." };
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
    const aspect = r.purpose === "cutout" ? "2:3" : "3:2";
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
            response_format: { type: "image", aspect_ratio: aspect },
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
              imageConfig: { aspectRatio: aspect },
            },
          }),
        },
        T_IMAGE,
      );
    }
    const img = findBase64Image(await res.json());
    if (!img) throw new ProviderError("Tjenesten svarte uten bilde.", 502);
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
    if (!j.name) throw new ProviderError("Tjenesten svarte uten jobb-ID.", 502);
    return j.name;
  },
  async pollVideo(key: string, _model: string, name: string): Promise<VideoPoll> {
    // Operasjonsnavnet kommer fra Google; bare den kjente formen godtas (ingen vilkårlige adresser)
    if (!/^models\/[\w.-]+\/operations\/[\w.-]+$/.test(name))
      return { state: "failed", message: "Ugyldig jobb-ID." };
    const res = await call(`${GEMINI}/${name}`, { headers: geminiAuth(key) }, T_TEST);
    const j = (await res.json()) as {
      done?: boolean;
      error?: { message?: string };
      response?: { generateVideoResponse?: { generatedSamples?: { video?: { uri?: string } }[] } };
    };
    if (!j.done) return { state: "running" };
    if (j.error)
      return { state: "failed", message: j.error.message ?? "Videoen kunne ikke lages." };
    const uri = j.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
    if (!uri)
      return {
        state: "failed",
        message: "Videoen ble stoppet (innholdsregler eller ukjent feil).",
      };
    if (!uri.startsWith("https://generativelanguage.googleapis.com/"))
      return { state: "failed", message: "Uventet adresse til videoen." };
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
  if (!j.request_id) throw new ProviderError("Tjenesten svarte uten jobb-ID.", 502);
  return j.request_id;
}

async function falPoll(key: string, model: string, id: string) {
  const base = `${FAL_QUEUE}/${model}/requests/${encodeURIComponent(id)}`;
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
    // Med forbilde: Kontext (redigering); uten: tekst til bilde
    const model = r.referenceUrls.length ? r.model : `${r.model}/text-to-image`;
    if (!FAL_MODEL.test(model)) throw new ProviderError("Ukjent modell.", 400);
    const id = await falRun(r.key, model, {
      prompt: r.prompt,
      ...(r.referenceUrls.length ? { image_url: r.referenceUrls[0] } : {}),
      aspect_ratio: r.purpose === "cutout" ? "2:3" : "3:2",
      num_images: 1,
      output_format: "png",
    });
    const deadline = Date.now() + T_IMAGE;
    while (Date.now() < deadline) {
      await new Promise((ok) => setTimeout(ok, 2500));
      const p = await falPoll(r.key, model, id);
      if (!p.done) continue;
      if ("error" in p) throw new ProviderError(p.error ?? "Bildet kunne ikke lages.", 502);
      const url = (p.result["images"] as { url?: string }[] | undefined)?.[0]?.url;
      if (!url) throw new ProviderError("Tjenesten svarte uten bilde.", 502);
      const d = await download(url);
      return {
        bytes: d.bytes,
        mimeType: d.mimeType.startsWith("image/") ? d.mimeType : "image/png",
      };
    }
    throw new ProviderError("Bildet ble ikke ferdig i tide.", 504);
  },
  async startVideo(r: VideoRequest) {
    if (!FAL_MODEL.test(r.model)) throw new ProviderError("Ukjent modell.", 400);
    if (!r.image) throw new ProviderError("Denne modellen trenger et startbilde.", 400);
    return falRun(r.key, r.model, {
      prompt: r.prompt,
      start_image_url: r.image.url,
      duration: String(r.seconds),
      generate_audio: false,
    });
  },
  async pollVideo(key: string, model: string, id: string): Promise<VideoPoll> {
    if (!FAL_MODEL.test(model)) return { state: "failed", message: "Ukjent modell." };
    const p = await falPoll(key, model, id);
    if (!p.done) return { state: "running" };
    if ("error" in p) return { state: "failed", message: p.error ?? "Videoen kunne ikke lages." };
    const url = (p.result["video"] as { url?: string } | undefined)?.url;
    if (!url) return { state: "failed", message: "Tjenesten svarte uten video." };
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
    if (!r.image) throw new ProviderError("Runway trenger et startbilde.", 400);
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
    if (!j.id) throw new ProviderError("Tjenesten svarte uten jobb-ID.", 502);
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
      return { state: "failed", message: j.failure ?? "Videoen kunne ikke lages." };
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
  /** Stemmene kontoen har tilgang til (navn og ID), DEC-0071. */
  async voices(key: string): Promise<{ voiceId: string; name: string; description: string }[]> {
    const res = await call(`${ELEVEN}/voices`, { headers: elevenAuth(key) }, T_TEST);
    const j = (await res.json()) as {
      voices?: { voice_id?: string; name?: string; labels?: Record<string, string> }[];
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
      }));
  },
  /** Tale fra tekst med en bestemt stemme (MP3), DEC-0071. */
  async speech(r: { key: string; model: string; voiceId: string; text: string }) {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(r.voiceId)) throw new ProviderError("Ugyldig stemme.", 400);
    const res = await call(
      `${ELEVEN}/text-to-speech/${encodeURIComponent(r.voiceId)}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: { ...elevenAuth(r.key), "Content-Type": "application/json" },
        body: JSON.stringify({ text: r.text, model_id: r.model }),
      },
      T_IMAGE,
    );
    return { bytes: await readLimited(res, 50 * 1024 * 1024), mimeType: "audio/mpeg" };
  },
};

// ---------------------------------------------------------------- Felles

export const ADAPTERS = { openai, google, fal, runway, elevenlabs } as const;

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
      return { result: "rejected", message: "Tjenesten godtok ikke nøkkelen." };
    if (status === 402 || status === 429)
      return {
        result: "limited",
        message: "Nøkkelen er gyldig, men kontoen mangler kreditt eller er midlertidig begrenset.",
      };
    return {
      result: "unknown",
      message: `Nøkkelen kunne ikke prøves akkurat nå (${(e as Error).message.slice(0, 120)}).`,
    };
  }
}
