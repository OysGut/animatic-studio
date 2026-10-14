/**
 * Eksportlogg (REQ-0037 «eksportversjon», mandat 3.2 og 5.2; migrasjon 0028): hver fullførte eksport får en
 * permanent ID med produksjon, type, innstillinger, filnavn, scenene som var med, hvem og når. Raden lagres
 * etter at filen er laget og endres aldri. Eksporten selv endrer ingenting i prosjektet (REQ-0085).
 */

import { L, localized } from "./i18n";

export const EXPORT_KINDS = ["film", "script", "audio", "subtitles", "poster"] as const;
export type ExportKind = (typeof EXPORT_KINDS)[number];

export const EXPORT_KIND_LABEL: Record<ExportKind, string> = localized({
  film: ["Film", "Film"],
  script: ["Manus", "Script"],
  audio: ["Lyd", "Audio"],
  subtitles: ["Undertekster", "Subtitles"],
  poster: ["Plakat", "Poster"],
});

/** Høyst så mange scener lagres per eksport (samme grense i databasen). */
export const MAX_EXPORT_SCENES = 5000;
/** Høyeste størrelse på innstillingene (tegn i JSON); databasen tillater litt mer. */
export const MAX_EXPORT_SETTINGS_CHARS = 6000;

/** Innstillinger som lagres: enkle verdier (tekst, tall, ja/nei, null) eller lister av tekst. */
export type ExportSettingValue = string | number | boolean | null | readonly string[];
export type ExportRecordSettings = Readonly<Record<string, ExportSettingValue>>;

export interface NewExportRecord {
  readonly productionId: string;
  readonly kind: ExportKind;
  readonly fileName: string;
  readonly settings: ExportRecordSettings;
  readonly occurrenceIds: readonly string[];
}

export interface ExportRecord extends NewExportRecord {
  readonly id: string;
  readonly createdAt: string;
  readonly createdBy: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Kontrollerer og rydder en ny eksportrad: kjent type, filnavn (1–300 tegn), innstillinger med enkle
 * verdier (andre utelates), unike scene-ID-er. Kaster ved ugyldige verdier.
 */
export function normalizeExportRecord(x: NewExportRecord): NewExportRecord {
  if (!EXPORT_KINDS.includes(x.kind))
    throw new Error(L("Ukjent eksporttype", "Unknown export type"));
  const fileName = typeof x.fileName === "string" ? x.fileName.trim() : "";
  if (!fileName || fileName.length > 300)
    throw new Error(L("Ugyldig filnavn", "Invalid file name"));
  if (typeof x.productionId !== "string" || !UUID.test(x.productionId))
    throw new Error(L("Ugyldig produksjon", "Invalid production"));
  const settings: Record<string, ExportSettingValue> = {};
  for (const [k, v] of Object.entries(x.settings ?? {})) {
    if (k.length > 60) continue;
    if (
      v === null ||
      typeof v === "boolean" ||
      (typeof v === "number" && Number.isFinite(v)) ||
      (typeof v === "string" && v.length <= 300)
    )
      settings[k] = v;
    else if (Array.isArray(v) && v.length <= 50 && v.every((s) => typeof s === "string"))
      settings[k] = [...(v as readonly string[])];
  }
  if (JSON.stringify(settings).length > MAX_EXPORT_SETTINGS_CHARS)
    throw new Error(L("For mange eksportinnstillinger", "Too many export settings"));
  const ids = [...new Set(x.occurrenceIds ?? [])];
  if (ids.some((id) => typeof id !== "string" || !UUID.test(id)))
    throw new Error(L("Ugyldig scene-ID", "Invalid scene ID"));
  if (ids.length > MAX_EXPORT_SCENES) throw new Error(L("For mange scener", "Too many scenes"));
  return { productionId: x.productionId, kind: x.kind, fileName, settings, occurrenceIds: ids };
}

/** Fra databaserad; null hvis raden ikke kan leses. */
export function exportRecordFromRow(row: Readonly<Record<string, unknown>>): ExportRecord | null {
  const kind = row["kind"];
  if (typeof row["id"] !== "string" || !EXPORT_KINDS.includes(kind as ExportKind)) return null;
  const s = row["settings"];
  const ids = row["occurrence_ids"];
  return {
    id: row["id"],
    productionId: String(row["production_id"] ?? ""),
    kind: kind as ExportKind,
    fileName: String(row["file_name"] ?? ""),
    settings: s && typeof s === "object" && !Array.isArray(s) ? (s as ExportRecordSettings) : {},
    occurrenceIds: Array.isArray(ids) ? ids.map(String) : [],
    createdAt: String(row["created_at"] ?? ""),
    createdBy: typeof row["created_by"] === "string" ? row["created_by"] : null,
  };
}

/** Kort beskrivelse av innstillingene for listen «Tidligere eksporter». */
export function describeExportSettings(
  r: Pick<ExportRecord, "settings" | "occurrenceIds">,
): string {
  const s = r.settings;
  const parts: string[] = [];
  if (typeof s["format"] === "string") parts.push(String(s["format"]).toUpperCase());
  if (s["size"] === "half") parts.push(L("halv størrelse", "half size"));
  else if (s["size"] === "full") parts.push(L("full størrelse", "full size"));
  if (typeof s["width"] === "number" && typeof s["height"] === "number")
    parts.push(`${s["width"]}×${s["height"]}`);
  if (s["monochrome"] === true) parts.push(L("svart-hvitt", "black and white"));
  if (typeof s["numbering"] === "string")
    parts.push(L(`nummerering: ${s["numbering"]}`, `numbering: ${s["numbering"]}`));
  if (typeof s["language"] === "string" && s["language"] !== "nb")
    parts.push(L(`språk: ${s["language"]}`, `language: ${s["language"]}`));
  if (s["subtitles"] === true) parts.push(L("med undertekster", "with subtitles"));
  if (s["withNotes"] === true) parts.push(L("med notater", "with notes"));
  if (r.occurrenceIds.length)
    parts.push(
      L(
        `${r.occurrenceIds.length} ${r.occurrenceIds.length === 1 ? "scene" : "scener"}`,
        `${r.occurrenceIds.length} ${r.occurrenceIds.length === 1 ? "scene" : "scenes"}`,
      ),
    );
  return parts.join(" · ");
}
