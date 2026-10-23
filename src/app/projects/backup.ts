/**
 * Sikkerhetskopi i nettleseren (DEC-0049): hente alt som skal med, lage zip-filen, og gjenopprette fra en
 * zip-fil til et nytt prosjekt (filene lastes opp her, dataene skrives av serverfunksjonen restoreBackup).
 */
import { globalAssetIdsOf, type GlobalSnapshotEntry } from "@/core/backup";
import { db } from "@/adapters/browser/client";
import { BACKUP_JSON, BACKUP_MAX_JSON_BYTES, BACKUP_README, backupIdMap, backupReadme, makeBackup, parseBackup, restoreFiles, validateBackup, type BackupData, type BackupFileCategory, type ProjectRows, type Row } from "@/core";
import { EXPECTED_SCHEMA_VERSION } from "@/adapters/storage/project-rows";
import { restoreBackup } from "@/adapters/storage/backup.functions";
import { fetchProjectRows, fetchSchemaStatus, fetchTable } from "@/adapters/browser/project-data";
import { createProjectWithFps, findMainProductions } from "@/adapters/browser/projects";
import { createSignedUrls, uploadFile } from "@/adapters/browser/storage-files";
import { writeZip, type ZipProgress, type ZipSink } from "@/engine/export/zip";
import {
  readZipIndex,
  zipEntryBlob,
  zipEntryText,
  type ZipIndexEntry,
} from "@/engine/import/zip-read";
import { t } from "@/core/i18n/keyed";

export interface BackupSource {
  readonly rows: ProjectRows;
  readonly scriptVersions: readonly Row[];
  readonly importedDocuments: readonly Row[];
  readonly changeLog: readonly Row[];
  readonly generationJobs: readonly Row[];
  readonly schemaVersion: number;
  readonly globalSnapshot?: readonly GlobalSnapshotEntry[];
}

/**
 * G-6 pkt 4: øyeblikksbilde av globale ressurser prosjektet bruker. Leses med brukerens egen tilgang (RLS):
 * mangler tilgangen til arbeidsgruppen, utelates ressursen – prosjektet er uansett selvstendig.
 */
async function loadGlobalSnapshot(rows: ProjectRows): Promise<GlobalSnapshotEntry[]> {
  const ids = globalAssetIdsOf(rows);
  if (!ids.length) return [];
  const { data } = await db.from("global_assets").select("id, name, kind, description").in("id", ids);
  const out: GlobalSnapshotEntry[] = [];
  for (const g of (data ?? []) as Row[]) {
    const id = String(g["id"]);
    const kind = String(g["kind"] ?? "");
    let bundle: unknown = null;
    if (kind === "character" || kind === "animal") {
      const r = await db.rpc("global_character_bundle" as never, { p_global_asset: id, p_number: null } as never);
      bundle = r.error ? null : (r.data ?? null);
    }
    out.push({ globalAssetId: id, name: String(g["name"] ?? ""), kind, description: String(g["description"] ?? ""), bundle });
  }
  return out;
}

/** Alt prosjektet består av (det brukeren har lesetilgang til). */
export async function loadBackupSource(projectId: string): Promise<BackupSource> {
  const [rows, scriptVersions, importedDocuments, changeLog, generationJobs, schema] =
    await Promise.all([
      fetchProjectRows(projectId),
      fetchTable("script_versions", projectId),
      fetchTable("imported_documents", projectId),
      fetchTable("change_log", projectId),
      fetchTable("generation_jobs", projectId),
      fetchSchemaStatus(),
    ]);
  const globalSnapshot = await loadGlobalSnapshot(rows).catch(() => []);
  return {
    rows,
    globalSnapshot,
    scriptVersions,
    importedDocuments,
    changeLog,
    generationJobs,
    schemaVersion: schema.kind === "missing" ? 0 : schema.version,
  };
}

export function buildBackup(
  src: BackupSource,
  include: ReadonlySet<BackupFileCategory>,
): BackupData {
  return makeBackup({ ...src, createdAt: new Date().toISOString(), include });
}

