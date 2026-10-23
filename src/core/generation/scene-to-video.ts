/**
 * AI-video fra 2D-scenen (DEC-0083, Mars 15.10.2026): 2D-scenen sendes som video til en modell som tegner
 * den om til ferdig film. Bevegelse, plassering, timing og kamera følger 2D-scenen; utseendet kommer fra
 * filmens visuelle stil, figurenes beskrivelser og referansebilder og scenens egne instrukser.
 *
 * - Bare bildet erstattes: modellen lager ingen lyd, og resultatet legges inn uten lyd. Scenens egne
 *   lydklipp (replikker, effekter, musikk) spilles som før.
 * - Lange scener deles i like lange biter innenfor modellens grenser. Bitene settes sammen etter hverandre
 *   når brukeren velger resultatet for scenen.
 * - Ingenting kastes: hvert resultat er en ny versjon av scenen, og brukeren velger hva som viser scenen.
 * Beskrivelsen er på engelsk (REQ-0015); manusets tekst og navn står som de er.
 *
 * DEC-0085: kilden kan også være en tidligere AI-video eller opplastet film (det scenen viser), scenens lyd
 * kan sendes med, bakgrunn og figurer sendes som referansebilder (et samlebilde når de er flere enn modellen
 * tar imot), og beskrivelsen består av den globale beskrivelsen for prosjektet (kan slås av) og en
 * scenebeskrivelse laget fra manuset (kan redigeres og lagres på scenen).
 */
import type { ClipPartFields } from "../commands/types";
import { takeIdOfFilmPath } from "../library/storage-paths";
import type { AssetKind, ProjectState, Take } from "../model";
import type { FilmClip } from "../assembly/film";
import type { ProviderModel } from "./providers";
import type { GenerationJob } from "./cost";
import { styleProfileFor } from "./style";
import { blockSpans } from "../assembly/film";
import { blocksOfVariant } from "../views";
import { formatHeading } from "../screenplay/paginate";
import { assetsInScene } from "../library";
import { compositionOfVariant } from "../composition/render";
import { continuityFor } from "../continuity";
import { cameraText, describeAsset } from "./scene-prompt";
import { sceneSetting } from "./image-prompt";
import { keysEvenly } from "../order-key";
import { framesToSeconds, secondsToFrames } from "../time";

import { t as tk } from "@/core/i18n/keyed";

/** Kilden jobben ble laget fra (`params.source` i generation_jobs). */
export const SCENE_VIDEO_SOURCE = "scene2d";

/**
 * Mappen i lagringen der 2D-scenen legges før den sendes: `<prosjekt>/temp/ai-source/<bunt>/<bit>.mp4`
 * (midlertidige filer, KI-178). Eldre filer ligger i `<prosjekt>/ai-source/…` og godtas fortsatt.
 */
export const SCENE_VIDEO_FOLDER = "temp/ai-source";
const OLD_SCENE_VIDEO_FOLDER = "ai-source";
const inSceneVideoFolder = (projectId: string, p: string) =>
  p.startsWith(`${projectId}/${SCENE_VIDEO_FOLDER}/`) ||
  p.startsWith(`${projectId}/${OLD_SCENE_VIDEO_FOLDER}/`);

export function sceneVideoSourcePath(projectId: string, batchId: string, index: number): string {
  return `${projectId}/${SCENE_VIDEO_FOLDER}/${batchId}/${index + 1}.mp4`;
}

/** Hører stien til en 2D-scene som er lagt klar for sending i dette prosjektet? */
export function isSceneVideoSourcePath(projectId: string, p: unknown): p is string {
  return (
    typeof p === "string" &&
    inSceneVideoFolder(projectId, p) &&
    p.endsWith(".mp4") &&
    !p.includes("..") &&
    p.length <= 300
  );
}

/** Samlebilde av figurer eller annet referansebilde laget for en bunt (`…/ai-source/<bunt>/ref-N.png`). */
export function sceneVideoRefPath(projectId: string, batchId: string, n: number): string {
  return `${projectId}/${SCENE_VIDEO_FOLDER}/${batchId}/ref-${n + 1}.png`;
}

