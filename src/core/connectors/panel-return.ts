/**
 * C-7/C-0: panelretur gjennom C-0-mottaket. Ren plan: bildet blir en ny ressurs med én versjon
 * (kandidat, aldri godkjent) og et SKJULT kandidatlag i panelet (SB-7-regelen) — ingenting vises
 * før brukeren tar det i bruk. Konflikt når panelets revisjon har endret seg siden eksporten.
 * Lagkommandoen regnes ut fra tilstanden før ressurskommandoene; de endrer ikke komposisjonen.
 */
import type { Command, ProjectState } from "../index";
import { panelCandidateLayer } from "../storyboard/ai";

export interface PanelReturnPlan {
  readonly commands: readonly Command[];
  /** Sant når panelets revisjon er nyere enn grunnlaget klienten sendte fra. */
  readonly conflict: boolean;
}

export function planPanelReturn(i: {
  state: ProjectState;
  panelId: string;
  assetId: string;
  variantId: string;
  versionId: string;
  name: string;
  media: { path: string; mimeType: string; byteSize: number; sha256: string; width: number | null; height: number | null };
  baseRevision: number | null;
  note: string;
}): PanelReturnPlan | null {
  const panel = i.state.compositions[i.panelId as never];
  if (!panel || panel.removed || panel.kind !== "storyboard") return null;
  const commands: Command[] = [
    { type: "CreateAssets", assets: [{ assetId: i.assetId as never, fields: { kind: "other", name: i.name, names: [], description: "", category: "", tags: [] } }] } as Command,
    { type: "CreateAssetVariant", assetId: i.assetId as never, variantId: i.variantId as never, fields: { name: i.name, style: "other", appearance: "" } } as Command,
    { type: "AddAssetVersion", versionId: i.versionId as never, variantId: i.variantId as never, media: i.media, note: i.note } as Command,
    panelCandidateLayer(i.state, panel, i.assetId, i.variantId, i.versionId),
  ];
  return { commands, conflict: i.baseRevision !== null && panel.revision !== i.baseRevision };
}
