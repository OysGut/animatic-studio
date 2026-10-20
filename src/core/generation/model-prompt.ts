/**
 * Modellspesifikk beskrivelse (mandat 18 og 19.2, REQ-0246, REQ-0261, REQ-0274, REQ-0489, DEC-0070).
 *
 * Modellene tar imot ulike lengder og har ulike muligheter. Før sending tilpasses beskrivelsen modellen:
 * - Modeller uten lyd får replikkene som munnbevegelser (ordrett, men uten krav om tale og aldri som tekst).
 * - Er teksten for lang, tas de minst viktige delene bort først (stilnotater, kamera, fargepalett …);
 *   handling, replikker, sted og figurer beholdes så lenge det går. Til slutt kortes teksten ved et linjeskift.
 * Brukeren ser alltid den tilpassede teksten før den sendes (synlige beskrivelser), og hva som ble endret.
 */
import type { ProviderModel } from "./providers";

import { t, tLocalized } from "@/core/i18n/keyed";

interface Section {
  readonly key: string;
  readonly lines: string[];
}

/** Hvor lett en del kan tas bort (høyere tas bort først); 0 tas aldri bort. */
const RULES: readonly { readonly match: RegExp; readonly key: string; readonly rank: number }[] = [
  { match: /^Animated film shot/, key: "intro", rank: 0 },
  { match: /^(Segment \d+ of|Length:)/, key: "length", rank: 0 },
  { match: /^What happens/, key: "action", rank: 0 },
  { match: /^Dialogue/, key: "dialogue", rank: 0 },
  { match: /^Setting:/, key: "setting", rank: 1 },
  { match: /^In this shot:/, key: "figures", rank: 1 },
  { match: /^Style:/, key: "style", rank: 2 },
  { match: /^Continuity:/, key: "continuity", rank: 2 },
  { match: /^No on-screen text/, key: "notext", rank: 2 },
  { match: /^Film look:/, key: "look", rank: 3 },
  { match: /^Camera/, key: "camera", rank: 3 },
  { match: /^Technique:/, key: "technique", rank: 4 },
  { match: /^Lighting:/, key: "lighting", rank: 4 },
  { match: /^Mood:/, key: "mood", rank: 4 },
  { match: /^End on a stable frame/, key: "endframe", rank: 4 },
  { match: /^Colour palette:/, key: "palette", rank: 5 },
  { match: /^Avoid:/, key: "avoid", rank: 5 },
];

const KEY_LABEL: Record<string, string> = tLocalized({ setting: "core-generation-model-prompt.key-label.setting.9c25472ea6d9", figures: "core-generation-model-prompt.key-label.figures.9c224a0a2a61", style: "core-generation-model-prompt.key-label.style.e37ec6d8e593", continuity: "core-generation-model-prompt.key-label.continuity.674d66f6b602", notext: "core-generation-model-prompt.key-label.notext.7fbdc6471989", look: "core-generation-model-prompt.key-label.look.47927c4b9a36", camera: "core-generation-model-prompt.key-label.camera.ab90fc737b5b", technique: "core-generation-model-prompt.key-label.technique.f9d432ec955c", lighting: "core-generation-model-prompt.key-label.lighting.7a6acd5449a7", mood: "core-generation-model-prompt.key-label.mood.0f21b2d60d11", endframe: "core-generation-model-prompt.key-label.endframe.ae6a91371118", palette: "core-generation-model-prompt.key-label.palette.754b90f69bef", avoid: "core-generation-model-prompt.key-label.avoid.d63806717a72", other: "core-generation-model-prompt.key-label.other.8525b5e0a666" });

function sections(text: string): Section[] {
  const out: Section[] = [];
  for (const line of text.split("\n")) {
    const isBullet = /^\s*-\s/.test(line);
    if (isBullet && out.length) {
      out[out.length - 1]!.lines.push(line);
      continue;
    }
    const rule = RULES.find((r) => r.match.test(line.trim()));
    out.push({ key: rule?.key ?? "other", lines: [line] });
  }
  return out;
}

const rankOf = (key: string) => RULES.find((r) => r.key === key)?.rank ?? 1;
const join = (ss: readonly Section[]) =>
  ss
    .map((x) => x.lines.join("\n"))
    .join("\n")
    .trim();

