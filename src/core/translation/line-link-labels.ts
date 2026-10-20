/** B-050 review labels: plural-correct counts, confidence as percent and n:m explanations. */

import { t, tLocalized } from "@/core/i18n/keyed";

/** «1 ugyldig forslag forkastet» / «2 ugyldige forslag forkastet». */
export function discardedText(n: number): string {
  return n === 1
    ? t("core-translation-line-link-labels.discarded-text.message.122c3096d772")
    : t("core-translation-line-link-labels.discarded-text.message.a44c236afcd9", { n: String(n) });
}

/** 0.5 → «50 %» (Norwegian spacing) / "50%". */
export function confidencePercent(c: number): string {
  const n = Math.round(Math.max(0, Math.min(1, Number.isFinite(c) ? c : 0)) * 100);
  return t("core-translation-line-link-labels.confidence-percent.message.0ae88505aa91", { n: String(n) });
}

/** Tallord 0–10 på gjeldende språk. */
const NUMBER_WORD: Record<number, string> = tLocalized({ 0: "core-translation-line-link-labels.number-word-0", 1: "core-translation-line-link-labels.number-word-1", 2: "core-translation-line-link-labels.number-word-2", 3: "core-translation-line-link-labels.number-word-3", 4: "core-translation-line-link-labels.number-word-4", 5: "core-translation-line-link-labels.number-word-5", 6: "core-translation-line-link-labels.number-word-6", 7: "core-translation-line-link-labels.number-word-7", 8: "core-translation-line-link-labels.number-word-8", 9: "core-translation-line-link-labels.number-word-9", 10: "core-translation-line-link-labels.number-word-10" });
const word = (n: number) => NUMBER_WORD[n] ?? String(n);

/** 1:2 → «én norsk linje mot to oversatte». */
export function ratioTitle(sources: number, targets: number): string {
  return t("core-translation-line-link-labels.pair-summary", { sources: t("core-translation-line-link-labels.pair-summary-sources", { count: sources, n: word(sources) }), targets: t("core-translation-line-link-labels.pair-summary-targets", { count: targets, n: word(targets) }) });
}
