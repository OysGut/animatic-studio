/**
 * Lydopptak med flere takes (fase 2, bolk B, DEC-0093, REQ-0684–0690). Et take er en versjon av en lydressurs:
 * et nytt opptak blir alltid en ny versjon, så et tidligere take blir aldri overskrevet (REQ-0688). For en
 * replikk er det lydklippet i scenen som bestemmer hvilken lydressurs takene hører til, og hvilket take som er
 * aktivt (den låste versjonen i klippet).
 */
import type { Asset, AudioClip, ProjectState } from "../model";
import { blocksOfVariant, sceneNumberOf } from "../views";
import { filmClips } from "../assembly/film";
import { sceneDialogueLines } from "../generation/speech";
import { compareVersionCreation, variantsOf, versionsOf } from "../library";
import { formatHeading } from "../screenplay/paginate";
import { L } from "../i18n";
import { audioVersion } from "./index";

/** Merket på lydressurser med ren romlyd (REQ-0690). */
export const ROOM_TONE_TAG = "romlyd"; // i18n-ignore: lagret merke

export interface SoundTake {
  readonly versionId: string;
  readonly variantId: string;
  /** Take-nummer i rekkefølgen de ble tatt opp (1, 2, 3 …), på tvers av variantene. */
  readonly number: number;
  readonly durationMs: number | null;
  readonly mediaPath: string;
  readonly mimeType: string;
  readonly note: string;
  readonly createdAt: string;
  /** Godkjent i biblioteket. */
  readonly approved: boolean;
  /** Miksen av en lydkomposisjon (bolk C), ikke et opptak. */
  readonly composition: boolean;
}

/** Alle opptakene av en lydressurs, eldste først (variantene som ikke er arkivert). */
export function soundTakes(s: ProjectState, assetId: string): SoundTake[] {
  const out: Omit<SoundTake, "number">[] = [];
  const versions = variantsOf(s, assetId)
    .filter((va) => !va.archived)
    .flatMap((va) => versionsOf(s, va.id))
    .sort(compareVersionCreation);
  for (const v of versions) {
    const va = s.assetVariants[v.variantId];
    if (!va) continue;
      out.push({
        versionId: v.id,
        variantId: va.id,
        durationMs: v.durationMs,
        mediaPath: v.mediaPath,
        mimeType: v.mimeType,
        note: v.note,
        createdAt: v.createdAt,
        approved: va.approvedVersionId === v.id,
        composition: !!v.composition,
      });
  }
  return out.map((t, i) => ({ ...t, number: i + 1 }));
}

/** Neste take-nummer for en ressurs. */
export function nextTakeNumber(s: ProjectState, assetId: string): number {
  return soundTakes(s, assetId).length + 1;
}

export interface LineInfo {
  readonly occurrenceId: string;
  readonly blockId: string;
  /** Navnet i manuset (karakterhodet). */
  readonly speaker: string;
  /** Regianvisning rett før replikken, f.eks. «(hvisker)». */
  readonly parenthetical: string;
  readonly text: string;
  readonly heading: string;
  readonly sceneNumber: string | null;
  /** Når replikken begynner i scenen (ms), anslått som i resten av appen. */
  readonly startMs: number;
  /** Lydklippet replikken har i scenen (det første), eller null. */
  readonly clip: AudioClip | null;
}

/** Replikken i en scene: hvem som sier den, teksten og lyden den har. Null når den ikke finnes. */
export function lineInfo(s: ProjectState, occurrenceId: string, blockId: string): LineInfo | null {
  const occ = s.occurrences[occurrenceId];
  if (!occ) return null;
  const blocks = blocksOfVariant(s, occ.variantId);
  const i = blocks.findIndex((b) => b.id === blockId);
  const block = blocks[i];
  if (!block || block.kind !== "dialogue") return null;
  let speaker = "";
  let parenthetical = "";
  for (let j = i - 1; j >= 0; j--) {
    const b = blocks[j]!;
    if (b.kind === "parenthetical" && !parenthetical && !speaker) parenthetical = b.text.trim();
    else if (b.kind === "character") {
      speaker = b.text.trim();
      break;
    } else if (b.kind !== "parenthetical" && b.kind !== "dialogue") break;
  }
  const film = filmClips(s, occ.productionId).find((c) => c.occurrenceId === occurrenceId);
  const startMs = film
    ? (sceneDialogueLines(s, film).find((l) => l.blockId === blockId)?.startMs ?? 0)
    : 0;
  const clip =
    Object.values(s.audioClips)
      .filter((a) => !a.removed && a.occurrenceId === occurrenceId && a.blockId === blockId)
      .sort((a, b) => a.offsetMs - b.offsetMs)[0] ?? null;
  const variant = s.variants[occ.variantId];
  return {
    occurrenceId,
    blockId,
    speaker,
    parenthetical,
    text: block.text.replace(/\s+/g, " ").trim(),
    heading: variant ? formatHeading(variant.heading) : "",
    sceneNumber: film?.productionNumber ?? sceneNumberOf(s, occ) ?? null,
    startMs,
    clip,
  };
}

/** Kort navn på en replikk: «MAJA: Jeg tror det er noen der ute …» (navn på lydressursen). */
export function lineTitle(info: Pick<LineInfo, "speaker" | "text">, max = 60): string {
  const t = info.text.length > max ? `${info.text.slice(0, max - 1).trimEnd()} …` : info.text;
  return info.speaker ? `${info.speaker}: ${t}` : t;
}

/** Versjonen (takeet) som er aktivt for en replikk: den lydklippet spiller. */
export function activeLineTake(s: ProjectState, info: LineInfo): string | null {
  return info.clip ? (audioVersion(s, info.clip)?.id ?? null) : null;
}

/** Navnet på romlyden for en scene eller lydressurs: «Romlyd – Scene 3» / «Room tone – Scene 3». */
export function roomToneName(where: string): string {
  return L(`Romlyd – ${where}`, `Room tone – ${where}`);
}

/** Romlydressursen for et sted (merket «romlyd», navnet på norsk eller engelsk), eller null. */
export function roomToneAsset(s: ProjectState, where: string): Asset | null {
  const names = new Set(
    [`Romlyd – ${where}`, `Room tone – ${where}`].map((n) => n.trim().toLocaleLowerCase()), // i18n-ignore: gjenkjenning
  );
  return (
    Object.values(s.assets).find(
      (a) =>
        a.kind === "sound" &&
        !a.removed &&
        !a.archived &&
        a.tags.includes(ROOM_TONE_TAG) &&
        names.has(a.name.trim().toLocaleLowerCase()),
    ) ?? null
  );
}

/** Stedet romlyden for en replikk hører til: «Scene 3», ellers sceneoverskriften. */
export function roomToneSceneName(info: Pick<LineInfo, "sceneNumber" | "heading"> | null): string {
  if (info?.sceneNumber) return L(`Scene ${info.sceneNumber}`, `Scene ${info.sceneNumber}`);
  return info?.heading || L("Scene", "Scene");
}

/** «Scene 3 · MAJA» – hva et replikkopptak gjelder (vist i lydvinduet og på mobilen). */
export function lineLabel(info: Pick<LineInfo, "sceneNumber" | "speaker"> | null): string {
  const scene = info?.sceneNumber
    ? L(`Scene ${info.sceneNumber}`, `Scene ${info.sceneNumber}`)
    : L("Replikk", "Line");
  return info?.speaker ? `${scene} · ${info.speaker}` : scene;
}
