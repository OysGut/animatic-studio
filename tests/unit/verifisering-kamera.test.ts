// @vitest-environment node
/**
 * Verifisering av krav (DEC-0073): 2D-sceneeditor uten 3D (REQ-0169) og at kamerarammene (blå start, rød
 * slutt) bare er redigeringshjelp og aldri kommer med i avspilling eller eksport (REQ-0187).
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ASSET_MIME_TYPES,
  cameraAt,
  defaultLayerFields,
  filmClips,
  orderedOccurrences,
  renderFrame,
  viewMatrix,
  type CompositionCamera,
} from "@/core";
import { drawFilmFrame } from "@/engine/compositor/film";
import { mustApply, seedProject, tid } from "../helpers/fixtures";
import { SoftCanvas } from "../helpers/soft-canvas";

const ROOT = join(__dirname, "../..");
const SRC = join(ROOT, "src");
const OVERLAY = join(SRC, "app/scene-editor/camera-overlay.ts");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return walk(p);
    return /\.(ts|tsx)$/.test(p) ? [p] : [];
  });
}

function resolveImport(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(from), spec);
  else return null;
  base = base.replace(/\?.*$/, "");
  for (const e of ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    const p = base + e;
    if (existsSync(p) && statSync(p).isFile()) return p;
  }
  throw new Error(`Kunne ikke løse «${spec}» i ${relative(ROOT, from)}`);
}

function reachable(entries: readonly string[]): Set<string> {
  const seen = new Set<string>();
  const stack = [...entries];
  while (stack.length) {
    const file = stack.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const code = readFileSync(file, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
    const re =
      /\b(import|export)\s+(type\s+)?(?:[\w*{}\s,$]+?\s+from\s+)?["']([^"']+)["']|\bimport\(\s*["']([^"']+)["']\s*\)/g;
    for (const m of code.matchAll(re)) {
      if (m[2]) continue;
      const dep = resolveImport(file, (m[3] ?? m[4])!);
      if (dep && !seen.has(dep)) stack.push(dep);
    }
  }
  return seen;
}

const CAMERA: CompositionCamera = {
  shots: [
    {
      id: "shot-1",
      name: "Inn",
      startFrame: 0,
      endFrame: 50,
      from: { x: 500, y: 300, zoom: 1, rotation: 0 },
      to: { x: 300, y: 200, zoom: 2, rotation: 15 },
      curve: null,
      easing: "linear",
    },
  ],
} as CompositionCamera;

function sceneWithCamera() {
  const { state, mainId } = seedProject(1);
  let s = mustApply(state, {
    type: "SetProjectFormat",
    width: 1000,
    height: 600,
    fps: { num: 25, den: 1 },
  });
  const o = orderedOccurrences(s, mainId)[0]!;
  // Fixturen har en aktiv 2D-take uten fil på scenen; 2D-scenen er det som spilles
  const compositionId = tid<"composition">();
  const fields = {
    name: "Stua",
    width: 1000,
    height: 600,
    durationFrames: 50,
    background: "#101114",
  };
  s = mustApply(s, { type: "CreateComposition", compositionId, variantId: o.variantId, fields });
  s = mustApply(s, { type: "UpdateComposition", compositionId, fields, camera: CAMERA });
  s = mustApply(s, {
    type: "AddLayers",
    layers: [
      {
        layerId: tid(),
        compositionId,
        fields: defaultLayerFields(s, s.compositions[compositionId]!, { fill: "#2b3a55" }),
      },
    ],
  });
  return { s, mainId, compositionId };
}

describe("REQ-0187 – kamerarammene utelates fra avspilling og eksport", () => {
  it("REQ-0187: eksportmotoren, filmavspillingen og forhåndsvisningen når ikke tegningen av kamerarammene", () => {
    expect(existsSync(OVERLAY)).toBe(true);
    const entries = [
      ...walk(join(SRC, "engine")),
      ...walk(join(SRC, "core")),
      join(SRC, "app/assembly/ExportAnimaticDialog.tsx"),
      join(SRC, "app/assembly/FilmViewer.tsx"),
      join(SRC, "app/assembly/FilmPopout.tsx"),
      join(SRC, "app/scene-editor/PreviewWindow.tsx"),
    ];
    for (const e of entries) expect(existsSync(e), e).toBe(true);
    const graph = reachable(entries);
    expect(graph.size).toBeGreaterThan(entries.length);
    expect(graph.has(OVERLAY)).toBe(false);
    // Kontrollprøve: redigeringsflaten (Stage) tegner rammene, så gjennomgangen virker
    expect(reachable([join(SRC, "app/scene-editor/Stage.tsx")]).has(OVERLAY)).toBe(true);
  });

  it("REQ-0187: et bilde fra eksport/avspilling av en scene med kamerautsnitt tegner ingen konturer", () => {
    const { s, mainId } = sceneWithCamera();
    const clips = filmClips(s, mainId);
    expect(clips[0]!.source).toBe("composition");
    const calls: string[] = [];
    const strokeStyles: string[] = [];
    for (const frame of [0, 25, 49]) {
      const canvas = new SoftCanvas(200, 120);
      const ctx = canvas.getContext();
      const spy = new Proxy(ctx, {
        get(target, prop, receiver) {
          const v = Reflect.get(target, prop, receiver);
          if (typeof v === "function")
            return (...args: unknown[]) => {
              calls.push(String(prop));
              return (v as (...a: unknown[]) => unknown).apply(target, args);
            };
          return v;
        },
        set(target, prop, value) {
          if (prop === "strokeStyle") strokeStyles.push(String(value));
          return Reflect.set(target, prop, value);
        },
      });
      drawFilmFrame(spy as unknown as CanvasRenderingContext2D, s, clips, frame, {
        width: 200,
        height: 120,
        images: new Map(),
        placeholders: false,
      });
    }
    // Bildet ble faktisk tegnet …
    expect(calls).toContain("fillRect");
    // … uten streker eller rammer (rammene i editoren er streker i blått og rødt)
    expect(calls.filter((c) => /stroke|setLineDash/i.test(c))).toEqual([]);
    expect(strokeStyles).toEqual([]);
  });

  it("REQ-0187: bildet i kameravisning inneholder bare lagene – ingen elementer for rammene", () => {
    const { s, compositionId } = sceneWithCamera();
    const layerIds = new Set(Object.keys(s.layers));
    for (const f of [0, 25, 49]) {
      const items = renderFrame(s, compositionId, f, { view: "camera" }).items;
      expect(items.length).toBeGreaterThan(0);
      for (const it of items) expect(layerIds.has(it.layerId)).toBe(true);
    }
  });
});

describe("REQ-0169 – sceneeditoren er en 2D-editor, ikke 3D", () => {
  it("REQ-0169: kameraet har bare posisjon, zoom og rotasjon i planet; visningen er en 2D-affin matrise", () => {
    const { s, compositionId } = sceneWithCamera();
    const cam = cameraAt(s.compositions[compositionId]!, 25);
    expect(Object.keys(cam).sort()).toEqual(["rotation", "x", "y", "zoom"]);
    const m = viewMatrix(s.compositions[compositionId]!, cam, 1);
    expect(m).toHaveLength(6); // [a b c d e f] – 2D affin, ingen 3D-projeksjon
    expect(Object.keys(s.compositions[compositionId]!.camera.shots[0]!.from).sort()).toEqual([
      "rotation",
      "x",
      "y",
      "zoom",
    ]);
  });

  it("REQ-0169: lagene er 2D-lag med rekkefølge og dybdeverdi (parallakse), uten 3D-geometri", () => {
    const { s } = sceneWithCamera();
    const layer = Object.values(s.layers)[0]!;
    expect(Object.keys(layer.transform).sort()).toEqual(
      ["opacity", "rotation", "scaleX", "scaleY", "x", "y"].sort(),
    );
    expect(typeof layer.parallax).toBe("number");
    expect(typeof layer.orderKey).toBe("string");
    const forbidden =
      /^(z|depth3d|rotationX|rotationY|rotationZ|mesh|vertices|geometry|model3d|camera3d)$/i;
    expect(Object.keys(layer).filter((k) => forbidden.test(k))).toEqual([]);
    expect(Object.keys(layer.transform).filter((k) => forbidden.test(k))).toEqual([]);
  });

  it("REQ-0169: ressursbiblioteket tar ikke imot 3D-modeller", () => {
    expect(ASSET_MIME_TYPES.length).toBeGreaterThan(0);
    for (const t of ASSET_MIME_TYPES) expect(t).not.toMatch(/^model\/|gltf|obj|fbx|usd/i);
  });
});
