/**
 * Eksportnummerering (mandat 5.2, REQ-0080–REQ-0086). Beregnes for hver eksport; endrer aldri prosjektet,
 * scene-ID-er eller produksjonsnumre (REQ-0085, INV-02).
 */
import type { ProjectState, SceneHeading } from "../model";
import { orderedOccurrences, blocksOfVariant } from "../views";
import { formatHeading, type PaginationScene } from "./paginate";

export type NumberingMethod = "continuous" | "production";

export interface NumberingOptions {
  readonly method: NumberingMethod;
  /** Ta med deaktiverte scener (REQ-0084). */
  readonly includeInactive: boolean;
  /**
   * Bevar produksjonsnummerering: hvilke scener uten nummer som får mellomnumre (42A, 42B).
   * «new» (standard) = bare scener som er laget i appen; scener som var unummerert i originalmanuset beholdes uten nummer.
   * «all» = alle; «none» = ingen.
   */
  readonly fillMissing?: "new" | "all" | "none";
  /** Tekst for utgåtte scener ved bevart nummerering (bransjens «OMITTED»). */
  readonly omittedText?: string;
}

export interface NumberedScene {
  readonly occurrenceId: string;
  readonly heading: SceneHeading;
  readonly active: boolean;
  /** Nummeret i produksjonen i dag (vises i forhåndsvisningen). */
  readonly productionNumber: string | null;
  /** Nummeret i eksporten (null = unummerert). */
  readonly exportNumber: string | null;
  /** Utgått scene: vises bare som «nummer UTGÅR» uten innhold. */
  readonly omitted: boolean;
}

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** Neste mellomnummer etter `base` som ikke er brukt: 42 → 42A, 42A → 42B, Z → ZA … */
export function nextInsertNumber(base: string | null, used: ReadonlySet<string>): string {
  if (base === null) {
    // Før første nummererte scene: A1, B1 …
    for (const l of LETTERS) if (!used.has(`${l}1`)) return `${l}1`;
    return "1";
  }
  const m = /^(.*?)([A-Z]*)$/.exec(base)!;
  const stem = m[1]!;
  let suffix = m[2]!;
  for (let guard = 0; guard < 100; guard++) {
    if (suffix === "") suffix = "A";
    else {
      const last = suffix[suffix.length - 1]!;
      const i = LETTERS.indexOf(last);
      suffix =
        i >= 0 && i < LETTERS.length - 1 ? suffix.slice(0, -1) + LETTERS[i + 1] : suffix + "A";
    }
    const cand = stem + suffix;
    if (!used.has(cand)) return cand;
  }
  return `${base}X`;
}

export function exportNumbering(
  s: ProjectState,
  productionId: string,
  opts: NumberingOptions,
): NumberedScene[] {
  const occs = orderedOccurrences(s, productionId).filter((o) => o.active || opts.includeInactive);
  const out: NumberedScene[] = [];
  if (opts.method === "continuous") {
    let n = 0;
    for (const o of occs) {
      const heading = s.variants[o.variantId]?.heading ?? { intExt: "", location: "", time: "" };
      out.push({
        occurrenceId: o.id,
        heading,
        active: o.active,
        productionNumber: o.productionNumber,
        exportNumber: o.active ? String(++n) : null,
        omitted: false,
      });
    }
    return out;
  }
  // Alle numre i produksjonen er opptatt – også deaktiverte scener sine, så et «UTGÅR»-nummer aldri gjenbrukes
  const used = new Set(
    orderedOccurrences(s, productionId)
      .map((o) => o.productionNumber)
      .filter((x): x is string => x !== null),
  );
  let prev: string | null = null;
  for (const o of occs) {
    const heading = s.variants[o.variantId]?.heading ?? { intExt: "", location: "", time: "" };
    let num = o.productionNumber;
    const fill = opts.fillMissing ?? "new";
    // Unummerert i originalmanuset = importert (kildereferanse) og ikke laget ved deling i appen
    const importedUnnumbered =
      s.scenes[o.sceneId]?.derivedFromSceneId == null &&
      blocksOfVariant(s, o.variantId).some((b) => b.sourceRef !== null);
    if (num === null && (fill === "all" || (fill === "new" && !importedUnnumbered))) {
      num = nextInsertNumber(prev, used);
      used.add(num);
    }
    if (num !== null) prev = num;
    out.push({
      occurrenceId: o.id,
      heading,
      active: o.active,
      productionNumber: o.productionNumber,
      exportNumber: num,
      omitted: !o.active,
    });
  }
  return out;
}

/** Inndata til sidebrytingen for eksport: nummerering, utgåtte scener og (valgfritt) låste sider. */
export function exportPaginationInput(
  s: ProjectState,
  productionId: string,
  opts: NumberingOptions & { readonly lockedPages?: boolean },
): PaginationScene[] {
  const numbered = exportNumbering(s, productionId, opts);
  let minPage = Infinity;
  if (opts.lockedPages) {
    // Bare scener som faktisk eksporteres med innhold (samme grunnlag som manusvisningen)
    for (const n of numbered) {
      if (n.omitted) continue;
      const occ = s.occurrences[n.occurrenceId]!;
      for (const b of blocksOfVariant(s, occ.variantId))
        if (b.sourceRef) minPage = Math.min(minPage, b.sourceRef.page);
    }
  }
  const offset = Number.isFinite(minPage) ? minPage - 1 : 0;
  const locked = (page: number | undefined) =>
    opts.lockedPages && page !== undefined ? { lockedPage: page - offset } : {};
  return numbered.map((n) => {
    const occ = s.occurrences[n.occurrenceId]!;
    if (n.omitted) {
      return {
        occurrenceId: n.occurrenceId,
        number: n.exportNumber,
        headingText: opts.omittedText ?? "UTGÅR",
        blocks: [],
      };
    }
    const blocks = blocksOfVariant(s, occ.variantId);
    const marker = !n.active
      ? [
          {
            id: `${n.occurrenceId}:deaktivert`,
            kind: "note" as const,
            text: "[DEAKTIVERT SCENE – IKKE MED I FILMEN]",
          },
        ]
      : [];
    return {
      occurrenceId: n.occurrenceId,
      number: n.exportNumber,
      headingText: formatHeading(n.heading),
      ...locked(blocks[0]?.sourceRef?.page),
      blocks: [
        ...marker,
        ...blocks.map((b) => ({
          id: b.id,
          kind: b.kind,
          text: b.text,
          ...locked(b.sourceRef?.page),
        })),
      ],
    };
  });
}
