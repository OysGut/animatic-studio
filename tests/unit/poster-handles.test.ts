// @vitest-environment node
/**
 * Plakatens håndtak på lerretet (KI-132) og brukerens endringer når plakattypen byttes (KI-133), DEC-0073.
 */
import { describe, expect, it } from "vitest";
import {
  applyCommand,
  mainProduction,
  posterDraft,
  posterKindBase,
  type Poster,
  type PosterDocument,
  type PosterKind,
} from "@/core";
import { editElement, relayout, withElement } from "@/app/release/poster-edit";
import {
  boxCenter,
  changedFields,
  cornerCursor,
  dragGeometry,
  resizeBox,
  rotateBox,
  rotatePoint,
  type Box,
  type Corner,
} from "@/app/release/poster-handles";
import { envelope, mustApply, tid } from "../helpers/fixtures";
import { fixture } from "../visual/fixture-state";

const close = (a: number, b: number, eps = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(eps);

/** Hjørnet på plakaten (verdenskoordinater) for en rotert ramme. */
function corner(b: Box, c: Corner): { x: number; y: number } {
  const sx = c === "ne" || c === "se" ? 1 : -1;
  const sy = c === "sw" || c === "se" ? 1 : -1;
  const o = rotatePoint({ x: (sx * b.w) / 2, y: (sy * b.h) / 2 }, b.rotation);
  const m = boxCenter(b);
  return { x: m.x + o.x, y: m.y + o.y };
}

const opposite: Record<Corner, Corner> = { nw: "se", se: "nw", ne: "sw", sw: "ne" };

describe("håndtak for størrelse (KI-132)", () => {
  it("uten rotasjon: hjørnet følger musen og det motsatte hjørnet står", () => {
    const b: Box = { x: 100, y: 200, w: 80, h: 40, rotation: 0 };
    const se = resizeBox(b, "se", { x: 180, y: 240 }, { x: 200, y: 250 }, false);
    expect(se).toEqual({ x: 100, y: 200, w: 100, h: 50 });
    const nw = resizeBox(b, "nw", { x: 100, y: 200 }, { x: 90, y: 230 }, false);
    expect(nw).toEqual({ x: 90, y: 230, w: 90, h: 10 });
  });

  it("rotert element: regnes i lokale akser, og det motsatte hjørnet står stille på plakaten", () => {
    for (const rotation of [30, -75, 135, 180]) {
      const b: Box = { x: 300, y: 400, w: 120, h: 60, rotation };
      for (const c of ["nw", "ne", "sw", "se"] as const) {
        const start = corner(b, c);
        // Dra hjørnet 20 mm utover langs elementets egen x-akse og 10 mm langs y-aksen
        const sx = c === "ne" || c === "se" ? 1 : -1;
        const sy = c === "sw" || c === "se" ? 1 : -1;
        const d = rotatePoint({ x: sx * 20, y: sy * 10 }, rotation);
        const r = resizeBox(b, c, start, { x: start.x + d.x, y: start.y + d.y }, false);
        close(r.w, 140);
        close(r.h, 70);
        const nb = { ...r, rotation };
        const fixed = corner(nb, opposite[c]);
        const was = corner(b, opposite[c]);
        close(fixed.x, was.x);
        close(fixed.y, was.y);
        // Hjørnet som ble dratt, er der musen er
        const moved = corner(nb, c);
        close(moved.x, start.x + d.x);
        close(moved.y, start.y + d.y);
      }
    }
  });

  it("Shift beholder forholdet; minste størrelse er 2 mm", () => {
    const b: Box = { x: 0, y: 0, w: 100, h: 50, rotation: 45 };
    const start = corner(b, "se");
    const d = rotatePoint({ x: 50, y: 5 }, 45);
    const r = resizeBox(b, "se", start, { x: start.x + d.x, y: start.y + d.y }, true);
    close(r.w / r.h, 2);
    close(r.w, 150);
    const tiny = resizeBox(
      { x: 0, y: 0, w: 100, h: 50, rotation: 0 },
      "se",
      { x: 100, y: 50 },
      { x: -500, y: -500 },
      false,
    );
    expect(tiny.w).toBe(2);
    expect(tiny.h).toBe(2);
    const tinyRatio = resizeBox(
      { x: 0, y: 0, w: 100, h: 50, rotation: 0 },
      "se",
      { x: 100, y: 50 },
      { x: -500, y: -500 },
      true,
    );
    close(tinyRatio.w / tinyRatio.h, 2);
    expect(tinyRatio.h).toBeGreaterThanOrEqual(2 - 1e-9);
  });

  it("pekeren for hjørnene dreies med elementet", () => {
    expect(cornerCursor("se", 0)).toBe("nwse-resize");
    expect(cornerCursor("ne", 0)).toBe("nesw-resize");
    expect(cornerCursor("se", 45)).toBe("ns-resize");
    expect(cornerCursor("se", 90)).toBe("nesw-resize");
  });
});

describe("håndtak for rotasjon (KI-132)", () => {
  const b: Box = { x: 0, y: 0, w: 100, h: 100, rotation: 10 };
  it("vinkelen rundt midtpunktet legges til, normalisert", () => {
    // Fra rett over midten til rett til høyre: 90° med klokka
    expect(rotateBox(b, { x: 50, y: -20 }, { x: 170, y: 50 }, false)).toBe(100);
    expect(rotateBox({ ...b, rotation: 170 }, { x: 50, y: -20 }, { x: 170, y: 50 }, false)).toBe(
      -100,
    );
  });

  it("Shift gir trinn på 15°", () => {
    const p = rotatePoint({ x: 0, y: -70 }, 23);
    const r = rotateBox(b, { x: 50, y: -20 }, { x: 50 + p.x, y: 50 + p.y }, true);
    expect(r).toBe(30);
    expect(r % 15).toBe(0);
  });

  it("ett dra gir bare feltene som er endret, avrundet", () => {
    const geo = dragGeometry("rotate", b, { x: 50, y: -20 }, { x: 170, y: 50 }, false);
    expect(changedFields(b, geo)).toEqual({ rotation: 100 });
    const mv = dragGeometry("move", b, { x: 10, y: 10 }, { x: 12.345, y: 10 }, false);
    expect(changedFields(b, mv)).toEqual({ x: 2.3 });
  });
});

describe("bytte av plakattype beholder brukerens endringer (KI-133)", () => {
  const s0 = fixture.state;
  const main = mainProduction(s0)!;
  const maja = Object.values(s0.assets).find((a) => a.name === "Maja")!;
  const img = `char:${maja.id}:img`;

  const asPoster = (doc: PosterDocument, kind: PosterKind): Poster =>
    ({
      id: "p",
      revision: 1,
      productionId: main.id,
      name: "Test",
      kind,
      language: "nb",
      widthMm: 700,
      heightMm: 1000,
      document: doc,
      removed: false,
    }) as unknown as Poster;

  const switchTo = (doc: PosterDocument, from: PosterKind, to: PosterKind) =>
    relayout(s0, asPoster(doc, from), posterKindBase(doc, to), { kind: to });

  it("felles elementer får endringene i den nye typen, og alt kommer tilbake ved bytte tilbake", () => {
    let doc = posterDraft(s0, main.id, "pitch");
    expect(doc.elements.some((e) => e.id === img)).toBe(true);
    expect(doc.elements.some((e) => e.id === "names")).toBe(true);
    doc = withElement(doc, "title", { y: 120, rotation: -8, text: { nb: "EGEN", en: "" } });
    doc = withElement(doc, img, { x: 11, w: 222, rotation: 15 });
    doc = withElement(doc, "genre", { visible: false });
    // «names» finnes bare i pitch: skjult og vist igjen av brukeren, og rotert
    doc = withElement(doc, "names", { visible: false });
    doc = withElement(doc, "names", { visible: true, rotation: 5 });

    const map = switchTo(doc, "pitch", "character_map");
    const byId = (d: PosterDocument, id: string) => d.elements.find((e) => e.id === id)!;
    expect(byId(map, "title")).toMatchObject({ y: 120, rotation: -8, text: { nb: "EGEN" } });
    expect(byId(map, img)).toMatchObject({ x: 11, w: 222, rotation: 15, visible: true });
    expect(byId(map, "genre").visible).toBe(false);
    // Uendrede elementer følger den nye typen (programmets versjon)
    const fresh = posterDraft(s0, main.id, "character_map");
    expect(byId(map, img).h).toBe(byId(fresh, img).h);
    expect(byId(map, "logline")).toEqual(byId(fresh, "logline"));
    // Bare i pitch: står skjult, men husker endringene
    expect(byId(map, "names")).toMatchObject({ visible: false, rotation: 5, auto: false });

    const back = switchTo(map, "character_map", "pitch");
    expect(byId(back, "title")).toMatchObject({ y: 120, rotation: -8, text: { nb: "EGEN" } });
    expect(byId(back, img)).toMatchObject({ x: 11, w: 222, rotation: 15 });
    expect(byId(back, "genre").visible).toBe(false);
    expect(byId(back, "names")).toMatchObject({ visible: true, rotation: 5 });
    // Kartets egne elementer (kortene) er borte igjen, og ingen elementer er doble
    expect(back.elements.some((e) => e.id === `char:${maja.id}:card`)).toBe(false);
    expect(new Set(back.elements.map((e) => e.id)).size).toBe(back.elements.length);
  });

  it("skjult av brukeren står skjult etter bytte fram og tilbake", () => {
    let doc = posterDraft(s0, main.id, "pitch");
    doc = withElement(doc, "names", { visible: false });
    const back = switchTo(switchTo(doc, "pitch", "character_map"), "character_map", "pitch");
    expect(back.elements.find((e) => e.id === "names")!.visible).toBe(false);
  });

  it("egne elementer står, og typeskiftet angres som ett steg", () => {
    const base = posterDraft(s0, main.id, "pitch");
    const custom = editElement(
      {
        id: "custom:x",
        kind: "rect",
        role: "custom",
        x: 1,
        y: 2,
        w: 3,
        h: 4,
        rotation: 30,
        visible: true,
        auto: false,
        fill: "#ffffff",
        stroke: null,
        strokeWidth: 0,
        opacity: 1,
        radius: 0,
      },
      {},
    );
    const doc = withElement({ ...base, elements: [...base.elements, custom] }, "title", {
      rotation: 12,
    });
    const posterId = tid<"poster">();
    const fields = {
      productionId: main.id,
      name: "Plakat",
      kind: "pitch" as const,
      language: "nb" as const,
      widthMm: 700,
      heightMm: 1000,
      document: doc,
    };
    const s1 = mustApply(s0, { type: "CreatePoster", posterId, fields });
    const p1 = s1.posters[posterId]!;
    const next = switchTo(p1.document, "pitch", "character_map");
    const r = applyCommand(
      s1,
      envelope({
        type: "UpdatePoster",
        posterId,
        fields: { ...fields, kind: "character_map", document: next },
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const p2 = r.state.posters[posterId]!;
    expect(p2.kind).toBe("character_map");
    expect(p2.document.elements.find((e) => e.id === "custom:x")).toEqual(custom);
    expect(p2.document.elements.find((e) => e.id === "title")!.rotation).toBe(12);
    const u = applyCommand(r.state, envelope(r.inverse));
    expect(u.ok).toBe(true);
    if (!u.ok) return;
    expect(u.state.posters[posterId]!.kind).toBe("pitch");
    expect(u.state.posters[posterId]!.document).toEqual(p1.document);
  });
});
