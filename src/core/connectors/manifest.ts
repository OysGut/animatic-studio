/**
 * C-0 Manifest v1 for Creative Connectors: én versjonert JSON-beskrivelse av det et eksternt program
 * (Photoshop, Premiere, Procreate, DAW …) leser eller sender tilbake. Validatoren er ren TypeScript.
 *
 * Regler:
 * - `manifestVersion` er alltid 1 her; nyere hovedversjoner avvises, så en gammel klient aldri tolker feil.
 * - Ukjente felt (også i nestede objekter) bevares uendret ved rundtur: validatoren returnerer kopien av
 *   input og fjerner ingenting.
 * - Hemmeligheter skal aldri inn: felt med navn som ligner token/secret/password/authorization, eller
 *   verdier med kjente tokenprefiks, gjør manifestet ugyldig.
 * - Bildefrekvens er en brøk (num/den), aldri et flyttall; samplingfrekvens er et heltall i Hz.
 */
export const MANIFEST_VERSION = 1 as const;
export const MAX_MANIFEST_BYTES = 4 * 1024 * 1024;
export const MAX_MANIFEST_ITEMS = 20_000;

export interface Rational { readonly num: number; readonly den: number }
export interface ManifestFile {
  readonly path: string;
  readonly sha256: string;
  readonly byteSize: number;
  readonly mimeType: string;
  readonly [extra: string]: unknown;
}
export interface RevisionBase {
  /** Versjonen/revisjonen klienten startet fra. Brukes til konfliktsjekk ved mottak. */
  readonly entity: "asset_version" | "panel" | "clip";
  readonly id: string;
  readonly revision: number;
  readonly [extra: string]: unknown;
}
export interface ManifestItem {
  readonly kind: "project" | "production" | "scene" | "occurrence" | "panel" | "asset" | "version";
  readonly id: string;
  readonly parentId?: string;
  readonly name?: string;
  readonly revision?: number;
  readonly base?: RevisionBase;
  readonly files?: readonly ManifestFile[];
  readonly timecode?: string;
  readonly durationFrames?: number;
  readonly scriptRefs?: readonly string[];
  readonly notes?: readonly string[];
  readonly [extra: string]: unknown;
}
export interface ConnectorManifest {
  readonly manifestVersion: 1;
  readonly createdAt: string;
  readonly projectId: string;
  readonly frameRate: Rational;
  readonly sampleRate: number;
  readonly sourceApp: { readonly name: string; readonly version: string; readonly [extra: string]: unknown };
  readonly adapter: { readonly id: string; readonly version: string; readonly [extra: string]: unknown };
  readonly items: readonly ManifestItem[];
  readonly [extra: string]: unknown;
}

export type ManifestIssue = { readonly path: string; readonly code: "type" | "required" | "range" | "format" | "secret" | "version" | "size" };
export type ManifestResult = { readonly ok: true; readonly manifest: ConnectorManifest } | { readonly ok: false; readonly issues: readonly ManifestIssue[] };

const KINDS = new Set(["project", "production", "scene", "occurrence", "panel", "asset", "version"]);
const ENTITIES = new Set(["asset_version", "panel", "clip"]);
const SECRET_KEY = /(^|_|-)(token|secret|password|passwd|authorization|api[_-]?key|access[_-]?key|refresh|cookie|bearer|code[_-]?verifier)($|_|-)/i;
const SECRET_KEY_CAMEL = /(token|secret|password|authorization|apiKey|accessKey|refreshToken|codeVerifier|cookie)$/;
/** Verdier som ser ut som tokens (app-, leverandør- og JWT-format). */
const SECRET_VALUE = /^(ptgc_|ptgr_|ptgd_|sr_|sk[-_]|sb_secret_|ghp_|xox[abp]-|Bearer\s)|^eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\./;
const SHA = /^[0-9a-f]{64}$/;
const TIMECODE = /^\d{2}:\d{2}:\d{2}[:;]\d{2,3}$/;

export function isSecretKey(key: string): boolean { return SECRET_KEY.test(key) || SECRET_KEY_CAMEL.test(key); }
export function isSecretValue(value: string): boolean { return SECRET_VALUE.test(value); }

/** Finner alle hemmelighetslignende felt/verdier, rekursivt (også i ukjente felt). */
export function findSecrets(value: unknown, path = "$"): string[] {
  if (typeof value === "string") return isSecretValue(value) ? [path] : [];
  if (Array.isArray(value)) return value.flatMap((v, i) => findSecrets(v, `${path}[${i}]`));
  if (value && typeof value === "object") return Object.entries(value).flatMap(([k, v]) => (isSecretKey(k) ? [`${path}.${k}`] : []).concat(findSecrets(v, `${path}.${k}`)));
  return [];
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown, max = 500) => typeof v === "string" && v.length > 0 && v.length <= max;
const int = (v: unknown, min: number, max: number) => typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;

export function isRational(v: unknown): v is Rational {
  return isObj(v) && int(v["num"], 1, 1_000_000) && int(v["den"], 1, 1_000_000);
}

