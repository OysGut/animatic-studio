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

export function scriptPaginationInput(
  s: ProjectState,
  productionId: string,
  opts: ScriptPagesOptions = {},
): PaginationScene[] {
  const view = scriptView(s, productionId);
  let minPage = Infinity;
  if (opts.lockedPages) {
    for (const sc of view)
      for (const b of sc.blocks) if (b.sourceRef) minPage = Math.min(minPage, b.sourceRef.page);
  }
  const offset = Number.isFinite(minPage) ? minPage - 1 : 0;
  const locked = (page: number | undefined) =>
    opts.lockedPages && page !== undefined ? { lockedPage: page - offset } : {};
  return view.map((sc) => ({
    occurrenceId: sc.occurrenceId,
    number: sc.productionNumber,
    headingText: formatHeading(sc.heading),
    ...locked(sc.blocks[0]?.sourceRef?.page),
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
