/**
 * En språkmodell skriver bildebeskrivelsen (DEC-0066, REQ-0589). Mars 11.10.2026: «trenger maksimal god
 * beskrivelse» – kostnaden er godkjent.
 *
 * Grunnlaget er den samme beskrivelsen programmet setter sammen uten AI (`buildContextImagePrompt`): filmen,
 * den visuelle stilen, bildet, scenene, godkjente bilder og prosjektets egne instrukser. Språkmodellen ser
 * også bildene som sendes med (forbildene), og skriver én sammenhengende, presis beskrivelse på engelsk for
 * bildemodellen. Resultatet vises for brukeren, som kan endre det før noe sendes (REQ-0250–0256).
 *
 * Ren TypeScript (ingen nettverk): selve kallet er i `src/adapters/ai/write-prompt.functions.ts`.
 */
import { MAX_PROMPT_CHARS, type ImagePurpose } from "./prompt";

/** Lengden vi ber om (bildemodellene leser lange beskrivelser, men presisjon er bedre enn mengde). */
export const WRITTEN_PROMPT_TARGET_WORDS = "220–380";

export const PROMPT_WRITER_SYSTEM = `You are the lead art director and prompt engineer of a 2D animated feature film.
You write the single text prompt that is sent to an image-generation model (GPT Image) to create ONE production image for the film.

You receive a structured BRIEF compiled by the production software: the film (story, world, audience), the film's visual style guide (look, technique, palette, lighting, mood, design rules), what this image is and how it is used (a cut-out character layer or a full background plate), the scenes it appears in (setting, time of day, season, script excerpts – often in Norwegian), approved designs in the film, things to avoid and project-specific instructions. You may also see the images that will be attached to the image model, in the same order.

Write the best possible prompt:
- English only. Translate Norwegian names of places and things into natural English descriptions, but keep character and place NAMES as they are.
- Start with the subject and the use (e.g. "Full-figure character turnaround-ready cut-out of …" or "Wide background plate of …"), then describe concretely what is seen: shapes, silhouette, proportions, materials, clothing, props, architecture, landscape, weather, time of day and the light it gives, atmosphere.
- Turn the style guide into concrete visual instructions (medium, line quality, texture, brush/paper/cut-paper qualities, colour palette with the given colour codes, values and contrast, level of detail). Be specific; never say "in the style of the film" without saying what that style is.
- Use the script only for mood, setting and period. Never ask for characters or people in a background; never add scenery to a cut-out.
- Respect every technical requirement in the brief exactly: transparent background and full figure for cut-outs; empty space for characters, no characters and full-frame composition for backgrounds; no text, letters, logos or watermarks.
- If images are attached, refer to them as "image 1", "image 2" … exactly as the brief lists them. The identity image (if any) is the subject to keep; style references are for style only and must not be copied or included.
- Include the brief's AVOID list as a short final sentence ("Avoid: …").
- Keep the project's own instructions; they override your preferences.
- Do not invent story facts, characters or objects that contradict the brief. You may add tasteful, plausible visual detail that serves the brief.
- Aim for ${WRITTEN_PROMPT_TARGET_WORDS} words, in short paragraphs, no headings, no bullet lists, no markdown.

Reply with the prompt text only – no preamble, no explanation, no quotes.`;

export interface PromptWriterInput {
  /** Beskrivelsen programmet har satt sammen (eller brukerens egen). */
  readonly brief: string;
  readonly purpose: ImagePurpose;
  /** Hva bildene som følger med viser, i rekkefølge (samme som bildemodellen får). */
  readonly imageLabels: readonly string[];
}

/** Brukermeldingen til språkmodellen (teksten; bildene legges ved av adapteren). */
export function promptWriterUserText(i: PromptWriterInput): string {
  const use =
    i.purpose === "cutout"
      ? "A cut-out layer (character, animal or prop) on a transparent background, portrait format 2:3."
      : "A full background plate for a scene, landscape format 3:2.";
  const imgs = i.imageLabels.length
    ? `\n\nThe ${i.imageLabels.length} image(s) shown here will be attached to the image model in this order:\n${i.imageLabels
        .map((l, n) => `Image ${n + 1}: ${l}`)
        .join("\n")}`
    : "\n\nNo images will be attached to the image model.";
  return `IMAGE TO CREATE: ${use}${imgs}\n\nBRIEF:\n${i.brief.trim()}`;
}

/**
 * Svaret fra språkmodellen gjort klart: uten kodeblokk, anførselstegn og innledning («Here is …»), og
 * aldri lenger enn bildemodellen tar imot. Tomt svar → null.
 */
export function cleanWrittenPrompt(raw: string): string | null {
  let t = raw.replace(/\r\n?/g, "\n").trim();
  const fence = /^```[a-z]*\n([\s\S]*?)\n?```$/i.exec(t);
  if (fence) t = fence[1]!.trim();
  t = t.replace(/^(?:here(?:'s| is) (?:the|your|a) [^\n:]*prompt[^\n:]*:)\s*/i, "");
  t = t.replace(/^\*\*?prompt:?\*\*?:?\s*/i, "").replace(/^prompt:\s*/i, "");
  if (/^["“].*["”]$/s.test(t)) t = t.slice(1, -1).trim();
  t = t.replace(/\n{3,}/g, "\n\n");
  if (!t) return null;
  if (t.length > MAX_PROMPT_CHARS) {
    const cut = t.slice(0, MAX_PROMPT_CHARS);
    const end = cut.lastIndexOf(". ");
    t = end > MAX_PROMPT_CHARS * 0.7 ? cut.slice(0, end + 1) : cut;
  }
  return t;
}
