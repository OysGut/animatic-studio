/** B-050 review labels: plural-correct counts, confidence as percent and n:m explanations. */
import { L } from "../i18n";

/** «1 ugyldig forslag forkastet» / «2 ugyldige forslag forkastet». */
export function discardedText(n: number): string {
  return n === 1
    ? L("1 ugyldig forslag forkastet.", "1 invalid suggestion discarded.")
    : L(`${n} ugyldige forslag forkastet.`, `${n} invalid suggestions discarded.`);
}

/** 0.5 → «50 %» (Norwegian spacing) / "50%". */
export function confidencePercent(c: number): string {
  const n = Math.round(Math.max(0, Math.min(1, Number.isFinite(c) ? c : 0)) * 100);
  return L(`${n} %`, `${n}%`);
}

const NB = ["null", "én", "to", "tre", "fire", "fem", "seks", "sju", "åtte", "ni", "ti"];
const EN = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

/** 1:2 → «én norsk linje mot to oversatte». */
export function ratioTitle(sources: number, targets: number): string {
  const nb = (n: number) => NB[n] ?? String(n), en = (n: number) => EN[n] ?? String(n);
  return L(
    `${nb(sources)} norsk${sources === 1 ? "" : "e"} ${sources === 1 ? "linje" : "linjer"} mot ${nb(targets)} ${targets === 1 ? "oversatt" : "oversatte"}`,
    `${en(sources)} Norwegian ${sources === 1 ? "line" : "lines"} to ${en(targets)} translated`,
  );
}
