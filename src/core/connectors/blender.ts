/**
 * C-8 Blender: kameraplanen for én scene (sceneforekomst). Bare lesing.
 * Hvert storyboardpanel gir ett nøkkelbilde på sin starttid med SB-9-kameraet (brennvidde, sensorbredde,
 * plassering og retning i blokkingplanen). Sensorhøyden følger panelets bildeformat, så synsvinkelen i
 * Blender er nøyaktig `fieldOfView` fra SB-9. Bevegelse innen et skudd hentes fra den eksisterende
 * PTG3/FBX-eksporten (Til produksjonen), som tillegget importerer uendret.
 * Takhøyde per plan (én scene), aldri global.
 */
import type { ProjectState } from "../model";
import { positionIndex } from "../storyboard/position";
import { blockingOf, fieldOfView } from "../storyboard/blocking";

export const BLENDER_CLIENT_ID = "ptg.blender";
export const KRITA_CLIENT_ID = "ptg.krita";
export const BLENDER_ADAPTER = { id: "blender-python", version: "1" } as const;
export const KRITA_ADAPTER = { id: "krita-python", version: "1" } as const;
export const BLENDER_MAX_PANELS = 2000;

export interface BlenderCameraKey {
  readonly panelId: string;
  readonly panelName: string;
  /** Bilde relativt til scenens start (opptakstidslinjen i appen). */
  readonly frame: number;
  readonly durationFrames: number;
  readonly width: number;
  readonly height: number;
  /** null når panelet ikke har et SB-9-kamera; tillegget beholder da forrige kamera. */
  readonly camera: null | {
    readonly id: string; readonly x: number; readonly y: number; readonly heading: number;
    readonly focalMm: number; readonly sensorWidthMm: number; readonly sensorHeightMm: number;
    readonly fovHorizontalDeg: number; readonly fovVerticalDeg: number;
  };
}
export interface BlenderCameraPlan {
  readonly version: 1;
  readonly projectId: string;
  readonly occurrenceId: string;
  readonly sceneId: string;
  readonly fps: { readonly num: number; readonly den: number };
  readonly frameSize: { readonly width: number; readonly height: number };
  readonly keys: readonly BlenderCameraKey[];
  readonly truncated: boolean;
}

export function blenderCameraPlan(s: ProjectState, occurrenceId: string): BlenderCameraPlan | null {
  const occ = s.occurrences[occurrenceId];
  if (!occ) return null;
  const shots = positionIndex(s, occ.productionId).shots.filter(x => x.occurrenceId === occurrenceId);
  const start = shots[0]?.startFrame ?? 0;
  const keys: BlenderCameraKey[] = shots.slice(0, BLENDER_MAX_PANELS).map(shot => {
    const p = shot.panel, plan = blockingOf(p);
    const cam = plan ? plan.cameras.find(c => c.id === plan.cameraId) ?? null : null;
    const aspect = p.width > 0 && p.height > 0 ? p.width / p.height : 16 / 9;
    const fov = cam ? fieldOfView(cam.focal, cam.sensor, aspect) : null;
    return {
      panelId: p.id, panelName: p.name, frame: shot.startFrame - start, durationFrames: shot.durationFrames, width: p.width, height: p.height,
      camera: cam && fov ? { id: cam.id, x: cam.x, y: cam.y, heading: cam.heading, focalMm: cam.focal, sensorWidthMm: cam.sensor, sensorHeightMm: cam.sensor / aspect, fovHorizontalDeg: fov.horizontal, fovVerticalDeg: fov.vertical } : null,
    };
  });
  const first = shots[0]?.panel;
  return {
    version: 1, projectId: s.project.id, occurrenceId, sceneId: occ.sceneId, fps: s.project.fps,
    frameSize: { width: first?.width ?? 1920, height: first?.height ?? 1080 }, keys, truncated: shots.length > BLENDER_MAX_PANELS,
  };
}
