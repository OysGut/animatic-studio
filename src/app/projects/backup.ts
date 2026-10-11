/**
 * Sikkerhetskopi i nettleseren (DEC-0049): hente alt som skal med, lage zip-filen, og gjenopprette fra en
 * zip-fil til et nytt prosjekt (filene lastes opp her, dataene skrives av serverfunksjonen restoreBackup).
 */
import {
  BACKUP_JSON,
  BACKUP_MAX_JSON_BYTES,
  BACKUP_README,
  backupIdMap,
  backupReadme,
  makeBackup,
  parseBackup,
  restoreFiles,
  validateBackup,
  type BackupData,
  type BackupFileCategory,
  type ProjectRows,
  type Row,
} from "@/core";
import {
  checkSchema,
  EXPECTED_SCHEMA_VERSION,
  fetchProjectTable,
  loadProjectRows,
} from "@/adapters/storage/project-rows";
import { restoreBackup } from "@/adapters/storage/backup.functions";
import { db } from "@/app/db";
import { supabase } from "@/integrations/supabase/client";
import { writeZip, type ZipProgress, type ZipSink } from "@/engine/export/zip";
import {
  readZipIndex,
  zipEntryBlob,
  zipEntryText,
  type ZipIndexEntry,
} from "@/engine/import/zip-read";

export interface BackupSource {
  readonly rows: ProjectRows;
  readonly scriptVersions: readonly Row[];
  readonly importedDocuments: readonly Row[];
  readonly changeLog: readonly Row[];
  readonly generationJobs: readonly Row[];
  readonly schemaVersion: number;
}

/** Alt prosjektet består av (det brukeren har lesetilgang til). */
export async function loadBackupSource(projectId: string): Promise<BackupSource> {
  const [rows, scriptVersions, importedDocuments, changeLog, generationJobs, schema] =
    await Promise.all([
      loadProjectRows(db, projectId),
      fetchProjectTable(db, "script_versions", projectId),
      fetchProjectTable(db, "imported_documents", projectId),
      fetchProjectTable(db, "change_log", projectId),
      fetchProjectTable(db, "generation_jobs", projectId),
      checkSchema(db),
    ]);
  return {
    rows,
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
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrls(list.slice(i, i + 200), 6 * 60 * 60);
    if (error) throw new Error(error.message);
    for (const d of data ?? []) if (d.path && d.signedUrl) out[`${bucket}:${d.path}`] = d.signedUrl;
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
  if (!key) throw new Error("Zip-filen er ikke en sikkerhetskopi fra Animatic Studio.");
  const prefix = key.slice(0, key.length - BACKUP_JSON.length);
  let raw: unknown;
  try {
    raw = JSON.parse(await zipEntryText(file, index.get(key)!));
  } catch {
    throw new Error("Sikkerhetskopien er skadet (dataene kan ikke leses).");
  }
  const backup = parseBackup(raw, EXPECTED_SCHEMA_VERSION);
  // Kontroller alt før noe opprettes eller lastes opp
  const size = new TextEncoder().encode(JSON.stringify({ ...backup, history: {} })).length;
  if (size > BACKUP_MAX_JSON_BYTES)
    throw new Error(
      "Sikkerhetskopien har for mye prosjektdata til å gjenopprettes her. Si ifra, så lager vi en løsning.",
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
    const { data, error } = await db.rpc("create_project", {
      p_name: name,
      p_fps_num: fps_num,
      p_fps_den: fps_den,
    });
    if (error) throw new Error(`Prosjektet kunne ikke opprettes (${error.message}).`);
    state.projectId = String(data);
  }
  const projectId = state.projectId;
  const { data: mains, error: mainError } = await db
    .from("productions")
    .select("id")
    .eq("project_id", projectId)
    .eq("kind", "main");
  if (mainError || !mains?.[0]) throw new Error("Det nye prosjektet mangler hovedfilm.");
  const map = await backupIdMap(backup, projectId, String((mains[0] as { id: string }).id));
  const files = restoreFiles(backup, map).filter((f) => index.has(prefix + f.zipPath));
  const totalBytes = files.reduce((n, f) => n + f.byteSize, 0);
  let bytes = files
    .filter((f) => state.uploaded.has(f.zipPath))
    .reduce((n, f) => n + f.byteSize, 0);
  let done = state.uploaded.size;
  for (const f of files) {
    if (state.uploaded.has(f.zipPath)) continue;
    if (signal?.aborted) throw new DOMException("Avbrutt", "AbortError");
    onProgress({ phase: "files", files: done, totalFiles: files.length, bytes, totalBytes });
    const blob = await zipEntryBlob(file, index.get(prefix + f.zipPath)!, f.mimeType);
    const { error } = await supabase.storage
      .from(f.bucket)
      .upload(f.path, blob, { ...(f.mimeType ? { contentType: f.mimeType } : {}), upsert: false });
    if (error && !/exists|duplicate/i.test(error.message))
      throw new Error(
        `Filen ${f.zipPath.split("/").pop()} kunne ikke lastes opp (${error.message}).`,
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
