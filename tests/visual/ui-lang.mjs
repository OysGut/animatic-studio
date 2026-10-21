/**
 * Valgfritt testspråk for regresjonssuitene: `UI_LANG=en node tests/visual/<suite>.mjs …` kjører alle
 * scenarioene på engelsk. `LANG=en` virker også, men bare når verdien er nøyaktig «nb» eller «en»
 * (systemets LANG=C.UTF-8 o.l. ignoreres). Uten variabel brukes språket scenarioet selv ber om.
 */
const pick = (v) => (v === "nb" || v === "en" ? v : null);
export const FORCED_UI_LANG = pick(process.env.UI_LANG) ?? pick(process.env.LANG);
/** Testspråket en-XA velges alltid eksplisitt og overstyrer UI_LANG (kontrollene gjelder bare pseudospråket). */
export const uiLang = (lang = "nb") => (lang === "en-XA" ? lang : FORCED_UI_LANG ?? lang);
/** Velger forventet tekst etter språket suiten faktisk kjører på. */
export const byLang = (lang, nb, en) => (uiLang(lang) === "en" ? en : nb);
