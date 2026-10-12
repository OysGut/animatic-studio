/**
 * Sikkerhetskopi av et prosjekt (DEC-0049, REQ-0411/0412): et dokumentert, portabelt format.
 *
 * Sikkerhetskopien er én zip-fil med
 * - `animatic-backup.json` – alle prosjektdata som databaserader (samme kolonnenavn som i db/migrations),
 *   manusversjoner, importerte manusfiler, historikk (kommandologg og AI-logg) og en liste over mediefilene;
 * - `filer/<bøtte>/<sti>` – mediefilene (bilder, lyd, importert film og importerte manusfiler), uendret;
 * - `LES-MEG.txt` – formatet forklart for et menneske.
 * Se docs/architecture/BACKUP_FORMAT.md.
 *
 * Gjenoppretting lager alltid et NYTT prosjekt (et eksisterende prosjekt overskrives aldri). Alle ID-er
 * byttes ut deterministisk (samme sikkerhetskopi + samme nye prosjekt gir samme ID-er), så et nytt forsøk
 * etter en feil gir nøyaktig samme resultat. Historikken (kommandologgen) tas med i filen, men
 * gjenopprettes ikke; den gjenopprettede filmen starter med én oppføring «Gjenopprettet fra sikkerhetskopi».
 *
 * Ren TypeScript: brukes både i nettleseren (lage og lese filen) og på serveren (gjenopprette).
 */
import { checkInvariants } from "../invariants";
import {
  emptyProjectState,
  type PosterDocument,
  type ProjectState,
  type StyleGuide,
} from "../model";
import { styleGuideError } from "../generation/style";
import { posterAssetRefs, posterDocumentError } from "../presentation/document";
import { stateFromRows, type ProjectRows, type Row } from "../patch";

export const BACKUP_FORMAT = "animatic-studio-backup";
export const BACKUP_FORMAT_VERSION = 1;
export const BACKUP_JSON = "animatic-backup.json";
export const BACKUP_README = "LES-MEG.txt";
/**
 * Største datadel (prosjektdata uten historikk og mediefiler) som kan gjenopprettes. Serverfunksjonen har
 * begrenset minne; et manus på ~100 sider med full historikk er ~2–3 MB.
 */
export const BACKUP_MAX_JSON_BYTES = 12 * 1024 * 1024;

/** Tabellene med prosjektdata som gjenopprettes (samme rekkefølge som ved lagring). */
export const BACKUP_STATE_TABLES = [
  "productions",
  "scenes",
  "scene_variants",
  "script_blocks",
  "script_block_revisions",
  "scene_occurrences",
  "production_segments",
  "takes",
  "assets",
  "asset_variants",
  "asset_versions",
  "script_annotations",
  "compositions",
  "composition_layers",
  "audio_clips",
  "clip_parts",
  "time_links",
  "generation_prompts",
  "continuity_events",
  "translations",
  "asset_relations",
  "posters",
  "style_profiles",
] as const;
export type BackupStateTable = (typeof BACKUP_STATE_TABLES)[number];

/** Tabeller utenom domenetilstanden som også gjenopprettes. */
export const BACKUP_EXTRA_TABLES = ["script_versions", "imported_documents"] as const;
/** Bare til orientering: tas med i filen, gjenopprettes ikke. */
export const BACKUP_HISTORY_TABLES = ["change_log", "generation_jobs"] as const;

export type BackupBucket = "assets" | "sources";
export type BackupFileCategory = "bilde" | "lyd" | "film" | "manusfil";

export const BACKUP_CATEGORY_LABEL: Record<BackupFileCategory, string> = {
  bilde: "Bilder",
  lyd: "Lyd",
  film: "Importert film",
  manusfil: "Importerte manusfiler",
};

