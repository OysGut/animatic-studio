/**
 * Bakgrunnsoppgradering av eldre bilder (B-105a): versjoner uten proxy/miniatyr får avledede filer
 * første gang de vises, uten at visningen blokkeres. Originalen røres ikke. Resultatet lagres med
 * kommandoen SetAssetVersionDerived (kan angres som vanlig prosjektdata).
 */
import type { AssetVersion, Command, DerivedImageFile, DerivedImageFiles, ProjectState } from "@/core";
import { ingestImage } from "@/adapters/browser/image-ingest";
import { ASSET_BUCKET, downloadFile } from "@/adapters/browser/storage-files";
import { t } from "@/core/i18n/keyed";
import { safeFileName, uploadDerivedImage } from "./asset-images";

type RunAndWait = (c: Command, label: string, group?: string) => Promise<{ error: string | null }>;

/** Versjoner som oppgraderes akkurat nå (én jobb per versjon, også på tvers av visninger). */
const pending = new Set<string>();

async function backfillOne(
  runAndWait: RunAndWait,
  state: ProjectState,
  projectId: string,
  version: AssetVersion,
  frame: { width: number; height: number } | null,
): Promise<void> {
  const variant = state.assetVariants[version.variantId];
  if (!variant) return;
  const { data, error } = await downloadFile(ASSET_BUCKET, version.mediaPath);
  if (error || !data) return;
  const name = version.mediaPath.split("/").pop() ?? "bilde";
  const file = new File([data], name, { type: version.mimeType });
  const ingest = await ingestImage(
    file,
    { frameWidth: frame?.width ?? 0, frameHeight: frame?.height ?? 0 },
    null,
  );
  const base = safeFileName(name).replace(/\.[A-Za-z0-9]{1,5}$/, "") || "bilde";
  const longerSide = Math.max(ingest.dimensions.width, ingest.dimensions.height);
  const derived: {
    -readonly [K in keyof DerivedImageFiles]: DerivedImageFile;
  } = {};
  const jobs: Promise<void>[] = [];
  if (ingest.working !== ingest.decoded && ingest.working.size !== ingest.decoded.size)
    jobs.push(
      uploadDerivedImage(projectId, variant.assetId, version.id, ingest.working, `${base}-arbeidskopi`).then(
        (d) => {
          derived.working = d;
        },
      ),
    );
  if (longerSide > Math.max(ingest.plan.proxy.width, ingest.plan.proxy.height))
    jobs.push(
      uploadDerivedImage(projectId, variant.assetId, version.id, ingest.proxy, `${base}-proxy.webp`).then(
        (d) => {
          derived.proxy = d;
        },
      ),
    );
  if (longerSide > Math.max(ingest.plan.thumbnail.width, ingest.plan.thumbnail.height))
    jobs.push(
      uploadDerivedImage(projectId, variant.assetId, version.id, ingest.thumbnail, `${base}-miniatyr.webp`).then(
        (d) => {
          derived.thumbnail = d;
        },
      ),
    );
  await Promise.all(jobs);
  if (!derived.working && !derived.proxy && !derived.thumbnail) return;
  await runAndWait(
    { type: "SetAssetVersionDerived", versionId: version.id as never, derived },
    t("app-library-derived-backfill.label"),
  );
}

/**
 * Start oppgradering av bildene som mangler proxy/miniatyr. Returnerer med en gang; arbeidet skjer i
 * bakgrunnen og feil svelges (oppgraderingen prøves igjen neste gang bildet vises).
 */
export function ensureDerivedFiles(
  runAndWait: RunAndWait,
  state: ProjectState,
  projectId: string,
  versions: readonly AssetVersion[],
  frame: { width: number; height: number } | null,
): void {
  for (const v of versions) {
    if (!v.mimeType.startsWith("image/") || v.derivedFiles?.proxy || pending.has(v.id)) continue;
    pending.add(v.id);
    void backfillOne(runAndWait, state, projectId, v, frame)
      .catch(() => {})
      .finally(() => pending.delete(v.id));
  }
}
