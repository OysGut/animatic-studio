/**
 * Varighetsestimat (mandat 6.x: REQ-0109, REQ-0113, REQ-0115–REQ-0117, REQ-0495).
 * Estimatet bygger på dialogmengde og handlingsbeskrivelser med synlige, justerbare antakelser.
 * Det vises på prosjektoversikten, aldri i manusvisningen (REQ-0117).
 */
import {
  countWords as segCount,
  countWords,
  speechRateFor,
  speechSeconds,
} from "../language/text-metrics";
import type { BlockKind, ProjectState } from "../model";
import type { ScriptSnapshot } from "./versions";
import { blocksOfVariant, isScriptOccurrence, orderedOccurrences, sceneNumberOf } from "../views";
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

/** Tillatte verdier for antakelsene (samme grenser i klient og server). */
export const DURATION_ASSUMPTION_LIMITS: Readonly<
  Record<keyof DurationAssumptions, { readonly min: number; readonly max: number }>
> = {
  dialogueWordsPerMinute: { min: 30, max: 400 },
  actionSecondsPerLine: { min: 0, max: 30 },
  headingSeconds: { min: 0, max: 60 },
  minSceneSeconds: { min: 0, max: 600 },
};

const ASSUMPTION_KEYS = Object.keys(DURATION_ASSUMPTION_LIMITS) as (keyof DurationAssumptions)[];

/**
 * Kontrollerer antakelser fra brukeren eller lagringen (KI-28): et objekt med de fire tallene innenfor
 * grensene. Gir null ved ugyldige verdier. Verdiene rundes til to desimaler, så de lagres likt overalt.
 */
export function normalizeDurationAssumptions(x: unknown): DurationAssumptions | null {
  if (!x || typeof x !== "object" || Array.isArray(x)) return null;
  const o = x as Record<string, unknown>;
  const out: Record<string, number> = {};
  for (const k of ASSUMPTION_KEYS) {
    const v = o[k];
    const { min, max } = DURATION_ASSUMPTION_LIMITS[k];
    if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) return null;
    out[k] = Math.round(v * 100) / 100;
  }
  return out as unknown as DurationAssumptions;
}

/** Er antakelsene like (alle fire tallene)? */
export function sameDurationAssumptions(a: DurationAssumptions, b: DurationAssumptions): boolean {
  return ASSUMPTION_KEYS.every((k) => a[k] === b[k]);
}

/** Er to valgfrie antakelser like? Mangler begge, er de like; mangler bare den ene, er de ulike. */
export function sameOptionalDurationAssumptions(
  a: DurationAssumptions | null | undefined,
  b: DurationAssumptions | null | undefined,
): boolean {
  if (a == null || b == null) return a == null && b == null;
  return sameDurationAssumptions(a, b);
}

/** Prosjektets lagrede antakelser (KI-28), ellers standardverdiene. */
export function projectDurationAssumptions(project: {
  readonly durationAssumptions?: DurationAssumptions;
}): DurationAssumptions {
  return project.durationAssumptions ?? DEFAULT_DURATION_ASSUMPTIONS;
}

/** «150 ord/min · 2 s per handlingslinje · 2 s per scene · minst 5 s» */
export function formatDurationAssumptions(a: DurationAssumptions): string {
  const n = (x: number) => String(x).replace(".", ",");
  return `${n(a.dialogueWordsPerMinute)} ord/min · ${n(a.actionSecondsPerLine)} s per handlingslinje · ${n(a.headingSeconds)} s per scene · minst ${n(a.minSceneSeconds)} s`;
}

export interface SceneEstimate {
  readonly occurrenceId: string;
  readonly active: boolean;
  readonly productionNumber: string | null;
  readonly dialogueWords: number;
  readonly actionLines: number;
  readonly seconds: number;
  /** Lengde i åttendedels sider (bransjestandard), fra sidebrytingen. */
  readonly eighths: number;
  /**
   * Usikkert estimat (REQ-0110, KI-178, Mars 15.10.2026): lite å regne ut fra (handling uten dialog, f.eks.
   * en montasje), så lengden kan bli svært annerledes. Da vises et spenn i stedet for ett tall.
   */
  readonly uncertain: boolean;
  /** Spennet for et usikkert estimat (sekunder), ellers lik `seconds`. */
  readonly lowSeconds: number;
  readonly highSeconds: number;
}

