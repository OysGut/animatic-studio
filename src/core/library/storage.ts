/**
 * Lagringskategorier (DEC-0072, REQ-0415, REQ-0407): hva prosjektet består av, delt i redigerbare
 * prosjektdata, kildemedier, genererte mediefiler, midlertidige renderingsfiler, eksportfiler og historiske
 * versjoner – med antall og størrelse der den er kjent. Grunnlag for sikkerhetskopi og senere flytting.
 */
import type { ProjectState } from "../model";

import { versionsOf } from "./index";
import { storedCategoryOf } from "./storage-paths";
import { t as tk } from "@/core/i18n/keyed";

export type StorageCategory =
  "project" | "source" | "generated" | "temporary" | "export" | "history";

export interface StorageRow {
  readonly category: StorageCategory;
  readonly label: string;
  /** Antall objekter eller filer. */
  readonly count: number;
  /** Størrelse i byte, null når den ikke er kjent (data i databasen). */
  readonly bytes: number | null;
  readonly note: string;
}

export function storageOverview(
  s: ProjectState,
  /** Filer AI har laget (resultatstier fra AI-jobbene). */
  generatedPaths: ReadonlySet<string>,
): StorageRow[] {
  const projectObjects =
    Object.keys(s.scenes).length +
    Object.keys(s.variants).length +
    Object.keys(s.blocks).length +
    Object.keys(s.occurrences).length +
    Object.keys(s.compositions).length +
    Object.keys(s.layers).length +
    Object.keys(s.audioClips).length +
    Object.keys(s.clipParts).length +
    Object.keys(s.timeLinks).length +
    Object.keys(s.annotations).length +
    Object.keys(s.assets).length +
    Object.keys(s.assetVariants).length +
    Object.keys(s.translations).length +
    Object.keys(s.posters).length;

  // Gjeldende versjon per variant: godkjent, ellers nyeste. Andre er historikk.
  const current = new Set<string>();
  for (const va of Object.values(s.assetVariants)) {
    const c = va.approvedVersionId ?? versionsOf(s, va.id)[0]?.id;
    if (c) current.add(c);
  }
  // Versjoner som brukes direkte (låst i et lag eller som stillbilde) er også i bruk
  for (const l of Object.values(s.layers)) {
    if (l.versionId) current.add(l.versionId);
    for (const w of l.swaps) if (w.versionId) current.add(w.versionId);
    for (const x of l.languageImages ?? []) if (x.versionId) current.add(x.versionId);
  }
  const stillPaths = new Set(
    Object.values(s.takes)
      .filter((t) => t.kind === "still" && t.mediaRef)
      .map((t) => t.mediaRef!),
  );
  let src = { n: 0, b: 0 };
  let gen = { n: 0, b: 0 };
  let hist = { n: 0, b: 0 };
  for (const v of Object.values(s.assetVersions)) {
    const inUse = current.has(v.id) || stillPaths.has(v.mediaPath);
    if (!inUse) hist = { n: hist.n + 1, b: hist.b + v.byteSize };
    // Nye filer ligger i egen mappe per kategori (KI-178); eldre filer klassifiseres som før
    else if (
      storedCategoryOf(v.mediaPath) === "generated" ||
      (!storedCategoryOf(v.mediaPath) && generatedPaths.has(v.mediaPath))
    )
      gen = { n: gen.n + 1, b: gen.b + v.byteSize };
    else src = { n: src.n + 1, b: src.b + v.byteSize };
  }
  for (const t of Object.values(s.takes)) {
    if (!t.mediaRef || !t.media) continue;
    if (t.kind === "ai_video") gen = { n: gen.n + 1, b: gen.b + t.media.byteSize };
    else if (t.kind === "imported_film") src = { n: src.n + 1, b: src.b + t.media.byteSize };
  }
  return [
    {
      category: "project",
      label: tk("core-library-storage.label.label.4f9c479b6ba9"),
      count: projectObjects,
      bytes: null,
      note: tk("core-library-storage.note.note.fd1a9a99eba1"),
    },
    {
      category: "source",
      label: tk("core-library-storage.label.label.98afaee3796a"),
      count: src.n,
      bytes: src.b,
      note: tk("core-library-storage.note.note.c578417e9c94"),
    },
    {
      category: "generated",
      label: tk("core-library-storage.label.label.044d118681b1"),
      count: gen.n,
      bytes: gen.b,
      note: tk("core-library-storage.note.note.35d84008772d"),
    },
    {
      category: "temporary",
      label: tk("core-library-storage.label.label.761b9e2dcee5"),
      count: 0,
      bytes: 0,
      note: tk("core-library-storage.note.note.9a7c9943d358"),
    },
    {
      category: "export",
      label: tk("core-library-storage.label.label.06e2a434bf50"),
      count: 0,
      bytes: 0,
      note: tk("core-library-storage.note.note.f60c6db4789c"),
    },
    {
      category: "history",
      label: tk("core-library-storage.label.label.aacc66a13c42"),
      count: hist.n,
      bytes: hist.b,
      note: tk("core-library-storage.note.note.761d4dffb21a"),
    },
  ];
}
