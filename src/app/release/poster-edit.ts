/**
 * Små hjelpere for redigering av plakater (DEC-0061): lagring som kommando, ny komposisjon når innholdet
 * endres, og endring av ett element (som da blir «brukerens», `auto: false`, og står ved ny komposisjon).
 */
import {
  layoutPoster,
  posterLanguages,
  type Poster,
  type PosterDocument,
  type PosterElement,
  type ProjectState,
} from "@/core";
import type { Commands } from "@/app/project/use-commands";

export type PosterPatch = Partial<
  Pick<Poster, "name" | "kind" | "language" | "widthMm" | "heightMm" | "document">
>;

/** Lagrer plakaten (alle felt). Gir feilmelding eller null. */
export function savePoster(
  cmds: Commands,
  poster: Poster,
  patch: PosterPatch,
  label: string,
  group?: string,
): string | null {
  return cmds.run(
    {
      type: "UpdatePoster",
      posterId: poster.id,
      fields: {
        productionId: poster.productionId,
        name: patch.name ?? poster.name,
        kind: patch.kind ?? poster.kind,
        language: patch.language ?? poster.language,
        widthMm: patch.widthMm ?? poster.widthMm,
        heightMm: patch.heightMm ?? poster.heightMm,
        document: patch.document ?? poster.document,
      },
    },
    label,
    group,
  );
}

/** Ny komposisjon etter endret innhold, format eller type. Brukerens endringer står. */
export function relayout(
  s: ProjectState,
  poster: Poster,
  doc: PosterDocument,
  over?: Partial<Pick<Poster, "kind" | "widthMm" | "heightMm" | "language">>,
): PosterDocument {
  return layoutPoster(s, {
    languages: posterLanguages(s, over?.language ?? poster.language),
    kind: over?.kind ?? poster.kind,
    widthMm: over?.widthMm ?? poster.widthMm,
    heightMm: over?.heightMm ?? poster.heightMm,
    productionId: poster.productionId,
    document: doc,
  });
}

/** Dokumentet med ett element endret (blir brukerens). */
export function withElement(
  doc: PosterDocument,
  id: string,
  patch: Partial<PosterElement>,
): PosterDocument {
  return {
    ...doc,
    elements: doc.elements.map((e) => (e.id === id ? editElement(e, patch) : e)),
  };
}

/**
 * Elementet med endringen. Et element programmet laget, husker hvilke felt brukeren har endret
 * (`overrides`), så resten følger innholdet ved ny komposisjon. Egne elementer trenger ikke det.
 */
export function editElement(e: PosterElement, patch: Partial<PosterElement>): PosterElement {
  const keys = Object.keys(patch).filter((k) => k !== "auto" && k !== "overrides");
  if (e.role === "custom") return { ...e, ...patch, auto: false } as PosterElement;
  const overrides = [...new Set([...(e.overrides ?? []), ...keys])].sort();
  return { ...e, ...patch, auto: false, overrides } as PosterElement;
}

/** Elementet tilbake til programmets versjon (lages på nytt ved neste komposisjon). */
export function resetElement(e: PosterElement): PosterElement {
  const { overrides: _o, ...rest } = e;
  return { ...rest, auto: true };
}

/** Elementet som et tegnesteg hører til (relasjonens etikett har egne ID-er). */
export function elementIdOfOp(opId: string): string {
  return opId.replace(/:(bg|label)$/, "");
}

/** Elementene som ikke kan flyttes med musen (bakgrunnen). */
export function isLocked(e: PosterElement): boolean {
  return e.role === "background" || e.kind === "relation";
}

/**
 * Skalerer brukerens og egne elementer når formatet endres. Plasseringen følger hver akse; bilder og
 * skrift skaleres likt i begge retninger så de ikke forvrenges.
 */
export function scaleElements(doc: PosterDocument, fx: number, fy: number): PosterDocument {
  if (fx === 1 && fy === 1) return doc;
  const f = Math.min(fx, fy);
  return {
    ...doc,
    elements: doc.elements.map((e) => {
      if (e.auto) return e;
      const cx = (e.x + e.w / 2) * fx;
      const cy = (e.y + e.h / 2) * fy;
      const uniform = e.kind === "image";
      const w = uniform ? e.w * f : e.w * fx;
      const h = uniform ? e.h * f : e.h * fy;
      return {
        ...e,
        x: cx - w / 2,
        y: cy - h / 2,
        w,
        h,
        ...(e.size !== undefined ? { size: Math.max(1, Math.round(e.size * f * 4) / 4) } : {}),
        ...(e.strokeWidth !== undefined ? { strokeWidth: e.strokeWidth * f } : {}),
        ...(e.radius !== undefined ? { radius: e.radius * f } : {}),
      };
    }),
  };
}