export function isSceneVideoRefPath(projectId: string, p: unknown): p is string {
  return (
    typeof p === "string" &&
    inSceneVideoFolder(projectId, p) &&
    p.endsWith(".png") &&
    !p.includes("..") &&
    p.length <= 300
  );
}

// ---------------------------------------------------------------- Biter

/** En bit av scenen som sendes for seg: bilder [startFrame, endFrame) i scenen. */
export interface ScenePiece {
  readonly index: number;
  readonly startFrame: number;
  readonly endFrame: number;
  readonly startMs: number;
  readonly endMs: number;
  /** Sekunder leverandøren tar betalt for (lengden rundet opp, minst modellens korteste). */
  readonly billedSeconds: number;
}

export type PiecePlan =
  | { readonly ok: true; readonly pieces: readonly ScenePiece[] }
  | { readonly ok: false; readonly message: string };

/**
 * Del scenen i like lange biter som modellen tar imot (DEC-0083). Hele scenen dekkes; grensene ligger på
 * hele bilder. En scene kortere enn modellens korteste lengde kan ikke sendes.
 */
export function planScenePieces(
  durationFrames: number,
  fps: { readonly num: number; readonly den: number },
  model: Pick<ProviderModel, "editSeconds">,
): PiecePlan {
  const range = model.editSeconds;
  if (!range)
    return {
      ok: false,
      message: tk("core-generation-scene-to-video.message.message.2d18d510df3e"),
    };
  const seconds = framesToSeconds(durationFrames, fps);
  if (!(durationFrames > 0) || seconds + 1e-6 < range.min)
    return {
      ok: false,
      message: tk("core-generation-scene-to-video.message.message.5a99d53cca31", { value1: String(seconds.toFixed(1)), min: String(range.min) }),
    };
  const count = Math.max(1, Math.ceil(seconds / range.max - 1e-9));
  const maxFrames = Math.max(1, Math.floor(secondsToFrames(range.max, fps)));
  const pieces: ScenePiece[] = [];
  for (let i = 0; i < count; i++) {
    const startFrame = Math.round((durationFrames * i) / count);
    const endFrame = Math.min(
      startFrame + maxFrames,
      i === count - 1 ? durationFrames : Math.round((durationFrames * (i + 1)) / count),
    );
    const startMs = Math.round(framesToSeconds(startFrame, fps) * 1000);
    const endMs = Math.round(framesToSeconds(endFrame, fps) * 1000);
    pieces.push({
      index: i,
      startFrame,
      endFrame,
      startMs,
      endMs,
      billedSeconds: Math.max(range.min, Math.ceil((endMs - startMs) / 1000 - 1e-6)),
    });
  }
  return { ok: true, pieces };
}

// ---------------------------------------------------------------- Figurene

/** En figur i scenen som modellen skal holde lik: navn, beskrivelse og referansebilde. */
export interface SceneCastMember {
  readonly assetId: string;
  readonly name: string;
  readonly kind: AssetKind;
  /** Beskrivelsen (engelsk/manusets ord) med utseendet som gjelder i scenen. */
  readonly description: string;
  /** Det visuelle faktaarket (DEC-0080), eller tom. */
  readonly visualBrief: string;
  /** Referansebildet (sti i bøtta «assets»), eller null. */
  readonly imagePath: string | null;
  /** Figuren er et lag i 2D-scenen (ikke bare nevnt i manuset). */
  readonly inComposition: boolean;
}

const FIGURE_KINDS: ReadonlySet<AssetKind> = new Set(["character", "animal", "object", "other"]);

/**
 * Figurene i scenen (DEC-0083): lagene i 2D-scenen først (med bildet laget viser), så andre figurer
 * manuset knytter til scenen (med godkjent bilde). Steder og miljøer er bakgrunnen i 2D-scenen og tas
 * ikke med som figurer.
 */
