// @vitest-environment node
/**
 * Ende-til-ende-kontroll av hele kjeden manus → scener → ressurser → 2D-scene → lyd → montering → eksport
 * (REQ-0001, REQ-0004, DEC-0072). Alt går gjennom ekte kommandoer (applyCommand) og den ekte eksport- og
 * avspillingskoden, uten noen AI-leverandør og uten nettverk.
 *
 * Det som krever nettleseren, erstattes med små testverktøy i tests/helpers: Canvas 2D (soft-canvas.ts) og
 * OfflineAudioContext (fake-web-audio.ts). Selve videokodingen (WebCodecs via mediabunny) finnes ikke i
 * Node; testen kontrollerer bare at eksporten sier tydelig fra om det (se siste test).
 *
 * Manuset er et eget, kort testmanus – ingen ekte manustekst (DEC-0004).
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  applyCommand,
  checkInvariants,
  defaultLayerFields,
  exportPaginationInput,
  filmAudio,
  filmClips,
  filmDurationFrames,
  formatHeading,
  layerVersion,
  layersOf,
  paginate,
  parseFountain,
  parseScreenplayLines,
  planImport,
  scriptView,
  screenplayFountain,
  subtitleCues,
  toSrt,
  type AudioClipFields,
  type LayerFields,
  type ProductionId,
  type ProjectState,
} from "@/core";
import { drawFilmFrame } from "@/engine/compositor/film";
import type { ImageSource } from "@/engine/compositor/canvas";
import { AudioBank, renderAudio } from "@/engine/audio/mixer";
import { dialogueItems, encodeWav, exportDialogueStem } from "@/engine/export/audio-stem";
import { ExportError, canExportVideo, exportAnimatic } from "@/engine/export/animatic";
import { screenplayPdf } from "@/engine/export/screenplay-pdf";
import { screenplayDocx } from "@/engine/export/screenplay-docx";
import { pdfToLines } from "@/engine/import/pdf-lines";
import { docxToLines } from "@/engine/import/docx-lines";
import { envelope, mustApply, seedProject, tid } from "../helpers/fixtures";
import {
  SoftCanvas,
  SoftImage,
  SoftOffscreenCanvas,
  resetSoftLog,
  softLog,
  type Rgba,
} from "../helpers/soft-canvas";
import { FakeOfflineAudioContext, decodeWav } from "../helpers/fake-web-audio";

const loadPdf = () => import("pdfjs-dist/legacy/build/pdf.mjs") as never;

/** Et kort, oppdiktet testmanus i Fountain (tre nummererte scener, to replikker). */
const MANUS = `Title: Lykta
Credit: av
Author: Testforfatter

INT. STUA - KVELD #1#

Maja setter en lykt i vinduet.

MAJA
Nå finner bestefar veien hjem.

EXT. GÅRDSTUNET - NATT #2#

Snøen laver ned. En skikkelse nærmer seg i mørket.

BESTEFAR
(roper)
Maja! Jeg ser lyset ditt!

INT. STUA - NATT #3#

Døra går opp. Maja løper mot bestefar.
`;

/** Prosjektets format: lite, så programvarelerretet er raskt. */
const FORMAT = { width: 320, height: 180, fps: { num: 25, den: 1 } } as const;
const BG = "#203040";
const MAJA_COLOR = "#e04030";
/** Lydfilenes samplingsfrekvens i testen (lav, så testen er rask). */
const RATE = 8000;

/** Sinustone som 16-biters WAV (står for et opptak av replikken eller atmosfærelyden). */
function tone(seconds: number, hz: number, amp: number): Uint8Array {
  const n = Math.round(seconds * RATE);
  const ch = new Float32Array(n);
  for (let i = 0; i < n; i++) ch[i] = amp * Math.sin((2 * Math.PI * hz * i) / RATE);
  return encodeWav([ch], RATE);
}

/** Lydstyrke (RMS) i tidsrommet [a, b) sekunder i en kanal. */
function rms(ch: Float32Array, rate: number, a: number, b: number): number {
  const i0 = Math.max(0, Math.round(a * rate));
  const i1 = Math.min(ch.length, Math.round(b * rate));
  let sum = 0;
  for (let i = i0; i < i1; i++) sum += ch[i]! * ch[i]!;
  return i1 > i0 ? Math.sqrt(sum / (i1 - i0)) : 0;
}

const near = (a: Rgba, css: string, tol = 3) => {
  const h = css.replace("#", "");
  const want = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return want.every((w, i) => Math.abs(a[i]! - w) <= tol);
};

