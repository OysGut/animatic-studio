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
import { sameOptionalDurationAssumptions } from "../screenplay/duration";
import { t as tk, tLocalized } from "@/core/i18n/keyed";

export const BACKUP_FORMAT = "animatic-studio-backup";
export const BACKUP_FORMAT_VERSION = 1;
export const BACKUP_JSON = "animatic-backup.json";
export const BACKUP_README = "LES-MEG.txt";
/** Produktnavnet i nye sikkerhetskopier (B-104). Eldre kopier har «Animatic Studio» og leses like godt. */
export const BACKUP_APP_NAME = "From Pen to Glass";
export const BACKUP_APP_NAMES: readonly string[] = [BACKUP_APP_NAME, "Animatic Studio"];
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
  "story_profiles",
  "story_profile_stages",
  "story_facts",
  "story_canvas_nodes",
  "story_canvas_edges",
  "template_instances",
  "credit_participants",
  "credit_sequences",
  "animation_rigs", "animation_rig_versions", "animation_uses",
  "lipsync_results", "animation_patterns",
  "dialogue_versions",
  "dialogue_reviews",
  "note_flags",
  "quality_profiles",
  "translation_lines",
  "translation_line_links",
  "style_harmonizations",
  "style_preferred_references",
  "language_versions",
  "measure_sets",
  "rig_templates",
  "rig_setups",
] as const;
export type BackupStateTable = (typeof BACKUP_STATE_TABLES)[number];

/** Tabeller utenom domenetilstanden som også gjenopprettes. */
export const BACKUP_EXTRA_TABLES = ["script_versions", "imported_documents"] as const;
/** Bare til orientering: tas med i filen, gjenopprettes ikke. */
export const BACKUP_HISTORY_TABLES = ["change_log", "generation_jobs"] as const;

export type BackupBucket = "assets" | "sources";
export type BackupFileCategory = "bilde" | "lyd" | "film" | "manusfil";

export const BACKUP_CATEGORY_LABEL: Record<BackupFileCategory, string> = tLocalized({ bilde: "core-backup-index.backup-category-label.bilde.cfc8c57d9977", lyd: "core-backup-index.backup-category-label.lyd.effe8c1543ae", film: "core-backup-index.backup-category-label.film.d4953b381f91", manusfil: "core-backup-index.backup-category-label.manusfil.4767ebdbf51c" });

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
      // i18n-ignore: stier i zip-filen (formatet), ikke tekst for brukeren
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
      // i18n-ignore: kategorinøkkel
      mime.startsWith("audio/") ? "lyd" : "bilde",
    );
    // B-105a: de avledede filene (arbeidskopi, proxy, miniatyr, rå TIFF) følger med i kopien
    const derived = v["derived_files"];
    if (derived && typeof derived === "object")
      for (const d of Object.values(derived as Record<string, Record<string, unknown> | null>)) {
        if (!d || typeof d !== "object") continue;
        const path = s(d["path"]);
        const dmime = path.endsWith(".webp")
          ? "image/webp"
          : /\.tiff?$/i.test(path)
            ? "image/tiff"
            : mime;
        add("assets", path, Number(d["byteSize"] ?? d["byte_size"] ?? 0), dmime, "bilde");
      }
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
  // The approval receipt belongs to the upload workflow, not to restored project data.
  tables["animation_rig_versions"] = (tables["animation_rig_versions"] ?? []).map(withoutRigImportReceipts);
  tables["translation_line_links"] = (tables["translation_line_links"] ?? []).filter(r => r["origin"] === "approved" || r["origin"] === "manual");
  tables["script_versions"] = input.scriptVersions;
  tables["imported_documents"] = input.importedDocuments;
  return {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    schemaVersion: input.schemaVersion,
    createdAt: input.createdAt,
    app: BACKUP_APP_NAME,
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
    throw new Error(
      tk("core-backup-index.parse-backup.message.9e11241c0bca"),
    );
  if (typeof b.formatVersion !== "number" || b.formatVersion > BACKUP_FORMAT_VERSION)
    throw new Error(
      tk("core-backup-index.parse-backup.message.bc940e902884"),
    );
  if (typeof b.schemaVersion !== "number" || b.schemaVersion > maxSchemaVersion)
    throw new Error(
      tk("core-backup-index.parse-backup.message.c74afc7e8489", { value1: String(String(b.schemaVersion)) }),
    );
  if (!b.project || typeof b.project !== "object" || typeof b.project["id"] !== "string")
    throw new Error(
      tk("core-backup-index.parse-backup.message.3da8211ffa03"),
    );
  if (!b.tables || typeof b.tables !== "object")
    throw new Error(tk("core-backup-index.parse-backup.message.970e50bda852"));
  for (const t of [...BACKUP_STATE_TABLES, ...BACKUP_EXTRA_TABLES]) {
    const list = (b.tables as Record<string, unknown>)[t];
    if (list !== undefined && !Array.isArray(list))
      throw new Error(tk("core-backup-index.parse-backup.message.1da046813368", { t: String(t) }));
  }
  if (!Array.isArray(b.files))
    throw new Error(
      tk("core-backup-index.parse-backup.message.6037216b6002"),
    );
  const mains = (b.tables["productions"] ?? []).filter((p) => p["kind"] === "main");
  if (mains.length !== 1)
    throw new Error(
      tk("core-backup-index.parse-backup.message.39b03ff14504"),
    );
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
function withoutRigImportReceipts(row: Row): Row {
  const spec = row["spec"] as { parts?: Record<string, Record<string, unknown>> } | undefined;
  if (!spec?.parts) return row;
  return { ...row, spec: { ...spec, parts: Object.fromEntries(Object.entries(spec.parts).map(([slot, p]) => {
    const { mobileImportId: _receipt, ...part } = p;
    return [slot, part];
  })) } };
}

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

/**
 * Kolonner med ID-er som ikke er referanser til noe i prosjektet (overskrives eller nulles ved gjenoppretting).
 * task_id (DEC-0088) samler systemmerknadene og planene for én oppgave; den beholdes som den er.
 */
const NON_REFERENCE = new Set([
  "project_id",
  "change_id",
  "based_on_change_id",
  "task_id",
  // Koblingen til det globale biblioteket (GP2) er bare metadata; filene er prosjektets egne kopier, så
  // gjenopprettingen virker uten tilgang til arbeidsgruppen. ID-ene beholdes som de er.
  "source_global_asset_id",
  "source_global_variant_id",
  "source_global_version_id",
  // Lydversjoner (DV2): leverandørens stemme- og modell-ID er ikke prosjektrader
  "voice_id",
  "model_id",
]);

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
            tk("core-backup-index.assert-self-contained.message.72bee2145230", { t: String(t), k: String(k) }),
          );
      }
  for (const r of b.tables["translation_line_links"] ?? [])
    for (const key of ["source_block_ids","target_translation_ids"]) {
      const ids=r[key];
      if (!Array.isArray(ids) || ids.some(id=>typeof id !== "string" || !map.has(id)))
        throw new Error(tk("core-backup-index.assert-self-contained.message.23f1008b1e80"));
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
              tk("core-backup-index.assert-self-contained.message.d0a638c27cb4", { col: String(col) }),
            );
        }
    }
  // Plakater (DEC-0061) viser til ressurser, bilder og relasjoner inne i dokumentet
  for (const r of b.tables["posters"] ?? []) {
    const d = (r as Record<string, unknown>)["document"];
    const doc = (typeof d === "string" ? safeJson(d) : d) as PosterDocument | null;
    if (!doc || typeof doc !== "object" || posterDocumentError(doc))
      throw new Error(
        tk("core-backup-index.assert-self-contained.message.7522d88cabde"),
      );
    const refs = posterAssetRefs(doc);
    for (const set of [refs.assets, refs.variants, refs.versions, refs.relations])
      for (const v of set)
        if (!map.has(v))
          throw new Error(
            tk("core-backup-index.assert-self-contained.message.d883eea976d1"),
          );
  }
  // Forbildebildene i stilprofilene (DEC-0065)
  for (const r of b.tables["style_profiles"] ?? []) {
    const g = (r as Record<string, unknown>)["guide"];
    const guide = (typeof g === "string" ? safeJson(g) : g) as StyleGuide | null;
    if (!guide || typeof guide !== "object" || styleGuideError(guide))
      throw new Error(
        tk("core-backup-index.assert-self-contained.message.cbc9438c182e"),
      );
    for (const v of guide.referenceVersionIds)
      if (!map.has(v))
        throw new Error(
          tk("core-backup-index.assert-self-contained.message.532a1d4f3e40"),
        );
  }
  for (const row of b.tables["animation_rig_versions"] ?? []) {
    const spec = row["spec"] as { parts?: Record<string, { versionId?: unknown }> } | undefined;
    for (const part of Object.values(spec?.parts ?? {}))
      if (part.versionId != null && (typeof part.versionId !== "string" || !map.has(part.versionId)))
        throw new Error(tk("core-backup-index.assert-self-contained.message.10564ecb780b"));
  }
  assertStoryLabRefs(b, map);
}