export function sceneCast(
  s: ProjectState,
  productionId: string,
  occurrenceId: string,
): SceneCastMember[] {
  const occ = s.occurrences[occurrenceId];
  if (!occ) return [];
  const comp = compositionOfVariant(s, occ.variantId);
  const imageOf = (versionId: string | null | undefined) => {
    const v = versionId ? s.assetVersions[versionId] : undefined;
    return v && !v.removed && v.mimeType.startsWith("image/") ? v.mediaPath : null;
  };
  const approvedImage = (assetId: string, variantId?: string | null) => {
    const chosen = variantId ? s.assetVariants[variantId] : undefined;
    const fromChosen = imageOf(chosen?.approvedVersionId);
    if (fromChosen) return fromChosen;
    for (const v of Object.values(s.assetVariants)
      .filter((x) => x.assetId === assetId && !x.archived)
      .sort((a, b) => a.id.localeCompare(b.id))) {
      const p = imageOf(v.approvedVersionId);
      if (p) return p;
    }
    return null;
  };
  const blocks = blocksOfVariant(s, occ.variantId);
  const at = { sceneId: occ.sceneId, blockId: blocks[0]?.id ?? null };
  const cs = continuityFor(s, productionId);
  const out: SceneCastMember[] = [];
  const seen = new Set<string>();
  const add = (assetId: string, imagePath: string | null, inComposition: boolean) => {
    const a = s.assets[assetId];
    if (!a || a.removed || a.archived || !FIGURE_KINDS.has(a.kind) || seen.has(a.id)) return;
    seen.add(a.id);
    out.push({
      assetId: a.id,
      name: a.name,
      kind: a.kind,
      description: describeAsset(cs, a.id, at),
      visualBrief: (a.visualBrief ?? "").trim(),
      imagePath,
      inComposition,
    });
  };
  for (const layer of comp ? Object.values(s.layers) : []) {
    if (layer.compositionId !== comp!.id || layer.removed || !layer.assetId) continue;
    add(
      layer.assetId,
      imageOf(layer.versionId) ?? approvedImage(layer.assetId, layer.assetVariantId),
      true,
    );
  }
  for (const { asset } of assetsInScene(s, productionId, occurrenceId))
    add(asset.id, approvedImage(asset.id), false);
  // Karakterer først, så figurer som er i 2D-scenen
  const rank = (m: SceneCastMember) =>
    (m.kind === "character" ? 0 : m.kind === "animal" ? 1 : 2) * 2 + (m.inComposition ? 0 : 1);
  return out.sort((a, b) => rank(a) - rank(b));
}

/** Figurene som sendes med referansebilde (høyst så mange modellen tar imot). */
export function castWithImages(
  cast: readonly SceneCastMember[],
  model: Pick<ProviderModel, "maxElements">,
): SceneCastMember[] {
  const max = model.maxElements ?? 0;
  return cast.filter((m) => m.imagePath).slice(0, Math.max(0, max));
}

/** Bakgrunnen i scenen (stedet eller miljøet) med bilde, eller null. */
export interface SceneBackground {
  readonly assetId: string;
  readonly name: string;
  readonly imagePath: string;
}

export function sceneBackground(
  s: ProjectState,
  productionId: string,
  occurrenceId: string,
): SceneBackground | null {
  const occ = s.occurrences[occurrenceId];
  if (!occ) return null;
  const imageOf = (versionId: string | null | undefined) => {
    const v = versionId ? s.assetVersions[versionId] : undefined;
    return v && !v.removed && v.mimeType.startsWith("image/") ? v.mediaPath : null;
  };
  const isPlace = (kind: AssetKind | undefined) => kind === "location" || kind === "environment";
  const comp = compositionOfVariant(s, occ.variantId);
  if (comp)
    for (const l of Object.values(s.layers)
      .filter((x) => x.compositionId === comp.id && !x.removed && x.assetId)
      .sort((a, b) => (a.orderKey < b.orderKey ? -1 : 1))) {
      const a = s.assets[l.assetId!];
      if (!a || !isPlace(a.kind)) continue;
      const img =
        imageOf(l.versionId) ??
        imageOf(l.assetVariantId ? s.assetVariants[l.assetVariantId]?.approvedVersionId : null);
      if (img) return { assetId: a.id, name: a.name, imagePath: img };
    }
  for (const { asset } of assetsInScene(s, productionId, occurrenceId)) {
    if (!isPlace(asset.kind)) continue;
    for (const v of Object.values(s.assetVariants).filter(
      (x) => x.assetId === asset.id && !x.archived,
    )) {
      const img = imageOf(v.approvedVersionId);
      if (img) return { assetId: asset.id, name: asset.name, imagePath: img };
    }
  }
  return null;
}

