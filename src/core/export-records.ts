import { SOURCE_TEXT_KEY } from "./dialogue/languages";
/**
 * Eksportlogg (REQ-0037 «eksportversjon», mandat 3.2 og 5.2; migrasjon 0028): hver fullførte eksport får en
 * permanent ID med produksjon, type, innstillinger, filnavn, scenene som var med, hvem og når. Raden lagres
 * etter at filen er laget og endres aldri. Eksporten selv endrer ingenting i prosjektet (REQ-0085).
 */

import { t, tLocalized } from "@/core/i18n/keyed";

export const EXPORT_KINDS = ["film", "script", "audio", "subtitles", "poster"] as const;
export type ExportKind = (typeof EXPORT_KINDS)[number];

export const EXPORT_KIND_LABEL: Record<ExportKind, string> = tLocalized({ film: "core-export-records.export-kind-label.film.811601c84f2d", script: "core-export-records.export-kind-label.script.c898115de018", audio: "core-export-records.export-kind-label.audio.10319e1f9218", subtitles: "core-export-records.export-kind-label.subtitles.97599c1409e6", poster: "core-export-records.export-kind-label.poster.4075a2784752" });

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
    throw new Error(t("core-export-records.normalize-export-record.message.8135aeee283d"));
  const fileName = typeof x.fileName === "string" ? x.fileName.trim() : "";
  if (!fileName || fileName.length > 300)
    throw new Error(t("core-export-records.normalize-export-record.message.c5525d17bc65"));
  if (typeof x.productionId !== "string" || !UUID.test(x.productionId))
    throw new Error(t("core-export-records.normalize-export-record.message.969a6792a5c9"));
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
    else if (k === "qualityProfileSnapshot" && typeof v === "string" && v.length <= 5000) settings[k] = v;
    else if (Array.isArray(v) && v.length <= 50 && v.every((s) => typeof s === "string"))
      settings[k] = [...(v as readonly string[])];
  }
  if (JSON.stringify(settings).length > MAX_EXPORT_SETTINGS_CHARS)
    throw new Error(t("core-export-records.normalize-export-record.message.5ba06df3bd6a"));
  const ids = [...new Set(x.occurrenceIds ?? [])];
  if (ids.some((id) => typeof id !== "string" || !UUID.test(id)))
    throw new Error(t("core-export-records.normalize-export-record.message.c604b192c997"));
  if (ids.length > MAX_EXPORT_SCENES) throw new Error(t("core-export-records.normalize-export-record.message.9c37d64b2e7a"));
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
  if (s["size"] === "half") parts.push(t("core-export-records.describe-export-settings.parts-push.4517c46dee3c"));
  else if (s["size"] === "full") parts.push(t("core-export-records.describe-export-settings.parts-push.c4b5cd2d5210"));
  if (typeof s["width"] === "number" && typeof s["height"] === "number")
    parts.push(`${s["width"]}×${s["height"]}`);
  if (s["monochrome"] === true) parts.push(t("core-export-records.describe-export-settings.parts-push.afd863bfe823"));
  if (typeof s["numbering"] === "string")
    parts.push(t("core-export-records.describe-export-settings.parts-push.3832d2ecc9eb", { value1: String(s["numbering"]) }));
  if (typeof s["language"] === "string" && s["language"] !== SOURCE_TEXT_KEY)
    parts.push(t("core-export-records.describe-export-settings.parts-push.197857d64b78", { value1: String(s["language"]) }));
  if (s["subtitles"] === true) parts.push(t("core-export-records.describe-export-settings.parts-push.97c3415c7fc1"));
  if (s["withNotes"] === true) parts.push(t("core-export-records.describe-export-settings.parts-push.16fe725d1217"));
  if (r.occurrenceIds.length)
    parts.push(
      t("core-export-records.scenes", { count: r.occurrenceIds.length }),
    );
  if (typeof s["qualityProfileName"] === "string") parts.push(t("core-export-records.describe-export-settings.parts-push.5eb68c2ddf11", { value1: String(s["qualityProfileName"]) }));
  return parts.join(" · ");
}