/** Story Lab (SL1): hvem som vet (story_facts.known_by) og hva karakteren tror om andre (profilen). */
function assertStoryLabRefs(b: BackupData, map: ReadonlyMap<string, string>): void {
  const bad = (col: string) =>
    new Error(
      tk("core-backup-index.bad.message.24989a3ae78a", { col: String(col) }),
    );
  const ref = (v: unknown, col: string, nullable: boolean) => {
    if ((v === null || v === undefined) && nullable) return;
    if (typeof v !== "string" || !map.has(v)) throw bad(col);
  };
  for (const r of b.tables["story_facts"] ?? []) {
    const k = (r as Record<string, unknown>)["known_by"];
    const list = typeof k === "string" ? safeJson(k) : k;
    if (!Array.isArray(list)) throw bad("story_facts.known_by");
    for (const w of list as Record<string, unknown>[]) {
      ref(w?.["assetId"], "story_facts.known_by", false);
      ref(w?.["fromSceneId"], "story_facts.known_by", true);
    }
  }
  for (const r of b.tables["story_profiles"] ?? []) {
    const p = (r as Record<string, unknown>)["profile"];
    const prof = (typeof p === "string" ? safeJson(p) : p) as {
      dramatic?: { beliefsAboutOthers?: { assetId?: unknown }[] };
    } | null;
    for (const x of prof?.dramatic?.beliefsAboutOthers ?? [])
      ref(x?.assetId, "story_profiles.profile", false);
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
    throw new Error(tk("core-backup-index.restored-state.message.1874fc82dc1b"));
  assertSelfContained(b, map);
  const mains = Object.values(base.productions).filter((p) => p.kind === "main");
  if (mains.length !== 1)
    throw new Error(
      tk("core-backup-index.restored-state.message.24af47f88679"),
    );
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
      // Antakelsene for varighetsestimat (migrasjon 0028, KI-28) følger med sikkerhetskopien
      duration_assumptions: p["duration_assumptions"] ?? null,
      // Aktiv kvalitetsprofil (M8, migrasjon 0063) følger med; ID-en omskrives til den nye profilen
      active_quality_profile_id: remapValue(p["active_quality_profile_id"] ?? null, map),
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
    story_profiles: t("story_profiles"),
    story_profile_stages: t("story_profile_stages"),
    story_facts: t("story_facts"),
    story_canvas_nodes: t("story_canvas_nodes"),
    story_canvas_edges: t("story_canvas_edges"),
    template_instances: t("template_instances"),
    credit_participants: t("credit_participants"),
    credit_sequences: t("credit_sequences"),
    animation_rigs: t("animation_rigs"), animation_rig_versions: t("animation_rig_versions").map(withoutRigImportReceipts), animation_uses: t("animation_uses"),
    lipsync_results: t("lipsync_results"), animation_patterns: t("animation_patterns"),
    dialogue_versions: t("dialogue_versions"),
    dialogue_reviews: t("dialogue_reviews"),
    note_flags: t("note_flags"),
    quality_profiles: t("quality_profiles"),
    translation_line_links: t("translation_line_links"),
    translation_lines: t("translation_lines"),
    style_harmonizations: t("style_harmonizations"),
    style_preferred_references: t("style_preferred_references"),
    language_versions: t("language_versions"),
    measure_sets: t("measure_sets"),
    rig_templates: t("rig_templates"),
    rig_setups: t("rig_setups"),
  };
  let state: ProjectState;
  try {
    state = stateFromRows(rows);
  } catch (e) {
    throw new Error(
      tk("core-backup-index.restored-state.message.b1f60ae5b347", { message: String((e as Error).message) }),
    );
  }
  // Hovedfilmen finnes allerede i det nye prosjektet: den oppdateres (revisjonen økes med én)
  const restoredMain = state.productions[main.id];
  if (!restoredMain)
    throw new Error(
      tk("core-backup-index.restored-state.message.556acedd8924"),
    );
  const project =
    state.project.fps.num === base.project.fps.num &&
    state.project.fps.den === base.project.fps.den &&
    state.project.frameWidth === base.project.frameWidth &&
    state.project.frameHeight === base.project.frameHeight &&
    JSON.stringify(state.project.defaultTransition ?? null) ===
      JSON.stringify(base.project.defaultTransition ?? null) &&
    state.project.aiMonthLimit === base.project.aiMonthLimit &&
    state.project.aiPricePerImage === base.project.aiPricePerImage &&
    sameOptionalDurationAssumptions(
      state.project.durationAssumptions,
      base.project.durationAssumptions,
    )
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
    ...Object.values(state.assetVersions).flatMap((x) => [
      x.mediaPath,
      // B-105a: også stiene til de avledede filene må ligge i det nye prosjektets mappe
      ...Object.values(x.derivedFiles ?? {}).map((d) => d?.path),
    ]),
  ].filter((x): x is string => typeof x === "string" && x !== "" && !x.startsWith(`${pid}/`));
  if (foreign.length > 0)
    throw new Error(
      tk("core-backup-index.restored-state.message.fb87ab6b71ef"),
    );
  const violations = checkInvariants(state);
  if (violations.length > 0) {
    const detail = violations
      .slice(0, 3)
      .map((v) => v.message)
      .join("; ");
    throw new Error(
      tk("core-backup-index.restored-state.message.745a06cf0ee3", { detail: String(detail) }),
    );
  }
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
    tk("core-backup-index.backup-readme.l-sikkerhetskopi-av-sum-name-fra-animatic-studio-backup-of-sum-name-from-animatic-studio-l-laget-b-created-at-formatversjon-b-format-version-databaseversjon-b-schema-version-made-b-created-at-format-version-b-format-version-database-version-b-schema-version-l-innhold-contents-l-backup-json-alle-prosjektdata-som-tabeller-samme-kolonner-som-databasen-backup-json-all-project-data-as-tables-the-same-columns-as-the-database-l-manus-scener-varianter-blokker-med-teksthistorikk-produksjoner-og-spinoffer-script-scenes-variants-blocks-with-text-history-productions-and-spin-offs-l-sceneforekomster-ressursbibliotek-notater-2d-scener-med-lag-og-kamera-lydklipp-scene-occurrences-asset-library-notes-2d-scenes-with-layers-and-camera-audio-clips-l-importert-film-med-deler-og-tidskoblinger-manusversjoner-og-importerte-manusfiler-imported-film-with-parts-and-time-links-script-versions-and-imported-script-files-l-history-inneholder-kommandologgen-og-loggen-over-ai-generering-bare-til-orientering-history-contains-the-command-log-and-the-ai-generation-log-for-information-only-l-files-er-en-liste-over-alle-mediefilene-ogs-de-som-ikke-er-tatt-med-files-is-a-list-of-all-the-media-files-including-those-not-included-l-filer-b-tte-sti-mediefilene-uendret-filer-b-tte-sti-the-media-files-unchanged-l-gjenopprett-prosjekter-gjenopprett-fra-sikkerhetskopi-det-lages-alltid-et-nytt-prosjekt-restore-projects-restore-from-backup-a-new-project-is-always-made-l-ingenting-eksisterende-overskrives-nothing-existing-is-overwritten-l-scener-sum-scenes-manusblokker-sum-blocks-manusversjoner-sum-versions-scenes-sum-scenes-script-blocks-sum-blocks-script-versions-sum-versions-l-ressurser-sum-assets-2d-scener-sum-compositions-lydklipp-sum-audio-clips-assets-sum-assets-2d-scenes-sum-compositions-audio-clips-sum-audio-clips-l-mediefiler-med-sum-files-media-files-included-sum-files-out-length-l-disse-out-length-filene-er-ikke-med-de-ligger-fortsatt-i-prosjektet-these-out-length-files-are-not-included-they-are-still-in-the-project-out-map-f-backup-category-label-f-category-f-path-join.c4431ee3e227", { name: String(sum.name) }),
    tk("core-backup-index.backup-readme.l-sikkerhetskopi-av-sum-name-fra-animatic-studio-backup-of-sum-name-from-animatic-studio-l-laget-b-created-at-formatversjon-b-format-version-databaseversjon-b-schema-version-made-b-created-at-format-version-b-format-version-database-version-b-schema-version-l-innhold-contents-l-backup-json-alle-prosjektdata-som-tabeller-samme-kolonner-som-databasen-backup-json-all-project-data-as-tables-the-same-columns-as-the-database-l-manus-scener-varianter-blokker-med-teksthistorikk-produksjoner-og-spinoffer-script-scenes-variants-blocks-with-text-history-productions-and-spin-offs-l-sceneforekomster-ressursbibliotek-notater-2d-scener-med-lag-og-kamera-lydklipp-scene-occurrences-asset-library-notes-2d-scenes-with-layers-and-camera-audio-clips-l-importert-film-med-deler-og-tidskoblinger-manusversjoner-og-importerte-manusfiler-imported-film-with-parts-and-time-links-script-versions-and-imported-script-files-l-history-inneholder-kommandologgen-og-loggen-over-ai-generering-bare-til-orientering-history-contains-the-command-log-and-the-ai-generation-log-for-information-only-l-files-er-en-liste-over-alle-mediefilene-ogs-de-som-ikke-er-tatt-med-files-is-a-list-of-all-the-media-files-including-those-not-included-l-filer-b-tte-sti-mediefilene-uendret-filer-b-tte-sti-the-media-files-unchanged-l-gjenopprett-prosjekter-gjenopprett-fra-sikkerhetskopi-det-lages-alltid-et-nytt-prosjekt-restore-projects-restore-from-backup-a-new-project-is-always-made-l-ingenting-eksisterende-overskrives-nothing-existing-is-overwritten-l-scener-sum-scenes-manusblokker-sum-blocks-manusversjoner-sum-versions-scenes-sum-scenes-script-blocks-sum-blocks-script-versions-sum-versions-l-ressurser-sum-assets-2d-scener-sum-compositions-lydklipp-sum-audio-clips-assets-sum-assets-2d-scenes-sum-compositions-audio-clips-sum-audio-clips-l-mediefiler-med-sum-files-media-files-included-sum-files-out-length-l-disse-out-length-filene-er-ikke-med-de-ligger-fortsatt-i-prosjektet-these-out-length-files-are-not-included-they-are-still-in-the-project-out-map-f-backup-category-label-f-category-f-path-join.e2aa4e337bc6", { createdAt: String(b.createdAt), formatVersion: String(b.formatVersion), schemaVersion: String(b.schemaVersion) }),
    "",
    tk("core-backup-index.backup-readme.l-sikkerhetskopi-av-sum-name-fra-animatic-studio-backup-of-sum-name-from-animatic-studio-l-laget-b-created-at-formatversjon-b-format-version-databaseversjon-b-schema-version-made-b-created-at-format-version-b-format-version-database-version-b-schema-version-l-innhold-contents-l-backup-json-alle-prosjektdata-som-tabeller-samme-kolonner-som-databasen-backup-json-all-project-data-as-tables-the-same-columns-as-the-database-l-manus-scener-varianter-blokker-med-teksthistorikk-produksjoner-og-spinoffer-script-scenes-variants-blocks-with-text-history-productions-and-spin-offs-l-sceneforekomster-ressursbibliotek-notater-2d-scener-med-lag-og-kamera-lydklipp-scene-occurrences-asset-library-notes-2d-scenes-with-layers-and-camera-audio-clips-l-importert-film-med-deler-og-tidskoblinger-manusversjoner-og-importerte-manusfiler-imported-film-with-parts-and-time-links-script-versions-and-imported-script-files-l-history-inneholder-kommandologgen-og-loggen-over-ai-generering-bare-til-orientering-history-contains-the-command-log-and-the-ai-generation-log-for-information-only-l-files-er-en-liste-over-alle-mediefilene-ogs-de-som-ikke-er-tatt-med-files-is-a-list-of-all-the-media-files-including-those-not-included-l-filer-b-tte-sti-mediefilene-uendret-filer-b-tte-sti-the-media-files-unchanged-l-gjenopprett-prosjekter-gjenopprett-fra-sikkerhetskopi-det-lages-alltid-et-nytt-prosjekt-restore-projects-restore-from-backup-a-new-project-is-always-made-l-ingenting-eksisterende-overskrives-nothing-existing-is-overwritten-l-scener-sum-scenes-manusblokker-sum-blocks-manusversjoner-sum-versions-scenes-sum-scenes-script-blocks-sum-blocks-script-versions-sum-versions-l-ressurser-sum-assets-2d-scener-sum-compositions-lydklipp-sum-audio-clips-assets-sum-assets-2d-scenes-sum-compositions-audio-clips-sum-audio-clips-l-mediefiler-med-sum-files-media-files-included-sum-files-out-length-l-disse-out-length-filene-er-ikke-med-de-ligger-fortsatt-i-prosjektet-these-out-length-files-are-not-included-they-are-still-in-the-project-out-map-f-backup-category-label-f-category-f-path-join.5b33f4c77b75"),
    tk("core-backup-index.backup-readme.l-sikkerhetskopi-av-sum-name-fra-animatic-studio-backup-of-sum-name-from-animatic-studio-l-laget-b-created-at-formatversjon-b-format-version-databaseversjon-b-schema-version-made-b-created-at-format-version-b-format-version-database-version-b-schema-version-l-innhold-contents-l-backup-json-alle-prosjektdata-som-tabeller-samme-kolonner-som-databasen-backup-json-all-project-data-as-tables-the-same-columns-as-the-database-l-manus-scener-varianter-blokker-med-teksthistorikk-produksjoner-og-spinoffer-script-scenes-variants-blocks-with-text-history-productions-and-spin-offs-l-sceneforekomster-ressursbibliotek-notater-2d-scener-med-lag-og-kamera-lydklipp-scene-occurrences-asset-library-notes-2d-scenes-with-layers-and-camera-audio-clips-l-importert-film-med-deler-og-tidskoblinger-manusversjoner-og-importerte-manusfiler-imported-film-with-parts-and-time-links-script-versions-and-imported-script-files-l-history-inneholder-kommandologgen-og-loggen-over-ai-generering-bare-til-orientering-history-contains-the-command-log-and-the-ai-generation-log-for-information-only-l-files-er-en-liste-over-alle-mediefilene-ogs-de-som-ikke-er-tatt-med-files-is-a-list-of-all-the-media-files-including-those-not-included-l-filer-b-tte-sti-mediefilene-uendret-filer-b-tte-sti-the-media-files-unchanged-l-gjenopprett-prosjekter-gjenopprett-fra-sikkerhetskopi-det-lages-alltid-et-nytt-prosjekt-restore-projects-restore-from-backup-a-new-project-is-always-made-l-ingenting-eksisterende-overskrives-nothing-existing-is-overwritten-l-scener-sum-scenes-manusblokker-sum-blocks-manusversjoner-sum-versions-scenes-sum-scenes-script-blocks-sum-blocks-script-versions-sum-versions-l-ressurser-sum-assets-2d-scener-sum-compositions-lydklipp-sum-audio-clips-assets-sum-assets-2d-scenes-sum-compositions-audio-clips-sum-audio-clips-l-mediefiler-med-sum-files-media-files-included-sum-files-out-length-l-disse-out-length-filene-er-ikke-med-de-ligger-fortsatt-i-prosjektet-these-out-length-files-are-not-included-they-are-still-in-the-project-out-map-f-backup-category-label-f-category-f-path-join.350511403787", { BACKUP_JSON: String(BACKUP_JSON) }),
    tk("core-backup-index.backup-readme.l-sikkerhetskopi-av-sum-name-fra-animatic-studio-backup-of-sum-name-from-animatic-studio-l-laget-b-created-at-formatversjon-b-format-version-databaseversjon-b-schema-version-made-b-created-at-format-version-b-format-version-database-version-b-schema-version-l-innhold-contents-l-backup-json-alle-prosjektdata-som-tabeller-samme-kolonner-som-databasen-backup-json-all-project-data-as-tables-the-same-columns-as-the-database-l-manus-scener-varianter-blokker-med-teksthistorikk-produksjoner-og-spinoffer-script-scenes-variants-blocks-with-text-history-productions-and-spin-offs-l-sceneforekomster-ressursbibliotek-notater-2d-scener-med-lag-og-kamera-lydklipp-scene-occurrences-asset-library-notes-2d-scenes-with-layers-and-camera-audio-clips-l-importert-film-med-deler-og-tidskoblinger-manusversjoner-og-importerte-manusfiler-imported-film-with-parts-and-time-links-script-versions-and-imported-script-files-l-history-inneholder-kommandologgen-og-loggen-over-ai-generering-bare-til-orientering-history-contains-the-command-log-and-the-ai-generation-log-for-information-only-l-files-er-en-liste-over-alle-mediefilene-ogs-de-som-ikke-er-tatt-med-files-is-a-list-of-all-the-media-files-including-those-not-included-l-filer-b-tte-sti-mediefilene-uendret-filer-b-tte-sti-the-media-files-unchanged-l-gjenopprett-prosjekter-gjenopprett-fra-sikkerhetskopi-det-lages-alltid-et-nytt-prosjekt-restore-projects-restore-from-backup-a-new-project-is-always-made-l-ingenting-eksisterende-overskrives-nothing-existing-is-overwritten-l-scener-sum-scenes-manusblokker-sum-blocks-manusversjoner-sum-versions-scenes-sum-scenes-script-blocks-sum-blocks-script-versions-sum-versions-l-ressurser-sum-assets-2d-scener-sum-compositions-lydklipp-sum-audio-clips-assets-sum-assets-2d-scenes-sum-compositions-audio-clips-sum-audio-clips-l-mediefiler-med-sum-files-media-files-included-sum-files-out-length-l-disse-out-length-filene-er-ikke-med-de-ligger-fortsatt-i-prosjektet-these-out-length-files-are-not-included-they-are-still-in-the-project-out-map-f-backup-category-label-f-category-f-path-join.307bb9109748"),
    tk("core-backup-index.backup-readme.l-sikkerhetskopi-av-sum-name-fra-animatic-studio-backup-of-sum-name-from-animatic-studio-l-laget-b-created-at-formatversjon-b-format-version-databaseversjon-b-schema-version-made-b-created-at-format-version-b-format-version-database-version-b-schema-version-l-innhold-contents-l-backup-json-alle-prosjektdata-som-tabeller-samme-kolonner-som-databasen-backup-json-all-project-data-as-tables-the-same-columns-as-the-database-l-manus-scener-varianter-blokker-med-teksthistorikk-produksjoner-og-spinoffer-script-scenes-variants-blocks-with-text-history-productions-and-spin-offs-l-sceneforekomster-ressursbibliotek-notater-2d-scener-med-lag-og-kamera-lydklipp-scene-occurrences-asset-library-notes-2d-scenes-with-layers-and-camera-audio-clips-l-importert-film-med-deler-og-tidskoblinger-manusversjoner-og-importerte-manusfiler-imported-film-with-parts-and-time-links-script-versions-and-imported-script-files-l-history-inneholder-kommandologgen-og-loggen-over-ai-generering-bare-til-orientering-history-contains-the-command-log-and-the-ai-generation-log-for-information-only-l-files-er-en-liste-over-alle-mediefilene-ogs-de-som-ikke-er-tatt-med-files-is-a-list-of-all-the-media-files-including-those-not-included-l-filer-b-tte-sti-mediefilene-uendret-filer-b-tte-sti-the-media-files-unchanged-l-gjenopprett-prosjekter-gjenopprett-fra-sikkerhetskopi-det-lages-alltid-et-nytt-prosjekt-restore-projects-restore-from-backup-a-new-project-is-always-made-l-ingenting-eksisterende-overskrives-nothing-existing-is-overwritten-l-scener-sum-scenes-manusblokker-sum-blocks-manusversjoner-sum-versions-scenes-sum-scenes-script-blocks-sum-blocks-script-versions-sum-versions-l-ressurser-sum-assets-2d-scener-sum-compositions-lydklipp-sum-audio-clips-assets-sum-assets-2d-scenes-sum-compositions-audio-clips-sum-audio-clips-l-mediefiler-med-sum-files-media-files-included-sum-files-out-length-l-disse-out-length-filene-er-ikke-med-de-ligger-fortsatt-i-prosjektet-these-out-length-files-are-not-included-they-are-still-in-the-project-out-map-f-backup-category-label-f-category-f-path-join.458e2a5049e5"),
    tk("core-backup-index.backup-readme.l-sikkerhetskopi-av-sum-name-fra-animatic-studio-backup-of-sum-name-from-animatic-studio-l-laget-b-created-at-formatversjon-b-format-version-databaseversjon-b-schema-version-made-b-created-at-format-version-b-format-version-database-version-b-schema-version-l-innhold-contents-l-backup-json-alle-prosjektdata-som-tabeller-samme-kolonner-som-databasen-backup-json-all-project-data-as-tables-the-same-columns-as-the-database-l-manus-scener-varianter-blokker-med-teksthistorikk-produksjoner-og-spinoffer-script-scenes-variants-blocks-with-text-history-productions-and-spin-offs-l-sceneforekomster-ressursbibliotek-notater-2d-scener-med-lag-og-kamera-lydklipp-scene-occurrences-asset-library-notes-2d-scenes-with-layers-and-camera-audio-clips-l-importert-film-med-deler-og-tidskoblinger-manusversjoner-og-importerte-manusfiler-imported-film-with-parts-and-time-links-script-versions-and-imported-script-files-l-history-inneholder-kommandologgen-og-loggen-over-ai-generering-bare-til-orientering-history-contains-the-command-log-and-the-ai-generation-log-for-information-only-l-files-er-en-liste-over-alle-mediefilene-ogs-de-som-ikke-er-tatt-med-files-is-a-list-of-all-the-media-files-including-those-not-included-l-filer-b-tte-sti-mediefilene-uendret-filer-b-tte-sti-the-media-files-unchanged-l-gjenopprett-prosjekter-gjenopprett-fra-sikkerhetskopi-det-lages-alltid-et-nytt-prosjekt-restore-projects-restore-from-backup-a-new-project-is-always-made-l-ingenting-eksisterende-overskrives-nothing-existing-is-overwritten-l-scener-sum-scenes-manusblokker-sum-blocks-manusversjoner-sum-versions-scenes-sum-scenes-script-blocks-sum-blocks-script-versions-sum-versions-l-ressurser-sum-assets-2d-scener-sum-compositions-lydklipp-sum-audio-clips-assets-sum-assets-2d-scenes-sum-compositions-audio-clips-sum-audio-clips-l-mediefiler-med-sum-files-media-files-included-sum-files-out-length-l-disse-out-length-filene-er-ikke-med-de-ligger-fortsatt-i-prosjektet-these-out-length-files-are-not-included-they-are-still-in-the-project-out-map-f-backup-category-label-f-category-f-path-join.0e60fdcc65e7"),
    tk("core-backup-index.backup-readme.l-sikkerhetskopi-av-sum-name-fra-animatic-studio-backup-of-sum-name-from-animatic-studio-l-laget-b-created-at-formatversjon-b-format-version-databaseversjon-b-schema-version-made-b-created-at-format-version-b-format-version-database-version-b-schema-version-l-innhold-contents-l-backup-json-alle-prosjektdata-som-tabeller-samme-kolonner-som-databasen-backup-json-all-project-data-as-tables-the-same-columns-as-the-database-l-manus-scener-varianter-blokker-med-teksthistorikk-produksjoner-og-spinoffer-script-scenes-variants-blocks-with-text-history-productions-and-spin-offs-l-sceneforekomster-ressursbibliotek-notater-2d-scener-med-lag-og-kamera-lydklipp-scene-occurrences-asset-library-notes-2d-scenes-with-layers-and-camera-audio-clips-l-importert-film-med-deler-og-tidskoblinger-manusversjoner-og-importerte-manusfiler-imported-film-with-parts-and-time-links-script-versions-and-imported-script-files-l-history-inneholder-kommandologgen-og-loggen-over-ai-generering-bare-til-orientering-history-contains-the-command-log-and-the-ai-generation-log-for-information-only-l-files-er-en-liste-over-alle-mediefilene-ogs-de-som-ikke-er-tatt-med-files-is-a-list-of-all-the-media-files-including-those-not-included-l-filer-b-tte-sti-mediefilene-uendret-filer-b-tte-sti-the-media-files-unchanged-l-gjenopprett-prosjekter-gjenopprett-fra-sikkerhetskopi-det-lages-alltid-et-nytt-prosjekt-restore-projects-restore-from-backup-a-new-project-is-always-made-l-ingenting-eksisterende-overskrives-nothing-existing-is-overwritten-l-scener-sum-scenes-manusblokker-sum-blocks-manusversjoner-sum-versions-scenes-sum-scenes-script-blocks-sum-blocks-script-versions-sum-versions-l-ressurser-sum-assets-2d-scener-sum-compositions-lydklipp-sum-audio-clips-assets-sum-assets-2d-scenes-sum-compositions-audio-clips-sum-audio-clips-l-mediefiler-med-sum-files-media-files-included-sum-files-out-length-l-disse-out-length-filene-er-ikke-med-de-ligger-fortsatt-i-prosjektet-these-out-length-files-are-not-included-they-are-still-in-the-project-out-map-f-backup-category-label-f-category-f-path-join.d0abfdf8285b"),
    tk("core-backup-index.backup-readme.l-sikkerhetskopi-av-sum-name-fra-animatic-studio-backup-of-sum-name-from-animatic-studio-l-laget-b-created-at-formatversjon-b-format-version-databaseversjon-b-schema-version-made-b-created-at-format-version-b-format-version-database-version-b-schema-version-l-innhold-contents-l-backup-json-alle-prosjektdata-som-tabeller-samme-kolonner-som-databasen-backup-json-all-project-data-as-tables-the-same-columns-as-the-database-l-manus-scener-varianter-blokker-med-teksthistorikk-produksjoner-og-spinoffer-script-scenes-variants-blocks-with-text-history-productions-and-spin-offs-l-sceneforekomster-ressursbibliotek-notater-2d-scener-med-lag-og-kamera-lydklipp-scene-occurrences-asset-library-notes-2d-scenes-with-layers-and-camera-audio-clips-l-importert-film-med-deler-og-tidskoblinger-manusversjoner-og-importerte-manusfiler-imported-film-with-parts-and-time-links-script-versions-and-imported-script-files-l-history-inneholder-kommandologgen-og-loggen-over-ai-generering-bare-til-orientering-history-contains-the-command-log-and-the-ai-generation-log-for-information-only-l-files-er-en-liste-over-alle-mediefilene-ogs-de-som-ikke-er-tatt-med-files-is-a-list-of-all-the-media-files-including-those-not-included-l-filer-b-tte-sti-mediefilene-uendret-filer-b-tte-sti-the-media-files-unchanged-l-gjenopprett-prosjekter-gjenopprett-fra-sikkerhetskopi-det-lages-alltid-et-nytt-prosjekt-restore-projects-restore-from-backup-a-new-project-is-always-made-l-ingenting-eksisterende-overskrives-nothing-existing-is-overwritten-l-scener-sum-scenes-manusblokker-sum-blocks-manusversjoner-sum-versions-scenes-sum-scenes-script-blocks-sum-blocks-script-versions-sum-versions-l-ressurser-sum-assets-2d-scener-sum-compositions-lydklipp-sum-audio-clips-assets-sum-assets-2d-scenes-sum-compositions-audio-clips-sum-audio-clips-l-mediefiler-med-sum-files-media-files-included-sum-files-out-length-l-disse-out-length-filene-er-ikke-med-de-ligger-fortsatt-i-prosjektet-these-out-length-files-are-not-included-they-are-still-in-the-project-out-map-f-backup-category-label-f-category-f-path-join.19ab6bf26884"),
    tk("core-backup-index.backup-readme.l-sikkerhetskopi-av-sum-name-fra-animatic-studio-backup-of-sum-name-from-animatic-studio-l-laget-b-created-at-formatversjon-b-format-version-databaseversjon-b-schema-version-made-b-created-at-format-version-b-format-version-database-version-b-schema-version-l-innhold-contents-l-backup-json-alle-prosjektdata-som-tabeller-samme-kolonner-som-databasen-backup-json-all-project-data-as-tables-the-same-columns-as-the-database-l-manus-scener-varianter-blokker-med-teksthistorikk-produksjoner-og-spinoffer-script-scenes-variants-blocks-with-text-history-productions-and-spin-offs-l-sceneforekomster-ressursbibliotek-notater-2d-scener-med-lag-og-kamera-lydklipp-scene-occurrences-asset-library-notes-2d-scenes-with-layers-and-camera-audio-clips-l-importert-film-med-deler-og-tidskoblinger-manusversjoner-og-importerte-manusfiler-imported-film-with-parts-and-time-links-script-versions-and-imported-script-files-l-history-inneholder-kommandologgen-og-loggen-over-ai-generering-bare-til-orientering-history-contains-the-command-log-and-the-ai-generation-log-for-information-only-l-files-er-en-liste-over-alle-mediefilene-ogs-de-som-ikke-er-tatt-med-files-is-a-list-of-all-the-media-files-including-those-not-included-l-filer-b-tte-sti-mediefilene-uendret-filer-b-tte-sti-the-media-files-unchanged-l-gjenopprett-prosjekter-gjenopprett-fra-sikkerhetskopi-det-lages-alltid-et-nytt-prosjekt-restore-projects-restore-from-backup-a-new-project-is-always-made-l-ingenting-eksisterende-overskrives-nothing-existing-is-overwritten-l-scener-sum-scenes-manusblokker-sum-blocks-manusversjoner-sum-versions-scenes-sum-scenes-script-blocks-sum-blocks-script-versions-sum-versions-l-ressurser-sum-assets-2d-scener-sum-compositions-lydklipp-sum-audio-clips-assets-sum-assets-2d-scenes-sum-compositions-audio-clips-sum-audio-clips-l-mediefiler-med-sum-files-media-files-included-sum-files-out-length-l-disse-out-length-filene-er-ikke-med-de-ligger-fortsatt-i-prosjektet-these-out-length-files-are-not-included-they-are-still-in-the-project-out-map-f-backup-category-label-f-category-f-path-join.56c0c0b981d5"),
    "",
    tk("core-backup-index.backup-readme.l-sikkerhetskopi-av-sum-name-fra-animatic-studio-backup-of-sum-name-from-animatic-studio-l-laget-b-created-at-formatversjon-b-format-version-databaseversjon-b-schema-version-made-b-created-at-format-version-b-format-version-database-version-b-schema-version-l-innhold-contents-l-backup-json-alle-prosjektdata-som-tabeller-samme-kolonner-som-databasen-backup-json-all-project-data-as-tables-the-same-columns-as-the-database-l-manus-scener-varianter-blokker-med-teksthistorikk-produksjoner-og-spinoffer-script-scenes-variants-blocks-with-text-history-productions-and-spin-offs-l-sceneforekomster-ressursbibliotek-notater-2d-scener-med-lag-og-kamera-lydklipp-scene-occurrences-asset-library-notes-2d-scenes-with-layers-and-camera-audio-clips-l-importert-film-med-deler-og-tidskoblinger-manusversjoner-og-importerte-manusfiler-imported-film-with-parts-and-time-links-script-versions-and-imported-script-files-l-history-inneholder-kommandologgen-og-loggen-over-ai-generering-bare-til-orientering-history-contains-the-command-log-and-the-ai-generation-log-for-information-only-l-files-er-en-liste-over-alle-mediefilene-ogs-de-som-ikke-er-tatt-med-files-is-a-list-of-all-the-media-files-including-those-not-included-l-filer-b-tte-sti-mediefilene-uendret-filer-b-tte-sti-the-media-files-unchanged-l-gjenopprett-prosjekter-gjenopprett-fra-sikkerhetskopi-det-lages-alltid-et-nytt-prosjekt-restore-projects-restore-from-backup-a-new-project-is-always-made-l-ingenting-eksisterende-overskrives-nothing-existing-is-overwritten-l-scener-sum-scenes-manusblokker-sum-blocks-manusversjoner-sum-versions-scenes-sum-scenes-script-blocks-sum-blocks-script-versions-sum-versions-l-ressurser-sum-assets-2d-scener-sum-compositions-lydklipp-sum-audio-clips-assets-sum-assets-2d-scenes-sum-compositions-audio-clips-sum-audio-clips-l-mediefiler-med-sum-files-media-files-included-sum-files-out-length-l-disse-out-length-filene-er-ikke-med-de-ligger-fortsatt-i-prosjektet-these-out-length-files-are-not-included-they-are-still-in-the-project-out-map-f-backup-category-label-f-category-f-path-join.0b1007895dbb"),
    tk("core-backup-index.backup-readme.l-sikkerhetskopi-av-sum-name-fra-animatic-studio-backup-of-sum-name-from-animatic-studio-l-laget-b-created-at-formatversjon-b-format-version-databaseversjon-b-schema-version-made-b-created-at-format-version-b-format-version-database-version-b-schema-version-l-innhold-contents-l-backup-json-alle-prosjektdata-som-tabeller-samme-kolonner-som-databasen-backup-json-all-project-data-as-tables-the-same-columns-as-the-database-l-manus-scener-varianter-blokker-med-teksthistorikk-produksjoner-og-spinoffer-script-scenes-variants-blocks-with-text-history-productions-and-spin-offs-l-sceneforekomster-ressursbibliotek-notater-2d-scener-med-lag-og-kamera-lydklipp-scene-occurrences-asset-library-notes-2d-scenes-with-layers-and-camera-audio-clips-l-importert-film-med-deler-og-tidskoblinger-manusversjoner-og-importerte-manusfiler-imported-film-with-parts-and-time-links-script-versions-and-imported-script-files-l-history-inneholder-kommandologgen-og-loggen-over-ai-generering-bare-til-orientering-history-contains-the-command-log-and-the-ai-generation-log-for-information-only-l-files-er-en-liste-over-alle-mediefilene-ogs-de-som-ikke-er-tatt-med-files-is-a-list-of-all-the-media-files-including-those-not-included-l-filer-b-tte-sti-mediefilene-uendret-filer-b-tte-sti-the-media-files-unchanged-l-gjenopprett-prosjekter-gjenopprett-fra-sikkerhetskopi-det-lages-alltid-et-nytt-prosjekt-restore-projects-restore-from-backup-a-new-project-is-always-made-l-ingenting-eksisterende-overskrives-nothing-existing-is-overwritten-l-scener-sum-scenes-manusblokker-sum-blocks-manusversjoner-sum-versions-scenes-sum-scenes-script-blocks-sum-blocks-script-versions-sum-versions-l-ressurser-sum-assets-2d-scener-sum-compositions-lydklipp-sum-audio-clips-assets-sum-assets-2d-scenes-sum-compositions-audio-clips-sum-audio-clips-l-mediefiler-med-sum-files-media-files-included-sum-files-out-length-l-disse-out-length-filene-er-ikke-med-de-ligger-fortsatt-i-prosjektet-these-out-length-files-are-not-included-they-are-still-in-the-project-out-map-f-backup-category-label-f-category-f-path-join.83e170294c2c"),
    "",
    tk("core-backup-index.backup-readme.l-sikkerhetskopi-av-sum-name-fra-animatic-studio-backup-of-sum-name-from-animatic-studio-l-laget-b-created-at-formatversjon-b-format-version-databaseversjon-b-schema-version-made-b-created-at-format-version-b-format-version-database-version-b-schema-version-l-innhold-contents-l-backup-json-alle-prosjektdata-som-tabeller-samme-kolonner-som-databasen-backup-json-all-project-data-as-tables-the-same-columns-as-the-database-l-manus-scener-varianter-blokker-med-teksthistorikk-produksjoner-og-spinoffer-script-scenes-variants-blocks-with-text-history-productions-and-spin-offs-l-sceneforekomster-ressursbibliotek-notater-2d-scener-med-lag-og-kamera-lydklipp-scene-occurrences-asset-library-notes-2d-scenes-with-layers-and-camera-audio-clips-l-importert-film-med-deler-og-tidskoblinger-manusversjoner-og-importerte-manusfiler-imported-film-with-parts-and-time-links-script-versions-and-imported-script-files-l-history-inneholder-kommandologgen-og-loggen-over-ai-generering-bare-til-orientering-history-contains-the-command-log-and-the-ai-generation-log-for-information-only-l-files-er-en-liste-over-alle-mediefilene-ogs-de-som-ikke-er-tatt-med-files-is-a-list-of-all-the-media-files-including-those-not-included-l-filer-b-tte-sti-mediefilene-uendret-filer-b-tte-sti-the-media-files-unchanged-l-gjenopprett-prosjekter-gjenopprett-fra-sikkerhetskopi-det-lages-alltid-et-nytt-prosjekt-restore-projects-restore-from-backup-a-new-project-is-always-made-l-ingenting-eksisterende-overskrives-nothing-existing-is-overwritten-l-scener-sum-scenes-manusblokker-sum-blocks-manusversjoner-sum-versions-scenes-sum-scenes-script-blocks-sum-blocks-script-versions-sum-versions-l-ressurser-sum-assets-2d-scener-sum-compositions-lydklipp-sum-audio-clips-assets-sum-assets-2d-scenes-sum-compositions-audio-clips-sum-audio-clips-l-mediefiler-med-sum-files-media-files-included-sum-files-out-length-l-disse-out-length-filene-er-ikke-med-de-ligger-fortsatt-i-prosjektet-these-out-length-files-are-not-included-they-are-still-in-the-project-out-map-f-backup-category-label-f-category-f-path-join.5fc82ca70a93", { scenes: String(sum.scenes), blocks: String(sum.blocks), versions: String(sum.versions) }),
    tk("core-backup-index.backup-readme.l-sikkerhetskopi-av-sum-name-fra-animatic-studio-backup-of-sum-name-from-animatic-studio-l-laget-b-created-at-formatversjon-b-format-version-databaseversjon-b-schema-version-made-b-created-at-format-version-b-format-version-database-version-b-schema-version-l-innhold-contents-l-backup-json-alle-prosjektdata-som-tabeller-samme-kolonner-som-databasen-backup-json-all-project-data-as-tables-the-same-columns-as-the-database-l-manus-scener-varianter-blokker-med-teksthistorikk-produksjoner-og-spinoffer-script-scenes-variants-blocks-with-text-history-productions-and-spin-offs-l-sceneforekomster-ressursbibliotek-notater-2d-scener-med-lag-og-kamera-lydklipp-scene-occurrences-asset-library-notes-2d-scenes-with-layers-and-camera-audio-clips-l-importert-film-med-deler-og-tidskoblinger-manusversjoner-og-importerte-manusfiler-imported-film-with-parts-and-time-links-script-versions-and-imported-script-files-l-history-inneholder-kommandologgen-og-loggen-over-ai-generering-bare-til-orientering-history-contains-the-command-log-and-the-ai-generation-log-for-information-only-l-files-er-en-liste-over-alle-mediefilene-ogs-de-som-ikke-er-tatt-med-files-is-a-list-of-all-the-media-files-including-those-not-included-l-filer-b-tte-sti-mediefilene-uendret-filer-b-tte-sti-the-media-files-unchanged-l-gjenopprett-prosjekter-gjenopprett-fra-sikkerhetskopi-det-lages-alltid-et-nytt-prosjekt-restore-projects-restore-from-backup-a-new-project-is-always-made-l-ingenting-eksisterende-overskrives-nothing-existing-is-overwritten-l-scener-sum-scenes-manusblokker-sum-blocks-manusversjoner-sum-versions-scenes-sum-scenes-script-blocks-sum-blocks-script-versions-sum-versions-l-ressurser-sum-assets-2d-scener-sum-compositions-lydklipp-sum-audio-clips-assets-sum-assets-2d-scenes-sum-compositions-audio-clips-sum-audio-clips-l-mediefiler-med-sum-files-media-files-included-sum-files-out-length-l-disse-out-length-filene-er-ikke-med-de-ligger-fortsatt-i-prosjektet-these-out-length-files-are-not-included-they-are-still-in-the-project-out-map-f-backup-category-label-f-category-f-path-join.9c499b1d728e", { assets: String(sum.assets), compositions: String(sum.compositions), audioClips: String(sum.audioClips) }),
    tk("core-backup-index.backup-readme.l-sikkerhetskopi-av-sum-name-fra-animatic-studio-backup-of-sum-name-from-animatic-studio-l-laget-b-created-at-formatversjon-b-format-version-databaseversjon-b-schema-version-made-b-created-at-format-version-b-format-version-database-version-b-schema-version-l-innhold-contents-l-backup-json-alle-prosjektdata-som-tabeller-samme-kolonner-som-databasen-backup-json-all-project-data-as-tables-the-same-columns-as-the-database-l-manus-scener-varianter-blokker-med-teksthistorikk-produksjoner-og-spinoffer-script-scenes-variants-blocks-with-text-history-productions-and-spin-offs-l-sceneforekomster-ressursbibliotek-notater-2d-scener-med-lag-og-kamera-lydklipp-scene-occurrences-asset-library-notes-2d-scenes-with-layers-and-camera-audio-clips-l-importert-film-med-deler-og-tidskoblinger-manusversjoner-og-importerte-manusfiler-imported-film-with-parts-and-time-links-script-versions-and-imported-script-files-l-history-inneholder-kommandologgen-og-loggen-over-ai-generering-bare-til-orientering-history-contains-the-command-log-and-the-ai-generation-log-for-information-only-l-files-er-en-liste-over-alle-mediefilene-ogs-de-som-ikke-er-tatt-med-files-is-a-list-of-all-the-media-files-including-those-not-included-l-filer-b-tte-sti-mediefilene-uendret-filer-b-tte-sti-the-media-files-unchanged-l-gjenopprett-prosjekter-gjenopprett-fra-sikkerhetskopi-det-lages-alltid-et-nytt-prosjekt-restore-projects-restore-from-backup-a-new-project-is-always-made-l-ingenting-eksisterende-overskrives-nothing-existing-is-overwritten-l-scener-sum-scenes-manusblokker-sum-blocks-manusversjoner-sum-versions-scenes-sum-scenes-script-blocks-sum-blocks-script-versions-sum-versions-l-ressurser-sum-assets-2d-scener-sum-compositions-lydklipp-sum-audio-clips-assets-sum-assets-2d-scenes-sum-compositions-audio-clips-sum-audio-clips-l-mediefiler-med-sum-files-media-files-included-sum-files-out-length-l-disse-out-length-filene-er-ikke-med-de-ligger-fortsatt-i-prosjektet-these-out-length-files-are-not-included-they-are-still-in-the-project-out-map-f-backup-category-label-f-category-f-path-join.6b49b7313719", { files: String(sum.files) }),
    ...(out.length
      ? [
          "",
          tk("core-backup-index.backup-readme.l-sikkerhetskopi-av-sum-name-fra-animatic-studio-backup-of-sum-name-from-animatic-studio-l-laget-b-created-at-formatversjon-b-format-version-databaseversjon-b-schema-version-made-b-created-at-format-version-b-format-version-database-version-b-schema-version-l-innhold-contents-l-backup-json-alle-prosjektdata-som-tabeller-samme-kolonner-som-databasen-backup-json-all-project-data-as-tables-the-same-columns-as-the-database-l-manus-scener-varianter-blokker-med-teksthistorikk-produksjoner-og-spinoffer-script-scenes-variants-blocks-with-text-history-productions-and-spin-offs-l-sceneforekomster-ressursbibliotek-notater-2d-scener-med-lag-og-kamera-lydklipp-scene-occurrences-asset-library-notes-2d-scenes-with-layers-and-camera-audio-clips-l-importert-film-med-deler-og-tidskoblinger-manusversjoner-og-importerte-manusfiler-imported-film-with-parts-and-time-links-script-versions-and-imported-script-files-l-history-inneholder-kommandologgen-og-loggen-over-ai-generering-bare-til-orientering-history-contains-the-command-log-and-the-ai-generation-log-for-information-only-l-files-er-en-liste-over-alle-mediefilene-ogs-de-som-ikke-er-tatt-med-files-is-a-list-of-all-the-media-files-including-those-not-included-l-filer-b-tte-sti-mediefilene-uendret-filer-b-tte-sti-the-media-files-unchanged-l-gjenopprett-prosjekter-gjenopprett-fra-sikkerhetskopi-det-lages-alltid-et-nytt-prosjekt-restore-projects-restore-from-backup-a-new-project-is-always-made-l-ingenting-eksisterende-overskrives-nothing-existing-is-overwritten-l-scener-sum-scenes-manusblokker-sum-blocks-manusversjoner-sum-versions-scenes-sum-scenes-script-blocks-sum-blocks-script-versions-sum-versions-l-ressurser-sum-assets-2d-scener-sum-compositions-lydklipp-sum-audio-clips-assets-sum-assets-2d-scenes-sum-compositions-audio-clips-sum-audio-clips-l-mediefiler-med-sum-files-media-files-included-sum-files-out-length-l-disse-out-length-filene-er-ikke-med-de-ligger-fortsatt-i-prosjektet-these-out-length-files-are-not-included-they-are-still-in-the-project-out-map-f-backup-category-label-f-category-f-path-join.37ae3941af04", { length: String(out.length) }),
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
      name: "Kontroll", // i18n-ignore – standardnavn ved gjenoppbygging, ikke vist
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
        name: "Hovedfilm", // i18n-ignore – lagret standardnavn for hovedfilmen
        parentProductionId: null,
        fps,
      },
    },
  };
  const map = await backupIdMap(b, pid, main);
  restoredState(b, map, base, "01900000-0000-7000-8000-0000000000a3");
  restoredExtras(b, map, "01900000-0000-7000-8000-0000000000a3");
}