/**
 * Referansebildene som sendes (DEC-0085), høyst `maxElements` til sammen:
 * - figurer som egne elementer (@Element1 …) – karakterer først,
 * - bakgrunnen som eget bilde (@Image1),
 * - er figurene flere enn det er plass til, settes resten sammen i ett samlebilde (@ImageN) med navn.
 */
export interface ReferencePlan {
  readonly elements: readonly SceneCastMember[];
  readonly background: SceneBackground | null;
  /** Figurene i samlebildet (tom = ingen samlebilde). */
  readonly sheet: readonly SceneCastMember[];
}

export function planReferences(
  figures: readonly SceneCastMember[],
  background: SceneBackground | null,
  model: Pick<ProviderModel, "maxElements">,
): ReferencePlan {
  const slots = Math.max(0, model.maxElements ?? 0);
  const withImage = figures.filter((m) => m.imagePath);
  if (slots === 0) return { elements: [], background: null, sheet: [] };
  const bg = background && slots > 1 ? background : null;
  const free = slots - (bg ? 1 : 0);
  if (withImage.length <= free) return { elements: withImage, background: bg, sheet: [] };
  // Én plass til samlebildet; resten som egne figurer
  const own = Math.max(0, free - 1);
  return { elements: withImage.slice(0, own), background: bg, sheet: withImage.slice(own) };
}

/** Hvor mange bilder planen sender (figurer + bakgrunn + samlebilde). */
export function referenceCount(p: ReferencePlan): number {
  return p.elements.length + (p.background ? 1 : 0) + (p.sheet.length ? 1 : 0);
}

// ---------------------------------------------------------------- Scenebeskrivelsen

/**
 * Scenebeskrivelsen laget fra manuset uten AI (DEC-0085), i formen videomodellene anbefaler: sted og tid,
 * hvem som er med, hva som skjer, kamera, lys og stemning. Engelske overskrifter; manusets tekst som den er.
 */
export function sceneDescriptionFromScript(
  s: ProjectState,
  productionId: string,
  clip: FilmClip,
  cast: readonly SceneCastMember[],
): string {
  const set = sceneSetting(s, clip.variantId);
  const lines: string[] = [];
  const place = [
    set.intExt ? set.intExt[0]!.toUpperCase() + set.intExt.slice(1) : null,
    clip.heading.location.trim() || null,
    set.time,
    set.seasons.length ? set.seasons.join(", ") : null,
  ].filter(Boolean);
  if (place.length) lines.push(`Scene: ${place.join(", ")}.`);
  const who = cast.filter((m) => m.kind === "character" || m.kind === "animal");
  if (who.length) lines.push(`Characters: ${who.map((m) => m.name).join(", ")}.`);
  const blocks = blocksOfVariant(s, clip.variantId);
  const action = blocks
    .filter((b) => b.kind === "action" || b.kind === "shot")
    .map((b) => b.text.trim().replace(/\s+/g, " "))
    .filter(Boolean);
  if (action.length) lines.push(`Action: ${action.join(" ")}`);
  // Hvem som snakker og hvordan (parentesene), uten replikkene selv
  const beats: string[] = [];
  let speaker = "";
  let paren = "";
  for (const b of blocks) {
    if (b.kind === "character") {
      speaker = b.text.trim();
      paren = "";
    } else if (b.kind === "parenthetical") paren = b.text.trim().replace(/^\(|\)$/g, "");
    else if (b.kind === "dialogue" && speaker) {
      beats.push(paren ? `${speaker} (${paren})` : speaker);
      paren = "";
    }
  }
  if (beats.length) lines.push(`Speaking, in order: ${beats.join(", ")}.`);
  const ms = Math.round(framesToSeconds(clip.durationFrames, s.project.fps) * 1000);
  const cam = cameraText(s, clip, 0, ms);
  if (cam.length) lines.push(`Camera: ${cam.join(" ")}`);
  const g = styleProfileFor(s, "ai_video")?.guide;
  const mood = g?.mood.trim();
  const light = set.light ?? g?.lighting.trim();
  if (light || mood)
    lines.push(
      `Lighting and atmosphere: ${[light, mood].filter(Boolean).join("; ").replace(/\s+/g, " ")}.`,
    );
  void productionId;
  return lines.join("\n");
}

