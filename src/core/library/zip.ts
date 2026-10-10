/**
 * Innholdet i en zip-fil med prosjektets ressurser (DEC-0046): én mappe per kategori (ressurstype, og
 * importert film), én mappe per ressurs og variant, og hver versjon med nummer og originalt filnavn.
 * Ren funksjon: filene hentes og pakkes av src/engine/export/zip.ts.
 */
import type { AssetKind, ProjectState } from "../model";
import { ASSET_KIND_PLURAL } from "./index";

/** Kategori i zip-filen: en ressurstype, eller «film» for importert film. */
export type ZipCategory = AssetKind | "film";

export const ZIP_CATEGORY_LABEL: Record<ZipCategory, string> = {
  ...ASSET_KIND_PLURAL,
  film: "Importert film",
};

export const ZIP_CATEGORY_ORDER: readonly ZipCategory[] = [
  "character",
  "animal",
  "object",
  "location",
  "environment",
  "other",
  "sound",
  "film",
];

export interface ZipEntry {
  readonly category: ZipCategory;
  /** Sti inne i zip-filen. */
  readonly path: string;
  /** Sti i lagringsbøtta «assets». */
  readonly mediaPath: string;
  readonly byteSize: number;
}

/** Navn som fungerer som mappe- og filnavn på alle systemer (æøå beholdes). */
export function zipSafeName(name: string, fallback = "uten navn"): string {
  const clean = name
    .normalize("NFC")
    .replace(/[<>:"/\\|?*]+/g, "_")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f]+/g, "_")
    .replace(/\s+/g, " ")
    .replace(/^[\s.]+|[\s.]+$/g, "")
    .slice(0, 80);
  return clean || fallback;
}

function baseName(path: string): string {
  return path.split("/").pop() ?? path;
}

/** Alle filene i zip-filen, sortert etter kategori og navn. Like navn får løpenummer. */
export function zipEntries(s: ProjectState): ZipEntry[] {
  const out: ZipEntry[] = [];
  const used = new Set<string>();
  const unique = (p: string) => {
    if (!used.has(p.toLowerCase())) {
      used.add(p.toLowerCase());
      return p;
    }
    const dot = p.lastIndexOf(".");
    const stem = dot > p.lastIndexOf("/") ? p.slice(0, dot) : p;
    const ext = dot > p.lastIndexOf("/") ? p.slice(dot) : "";
    for (let i = 2; ; i++) {
      const q = `${stem} (${i})${ext}`;
      if (!used.has(q.toLowerCase())) {
        used.add(q.toLowerCase());
        return q;
      }
    }
  };
  const assets = Object.values(s.assets).sort((a, b) => a.name.localeCompare(b.name, "nb"));
  for (const a of assets) {
    const variants = Object.values(s.assetVariants)
      .filter((v) => v.assetId === a.id)
      .sort((x, y) => x.name.localeCompare(y.name, "nb"));
    for (const v of variants) {
      const versions = Object.values(s.assetVersions)
        .filter((x) => x.variantId === v.id)
        .sort((x, y) => x.number - y.number);
      for (const ver of versions) {
        const folder = `${ZIP_CATEGORY_LABEL[a.kind]}/${zipSafeName(a.name)}/${zipSafeName(v.name, "variant")}`;
        const approved = v.approvedVersionId === ver.id ? " (godkjent)" : "";
        out.push({
          category: a.kind,
          path: unique(
            `${folder}/v${ver.number}${approved} – ${zipSafeName(baseName(ver.mediaPath), "fil")}`,
          ),
          mediaPath: ver.mediaPath,
          byteSize: ver.byteSize,
        });
      }
    }
  }
  const takes = Object.values(s.takes)
    .filter((t) => t.kind === "imported_film" && t.mediaRef)
    .sort((a, b) => a.id.localeCompare(b.id));
  for (const t of takes) {
    const occ = s.occurrences[t.occurrenceId];
    const scene = occ?.productionNumber ? `Scene ${occ.productionNumber}` : "Scene";
    out.push({
      category: "film",
      path: unique(
        `${ZIP_CATEGORY_LABEL.film}/${zipSafeName(scene)} – ${zipSafeName(t.media?.fileName ?? baseName(t.mediaRef!), "film")}`,
      ),
      mediaPath: t.mediaRef!,
      byteSize: t.media?.byteSize ?? 0,
    });
  }
  const order = new Map(ZIP_CATEGORY_ORDER.map((c, i) => [c, i]));
  return out.sort(
    (x, y) => order.get(x.category)! - order.get(y.category)! || x.path.localeCompare(y.path, "nb"),
  );
}

/** Antall filer og samlet størrelse per kategori (bare kategorier som har filer). */
export function zipSummary(
  entries: readonly ZipEntry[],
): { category: ZipCategory; files: number; bytes: number }[] {
  const m = new Map<ZipCategory, { files: number; bytes: number }>();
  for (const e of entries) {
    const x = m.get(e.category) ?? { files: 0, bytes: 0 };
    x.files++;
    x.bytes += e.byteSize;
    m.set(e.category, x);
  }
  return ZIP_CATEGORY_ORDER.filter((c) => m.has(c)).map((c) => ({ category: c, ...m.get(c)! }));
}
