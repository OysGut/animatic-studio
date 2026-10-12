/**
 * Verifisering av krav (DEC-0075) om avledede produksjoner og laglisten:
 * - REQ-0355: spinoffens navn, sceneorden, manus, filmtidslinje, varighet, aktive filmversjoner og
 *   eksportgrunnlag endres/beregnes uten at hovedfilmen endres.
 * - REQ-0359: spinoffen kan bruke manusscener, ferdig film, AI-video, 2D-animatics, karakterer, objekter,
 *   steder, lyd og stilprofiler fra prosjektet.
 * - REQ-0585: laglisten – fjern fra scenen, dra inn i og ut av en gruppe uten at laget flytter seg i
 *   bildet, valgt gruppe lyser opp lagene sine, og høyden på listen huskes (jsdom, React Testing Library).
 */
import { createElement, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, createEvent, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyCommand,
  assetsInScene,
  buildScenePrompt,
  defaultLayerFields,
  deriveProductionCommands,
  emptyStyleGuide,
  estimateProduction,
  exportPaginationInput,
  filmAudio,
  filmClips,
  forkPlan,
  blocksOfVariant,
  keyBetween,
  layerFieldsOf,
  layersOf,
  mainProduction,
  orderedOccurrences,
  planSegments,
  renderFrame,
  scriptView,
  type Command,
  type CompositionFields,
  type LayerFields,
  type ProjectState,
} from "@/core";
import { LayersPanel } from "@/app/scene-editor/LayersPanel";
import { envelope, mustApply, seedProject, tid } from "../helpers/fixtures";
import { fixture } from "../visual/fixture-state";

vi.mock("@/app/library/asset-images", () => ({
  useImageUrls: () => ({ data: {} }),
}));

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

function applyAll(s: ProjectState, commands: readonly Command[]) {
  for (const c of commands) s = mustApply(s, c);
  return s;
}

/** Spinoff av hele hovedfilmen i fixturen (alle scener gjenbrukt). */
function spinoffOfAll(s0: ProjectState = fixture.state) {
  const main = mainProduction(s0)!;
  const occs = orderedOccurrences(s0, main.id);
  const pid = tid<"production">();
  const s = applyAll(
    s0,
    deriveProductionCommands(s0, {
      productionId: pid,
      name: "Kortversjon for festival",
      kind: "spinoff",
      parentProductionId: main.id,
      occurrenceIds: occs.map((o) => o.id),
    }),
  );
  return { s, main, pid };
}

const exportIds = (s: ProjectState, productionId: string) =>
  exportPaginationInput(s, productionId, {
    method: "continuous",
    includeInactive: false,
    fillMissing: "none",
  }).map((x) => x.occurrenceId);

// ---------------------------------------------------------------- REQ-0355