export interface AdaptedPrompt {
  /** Teksten som sendes. */
  readonly text: string;
  /** Hva som ble endret, på norsk (tom = sendes som den er). */
  readonly notes: readonly string[];
  readonly originalLength: number;
  /** Kan ikke sendes uten å kutte replikker (de må være ordrette). */
  readonly blocked?: boolean;
}

/** Har videomodellen lyd? (Modeller uten lyd får replikkene som munnbevegelser.) */
export function modelHasSound(model: ProviderModel): boolean {
  return (
    model.capability !== "video" ||
    (model.extras ?? []).some((e) => e === "Lyd i videoen" || e === "Sound in the video") // i18n-ignore
  );
}

export function adaptPromptForModel(text: string, model: ProviderModel): AdaptedPrompt {
  const notes: string[] = [];
  let blocked = false;
  let ss = sections(text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n"));
  if (!modelHasSound(model)) {
    const d = ss.find((x) => x.key === "dialogue");
    if (d) {
      d.lines[0] =
        "Dialogue (for lip movement and acting only — this video has no sound; never show the words as text):";
      notes.push(
        t("core-generation-model-prompt.adapt-prompt-for-model.notes-push.399a41a9f535"),
      );
    }
  }
  const max = model.maxPromptChars ?? Number.POSITIVE_INFINITY;
  let out = join(ss);
  if (out.length > max) {
    const removed: string[] = [];
    // Ta bort de minst viktige delene først (sist i teksten først ved likt nivå)
    for (const rank of [5, 4, 3, 2, 1]) {
      for (let i = ss.length - 1; i >= 0 && join(ss).length > max; i--) {
        const sec = ss[i]!;
        if (rankOf(sec.key) !== rank || sec.key === "other") continue;
        removed.push(KEY_LABEL[sec.key] ?? sec.key);
        ss = ss.filter((_, j) => j !== i);
      }
      if (join(ss).length <= max) break;
    }
    out = join(ss);
    if (removed.length)
      notes.push(
        t("core-generation-model-prompt.adapt-prompt-for-model.notes-push.c3dd95ca17ef", { max: String(max), value2: String([...new Set(removed)].join(", ")) }),
      );
    if (out.length > max) {
      // Replikkene skal sendes ordrett: kort ned alt annet (lengste linje først), så ta bort linjer bakfra
      const editable = ss.filter((x) => x.key !== "dialogue");
      const lines = () =>
        editable
          .flatMap((x) => x.lines.map((_, i) => ({ sec: x, i })))
          .filter(({ sec, i }) => sec.lines[i]!.length > 81);
      for (let guard = 0; join(ss).length > max && guard < 500; guard++) {
        const long = lines().sort((a, b) => b.sec.lines[b.i]!.length - a.sec.lines[a.i]!.length)[0];
        if (!long) break;
        const l = long.sec.lines[long.i]!;
        long.sec.lines[long.i] =
          `${l.slice(0, Math.max(80, l.length - (join(ss).length - max) - 1)).trimEnd()}…`;
      }
      for (const sec of [...editable].reverse()) {
        while (join(ss).length > max && sec.lines.length > 1) sec.lines.pop();
      }
      // Så hele deler bakfra (aldri replikkene, innledningen eller lengden)
      for (let i = ss.length - 1; i >= 0 && join(ss).length > max; i--) {
        const k = ss[i]!.key;
        if (k === "dialogue" || k === "intro" || k === "length") continue;
        ss = ss.filter((_, j) => j !== i);
      }
      ss = ss.filter(
        (x) =>
          x.key === "dialogue" ||
          x.key === "intro" ||
          x.lines.length > 1 ||
          !/:$/.test(x.lines[0] ?? ""),
      );
      out = join(ss);
      notes.push(
        t("core-generation-model-prompt.adapt-prompt-for-model.notes-push.57abab561801", { length: String(out.length) }),
      );
      if (out.length > max) {
        blocked = true;
        notes.push(
          t("core-generation-model-prompt.adapt-prompt-for-model.notes-push.e0b072e0675d"),
        );
      }
    }
  }
  return { text: out, notes, originalLength: text.length, ...(blocked ? { blocked } : {}) };
}