/** Feilmelding hvis sikkerhetskopien ikke ville kunne gjenopprettes (null = i orden). */
export async function backupProblem(b: BackupData): Promise<string | null> {
  try {
    await validateBackup(b);
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

async function signed(bucket: string, paths: readonly string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const list = [...new Set(paths)];
  for (let i = 0; i < list.length; i += 200) {
    for (const d of await createSignedUrls(bucket, list.slice(i, i + 200), 6 * 60 * 60))
      out[`${bucket}:${d.path}`] = d.signedUrl;
  }
  return out;
}

/** Skriver zip-filen: data og LES-MEG først, deretter mediefilene. */
export async function writeBackupZip(
  sink: ZipSink,
  backup: BackupData,
  o: { onProgress?: (p: ZipProgress) => void; signal?: AbortSignal } = {},
): Promise<{ missing: string[] }> {
  const files = backup.files.filter((f) => f.included);
  const urls = {
    ...(await signed(
      "assets",
      files.filter((f) => f.bucket === "assets").map((f) => f.path),
    )),
    ...(await signed(
      "sources",
      files.filter((f) => f.bucket === "sources").map((f) => f.path),
    )),
  };
  const enc = new TextEncoder();
  return writeZip(
    sink,
    files.map((f) => ({
      path: f.zipPath,
      mediaPath: `${f.bucket}:${f.path}`,
      byteSize: f.byteSize,
    })),
    urls,
    {
      ...o,
      extra: [
        { path: BACKUP_JSON, data: enc.encode(JSON.stringify(backup)) },
        { path: BACKUP_README, data: enc.encode(backupReadme(backup)) },
      ],
    },
  );
}

// ---------- Gjenoppretting ----------

export interface OpenedBackup {
  readonly file: File;
  readonly index: ReadonlyMap<string, ZipIndexEntry>;
  /** Mappe i zip-filen som sikkerhetskopien ligger i («» når den ligger øverst). */
  readonly prefix: string;
  readonly backup: BackupData;
  /** Filer i listen som mangler i zip-filen. */
  readonly missing: number;
}

export async function openBackupFile(file: File): Promise<OpenedBackup> {
  const index = await readZipIndex(file);
  // Pakket ut og pakket inn igjen (f.eks. i Finder): alt ligger da i en mappe
  const key =
    (index.has(BACKUP_JSON) ? BACKUP_JSON : null) ??
    [...index.keys()].find((k) => k.endsWith(`/${BACKUP_JSON}`) && !k.startsWith("__MACOSX/"));
  if (!key)
    throw new Error(
      t("app-projects-backup.open-backup-file.message.23132bc02467"),
    );
  const prefix = key.slice(0, key.length - BACKUP_JSON.length);
  let raw: unknown;
  try {
    raw = JSON.parse(await zipEntryText(file, index.get(key)!));
  } catch {
    throw new Error(
      t("app-projects-backup.open-backup-file.message.8a6d7a4fd333"),
    );
  }
  const backup = parseBackup(raw, EXPECTED_SCHEMA_VERSION);
  // Kontroller alt før noe opprettes eller lastes opp
  const size = new TextEncoder().encode(JSON.stringify({ ...backup, history: {} })).length;
  if (size > BACKUP_MAX_JSON_BYTES)
    throw new Error(
      t("app-projects-backup.open-backup-file.message.58d265d9f15e"),
    );
  await validateBackup(backup);
  const missing = backup.files.filter((f) => f.included && !index.has(prefix + f.zipPath)).length;
  return { file, index, prefix, backup, missing };
}

export interface RestoreProgress {
  readonly phase: "project" | "files" | "data" | "done";
  readonly files: number;
  readonly totalFiles: number;
  readonly bytes: number;
  readonly totalBytes: number;
}

/** Hvor langt en gjenoppretting kom (et nytt forsøk fortsetter der). */
export interface RestoreState {
  projectId: string | null;
  uploaded: Set<string>;
}

/**
 * Gjenoppretter til et nytt prosjekt med navnet `name`. Returnerer det nye prosjektets ID. Kaster med norsk
 * melding; `state` viser da hvor langt den kom, og samme `state` sendes inn ved nytt forsøk.
 */
export async function restoreFromBackup(
  opened: OpenedBackup,
  name: string,
  state: RestoreState,
  onProgress: (p: RestoreProgress) => void,
  signal?: AbortSignal,
): Promise<string> {
  const { backup, file, index, prefix } = opened;
  onProgress({ phase: "project", files: 0, totalFiles: 0, bytes: 0, totalBytes: 0 });
  if (!state.projectId) {
    const fps_num = Number(backup.project["fps_num"] ?? 25);
    const fps_den = Number(backup.project["fps_den"] ?? 1);
    const { data, error } = await createProjectWithFps(name, fps_num, fps_den, String(backup.project["source_language"] ?? backup.project["script_language"] ?? backup.project["primary_language"] ?? "und"));
    if (error)
      throw new Error(
        t("app-projects-backup.restore-from-backup.message.ca82853739e0", { message: String(error.message) }),
      );
    state.projectId = String(data);
  }
  const projectId = state.projectId;
  const { data: mains, error: mainError } = await findMainProductions(projectId);
  if (mainError || !mains?.[0])
    throw new Error(
      t("app-projects-backup.restore-from-backup.message.28b9b1e05005"),
    );
  const map = await backupIdMap(backup, projectId, String(mains[0].id));
  const files = restoreFiles(backup, map).filter((f) => index.has(prefix + f.zipPath));
  const totalBytes = files.reduce((n, f) => n + f.byteSize, 0);
  let bytes = files
    .filter((f) => state.uploaded.has(f.zipPath))
    .reduce((n, f) => n + f.byteSize, 0);
  let done = state.uploaded.size;
  for (const f of files) {
    if (state.uploaded.has(f.zipPath)) continue;
    if (signal?.aborted) throw new DOMException(t("app-projects-backup.restore-from-backup.message.4d81669ae2f8"), "AbortError");
    onProgress({ phase: "files", files: done, totalFiles: files.length, bytes, totalBytes });
    const blob = await zipEntryBlob(file, index.get(prefix + f.zipPath)!, f.mimeType);
    const error = await uploadFile(f.bucket, f.path, blob, {
      ...(f.mimeType ? { contentType: f.mimeType } : {}),
      upsert: false,
    });
    if (error && !/exists|duplicate/i.test(error.message))
      throw new Error(
        t("app-projects-backup.restore-from-backup.message.252a5b000bc1", { value1: String(f.zipPath.split("/").pop()), message: String(error.message) }),
      );
    state.uploaded.add(f.zipPath);
    done++;
    bytes += f.byteSize;
  }
  onProgress({ phase: "data", files: done, totalFiles: files.length, bytes, totalBytes });
  // Historikken gjenopprettes ikke; den sendes ikke til serveren
  const res = await restoreBackup({ data: { projectId, backup: { ...backup, history: {} } } });
  if (!res.ok) throw new Error(res.message);
  onProgress({ phase: "done", files: done, totalFiles: files.length, bytes, totalBytes });
  return projectId;
}
