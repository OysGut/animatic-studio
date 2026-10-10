// @vitest-environment node
/**
 * Importert film, «Bruk denne», overganger og replikk → avspillingshode (M4 del 3, DEC-0047), og innholdet i
 * zip-filen med ressurser (DEC-0046).
 */
import { describe, expect, it } from "vitest";
import {
  applyCommand,
  blockAtFrame,
  blockSpans,
  filmClips,
  filmTakeAudio,
  frameMix,
  scriptView,
  stateFromRows,
  toRow,
  zipEntries,
  zipSafeName,
  zipSummary,
  type Command,
  type FilmClip,
  type ProjectState,
  type TakeMedia,
} from "@/core";
import { envelope, mustApply, seedProject, tid } from "../helpers/fixtures";

const MEDIA: TakeMedia = {
  fileName: "scene1_ferdig.mp4",
  mimeType: "video/mp4",
  byteSize: 12_345_678,
  width: 1920,
  height: 1080,
  fps: 25,
  durationMs: 7000,
  videoCodec: "avc",
  hasAudio: true,
};

function fails(s: ProjectState, c: Command) {
  const r = applyCommand(s, envelope(c));
  expect(r.ok).toBe(false);
  return r.ok ? "" : r.error.message;
}

function withFilm(sceneCount = 3) {
  const seed = seedProject(sceneCount);
  const occ = scriptView(seed.state, seed.mainId)[0]!.occurrenceId;
  const takeId = tid<"take">();
  let s = mustApply(seed.state, {
    type: "AddTake",
    takeId,
    occurrenceId: occ as never,
    segmentId: null,
    kind: "imported_film",
    status: "approved",
    durationFrames: 175,
    mediaRef: `${seed.state.project.id}/films/${takeId}/scene1_ferdig.mp4`,
    media: MEDIA,
  });
  s = mustApply(s, { type: "SetActiveTake", occurrenceId: occ as never, takeId });
  return { ...seed, s, occ, takeId };
}

/** Enkle klipp for overgangstester. */
function clip(i: number, start: number, len: number, t: FilmClip["transition"]): FilmClip {
  return {
    occurrenceId: `o${i}` as never,
    sceneId: `s${i}` as never,
    variantId: `v${i}` as never,
    compositionId: null,
    source: "placeholder",
    heading: { intExt: "", location: "", time: "" },
    productionNumber: String(i),
    startFrame: start,
    durationFrames: len,
    durationKind: "estimate",
    take: null,
    transition: t,
  };
}

describe("importert film og «Bruk denne»", () => {
  it("filmen tas i bruk med sin lengde, og animatic kan tas i bruk igjen uten at filmen forsvinner", () => {
    const { s, mainId, occ, takeId } = withFilm();
    const c = filmClips(s, mainId).find((x) => x.occurrenceId === occ)!;
    expect(c.source).toBe("film");
    expect(c.durationFrames).toBe(175);
    expect(c.durationKind).toBe("film");
    expect(c.take?.media?.fileName).toBe("scene1_ferdig.mp4");
    const back = mustApply(s, { type: "SetActiveTake", occurrenceId: occ as never, takeId: null });
    const c2 = filmClips(back, mainId).find((x) => x.occurrenceId === occ)!;
    expect(c2.source).toBe("placeholder");
    // Versjonen er bevart (REQ-0234) og kan tas i bruk igjen (REQ-0317)
    expect(back.takes[takeId]).toBeDefined();
    const again = mustApply(back, { type: "SetActiveTake", occurrenceId: occ as never, takeId });
    expect(filmClips(again, mainId).find((x) => x.occurrenceId === occ)!.source).toBe("film");
  });

  it("filinformasjonen kontrolleres og lagres identisk", () => {
    const seed = seedProject(1);
    const occ = scriptView(seed.state, seed.mainId)[0]!.occurrenceId as never;
    const base = {
      type: "AddTake" as const,
      takeId: tid<"take">(),
      occurrenceId: occ,
      segmentId: null,
      status: "approved" as const,
      durationFrames: 100,
      mediaRef: `${seed.state.project.id}/films/y/z.mp4`,
    };
    expect(
      fails(seed.state, {
        ...base,
        kind: "imported_film",
        media: { ...MEDIA, mimeType: "video/avi" },
      }),
    ).toMatch(/filinformasjon/);
    expect(fails(seed.state, { ...base, kind: "composition2d", media: MEDIA })).toMatch(
      /bare importert film/,
    );
    const { s, takeId } = withFilm(1);
    const row = toRow("takes", s.takes[takeId]!, s.project.id);
    expect(row["metadata"]).toEqual(MEDIA);
    const back = stateFromRows({
      project: { id: s.project.id, name: "x", fps_num: 25, fps_den: 1, revision: 1 },
      productions: [],
      scenes: [],
      scene_variants: [],
      script_blocks: [],
      script_block_revisions: [],
      scene_occurrences: [],
      production_segments: [],
      takes: [row],
    });
    expect(back.takes[takeId]).toEqual(s.takes[takeId]);
  });

  it("lyden i filmen spilles på filmens plass, men ikke for film uten lyd", () => {
    const { s, mainId } = withFilm();
    const clips = filmClips(s, mainId);
    const items = filmTakeAudio(clips, s.project.fps);
    expect(items).toHaveLength(1);
    expect(items[0]!.start).toBe(0);
    expect(items[0]!.length).toBeCloseTo(7, 6);
    const silent = clips.map((c) =>
      c.take ? { ...c, take: { ...c.take, media: { ...MEDIA, hasAudio: false } } } : c,
    );
    expect(filmTakeAudio(silent, s.project.fps)).toHaveLength(0);
  });
});

