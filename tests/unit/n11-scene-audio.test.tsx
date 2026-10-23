/** N11 REQ-0764: ekte karaktergrupper vises med karakterens navn, ikke filens eller replikkens navn. */
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setLanguage, type FilmAudioItem } from "@/core";
import { dvBase, dvId } from "../helpers/dialogue-fixture";
vi.mock("@/app/audio/use-audio-playback", () => ({ audioBank: new Map() }));
vi.mock("@/app/assembly/AudioTracks", () => ({ Wave: () => null, AUDIO_KIND_COLOR: {} }));
import { SceneAudioRows } from "@/app/scene-editor/SceneAudioRows";

afterEach(cleanup);
describe.each(["nb", "en"] as const)("N11 karakterspor – %s", lang => {
  it("REQ-0764: to karakterer får hver sin navngitte rad; to replikker deler første rad", () => {
    setLanguage(lang);
    const { s, clipId } = dvBase();
    const base = s.audioClips[clipId];
    const characters = Object.values(s.assets).filter(a => a.kind === "character" && !a.removed);
    const first = characters[0], second = characters[1];
    if (!base || !first || !second) throw new Error("Fixture needs two characters");
    const clips = [
      { ...base, characterAssetId: first.id },
      { ...base, id: dvId(991) as typeof base.id, offsetMs: 9000, characterAssetId: first.id },
      { ...base, id: dvId(992) as typeof base.id, offsetMs: 15000, characterAssetId: second.id },
    ];
    const state = { ...s, audioClips: { ...s.audioClips, ...Object.fromEntries(clips.map(c => [c.id, c])) } };
    const items: FilmAudioItem[] = clips.map(clip => ({ clip, version: null, start: clip.offsetMs / 1000, length: clip.lengthMs / 1000, fullLength: clip.lengthMs / 1000, sourceIn: 0, gain: 1, keys: [], fadeIn: 0, fadeOut: 0 }));
    render(<SceneAudioRows state={state} occurrenceId={base.occurrenceId} items={items} g={{ ppf: 2, labelW: 120, gutter: 8, rowH: 30, fps: 24 }} loaded={0} onFrame={vi.fn()} onOpen={vi.fn()} />);
    const tracks = screen.getAllByTestId("scene-character-track");
    expect(tracks).toHaveLength(2);
    const firstTrack = tracks.find(t => t.textContent?.includes(first.name));
    const secondTrack = tracks.find(t => t.textContent?.includes(second.name));
    if (!firstTrack || !secondTrack) throw new Error("Missing character tracks");
    expect(within(firstTrack).getByText(first.name, { exact: true })).toBeVisible();
    expect(within(secondTrack).getByText(second.name, { exact: true })).toBeVisible();
    expect(within(firstTrack).getAllByTestId("scene-dialogue-segment").map(e => e.getAttribute("data-clip-id"))).toEqual(clips.slice(0, 2).map(c => c.id));
    expect(within(secondTrack).getAllByTestId("scene-dialogue-segment").map(e => e.getAttribute("data-clip-id"))).toEqual([clips[2]?.id]);
  });
});