/** Validerer et manifest. Returnerer input uendret (inkl. ukjente felt) når det er gyldig. */
export function validateManifest(input: unknown, byteLength?: number): ManifestResult {
  const issues: ManifestIssue[] = [];
  const add = (path: string, code: ManifestIssue["code"]) => issues.push({ path, code });
  if (byteLength !== undefined && byteLength > MAX_MANIFEST_BYTES) return { ok: false, issues: [{ path: "$", code: "size" }] };
  if (!isObj(input)) return { ok: false, issues: [{ path: "$", code: "type" }] };
  if (input["manifestVersion"] !== MANIFEST_VERSION) add("$.manifestVersion", "version");
  if (!str(input["createdAt"], 40) || !Number.isFinite(Date.parse(String(input["createdAt"])))) add("$.createdAt", "format");
  if (!str(input["projectId"], 64)) add("$.projectId", "required");
  if (!isRational(input["frameRate"])) add("$.frameRate", "type");
  if (!int(input["sampleRate"], 8000, 384000)) add("$.sampleRate", "range");
  for (const k of ["sourceApp", "adapter"] as const) {
    const o = input[k];
    if (!isObj(o)) { add(`$.${k}`, "required"); continue; }
    if (!str(o[k === "adapter" ? "id" : "name"], 100)) add(`$.${k}.${k === "adapter" ? "id" : "name"}`, "required");
    if (!str(o["version"], 50)) add(`$.${k}.version`, "required");
  }
  const items = input["items"];
  if (!Array.isArray(items)) add("$.items", "type");
  else if (items.length > MAX_MANIFEST_ITEMS) add("$.items", "size");
  else items.forEach((it, i) => {
    const p = `$.items[${i}]`;
    if (!isObj(it)) return add(p, "type");
    if (!KINDS.has(String(it["kind"]))) add(`${p}.kind`, "format");
    if (!str(it["id"], 64)) add(`${p}.id`, "required");
    if (it["revision"] !== undefined && !int(it["revision"], 0, 1e9)) add(`${p}.revision`, "range");
    if (it["durationFrames"] !== undefined && !int(it["durationFrames"], 0, 1e9)) add(`${p}.durationFrames`, "range");
    if (it["timecode"] !== undefined && !(typeof it["timecode"] === "string" && TIMECODE.test(it["timecode"]))) add(`${p}.timecode`, "format");
    for (const arr of ["scriptRefs", "notes"] as const) {
      const a = it[arr];
      if (a !== undefined && !(Array.isArray(a) && a.length <= 1000 && a.every(x => typeof x === "string" && x.length <= 10_000))) add(`${p}.${arr}`, "type");
    }
    const base = it["base"];
    if (base !== undefined) {
      if (!isObj(base) || !ENTITIES.has(String(base["entity"])) || !str(base["id"], 64) || !int(base["revision"], 0, 1e9)) add(`${p}.base`, "format");
    }
    const files = it["files"];
    if (files !== undefined) {
      if (!Array.isArray(files) || files.length > 1000) add(`${p}.files`, "type");
      else files.forEach((f, j) => {
        const q = `${p}.files[${j}]`;
        if (!isObj(f)) return add(q, "type");
        if (!str(f["path"], 1000) || String(f["path"]).includes("..") || String(f["path"]).startsWith("/")) add(`${q}.path`, "format");
        if (!(typeof f["sha256"] === "string" && SHA.test(f["sha256"]))) add(`${q}.sha256`, "format");
        if (!int(f["byteSize"], 0, 2 ** 40)) add(`${q}.byteSize`, "range");
        if (!str(f["mimeType"], 100)) add(`${q}.mimeType`, "required");
      });
    }
  });
  for (const s of findSecrets(input)) add(s, "secret");
  return issues.length ? { ok: false, issues } : { ok: true, manifest: input as unknown as ConnectorManifest };
}

/** Serialiserer stabilt (sorterte nøkler), så kontrollsummen av et manifest er deterministisk. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isObj(value)) return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(",")}}`;
  return JSON.stringify(value);
}

/** Rundtur: parse → valider → serialiser. Ukjente felt kommer ut igjen likt. */
export function roundTripManifest(json: string): ManifestResult & { json?: string } {
  let parsed: unknown;
  try { parsed = JSON.parse(json); } catch { return { ok: false, issues: [{ path: "$", code: "format" }] }; }
  const r = validateManifest(parsed, json.length);
  return r.ok ? { ...r, json: JSON.stringify(r.manifest) } : r;
}

/** Tidskode HH:MM:SS:FF fra bilder og brøk-bildefrekvens (ikke-dropframe; avrundet heltalls tidsbase). */
export function framesToTimecode(frames: number, rate: Rational): string {
  const fps = Math.round(rate.num / rate.den) || 1;
  const f = Math.max(0, Math.floor(frames));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(Math.floor(f / (fps * 3600)))}:${p(Math.floor(f / (fps * 60)) % 60)}:${p(Math.floor(f / fps) % 60)}:${p(f % fps)}`;
}