export interface BackupFile {
  readonly bucket: BackupBucket;
  /** Stien i lagringen da sikkerhetskopien ble laget. */
  readonly path: string;
  /** Stien inne i zip-filen (tom når filen ikke er tatt med). */
  readonly zipPath: string;
  readonly byteSize: number;
  readonly mimeType: string;
  readonly category: BackupFileCategory;
  /** false: filen er ikke med i zip-filen (står bare i oversikten over eksterne filer). */
  readonly included: boolean;
}

export interface BackupData {
  readonly format: typeof BACKUP_FORMAT;
  readonly formatVersion: number;
  /** Databaseversjonen (schema_version) da sikkerhetskopien ble laget. */
  readonly schemaVersion: number;
  readonly createdAt: string;
  readonly app: string;
  readonly project: Row;
  readonly tables: Readonly<Record<string, readonly Row[]>>;
  readonly history: Readonly<Record<string, readonly Row[]>>;
  readonly files: readonly BackupFile[];
}

export interface BackupInput {
  readonly rows: ProjectRows;
  readonly scriptVersions: readonly Row[];
  readonly importedDocuments: readonly Row[];
  readonly changeLog: readonly Row[];
  readonly generationJobs: readonly Row[];
  readonly schemaVersion: number;
  readonly createdAt: string;
  /** Kategorier av mediefiler som skal tas med i zip-filen. */
  readonly include: ReadonlySet<BackupFileCategory>;
}

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));

/** Alle mediefilene prosjektet viser til, med kategori. */
export function backupFiles(
  rows: ProjectRows,
  importedDocuments: readonly Row[],
  include: ReadonlySet<BackupFileCategory>,
): BackupFile[] {
  const out: BackupFile[] = [];
  const seen = new Set<string>();
  const add = (
    bucket: BackupBucket,
    path: string,
    byteSize: number,
    mimeType: string,
    category: BackupFileCategory,
  ) => {
    if (!path || seen.has(`${bucket}:${path}`)) return;
    seen.add(`${bucket}:${path}`);
    const included = include.has(category);
    out.push({
      bucket,
      path,
      zipPath: included ? `filer/${bucket}/${path}` : "",
      byteSize: Number.isFinite(byteSize) && byteSize > 0 ? byteSize : 0,
      mimeType,
      category,
      included,
    });
  };
  for (const v of rows.asset_versions ?? []) {
    const mime = s(v["mime_type"]);
    add(
      "assets",
      s(v["media_path"]),
      Number(v["byte_size_big"] ?? v["byte_size"]),
      mime,
      mime.startsWith("audio/") ? "lyd" : "bilde",
    );
  }
  for (const t of rows.takes) {
    const ref = s(t["media_ref"]);
    if (!ref) continue;
    const m = (typeof t["metadata"] === "string" ? JSON.parse(t["metadata"]) : t["metadata"]) as
      Record<string, unknown> | null | undefined;
    add("assets", ref, Number(m?.["byteSize"] ?? 0), s(m?.["mimeType"]) || "video/mp4", "film");
  }
  for (const d of importedDocuments) {
    const format = s(d["format"]);
    add(
      "sources",
      s(d["storage_key"]),
      Number(d["byte_size"]),
      format === "pdf"
        ? "application/pdf"
        : format === "docx"
          ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          : "text/plain",
      "manusfil",
    );
  }
  return out;
}

/** Lager innholdet i animatic-backup.json. */
export function makeBackup(input: BackupInput): BackupData {
  const { rows } = input;
  const tables: Record<string, readonly Row[]> = {};
  for (const t of BACKUP_STATE_TABLES)
    tables[t] = (rows as unknown as Record<string, Row[]>)[t] ?? [];
  tables["script_versions"] = input.scriptVersions;
  tables["imported_documents"] = input.importedDocuments;
  return {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    schemaVersion: input.schemaVersion,
    createdAt: input.createdAt,
    app: "Animatic Studio",
    project: rows.project,
    tables,
    history: { change_log: input.changeLog, generation_jobs: input.generationJobs },
    files: backupFiles(rows, input.importedDocuments, input.include),
  };
}

