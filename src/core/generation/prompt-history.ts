/**
 * Beskrivelsene som laget bildene (Mars 2026-10-13): «For hvert bilde … bør det være mulig å se promptet
 * som er brukt … de slettes aldri, men følger bildet», og «systemet bør huske siste prompt».
 *
 * Kilden er AI-jobbloggen (generation_jobs), som aldri slettes: hver jobb har beskrivelsen og stien til
 * bildet den laget.
 */
import type { GenerationJob } from "./cost";

const pad = (n: number) => String(n).padStart(2, "0");

/** «13.10.2026 kl. 12.04» (lokal tid). */
export function formatJobTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} kl. ${pad(d.getHours())}.${pad(d.getMinutes())}`;
}

/** Siste beskrivelse brukt for å lage et bilde av ressursen (nyeste først), eller null. */
export function lastImagePrompt(
  jobs: readonly GenerationJob[],
  assetId: string,
): { readonly prompt: string; readonly when: string; readonly jobId: string } | null {
  let best: GenerationJob | null = null;
  for (const j of jobs) {
    if (j.kind !== "image" || j.assetId !== assetId || !j.prompt.trim()) continue;
    // Også feilede forsøk huskes: det var det brukeren sist prøvde
    if (!best || j.createdAt > best.createdAt) best = j;
  }
  return best ? { prompt: best.prompt, when: formatJobTime(best.createdAt), jobId: best.id } : null;
}

/** Jobben som laget filen (stien i bøtta), eller null. */
export function jobForResult(jobs: readonly GenerationJob[], path: string): GenerationJob | null {
  return jobs.find((j) => j.resultPath === path) ?? null;
}