/** Systeminstruks når en språkmodell skriver scenebeskrivelsen (DEC-0085, «Skriv med AI»). */
export const SCENE_DESCRIPTION_SYSTEM = `You are the director of a 2D animated feature film. You write the SCENE DESCRIPTION that an AI video model (Kling, Runway Aleph) will follow when it redraws the animatic of one scene as a finished shot.

Follow the structure the video models recommend, one short paragraph per line, in English:
Scene: place, interior/exterior, time of day, season and weather.
Characters: who is in the shot and how they look right now (only what can be seen).
Action: what happens, in order, with clear verbs and the acting (emotion, gestures, glances).
Camera: framing and movement as in the animatic.
Lighting and atmosphere: light sources, colour of the light, mood.

Rules:
- Use only what the material says or clearly implies. Do not invent events, characters or objects.
- Keep names exactly as written. Do not quote or translate the dialogue; describe who speaks and how.
- Positive phrasing (describe what should be there, not what should not).
- No text, captions or subtitles in the picture. At most 900 characters.

Reply with the description only.`;

/** Brukermeldingen til språkmodellen: alt manuset og prosjektet vet om scenen. */
export function sceneDescriptionUserText(
  s: ProjectState,
  clip: FilmClip,
  draft: string,
  cast: readonly SceneCastMember[],
): string {
  const blocks = blocksOfVariant(s, clip.variantId);
  const script = blocks
    .map((b) => {
      const t = b.text.trim();
      if (!t) return "";
      if (b.kind === "character") return `\n${t.toUpperCase()}`;
      if (b.kind === "parenthetical") return `(${t.replace(/^\(|\)$/g, "")})`;
      return t;
    })
    .filter(Boolean)
    .join("\n")
    .slice(0, 6000);
  return [
    `SCENE HEADING: ${formatHeading(clip.heading)}`,
    cast.length
      ? `FIGURES (from the library):\n${cast
          .map(
            (m) =>
              `- ${m.description}${m.visualBrief ? ` Look: ${m.visualBrief.replace(/\s*\n\s*-?\s*/g, "; ")}` : ""}`,
          )
          .join("\n")}`
      : "",
    `SCREENPLAY (in the film's original language, the scene in full):\n${script}`,
    draft.trim() ? `DRAFT MADE FROM THE SCREENPLAY (improve it):\n${draft.trim()}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

// ---------------------------------------------------------------- Beskrivelsen

export interface SceneVideoPromptInput {
  readonly clip: FilmClip;
  readonly productionId: string;
  readonly piece: ScenePiece;
  readonly count: number;
  /** Alle figurene i scenen (beskrives med tekst). */
  readonly cast: readonly SceneCastMember[];
  /** Referansebildene som sendes (figurer, bakgrunn, samlebilde). Tom plan = bare tekst. */
  readonly refs: ReferencePlan;
  /** Den globale beskrivelsen for prosjektet (styleText), eller null når den er slått av. */
  readonly globalStyle: string | null;
  /** Scenebeskrivelsen (lagret på scenen, ellers laget fra manuset). */
  readonly sceneDescription: string;
  /** Modellen tar imot referanser med navn (Kling: @Video1/@Element1/@Image1); ellers bare tekst. */
  readonly references: boolean;
  /** Scenens lyd er med i videoen som sendes (for munnbevegelser og timing). */
  readonly withAudio?: boolean;
  /** Det som sendes, er en film (AI-video eller opplastet) – ikke 2D-scenen. */
  readonly fromFilm?: boolean;
}

/** Blokkene som skjer i biten (etter tidene i scenen). */
function blocksInPiece(s: ProjectState, clip: FilmClip, piece: ScenePiece) {
  const startF = clip.startFrame + piece.startFrame;
  const endF = clip.startFrame + piece.endFrame;
  const ids = new Set(
    blockSpans(s, clip)
      .filter((b) => b.startFrame < endF && b.endFrame > startF)
      .map((b) => b.blockId as string),
  );
  return blocksOfVariant(s, clip.variantId).filter((b) => ids.has(b.id));
}

/**
 * Beskrivelsen for én bit (engelsk). Delene har en viktighet: med `maxChars` (modellens grense) tas de minst
 * viktige bort først – manusets handling og replikker for biten, så figurenes utseende og den globale
 * beskrivelsen. Innledningen, «behold alt som skjer», lengden og scenebeskrivelsen beholdes.
 */
export function buildSceneVideoPrompt(
  s: ProjectState,
  i: SceneVideoPromptInput & { readonly maxChars?: number | undefined },
): string {
  const { clip, piece } = i;
  const video = i.references ? "@Video1" : "the input video";
  const secs = ((piece.endMs - piece.startMs) / 1000).toFixed(1);
  const parts: { rank: number; lines: string[] }[] = [];
  const part = (rank: number, ...lines: string[]) => parts.push({ rank, lines });
  part(
    0,
    `Animated film shot: redraw ${video} as a finished shot of the animated film "${s.project.name}", scene ${clip.productionNumber ?? ""} (${formatHeading(clip.heading)}).`.replace(
      "scene  (",
      "scene (",
    ),
    `Keep everything that happens in ${video} exactly as it is: the timing, every movement, gesture and pose, where each figure stands and looks, facial expressions, the framing and the camera movement. Only the look changes — do not add, remove or move anything.${i.fromFilm ? "" : ` ${video} is a rough 2D animatic; make it look like the finished film.`}`,
    i.count > 1
      ? `Length: ${secs} seconds (part ${piece.index + 1} of ${i.count} of the scene).`
      : `Length: ${secs} seconds.`,
  );
  if (i.sceneDescription.trim()) part(0, "Scene description:", i.sceneDescription.trim());
  if (i.globalStyle?.trim())
    part(2, "Project style (applies to the whole film):", i.globalStyle.trim());
  // Referansebildene
  if (i.references) {
    const refLines: string[] = [];
    i.refs.elements.forEach((m, k) => refLines.push(`- @Element${k + 1} is ${m.name}.`));
    let img = 0;
    if (i.refs.background)
      refLines.push(`- @Image${++img} shows the location: ${i.refs.background.name}.`);
    if (i.refs.sheet.length)
      refLines.push(
        `- @Image${++img} is a reference sheet with ${i.refs.sheet.map((m, k) => `${m.name} (${k + 1})`).join(", ")}; each figure is labelled with its name.`,
      );
    if (refLines.length)
      part(
        1,
        "References (keep every figure's face, proportions, clothing and colours identical to these):",
        ...refLines,
      );
  }
  if (i.cast.length) {
    const who = (m: SceneCastMember) =>
      `- ${m.description}.${m.visualBrief ? ` Look: ${m.visualBrief.replace(/\s*\n\s*-?\s*/g, "; ")}` : ""}`.replace(
        "..",
        ".",
      );
    part(3, "In this shot:", ...i.cast.map(who));
  }
  const blocks = blocksInPiece(s, clip, piece);
  if (i.count > 1) {
    const action = blocks.filter((b) => b.kind === "action" || b.kind === "shot");
    if (action.length)
      part(
        4,
        `What happens in this part (screenplay in its original language — ${video} decides where and when):`,
        ...action.map((b) => `- ${b.text.trim()}`),
      );
  }
  const talk: string[] = [];
  let speaker = "";
  for (const b of blocks) {
    if (b.kind === "character") speaker = b.text.trim();
    else if (b.kind === "dialogue") talk.push(`${speaker || "Someone"}: «${b.text.trim()}»`);
  }
  if (talk.length)
    part(
      5,
      `Lines spoken (for lip movement and acting only${i.withAudio ? "" : " — this video has no sound"}; never show the words as text):`,
      ...talk.map((t) => `- ${t}`),
    );
  if (piece.index > 0)
    part(
      3,
      "Continuity: this continues directly from the previous part — same characters, lighting and colours.",
    );
  part(
    0,
    i.withAudio
      ? `No on-screen text, subtitles, logos or watermarks. Use the sound in ${video} for lip movement and timing; do not add music or other sound.`
      : "No on-screen text, subtitles, logos or watermarks. No sound.",
  );
  const join = () =>
    parts
      .map((p) => p.lines.join("\n"))
      .join("\n")
      .trim();
  const max = i.maxChars ?? Number.POSITIVE_INFINITY;
  for (const rank of [5, 4, 3, 2, 1]) {
    for (let k = parts.length - 1; k >= 0 && join().length > max; k--)
      if (parts[k]!.rank === rank) parts.splice(k, 1);
    if (join().length <= max) break;
  }
  return join();
}

// ---------------------------------------------------------------- 2D-scenen alene

/**
 * Tilstanden med 2D-scenen som det scenen viser (DEC-0083): versjonen og klippingen for scenen (og
 * hovedfilmens forekomst den arver fra) tas bort, så filmklippet blir 2D-scenen. Bare til å lage videoen
 * som sendes – endrer ingenting i prosjektet.
 */
export function stateWithAnimatic(s: ProjectState, occurrenceIds: readonly string[]): ProjectState {
  const ids = new Set(occurrenceIds.filter((id) => s.occurrences[id]));
  if (!ids.size) return s;
  const occurrences = { ...s.occurrences };
  for (const id of ids)
    occurrences[id as never] = { ...occurrences[id as never]!, activeTakeId: null };
  const clipParts = Object.fromEntries(
    Object.entries(s.clipParts).filter(([, p]) => !ids.has(p.occurrenceId)),
  );
  return { ...s, occurrences, clipParts };
}

/** Det som sendes til modellen (DEC-0085): 2D-scenen, en versjon av scenen eller en bunt satt sammen. */
export type SceneVideoSource =
  | { readonly kind: "animatic" }
  | { readonly kind: "take"; readonly takeId: string }
  | { readonly kind: "parts"; readonly parts: readonly ClipPartFields[] };

/**
 * Tilstanden der scenen viser kilden (bare for å lage videoen som sendes; prosjektet endres ikke). Kilden
 * gjelder forekomsten selv og hovedfilmens forekomst den eventuelt arver fra.
 */
export function stateWithSource(
  s: ProjectState,
  occurrenceIds: readonly string[],
  source: SceneVideoSource,
): ProjectState {
  const base = stateWithAnimatic(s, occurrenceIds);
  if (source.kind === "animatic") return base;
  const ids = occurrenceIds.filter((id) => base.occurrences[id]);
  const occurrences = { ...base.occurrences };
  const clipParts = { ...base.clipParts };
  for (const id of ids) {
    if (source.kind === "take")
      occurrences[id as never] = {
        ...occurrences[id as never]!,
        activeTakeId: source.takeId as never,
      };
    else {
      const keys = keysEvenly(source.parts.length);
      source.parts.forEach((p, k) => {
        const pid = `${p.partId}:${id}`;
        clipParts[pid as never] = {
          id: pid as never,
          revision: 1,
          occurrenceId: id as never,
          orderKey: keys[k]!,
          source: p.source,
          takeId: p.takeId as never,
          inMs: p.inMs,
          outMs: p.outMs,
          removed: false,
        };
      });
    }
  }
  return { ...base, occurrences, clipParts };
}

// ---------------------------------------------------------------- Resultatene

/** En bunt: alle bitene som ble sendt sammen for scenen (én «AI-video fra 2D-scenen»). */
export interface SceneVideoBatch {
  readonly batchId: string;
  readonly occurrenceId: string;
  readonly provider: string;
  readonly model: string;
  readonly createdAt: string;
  readonly count: number;
  /** Jobbene i bit-rekkefølge (en bit kan mangle hvis den aldri ble registrert). */
  readonly jobs: readonly (GenerationJob | null)[];
  /** Versjonene (ferdige og lagt inn), i bit-rekkefølge; null der biten ikke er klar. */
  readonly takes: readonly (Take | null)[];
  /** Bitenes lengde (ms) i 2D-scenen, i rekkefølge. */
  readonly pieceMs: readonly number[];
  readonly status: "running" | "done" | "failed";
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Versjonens id ut fra resultatstien (`<prosjekt>/films/<take>/…`). */
function takeOf(s: ProjectState, job: GenerationJob): Take | null {
  const id = job.resultPath ? takeIdOfFilmPath(job.resultPath) : null;
  return id ? (s.takes[id as never] ?? null) : null;
}

/** Buntene for scenen, nyeste først (fra AI-jobbene; DEC-0083). */
export function sceneVideoBatches(
  s: ProjectState,
  jobs: readonly GenerationJob[],
  sceneOccurrenceIds: ReadonlySet<string>,
): SceneVideoBatch[] {
  const by = new Map<string, GenerationJob[]>();
  for (const j of jobs) {
    const p = j.params ?? {};
    if (j.kind !== "video" || p["source"] !== SCENE_VIDEO_SOURCE) continue;
    if (!j.occurrenceId || !sceneOccurrenceIds.has(j.occurrenceId)) continue;
    const batch = typeof p["batch"] === "string" ? p["batch"] : j.id;
    by.set(batch, [...(by.get(batch) ?? []), j]);
  }
  const out: SceneVideoBatch[] = [];
  for (const [batchId, list] of by) {
    const count = Math.max(1, ...list.map((j) => num(j.params?.["pieces"]) ?? 1));
    const jobsInOrder: (GenerationJob | null)[] = Array.from({ length: count }, () => null);
    for (const j of list) {
      const i = num(j.params?.["piece"]) ?? 0;
      if (i >= 0 && i < count && !jobsInOrder[i]) jobsInOrder[i] = j;
    }
    const takes = jobsInOrder.map((j) => (j && j.status === "done" ? takeOf(s, j) : null));
    const pieceMs = jobsInOrder.map((j) => {
      const a = num(j?.params?.["startMs"]);
      const b = num(j?.params?.["endMs"]);
      return a !== null && b !== null ? Math.max(1, b - a) : 0;
    });
    const failed = jobsInOrder.some((j) => !j || j.status === "failed" || j.status === "lost");
    const first = list[0]!;
    out.push({
      batchId,
      occurrenceId: first.occurrenceId!,
      provider: first.provider,
      model: first.model,
      createdAt: list.map((j) => j.createdAt).sort()[0]!,
      count,
      jobs: jobsInOrder,
      takes,
      pieceMs,
      status: takes.every((t) => t) ? "done" : failed ? "failed" : "running",
    });
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Hvordan en ferdig bunt vises i scenen: én bit = versjonen selv; flere biter = delene etter hverandre
 * (SetSceneEdit). Hver del varer så lenge biten i 2D-scenen (eller videoen, hvis den er kortere).
 */
export function batchSceneEdit(
  s: ProjectState,
  batch: SceneVideoBatch,
  newPartId: () => string,
): { readonly activeTakeId: string | null; readonly parts: ClipPartFields[] } | null {
  if (batch.status !== "done") return null;
  const takes = batch.takes as readonly Take[];
  if (takes.length === 1) return { activeTakeId: takes[0]!.id, parts: [] };
  const fps = s.project.fps;
  return {
    activeTakeId: null,
    parts: takes.map((t, i) => {
      const own = t.durationFrames ? Math.round(framesToSeconds(t.durationFrames, fps) * 1000) : 0;
      const want = batch.pieceMs[i] || own;
      return {
        partId: newPartId() as never,
        source: "take",
        takeId: t.id,
        inMs: 0,
        outMs: Math.max(1, own ? Math.min(own, want) : want),
      };
    }),
  };
}

/** Er bunten det scenen viser nå (delene er nøyaktig bitene i rekkefølge, eller den ene versjonen)? */
export function batchInUse(s: ProjectState, batch: SceneVideoBatch, occurrenceId: string): boolean {
  if (batch.status !== "done") return false;
  const o = s.occurrences[occurrenceId];
  if (!o) return false;
  const parts = Object.values(s.clipParts)
    .filter((p) => p.occurrenceId === occurrenceId && !p.removed)
    .sort((a, b) => (a.orderKey < b.orderKey ? -1 : a.orderKey > b.orderKey ? 1 : 0));
  const ids = batch.takes.map((t) => t!.id as string);
  if (ids.length === 1) return parts.length === 0 && o.activeTakeId === ids[0];
  return (
    parts.length === ids.length &&
    parts.every((p) => p.source === "take" && p.takeId === ids[parts.indexOf(p)])
  );
}