describe("REQ-0355 – egne egenskaper per avledet produksjon", () => {
  it("REQ-0355: eget navn, egen sceneorden, eget manus, egen filmtidslinje, egen varighet og eget eksportgrunnlag – hovedfilmen er uendret", () => {
    const { s, main, pid } = spinoffOfAll();
    const mainBefore = {
      name: s.productions[main.id]!.name,
      order: orderedOccurrences(s, main.id).map((o) => o.id),
      script: JSON.stringify(scriptView(s, main.id)),
      clips: filmClips(s, main.id).map((c) => [c.occurrenceId, c.startFrame, c.durationFrames]),
      estimate: estimateProduction(s, main.id).activeSeconds,
      export: exportIds(s, main.id),
    };
    // Navn
    expect(s.productions[pid]!.name).toBe("Kortversjon for festival");
    expect(s.productions[pid]!.name).not.toBe(mainBefore.name);
    // Sceneorden og synlighet: siste scene først, andre scene deaktivert
    const own = orderedOccurrences(s, pid);
    let t = mustApply(s, {
      type: "MoveOccurrence",
      occurrenceId: own[own.length - 1]!.id,
      orderKey: keyBetween(null, own[0]!.orderKey),
    });
    t = mustApply(t, { type: "SetOccurrenceActive", occurrenceId: own[1]!.id, active: false });
    expect(orderedOccurrences(t, pid)[0]!.id).toBe(own[own.length - 1]!.id);
    // Manus: en replikk endres bare i spinoffen (egen versjon av scenen)
    const occ = own[0]!;
    const block = blocksOfVariant(t, occ.variantId).find((b) => b.kind === "dialogue")!;
    const plan = forkPlan(t, {
      type: "EditBlockText",
      productionId: pid as never,
      blockId: block.id,
      text: "Bare i kortversjonen.",
    })!;
    t = applyAll(t, [...plan.fork, plan.command]);
    expect(JSON.stringify(scriptView(t, pid))).toContain("Bare i kortversjonen.");
    // Filmtidslinje, varighet og eksport følger spinoffens rekkefølge og aktive scener
    const clips = filmClips(t, pid);
    expect(clips.map((c) => c.occurrenceId)).toEqual(
      orderedOccurrences(t, pid)
        .filter((o) => o.active)
        .map((o) => o.id),
    );
    expect(clips.some((c) => c.occurrenceId === own[1]!.id)).toBe(false);
    expect(estimateProduction(t, pid).activeSeconds).toBeLessThan(
      estimateProduction(s, pid).activeSeconds,
    );
    expect(exportIds(t, pid)).toEqual(clips.map((c) => c.occurrenceId));
    // Hovedfilmen er nøyaktig som før
    expect(t.productions[main.id]!.name).toBe(mainBefore.name);
    expect(orderedOccurrences(t, main.id).map((o) => o.id)).toEqual(mainBefore.order);
    expect(JSON.stringify(scriptView(t, main.id))).toBe(mainBefore.script);
    expect(
      filmClips(t, main.id).map((c) => [c.occurrenceId, c.startFrame, c.durationFrames]),
    ).toEqual(mainBefore.clips);
    expect(estimateProduction(t, main.id).activeSeconds).toBe(mainBefore.estimate);
    expect(exportIds(t, main.id)).toEqual(mainBefore.export);
  });

  it("REQ-0355: egen aktiv filmversjon i spinoffen endrer ikke hovedfilmens valg", () => {
    const { s, main, pid } = spinoffOfAll();
    const spinOcc = orderedOccurrences(s, pid)[0]!;
    const mainOcc = orderedOccurrences(s, main.id).find((o) => o.variantId === spinOcc.variantId)!;
    const mainTake = filmClips(s, main.id).find((c) => c.occurrenceId === mainOcc.id)!.take;
    const takeId = tid<"take">();
    let t = mustApply(s, {
      type: "AddTake",
      takeId,
      occurrenceId: spinOcc.id,
      segmentId: null,
      kind: "imported_film",
      status: "approved",
      durationFrames: 125,
      mediaRef: `${s.project.id}/films/${takeId}/festival.mp4`,
      media: {
        fileName: "festival.mp4",
        mimeType: "video/mp4",
        byteSize: 1000,
        width: 1920,
        height: 1080,
        fps: 25,
        durationMs: 5000,
        videoCodec: null,
        hasAudio: false,
      },
    } as never);
    t = mustApply(t, { type: "SetActiveTake", occurrenceId: spinOcc.id, takeId });
    const spinClip = filmClips(t, pid).find((c) => c.occurrenceId === spinOcc.id)!;
    expect(spinClip.take?.id).toBe(takeId);
    expect(spinClip.durationFrames).toBe(125);
    const mainClip = filmClips(t, main.id).find((c) => c.occurrenceId === mainOcc.id)!;
    expect(mainClip.take?.id ?? null).toBe(mainTake?.id ?? null);
    expect(t.occurrences[mainOcc.id]!.activeTakeId).toBe(s.occurrences[mainOcc.id]!.activeTakeId);
  });
});

// ---------------------------------------------------------------- REQ-0359

