/**
 * Tittelsiden i de lagrede eksportinnstillingene (KI-20): lest ved import av manus og endret i
 * eksportdialogen. Lagres i productions.export_settings (jsonb, migrasjon 0027, maks 4096 byte), så den
 * kortes til grensen (`fitTitlePage`) og brukeren får beskjed når noe er kortet bort.
 */
import { DEFAULT_EXPORT_SETTINGS, fitTitlePage, type ProjectState } from "../model";
import type { ProductionId } from "../ids";
import type { Command } from "./types";

/** Tittelsiden som er lagret for produksjonen, eller null når den ikke er satt. */
export function savedTitlePage(s: ProjectState, productionId: string): readonly string[] | null {
  return s.productions[productionId]?.exportSettings?.titlePage ?? null;
}

/**
 * Kommandoen som lagrer tittelsiden for produksjonen. De andre eksportinnstillingene beholdes (eller får
 * standardverdiene når ingen er lagret). null når ingenting ville endret seg.
 */
export function titlePageCommand(
  s: ProjectState,
  productionId: string,
  lines: readonly string[],
): { readonly command: Command; readonly truncated: boolean } | null {
  const p = s.productions[productionId];
  if (!p) return null;
  const fit = fitTitlePage(lines);
  const prev = p.exportSettings?.titlePage;
  if (
    prev !== undefined &&
    prev.length === fit.lines.length &&
    prev.every((l, i) => l === fit.lines[i])
  )
    return null;
  const base = p.exportSettings ?? DEFAULT_EXPORT_SETTINGS;
  return {
    command: {
      type: "SetExportSettings",
      productionId: productionId as ProductionId,
      settings: {
        size: base.size,
        monochrome: base.monochrome,
        output: base.output,
        titlePage: fit.lines,
      },
    },
    truncated: fit.truncated,
  };
}
