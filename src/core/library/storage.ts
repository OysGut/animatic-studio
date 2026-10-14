/**
 * Lagringskategorier (DEC-0072, REQ-0415, REQ-0407): hva prosjektet består av, delt i redigerbare
 * prosjektdata, kildemedier, genererte mediefiler, midlertidige renderingsfiler, eksportfiler og historiske
 * versjoner – med antall og størrelse der den er kjent. Grunnlag for sikkerhetskopi og senere flytting.
 */
import type { ProjectState } from "../model";
import { L } from "../i18n";
import { versionsOf } from "./index";

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
    else if (generatedPaths.has(v.mediaPath)) gen = { n: gen.n + 1, b: gen.b + v.byteSize };
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
      label: L("Redigerbare prosjektdata", "Editable project data"),
      count: projectObjects,
      bytes: null,
      note: L(
        "Manus, scener, 2D-scener, lag, lyd- og klippdeler, koblinger, notater og ressursbeskrivelser i databasen.",
        "Script, scenes, 2D scenes, layers, audio and clip parts, links, notes and asset descriptions in the database.",
      ),
    },
    {
      category: "source",
      label: L("Kildemedier", "Source media"),
      count: src.n,
      bytes: src.b,
      note: L(
        "Bilder og lyd som er lastet opp, og importert film. Importerte manusfiler ligger i egen lagring.",
        "Images and audio that have been uploaded, and imported film. Imported script files are kept in separate storage.",
      ),
    },
    {
      category: "generated",
      label: L("Genererte mediefiler", "Generated media files"),
      count: gen.n,
      bytes: gen.b,
      note: L("Bilder, lyd og video laget med AI.", "Images, audio and video made with AI."),
    },
    {
      category: "temporary",
      label: L("Midlertidige renderingsfiler", "Temporary render files"),
      count: 0,
      bytes: 0,
      note: L(
        "Lages bare i nettleseren under avspilling og eksport, og lagres aldri i prosjektet.",
        "Only created in the browser during playback and export, and never saved in the project.",
      ),
    },
    {
      category: "export",
      label: L("Eksportfiler", "Export files"),
      count: 0,
      bytes: 0,
      note: L(
        "Lastes ned til maskinen din og lagres ikke i prosjektet. Innstillingene huskes per produksjon.",
        "Downloaded to your computer and not saved in the project. The settings are remembered per production.",
      ),
    },
    {
      category: "history",
      label: L("Historiske versjoner", "Historical versions"),
      count: hist.n,
      bytes: hist.b,
      note: L(
        "Eldre bildeversjoner som ikke brukes lenger. De slettes aldri automatisk. Manusversjoner og endringshistorikken ligger i databasen.",
        "Older image versions that are no longer used. They are never deleted automatically. Script versions and the change history are kept in the database.",
      ),
    },
  ];
}