describe("REQ-0359 – materialet i prosjektet kan brukes i spinoffen", () => {
  it("REQ-0359: manusscener, ferdig film, 2D-animatic og karakterer/steder/objekter følger med de gjenbrukte scenene", () => {
    const { s, main, pid } = spinoffOfAll();
    const mainClips = filmClips(s, main.id);
    const spinClips = filmClips(s, pid);
    // Hver scene i hovedfilmen finnes i spinoffen (som bruker samme scenevariant)
    for (const m of mainClips)
      expect(spinClips.some((c) => c.variantId === m.variantId)).toBe(true);
    // Manusscener: samme tekst
    const textOf = (productionId: string) =>
      new Map(
        orderedOccurrences(s, productionId).map((o) => [
          o.variantId,
          JSON.stringify(blocksOfVariant(s, o.variantId).map((b) => b.text)),
        ]),
      );
    const spinText = textOf(pid);
    for (const [variant, text] of textOf(main.id)) expect(spinText.get(variant)).toBe(text);
    expect(scriptView(s, pid).length).toBe(orderedOccurrences(s, pid).length);
    // Ferdig film (importert): samme take vises i spinoffen
    const filmed = mainClips.filter((c) => c.take);
    expect(filmed.length).toBeGreaterThan(0);
    for (const m of filmed) {
      const sp = spinClips.find((c) => c.variantId === m.variantId)!;
      expect(sp.take?.id).toBe(m.take!.id);
      expect(sp.inheritedFrom).toBe(m.occurrenceId);
    }
    // 2D-animatic: samme 2D-scene, og den kan tegnes i spinoffen
    const withComp = mainClips.filter((c) => c.compositionId);
    expect(withComp.length).toBeGreaterThan(0);
    for (const m of withComp) {
      const sp = spinClips.find((c) => c.variantId === m.variantId)!;
      expect(sp.compositionId).toBe(m.compositionId);
      expect(renderFrame(s, sp.compositionId!, 0).items.length).toBeGreaterThan(0);
    }
    // Karakterer, steder og objekter i scenene
    const kinds = new Set(
      orderedOccurrences(s, pid).flatMap((o) =>
        assetsInScene(s, pid, o.id).map((x) => x.asset.kind),
      ),
    );
    for (const k of ["character", "location", "object"]) expect(kinds).toContain(k);
  });

  it("REQ-0359: AI-video i hovedfilmen vises i den gjenbrukte scenen", () => {
    const seed = seedProject(3);
    const occ = orderedOccurrences(seed.state, seed.mainId)[1]!;
    const takeId = tid<"take">();
    let s = mustApply(seed.state, {
      type: "AddTake",
      takeId,
      occurrenceId: occ.id,
      segmentId: null,
      kind: "ai_video",
      status: "approved",
      durationFrames: 100,
      mediaRef: `${seed.state.project.id}/films/${takeId}/ai-video.mp4`,
      media: {
        fileName: "AI-video (google).mp4",
        mimeType: "video/mp4",
        byteSize: 1000,
        width: 1280,
        height: 720,
        fps: 24,
        durationMs: 4000,
        videoCodec: null,
        hasAudio: false,
      },
    } as never);
    s = mustApply(s, { type: "SetActiveTake", occurrenceId: occ.id, takeId });
    const { s: t, pid } = spinoffOfAll(s);
    const sp = filmClips(t, pid).find((c) => c.variantId === occ.variantId)!;
    expect(sp.take?.id).toBe(takeId);
    expect(sp.take?.kind).toBe("ai_video");
  });

  it("REQ-0359: en lydressurs fra biblioteket kan legges i spinoffen uten at hovedfilmens lyd endres", () => {
    const { s, main, pid } = spinoffOfAll();
    const sound = Object.values(s.assets).find((a) => a.kind === "sound")!;
    expect(sound).toBeDefined();
    const spinOcc = orderedOccurrences(s, pid)[0]!;
    const mainAudio = filmAudio(s, filmClips(s, main.id), s.project.fps).map((x) => x.clip.id);
    const clipId = tid<"audio_clip">();
    const t = mustApply(s, {
      type: "AddAudioClips",
      clips: [
        {
          clipId,
          fields: {
            occurrenceId: spinOcc.id,
            kind: "ambience",
            name: sound.name,
            assetId: sound.id,
            assetVariantId: null,
            versionId: null,
            blockId: null,
            offsetMs: 0,
            sourceInMs: 0,
            lengthMs: 2000,
            gainDb: 0,
            fadeInMs: 0,
            fadeOutMs: 0,
            muted: false,
            continues: false,
            volumeKeys: [],
          },
        },
      ],
    } as never);
    const spinAudio = filmAudio(t, filmClips(t, pid), t.project.fps);
    expect(spinAudio.some((x) => x.clip.id === clipId && x.clip.assetId === sound.id)).toBe(true);
    expect(filmAudio(t, filmClips(t, main.id), t.project.fps).map((x) => x.clip.id)).toEqual(
      mainAudio,
    );
  });

  it("REQ-0359: prosjektets stilprofil brukes i beskrivelsene for spinoffens scener", () => {
    const { s, pid } = spinoffOfAll();
    const t = mustApply(s, {
      type: "CreateStyleProfile",
      profileId: tid<"style_profile">(),
      fields: {
        name: "Jula på Dovre",
        isDefault: true,
        guide: { ...emptyStyleGuide(), visualStyle: "Varm akvarell med blekk-konturer" },
      },
    });
    const clip = filmClips(t, pid)[0]!;
    const segment = planSegments(t, clip, 8)[0]!;
    const prompt = buildScenePrompt(t, { clip, productionId: pid, segment, index: 0, count: 1 });
    expect(prompt).toContain("Varm akvarell med blekk-konturer");
  });
});

