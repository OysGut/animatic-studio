/**
 * Felles lagoperasjoner i sceneeditoren (DEC-0052): slett et lag (en gruppe slettes uten at lagene i den
 * hopper: de tas ut av gruppen først, og begge stegene angres samlet).
 */
import {
  layersOf,
  newId,
  regroupFields,
  type Command,
  type CompositionLayer,
  type ProjectState,
} from "@/core";

type Run = (command: Command, label: string, group?: string) => string | null;

export function removeLayer(
  run: Run,
  state: ProjectState,
  layer: CompositionLayer,
  frame: number,
  label: string,
): string | null {
  const members =
    layer.kind === "group"
      ? layersOf(state, layer.compositionId).filter((l) => l.groupId === layer.id)
      : [];
  if (members.length === 0)
    return run({ type: "SetLayersRemoved", layerIds: [layer.id], removed: true }, label);
  const key = newId();
  const err = run(
    {
      type: "UpdateLayers",
      layers: members.map((m) => ({
        layerId: m.id,
        fields: regroupFields(state, m, null, frame),
      })),
    },
    label,
    key,
  );
  if (err) return err;
  return run({ type: "SetLayersRemoved", layerIds: [layer.id], removed: true }, label, key);
}
