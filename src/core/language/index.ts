import { sourceLanguageOf, isSourceLanguage } from "../dialogue/languages";
/**
 * Språkversjoner av filmen (M7 del 3, DEC-0059, mandat 23.3–23.8, REQ-0336–0352).
 *
 * Norsk og engelsk film er samme film: samme scener, 2D-scener, kamera, ressurser og klipp (REQ-0336). Det som
 * skiller språkene, er
 * - lyd: hvert lydklipp hører til ett språk eller er felles. Dialog og forteller hører til norsk når ikke
 *   annet er valgt; musikk, atmosfære og effekter er felles (REQ-0338–0340). En replikk kan ha én lydfil per
 *   språk, alle koblet til samme replikk (REQ-0339);
 * - språkavhengige bilder i lag, f.eks. et skilt med engelsk tekst (REQ-0337);
 * - teksten (oversettelsene, DEC-0058) og dermed underteksten.
 *
 * `languageState` gir tilstanden slik den ser ut i et språk (bare til visning, avspilling og eksport – alle
 * endringer gjøres på den egentlige tilstanden). Ingenting her endrer hovedfilmen (REQ-0344) eller starter en
 * generering (REQ-0347): forslagene er råd som brukeren velger å følge.
 */
import type { AudioClip, AudioKind, CompositionLayer, ProjectState, Take } from "../model";
import { blockSpans, filmClips, type FilmClip } from "../assembly/film";
import { MAIN_LANGUAGE, clipLanguage, isVoiceKind } from "../audio";
import { layersOf } from "../composition/render";
import { translationOf } from "../translation";
import { framesToSeconds } from "../time";
import { locale } from "../i18n";
import { t as tk, tLocalized } from "@/core/i18n/keyed";

/**
 * Dialogen i lyden til en importert film: språkkode når dialog og øvrig lyd er blandet, «none» når lyden er
 * bare musikk og effekter, null når filmen ikke har lyd. Ikke angitt = blandet med norsk dialog.
 */
export function takeAudioLanguage(t: Take, s?: Pick<ProjectState, "project">): string | null {
  if (t.media?.hasAudio === false) return null;
  return t.audioLanguage ?? (s ? sourceLanguageOf(s) : MAIN_LANGUAGE);
}

/** Laget slik det vises i språket: et språkavhengig bilde erstatter lagets eget. */
export function layerInLanguage(l: CompositionLayer, lang: string): CompositionLayer {
  const li = l.languageImages?.find((x) => x.language === lang);
  if (!li) return l;
  return { ...l, assetVariantId: li.assetVariantId, versionId: li.versionId };
}

const viewCache = new WeakMap<object, Map<string, ProjectState>>();

/**
 * Tilstanden slik bildet er i et språk (DEC-0059): språkavhengige bilder i lagene. Lyden filtreres der den
 * spilles (`filmAudio` m.fl. med språk), og tidene i filmen er de samme i alle språk (REQ-0336/0344), så
 * scenelengder, replikktider og undertekster følger hovedfilmen. Brukes til visning, avspilling og eksport –
 * endringer gjøres alltid på den egentlige tilstanden. Uendret tilstand gis tilbake når ingen lag har bilde
 * for språket.
 */
export function languageState(s: ProjectState, lang: string): ProjectState {
  let byLang = viewCache.get(s);
  if (!byLang) viewCache.set(s, (byLang = new Map()));
  const hit = byLang.get(lang);
  if (hit) return hit;
  let out = s;
  if (Object.values(s.layers).some((l) => l.languageImages?.some((x) => x.language === lang))) {
    const layers: Record<string, CompositionLayer> = {};
    for (const l of Object.values(s.layers)) layers[l.id] = layerInLanguage(l, lang);
    out = { ...s, layers };
  }
  byLang.set(lang, out);
  return out;
}

// ---------- Materialtyper og leppesynk (mandat 23.7, REQ-0345–0347) ----------

export type MaterialKind = "still" | "animatic2d" | "character2d" | "ai_video" | "imported_film";

export const MATERIAL_LABEL: Record<MaterialKind, string> = tLocalized({ still: "core-language-index.material-label.still.7548f560926f", animatic2d: "core-language-index.material-label.animatic2d.31d562be3f12", character2d: "core-language-index.material-label.character2d.1d0d7d5ebe58", ai_video: "core-language-index.material-label.ai-video.d130293ffd1d", imported_film: "core-language-index.material-label.imported-film.4fa4622cd63d" });