/** Kontrollerer at JSON-innholdet er en sikkerhetskopi denne versjonen kan lese. Kaster med norsk melding. */
export function parseBackup(raw: unknown, maxSchemaVersion: number): BackupData {
  const b = raw as Partial<BackupData> | null;
  if (!b || typeof b !== "object" || b.format !== BACKUP_FORMAT)
    throw new Error("Filen er ikke en sikkerhetskopi fra Animatic Studio.");
  if (typeof b.formatVersion !== "number" || b.formatVersion > BACKUP_FORMAT_VERSION)
    throw new Error(
      "Sikkerhetskopien er laget med en nyere versjon av Animatic Studio og kan ikke leses her.",
    );
  if (typeof b.schemaVersion !== "number" || b.schemaVersion > maxSchemaVersion)
    throw new Error(
      `Sikkerhetskopien er laget med en nyere database (versjon ${String(b.schemaVersion)}). Oppdater databasen først.`,
    );
  if (!b.project || typeof b.project !== "object" || typeof b.project["id"] !== "string")
    throw new Error("Sikkerhetskopien mangler prosjektet.");
  if (!b.tables || typeof b.tables !== "object") throw new Error("Sikkerhetskopien mangler data.");
  for (const t of [...BACKUP_STATE_TABLES, ...BACKUP_EXTRA_TABLES]) {
    const list = (b.tables as Record<string, unknown>)[t];
    if (list !== undefined && !Array.isArray(list))
      throw new Error(`Sikkerhetskopien er skadet (${t}).`);
  }
  if (!Array.isArray(b.files)) throw new Error("Sikkerhetskopien mangler fillisten.");
  const mains = (b.tables["productions"] ?? []).filter((p) => p["kind"] === "main");
  if (mains.length !== 1) throw new Error("Sikkerhetskopien må ha nøyaktig én hovedfilm.");
  return b as BackupData;
}

/** Kort oppsummering for vinduet. */
export function backupSummary(b: BackupData) {
  const t = (n: string) => b.tables[n] ?? [];
  const occ = t("scene_occurrences");
  const included = b.files.filter((f) => f.included);
  return {
    name: s(b.project["name"]),
    createdAt: b.createdAt,
    scenes: t("scenes").length,
    occurrences: occ.length,
    blocks: t("script_blocks").length,
    versions: t("script_versions").length,
    assets: t("assets").length,
    compositions: t("compositions").length,
    audioClips: t("audio_clips").length,
    films: t("takes").filter((x) => x["media_ref"]).length,
    files: included.length,
    bytes: included.reduce((n, f) => n + f.byteSize, 0),
    missingFiles: b.files.length - included.length,
  };
}

// ---------- Nye ID-er ----------

const UUID_G = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;

function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

/**
 * Ny ID for en gammel: tidsdelen (de første 48 bitene i UUID v7) beholdes, så rekkefølgen etter
 * opprettelsestid er den samme; resten er SHA-256 av nytt prosjekt + gammel ID.
 */
