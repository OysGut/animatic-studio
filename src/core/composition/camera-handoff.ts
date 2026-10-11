/**
 * «Bruk aktivt utsnitt» (ønske fra Mars 11.10.2026): start- eller sluttrammen i et kamerautsnitt kan hente
 * utsnittet kameraet har når forrige scene i produksjonen slutter, så overgangen mellom scenene henger sammen.
 */
import type { CameraFrame, Composition, ProjectState } from "../model";
import { orderedOccurrences } from "../views";
import { compositionOfVariant, fullFrameCamera } from "./render";

/** Utsnittet kameraet har på slutten av 2D-scenen: sluttrammen i det siste utsnittet, ellers hele formatet. */
export function endCamera(c: Composition): CameraFrame {
  const shots = [...c.camera.shots].sort((a, b) => a.endFrame - b.endFrame);
  return shots.at(-1)?.to ?? fullFrameCamera(c);
}

/**
 * Utsnittet på slutten av scenen rett før (aktive scener i produksjonen), omregnet til formatet i denne
 * scenen. null når det ikke finnes en scene før, eller den ikke har en 2D-scene.
 */
export function previousSceneCamera(
  s: ProjectState,
  productionId: string,
  occurrenceId: string,
  into: Pick<Composition, "width" | "height">,
): { frame: CameraFrame; occurrenceId: string } | null {
  const occs = orderedOccurrences(s, productionId);
  const i = occs.findIndex((o) => o.id === occurrenceId);
  // Nærmeste aktive scene før (deaktiverte scener er ikke med i filmen)
  const prev = occs
    .slice(0, Math.max(0, i))
    .reverse()
    .find((o) => o.active);
  if (!prev) return null;
  const comp = compositionOfVariant(s, prev.variantId);
  if (!comp) return null;
  const f = endCamera(comp);
  // Annet format i scenen før: samme del av bildet (midtpunktet skaleres, zoomen er relativ)
  const kx = into.width / comp.width;
  const ky = into.height / comp.height;
  return {
    frame: { x: f.x * kx, y: f.y * ky, zoom: f.zoom, rotation: f.rotation },
    occurrenceId: prev.id,
  };
}
