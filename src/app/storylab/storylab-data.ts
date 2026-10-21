/**
 * Story Lab (SL2/SL3): hjelpere for arbeidsflaten – karakterer, scener i fortellingstid, replikker og
 * kostnadsanslag for tekst-AI. Ingen lagring her.
 */
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { TEXT_PREFS_KEY, activeProfileOf, approxTokens, assetNames, blocksOfVariant, canHaveStoryProfile, catalogSettings, chooseTextModel, cleanSpeaker, estimateTextCostUsd, formatHeading, isModelEnabled, isTextPrefs, mainProduction, mainSceneNumbers, nameKey, orderedOccurrences, providerInfo, storyTimes, type Asset, type ProjectState, type TextPrefs, type TextTask } from "@/core";
import { listTextChoices } from "@/adapters/ai/provider-keys.functions";
import { useUiPref } from "@/app/account/ui-prefs";
import { t as tk } from "@/core/i18n/keyed";

/** Karakterer og dyr (de eneste som kan ha profil), sortert etter navn. */
export function storyCharacters(s: ProjectState): Asset[] {
  return Object.values(s.assets)
    .filter((a) => canHaveStoryProfile(a.kind) && !a.archived && !(a as { removed?: boolean }).removed)
    .sort((a, b) => a.name.localeCompare(b.name, "nb"));
}

export type ProfileStatus = "active" | "missing" | "removed";
export function profileStatus(s: ProjectState, assetId: string): ProfileStatus {
  if (activeProfileOf(s, assetId)) return "active";
  return Object.values(s.storyProfiles).some((p) => p.assetId === assetId) ? "removed" : "missing";
}

export interface StoryScene {
  readonly sceneId: string;
  readonly label: string;
}

/** Hovedfilmens scener sortert etter fortellingstid (ikke visningsrekkefølge). */
export function scenesByStoryTime(s: ProjectState): StoryScene[] {
  const main = mainProduction(s);
  if (!main) return [];
  const times = storyTimes(s);
  const nums = mainSceneNumbers(s);
  const seen = new Set<string>();
  const out: { sceneId: string; label: string; t: number; i: number }[] = [];
  orderedOccurrences(s, main.id).forEach((o, i) => {
    if (seen.has(o.sceneId)) return;
    seen.add(o.sceneId);
    const v = s.variants[o.variantId];
    const n = nums.get(o.sceneId);
    out.push({
      sceneId: o.sceneId,
      label: `${n ? `${n}. ` : ""}${v ? formatHeading(v.heading) : ""}`.trim(),
      t: times.get(o.sceneId) ?? i,
      i,
    });
  });
  return out.sort((a, b) => a.t - b.t || a.i - b.i).map(({ sceneId, label }) => ({ sceneId, label }));
}

export function sceneLabel(s: ProjectState, sceneId: string | null): string {
  if (!sceneId) return tk("app-storylab-storylab-data.scene-label.message.01d878b5988f");
  return (
    scenesByStoryTime(s).find((x) => x.sceneId === sceneId)?.label ?? tk("app-storylab-storylab-data.scene-label.message.8df54761728a")
  );
}

/** Scene-ID fra en scene- eller forekomst-ID (lenkene fra manus og sceneeditor). */
export function sceneIdFrom(s: ProjectState, id: string | undefined): string | null {
  if (!id) return null;
  if (s.scenes[id]) return id;
  return s.occurrences[id]?.sceneId ?? null;
}

/** Karakterens replikker i hovedfilmen (talernavn mot ressursens navn og alternative navn). */
export function characterLines(s: ProjectState, asset: Asset, max = 200): string[] {
  const main = mainProduction(s);
  if (!main) return [];
  const keys = new Set(assetNames(asset).map(nameKey));
  const out: string[] = [];
  for (const o of orderedOccurrences(s, main.id)) {
    if (!o.active) continue;
    let speaking = false;
    for (const b of blocksOfVariant(s, o.variantId)) {
      if (b.kind === "character") speaking = cleanSpeaker(b.text).names.some((n) => keys.has(nameKey(n)));
      else if (b.kind === "dialogue" && speaking && b.text.trim()) out.push(b.text.trim());
      else if (b.kind !== "parenthetical") speaking = false;
      if (out.length >= max) return out;
    }
  }
  return out;
}

export function names(s: ProjectState): Record<string, string> {
  return Object.fromEntries(Object.values(s.assets).map((a) => [a.id, a.name]));
}

/** USD med opptil fire desimaler (små tekstkall). */
export function usd(n: number): string {
  if (!Number.isFinite(n)) return tk("app-storylab-storylab-data.usd.message.fef5635bbc16");
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
}

export interface TextEstimate {
  readonly loading: boolean;
  readonly error: string | null;
  /** «Claude Sonnet 4.5 (Anthropic)» eller den innebygde AI-en. */
  readonly label: string;
  readonly usd: number;
  readonly builtIn: boolean;
}

/** Anslått leverandør, modell og kostnad for et tekstkall (samme valg som serveren gjør). */
export function useTextEstimate(task: TextTask, inputChars: number, outputTokens: number): TextEstimate {
  const list = useServerFn(listTextChoices);
  const choices = useQuery({ queryKey: ["text-ai-choices"], queryFn: () => list() });
  const [prefs] = useUiPref<TextPrefs>(TEXT_PREFS_KEY, {}, isTextPrefs);
  if (choices.isLoading) return { loading: true, error: null, label: "", usd: 0, builtIn: false };
  const settings = catalogSettings();
  const r = chooseTextModel({
    task,
    prefs,
    available: choices.data?.providers ?? [],
    isEnabled: (p, m) => (p === "lovable" ? true : isModelEnabled(settings, p, m)),
    lovableModel: "built-in",
  });
  if (r.error !== undefined) return { loading: false, error: r.error, label: "", usd: 0, builtIn: false };
  const builtIn = r.choice.provider === "lovable";
  const info = builtIn ? undefined : providerInfo(r.choice.provider);
  const model = info?.models.find((m) => m.id === r.choice.model);
  return {
    loading: false,
    error: null,
    builtIn,
    label: builtIn
      ? tk("app-storylab-storylab-data.label.label.6c13d1c763ca")
      : `${model?.label ?? r.choice.model} (${info?.name ?? r.choice.provider})`,
    usd: estimateTextCostUsd(r.choice.provider, r.choice.model, Math.ceil(inputChars / 4), outputTokens),
  };
}

export { approxTokens };