/**
 * Hvor sikkert estimatet er. Dialog gir et godt anslag (ord per minutt); handling uten dialog kan ta alt fra
 * noen sekunder til flere minutter. Scener med nesten bare handling (under 10 ord dialog, eller over 70 % av
 * tiden fra handling) regnes som usikre, med spenn 0,6–1,8 ganger estimatet (montasje uten dialog: 0,5–2,5).
 */
export function estimateUncertainty(
  e: { readonly dialogueWords: number; readonly actionLines: number; readonly seconds: number },
  assumptions: DurationAssumptions = DEFAULT_DURATION_ASSUMPTIONS,
): { uncertain: boolean; lowSeconds: number; highSeconds: number } {
  const actionShare =
    e.seconds > 0 ? (e.actionLines * assumptions.actionSecondsPerLine) / e.seconds : 0;
  const noDialogue = e.dialogueWords < 10 && e.actionLines > 0;
  const uncertain = noDialogue || actionShare > 0.7;
  if (!uncertain) return { uncertain, lowSeconds: e.seconds, highSeconds: e.seconds };
  const [lo, hi] = noDialogue ? [0.5, 2.5] : [0.6, 1.8];
  const round5 = (n: number) => Math.max(1, Math.round(n / 5) * 5);
  return {
    uncertain,
    lowSeconds: Math.max(Math.min(round5(e.seconds * lo), e.seconds), 1),
    highSeconds: Math.max(round5(e.seconds * hi), e.seconds),
  };
}

export interface ProductionEstimate {
  readonly scenes: readonly SceneEstimate[];
  /** Sum for aktive scener (deaktiverte utelates, REQ-0115). */
  readonly activeSeconds: number;
  readonly activeEighths: number;
  /** Aktive scener med usikkert estimat, og spennet for summen. */
  readonly uncertainScenes: number;
  readonly activeLowSeconds: number;
  readonly activeHighSeconds: number;
}

function words(text: string): number {
  return segCount(text);
}

/** Estimatet for én scene ut fra blokkene (dialogord, handlingslinjer). */
export function estimateBlocks(
  blocks: readonly { readonly kind: BlockKind; readonly text: string }[],
  assumptions: DurationAssumptions = DEFAULT_DURATION_ASSUMPTIONS,
  /** G-3: manusets språk. Tegnbaserte språk (ja, zh, ko) regnes i tegn per sekund, ikke ord. */
  language?: string,
): { dialogueWords: number; actionLines: number; seconds: number } {
  const cps = language && speechRateFor(language).unit === "cps";
  let dialogueSeconds = 0;
  const width = US_LETTER_LAYOUT.columns.action.width;
  let dialogueWords = 0;
  let actionLines = 0;
  for (const b of blocks) {
    if (b.kind === "dialogue") {
      dialogueWords += cps ? countWords(b.text, language) : words(b.text);
      if (cps) dialogueSeconds += speechSeconds(b.text, language);
    }
    else if (b.kind === "action" || b.kind === "shot")
      actionLines += wrapText(b.text.trim(), width).filter((l) => l.trim()).length;
  }
  const seconds = Math.max(
    assumptions.minSceneSeconds,
    assumptions.headingSeconds +
      (cps ? dialogueSeconds : (dialogueWords / Math.max(1, assumptions.dialogueWordsPerMinute)) * 60) +
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
 * Lengden slik den så ut i en lagret manusversjon (mandat 7.4), regnet på nytt: estimat fra versjonens
 * tekst med de antakelsene som gis (i dag), og forventet lengde der scener som hadde ferdig film i versjonen,
 * teller med filmens lengde. `filmSeconds` gir lengden på en filmversjon (take) – de er uforanderlige, så
 * dagens tall gjelder. Brukes bare for versjoner uten lagret estimat (REQ-0120, duration-snapshot.ts).
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
  const scenes: SceneEstimate[] = orderedOccurrences(s, productionId).filter(isScriptOccurrence).map((o) => {
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
      productionNumber: sceneNumberOf(s, o),
      dialogueWords,
      actionLines,
      seconds: Math.round(seconds),
      eighths,
      ...estimateUncertainty(
        { dialogueWords, actionLines, seconds: Math.round(seconds) },
        assumptions,
      ),
    };
  });
  const active = scenes.filter((x) => x.active);
  return {
    scenes,
    activeSeconds: active.reduce((t, x) => t + x.seconds, 0),
    activeEighths: active.reduce((t, x) => t + x.eighths, 0),
    uncertainScenes: active.filter((x) => x.uncertain).length,
    activeLowSeconds: active.reduce((t, x) => t + x.lowSeconds, 0),
    activeHighSeconds: active.reduce((t, x) => t + x.highSeconds, 0),
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
