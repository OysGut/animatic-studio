/**
 * G-3 punkt 2: innledninger på sceneoverskrifter per språk, utvidbart per prosjekt.
 *
 * Hvert sett har innendørs/utendørs/begge. Parseren prøver manusets kildespråk først, så prosjektets egne ord,
 * så alle sett. Fountains tvungne overskrift (punktum foran) virker alltid, uavhengig av settene.
 * Ord uten avsluttende punktum i Fountain (INT, EXT, EST, I/E) gjelder fortsatt bare de internasjonale
 * forkortelsene, så vanlige setninger ikke blir overskrifter.
 */

export interface HeadingKeywordSet {
  readonly language: string;
  readonly words: readonly string[];
}

/** Ord skrives slik de står i manus (store bokstaver der språket har dem), med punktum der det hører til. */
export const HEADING_KEYWORDS: readonly HeadingKeywordSet[] = [
  { language: "en", words: ["INT./EXT.", "EXT./INT.", "INT/EXT", "I/E.", "INT.", "EXT.", "EST."] },
  { language: "nb", words: ["INNE/UTE.", "INNE.", "UTE.", "INT.", "EXT."] },
  { language: "nn", words: ["INNE/UTE.", "INNE.", "UTE."] },
  { language: "sv", words: ["INT./EXT.", "INT.", "EXT.", "INTERIÖR.", "EXTERIÖR."] },
  { language: "da", words: ["INT./EKST.", "INT.", "EKST.", "UDE.", "INDE."] },
  { language: "de", words: ["INNEN/AUSSEN.", "INNEN.", "AUSSEN.", "AUẞEN.", "INT.", "EXT."] },
  { language: "fr", words: ["INT./EXT.", "INT.", "EXT.", "INTÉRIEUR.", "EXTÉRIEUR."] },
  { language: "es", words: ["INT./EXT.", "INT.", "EXT.", "INTERIOR.", "EXTERIOR."] },
  { language: "it", words: ["INT./EST.", "INT.", "EST.", "INTERNO.", "ESTERNO."] },
  { language: "pt", words: ["INT./EXT.", "INT.", "EXT.", "INTERIOR.", "EXTERIOR."] },
  { language: "nl", words: ["BIN./BUI.", "BIN.", "BUI.", "INT.", "EXT."] },
  { language: "pl", words: ["WN./PL.", "WN.", "PL.", "INT.", "EXT."] },
  { language: "ru", words: ["ИНТ./НАТ.", "ИНТ.", "НАТ.", "ИНТЕРЬЕР.", "НАТУРА."] },
  { language: "ja", words: ["○", "◯", "屋内.", "屋外."] },
  { language: "zh", words: ["内景/外景", "内景", "外景", "內景", "外景."] },
  { language: "ko", words: ["실내.", "실외.", "내부.", "외부."] },
  { language: "tr", words: ["İÇ.", "DIŞ.", "İÇ/DIŞ."] },
];

function escape(w: string): string {
  return w.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}

/** Ordene i prioritert rekkefølge: kildespråket, prosjektets egne ord, så resten. Duplikater fjernes. */
export function headingWords(
  sourceLanguage?: string,
  projectWords: readonly string[] = [],
): string[] {
  const primary = (sourceLanguage ?? "").split(/[-_]/)[0]!.toLowerCase();
  const first = HEADING_KEYWORDS.filter((s) => s.language === primary);
  const rest = HEADING_KEYWORDS.filter((s) => s.language !== primary);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const w of [...first.flatMap((s) => s.words), ...projectWords, ...rest.flatMap((s) => s.words)]) {
    const k = w.trim();
    if (!k || seen.has(k.toUpperCase())) continue;
    seen.add(k.toUpperCase());
    out.push(k);
  }
  return out;
}

/**
 * Regex-alternasjon for innledningen. Lengste ord først innen samme prioritet er ikke nok når «INT.» står før
 * «INT./EXT.», så sammensatte ord (med /) sorteres foran enkle, ellers beholdes prioriteten.
 */
export function headingPrefixPattern(sourceLanguage?: string, projectWords?: readonly string[]): string {
  const words = headingWords(sourceLanguage, projectWords);
  const ordered = [...words].sort((a, b) => Number(b.includes("/")) - Number(a.includes("/")));
  // Mellomrom rundt skråstrek tillates, og avsluttende punktum i sammensatte ord er valgfritt (som før G-3).
  return ordered
    .map((w) =>
      escape(w)
        .replace(/\\\//g, String.raw`\s*\/\s*`)
        .replace(/\\\.(?=\\s\*\\\/)/g, String.raw`\.?`),
    )
    .join("|");
}

/** Gyldige prosjektord: 1–24 tegn, ingen linjeskift, maks 50 ord. */
export function projectHeadingWordsError(words: unknown): string | null {
  if (!Array.isArray(words)) return "heading_words_shape";
  if (words.length > 50) return "heading_words_count";
  for (const w of words) {
    if (typeof w !== "string" || !w.trim() || w.length > 24 || /[\r\n]/.test(w)) return "heading_words_item";
  }
  return null;
}
