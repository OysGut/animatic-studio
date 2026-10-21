/**
 * Manussider for en produksjon (mandat 4.5): aktive scener i produksjonsrekkefølge, brutt i sider.
 * «Låste sider» følger originalens sideskift for importert tekst (bransjepraksis når produksjonen er i gang);
 * ny eller flyttet tekst flyter fritt.
 */
import type { ProjectState } from "../model";
import { scriptView } from "../views";
import {
  formatHeading,
  paginate,
  US_LETTER_LAYOUT,
  type PageLayout,
  type Pagination,
  type PaginationScene,
} from "./paginate";

export interface ScriptPagesOptions {
  readonly lockedPages?: boolean;
  readonly layout?: PageLayout;
}

/** Markøren i manusvisningen for tittel-, tekst- og rulletekstscener (MTS MT6). Aldri nummerert. */
export function markerText(marker: "title" | "text" | "credits"): string {
  return marker === "title" ? "[FILMTITTEL]" : marker === "text" ? "[MELLOMTEKST]" : "[RULLETEKST]"; // i18n-ignore – manusets formatord
}

/**
 * Første side i originalen (REQ-0037): laveste kildeside blant alle importerte blokker i prosjektet, også
 * deaktiverte og slettede. Låste sider følger da blokkens egen side og flytter seg ikke når scener byttes om,
 * deaktiveres, slettes eller settes inn (før: laveste side blant de aktive scenene).
 */
export function lockedPageOffset(s: ProjectState): number {
  let minPage = Infinity;
  for (const b of Object.values(s.blocks)) if (b.sourceRef) minPage = Math.min(minPage, b.sourceRef.page);
  return Number.isFinite(minPage) ? minPage - 1 : 0;
}

/** Siden en scene begynner på i originalen: laveste kildeside blant scenens blokker (uavhengig av rekkefølgen). */
export function sceneSourcePage(
  blocks: readonly { readonly sourceRef: { readonly page: number } | null }[],
): number | undefined {
  let p = Infinity;
  for (const b of blocks) if (b.sourceRef) p = Math.min(p, b.sourceRef.page);
  return Number.isFinite(p) ? p : undefined;
}

export function scriptPaginationInput(
  s: ProjectState,
  productionId: string,
  opts: ScriptPagesOptions = {},
): PaginationScene[] {
  const view = scriptView(s, productionId);
  const offset = opts.lockedPages ? lockedPageOffset(s) : 0;
  const locked = (page: number | undefined) =>
    opts.lockedPages && page !== undefined ? { lockedPage: page - offset } : {};
  return view.map((sc) => ({
    occurrenceId: sc.occurrenceId,
    number: sc.productionNumber,
    headingText: sc.marker ? markerText(sc.marker) : formatHeading(sc.heading),
    ...locked(sceneSourcePage(sc.blocks)),
    blocks: sc.blocks.map((b) => ({
      id: b.id,
      kind: b.kind,
      text: b.text,
      ...locked(b.sourceRef?.page),
    })),
  }));
}

export function scriptPages(
  s: ProjectState,
  productionId: string,
  opts: ScriptPagesOptions = {},
): Pagination {
  return paginate(scriptPaginationInput(s, productionId, opts), opts.layout ?? US_LETTER_LAYOUT);
}
