/**
 * Øystein 23.10: tempo-forhåndsvisningen i bevegelsesbane-editoren skal oppdateres for hver endring av
 * ease og tempoverktøyet (også under dra), og avstandsmerkene i scenen og sporet på tidslinjen skal komme
 * fra samme funksjon.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CompositionLayer, MotionPath, ProjectState } from "@/core";
import { pathPointAt, pathProgress } from "@/core";
import { pathSpacingMarks } from "@/core/animation/path-spacing";
import { LayerMotion } from "@/app/scene-editor/LayerMotion";
import { PathSpacingTrack } from "@/app/scene-editor/PathSpacingTrack";
import { motionDraftStore } from "@/app/scene-editor/motion-draft";
import { createFrameStore } from "@/app/scene-editor/use-playback";

const path: MotionPath = {
  points: [{ x: 0, y: 0, smooth: false }, { x: 240, y: 0, smooth: false }],
  startFrame: 0, endFrame: 24, easeOut: 0, easeIn: 0, tempo: [],
} as unknown as MotionPath;
const layer = (p: MotionPath | null = path) => ({ id: "l1", name: "Figur", keyframes: [], path: p } as unknown as CompositionLayer);
const state = { project: { fps: { num: 24, den: 1 } } } as unknown as ProjectState;

afterEach(() => motionDraftStore.set(null));

describe("avstandsmerkene (samme kilde i scene og tidslinje)", () => {
  it("ett merke per bilde, fra pathProgress/pathPointAt", () => {
    const marks = pathSpacingMarks(path);
    expect(marks).toHaveLength(25);
    for (const m of marks) {
      expect(m.progress).toBeCloseTo(pathProgress(path, m.frame), 9);
      expect(m.x).toBeCloseTo(pathPointAt(path, m.progress).x, 9);
    }
    expect(marks[0]!.key && marks[24]!.key).toBe(true);
  });

  it("ease ut samler merkene i starten", () => {
    const even = pathSpacingMarks(path);
    const eased = pathSpacingMarks({ ...path, easeOut: 1 });
    expect(eased[1]!.progress).toBeLessThan(even[1]!.progress);
  });

  it("hold vises som stillstand", () => {
    const held = pathSpacingMarks({ ...path, tempo: [{ t: 0.4, p: 0.5 }, { t: 0.6, p: 0.5 }] });
    expect(held.some((m) => m.held)).toBe(true);
  });

  it("scenen og sporet bruker samme funksjon og samme utkast", () => {
    const stage = readFileSync("src/app/scene-editor/Stage.tsx", "utf8");
    const track = readFileSync("src/app/scene-editor/PathSpacingTrack.tsx", "utf8");
    for (const src of [stage, track]) expect(src).toContain("pathSpacingMarks(");
    expect(stage).toContain("motionDraftStore");
    expect(track).toContain("useShownPath");
  });

  it("sporet viser de samme dataene som funksjonen, og følger utkastet live", () => {
    render(<PathSpacingTrack layer={layer()} ppf={10} gutter={8} labelCss="160px" playback={{ store: createFrameStore(3) }} />);
    const canvas = screen.getByRole("img");
    const fmt = (p: MotionPath) => pathSpacingMarks(p).map((m) => m.progress.toFixed(4)).join(" ");
    expect(canvas.getAttribute("data-marks")).toBe(fmt(path));
    expect(canvas.getAttribute("data-frame")).toBe("3");
    act(() => motionDraftStore.set({ layerId: "l1", path: { ...path, easeIn: 0.8 } }));
    expect(canvas.getAttribute("data-marks")).toBe(fmt({ ...path, easeIn: 0.8 }));
  });
});

describe("tempo-forhåndsvisningen oppdateres fortløpende", () => {
  const view = (l = layer(), run = vi.fn(() => null)) => (
    <LayerMotion state={state} layer={l} editable durationFrames={48} run={run} drawing={false} onDrawingChange={() => {}} />
  );
  const curve = () => screen.getByTestId("tempo-effective").getAttribute("d");

  it("under dra med ease ut og ease inn, før slipp", () => {
    const run = vi.fn(() => null);
    render(view(layer(), run));
    const before = curve();
    fireEvent.change(screen.getByTestId("ease-out"), { target: { value: "60" } });
    const afterOut = curve();
    expect(afterOut).not.toBe(before);
    fireEvent.change(screen.getByTestId("ease-in"), { target: { value: "40" } });
    expect(curve()).not.toBe(afterOut);
    expect(run).not.toHaveBeenCalled();
    fireEvent.pointerUp(screen.getByTestId("ease-in"));
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("for hvert steg med det oransje tempoverktøyet (utkastet)", () => {
    render(view());
    const before = curve();
    act(() => motionDraftStore.set({ layerId: "l1", path: { ...path, tempo: [{ t: 0.5, p: 0.2 }] } }));
    const step1 = curve();
    expect(step1).not.toBe(before);
    act(() => motionDraftStore.set({ layerId: "l1", path: { ...path, tempo: [{ t: 0.5, p: 0.8 }] } }));
    expect(curve()).not.toBe(step1);
    act(() => motionDraftStore.clear("l1"));
    expect(curve()).toBe(before);
  });

  it("ved angre og gjør om (ny lagret bane)", () => {
    const r = render(view());
    const before = curve();
    r.rerender(view(layer({ ...path, easeOut: 1 })));
    const redo = curve();
    expect(redo).not.toBe(before);
    r.rerender(view(layer()));
    expect(curve()).toBe(before);
  });
});
