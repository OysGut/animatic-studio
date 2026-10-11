/**
 * «Generer scene» (M5 del 2, DEC-0053, mandat 17–18): inndeling i segmenter og den automatiske
 * beskrivelsen (prompten) for hvert segment.
 *
 * - Segmentene følger manusblokkene og endrer aldri manusets struktur (REQ-0260/0267). En blokk som er
 *   lengre enn et segment, deles i like lange deler (samme start- og sluttblokk).
 * - Beskrivelsen er på engelsk (REQ-0015/0247) og bygges fra manus, ressurser og kamera (REQ-0244/0245).
 *   Norske replikker tas med ordrett og skal ikke oversettes eller endres (REQ-0248/0249).
 * - Kontinuitet mellom segmenter beskrives eksplisitt (REQ-0262/0263).
 * - Brukerens egne beskrivelser lagres separat (GenerationPrompt) og overstyrer den automatiske.
 */
import type { ProjectState, ScriptBlock } from "../model";
import { blocksOfVariant } from "../views";
import { formatHeading } from "../screenplay/paginate";
import { assetNames, assetsInScene, nameKey } from "../library";
import { blockSpans, clipFrameToComposition, type FilmClip } from "../assembly/film";
import { compositionOfVariant } from "../composition/render";
import { framesToSeconds } from "../time";
import {
  appearanceAt,
  continuityFor,
  continuityCutBlocks,
  continuityKindEnglish,
  eventApplies,
  hasContinuity,
} from "../continuity";

/** Segmentlengder som kan velges (sekunder). Videomodeller lager typisk 5–10 s om gangen. */
export const SEGMENT_SECONDS = [5, 8, 10, 15, 20] as const;
export const DEFAULT_SEGMENT_SECONDS = 10;
/** Korteste segment ved deling for kontinuitet (kortere klipp kan ikke lages av videomodellene). */
const MIN_SEGMENT_MS = 1500;

/** Et segment av scenen: tidsrom (ms fra scenens start) og manusblokkene som begynner i det. */
export interface SegmentPlan {
  readonly startMs: number;
  readonly endMs: number;
  readonly blockIds: readonly string[];
}

interface BlockTime {
  readonly id: string;
  readonly startMs: number;
  readonly endMs: number;
}

const sceneMs = (s: ProjectState, clip: FilmClip) =>
  Math.max(1, Math.round(framesToSeconds(clip.durationFrames, s.project.fps) * 1000));

/**
 * Blokkene i scenen med tid (ms fra scenens start), i manusrekkefølge (uten scenehode). Tidene gjøres
 * stigende og holdes innenfor scenen (tidskoblinger kan ellers få en blokk til å begynne før den forrige).
 */
function blockTimes(s: ProjectState, clip: FilmClip): BlockTime[] {
  const fps = s.project.fps;
  const total = sceneMs(s, clip);
  const ms = (f: number) => Math.round(framesToSeconds(f - clip.startFrame, fps) * 1000);
  let prev = 0;
  return blockSpans(s, clip).map((b) => {
    const start = Math.min(total, Math.max(prev, ms(b.startFrame)));
    prev = start;
    return {
      id: b.blockId,
      startMs: start,
      endMs: Math.max(start, Math.min(total, ms(b.endFrame))),
    };
  });
}

/**
 * Blokkene i et tidsrom: de som begynner i det. Begynner ingen blokk der (en lang blokk er delt), tas
 * blokken som pågår med. Det siste segmentet får også blokker som begynner ved eller etter slutten.
 */
function blocksIn(times: readonly BlockTime[], startMs: number, endMs: number, last: boolean) {
  const inside = times.filter((b) => b.startMs >= startMs && (last || b.startMs < endMs));
  if (inside.length) return inside.map((b) => b.id);
  const running = [...times].reverse().find((b) => b.startMs < startMs);
  return running ? [running.id] : [];
}

/**
 * Forslag til inndeling: segmenter på høyst `maxSeconds` som helst begynner der en blokk begynner (manuset
 * deles aldri midt i en replikk når det går). En blokk som alene er lengre, deles. Hele scenen dekkes.
 */
