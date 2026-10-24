/**
 * C-3: det eneste stedet som snakker med Premiere. Import av FCP XML (Premiere lager sekvensen selv, med
 * klippmarkørene på hvert panelbilde) og lesing av den aktive sekvensen som klipp med markører og mediesti.
 * Tid: Premiere bruker «ticks» (254 016 000 000 per sekund); vi regner om til bilder med prosjektets bildefrekvens.
 */
import type { HostClip } from "../../../src/core/connectors/premiere-sequence";
import type { Host } from "./host";

export const TICKS_PER_SECOND = 254016000000;
export function ticksToFrames(t: { ticks: string | number }, fps: { num: number; den: number }): number {
  return Math.round((Number(t.ticks) / TICKS_PER_SECOND) * (fps.num / fps.den));
}

export async function importSequenceXml(host: Host, nativePath: string): Promise<boolean> {
  const project = await host.ppro.Project.getActiveProject();
  if (!project) return false;
  return !!(await project.importFiles([nativePath], true));
}

export async function readActiveSequence(host: Host, fps: { num: number; den: number }): Promise<{ name: string; clips: HostClip[] } | null> {
  const project = await host.ppro.Project.getActiveProject();
  const seq = project ? await project.getActiveSequence() : null;
  if (!seq) return null;
  const track = await seq.getVideoTrack(0);
  if (!track) return { name: seq.name, clips: [] };
  const items = await track.getTrackItems(host.ppro.Constants.TrackItemType.CLIP, false);
  const clips: HostClip[] = [];
  for (const it of items) {
    const [start, end, pi] = await Promise.all([it.getStartTime(), it.getEndTime(), it.getProjectItem()]);
    const clip = host.ppro.ClipProjectItem.cast(pi);
    let markers: string[] = [], mediaPath: string | null = null;
    try { markers = (await host.ppro.Markers.getMarkers(pi)).getMarkers().flatMap(m => [m.getComments(), m.getName()]); } catch { markers = []; }
    try { mediaPath = clip ? String(await clip.getMediaFilePath()) : null; } catch { mediaPath = null; }
    clips.push({ startFrame: ticksToFrames(start, fps), endFrame: ticksToFrames(end, fps), markers, mediaPath });
  }
  return { name: seq.name, clips };
}
