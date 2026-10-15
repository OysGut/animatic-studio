/**
 * Valg av bildemodell for AI-verktøyene i stor visning (DEC-0080, Mars 15.10.2026): modellene som tar imot
 * et forbilde, foretrukket modell, størrelse, prisanslag og sideforhold. Felles for vinkler, variasjoner og
 * deler.
 */
import { useState } from "react";
import {
  estimateCostUsd,
  imageSizesOf,
  promptFamilyOf,
  providerModel,
  providersFor,
  type ImageSize,
} from "@/core";
import { useProjectProviders } from "@/app/ai/use-project-providers";

/** Modellene som kan lage et bilde fra et forbilde (alle bildemodeller tar imot forbilder). */
export function useImageChoices(projectId: string, enabled: boolean) {
  const available = useProjectProviders(projectId, enabled);
  return providersFor("image", new Set(available.data?.providers ?? [])).flatMap((o) =>
    o.models
      .filter((m) => m.acceptsImage)
      .map((m) => ({ provider: o.provider, model: m, key: `${o.provider.id}|${m.id}` })),
  );
}

/** Foretrukket modell for vinkler: Nano Banana Pro, så Seedream, så det som finnes. */
export function preferredFor(keys: readonly string[]): string {
  for (const k of ["google|gemini-3-pro-image", "fal|fal-ai/bytedance/seedream/v4.5"])
    if (keys.includes(k)) return k;
  return keys[0] ?? "";
}

/** Sideforholdet nærmest bildets eget (så variasjonen får samme form). */
export function nearestAspect(
  w: number | null | undefined,
  h: number | null | undefined,
): "2:3" | "3:2" | "1:1" | "16:9" | null {
  if (!w || !h) return null;
  const r = w / h;
  const opts = [
    ["2:3", 2 / 3],
    ["1:1", 1],
    ["3:2", 3 / 2],
    ["16:9", 16 / 9],
  ] as const;
  let best: (typeof opts)[number] = opts[0];
  for (const o of opts)
    if (Math.abs(Math.log(r / o[1])) < Math.abs(Math.log(r / best[1]))) best = o;
  return best[0];
}

/**
 * Modell, størrelse og pris for en bildejobb med forbilde (felles for variasjoner og deler, samme valg som
 * «Lag andre vinkler»).
 */
export function useImageModel(projectId: string, enabled: boolean) {
  const choices = useImageChoices(projectId, enabled);
  const [pick, setPick] = useState<string | null>(null);
  const key =
    pick && choices.some((c) => c.key === pick) ? pick : preferredFor(choices.map((c) => c.key));
  const choice = choices.find((c) => c.key === key) ?? null;
  const [sizePick, setSizePick] = useState<ImageSize | null>(null);
  const model = choice ? providerModel(choice.provider.id, choice.model.id) : undefined;
  const sizes = imageSizesOf(model);
  const size = sizePick && sizes.sizes.includes(sizePick) ? sizePick : sizes.standard;
  const unit =
    choice && choice.provider.id !== "lovable"
      ? estimateCostUsd(choice.provider.id, choice.model.id, size ? { size } : {})
      : null;
  const family = promptFamilyOf(choice?.provider.id ?? "lovable", choice?.model.id);
  return { choices, key, setPick, choice, model, sizes, size, setSizePick, unit, family };
}
export type ImageModelPick = ReturnType<typeof useImageModel>;
