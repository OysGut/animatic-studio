/**
 * Varighetsestimat (mandat 6.x: REQ-0109, REQ-0113, REQ-0115–REQ-0117, REQ-0495).
 * Estimatet bygger på dialogmengde og handlingsbeskrivelser med synlige, justerbare antakelser.
 * Det vises på prosjektoversikten, aldri i manusvisningen (REQ-0117).
 */
import type { BlockKind, ProjectState } from "../model";
import type { ScriptSnapshot } from "./versions";
import { blocksOfVariant, orderedOccurrences } from "../views";
import { US_LETTER_LAYOUT, wrapText, type Pagination } from "./paginate";

export interface DurationAssumptions {
  /** Taletempo for replikker (ord per minutt). */
  readonly dialogueWordsPerMinute: number;
  /** Sekunder per linje handling (61 tegn). */
  readonly actionSecondsPerLine: number;
  /** Sekunder for en sceneovergang/etablering (overskrift). */
  readonly headingSeconds: number;
  /** Korteste estimat for en scene. */
  readonly minSceneSeconds: number;
}

/**
 * Standardverdier, kalibrert slik at «Jula på Dovre» blir omtrent ett minutt per manusside
 * (bransjens tommelfingerregel). Justeres på oversiktssiden.
 */
export const DEFAULT_DURATION_ASSUMPTIONS: DurationAssumptions = {
  dialogueWordsPerMinute: 150,
  actionSecondsPerLine: 2,
  headingSeconds: 2,
  minSceneSeconds: 5,
};

export interface SceneEstimate {
  readonly occurrenceId: string;
  readonly active: boolean;
  readonly productionNumber: string | null;
  readonly dialogueWords: number;
  readonly actionLines: number;
  readonly seconds: number;
  /** Lengde i åttendedels sider (bransjestandard), fra sidebrytingen. */
  readonly eighths: number;
}

export interface ProductionEstimate {
  readonly scenes: readonly SceneEstimate[];
  /** Sum for aktive scener (deaktiverte utelates, REQ-0115). */
  readonly activeSeconds: number;
  readonly activeEighths: number;
}

function words(text: string): number {
  return text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

/** Estimatet for én scene ut fra blokkene (dialogord, handlingslinjer). */
export function estimateBlocks(
  blocks: readonly { readonly kind: BlockKind; readonly text: string }[],
  assumptions: DurationAssumptions = DEFAULT_DURATION_ASSUMPTIONS,
): { dialogueWords: number; actionLines: number; seconds: number } {
  const width = US_LETTER_LAYOUT.columns.action.width;
  let dialogueWords = 0;
  let actionLines = 0;
  for (const b of blocks) {
    if (b.kind === "dialogue") dialogueWords += words(b.text);
    else if (b.kind === "action" || b.kind === "shot")
      actionLines += wrapText(b.text.trim(), width).filter((l) => l.trim()).length;
  }
  const seconds = Math.max(
    assumptions.minSceneSeconds,
    assumptions.headingSeconds +
      (dialogueWords / Math.max(1, assumptions.dialogueWordsPerMinute)) * 60 +
      actionLines * assumptions.actionSecondsPerLine,
  );
  return { dialogueWords, actionLines, seconds };
}

/** Et punkt i utviklingen av filmens lengde (mandat 7.4, REQ-0120). */
export interface DurationHistoryPoint {
  readonly label: string;
  readonly at: string;
  /** Manusestimatet for de aktive scenene i versjonen. */
  readonly estimatedSeconds: number;
  /** Forventet lengde: filmen der versjonen hadde en aktiv filmversjon, ellers estimatet. */
  readonly expectedSeconds: number;
  readonly scenes: number;
}

/**
 * Lengden slik den så ut i en lagret manusversjon (mandat 7.4): estimat fra versjonens tekst, og
 * forventet lengde der scener som hadde ferdig film i versjonen, teller med filmens lengde.
 * `filmSeconds` gir lengden på en filmversjon (take) – de er uforanderlige, så dagens tall gjelder.
 */
export function snapshotDuration(
  snap: ScriptSnapshot,
  label: string,
  at: string,
  filmSeconds: (takeId: string) => number | null,
  assumptions: DurationAssumptions = DEFAULT_DURATION_ASSUMPTIONS,
): DurationHistoryPoint {
  let estimated = 0;
  let expected = 0;
  let scenes = 0;
  for (const sc of snap.scenes) {
    if (!sc.active) continue;
    scenes++;
    const est = Math.round(estimateBlocks(sc.blocks, assumptions).seconds);
    estimated += est;
    const film = sc.activeTakeId ? filmSeconds(sc.activeTakeId) : null;
    expected += film ?? est;
  }
  return { label, at, estimatedSeconds: estimated, expectedSeconds: expected, scenes };
}

export function estimateProduction(
  s: ProjectState,
  productionId: string,
  assumptions: DurationAssumptions = DEFAULT_DURATION_ASSUMPTIONS,
  pagination?: Pagination,
): ProductionEstimate {
  // Linjer en scene opptar på sidene, inkludert tomme linjer fram til neste scene
  const linesPerOcc = new Map<string, number>();
  if (pagination) {
    for (const p of pagination.pages) {
      const spans = new Map<string, { min: number; max: number }>();
      for (const l of p.lines) {
        if (l.row < 0) continue;
        const sp = spans.get(l.occurrenceId);
        if (!sp) spans.set(l.occurrenceId, { min: l.row, max: l.row });
        else {
          sp.min = Math.min(sp.min, l.row);
          sp.max = Math.max(sp.max, l.row);
        }
      }
      const list = [...spans.entries()].sort((a, b) => a[1].min - b[1].min);
      list.forEach(([id, sp], i) => {
        const next = list[i + 1];
        const extent = (next ? next[1].min : sp.max + 1) - sp.min;
        linesPerOcc.set(id, (linesPerOcc.get(id) ?? 0) + extent);
      });
    }
  }
  const scenes: SceneEstimate[] = orderedOccurrences(s, productionId).map((o) => {
    const { dialogueWords, actionLines, seconds } = estimateBlocks(
      blocksOfVariant(s, o.variantId),
      assumptions,
    );
    // 54 linjer = 1 side = 8/8
    const lines = linesPerOcc.get(o.id) ?? 0;
    const eighths = lines
      ? Math.max(1, Math.round((lines / US_LETTER_LAYOUT.linesPerPage) * 8))
      : 0;
    return {
      occurrenceId: o.id,
      active: o.active,
      productionNumber: o.productionNumber,
      dialogueWords,
      actionLines,
      seconds: Math.round(seconds),
      eighths,
    };
  });
  const active = scenes.filter((x) => x.active);
  return {
    scenes,
    activeSeconds: active.reduce((t, x) => t + x.seconds, 0),
    activeEighths: active.reduce((t, x) => t + x.eighths, 0),
  };
}

/** «1 3/8» sider. */
export function formatEighths(e: number): string {
  const whole = Math.floor(e / 8);
  const rest = e % 8;
  if (!rest) return String(whole);
  return whole ? `${whole} ${rest}/8` : `${rest}/8`;
}

/** «1:05:30» eller «4:07». */
export function formatDuration(seconds: number): string {
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}
