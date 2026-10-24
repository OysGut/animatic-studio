/**
 * SB-5: «Opprett sceneoppsett fra storyboard» som ren plan (ADR-0003). Brukeren starter overføringen
 * selv og ser en forhåndsvisning før noe skrives; kommandoene kjøres som én angregruppe (runGroup).
 *
 * Kopiert: ressurs-, form-, tekst- og gruppelag med ressurs-ID/-versjon, plassering, skala, rotasjon
 * og lagrekkefølge; panelets bakgrunnsfarge; kameramerket som kamerautgangspunkt (samme omregning
 * som storyboardfilmen, panelCameraShot). Lapper, piler og kameramerkelag følger IKKE med som synlige
 * objekter – de er reginotater og vises fortsatt i referansepanelet.
 *
 * En scene med innhold overskrives aldri: planen avvises med «has_content», og brukeren må velge
 * «nytt utkast» (draft) eksplisitt. Da legges lagene som et nytt lagsett øverst; alt som finnes,
 * bevares uendret (bakgrunn og kamera røres ikke).
 */
import type { Command, NewLayer } from "../commands/types";
import { newId, type CompositionId, type LayerId, type OccurrenceId } from "../ids";
import type { CameraShot, ProjectState } from "../model";
import { keyBetween } from "../order-key";
import { layerFieldsOf } from "../composition/index";
import { compositionOfVariant, layersOf } from "../composition/render";
import { DEFAULT_COMPOSITION } from "../composition/fields";
import { isStoryboardLayerKind } from "./index";
import { panelCameraShot, panelTiming } from "./playback";
import type { FilmClip } from "../assembly/film";

export interface SceneSetupSummary {
  /** Lag som kopieres (ressurs, form, tekst, gruppe). */
  readonly copied: number;
  /** Reginotater som bevisst ikke følger med. */
  readonly skippedNotes: number;
  readonly skippedArrows: number;
  /** Kameramerkelag er instruksjoner; merket blir kamerautgangspunkt i stedet. */
  readonly cameraMark: boolean;
  /** Kameraet settes bare når målet ikke har kameraskudd fra før. */
  readonly cameraAdded: boolean;
}

export type SceneSetupPlan =
  | {
      readonly ok: true;
      /** create = ny 2D-scene, fill = tom 2D-scene fylles, layers = nytt lagsett i en scene med innhold. */
      readonly mode: "create" | "fill" | "layers";
      readonly commands: readonly Command[];
      readonly compositionId: CompositionId;
      readonly summary: SceneSetupSummary;
    }
  | { readonly ok: false; readonly reason: "no_occurrence" | "no_panel" | "has_content" };

/**
 * Planen for å bygge scenens 2D-oppsett fra ett storyboardpanel. `draft: true` er brukerens
 * eksplisitte valg «nytt utkast» når scenen har innhold: lagene legges øverst som et nytt lagsett,
 * og eksisterende lag, bakgrunn og kamera bevares.
 */
export function planSceneSetup(
  s: ProjectState,
  clips: readonly FilmClip[],
  occurrenceId: string,
  panelId: string,
  options: { readonly draft?: boolean } = {},
  ids: { readonly layer?: () => LayerId; readonly composition?: () => CompositionId } = {},
): SceneSetupPlan {
  const occ = s.occurrences[occurrenceId];
  if (!occ) return { ok: false, reason: "no_occurrence" };
  const panel = s.compositions[panelId];
  if (!panel || panel.removed || panel.kind !== "storyboard" || panel.occurrenceId !== occ.id)
    return { ok: false, reason: "no_panel" };

  const all = layersOf(s, panel.id);
  const copied = all.filter((l) => !isStoryboardLayerKind(l.kind));
  const skippedNotes = all.filter((l) => l.kind === "note").length;
  const skippedArrows = all.filter((l) => l.kind === "arrow").length;
  const cameraMark = all.some((l) => l.kind === "camera_mark");

  const existing = compositionOfVariant(s, occ.variantId);
  const existingLayers = existing ? layersOf(s, existing.id) : [];
  if (existing && existingLayers.length > 0 && options.draft !== true)
    return { ok: false, reason: "has_content" };

  const makeLayer = ids.layer ?? (() => newId<"composition_layer">());
  const makeComp = ids.composition ?? (() => newId<"composition">());
  const mode: "create" | "fill" | "layers" = !existing ? "create" : existingLayers.length === 0 ? "fill" : "layers";
  const compositionId = (existing?.id ?? makeComp()) as CompositionId;

  // Varigheten arves som i storyboardfilmen: panelets egen timing, ellers scenens, ellers estimatet.
  const durationFrames = panelTiming(s, clips, panel).frames;
  const shot: CameraShot | null = panelCameraShot(s, panel, durationFrames);
  // Kameramerket blir kamerautgangspunkt bare når målet ikke har kameraskudd fra før.
  const cameraAdded = !!shot && (mode === "create" || (existing?.camera.shots.length ?? 0) === 0);

  const commands: Command[] = [];
  if (mode === "create")
    commands.push({
      type: "CreateComposition",
      compositionId,
      variantId: occ.variantId,
      fields: {
        ...DEFAULT_COMPOSITION,
        name: panel.name,
        width: s.project.frameWidth,
        height: s.project.frameHeight,
        durationFrames: panel.durationFrames > 0 ? panel.durationFrames : 0,
        background: panel.background,
      },
    });
  else if (mode === "fill" && existing && (panel.background !== existing.background || (panel.durationFrames > 0 && existing.durationFrames === 0)))
    commands.push({
      type: "UpdateComposition",
      compositionId,
      fields: { name: existing.name, width: existing.width, height: existing.height, durationFrames: panel.durationFrames > 0 ? panel.durationFrames : existing.durationFrames, background: panel.background },
    });
  if (cameraAdded && shot && existing)
    commands.push({ type: "UpdateComposition", compositionId, fields: { name: existing.name, width: existing.width, height: existing.height, durationFrames: existing.durationFrames, background: existing.background }, camera: { shots: [shot] } });

  // Nye ID-er på alle lag; gruppekoblingene pekes om innen det kopierte settet (som planDuplicatePanel).
  const remap = new Map<string, LayerId>(copied.map((l) => [l.id, makeLayer()]));
  // I en tom komposisjon beholdes panelrekkefølgen; i et nytt lagsett legges lagene øverst, i samme
  // innbyrdes rekkefølge.
  const topKey = existingLayers.length ? existingLayers[existingLayers.length - 1]!.orderKey : null;
  let after = topKey;
  const layers: NewLayer[] = copied.map((l) => {
    const orderKey = mode === "layers" ? (after = keyBetween(after, null)) : l.orderKey;
    const fields = layerFieldsOf(l);
    return {
      layerId: remap.get(l.id)!,
      compositionId,
      orderKey,
      fields: { ...fields, ...(l.groupId ? { groupId: remap.get(l.groupId) ?? null } : {}) },
    };
  });
  if (layers.length) commands.push({ type: "AddLayers", layers });
  if (mode === "create" && cameraAdded && shot)
    commands.push({ type: "UpdateComposition", compositionId, fields: { name: panel.name, width: s.project.frameWidth, height: s.project.frameHeight, durationFrames: panel.durationFrames > 0 ? panel.durationFrames : 0, background: panel.background }, camera: { shots: [shot] } });

  return { ok: true, mode, commands, compositionId, summary: { copied: copied.length, skippedNotes, skippedArrows, cameraMark, cameraAdded } };
}
