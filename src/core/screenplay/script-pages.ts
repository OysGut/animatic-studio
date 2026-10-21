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

/** Kildereferansen til en blokk slik låste sider trenger den. */
export interface LockedSourceRef {
  readonly page: number;
  /** Det importerte originaldokumentet (SHA-256 av filen, samme som imported_documents.sha256). */
  readonly documentId?: string;
}

/** Eldre blokker uten dokument-ID regnes som ett felles dokument (fallback for gamle prosjekter). */
const LEGACY_DOCUMENT = "";

/** Gjør en kildeside om til en låst side. undefined = blokken har ingen kildeside. */
export type LockedPageMapper = (ref: LockedSourceRef | null | undefined) => number | undefined;

/**
 * Låste sider per originaldokument (REQ-0037). Hvert importert dokument har sitt eget sidenummerrom; det
 * begynner på laveste kildeside blant alle blokkene fra dokumentet (også deaktiverte og slettede), og
 * dokumentene følger etter hverandre i importrekkefølgen (laveste blokk-ID, tidsordnet). Dokument B sin side 1
 * kolliderer derfor ikke med dokument A sin side 1, og sidene flytter seg ikke når scener byttes om,
 * deaktiveres, slettes eller settes inn. Prosjekter med bare ett dokument eller bare eldre blokker uten
 * dokument-ID får nøyaktig samme sider som før (side − laveste side + 1).
 */
export function lockedPageMapper(s: ProjectState): LockedPageMapper {
  const groups = new Map<string, { min: number; max: number; first: string }>();
  for (const b of Object.values(s.blocks)) {
    const ref = b.sourceRef as LockedSourceRef | null;
    if (!ref) continue;
    const key = ref.documentId ?? LEGACY_DOCUMENT;
    const g = groups.get(key);
    if (!g) groups.set(key, { min: ref.page, max: ref.page, first: b.id });
    else {
      g.min = Math.min(g.min, ref.page);
      g.max = Math.max(g.max, ref.page);
      if (b.id < g.first) g.first = b.id;
    }
  }
  const ordered = [...groups.entries()].sort((a, b) => (a[1].first < b[1].first ? -1 : a[1].first > b[1].first ? 1 : 0));
  const base = new Map<string, number>();
  let next = 0;
  for (const [key, g] of ordered) {
    base.set(key, next - (g.min - 1));
    next += g.max - g.min + 1;
  }
  return (ref) => {
    if (!ref) return undefined;
    const b = base.get(ref.documentId ?? LEGACY_DOCUMENT);
    return b === undefined ? ref.page : ref.page + b;
  };
}

/**
 * Første side i originalen når prosjektet har ett dokument: laveste kildeside blant alle importerte blokker.
 * Beholdt for eldre kall; låste sider bruker lockedPageMapper, som skiller dokumentene.
 */
export function lockedPageOffset(s: ProjectState): number {
  let minPage = Infinity;
  for (const b of Object.values(s.blocks)) if (b.sourceRef) minPage = Math.min(minPage, b.sourceRef.page);
  return Number.isFinite(minPage) ? minPage - 1 : 0;
}

/**
 * Siden en scene begynner på: laveste (låste) side blant scenens blokker, uavhengig av rekkefølgen.
 * Uten mapper brukes kildesiden direkte.
 */
export function sceneSourcePage(
  blocks: readonly { readonly sourceRef: LockedSourceRef | null }[],
  map: LockedPageMapper = (r) => r?.page,
): number | undefined {
  let p = Infinity;
  for (const b of blocks) {
    const m = map(b.sourceRef);
    if (m !== undefined) p = Math.min(p, m);
  }
  return Number.isFinite(p) ? p : undefined;
}

export function scriptPaginationInput(
  s: ProjectState,
  productionId: string,
  opts: ScriptPagesOptions = {},
): PaginationScene[] {
  const view = scriptView(s, productionId);
  const map = lockedPageMapper(s);
  const locked = (page: number | undefined) =>
    opts.lockedPages && page !== undefined ? { lockedPage: page } : {};
  return view.map((sc) => ({
    occurrenceId: sc.occurrenceId,
    number: sc.productionNumber,
    headingText: sc.marker ? markerText(sc.marker) : formatHeading(sc.heading),
    ...locked(sceneSourcePage(sc.blocks, map)),
    blocks: sc.blocks.map((b) => ({
      id: b.id,
      kind: b.kind,
      text: b.text,
      ...locked(map(b.sourceRef)),
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
