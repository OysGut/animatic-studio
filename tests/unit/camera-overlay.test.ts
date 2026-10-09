// @vitest-environment node
/** Kameraoverlegget: treffsjekk av rammer, hjørner, kontrollpunkter og bane, og dra-utkast. */
import { describe, expect, it } from "vitest";
import type { CameraShot } from "@/core";
import { dragCameraShot, pickCamera } from "@/app/scene-editor/camera-overlay";

const comp = { width: 1000, height: 500 };
const view = { zoom: 1, x: 0, y: 0 };
const shot: CameraShot = {
  id: "s1",
  name: "",
  startFrame: 0,
  endFrame: 24,
  from: { x: 500, y: 250, zoom: 1, rotation: 0 }, // 0..1000 x 0..500
  to: { x: 800, y: 400, zoom: 4, rotation: 0 }, // 675..925 x 337.5..462.5
  curve: null,
  easing: "linear",
};
const curved: CameraShot = { ...shot, curve: { c1x: 500, c1y: 400, c2x: 700, c2y: 100 } };

describe("pickCamera", () => {
  it("treffer kanten på en ramme", () => {
    expect(pickCamera(shot, comp, view, { x: 3, y: 100 }, false)).toEqual({
      kind: "edge",
      which: "from",
    });
    expect(pickCamera(shot, comp, view, { x: 800, y: 463 }, false)).toEqual({
      kind: "edge",
      which: "to",
    });
  });
  it("treffer hjørner bare når utsnittet er valgt", () => {
    expect(pickCamera(shot, comp, view, { x: 1000, y: 500 }, true)).toEqual({
      kind: "corner",
      which: "from",
      index: 2,
    });
    expect(pickCamera(shot, comp, view, { x: 1000, y: 500 }, false)).toEqual({
      kind: "edge",
      which: "from",
    });
  });
  it("treffer kontrollpunkter foran rammer", () => {
    expect(pickCamera(curved, comp, view, { x: 702, y: 101 }, true)).toEqual({
      kind: "control",
      which: "c2",
    });
  });
  it("treffer banen og innsiden", () => {
    // Rett bane fra (500,250) til (800,400): midtpunktet er (650,325)
    expect(pickCamera(shot, comp, view, { x: 650, y: 327 }, false)).toEqual({ kind: "path" });
    expect(pickCamera(shot, comp, view, { x: 200, y: 100 }, false)).toBeNull();
    expect(pickCamera(shot, comp, view, { x: 200, y: 100 }, true)).toEqual({
      kind: "inside",
      which: "from",
    });
  });
  it("tar hensyn til visningens zoom og forskyvning", () => {
    const v = { zoom: 0.5, x: 100, y: 50 };
    expect(pickCamera(shot, comp, v, { x: 600, y: 150 }, false)).toEqual({
      kind: "edge",
      which: "from",
    });
  });
});

describe("dragCameraShot", () => {
  const start = { x: 500, y: 250 };
  it("flytter en ramme, og Shift låser til én akse", () => {
    const m = dragCameraShot(
      shot,
      comp,
      { kind: "edge", which: "to" },
      start,
      { x: 540, y: 260 },
      false,
    );
    expect(m.to).toMatchObject({ x: 840, y: 410 });
    const s = dragCameraShot(
      shot,
      comp,
      { kind: "edge", which: "to" },
      start,
      { x: 540, y: 260 },
      true,
    );
    expect(s.to).toMatchObject({ x: 840, y: 400 });
  });
  it("endrer zoom fra avstanden til midten og begrenser den", () => {
    const half = Math.hypot(1000, 500) / 2;
    const z = dragCameraShot(
      shot,
      comp,
      { kind: "corner", which: "from", index: 0 },
      start,
      { x: 500, y: 250 + half / 2 },
      false,
    );
    expect(z.from.zoom).toBeCloseTo(2, 2);
    const far = dragCameraShot(
      shot,
      comp,
      { kind: "corner", which: "from", index: 0 },
      start,
      { x: 500, y: 250 + half * 100 },
      false,
    );
    expect(far.from.zoom).toBe(0.1);
  });
  it("flytter kontrollpunkter", () => {
    const m = dragCameraShot(
      curved,
      comp,
      { kind: "control", which: "c1" },
      start,
      { x: 510, y: 245 },
      false,
    );
    expect(m.curve).toMatchObject({ c1x: 510, c1y: 395, c2x: 700, c2y: 100 });
  });
});