const MATERIAL_RANK: Record<MaterialKind, number> = {
  still: 0,
  animatic2d: 1,
  character2d: 2,
  ai_video: 3,
  imported_film: 4,
};

/**
 * Materialet i et klipp (REQ-0345). Består klippet av flere deler, gjelder den mest krevende. En 2D-scene med
 * karakterer som har bildeskifter (munn, uttrykk) regnes som redigerbare 2D-karakterer.
 */
export function clipMaterial(s: ProjectState, clip: FilmClip): MaterialKind {
  let best: MaterialKind = "still";
  const take = (t: Take | null): MaterialKind => {
    if (!t) return "still";
    if (t.kind === "ai_video") return "ai_video";
    if (t.kind === "imported_film") return "imported_film";
    if (t.kind === "composition2d") return "animatic2d";
    return "still";
  };
  for (const p of clip.parts) {
    let k: MaterialKind;
    if (p.source === "take") k = take(p.take);
    else if (p.source === "composition" && clip.compositionId) {
      const animated = layersOf(s, clip.compositionId).some(
        (l) =>
          l.visible &&
          l.swaps.length > 0 &&
          l.assetId !== null &&
          s.assets[l.assetId]?.kind === "character",
      );
      k = animated ? "character2d" : "animatic2d";
    } else k = "still";
    if (MATERIAL_RANK[k] > MATERIAL_RANK[best]) best = k;
  }
  return best;
}

export interface LipSyncAdvice {
  /** «direct»: dialogen kan byttes direkte. «check»: kontroller bildeskiftene. «lipsync»: synlig munn. */
  readonly action: "direct" | "check" | "lipsync";
  readonly text: string;
}

/** Vurdering av leppesynk ved språkbytte (REQ-0346). Foreslår aldri en automatisk regenerering (REQ-0347). */
export function lipSyncAdvice(kind: MaterialKind): LipSyncAdvice {
  switch (kind) {
    case "still":
    case "animatic2d":
      return {
        action: "direct",
        text: tk("core-language-index.text.text.f4e773a01bbe"),
      };
    case "character2d":
      return {
        action: "check",
        text: tk("core-language-index.text.text.ff54097816ff"),
      };
    case "ai_video":
      return {
        action: "lipsync",
        text: tk("core-language-index.text.text.030acc691093"),
      };
    case "imported_film":
      return {
        action: "lipsync",
        text: tk("core-language-index.text.text.2049f0c0e8f0"),
      };
  }
}

// ---------- Timing (mandat 23.6, REQ-0343/0344) ----------

/** Tale: ord per sekund (samme tommelfingerregel som varighetsestimatet). */
const WORDS_PER_SECOND = 150 / 60;
/** Avvik som ikke regnes som konflikt (ms). */
const TOLERANCE_MS = 200;