interface Built {
  state: ProjectState;
  mainId: string;
  occ: string[];
  dialogueBlock: string;
  voicePath: string;
  ambiencePath: string;
  majaPath: string;
  compId: string;
}

/** Bygger hele produksjonen fra manusteksten med ekte kommandoer. */
function build(): Built {
  const seed = seedProject(0);
  let s = seed.state;
  const mainId = seed.mainId;

  // 1. Manus → scener: tolkes og importeres med kjernens egen import (mandat 4.3)
  const { parsed } = parseFountain(MANUS);
  const imported = applyCommand(
    s,
    envelope(planImport(s, parsed, { productionId: mainId as ProductionId, newId: tid })),
  );
  if (!imported.ok) throw new Error(imported.error.message);
  s = imported.state;
  const view = scriptView(s, mainId);
  const occ = view.map((v) => v.occurrenceId as string);
  const dialogueBlock = view[0]!.blocks.find((b) => b.kind === "dialogue")!.id;

  // 2. Format for prosjektet (alle 2D-scener følger det)
  s = mustApply(s, { type: "SetProjectFormat", ...FORMAT });

  // 3. Ressurser: Maja (bilde, godkjent), replikken hennes og vinden (lyd)
  const image = (
    kind: "character" | "sound",
    name: string,
    file: string,
    media: { mimeType: string; width: number | null; height: number | null; durationMs?: number },
  ) => {
    const assetId = tid<"asset">();
    const variantId = tid<"asset_variant">();
    const versionId = tid<"asset_version">();
    s = mustApply(s, {
      type: "CreateAssets",
      assets: [
        { assetId, fields: { kind, name, names: [], description: "", category: "", tags: [] } },
      ],
    });
    s = mustApply(s, {
      type: "CreateAssetVariant",
      variantId,
      assetId,
      fields: { name: "Animatic", style: kind === "sound" ? "other" : "animatic", appearance: "" },
    });
    const path = `${s.project.id}/${assetId}/${versionId}/${file}`;
    s = mustApply(s, {
      type: "AddAssetVersion",
      versionId,
      variantId,
      media: { path, byteSize: 1000, sha256: "b".repeat(64), ...media },
      note: "",
    });
    s = mustApply(s, { type: "ApproveAssetVersion", variantId, versionId });
    return { assetId, variantId, path };
  };
  const maja = image("character", "Maja", "maja.png", {
    mimeType: "image/png",
    width: 40,
    height: 60,
  });
  const voice = image("sound", "Maja – replikk", "maja-replikk.wav", {
    mimeType: "audio/wav",
    width: null,
    height: null,
    durationMs: 2500,
  });
  const wind = image("sound", "Vind", "vind.wav", {
    mimeType: "audio/wav",
    width: null,
    height: null,
    durationMs: 8000,
  });

  // 4. 2D-scene for scene 1: bakgrunn og Maja som går fra venstre mot høyre (nøkkelbilder på x)
  const compId = tid<"composition">();
  s = mustApply(s, {
    type: "CreateComposition",
    compositionId: compId,
    variantId: s.occurrences[occ[0]!]!.variantId,
    fields: { name: "Stua", width: 320, height: 180, durationFrames: 100, background: BG },
  });
  const comp = s.compositions[compId]!;
  const majaFields: LayerFields = {
    ...defaultLayerFields(s, comp, { assetId: maja.assetId, assetVariantId: maja.variantId }),
    width: 40,
    height: 60,
    transform: { x: 60, y: 90, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 },
    keyframes: [
      { frame: 0, property: "x", value: 60, easing: "linear" },
      { frame: 99, property: "x", value: 260, easing: "linear" },
    ],
  };
  s = mustApply(s, {
    type: "AddLayers",
    layers: [{ layerId: tid(), compositionId: compId as never, fields: majaFields }],
  });

  // 5. Lyd: replikken koblet til dialogblokken (1–3 s i scene 1) og vind i scene 2
  const audio = (o: string, assetId: string, over: Partial<AudioClipFields>): AudioClipFields => ({
    occurrenceId: o as never,
    kind: "dialogue",
    name: "Lyd",
    assetId: assetId as never,
    assetVariantId: null,
    versionId: null,
    blockId: null,
    offsetMs: 0,
    sourceInMs: 0,
    lengthMs: 1000,
    gainDb: 0,
    fadeInMs: 0,
    fadeOutMs: 0,
    muted: false,
    continues: false,
    volumeKeys: [],
    ...over,
  });
  s = mustApply(s, {
    type: "AddAudioClips",
    clips: [
      {
        clipId: tid(),
        fields: audio(occ[0]!, voice.assetId, {
          name: "Maja",
          blockId: dialogueBlock as never,
          offsetMs: 1000,
          lengthMs: 2000,
        }),
      },
      {
        clipId: tid(),
        fields: audio(occ[1]!, wind.assetId, { kind: "ambience", name: "Vind", lengthMs: 6000 }),
      },
    ],
  });

  // 6. Montering: overtoning inn i scene 2 og planlagt lengde for scene 3
  s = mustApply(s, {
    type: "SetTransition",
    occurrenceId: occ[1] as never,
    transition: { kind: "dissolve", frames: 10 },
  });
  s = mustApply(s, { type: "SetPlannedDuration", occurrenceId: occ[2] as never, plannedMs: 3000 });

  return {
    state: s,
    mainId,
    occ,
    dialogueBlock,
    voicePath: voice.path,
    ambiencePath: wind.path,
    majaPath: maja.path,
    compId,
  };
}