export function planSegments(
  s: ProjectState,
  clip: FilmClip,
  maxSeconds: number,
  opts: { readonly continuity?: boolean } = {},
): SegmentPlan[] {
  const total = sceneMs(s, clip);
  const max = Math.max(1000, Math.round(maxSeconds * 1000));
  const times = blockTimes(s, clip);
  const cuts = [...new Set(times.map((b) => b.startMs))].filter((t) => t > 0 && t < total);
  // Utseendet endres midt i scenen (kontinuitet): egne segmenter før og etter (REQ-0161/0162)
  // (ikke så nær begynnelsen, slutten eller en annen endring at segmentet blir for kort – da beskrives
  // endringen i segmentet i stedet)
  const must: number[] = [];
  if (opts.continuity !== false)
    for (const t of continuityCuts(s, clip))
      if (
        t >= MIN_SEGMENT_MS &&
        total - t >= MIN_SEGMENT_MS &&
        t - (must[must.length - 1] ?? 0) >= MIN_SEGMENT_MS
      )
        must.push(t);
  const bounds: number[] = [0];
  let at = 0;
  for (;;) {
    const forced = must.find((t) => t > at);
    const limit = forced ?? total;
    while (limit - at > max) {
      const best = cuts.filter((t) => t > at && t - at <= max).pop();
      at = best ?? at + max;
      bounds.push(at);
    }
    if (forced === undefined) break;
    // En naturlig grense like før endringen ville gitt et for kort segment: flytt den til endringen
    const prev = bounds[bounds.length - 1]!;
    if (bounds.length > 1 && forced - prev < MIN_SEGMENT_MS && !must.includes(prev)) bounds.pop();
    at = forced;
    bounds.push(at);
  }
  bounds.push(total);
  return bounds.slice(0, -1).map((start, i) => {
    const end = bounds[i + 1]!;
    return {
      startMs: start,
      endMs: end,
      blockIds: blocksIn(times, start, end, i === bounds.length - 2),
    };
  });
}

/** Tidspunktene (ms fra scenens start) der en kontinuitetshendelse endrer utseendet midt i scenen. */
export function continuityCuts(s: ProjectState, clip: FilmClip): number[] {
  const blocks = new Set<string>(continuityCutBlocks(s, clip.variantId).map((b) => b.id));
  if (blocks.size === 0) return [];
  const total = sceneMs(s, clip);
  return [
    ...new Set(
      blockTimes(s, clip)
        .filter((b) => blocks.has(b.id))
        .map((b) => b.startMs),
    ),
  ]
    .filter((t) => t > 0 && t < total)
    .sort((a, b) => a - b);
}

/**
 * Inndelingen slik den er lagret (segmentene i rekkefølge, med tid). Blokkene regnes ut fra tiden, så nye
 * og flyttede replikker havner i riktig segment. Segmenter uten tid deler scenen likt.
 */
export function segmentTimes(
  s: ProjectState,
  clip: FilmClip,
  segments: readonly { readonly startMs?: number; readonly endMs?: number }[],
): SegmentPlan[] {
  const total = sceneMs(s, clip);
  const times = blockTimes(s, clip);
  const n = segments.length;
  return segments.map((g, i) => {
    const start = g.startMs ?? Math.round((total * i) / n);
    const end = g.endMs ?? Math.round((total * (i + 1)) / n);
    return { startMs: start, endMs: end, blockIds: blocksIn(times, start, end, i === n - 1) };
  });
}

/** Er to inndelinger like (samme tider)? */
export function samePlan(
  a: readonly Pick<SegmentPlan, "startMs" | "endMs">[],
  b: readonly Pick<SegmentPlan, "startMs" | "endMs">[],
): boolean {
  return (
    a.length === b.length &&
    a.every((x, i) => x.startMs === b[i]!.startMs && x.endMs === b[i]!.endMs)
  );
}

/** Passer den lagrede inndelingen fortsatt til scenens lengde? */
export function planFitsScene(s: ProjectState, clip: FilmClip, plan: readonly SegmentPlan[]) {
  const last = plan[plan.length - 1];
  return !last || Math.abs(last.endMs - sceneMs(s, clip)) < 2;
}

const KIND_TEXT: Record<string, string> = {
  character: "character",
  animal: "animal",
  object: "prop",
  location: "location",
  environment: "environment",
  other: "element",
};

/**
 * Ressursen i ord. Med sted i historien (scene og linje) brukes utseendet kontinuiteten gir der
 * (REQ-0159/0160): riktig variant og forandringer som gjelder (skade, skitt, snø …).
 */