// ---------------------------------------------------------------- REQ-0585

const COMP: CompositionFields = {
  name: "Stua",
  width: 1000,
  height: 600,
  durationFrames: 100,
  background: "#101114",
};

/** 2D-scene med gruppen «Familien» (lagene Maja og Per) og laget «Tre» utenfor gruppen. */
function layered() {
  const { state } = seedProject(1);
  const variantId = Object.keys(state.variants)[0] as never;
  const compId = tid<"composition">();
  let s = mustApply(state, {
    type: "CreateComposition",
    compositionId: compId,
    variantId,
    fields: COMP,
  });
  const base = (name: string, x: number, y: number): LayerFields => ({
    ...defaultLayerFields(s, s.compositions[compId]!, { fill: "#cc3333" }),
    name,
    width: 120,
    height: 80,
    transform: {
      ...defaultLayerFields(s, s.compositions[compId]!, { fill: "#cc3333" }).transform,
      x,
      y,
    },
  });
  const [tre, maja, per, gruppe] = [
    tid<"composition_layer">(),
    tid<"composition_layer">(),
    tid<"composition_layer">(),
    tid<"composition_layer">(),
  ];
  s = mustApply(s, {
    type: "AddLayers",
    layers: [
      { layerId: tre, compositionId: compId, fields: base("Tre", 100, 100) },
      { layerId: maja, compositionId: compId, fields: base("Maja", 400, 300) },
      { layerId: per, compositionId: compId, fields: base("Per", 600, 300) },
    ],
  });
  // Gruppen er flyttet og skalert, så det synes om et lag hopper når det går inn eller ut av den
  const g = defaultLayerFields(s, s.compositions[compId]!, { fill: "#000000" });
  s = mustApply(s, {
    type: "AddLayers",
    layers: [
      {
        layerId: gruppe,
        compositionId: compId,
        fields: {
          ...g,
          kind: "group",
          name: "Familien",
          fill: null,
          width: 1,
          height: 1,
          transform: { ...g.transform, x: 520, y: 330, scaleX: 1.5, scaleY: 1.5, rotation: 10 },
          anchor: { x: 500, y: 300 },
        } as LayerFields,
      },
    ],
  });
  return { s, compId, tre, maja, per, gruppe };
}

/** Laglisten med en ramme som kjører kommandoene i kjernen og kan angre siste handling (som angrelisten). */
function Panel({
  initial,
  compId,
  onState,
  selected,
}: {
  initial: ProjectState;
  compId: string;
  onState: (s: ProjectState) => void;
  selected: string | null;
}) {
  const [box] = useState(() => ({ s: initial }));
  const [, setVersion] = useState(0);
  const [sel, setSel] = useState<string | null>(selected);
  const [undo, setUndo] = useState<{ group: string | undefined; inverse: Command }[]>([]);
  const commit = (next: ProjectState) => {
    box.s = next;
    onState(next);
    setVersion((v) => v + 1);
  };
  // Kommandoer i samme gruppe kjøres etter hverandre mot den nyeste tilstanden
  const run = (command: Command, _label: string, group?: string): string | null => {
    const r = applyCommand(box.s, envelope(command));
    if (!r.ok) return r.error.message;
    setUndo((u) => [...u, { group, inverse: r.inverse }]);
    commit(r.state);
    return null;
  };
  const undoLast = () => {
    if (!undo.length) return;
    const g = undo[undo.length - 1]!.group;
    let k = undo.length - 1;
    while (k > 0 && g !== undefined && undo[k - 1]!.group === g) k--;
    let cur = box.s;
    for (const step of undo.slice(k).reverse()) {
      const r = applyCommand(cur, envelope(step.inverse));
      if (!r.ok) throw new Error(r.error.message);
      cur = r.state;
    }
    setUndo(undo.slice(0, k));
    commit(cur);
  };
  return createElement(
    "div",
    null,
    createElement("button", { type: "button", onClick: undoLast }, "Angre"),
    createElement(LayersPanel, {
      state: box.s,
      composition: box.s.compositions[compId]!,
      editable: true,
      selectedLayerId: sel,
      onSelect: setSel,
      run,
      frame: 0,
    }),
  );
}

