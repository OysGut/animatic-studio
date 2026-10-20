/**
 * Last ned og last opp igjen (ønske fra Mars 11.10.2026, DEC-0064, REQ-0588).
 *
 * Hvert bilde i biblioteket lastes ned med et fast navn: «Ressurs - Variant - vN.png» (løpenummeret er
 * versjonsnummeret i prosjektet). Lastes en fil med samme navn opp igjen (f.eks. etter egne endringer i et
 * tegneprogram), kjenner programmet den igjen og spør om den skal
 * - **erstatte** versjonen: filen blir en ny versjon (neste nummer), og alt som brukte den gamle – godkjenningen,
 *   lag i 2D-scenene (eget bilde, bildeskifter, bilder per språk) og plakater – bruker den nye. Den gamle
 *   versjonen tas vare på (historikk, angring), eller
 * - **legges til**: filen blir en ny versjon ved siden av, med eget nummer og merknad om hvor den kom fra.
 */
import type { AssetVersion, ImageSwap, LanguageImage, ProjectState } from "../model";
import type { Command } from "../commands/types";
import { layerFieldsOf } from "../composition";
import { versionFileBase } from "./file-names";


export { versionFileBase, versionFileName } from "./file-names";
import { layerVersions } from "../composition/render";
import { t as tk } from "@/core/i18n/keyed";

/** Sammenligningsnøkkel: små bokstaver, NFC (macOS lagrer filnavn som NFD). */
const key = (t: string) => t.normalize("NFC").toLocaleLowerCase("nb").replace(/\s+/g, " ").trim();

/**
 * Versjonen en opplastet fil kommer fra, ut fra filnavnet (null: ukjent). Filtypen kan være en annen
 * (lagret som JPEG i stedet for PNG), og nettleserens tillegg ved dobbel nedlasting («… v3 (1).png»,
 * «… v3-1.png», «… v3 2.png») godtas.
 */
export function versionFromFileName(s: ProjectState, fileName: string): AssetVersion | null {
  const noExt = fileName.replace(/\.[a-z0-9]{2,5}$/i, "");
  // «(godkjent)» fra zip-nedlastingen og nettleserens tillegg ved dobbel nedlasting godtas
  const m = /^(.* - v\d+)(?: \(godkjent\))?(?:\s*\(\d+\)|[ -]\d+)?$/i.exec(
    noExt.normalize("NFC").trim(),
  );
  if (!m) return null;
  const wanted = key(m[1]!);
  const hits = Object.values(s.assetVersions).filter((v) => {
    const b = versionFileBase(s, v);
    return b !== null && key(b) === wanted;
  });
  // Samme navn to steder (to ressurser med samme navn og variant): ikke gjett
  return hits.length === 1 ? hits[0]! : null;
}

/** Merknaden på den nye versjonen. */
export function reuploadNote(old: AssetVersion, mode: "replace" | "add"): string {
  return mode === "replace"
    ? tk("core-library-reupload.reupload-note.message.7884245562fe", { number: String(old.number) })
    : tk("core-library-reupload.reupload-note.message.d8143e264cee", { number: String(old.number) });
}

/** Hvor en versjon er i bruk (for spørsmålet til brukeren). */
export function versionUse(
  s: ProjectState,
  versionId: string,
): { approved: boolean; layers: number; posters: number } {
  const v = s.assetVersions[versionId];
  const va = v ? s.assetVariants[v.variantId] : undefined;
  const uses = (img: { versionId: string | null } | undefined) => img?.versionId === versionId;
  // Lag som viser versjonen nå: låst til den, eller følger varianten og den er godkjent/nyest
  const layers = Object.values(s.layers).filter(
    (l) =>
      !l.removed &&
      (layerVersions(s, l).some((x) => x.id === versionId) || (l.languageImages ?? []).some(uses)),
  ).length;
  const posters = Object.values(s.posters).filter(
    (p) => !p.removed && p.document.elements.some((e) => e.versionId === versionId),
  ).length;
  return { approved: va?.approvedVersionId === versionId, layers, posters };
}

/**
 * Kommandoene som lar en ny versjon ta over for en gammel overalt (etter at den nye er lagt til med
 * AddAssetVersion): godkjenningen, lag som er låst til den gamle (eget bilde, bildeskifter, bilder per
 * språk) og plakater. Lag som følger varianten, får den nye automatisk når den godkjennes eller er nyest.
 */
export function replaceVersionCommands(
  s: ProjectState,
  oldVersionId: string,
  newVersionId: string,
): Command[] {
  const old = s.assetVersions[oldVersionId];
  if (!old) return [];
  const out: Command[] = [];
  const va = s.assetVariants[old.variantId];
  if (va?.approvedVersionId === oldVersionId)
    out.push({ type: "ApproveAssetVersion", variantId: va.id, versionId: newVersionId as never });
  const swap = <T extends ImageSwap | LanguageImage>(img: T): T =>
    img.versionId === oldVersionId ? { ...img, versionId: newVersionId as never } : img;
  const layers = Object.values(s.layers)
    .filter(
      (l) =>
        l.versionId === oldVersionId ||
        l.swaps.some((w) => w.versionId === oldVersionId) ||
        (l.languageImages ?? []).some((w) => w.versionId === oldVersionId),
    )
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((l) => {
      const f = layerFieldsOf(l);
      return {
        layerId: l.id,
        fields: {
          ...f,
          versionId: (f.versionId === oldVersionId ? newVersionId : f.versionId) as never,
          swaps: f.swaps.map(swap),
          ...(f.languageImages ? { languageImages: f.languageImages.map(swap) } : {}),
        },
      };
    });
  if (layers.length) out.push({ type: "UpdateLayers", layers });
  for (const p of Object.values(s.posters).sort((a, b) => a.id.localeCompare(b.id))) {
    if (!p.document.elements.some((e) => e.versionId === oldVersionId)) continue;
    out.push({
      type: "UpdatePoster",
      posterId: p.id,
      fields: {
        productionId: p.productionId,
        name: p.name,
        kind: p.kind,
        language: p.language,
        widthMm: p.widthMm,
        heightMm: p.heightMm,
        document: {
          ...p.document,
          elements: p.document.elements.map((e) =>
            e.versionId === oldVersionId ? { ...e, versionId: newVersionId as never } : e,
          ),
        },
      },
    });
  }
  return out;
}