export function wordCount(text: string): number {
  return text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

/** Beregnet taletid for en replikk (ms). */
export function estimateSpeechMs(text: string): number {
  return Math.round((Math.max(1, wordCount(text)) / WORDS_PER_SECOND) * 1000);
}

export type TimingSuggestion =
  | {
      /** Flytt språkets lydklipp tidligere (bare den språkversjonen endres). */
      readonly kind: "earlier";
      readonly clipId: string;
      readonly offsetMs: number;
      readonly text: string;
    }
  | { readonly kind: "shorten"; readonly words: number; readonly text: string }
  | { readonly kind: "overlap"; readonly text: string }
  | { readonly kind: "pause"; readonly text: string };

export interface TimingConflict {
  readonly occurrenceId: string;
  readonly blockId: string;
  /** «long»: replikken er for lang for tiden den har. «short»: mye kortere (lang pause). */
  readonly kind: "long" | "short";
  /** Tiden replikken har i hovedfilmen (ms fra scenens start). */
  readonly windowStartMs: number;
  readonly windowEndMs: number;
  /** Start og lengde i språket (ms). */
  readonly startMs: number;
  readonly lengthMs: number;
  /** Lengden i hovedfilmen (ms). */
  readonly mainLengthMs: number;
  /** «audio»: målt fra lydfilen. «estimate»: beregnet fra den oversatte teksten. */
  readonly source: "audio" | "estimate";
  /** Hvor mye for lang (ms); negativt for «short». */
  readonly overflowMs: number;
  /** Tiden i hovedfilmen er beregnet fra manuset (ingen tidskobling eller lyd). */
  readonly windowEstimated: boolean;
  readonly suggestions: readonly TimingSuggestion[];
}

const fmt = (ms: number) => `${(Math.round(ms / 100) / 10).toLocaleString(locale())} s`;

/**
 * Timingkonflikter i en språkversjon (REQ-0343): replikker som er lengre enn tiden de har i hovedfilmen (fra
 * starten til neste replikk eller slutten av scenen), med forslag. Tiden i hovedfilmen kommer fra
 * tidskoblinger og norsk lyd (ellers fra manuset). Lengden i språket kommer fra språkets lydfil for
 * replikken, ellers fra den oversatte teksten. Hovedfilmen endres aldri (REQ-0344).
 */
export function timingConflicts(
  s: ProjectState,
  productionId: string,
  lang: string,
): TimingConflict[] {
  if (isSourceLanguage(s, lang)) return [];
  const main = s;
  const fps = s.project.fps;
  const ms = (frames: number) => Math.round(framesToSeconds(frames, fps) * 1000);
  const out: TimingConflict[] = [];
  for (const clip of filmClips(main, productionId)) {
    const spans = blockSpans(main, clip)
      .filter((sp) => main.blocks[sp.blockId]?.kind === "dialogue" && !sp.uncovered)
      .sort((a, b) => a.startFrame - b.startFrame);
    if (spans.length === 0) continue;
    const langAudio = new Map<string, AudioClip>();
    const langVoices: AudioClip[] = [];
    for (const a of Object.values(s.audioClips))
      if (
        !a.removed &&
        a.occurrenceId === clip.occurrenceId &&
        isVoiceKind(a.kind) &&
        clipLanguage(a, s) === lang
      ) {
        langVoices.push(a);
        if (!a.blockId) continue;
        const prev = langAudio.get(a.blockId);
        if (!prev || a.offsetMs < prev.offsetMs) langAudio.set(a.blockId, a);
      }
    const sceneEnd = ms(clip.durationFrames);
    for (let i = 0; i < spans.length; i++) {
      const sp = spans[i]!;
      const start = ms(sp.startFrame - clip.startFrame);
      const next = spans.slice(i + 1).find((x) => x.startFrame > sp.startFrame);
      const end = next ? ms(next.startFrame - clip.startFrame) : sceneEnd;
      const prevEnd = i > 0 ? ms(spans[i - 1]!.endFrame - clip.startFrame) : 0;
      const mainLength = ms(sp.endFrame - sp.startFrame);
      const audio = langAudio.get(sp.blockId);
      let lStart: number;
      let lLength: number;
      let source: "audio" | "estimate";
      if (audio) {
        lStart = audio.offsetMs;
        lLength = audio.lengthMs;
        source = "audio";
      } else {
        const text = translationOf(s, sp.blockId, lang)?.text;
        if (!text?.trim()) continue;
        lStart = start;
        lLength = estimateSpeechMs(text);
        source = "estimate";
      }
      const overflow = lStart + lLength - end;
      const window = end - start;
      const base = {
        occurrenceId: clip.occurrenceId,
        blockId: sp.blockId,
        windowStartMs: start,
        windowEndMs: end,
        startMs: lStart,
        lengthMs: lLength,
        mainLengthMs: mainLength,
        source,
        windowEstimated: sp.kind === "estimate",
      };
      if (overflow > TOLERANCE_MS) {
        const suggestions: TimingSuggestion[] = [];
        // Rom før replikken: etter forrige lydklipp i språket hvis det finnes (KI-119), ellers etter
        // forrige replikk i hovedfilmen
        const before = audio
          ? langVoices.filter((x) => x.id !== audio.id && x.offsetMs < audio.offsetMs)
          : [];
        const prevLangEnd = before.length
          ? Math.max(...before.map((x) => x.offsetMs + x.lengthMs))
          : null;
        // Forrige replikk uten lyd i språket trenger fortsatt tiden sin i hovedfilmen
        const prevNoAudio = i > 0 && !langAudio.has(spans[i - 1]!.blockId) ? prevEnd : 0;
        const room = Math.max(0, lStart - Math.max(prevLangEnd ?? prevEnd, prevNoAudio));
        if (audio && room >= 100) {
          const move = Math.min(room, overflow);
          suggestions.push({
            kind: "earlier",
            clipId: audio.id,
            offsetMs: Math.max(0, lStart - move),
            text:
              move >= overflow
                ? tk("core-language-index.text.text.3abf4eaf6f59", { value1: String(fmt(move)) })
                : tk("core-language-index.text.text.f0bcf9120e4b", { value1: String(fmt(move)) }),
          });
        }
        const words = Math.ceil((overflow / 1000) * WORDS_PER_SECOND);
        suggestions.push({
          kind: "shorten",
          words,
          text: tk("core-language-index.shorten-by", { count: words }),
        });
        if (next)
          suggestions.push({
            kind: "overlap",
            text: tk("core-language-index.text.text.099e68002934", { value1: String(fmt(overflow)) }),
          });
        suggestions.push({
          kind: "pause",
          text: tk("core-language-index.text.text.025f9b6e4eba"),
        });
        out.push({ ...base, kind: "long", overflowMs: overflow, suggestions });
      } else if (window > 0 && lLength < window * 0.5 && window - lLength > 1500) {
        out.push({
          ...base,
          kind: "short",
          overflowMs: overflow,
          suggestions: [
            {
              kind: "pause",
              text: tk("core-language-index.text.text.f74b370ccdd1", { value1: String(fmt(window - lLength)) }),
            },
          ],
        });
      }
    }
  }
  return out;
}

// ---------- Oversikt per scene ----------

export interface LanguageSceneReport {
  readonly clip: FilmClip;
  readonly material: MaterialKind;
  readonly advice: LipSyncAdvice;
  /** Replikker i scenen (norsk manus). */
  readonly lines: number;
  /** Replikker med oversatt tekst. */
  readonly translated: number;
  /** Replikker med lydfil i språket. */
  readonly withAudio: number;
  /** Replikker med lydfil i hovedspråket. */
  readonly withMainAudio: number;
  /**
   * Importert film med dialog blandet inn i lyden på et annet språk (REQ-0341/0342): språket, ellers null.
   * Dialogen kan ikke byttes helt; lyden spilles som den er.
   */
  readonly mixedDialogue: string | null;
  readonly conflicts: readonly TimingConflict[];
}

/** Status for en språkversjon, scene for scene (for språkoversikten i monteringen). */
export function languageReport(
  s: ProjectState,
  productionId: string,
  lang: string,
): LanguageSceneReport[] {
  const conflicts = timingConflicts(s, productionId, lang);
  const out: LanguageSceneReport[] = [];
  for (const clip of filmClips(languageState(s, lang), productionId)) {
    const dialogue = Object.values(s.blocks).filter(
      (b) => b.variantId === clip.variantId && !b.removed && b.kind === "dialogue" && b.text.trim(),
    );
    const voiced = (l: string) => {
      const ids = new Set<string>();
      for (const a of Object.values(s.audioClips))
        if (
          !a.removed &&
          a.occurrenceId === clip.occurrenceId &&
          a.blockId &&
          isVoiceKind(a.kind) &&
          clipLanguage(a, s) === l
        )
          ids.add(a.blockId);
      return dialogue.filter((b) => ids.has(b.id)).length;
    };
    let mixed: string | null = null;
    for (const p of clip.parts) {
      if (p.source !== "take" || !p.take || p.take.kind === "composition2d") continue;
      const al = takeAudioLanguage(p.take, s);
      if (al && al !== "none" && al !== lang) mixed = al;
    }
    const material = clipMaterial(s, clip);
    out.push({
      clip,
      material,
      advice: lipSyncAdvice(material),
      lines: dialogue.length,
      translated:
        isSourceLanguage(s, lang)
          ? dialogue.length
          : dialogue.filter((b) => translationOf(s, b.id, lang)).length,
      withAudio: voiced(lang),
      withMainAudio: voiced(sourceLanguageOf(s)),
      mixedDialogue: mixed,
      conflicts: conflicts.filter((c) => c.occurrenceId === clip.occurrenceId),
    });
  }
  return out;
}

/** Lyd per replikk og språk (REQ-0338/0339): alle språkenes lydklipp for en replikk i en scene. */
export function lineAudio(
  s: ProjectState,
  occurrenceId: string,
  blockId: string,
): { readonly language: string; readonly clip: AudioClip }[] {
  return Object.values(s.audioClips)
    .filter((a) => !a.removed && a.occurrenceId === occurrenceId && a.blockId === blockId)
    .map((clip) => ({ language: clipLanguage(clip, s), clip }))
    .sort((a, b) => a.language.localeCompare(b.language) || a.clip.offsetMs - b.clip.offsetMs);
}
