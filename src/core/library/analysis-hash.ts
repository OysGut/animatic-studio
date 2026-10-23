/**
 * Automatisk gjenkjenning (OG2, B-047): hvilke scener må analyseres, og hvordan lagrede AI-resultater
 * brukes. Ren kjerne: ingen nettverk, ingen database. Hashen bygger bare på sceneinnholdet (overskrift og
 * blokker i rekkefølge), aldri på scenenummer – nummer er ikke identitet.
 */
import type { ProjectState } from "../model";
import { blocksOfVariant, orderedOccurrences } from "../views";

import { classificationFromJson, type AIClassification } from "./classification-prompt";
import type { LibrarySuggestion } from "./suggest";
import { t as tk } from "@/core/i18n/keyed";

/** Tak for den innebygde AI-en (B-047, svar 18.10). */
export const SERVICE_AI_RUNS_PER_PROJECT_PER_DAY = 20;
export const ENTITY_ANALYSIS_MAX_SCENES_PER_RUN = 40;
export const SERVICE_AI_LOCK_MS = 60_000;
/** Ventetid etter siste manusendring før inkrementell analyse. */
export const ENTITY_ANALYSIS_DEBOUNCE_MS = 30_000;
/** Høyst så mange kandidater sendes i én kjøring. */
export const ENTITY_ANALYSIS_MAX_CANDIDATES = 120;

/** FNV-1a (32 bit) to ganger med ulik startverdi → 16 hex-tegn. Deterministisk og plattformnøytral. */
export function contentHash(text: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x01000193) >>> 0;
    b = (b ^ (b >>> 13)) >>> 0;
  }
  return a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0");
}

export interface SceneForAnalysis {
  readonly sceneId: string;
  readonly variantId: string;
  readonly hash: string;
  /** Sceneteksten (overskrift + blokker) – brukes på serveren til å finne kandidatene i scenen. */
  readonly text: string;
}

export function sceneText(s: ProjectState, variantId: string): string {
  const v = s.variants[variantId as never] as { heading?: { intExt: string; location: string; time: string } } | undefined;
  const h = v?.heading;
  const head = h ? `${h.intExt} ${h.location} ${h.time}`.trim() : "";
  const blocks = blocksOfVariant(s, variantId).map((b) => `${b.kind}\u0001${b.text}`);
  return [head, ...blocks].join("\u0002");
}

/** Scenene i produksjonen, med hash av innholdet. Samme scene i flere forekomster telles én gang. */
export function analysisScenes(s: ProjectState, productionId: string): SceneForAnalysis[] {
  const out: SceneForAnalysis[] = [];
  const seen = new Set<string>();
  for (const o of orderedOccurrences(s, productionId)) {
    if (seen.has(o.sceneId)) continue;
    seen.add(o.sceneId);
    const text = sceneText(s, o.variantId);
    out.push({ sceneId: o.sceneId, variantId: o.variantId, hash: contentHash(text), text });
  }
  return out;
}

export interface StoredSceneAnalysis {
  readonly sceneId: string;
  readonly contentHash: string;
  readonly items: readonly AIClassification[];
}

/** Scenene som er nye eller har endret innhold siden forrige analyse. */
export function scenesNeedingAnalysis(
  scenes: readonly SceneForAnalysis[],
  stored: readonly StoredSceneAnalysis[],
): string[] {
  const byScene = new Map(stored.map((r) => [r.sceneId, r.contentHash]));
  return scenes.filter((sc) => byScene.get(sc.sceneId) !== sc.hash).map((sc) => sc.sceneId);
}

const fold = (x: string) => x.normalize("NFC").toLocaleLowerCase("und");

/** Forslagene som nevnes i en scenetekst (navn eller alternativ skrivemåte). */
export function candidatesInScene(
  suggestions: readonly LibrarySuggestion[],
  text: string,
): LibrarySuggestion[] {
  const t = fold(text);
  return suggestions.filter((sg) =>
    [sg.name, ...sg.sources.map((x) => x.name)].some((n) => n.trim() && t.includes(fold(n))),
  );
}

/**
 * AI-typene som gjelder nå: bare fra scener der hashen fortsatt stemmer. Ved flere scener med samme navn
 * vinner høyest sikkerhet. Nøkkelen er forslagets navn.
 */
export function mergeAnalysis(
  suggestions: readonly LibrarySuggestion[],
  stored: readonly StoredSceneAnalysis[],
  scenes: readonly SceneForAnalysis[],
): Record<string, AIClassification> {
  const current = new Map(scenes.map((sc) => [sc.sceneId, sc.hash]));
  const rank = { high: 3, medium: 2, low: 1 } as const;
  const byName = new Map<string, AIClassification>();
  for (const r of stored) {
    if (current.get(r.sceneId) !== r.contentHash) continue;
    for (const it of r.items) {
      const k = fold(it.name);
      const prev = byName.get(k);
      if (!prev || rank[it.confidence] > rank[prev.confidence]) byName.set(k, it);
    }
  }
  const out: Record<string, AIClassification> = {};
  for (const sg of suggestions) {
    const hit = byName.get(fold(sg.name));
    if (hit) out[sg.name] = { ...hit, name: sg.name };
  }
  return out;
}

/** Leser AI-svaret og beholder bare kjente kandidater. Ugyldig JSON gir tom liste. */
export function analysisFromJson(raw: string, candidateNames: readonly string[]): AIClassification[] {
  const known = new Set(candidateNames);
  return classificationFromJson(raw).filter((x) => known.has(x.name));
}

/** Døgntaket for den innebygde AI-en per prosjekt. */
export function dailyQuotaError(
  runsToday: number,
  limit = SERVICE_AI_RUNS_PER_PROJECT_PER_DAY,
): string | null {
  return runsToday >= limit
    ? tk("core-library-analysis-hash.daily-quota-error.message.330b7b020f3f", { limit: String(limit) })
    : null;
}

/** Låsen: en kjøring som startet for under 60 sekunder siden, hindrer en ny. */
export function lockActive(lastStartedMs: number | null, nowMs: number): boolean {
  return lastStartedMs !== null && nowMs - lastStartedMs < SERVICE_AI_LOCK_MS;
}