let B: Built;
/** Tilstanden som JSON før eksportene, for å se at ingenting endres underveis. */
let before = "";
beforeAll(() => {
  B = build();
  before = JSON.stringify(B.state);
});

describe("Manus til eksport uten AI (REQ-0001, REQ-0004)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetSoftLog();
  });

  it("manuset blir tre scener med riktige numre, overskrifter og blokker, uten brudd på invariantene", () => {
    const view = scriptView(B.state, B.mainId);
    expect(view.map((v) => v.productionNumber)).toEqual(["1", "2", "3"]);
    expect(view.map((v) => formatHeading(v.heading))).toEqual([
      "INT. STUA - KVELD",
      "EXT. GÅRDSTUNET - NATT",
      "INT. STUA - NATT",
    ]);
    expect(view.map((v) => v.blocks.map((b) => b.kind))).toEqual([
      ["action", "character", "dialogue"],
      ["action", "character", "parenthetical", "dialogue"],
      ["action"],
    ]);
    expect(checkInvariants(B.state)).toEqual([]);
  });

  it("filmtidslinjen følger manuset: 2D-scene, tittelkort og planlagt lengde", () => {
    const clips = filmClips(B.state, B.mainId);
    expect(clips.map((c) => c.occurrenceId)).toEqual(B.occ);
    expect(clips.map((c) => c.source)).toEqual(["composition", "placeholder", "placeholder"]);
    expect(clips.map((c) => c.durationKind)).toEqual(["set", "estimate", "planned"]);
    // Scene 1: 100 bilder fra 2D-scenen. Scene 2: minst 5 s og aldri kortere enn vinden (6 s).
    // Scene 3: planlagt 3 s
    expect(clips[0]!.durationFrames).toBe(100);
    expect(clips[1]!.durationFrames).toBeGreaterThanOrEqual(150);
    expect(clips[2]!.durationFrames).toBe(75);
    expect(clips[1]!.transition).toEqual({ kind: "dissolve", frames: 10 });
    // Klippene ligger etter hverandre uten hull (overtoningen er uten overlapp)
    expect(clips[1]!.startFrame).toBe(100);
    expect(clips[2]!.startFrame).toBe(100 + clips[1]!.durationFrames);
    expect(filmDurationFrames(clips)).toBe(175 + clips[1]!.durationFrames);
  });

  it("bildene tegnes med samme kode som avspillingen: 2D-scenen beveger seg, tittelkort og overtoning", () => {
    vi.stubGlobal("OffscreenCanvas", SoftOffscreenCanvas);
    const s = B.state;
    const clips = filmClips(s, B.mainId);
    // Bildene eksporten trenger, slik eksportdialogen finner dem (lagenes versjoner)
    const paths = layersOf(s, B.compId)
      .map((l) => layerVersion(s, l)?.mediaPath)
      .filter((p): p is string => !!p);
    expect(paths).toEqual([B.majaPath]);
    const images = new Map<string, ImageSource>([
      [B.majaPath, new SoftImage(40, 60, MAJA_COLOR) as unknown as ImageSource],
    ]);
    const W = 160;
    const H = 90; // halv størrelse: alt skaleres med 0,5
    const frame = (n: number, subtitle?: string) => {
      const c = new SoftCanvas(W, H);
      drawFilmFrame(c.getContext() as unknown as CanvasRenderingContext2D, s, clips, n, {
        width: W,
        height: H,
        images,
        placeholders: false,
        ...(subtitle ? { subtitle } : {}),
      });
      return c;
    };

    // Bilde 0: Maja står til venstre (x 60 → 30 i halv størrelse) foran bakgrunnen
    const f0 = frame(0);
    expect(near(f0.pixel(30, 45), MAJA_COLOR)).toBe(true);
    expect(near(f0.pixel(120, 45), BG)).toBe(true);
    expect(near(f0.pixel(5, 5), BG)).toBe(true);
    // Bilde 90: nøkkelbildene har flyttet henne mot høyre (x ≈ 242 → 121)
    const f90 = frame(90);
    expect(near(f90.pixel(121, 45), MAJA_COLOR)).toBe(true);
    expect(near(f90.pixel(30, 45), BG)).toBe(true);
    expect(f90.distinctColors()).toBeGreaterThan(1);

    // Midt i scene 2 (uten 2D-scene): tittelkort med nummer og overskrift
    resetSoftLog();
    const f2 = frame(100 + Math.floor(clips[1]!.durationFrames / 2));
    expect(near(f2.pixel(5, 5), "#14161b")).toBe(true);
    expect(softLog.texts).toContain("SCENE 2");
    expect(softLog.texts).toContain("EXT. GÅRDSTUNET - NATT");

    // Overtoningen mellom scene 1 og 2: bakgrunnen er en blanding av de to
    const mid = frame(100);
    const p = mid.pixel(5, 5);
    const a = [0x20, 0x30, 0x40];
    const b = [0x14, 0x16, 0x1b];
    for (let i = 0; i < 3; i++) {
      expect(p[i]!).toBeGreaterThanOrEqual(Math.min(a[i]!, b[i]!) - 1);
      expect(p[i]!).toBeLessThanOrEqual(Math.max(a[i]!, b[i]!) + 1);
    }
    expect(near(p, BG, 1) || near(p, "#14161b", 1)).toBe(false);

    // Undertekst brennes inn (samme tegning i visning og eksport)
    resetSoftLog();
    frame(30, "Nå finner bestefar veien hjem.");
    expect(softLog.texts).toContain("Nå finner bestefar veien hjem.");
    // Ingen tegneoperasjoner som programvarelerretet ikke kan gjengi riktig
    expect(softLog.unsupported).toEqual([]);
  });

  it("undertekstene følger replikkene: koblet lyd gir eksakt tid", () => {
    const { cues, missing } = subtitleCues(B.state, B.mainId, "nb");
    expect(missing).toBe(0);
    expect(cues.map((c) => c.text)).toEqual([
      "Nå finner bestefar veien hjem.",
      "Maja! Jeg ser lyset ditt!",
    ]);
    // Replikken i scene 1 ligger der lyden er: 1–3 s
    expect(cues[0]!.startMs).toBe(1000);
    expect(cues[0]!.endMs).toBe(3000);
    // Replikken i scene 2 er innenfor scene 2
    const clips = filmClips(B.state, B.mainId);
    const s2 = { from: 4000, to: 4000 + (clips[1]!.durationFrames / 25) * 1000 };
    expect(cues[1]!.startMs).toBeGreaterThanOrEqual(s2.from);
    expect(cues[1]!.endMs).toBeLessThanOrEqual(s2.to);
    const srt = toSrt(cues);
    expect(srt).toContain("00:00:01,000 --> 00:00:03,000");
    expect(srt).toContain("Maja! Jeg ser lyset ditt!");
  });

  it("lyden mikses med samme plassering som avspillingen, og dialogsporet blir en WAV-fil", async () => {
    vi.stubGlobal("OfflineAudioContext", FakeOfflineAudioContext);
    const files: Record<string, Uint8Array> = {
      [`mem:${B.voicePath}`]: tone(2.5, 440, 0.5),
      [`mem:${B.ambiencePath}`]: tone(8, 220, 0.25),
    };
    vi.stubGlobal("fetch", async (url: string) => {
      const f = files[url];
      return f
        ? { ok: true, status: 200, arrayBuffer: async () => f.slice().buffer }
        : { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) };
    });
    const s = B.state;
    const clips = filmClips(s, B.mainId);
    const items = filmAudio(s, clips, s.project.fps);
    expect(items.map((i) => [i.clip.kind, i.start, i.length])).toEqual([
      ["dialogue", 1, 2],
      ["ambience", 4, 6],
    ]);
    expect(dialogueItems(items).map((i) => i.clip.kind)).toEqual(["dialogue"]);

    const bank = new AudioBank();
    await bank.loadAll({
      [B.voicePath]: `mem:${B.voicePath}`,
      [B.ambiencePath]: `mem:${B.ambiencePath}`,
    });
    expect(bank.get(B.voicePath)).toBeDefined();
    expect(bank.get(B.ambiencePath)).toBeDefined();

    const seconds = filmDurationFrames(clips) / 25;
    // Hele miksen: replikken i 1–3 s, vinden i 4–10 s, stille ellers
    const mix = await renderAudio(items, bank, 0, seconds, RATE);
    const L = mix.getChannelData(0);
    expect(rms(L, RATE, 0, 0.9)).toBeLessThan(1e-6);
    expect(rms(L, RATE, 1.1, 2.9)).toBeCloseTo(0.5 / Math.SQRT2, 1);
    expect(rms(L, RATE, 3.1, 3.9)).toBeLessThan(1e-6);
    expect(rms(L, RATE, 4.1, 9.9)).toBeCloseTo(0.25 / Math.SQRT2, 1);
    expect(rms(L, RATE, 10.1, seconds)).toBeLessThan(1e-6);

    // Dialogsporet (eksport): bare replikken, ikke vinden
    const wav = await exportDialogueStem({ items, bank, from: 0, seconds, sampleRate: RATE });
    expect(new TextDecoder().decode(wav.slice(0, 4))).toBe("RIFF");
    const stem = decodeWav(wav);
    expect(stem.numberOfChannels).toBe(2);
    expect(stem.length).toBe(Math.ceil(seconds * RATE));
    const sl = stem.getChannelData(0);
    expect(rms(sl, RATE, 1.1, 2.9)).toBeCloseTo(0.5 / Math.SQRT2, 1);
    expect(rms(sl, RATE, 4.1, 9.9)).toBeLessThan(1e-4);
  });

  it("manuset eksporteres som PDF, Word og Fountain og leses inn igjen med samme innhold", async () => {
    const s = B.state;
    const input = exportPaginationInput(s, B.mainId, {
      method: "production",
      includeInactive: false,
      fillMissing: "none",
    });
    const original = parseFountain(MANUS).parsed;
    const text = (scenes: typeof original.scenes) =>
      scenes.flatMap((sc) => sc.elements.map((e) => `${e.kind}:${e.text}`));

    const pdf = screenplayPdf(paginate(input).pages, { title: "Lykta", titlePage: ["LYKTA"] });
    expect(pdf.length).toBeGreaterThan(1000);
    const fromPdf = parseScreenplayLines(await pdfToLines(pdf, loadPdf), { format: "pdf" });
    expect(fromPdf.scenes.map((x) => x.number)).toEqual(["1", "2", "3"]);
    expect(fromPdf.scenes.map((x) => x.elements.map((e) => e.text))).toEqual(
      original.scenes.map((x) => x.elements.map((e) => e.text)),
    );

    const docx = screenplayDocx(input, { titlePage: ["LYKTA"] });
    expect(docx.length).toBeGreaterThan(1000);
    const fromDocx = parseScreenplayLines(docxToLines(docx), { format: "docx" });
    expect(text(fromDocx.scenes)).toEqual(text(original.scenes));

    const fountain = screenplayFountain(input, { titlePage: ["Lykta", "av Testforfatter"] });
    const again = parseFountain(fountain).parsed;
    expect(again.scenes.map((x) => x.number)).toEqual(["1", "2", "3"]);
    expect(again.scenes.map((x) => x.heading)).toEqual(original.scenes.map((x) => x.heading));
    expect(text(again.scenes)).toEqual(text(original.scenes));
  });

  it("videokodingen krever nettleseren (WebCodecs) og sier tydelig fra i Node", async () => {
    // Kodingen av selve videofilen bruker WebCodecs gjennom mediabunny og kan bare prøves i en nettleser
    // (tests/visual/export-e2e.mjs). Her kontrolleres at eksporten avviser med en forståelig melding.
    expect(canExportVideo()).toBe(false);
    const clips = filmClips(B.state, B.mainId);
    await expect(
      exportAnimatic({
        state: B.state,
        clips,
        startFrame: 0,
        endFrame: filmDurationFrames(clips),
        width: 320,
        height: 180,
        fps: B.state.project.fps,
        images: new Map(),
      }),
    ).rejects.toBeInstanceOf(ExportError);
  });

  it("avspilling og eksport endrer ikke prosjektet", () => {
    // Testene over kjører i rekkefølge på samme tilstand; den skal være uendret (mandat 14.2)
    expect(JSON.stringify(B.state)).toBe(before);
  });
});