describe("overganger", () => {
  it("lagres på forekomsten, kan angres, og kutt fjerner overgangen", () => {
    const seed = seedProject(2);
    const occ = scriptView(seed.state, seed.mainId)[1]!.occurrenceId;
    const r = applyCommand(
      seed.state,
      envelope({
        type: "SetTransition",
        occurrenceId: occ as never,
        transition: { kind: "dissolve", frames: 12 },
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.occurrences[occ]!.transition).toEqual({ kind: "dissolve", frames: 12 });
    const row = toRow("occurrences", r.state.occurrences[occ]!, r.state.project.id);
    expect(row["transition_kind"]).toBe("dissolve");
    expect(row["transition_frames"]).toBe(12);
    const undone = mustApply(r.state, r.inverse!);
    expect(undone.occurrences[occ]!.transition).toBeUndefined();
    expect(
      fails(seed.state, {
        type: "SetTransition",
        occurrenceId: occ as never,
        transition: { kind: "dip", frames: 0 },
      }),
    ).toMatch(/mellom 1 og/);
    expect(filmClips(r.state, seed.mainId)[1]!.transition.kind).toBe("dissolve");
  });

  it("overtoning er sentrert om klippet og endrer ikke lengden", () => {
    const cut = { kind: "cut" as const, frames: 0 };
    const clips = [clip(0, 0, 50, cut), clip(1, 50, 50, { kind: "dissolve", frames: 10 })];
    expect(frameMix(clips, 40)!.b).toBeNull();
    const m = frameMix(clips, 45)!; // første bilde i overgangen
    expect(m.a.clip.occurrenceId).toBe("o0");
    expect(m.b!.clip.occurrenceId).toBe("o1");
    expect(m.b!.localFrame).toBe(0); // første bilde i neste scene holdes
    expect(m.mix).toBeCloseTo(0.05);
    const mid = frameMix(clips, 52)!;
    expect(mid.a.localFrame).toBe(49); // siste bilde i forrige scene holdes
    expect(mid.mix).toBeCloseTo(0.75);
    expect(frameMix(clips, 55)!.b).toBeNull();
  });

  it("en overgang er aldri lengre enn klippene på hver side, og holdte bilder merkes", () => {
    const cut = { kind: "cut" as const, frames: 0 };
    // B er bare 10 bilder, men overtoningen inn i B er satt til 40
    const clips = [
      clip(0, 0, 50, cut),
      clip(1, 50, 10, { kind: "dissolve", frames: 40 }),
      clip(2, 60, 50, cut),
    ];
    expect(frameMix(clips, 44)!.b).toBeNull(); // vinduet er 10 bilder: 45–54
    const m = frameMix(clips, 45)!;
    expect(m.b!.clip.occurrenceId).toBe("o1");
    expect(m.b!.held).toBe(true);
    expect(m.a.held).toBeUndefined();
    expect(frameMix(clips, 54)!.mix).toBeCloseTo(0.95);
    expect(frameMix(clips, 55)!.b).toBeNull();
  });

  it("via svart toner ut og inn, og første scene tones inn fra svart", () => {
    const clips = [
      clip(0, 0, 50, { kind: "dip", frames: 10 }),
      clip(1, 50, 50, { kind: "dip", frames: 20 }),
    ];
    expect(frameMix(clips, 0)!.black).toBeCloseTo(0.95);
    expect(frameMix(clips, 9)!.black).toBeCloseTo(0.05);
    const out = frameMix(clips, 45)!;
    expect(out.a.clip.occurrenceId).toBe("o0");
    expect(out.black).toBeCloseTo(0.55);
    const inn = frameMix(clips, 55)!;
    expect(inn.a.clip.occurrenceId).toBe("o1");
    expect(inn.black).toBeCloseTo(0.45);
  });
});

describe("replikk → avspillingshode", () => {
  it("blokkene fordeles over scenen; koblet lyd bestemmer tiden for replikken", () => {
    const seed = seedProject(2);
    const clips = filmClips(seed.state, seed.mainId);
    const c = clips[1]!;
    const spans = blockSpans(seed.state, c);
    expect(spans).toHaveLength(3);
    for (const sp of spans) {
      expect(sp.startFrame).toBeGreaterThanOrEqual(c.startFrame);
      expect(sp.endFrame).toBeLessThanOrEqual(c.startFrame + c.durationFrames);
      expect(sp.kind).toBe("estimate");
    }
    // Karakternavnet følger replikken
    expect(spans[1]!.startFrame).toBe(spans[2]!.startFrame);
    expect(spans[0]!.startFrame).toBeLessThan(spans[2]!.startFrame);
    expect(blockAtFrame(spans, spans[2]!.startFrame)!.blockId).toBe(spans[2]!.blockId);
  });
});

describe("zip med ressurser", () => {
  it("én mappe per kategori og ressurs; like navn får løpenummer; film er egen kategori", () => {
    const { s: s0 } = withFilm(1);
    let s = s0;
    const mk = (kind: "character" | "sound", name: string, file: string, mime: string) => {
      const assetId = tid<"asset">();
      const variantId = tid<"asset_variant">();
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
        fields: { name: "Animatic", style: "animatic", appearance: "" },
      });
      for (let i = 0; i < 2; i++) {
        const versionId = tid<"asset_version">();
        s = mustApply(s, {
          type: "AddAssetVersion",
          versionId,
          variantId,
          media: {
            path: `${s.project.id}/${assetId}/${versionId}/${file}`,
            mimeType: mime,
            width: null,
            height: null,
            byteSize: 1000,
            sha256: "a".repeat(64),
            ...(kind === "sound" ? { durationMs: 1000 } : {}),
          },
          note: "",
        });
      }
    };
    mk("character", "Maja", "maja.png", "image/png");
    mk("sound", "Vind/storm", "vind.wav", "audio/wav");
    const e = zipEntries(s);
    expect(e.map((x) => x.path)).toEqual([
      "Karakterer/Maja/Animatic/v1 – maja.png",
      "Karakterer/Maja/Animatic/v2 – maja.png",
      "Lyd/Vind_storm/Animatic/v1 – vind.wav",
      "Lyd/Vind_storm/Animatic/v2 – vind.wav",
      expect.stringMatching(/^Importert film\/Scene .* – scene1_ferdig\.mp4$/),
    ]);
    expect(zipSummary(e).map((x) => [x.category, x.files])).toEqual([
      ["character", 2],
      ["sound", 2],
      ["film", 1],
    ]);
    expect(zipSafeName("  a:b*c?  ")).toBe("a_b_c_");
    expect(zipSafeName("...")).toBe("uten navn");
  });
});
