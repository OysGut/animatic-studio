// @vitest-environment node
/**
 * Funn og ønsker fra Mars 13.–14.10.2026 (DEC-0080): lesevisning av valgt scene, nullstill format, skvis med
 * sidehåndtak, speilvending som tweenes, forstørrelse over 1:1, fjern luften rundt, utsnitt og ruter,
 * vinkel på bilder og faktaark (migrasjon 0030), promptmotoren per modell, stilanalyse, nye fal-modeller
 * og oppskalering.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { ADAPTERS, aspectOf } from "@/adapters/ai/providers.server";
import { needsSchema30 } from "@/adapters/storage/commands.functions";
import {
  alphaBounds,
  applyCommand,
  applyStyleAnalysis,
  aspectResetScale,
  attachedImages,
  briefSummaryNb,
  buildContextImageBrief,
  buildContextImagePrompt,
  cleanVisualBrief,
  colourName,
  diffStates,
  emptyProjectState,
  emptyStyleGuide,
  estimateCostUsd,
  flippedKeyframesFrom,
  flowLines,
  gridCells,
  isSquished,
  labelledViews,
  layerMagnification,
  layersOf,
  mainProduction,
  maxLayerMagnification,
  paddedBox,
  parseStyleAnalysis,
  polygonBounds,
  promptFamilyOf,
  providerModel,
  providersFor,
  renderBrief,
  stateFromRows,
  stretchedTransform,
  trimPadding,
  turnaroundAttachments,
  valueAt,
  VERSION_VIEW_LABEL,
  visualBriefFacts,
  worthTrimming,
  type Page,
  type PageLine,
} from "@/core";
import { envelope, mustApply, tid } from "../helpers/fixtures";
import { fixture } from "../visual/fixture-state";

const s0 = fixture.state;
const main = mainProduction(s0)!;
const byName = (n: string) => Object.values(s0.assets).find((a) => a.name === n)!;
const imageVersion = Object.values(s0.assetVersions).find((v) => v.mimeType.startsWith("image/"))!;

// ---------------------------------------------------------------- Lesevisning

describe("lesevisning av valgt scene (uten ark)", () => {
  const line = (row: number, over: Partial<PageLine> = {}): PageLine => ({
    row,
    kind: "action",
    text: `linje ${row}`,
    left: 10,
    occurrenceId: "o1",
    blockId: `b${row}`,
    first: true,
    ...over,
  });
  it("fjerner tomrom, (MORE) og (CONT'D) mellom sidene, og holder blokker som fortsetter sammen", () => {
    const pages: Page[] = [
      {
        number: 1,
        lines: [
          line(0, { kind: "heading", blockId: null }),
          line(2),
          line(50, { blockId: "bx" }),
          line(51, { kind: "more", blockId: null }),
        ],
      },
      {
        number: 2,
        lines: [
          line(-1, { kind: "contd", blockId: null }),
          line(0, { blockId: "bx", first: false }),
          line(2, { blockId: "by" }),
        ],
      },
    ];
    const f = flowLines(pages);
    expect(f.lines.map((l) => l.kind)).not.toContain("more");
    expect(f.lines.map((l) => l.kind)).not.toContain("contd");
    // Side 1: rad 0–50 (51 linjer); side 2 fortsetter blokken bx rett etter
    const bx2 = f.lines.find((l) => l.page === 2 && l.blockId === "bx")!;
    expect(bx2.row).toBe(51);
    expect(f.lines.find((l) => l.blockId === "by")!.row).toBe(53);
    // Markeringer og notater bruker fortsatt side og indeks fra sidene
    expect(bx2.index).toBe(1);
    expect(f.rows).toBe(54);
  });
  it("ny blokk på neste side får én tom linje imellom", () => {
    const f = flowLines([
      { number: 1, lines: [line(0)] },
      { number: 2, lines: [line(3, { blockId: "c" })] },
    ]);
    expect(f.lines[1]!.row).toBe(2);
  });
});

// ---------------------------------------------------------------- Form og speilvending

describe("nullstill format, skvis og speilvending fra et nøkkelbilde", () => {
  it("nullstill format beholder bredden eller høyden, og speilvendingen", () => {
    expect(isSquished({ scaleX: 1, scaleY: 1.002 })).toBe(false);
    expect(isSquished({ scaleX: -1, scaleY: 1 })).toBe(false);
    expect(isSquished({ scaleX: 1.4, scaleY: 0.9 })).toBe(true);
    expect(aspectResetScale({ scaleX: -1.4, scaleY: 0.9 }, "x")).toEqual({
      scaleX: -1.4,
      scaleY: 1.4,
    });
    expect(aspectResetScale({ scaleX: -1.4, scaleY: 0.9 }, "y")).toEqual({
      scaleX: -0.9,
      scaleY: 0.9,
    });
  });

  it("sidehåndtaket skvever i én retning; motsatt side står stille (Alt: begge sider)", () => {
    const t = { x: 500, y: 300, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 };
    const size = { x: 200, y: 100 };
    // Dra høyre side 50 px ut: bredere, og midten flytter 25 px
    const r = stretchedTransform(t, size, "x", { x: 100, y: 0 }, { x: 150, y: 0 }, false);
    expect(r.scaleX).toBeCloseTo(1.25);
    expect(r.scaleY).toBe(1);
    expect(r.x).toBeCloseTo(525);
    // Alt: begge sider – dobbel endring, midten står
    const a = stretchedTransform(t, size, "x", { x: 100, y: 0 }, { x: 150, y: 0 }, true);
    expect(a.scaleX).toBeCloseTo(1.5);
    expect(a.x).toBe(500);
    // Rotert 90°: «x»-aksen peker nedover, midten flytter i y
    const rot = stretchedTransform(
      { ...t, rotation: 90 },
      size,
      "x",
      { x: -100, y: 0 },
      { x: -140, y: 0 },
      false,
    );
    expect(rot.scaleX).toBeCloseTo(1.2);
    expect(rot.y).toBeCloseTo(280);
    // Speilvendt lag beholder fortegnet; aldri mindre enn 1 px
    const f = stretchedTransform(
      { ...t, scaleY: -1 },
      size,
      "y",
      { x: 0, y: 50 },
      { x: 0, y: -500 },
      false,
    );
    expect(f.scaleY).toBeLessThan(0);
    expect(Math.abs(f.scaleY) * size.y).toBeGreaterThanOrEqual(1);
  });

  it("speilvending fra her tweenes (glidende) eller skjer på ett bilde (brått)", () => {
    const l = layersOf(s0, Object.values(s0.compositions)[0]!.id).find((x) => x.kind !== "group")!;
    const base = { ...l, keyframes: [], transform: { ...l.transform, scaleX: 1 } };
    const smooth = flippedKeyframesFrom(base, "x", 24, "smooth", 12)!;
    const sx = (k: typeof smooth, f: number) => valueAt({ ...base, keyframes: k }, "scaleX", f);
    expect(sx(smooth, 12)).toBeCloseTo(1);
    expect(sx(smooth, 24)).toBeCloseTo(-1);
    // Midt i snuingen er bildet smalt (som et kort som snus)
    expect(Math.abs(sx(smooth, 18))).toBeLessThan(0.5);
    const cut = flippedKeyframesFrom(base, "x", 24, "cut", 12)!;
    expect(sx(cut, 23)).toBeCloseTo(1);
    expect(sx(cut, 24)).toBeCloseTo(-1);
    // Senere nøkkelbilder for samme skalering snus også (forblir speilvendt)
    const later = flippedKeyframesFrom(
      { ...base, keyframes: [{ frame: 48, property: "scaleX", value: 2, easing: "linear" }] },
      "x",
      24,
      "smooth",
      12,
    )!;
    expect(later.find((k) => k.frame === 48)!.value).toBe(-2);
    // Bilde 0: ingenting å snu fra
    expect(flippedKeyframesFrom(base, "x", 0, "smooth", 12)).toBe(null);
  });
});

// ---------------------------------------------------------------- Forstørrelse over 1:1

describe("advarsel når et bilde vises større enn sine egne piksler", () => {
  it("regnes fra det som faktisk tegnes (skalering og kamera)", () => {
    const comp = Object.values(s0.compositions).find((c) =>
      layersOf(s0, c.id).some(
        (l) => l.assetId && s0.assetVersions[Object.values(s0.assetVersions)[0]!.id],
      ),
    )!;
    const l = layersOf(s0, comp.id).find((x) => {
      const m = layerMagnification(s0, comp.id, x.id, 0);
      return m !== null;
    });
    if (!l) return; // fixture uten bildelag med mål
    const m0 = layerMagnification(s0, comp.id, l.id, 0)!;
    const s = mustApply(s0, {
      type: "UpdateLayers",
      layers: [
        {
          layerId: l.id,
          fields: {
            ...(l as never as { [k: string]: unknown }),
            name: l.name,
          } as never,
        },
      ],
    } as never);
    expect(layerMagnification(s, comp.id, l.id, 0)).toBeCloseTo(m0);
    const big = {
      ...s,
      layers: {
        ...s.layers,
        [l.id]: {
          ...l,
          transform: {
            ...l.transform,
            scaleX: l.transform.scaleX * 3,
            scaleY: l.transform.scaleY * 3,
          },
        },
      },
    };
    expect(layerMagnification(big, comp.id, l.id, 0)!).toBeCloseTo(m0 * 3);
    expect(maxLayerMagnification(big, comp.id, l.id, 0)!.value).toBeGreaterThanOrEqual(
      m0 * 3 - 1e-6,
    );
  });
});

// ---------------------------------------------------------------- Fjern luften, utsnitt og ruter

describe("fjern luften rundt, utsnitt og ruter", () => {
  it("finner det synlige og beholder litt luft", () => {
    const w = 10;
    const h = 8;
    const px = new Uint8ClampedArray(w * h * 4);
    for (const [x, y] of [
      [3, 2],
      [6, 5],
    ])
      px[(y! * w + x!) * 4 + 3] = 255;
    const b = alphaBounds(px, w, h)!;
    expect(b).toEqual({ x: 3, y: 2, w: 4, h: 4 });
    expect(worthTrimming(b, w, h)).toBe(true);
    expect(paddedBox(b, 2, w, h)).toEqual({ x: 1, y: 0, w: 8, h: 8 });
    expect(trimPadding({ x: 0, y: 0, w: 1000, h: 400 })).toBe(10);
    expect(alphaBounds(new Uint8ClampedArray(w * h * 4), w, h)).toBe(null);
  });
  it("ruter dekker hele bildet uten hull, og markeringen gir en ramme innenfor bildet", () => {
    const cells = gridCells(1001, 500, 4, 1);
    expect(cells).toHaveLength(4);
    expect(cells.reduce((n, c) => n + c.w, 0)).toBe(1001);
    expect(cells[3]!.x + cells[3]!.w).toBe(1001);
    expect(
      polygonBounds(
        [
          { x: -5, y: 2 },
          { x: 40, y: 10 },
          { x: 20, y: 90 },
        ],
        30,
        50,
      ),
    ).toEqual({ x: 0, y: 2, w: 30, h: 48 });
    expect(
      polygonBounds(
        [
          { x: 1, y: 1 },
          { x: 2, y: 1 },
        ],
        30,
        30,
      ),
    ).toBe(null);
  });
});

// ---------------------------------------------------------------- Vinkel og faktaark (0030)

describe("vinkel på bilder og visuelt faktaark", () => {
  it("vinkelen settes, angres og tåler rundtur gjennom databaseradene; selve bildet endres ikke", () => {
    const r = applyCommand(
      s0,
      envelope({ type: "SetVersionView", versionId: imageVersion.id as never, view: "side" }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const v = r.state.assetVersions[imageVersion.id]!;
    expect(v.view).toBe("side");
    expect(v.mediaPath).toBe(imageVersion.mediaPath);
    expect(labelledViews(r.state, s0.assetVariants[imageVersion.variantId]!.assetId)[0]!.view).toBe(
      "side",
    );
    const back = mustApply(r.state, r.inverse);
    expect(back.assetVersions[imageVersion.id]!.view).toBeUndefined();
    expect(
      applyCommand(
        s0,
        envelope({
          type: "SetVersionView",
          versionId: imageVersion.id as never,
          view: "skrått" as never,
        }),
      ).ok,
    ).toBe(false);
    const cs = diffStates(emptyProjectState(s0.project), r.state);
    const rows = Object.fromEntries(Object.entries(cs.inserts)) as Record<string, unknown[]>;
    const vr = (rows["asset_versions"] as Record<string, unknown>[]).find(
      (x) => x["id"] === imageVersion.id,
    )!;
    expect(vr["view"]).toBe("side");
    const read = stateFromRows({
      project: fixture.project,
      ...rows,
      script_block_revisions: cs.blockRevisions,
    } as never);
    expect(read.assetVersions[imageVersion.id]!.view).toBe("side");
    expect(needsSchema30({ type: "SetVersionView" })).toBe(true);
    expect(needsSchema30({ type: "SetAssetVisualBrief" })).toBe(true);
    expect(needsSchema30({ type: "UpdateAsset" })).toBe(false);
  });

  it("faktaarket lagres på ressursen, brukes i beskrivelsen i stedet for manusutdrag, og kan angres", () => {
    const maja = byName("Maja");
    const text = "- nine-year-old girl\n- long dark-blond braid\n- red wool coat with fur trim";
    const s = mustApply(s0, { type: "SetAssetVisualBrief", assetId: maja.id, text });
    expect(s.assets[maja.id]!.visualBrief).toBe(text);
    expect(visualBriefFacts(text)).toEqual([
      "nine-year-old girl",
      "long dark-blond braid",
      "red wool coat with fur trim",
    ]);
    const p = buildContextImagePrompt(s, {
      assetId: maja.id,
      variantId: null,
      productionId: main.id,
      withReference: false,
    });
    expect(p).toContain("Nine-year-old girl.");
    expect(p).not.toContain("Visual details from the screenplay");
    // UpdateAsset (navn, beskrivelse …) rører ikke faktaarket
    const u = mustApply(s, {
      type: "UpdateAsset",
      assetId: maja.id,
      fields: {
        kind: maja.kind,
        name: "Maja",
        names: maja.names,
        description: "x",
        category: "",
        tags: [],
      },
    });
    expect(u.assets[maja.id]!.visualBrief).toBe(text);
    expect(
      applyCommand(
        s0,
        envelope({ type: "SetAssetVisualBrief", assetId: maja.id, text: "x".repeat(4001) }),
      ).ok,
    ).toBe(false);
    const r = applyCommand(
      s,
      envelope({ type: "SetAssetVisualBrief", assetId: maja.id, text: "" }),
    );
    expect(r.ok && r.state.assets[maja.id]!.visualBrief).toBeFalsy();
    expect(cleanVisualBrief("Here you go:\n- a\n* b\nnoe annet")).toBe("- a\n- b");
    expect(cleanVisualBrief("ingen linjer")).toBe(null);
  });
});

// ---------------------------------------------------------------- Promptmotoren

describe("promptmotoren: én bestilling, form etter modell", () => {
  const maja = byName("Maja");
  const va = Object.values(s0.assetVariants).find((v) => v.assetId === maja.id)!;
  const guide = {
    ...emptyStyleGuide(),
    visualStyle: "Hand-drawn 2D animatic design with clean outlines and flat colour fills",
    palette: { colors: ["#0d1b2a", "#f4efe6", "#d9a441", "#9fb3c8"], description: "Winter night" },
    avoid: "Photorealism, 3D rendering",
    lighting: "Most scenes take place in the evening",
  };
  const s = mustApply(s0, {
    type: "CreateStyleProfile",
    profileId: tid<"style_profile">(),
    fields: { name: "Filmens visuelle stil", isDefault: true, guide },
  });

  it("farger får navn i tillegg til koden", () => {
    expect(colourName("#0d1b2a")).toBe("deep navy");
    expect(colourName("#f4efe6")).toBe("warm off-white");
    expect(colourName("#d9a441")).toMatch(/gold/);
    expect(colourName("#9fb3c8")).toMatch(/blue-grey/);
    expect(colourName("#000000")).toBe("near-black");
    expect(colourName("ikke")).toBe("ikke");
  });

  it("karakterdesign: ingen filmtittel, ingen replikker, nøytralt lys (ikke kveldslyset), farger med navn", () => {
    const p = buildContextImagePrompt(s, {
      assetId: maja.id,
      variantId: va.id,
      productionId: main.id,
      withReference: false,
    });
    expect(p).not.toContain(s.project.name);
    expect(p).not.toContain("says:");
    expect(p).not.toContain("evening");
    expect(p).toContain("soft, even, neutral light");
    expect(p).toContain("deep navy (#0d1b2a)");
    expect(p).toContain("three-quarter front view");
    expect(p).toContain("Leave out: text, letters, logos, watermarks, Photorealism, 3D rendering.");
  });

  it("med referanser: rollene står med ord, og identiteten låses", () => {
    const own = Object.values(s.assetVersions).find(
      (v) => v.variantId === va.id && v.mimeType.startsWith("image/"),
    );
    if (!own) return;
    const attached = attachedImages(s, {
      assetId: maja.id,
      productionId: main.id,
      identityVersionId: own.id,
      style: true,
    });
    const p = buildContextImagePrompt(s, {
      assetId: maja.id,
      variantId: va.id,
      productionId: main.id,
      withReference: true,
      attached,
    });
    expect(p).toContain("Reference images: Image 1 shows Maja as designed");
    expect(p).toContain("Keep Maja identical to image 1");
  });

  it("kort form for Seedream/Qwen: identiteten først og egen negativ beskrivelse", () => {
    expect(promptFamilyOf("fal", "fal-ai/bytedance/seedream/v4.5")).toBe("compact");
    expect(promptFamilyOf("google", "gemini-3-pro-image")).toBe("narrative");
    const own = Object.values(s.assetVersions).find(
      (v) => v.variantId === va.id && v.mimeType.startsWith("image/"),
    )!;
    const attached = attachedImages(s, {
      assetId: maja.id,
      productionId: main.id,
      identityVersionId: own?.id ?? null,
      style: false,
    });
    const b = buildContextImageBrief(s, {
      assetId: maja.id,
      variantId: va.id,
      productionId: main.id,
      withReference: true,
      attached,
    })!;
    const r = renderBrief(b, "compact");
    if (attached.length) expect(r.prompt.split("\n")[0]).toMatch(/^Identity: /);
    expect(r.prompt).toContain("Pose: full figure");
    expect(r.negative).toContain("watermarks");
    expect(r.negative).toContain("background scenery");
    expect(renderBrief(b, "narrative").negative).toBe(null);
    const sum = briefSummaryNb(b, "compact", (v) => VERSION_VIEW_LABEL[v]);
    expect(sum[0]).toContain("Figurdesign av Maja");
    expect(sum.join(" ")).toContain("Seedream");
  });

  it("karakterark og ny vinkel: vinklene i rekkefølge, samme høyde og grunnlinje", () => {
    const b = buildContextImageBrief(s, {
      assetId: maja.id,
      variantId: va.id,
      productionId: main.id,
      withReference: false,
      task: "sheet",
      views: ["front", "side", "back"],
    })!;
    const p = renderBrief(b, "narrative").prompt;
    expect(p).toContain("character turnaround sheet of Maja");
    expect(p).toContain("1) front view, 2) side view (true profile), 3) back view");
    expect(p).toContain("same height and scale, standing on the same baseline");
    const v = renderBrief(
      buildContextImageBrief(s, {
        assetId: maja.id,
        variantId: va.id,
        productionId: main.id,
        withReference: false,
        task: "view",
        views: ["back"],
      })!,
      "narrative",
    ).prompt;
    expect(v).toContain("Draw Maja from a new angle");
    expect(v).toContain("facing directly away from the camera");
  });

  it("vinkler: bildet du står i er identiteten, merkede vinkler og stil følger etter", () => {
    const own = Object.values(s.assetVersions).find(
      (v) => v.variantId === va.id && v.mimeType.startsWith("image/"),
    );
    if (!own) return;
    const att = turnaroundAttachments(s, {
      assetId: maja.id,
      productionId: main.id,
      identityVersionId: own.id,
      style: true,
    });
    expect(att[0]!.role).toBe("identity");
    expect(att.length).toBeLessThanOrEqual(6);
    expect(att.filter((a) => a.role === "style").length).toBeLessThanOrEqual(2);
  });
});

// ---------------------------------------------------------------- Stilanalyse

describe("stilanalyse", () => {
  const raw = JSON.stringify({
    en: {
      summary: "Flat 2D cut-paper look",
      technique: "Digital cut paper",
      line: "No outlines",
      shapes: "Round heads, 1:3 head-to-body",
      colour: "Muted winter blues with amber",
      lighting: "Flat, no cast shadows",
      texture: "Paper grain",
      detail: "Low detail",
      composition: "Centred",
      breaks: "Gradients, photorealism",
    },
    nb: { summary: "Flat 2D-utklippsstil" },
    colours: ["#0D1B2A", "rød", "#d9a441"],
  });
  it("leses (også med kodeblokk rundt) og legges inn i riktige felt", () => {
    const a = parseStyleAnalysis("```json\n" + raw + "\n```")!;
    expect(a.en.summary).toBe("Flat 2D cut-paper look");
    expect(a.nb.summary).toBe("Flat 2D-utklippsstil");
    expect(a.colours).toEqual(["#0d1b2a", "#d9a441"]);
    expect(parseStyleAnalysis("ikke json")).toBe(null);
    const g = applyStyleAnalysis(
      emptyStyleGuide(),
      a,
      new Set(["summary", "technique", "line", "colour", "breaks"]),
      true,
    );
    expect(g.visualStyle).toBe("Flat 2D cut-paper look.");
    expect(g.technique).toBe("Digital cut paper. No outlines.");
    expect(g.characterDesign).toBe("");
    expect(g.palette.colors).toEqual(["#0d1b2a", "#d9a441"]);
    expect(g.palette.description).toBe("Muted winter blues with amber");
    expect(g.avoid).toBe("Gradients, photorealism.");
  });
});

// ---------------------------------------------------------------- Nye modeller og oppskalering

describe("Seedream, Qwen og oppskalering hos fal.ai", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
  it("katalogen: pris per bilde og per megapiksel, oppskalering som egen evne", () => {
    expect(providerModel("fal", "fal-ai/bytedance/seedream/v4.5")?.priceUsd).toBe(0.04);
    expect(providerModel("fal", "fal-ai/qwen-image-edit-plus")?.requiresImage).toBe(true);
    expect(estimateCostUsd("fal", "fal-ai/seedvr/upscale/image", { megapixels: 16 })).toBeCloseTo(
      0.016,
    );
    expect(estimateCostUsd("fal", "fal-ai/clarity-upscaler", { megapixels: 16 })).toBeCloseTo(0.48);
    const up = providersFor("upscale", new Set(["fal"]));
    expect(up[0]!.models.map((m) => m.id)).toEqual([
      "fal-ai/seedvr/upscale/image",
      "fal-ai/clarity-upscaler",
    ]);
    expect(providersFor("upscale", new Set())).toEqual([]);
    expect(aspectOf({ purpose: "cutout" })).toBe("2:3");
    expect(aspectOf({ purpose: "cutout", aspect: "16:9" })).toBe("16:9");
  });

  function stub(result: Record<string, unknown>) {
    const calls: { url: string; body: Record<string, unknown> | null }[] = [];
    vi.useFakeTimers({ shouldAdvanceTime: true, advanceTimeDelta: 100 });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({
          url: `${init?.method ?? "GET"} ${url}`,
          body: init?.body ? JSON.parse(String(init.body)) : null,
        });
        if (init?.method === "POST") return new Response(JSON.stringify({ request_id: "r1" }));
        if (url.endsWith("/status")) return new Response(JSON.stringify({ status: "COMPLETED" }));
        if (url.endsWith("/requests/r1")) return new Response(JSON.stringify(result));
        return new Response(new Uint8Array([7]), { headers: { "content-type": "image/png" } });
      }),
    );
    return calls;
  }

  it("Seedream: redigering med flere forbilder, bredt ark; status under app-ID-en", async () => {
    const calls = stub({ images: [{ url: "https://v3.fal.media/a.png" }] });
    await ADAPTERS.fal.image({
      key: "k",
      model: "fal-ai/bytedance/seedream/v4.5",
      prompt: "Identity: …",
      purpose: "cutout",
      aspect: "16:9",
      references: [],
      referenceUrls: ["https://x/1.png", "https://x/2.png"],
    });
    expect(calls[0]!.url).toBe("POST https://queue.fal.run/fal-ai/bytedance/seedream/v4.5/edit");
    expect(calls[0]!.body).toMatchObject({
      image_urls: ["https://x/1.png", "https://x/2.png"],
      image_size: "landscape_16_9",
    });
    expect(calls.map((c) => c.url)).toContain(
      "GET https://queue.fal.run/fal-ai/bytedance/requests/r1/status",
    );
  });

  it("Qwen: negativ beskrivelse sendes; uten forbilde avvises den før noe betales", async () => {
    const calls = stub({ images: [{ url: "https://v3.fal.media/a.png" }] });
    await ADAPTERS.fal.image({
      key: "k",
      model: "fal-ai/qwen-image-edit-plus",
      prompt: "x",
      purpose: "cutout",
      negativePrompt: "text, watermark",
      references: [],
      referenceUrls: ["https://x/1.png"],
    });
    expect(calls[0]!.body).toMatchObject({
      negative_prompt: "text, watermark",
      image_size: "portrait_4_3",
    });
    await expect(
      ADAPTERS.fal.image({
        key: "k",
        model: "fal-ai/qwen-image-edit-plus",
        prompt: "x",
        purpose: "cutout",
        references: [],
        referenceUrls: [],
      }),
    ).rejects.toThrow(/forbildebilde/);
  });

  it("oppskalering: SeedVR med faktor", async () => {
    const calls = stub({ image: { url: "https://v3.fal.media/u.png" } });
    const out = await ADAPTERS.fal.upscale({
      key: "k",
      model: "fal-ai/seedvr/upscale/image",
      imageUrl: "https://x/a.png",
      factor: 4,
    });
    expect([...out.bytes]).toEqual([7]);
    expect(calls[0]!.body).toMatchObject({
      image_url: "https://x/a.png",
      upscale_mode: "factor",
      upscale_factor: 4,
    });
  }, 15_000);
  it("oppskalering: Clarity med lav kreativitet; andre modeller avvises", async () => {
    const c2 = stub({ image: { url: "https://v3.fal.media/u.png" } });
    await ADAPTERS.fal.upscale({
      key: "k",
      model: "fal-ai/clarity-upscaler",
      imageUrl: "https://x/a.png",
      factor: 2,
    });
    expect((c2[0]!.body as { creativity: number }).creativity).toBeLessThan(0.35);
    await expect(
      ADAPTERS.fal.upscale({
        key: "k",
        model: "fal-ai/flux-pro/kontext",
        imageUrl: "https://x/a.png",
        factor: 2,
      }),
    ).rejects.toThrow(/oppskalere/);
  }, 15_000);
});