export function describeAsset(
  s: ProjectState,
  assetId: string,
  at?: { readonly sceneId: string; readonly blockId: string | null },
): string {
  const a = s.assets[assetId]!;
  // Kontinuiteten i produksjonen (DEC-0060): `s` kan være continuityFor(...) fra den som kaller
  const look = at && hasContinuity(a) ? appearanceAt(s, a.id, at.sceneId, at.blockId) : null;
  const chosen = look?.variantId ? s.assetVariants[look.variantId] : undefined;
  const variant =
    chosen ??
    Object.values(s.assetVariants).find(
      (v) => v.assetId === a.id && !v.archived && v.approvedVersionId !== null,
    );
  const bits = [a.description.trim(), variant?.appearance.trim() ?? ""].filter(Boolean);
  const state = (look?.active ?? [])
    .filter((e) => e.description.trim() || e.toVariantId)
    .map((e) => {
      const to = e.toVariantId ? s.assetVariants[e.toVariantId] : undefined;
      const what = e.description.trim() || to?.appearance.trim() || to?.name || "";
      return what ? `${continuityKindEnglish(e.kind)}: ${what}` : "";
    })
    .filter(Boolean);
  if (state.length) bits.push(`current state — ${state.join("; ")}`);
  return `${a.name} (${KIND_TEXT[a.kind] ?? "element"})${bits.length ? ` — ${bits.join("; ")}` : ""}`;
}

/** Kamerabevegelsen i 2D-scenen i tidsrommet, i ord (engelsk). */
function cameraText(s: ProjectState, clip: FilmClip, startMs: number, endMs: number): string[] {
  const comp = compositionOfVariant(s, clip.variantId);
  if (!comp) return [];
  const fps = s.project.fps.num / s.project.fps.den;
  const a = clipFrameToComposition(clip, Math.round((startMs / 1000) * fps));
  const b = clipFrameToComposition(clip, Math.max(0, Math.round((endMs / 1000) * fps) - 1));
  if (a === null || b === null) return [];
  const out: string[] = [];
  for (const sh of comp.camera.shots) {
    if (sh.endFrame < a || sh.startFrame > b) continue;
    const moves: string[] = [];
    const z = sh.to.zoom / sh.from.zoom;
    if (z > 1.05) moves.push("slow push in");
    else if (z < 0.95) moves.push("slow pull out");
    const dx = sh.to.x - sh.from.x;
    const dy = sh.to.y - sh.from.y;
    const span = comp.width * 0.03;
    if (dx > span) moves.push("pan right");
    else if (dx < -span) moves.push("pan left");
    if (dy > span) moves.push("tilt down");
    else if (dy < -span) moves.push("tilt up");
    if (Math.abs(sh.to.rotation - sh.from.rotation) > 2) moves.push("slight roll");
    const framing =
      sh.from.zoom >= 2 ? "close-up" : sh.from.zoom >= 1.3 ? "medium shot" : "wide shot";
    out.push(
      `${sh.name ? `${sh.name}: ` : ""}${framing}${moves.length ? `, ${moves.join(" and ")}` : ", static camera"}${sh.curve ? " along a curved path" : ""}.`,
    );
  }
  return out;
}

export interface ScenePromptInput {
  readonly clip: FilmClip;
  readonly productionId: string;
  readonly segment: SegmentPlan;
  readonly index: number;
  readonly count: number;
}