function renderPanel(s: ProjectState, compId: string, selected: string | null = null) {
  const seen: { s: ProjectState } = { s };
  const qc = new QueryClient();
  const view = render(
    createElement(
      QueryClientProvider,
      { client: qc },
      createElement(Panel, {
        initial: s,
        compId,
        selected,
        onState: (x: ProjectState) => {
          seen.s = x;
        },
      }),
    ),
  );
  return { seen, view };
}

const row = (name: string) =>
  screen
    .getAllByRole("listitem")
    .find((li) => within(li).queryByText(name, { selector: "span" }) !== null)!;

/** Plassering i bildet (matrisen laget tegnes med). */
function matrixOf(s: ProjectState, compId: string, layerId: string) {
  return renderFrame(s, compId, 0).items.find((i) => i.layerId === layerId)!.matrix;
}

/** Samme plass i bildet: avrundingen i de lagrede feltene gir høyst en brøkdel av en piksel. */
function expectSamePlace(a: readonly number[], b: readonly number[]) {
  expect(a.length).toBe(b.length);
  a.forEach((x, i) => expect(Math.abs(x - b[i]!)).toBeLessThan(i < 4 ? 0.002 : 0.1));
}

/** Dra raden `from` og slipp ved en høyde (0–1) i raden `to`. */
function dragTo(from: HTMLElement, to: HTMLElement, at: number) {
  const data = {
    effectAllowed: "",
    dropEffect: "",
    setData: () => undefined,
    getData: () => "",
  };
  vi.spyOn(to, "getBoundingClientRect").mockReturnValue({
    top: 0,
    height: 40,
    left: 0,
    width: 200,
    bottom: 40,
    right: 200,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect);
  fireEvent.dragStart(from, { dataTransfer: data });
  for (const type of ["dragOver", "drop"] as const) {
    const ev = createEvent[type](to, { dataTransfer: data });
    Object.defineProperty(ev, "clientY", { value: at * 40 });
    fireEvent(to, ev);
  }
  fireEvent.dragEnd(from, { dataTransfer: data });
}

describe("REQ-0585 – lag i grupper med dra og slipp, fjerning og justerbar lagliste", () => {
  it("REQ-0585: hver rad har «Fjern fra scenen»; laget fjernes (ressursen er urørt) og kan angres", () => {
    const { s, compId, tre } = layered();
    const { seen } = renderPanel(s, compId);
    for (const name of ["Tre", "Maja", "Per", "Familien"])
      expect(
        screen.getByRole("button", { name: `Fjern «${name}» fra scenen` }),
      ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Fjern «Tre» fra scenen" }));
    expect(layersOf(seen.s, compId).some((l) => l.id === tre)).toBe(false);
    expect(Object.keys(seen.s.assets)).toEqual(Object.keys(s.assets));
    fireEvent.click(screen.getByRole("button", { name: "Angre" }));
    expect(layersOf(seen.s, compId).some((l) => l.id === tre)).toBe(true);
  });

  it("REQ-0585: en gruppe fjernes uten at lagene i den hopper, og det angres som ett steg", () => {
    const { s, compId, maja, per, gruppe } = layered();
    let t = s;
    for (const id of [maja, per])
      t = mustApply(t, {
        type: "UpdateLayers",
        layers: [
          {
            layerId: id as never,
            fields: { ...layerFieldsOf(t.layers[id]!), groupId: gruppe as never },
          },
        ],
      });
    const before = [maja, per].map((id) => matrixOf(t, compId, id));
    const { seen } = renderPanel(t, compId);
    fireEvent.click(screen.getByRole("button", { name: "Fjern «Familien» fra scenen" }));
    expect(layersOf(seen.s, compId).some((l) => l.id === gruppe)).toBe(false);
    [maja, per].forEach((id, i) => {
      expect(seen.s.layers[id]!.groupId).toBe(null);
      expectSamePlace(matrixOf(seen.s, compId, id), before[i]!);
    });
    fireEvent.click(screen.getByRole("button", { name: "Angre" }));
    expect(layersOf(seen.s, compId).some((l) => l.id === gruppe)).toBe(true);
    for (const id of [maja, per]) expect(seen.s.layers[id]!.groupId).toBe(gruppe);
  });

  it("REQ-0585: slipp på midten av grupperaden legger laget i gruppen uten at det flytter seg i bildet; slipp ved et lag utenfor tar det ut igjen", () => {
    const { s, compId, tre, gruppe } = layered();
    const before = matrixOf(s, compId, tre);
    const { seen } = renderPanel(s, compId);
    dragTo(row("Tre"), row("Familien"), 0.5);
    expect(seen.s.layers[tre]!.groupId).toBe(gruppe);
    expectSamePlace(matrixOf(seen.s, compId, tre), before);
    expect(within(row("Tre")).getByText(/i «Familien»/)).toBeInTheDocument();
    // Dra «Tre» ut igjen: slipp i øvre kant av en rad utenfor gruppen (gruppen selv)
    dragTo(row("Tre"), row("Familien"), 0.1);
    expect(seen.s.layers[tre]!.groupId).toBe(null);
    expectSamePlace(matrixOf(seen.s, compId, tre), before);
    // Begge stegene (gruppe og rekkefølge) angres samlet
    fireEvent.click(screen.getByRole("button", { name: "Angre" }));
    expect(seen.s.layers[tre]!.groupId).toBe(gruppe);
  });

  it("REQ-0585: «Ta ut av gruppen» gjør det samme uten mus", () => {
    const { s, compId, maja, gruppe } = layered();
    const t = mustApply(s, {
      type: "UpdateLayers",
      layers: [
        {
          layerId: maja as never,
          fields: { ...layerFieldsOf(s.layers[maja]!), groupId: gruppe as never },
        },
      ],
    });
    const before = matrixOf(t, compId, maja);
    const { seen } = renderPanel(t, compId);
    fireEvent.click(screen.getByRole("button", { name: "Ta «Maja» ut av gruppen" }));
    expect(seen.s.layers[maja]!.groupId).toBe(null);
    expectSamePlace(matrixOf(seen.s, compId, maja), before);
  });

  it("REQ-0585: valgt gruppe markerer lagene sine i listen", () => {
    const { s, compId, maja, per, gruppe } = layered();
    let t = s;
    for (const id of [maja, per])
      t = mustApply(t, {
        type: "UpdateLayers",
        layers: [
          {
            layerId: id as never,
            fields: { ...layerFieldsOf(t.layers[id]!), groupId: gruppe as never },
          },
        ],
      });
    renderPanel(t, compId, gruppe);
    const lit = (name: string) => row(name).className.includes("bg-accent-selection/40");
    expect(lit("Maja")).toBe(true);
    expect(lit("Per")).toBe(true);
    expect(lit("Tre")).toBe(false);
  });

  it("REQ-0585: høyden på laglisten kan endres med skillelinjen og huskes til neste gang", () => {
    const { s, compId } = layered();
    const first = renderPanel(s, compId);
    const sep = screen.getByRole("separator", { name: "Høyde på laglisten" });
    const list = () => screen.getByRole("list", { name: "Lagene, forreste øverst" });
    const h0 = Number(sep.getAttribute("aria-valuenow"));
    fireEvent.keyDown(sep, { key: "ArrowDown", shiftKey: true });
    const h1 = Number(sep.getAttribute("aria-valuenow"));
    expect(h1).toBe(h0 + 40);
    expect(list().style.maxHeight).toBe(`${h1}px`);
    first.view.unmount();
    renderPanel(s, compId);
    expect(
      Number(
        screen.getByRole("separator", { name: "Høyde på laglisten" }).getAttribute("aria-valuenow"),
      ),
    ).toBe(h1);
  });
});