async function derivedId(newProjectId: string, oldId: string): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${newProjectId}:${oldId}`)),
  );
  const bytes = new Uint8Array(16);
  const old = oldId.replace(/-/g, "");
  for (let i = 0; i < 6; i++) bytes[i] = parseInt(old.slice(i * 2, i * 2 + 2), 16);
  bytes.set(digest.subarray(0, 10), 6);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const h = toHex(bytes);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * Tabellen gammel ID → ny ID for alt i sikkerhetskopien. Prosjektet får `newProjectId`, hovedfilmen får
 * hovedfilmen i det nye prosjektet (`mainProductionId`).
 */
export async function backupIdMap(
  b: BackupData,
  newProjectId: string,
  mainProductionId: string,
): Promise<Map<string, string>> {
  const ids = new Set<string>();
  for (const t of [...BACKUP_STATE_TABLES, ...BACKUP_EXTRA_TABLES])
    for (const r of b.tables[t] ?? []) if (typeof r["id"] === "string") ids.add(r["id"]);
  const oldProject = String(b.project["id"]);
  const oldMain = String((b.tables["productions"] ?? []).find((p) => p["kind"] === "main")!["id"]);
  ids.delete(oldProject);
  ids.delete(oldMain);
  const map = new Map<string, string>();
  map.set(oldProject, newProjectId);
  map.set(oldMain, mainProductionId);
  const list = [...ids].filter((x) => /^[0-9a-f-]{36}$/.test(x));
  const fresh = await Promise.all(list.map((x) => derivedId(newProjectId, x)));
  list.forEach((x, i) => map.set(x, fresh[i]!));
  return map;
}

/** Bytter alle kjente ID-er (også inne i tekst, som filstier og øyeblikksbilder). */
export function remapValue<T>(v: T, map: ReadonlyMap<string, string>): T {
  if (typeof v === "string") return v.replace(UUID_G, (m) => map.get(m) ?? m) as T;
  if (Array.isArray(v)) return v.map((x) => remapValue(x, map)) as T;
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    // Også nøkler (f.eks. takes.produced_from: blokk-ID → revisjon)
    for (const [k, x] of Object.entries(v)) out[map.get(k) ?? k] = remapValue(x, map);
    return out as T;
  }
  return v;
}

/** Kolonner med ID-er som ikke er referanser til noe i prosjektet (overskrives eller nulles ved gjenoppretting). */
const NON_REFERENCE = new Set(["project_id", "change_id", "based_on_change_id"]);

/**
 * Alle referanser (kolonner som slutter på `_id`) må peke på noe som er med i sikkerhetskopien. Ellers kunne
 * en laget fil knytte rader i det nye prosjektet til et annet prosjekt (fremmednøklene sjekker ikke
 * prosjektet). Kaster med norsk melding.
 */
export function assertSelfContained(b: BackupData, map: ReadonlyMap<string, string>): void {
  for (const t of [...BACKUP_STATE_TABLES, ...BACKUP_EXTRA_TABLES])
    for (const r of b.tables[t] ?? [])
      for (const [k, v] of Object.entries(r)) {
        if (!k.endsWith("_id") || NON_REFERENCE.has(k) || v === null || v === undefined) continue;
        if (typeof v !== "string" || !map.has(v))
          throw new Error(
            `Sikkerhetskopien viser til noe som ikke er med i den (${t}.${k}) og kan ikke brukes.`,
          );
      }
  // Bildeskifter (DEC-0052) og bilder per språk (DEC-0059) i lag viser til ressurser inne i JSON
  for (const r of b.tables["composition_layers"] ?? [])
    for (const col of ["image_swaps", "language_images"]) {
      const list = (r as Record<string, unknown>)[col];
      if (!Array.isArray(list)) continue;
      for (const w of list as Record<string, unknown>[])
        for (const k of ["assetId", "assetVariantId", "versionId"]) {
          const v = w?.[k];
          if (v === null || v === undefined) continue;
          if (typeof v !== "string" || !map.has(v))
            throw new Error(
              `Sikkerhetskopien viser til noe som ikke er med i den (composition_layers.${col}) og kan ikke brukes.`,
            );
        }
    }
  // Plakater (DEC-0061) viser til ressurser, bilder og relasjoner inne i dokumentet
  for (const r of b.tables["posters"] ?? []) {
    const d = (r as Record<string, unknown>)["document"];
    const doc = (typeof d === "string" ? safeJson(d) : d) as PosterDocument | null;
    if (!doc || typeof doc !== "object" || posterDocumentError(doc))
      throw new Error("Sikkerhetskopien har en ugyldig plakat og kan ikke brukes.");
    const refs = posterAssetRefs(doc);
    for (const set of [refs.assets, refs.variants, refs.versions, refs.relations])
      for (const v of set)
        if (!map.has(v))
          throw new Error(
            "Sikkerhetskopien viser til noe som ikke er med i den (posters.document) og kan ikke brukes.",
          );
  }
  // Forbildebildene i stilprofilene (DEC-0065)
  for (const r of b.tables["style_profiles"] ?? []) {
    const g = (r as Record<string, unknown>)["guide"];
    const guide = (typeof g === "string" ? safeJson(g) : g) as StyleGuide | null;
    if (!guide || typeof guide !== "object" || styleGuideError(guide))
      throw new Error("Sikkerhetskopien har en ugyldig stilprofil og kan ikke brukes.");
    for (const v of guide.referenceVersionIds)
      if (!map.has(v))
        throw new Error(
          "Sikkerhetskopien viser til noe som ikke er med i den (style_profiles.guide) og kan ikke brukes.",
        );
  }
}

function safeJson(t: string): unknown {
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}

// ---------- Gjenoppretting ----------

export interface RestoreFile {
  readonly bucket: BackupBucket;
  readonly zipPath: string;
  /** Ny sti i lagringen (i det nye prosjektets mappe). */
  readonly path: string;
  readonly mimeType: string;
  readonly byteSize: number;
}

/** Filene som skal lastes opp til det nye prosjektet. */
export function restoreFiles(b: BackupData, map: ReadonlyMap<string, string>): RestoreFile[] {
  const pid = map.get(String(b.project["id"]))!;
  return b.files
    .filter((f) => f.included && f.zipPath)
    .map((f) => ({
      bucket: f.bucket,
      zipPath: f.zipPath,
      path: remapValue(f.path, map),
      mimeType: f.mimeType,
      byteSize: f.byteSize,
    }))
    .filter((f) => f.path.startsWith(`${pid}/`));
}

/**
 * Prosjektet slik det blir etter gjenoppretting, bygd oppå det nye, tomme prosjektet `base`.
 * Kaster med norsk melding hvis sikkerhetskopien ikke gir et gyldig prosjekt.
 */
export function restoredState(
  b: BackupData,
  map: ReadonlyMap<string, string>,
  base: ProjectState,
  actorId: string,
): ProjectState {
  const pid = base.project.id;
  if (map.get(String(b.project["id"])) !== pid)
    throw new Error("Feil prosjekt for gjenoppretting.");
  assertSelfContained(b, map);
  const mains = Object.values(base.productions).filter((p) => p.kind === "main");
  if (mains.length !== 1) throw new Error("Det nye prosjektet mangler hovedfilm.");
  const main = mains[0]!;
  const t = (name: string): Row[] =>
    (b.tables[name] ?? []).map((r) => ({ ...remapValue(r, map), project_id: pid }));
  const p = b.project;
  const rows: ProjectRows = {
    project: {
      id: pid,
      revision: base.project.revision,
      name: base.project.name,
      fps_num: p["fps_num"] ?? base.project.fps.num,
      fps_den: p["fps_den"] ?? base.project.fps.den,
      frame_width: p["frame_width"] ?? base.project.frameWidth,
      frame_height: p["frame_height"] ?? base.project.frameHeight,
      default_transition_kind: p["default_transition_kind"] ?? "cut",
      default_transition_frames: p["default_transition_frames"] ?? 0,
      default_transition_overlap: p["default_transition_overlap"] ?? false,
      ai_month_limit: p["ai_month_limit"] ?? null,
      ai_price_per_image: p["ai_price_per_image"] ?? null,
    },
    productions: t("productions"),
    scenes: t("scenes"),
    scene_variants: t("scene_variants"),
    script_blocks: t("script_blocks"),
    script_block_revisions: t("script_block_revisions"),
    scene_occurrences: t("scene_occurrences"),
    production_segments: t("production_segments"),
    takes: t("takes"),
    assets: t("assets"),
    asset_variants: t("asset_variants"),
    asset_versions: t("asset_versions"),
    script_annotations: t("script_annotations"),
    compositions: t("compositions"),
    composition_layers: t("composition_layers"),
    audio_clips: t("audio_clips"),
    clip_parts: t("clip_parts"),
    time_links: t("time_links"),
    generation_prompts: t("generation_prompts"),
    continuity_events: t("continuity_events"),
    translations: t("translations"),
    asset_relations: t("asset_relations"),
    posters: t("posters"),
    style_profiles: t("style_profiles"),
  };
  let state: ProjectState;
  try {
    state = stateFromRows(rows);
  } catch (e) {
    throw new Error(`Sikkerhetskopien er skadet: ${(e as Error).message}`);
  }
  // Hovedfilmen finnes allerede i det nye prosjektet: den oppdateres (revisjonen økes med én)
  const restoredMain = state.productions[main.id];
  if (!restoredMain) throw new Error("Sikkerhetskopien mangler hovedfilmen.");
  const project =
    state.project.fps.num === base.project.fps.num &&
    state.project.fps.den === base.project.fps.den &&
    state.project.frameWidth === base.project.frameWidth &&
    state.project.frameHeight === base.project.frameHeight &&
    JSON.stringify(state.project.defaultTransition ?? null) ===
      JSON.stringify(base.project.defaultTransition ?? null) &&
    state.project.aiMonthLimit === base.project.aiMonthLimit &&
    state.project.aiPricePerImage === base.project.aiPricePerImage
      ? base.project
      : { ...state.project, revision: base.project.revision + 1 };
  state = {
    ...state,
    project,
    productions: {
      ...state.productions,
      [main.id]: { ...restoredMain, revision: main.revision + 1 },
    },
    // Teksthistorikken lagres i den gjenopprettende brukerens navn (tidspunktene beholdes)
    blockRevisions: state.blockRevisions.map((r) => ({ ...r, author: actorId as never })),
  };
  // Alle filstier må ligge i det nye prosjektets mappe
  const foreign = [
    ...Object.values(state.takes).map((x) => x.mediaRef),
    ...Object.values(state.assetVersions).map((x) => x.mediaPath),
  ].filter((x): x is string => typeof x === "string" && x !== "" && !x.startsWith(`${pid}/`));
  if (foreign.length > 0)
    throw new Error("Sikkerhetskopien viser til filer utenfor prosjektet og kan ikke brukes.");
  const violations = checkInvariants(state);
  if (violations.length > 0)
    throw new Error(
      `Sikkerhetskopien gir et ugyldig prosjekt (${violations
        .slice(0, 3)
        .map((v) => v.message)
        .join("; ")}).`,
    );
  return state;
}

/**
 * Manusversjoner og importerte manusfiler for det nye prosjektet (rader klare til innsetting).
 * Manusversjonene er sortert slik at en versjon alltid kommer etter versjonen den bygger på.
 */
export function restoredExtras(
  b: BackupData,
  map: ReadonlyMap<string, string>,
  actorId: string,
): { scriptVersions: Row[]; importedDocuments: Row[] } {
  const pid = map.get(String(b.project["id"]))!;
  assertSelfContained(b, map);
  const versions = (b.tables["script_versions"] ?? [])
    .map((r) => remapValue(r, map))
    .map((r) => ({
      id: r["id"],
      project_id: pid,
      production_id: r["production_id"],
      number: r["number"],
      name: r["name"],
      note: r["note"] ?? null,
      parent_version_id: r["parent_version_id"] ?? null,
      based_on_change_id: null,
      snapshot: r["snapshot"],
      created_at: r["created_at"],
      created_by: actorId,
    }))
    .sort((x, y) => Number(x["number"]) - Number(y["number"]));
  const docs = (b.tables["imported_documents"] ?? [])
    .map((r) => remapValue(r, map))
    .map((r) => ({
      id: r["id"],
      project_id: pid,
      production_id: r["production_id"],
      storage_key: r["storage_key"],
      file_name: r["file_name"],
      sha256: r["sha256"],
      format: r["format"],
      page_count: r["page_count"] ?? null,
      byte_size: r["byte_size"],
      language: r["language"] ?? "nb",
      change_id: null,
      created_at: r["created_at"],
      created_by: actorId,
    }))
    .filter((r) => String(r["storage_key"]).startsWith(`${pid}/`));
  return { scriptVersions: versions, importedDocuments: docs };
}

/** Teksten i LES-MEG.txt. */
export function backupReadme(b: BackupData): string {
  const sum = backupSummary(b);
  const out = b.files.filter((f) => !f.included);
  return [
    `Sikkerhetskopi av «${sum.name}» fra Animatic Studio`,
    `Laget ${b.createdAt} (formatversjon ${b.formatVersion}, databaseversjon ${b.schemaVersion}).`,
    "",
    "Innhold:",
    `- ${BACKUP_JSON}: alle prosjektdata som tabeller (samme kolonner som databasen):`,
    "  manus (scener, varianter, blokker med teksthistorikk), produksjoner og spinoffer,",
    "  sceneforekomster, ressursbibliotek, notater, 2D-scener med lag og kamera, lydklipp,",
    "  importert film med deler og tidskoblinger, manusversjoner og importerte manusfiler.",
    "  «history» inneholder kommandologgen og loggen over AI-generering (bare til orientering).",
    "  «files» er en liste over alle mediefilene, også de som ikke er tatt med.",
    "- filer/<bøtte>/<sti>: mediefilene, uendret.",
    "",
    "Gjenopprett: Prosjekter → «Gjenopprett fra sikkerhetskopi …». Det lages alltid et nytt prosjekt;",
    "ingenting eksisterende overskrives.",
    "",
    `Scener: ${sum.scenes}. Manusblokker: ${sum.blocks}. Manusversjoner: ${sum.versions}.`,
    `Ressurser: ${sum.assets}. 2D-scener: ${sum.compositions}. Lydklipp: ${sum.audioClips}.`,
    `Mediefiler med: ${sum.files}.`,
    ...(out.length
      ? [
          "",
          `Disse ${out.length} filene er IKKE med (de ligger fortsatt i prosjektet):`,
          ...out.map((f) => `- ${BACKUP_CATEGORY_LABEL[f.category]}: ${f.path}`),
        ]
      : []),
    "",
  ].join("\n");
}

/** Stabil fingeravtrykk-tekst for dataene (samme sikkerhetskopi gir samme tekst). */
export function backupDataKey(b: BackupData): string {
  return JSON.stringify({ project: b.project, tables: b.tables, createdAt: b.createdAt });
}

/**
 * Kontroll av en sikkerhetskopi uten database: gjenoppretter den til et tenkt, tomt prosjekt. Brukes før
 * gjenoppretting (så feil oppdages før noe lastes opp) og når sikkerhetskopien lages. Kaster med norsk melding.
 */
export async function validateBackup(b: BackupData): Promise<void> {
  const pid = "01900000-0000-7000-8000-0000000000a1";
  const main = "01900000-0000-7000-8000-0000000000a2";
  const fps = { num: Number(b.project["fps_num"] ?? 25), den: Number(b.project["fps_den"] ?? 1) };
  const base: ProjectState = {
    ...emptyProjectState({
      id: pid as never,
      revision: 1,
      name: "Kontroll",
      fps,
      frameWidth: 1920,
      frameHeight: 1080,
      primaryLanguage: "nb",
    }),
    productions: {
      [main]: {
        id: main as never,
        revision: 1,
        kind: "main",
        name: "Hovedfilm",
        parentProductionId: null,
        fps,
      },
    },
  };
  const map = await backupIdMap(b, pid, main);
  restoredState(b, map, base, "01900000-0000-7000-8000-0000000000a3");
  restoredExtras(b, map, "01900000-0000-7000-8000-0000000000a3");
}
