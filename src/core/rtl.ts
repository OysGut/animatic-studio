/**
 * G-4: retningsregler for tekst med brukerinnhold (arabisk, hebraisk, persisk, urdu).
 * Plattformnøytral: ingen DOM eller React her – komponentene bruker dirOf() til dir-attributtet,
 * og PDF/eksport bruker isRtlScript() for speiling og bidi-flagg.
 */

/** Første sterke RTL-tegn: arabisk (0600–06FF, 0750–077F, 08A0–08FF, FB50–FDFF, FE70–FEFF) og hebraisk (0590–05FF, FB1D–FB4F). */
const RTL_CHAR = /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB1D-\uFB4F\uFB50-\uFDFF\uFE70-\uFEFF]/;
/** Første sterke LTR-tegn (latinsk, gresk, kyrillisk, CJK, hangul, kana, thai, devanagari m.m.). */
const LTR_CHAR =
  /[A-Za-z\u00C0-\u024F\u0370-\u03FF\u0400-\u04FF\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF\u0E00-\u0E7F\u0900-\u097F]/;

/** «rtl» hvis det første sterke tegnet er RTL, ellers «ltr». Følger samme regel som dir="auto" (UAX #9, P2/P3). */
export function dirOf(text: string): "rtl" | "ltr" {
  for (const ch of text) {
    if (RTL_CHAR.test(ch)) return "rtl";
    if (LTR_CHAR.test(ch)) return "ltr";
  }
  return "ltr";
}

/** True hvis teksten starter med et sterkt RTL-tegn (snarvei for dirOf(text) === 'rtl'). */
export function isRtlText(text: string): boolean {
  return dirOf(text) === "rtl";
}
