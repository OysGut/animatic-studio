/**
 * G-3 punkt 1: språkriktig telling av ord og tegn, og talehastighet per språk.
 *
 * Intl.Segmenter deler tekst riktig også for språk uten mellomrom (ja, zh, th) og for skrift med
 * sammensatte tegn (grafemer). Finnes ikke Segmenter, brukes mellomrom som reserve.
 * Plattformnøytral: Intl er en del av ECMAScript, ikke et nettleser-API.
 */
function primarySubtag(tag: string): string {
  return tag.split(/[-_]/)[0]!.toLowerCase();
}

type Granularity = "word" | "grapheme";

interface SegLike {
  segment(text: string): Iterable<{ segment: string; isWordLike?: boolean }>;
}

const cache = new Map<string, SegLike | null>();

function segmenter(lang: string | undefined, granularity: Granularity): SegLike | null {
  const key = `${lang ?? ""}|${granularity}`;
  if (cache.has(key)) return cache.get(key)!;
  const Seg = (Intl as unknown as { Segmenter?: new (l?: string, o?: object) => SegLike }).Segmenter;
  let s: SegLike | null = null;
  if (Seg) {
    try {
      s = new Seg(lang || undefined, { granularity });
    } catch {
      s = new Seg(undefined, { granularity });
    }
  }
  cache.set(key, s);
  return s;
}

const HAS_LETTER = /[\p{L}\p{N}]/u;

/** Ordene i teksten (bare ord med bokstav eller tall). */
export function segmentWords(text: string, lang?: string): string[] {
  const seg = segmenter(lang, "word");
  if (!seg) return text.split(/\s+/).filter((w) => HAS_LETTER.test(w));
  const out: string[] = [];
  for (const s of seg.segment(text)) {
    if ((s.isWordLike ?? HAS_LETTER.test(s.segment)) && HAS_LETTER.test(s.segment)) out.push(s.segment);
  }
  return out;
}

export function countWords(text: string, lang?: string): number {
  return segmentWords(text, lang).length;
}

/** Synlige tegn (grafemer) uten mellomrom og tegnsetting. */
export function countGraphemes(text: string, lang?: string): number {
  const seg = segmenter(lang, "grapheme");
  if (!seg) return Array.from(text).filter((c) => HAS_LETTER.test(c)).length;
  let n = 0;
  for (const s of seg.segment(text)) if (HAS_LETTER.test(s.segment)) n++;
  return n;
}

/** Hvordan talehastighet måles for et språk. */
export type SpeechUnit = "wpm" | "cps";

export interface SpeechRate {
  readonly unit: SpeechUnit;
  /** Ord per minutt (wpm) eller tegn/morer per sekund (cps). */
  readonly value: number;
}

/**
 * Standard talehastighet for replikker (rolig skuespillertempo, ikke nyhetsopplesning).
 * Kilder: Pellegrino, Coupé & Marsico (2011) «A cross-language perspective on speech information rate»,
 * Language 87(3) – stavelser/s per språk; Brysbaert (2019) «How many words do we read per minute?»
 * for ordbaserte språk. Tallene er avrundet ned ca. 20 % til dialogtempo. ja: morer/s ≈ tegn/s for kana
 * (kanji gir litt færre tegn, så tallet er tegn/s); zh: tegn/s ≈ stavelser/s; ko: hangul-blokker/s.
 */
export const DEFAULT_SPEECH_RATES: Readonly<Record<string, SpeechRate>> = {
  ja: { unit: "cps", value: 7 },
  zh: { unit: "cps", value: 4.5 },
  ko: { unit: "cps", value: 5.5 },
  en: { unit: "wpm", value: 150 },
  nb: { unit: "wpm", value: 140 },
  nn: { unit: "wpm", value: 140 },
  no: { unit: "wpm", value: 140 },
  sv: { unit: "wpm", value: 140 },
  da: { unit: "wpm", value: 140 },
  de: { unit: "wpm", value: 130 },
  fr: { unit: "wpm", value: 155 },
  es: { unit: "wpm", value: 160 },
  it: { unit: "wpm", value: 155 },
  pt: { unit: "wpm", value: 150 },
  ru: { unit: "wpm", value: 120 },
  fi: { unit: "wpm", value: 110 },
  ar: { unit: "wpm", value: 120 },
  th: { unit: "wpm", value: 130 },
};

/** Reserve for språk uten eget tall (samme tommelfingerregel som før G-3). */
export const FALLBACK_SPEECH_RATE: SpeechRate = { unit: "wpm", value: 150 };

/** Talehastighet for språket; prosjektets overstyring (nøkkel = primær språkkode eller full tagg) går først. */
export function speechRateFor(
  lang: string | undefined,
  overrides?: Readonly<Record<string, SpeechRate>>,
): SpeechRate {
  const tag = (lang ?? "").trim();
  const primary = primarySubtag(tag);
  return (
    overrides?.[tag] ??
    overrides?.[primary] ??
    DEFAULT_SPEECH_RATES[tag] ??
    DEFAULT_SPEECH_RATES[primary] ??
    FALLBACK_SPEECH_RATE
  );
}

/** Beregnet taletid (sekunder) for en replikk. Minst én enhet, så tomme replikker får en kort varighet. */
export function speechSeconds(
  text: string,
  lang?: string,
  overrides?: Readonly<Record<string, SpeechRate>>,
): number {
  const rate = speechRateFor(lang, overrides);
  if (rate.unit === "cps") return Math.max(1, countGraphemes(text, lang)) / rate.value;
  return (Math.max(1, countWords(text, lang)) / rate.value) * 60;
}

/** Gyldig overstyring fra prosjektinnstillingene, ellers null. */
export function speechRateError(r: unknown): string | null {
  if (!r || typeof r !== "object") return "speech_rate_shape";
  const { unit, value } = r as { unit?: unknown; value?: unknown };
  if (unit !== "wpm" && unit !== "cps") return "speech_rate_unit";
  if (typeof value !== "number" || !Number.isFinite(value)) return "speech_rate_value";
  if (unit === "wpm" ? value < 20 || value > 400 : value < 0.5 || value > 30) return "speech_rate_range";
  return null;
}