/** Den automatiske beskrivelsen for ett segment (engelsk; replikker ordrett på norsk). */
export function buildScenePrompt(s: ProjectState, i: ScenePromptInput): string {
  const { clip, segment } = i;
  const blocks = blocksOfVariant(s, clip.variantId);
  const inSeg = new Set(segment.blockIds);
  const seg = blocks.filter((b) => inSeg.has(b.id));
  const secs = (ms: number) => (Math.round(ms / 100) / 10).toFixed(1);
  const lines: string[] = [];
  lines.push(
    `Animated film shot for "${s.project.name}". Scene ${clip.productionNumber ?? ""}: ${formatHeading(clip.heading)}.`.replace(
      "Scene : ",
      "Scene: ",
    ),
  );
  lines.push(
    i.count > 1
      ? `Segment ${i.index + 1} of ${i.count}: ${secs(segment.endMs - segment.startMs)} seconds (from ${secs(segment.startMs)} s to ${secs(segment.endMs)} s in the scene).`
      : `Length: ${secs(segment.endMs - segment.startMs)} seconds.`,
  );
  lines.push(
    "Style: 2D animation consistent with the approved character and location designs; keep every character's face, proportions, clothing and colours identical throughout.",
  );

  // Ressurser i scenen: steder alltid, figurer og ting når de nevnes i segmentet
  const used = assetsInScene(s, i.productionId, clip.occurrenceId).map((u) => u.asset);
  const segText = seg.map((b) => b.text).join("\n");
  const speakers = new Set(seg.filter((b) => b.kind === "character").map((b) => nameKey(b.text)));
  const upper = ` ${segText.toUpperCase().replace(/[^\p{L}\p{N}]+/gu, " ")} `;
  const mentioned = (names: string[]) =>
    names.some((n) => {
      const k = nameKey(n);
      if (k.length < 2) return false;
      const words = k.replace(/[^\p{L}\p{N}]+/gu, " ").trim();
      return speakers.has(k) || upper.includes(` ${words} `);
    });
  const places = used.filter((a) => a.kind === "location" || a.kind === "environment");
  const figures = used.filter(
    (a) => a.kind !== "location" && a.kind !== "environment" && mentioned(assetNames(a)),
  );
  // Utseendet ved segmentets første linje (fortellingstid, REQ-0159/0162)
  const sceneId = s.variants[clip.variantId]?.sceneId;
  const at = sceneId ? { sceneId, blockId: seg[0]?.id ?? null } : undefined;
  // Utseendet etter produksjonens kontinuitet (lokale og avslåtte hendelser i en spinoff, DEC-0060)
  const cs = continuityFor(s, i.productionId);
  if (places.length)
    lines.push(`Setting: ${places.map((a) => describeAsset(cs, a.id, at)).join("; ")}.`);
  if (figures.length) {
    lines.push("In this shot:");
    for (const a of figures) lines.push(`- ${describeAsset(cs, a.id, at)}`);
    // Forandringer som skjer i dette segmentet
    if (sceneId)
      for (const a of figures) {
        const changes = Object.values(s.continuityEvents).filter(
          (e) =>
            e.assetId === a.id &&
            eventApplies(cs, e) &&
            e.blockId !== null &&
            e.blockId !== seg[0]?.id &&
            inSeg.has(e.blockId),
        );
        for (const e of changes) {
          const to = e.toVariantId ? s.assetVariants[e.toVariantId] : undefined;
          lines.push(
            `- During this shot ${a.name} changes (${continuityKindEnglish(e.kind)})${to ? ` to: ${to.appearance.trim() || to.name}` : ""}${e.description.trim() ? ` — ${e.description.trim()}` : ""}.`,
          );
        }
      }
  }

  const action = seg.filter((b) => b.kind === "action" || b.kind === "shot");
  if (action.length) {
    lines.push(
      "What happens (screenplay in Norwegian — show it visually, do not add events that are not described):",
    );
    for (const b of action) lines.push(`- ${b.text.trim()}`);
  }
  const dialogue = dialogueLines(seg);
  if (dialogue.length) {
    lines.push(
      "Dialogue (Norwegian). Characters must say these lines word for word — do not translate, shorten, rephrase or add lines:",
    );
    for (const d of dialogue) lines.push(`- ${d}`);
  }
  const cam = cameraText(s, clip, segment.startMs, segment.endMs);
  if (cam.length) {
    lines.push("Camera (from the animatic):");
    for (const c of cam) lines.push(`- ${c}`);
  }
  if (i.index > 0)
    lines.push(
      "Continuity: start exactly where the previous segment ended — same character positions, lighting, colours and camera.",
    );
  if (i.index < i.count - 1)
    lines.push("End on a stable frame so the next segment can continue seamlessly from it.");
  lines.push("No on-screen text, subtitles, logos or watermarks.");
  return lines.join("\n");
}

/** «MAJA (hvisker): «Hei.»». Karakternavn og parentes følger replikken. */
function dialogueLines(blocks: readonly ScriptBlock[]): string[] {
  const out: string[] = [];
  let speaker = "";
  let paren = "";
  for (const b of blocks) {
    if (b.kind === "character") {
      speaker = b.text.trim();
      paren = "";
    } else if (b.kind === "parenthetical") paren = b.text.trim();
    else if (b.kind === "dialogue") {
      out.push(`${speaker || "Someone"}${paren ? ` ${paren}` : ""}: «${b.text.trim()}»`);
      paren = "";
    }
  }
  return out;
}

/** Alle replikkene i segmentet ordrett (for kontroll av at en egen beskrivelse ikke har endret dem). */
export function segmentDialogue(s: ProjectState, variantId: string, blockIds: readonly string[]) {
  const set = new Set(blockIds);
  return blocksOfVariant(s, variantId)
    .filter((b) => set.has(b.id) && b.kind === "dialogue")
    .map((b) => b.text.trim());
}

/**
 * Replikker som mangler ordrett i en egen beskrivelse (REQ-0249: ingen utilsiktet omskriving). Tom liste
 * betyr at alle replikkene står der som de er.
 */
export function missingDialogue(prompt: string, dialogue: readonly string[]): string[] {
  const norm = (t: string) => t.replace(/\s+/g, " ").trim();
  const p = norm(prompt);
  return dialogue.filter((d) => d && !p.includes(norm(d)));
}
