// @vitest-environment node
/** Språkversjoner av filmen (M7 del 3, DEC-0059, REQ-0336–0348, REQ-0350, REQ-0352, REQ-0371). */
import { describe, expect, it } from "vitest";
import {
  applyCommand,
  audioClipFieldsOf,
  clipLanguage,
  clipMaterial,
  diffStates,
  filmAudio,
  filmClips,
  filmTakeAudio,
  forkPlan,
  languageReport,
  languageState,
  layerFieldsOf,
  lineAudio,
  lipSyncAdvice,
  mainProduction,
  orderedOccurrences,
  playsIn,
  stateFromRows,
  timingConflicts,
  type ProjectState,
} from "@/core";
import { envelope, mustApply, tid } from "../helpers/fixtures";
import { fixture } from "../visual/fixture-state";

const s0 = fixture.state;
const main = mainProduction(s0)!;
const nbDialogue = () =>
  Object.values(s0.audioClips).find((a) => a.kind === "dialogue" && a.language === undefined)!;
const enDialogue = () => Object.values(s0.audioClips).find((a) => a.language === "en")!;

/** Rundtur gjennom databaseradene (som lagring og lasting). */
function roundTrip(s: ProjectState): ProjectState {
  const cs = diffStates({ ...s, audioClips: {}, layers: {}, takes: {} } as ProjectState, s);
  const rows = {
    audio_clips: cs.inserts["audio_clips"] ?? [],
    composition_layers: cs.inserts["composition_layers"] ?? [],
    takes: cs.inserts["takes"] ?? [],
  };
  const back = stateFromRows({
    ...(fixtureRows() as never as object),
    audio_clips: rows.audio_clips as never,
    composition_layers: rows.composition_layers as never,
    takes: rows.takes as never,
  } as never);
  return back;
}
function fixtureRows(): Record<string, unknown> {
  const r = fixture.rows as Record<string, unknown[]>;
  return {
    project: fixture.project,
    productions: r["productions"] ?? [],
    scenes: r["scenes"] ?? [],
    scene_variants: r["scene_variants"] ?? [],
    script_blocks: r["script_blocks"] ?? [],
    script_block_revisions: r["script_block_revisions"] ?? [],
    scene_occurrences: r["scene_occurrences"] ?? [],
    production_segments: r["production_segments"] ?? [],
    takes: r["takes"] ?? [],
    assets: r["assets"] ?? [],
    asset_variants: r["asset_variants"] ?? [],
    asset_versions: r["asset_versions"] ?? [],
    script_annotations: r["script_annotations"] ?? [],
    compositions: r["compositions"] ?? [],
    composition_layers: r["composition_layers"] ?? [],
    audio_clips: r["audio_clips"] ?? [],
    clip_parts: r["clip_parts"] ?? [],
    time_links: r["time_links"] ?? [],
    generation_prompts: r["generation_prompts"] ?? [],
    continuity_events: r["continuity_events"] ?? [],
    translations: r["translations"] ?? [],
  };
}

describe("lyd per språk", () => {
  it("dialog hører til norsk, musikk og atmosfære er felles; en replikk har lyd per språk (REQ-0338–0340)", () => {
    const nb = nbDialogue();
    const en = enDialogue();
    expect(clipLanguage(nb, s0)).toBe("nb");
    expect(clipLanguage(en)).toBe("en");
    expect(en.blockId).toBe(nb.blockId);
    const music = Object.values(s0.audioClips).find((a) => a.kind === "music")!;
    expect(clipLanguage(music)).toBe("*");
    expect(playsIn(music, "en") && playsIn(music, "nb")).toBe(true);
    expect(playsIn(nb, "en")).toBe(false);
    // Samme narrative replikk har lyd på begge språk (REQ-0339)
    expect(lineAudio(s0, nb.occurrenceId, nb.blockId!).map((x) => x.language)).toEqual([
      "en",
      "nb",
    ]);
  });

  it("språkversjonen spiller språkets dialog og den felles lyden – uten kopier (REQ-0336/0340/0348)", () => {
    const fps = s0.project.fps;
    const ids = (lang: string) => {
      const v = languageState(s0, lang);
      return filmAudio(v, filmClips(v, main.id), fps, lang).map((it) => it.clip.id);
    };
    const nb = ids("nb");
    const en = ids("en");
    expect(nb).toContain(nbDialogue().id);
    expect(nb).not.toContain(enDialogue().id);
    expect(en).toContain(enDialogue().id);
    expect(en).not.toContain(nbDialogue().id);
    // Felles lyd er samme klipp i begge
    const shared = nb.filter((id) => en.includes(id));
    expect(shared.length).toBe(
      Object.values(s0.audioClips).filter((a) => playsIn(a, "*") || clipLanguage(a) === "*").length,
    );
    // Samme scener, 2D-scener og materiale i begge språk (REQ-0336)
    const v = languageState(s0, "en");
    expect(v.compositions).toBe(s0.compositions);
    expect(v.takes).toBe(s0.takes);
    expect(filmClips(v, main.id).map((c) => c.occurrenceId)).toEqual(
      filmClips(languageState(s0, "nb"), main.id).map((c) => c.occurrenceId),
    );
  });

  it("språket lagres, endres, angres og overlever lagring (REQ-0338)", () => {
    const nb = nbDialogue();
    const r = applyCommand(
      s0,
      envelope({
        type: "UpdateAudioClips",
        clips: [{ clipId: nb.id, fields: { ...audioClipFieldsOf(nb), language: "*" } }],
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.audioClips[nb.id]!.language).toBe("*");
    // Uten språk i feltene: tilbake til standard for lydtypen
    const r2 = applyCommand(
      r.state,
      envelope({
        type: "UpdateAudioClips",
        clips: [{ clipId: nb.id, fields: { ...audioClipFieldsOf(nb) } }],
      }),
    );
    expect(r2.ok && r2.state.audioClips[nb.id]!.language).toBe(undefined);
    // Angre gir det gamle språket
    const undo = applyCommand(r.state, envelope(r.inverse));
    expect(undo.ok && { ...undo.state.audioClips[nb.id]!, revision: 0 }).toEqual({
      ...nb,
      revision: 0,
    });
    // Ugyldig språk avvises
    expect(
      applyCommand(
        s0,
        envelope({
          type: "UpdateAudioClips",
          clips: [{ clipId: nb.id, fields: { ...audioClipFieldsOf(nb), language: "norsk" } }],
        }),
      ).ok,
    ).toBe(false);
    // Rundtur gjennom databaseradene
    const back = roundTrip(r.state);
    expect(back.audioClips[nb.id]!.language).toBe("*");
    expect(back.audioClips[enDialogue().id]!.language).toBe("en");
    expect(
      back.audioClips[Object.values(s0.audioClips).find((a) => a.kind === "music")!.id]!.language,
    ).toBe(undefined);
  });
});

describe("språkavhengige bilder i lag", () => {
  /** Et lag med en karakter som har minst to varianter. */
  function layerWithVariants(s: ProjectState) {
    for (const l of Object.values(s.layers)) {
      if (!l.assetId || l.removed) continue;
      const vs = Object.values(s.assetVariants).filter((v) => v.assetId === l.assetId);
      const other = vs.find((v) => v.id !== l.assetVariantId);
      if (other) return { l, other };
    }
    throw new Error("Fixturen mangler lag med flere varianter");
  }

  it("engelsk versjon viser et annet bilde; norsk er uendret (REQ-0337)", () => {
    const { l, other } = layerWithVariants(s0);
    const s = mustApply(s0, {
      type: "UpdateLayers",
      layers: [
        {
          layerId: l.id,
          fields: {
            ...layerFieldsOf(l),
            languageImages: [{ language: "en", assetVariantId: other.id, versionId: null }],
          },
        },
      ],
    });
    expect(languageState(s, "en").layers[l.id]!.assetVariantId).toBe(other.id);
    expect(languageState(s, "nb").layers[l.id]!.assetVariantId).toBe(l.assetVariantId);
    expect(s.layers[l.id]!.assetVariantId).toBe(l.assetVariantId);
    // Andre endringer av laget beholder bildet for språket (feltet utelatt)
    const { languageImages: _li, ...rest } = layerFieldsOf(s.layers[l.id]!);
    const s2 = mustApply(s, {
      type: "UpdateLayers",
      layers: [{ layerId: l.id, fields: { ...rest, name: "Nytt navn" } }],
    });
    expect(s2.layers[l.id]!.languageImages?.length).toBe(1);
    // Fjernet med tom liste; lagres og leses
    const s3 = mustApply(s, {
      type: "UpdateLayers",
      layers: [
        { layerId: l.id, fields: { ...layerFieldsOf(s.layers[l.id]!), languageImages: [] } },
      ],
    });
    expect(s3.layers[l.id]!.languageImages).toBe(undefined);
    expect(roundTrip(s).layers[l.id]!.languageImages).toEqual(s.layers[l.id]!.languageImages);
    expect(roundTrip(s3).layers[l.id]!.languageImages).toBe(undefined);
  });

  it("en variant som brukes som bilde for et språk, kan ikke angres bort", () => {
    const { l } = layerWithVariants(s0);
    const va = tid<"asset_variant">();
    let s = mustApply(s0, {
      type: "CreateAssetVariant",
      variantId: va,
      assetId: l.assetId!,
      fields: { name: "Engelsk skilt", style: "other", appearance: "" },
    });
    s = mustApply(s, {
      type: "UpdateLayers",
      layers: [
        {
          layerId: l.id,
          fields: {
            ...layerFieldsOf(l),
            languageImages: [{ language: "en", assetVariantId: va, versionId: null }],
          },
        },
      ],
    });
    expect(applyCommand(s, envelope({ type: "UndoCreateAssetVariant", variantId: va })).ok).toBe(
      false,
    );
  });

  it("scenene er like lange i alle språk (REQ-0336/0344)", () => {
    const len = (lang: string) =>
      filmClips(languageState(s0, lang), main.id).map((c) => [c.startFrame, c.durationFrames]);
    expect(len("en")).toEqual(len("nb"));
  });

  it("bare varianter av lagets egen ressurs, ikke norsk og ikke to ganger samme språk", () => {
    const { l, other } = layerWithVariants(s0);
    const foreign = Object.values(s0.assetVariants).find((v) => v.assetId !== l.assetId)!;
    const tryWith = (languageImages: never[]) =>
      applyCommand(
        s0,
        envelope({
          type: "UpdateLayers",
          layers: [{ layerId: l.id, fields: { ...layerFieldsOf(l), languageImages } }],
        }),
      ).ok;
    expect(
      tryWith([{ language: "en", assetVariantId: foreign.id, versionId: null }] as never),
    ).toBe(false);
    expect(tryWith([{ language: "nb", assetVariantId: other.id, versionId: null }] as never)).toBe(
      false,
    );
    expect(
      tryWith([
        { language: "en", assetVariantId: other.id, versionId: null },
        { language: "en", assetVariantId: other.id, versionId: null },
      ] as never),
    ).toBe(false);
  });
});

describe("importert film med blandet lyd", () => {
  const take = () => Object.values(s0.takes).find((t) => t.kind === "imported_film")!;

  it("ikke angitt = blandet med norsk dialog; engelsk versjon varsler (REQ-0341/0342)", () => {
    const report = languageReport(s0, main.id, "en");
    const film = report.find((r) => r.clip.parts.some((p) => p.take?.id === take().id))!;
    expect(film.mixedDialogue).toBe("nb");
    expect(filmTakeAudio(film ? [film.clip] : [], s0.project.fps)[0]!.film!.audioLanguage).toBe(
      "source",
    );
  });

  it("«bare musikk og effekter» gir ingen advarsel; valget angres og lagres", () => {
    const r = applyCommand(
      s0,
      envelope({ type: "SetTakeAudioLanguage", takeId: take().id, audioLanguage: "none" }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const film = languageReport(r.state, main.id, "en").find((x) =>
      x.clip.parts.some((p) => p.take?.id === take().id),
    )!;
    expect(film.mixedDialogue).toBe(null);
    expect(roundTrip(r.state).takes[take().id]!.audioLanguage).toBe("none");
    const undo = applyCommand(r.state, envelope(r.inverse));
    expect(undo.ok && { ...undo.state.takes[take().id]!, revision: 0 }).toEqual({
      ...take(),
      revision: 0,
    });
    expect(
      applyCommand(
        s0,
        envelope({ type: "SetTakeAudioLanguage", takeId: take().id, audioLanguage: "xx-yy" }),
      ).ok,
    ).toBe(false);
  });
});

describe("timing og leppesynk", () => {
  it("engelsk replikk som er for lang, flagges med forslag; hovedfilmen endres ikke (REQ-0343/0344)", () => {
    const en = enDialogue();
    const cs = timingConflicts(s0, main.id, "en");
    const c = cs.find((x) => x.blockId === en.blockId && x.kind === "long");
    expect(c).toBeTruthy();
    expect(c!.source).toBe("audio");
    expect(c!.overflowMs).toBeGreaterThan(200);
    expect(c!.suggestions.map((x) => x.kind)).toContain("shorten");
    expect(c!.suggestions.map((x) => x.kind)).toContain("pause");
    // Forslaget «start tidligere» flytter bare den engelske lyden
    const earlier = c!.suggestions.find((x) => x.kind === "earlier");
    if (earlier && earlier.kind === "earlier") {
      expect(earlier.clipId).toBe(en.id);
      expect(earlier.offsetMs).toBeLessThan(en.offsetMs);
    }
    // Tiden i hovedfilmen er den samme med og uten engelsk lyd
    const without = {
      ...s0,
      audioClips: Object.fromEntries(
        Object.entries(s0.audioClips).filter(([, a]) => a.language !== "en"),
      ),
    };
    const durs = (s: ProjectState) =>
      filmClips(languageState(s, "nb"), main.id).map((x) => [x.startFrame, x.durationFrames]);
    expect(durs(s0)).toEqual(durs(without));
    // Norsk har ingen konflikter mot seg selv
    expect(timingConflicts(s0, main.id, "nb")).toEqual([]);
  });

  it("«start tidligere» regner plassen fra forrige engelske lydklipp (KI-119)", () => {
    const en = enDialogue();
    // Et engelsk lydklipp som slutter 50 ms før replikken: da er det ikke plass til å starte tidligere
    const before = {
      ...en,
      id: "00000000-0000-7000-8000-00000000ab01" as never,
      blockId: null,
      offsetMs: 0,
      lengthMs: Math.max(1, en.offsetMs - 50),
    };
    const s = { ...s0, audioClips: { ...s0.audioClips, [before.id]: before } };
    const c = timingConflicts(s, main.id, "en").find(
      (x) => x.blockId === en.blockId && x.kind === "long",
    );
    expect(c).toBeTruthy();
    // Bare 50 ms plass: ikke nok til et forslag om å starte tidligere
    expect(c!.suggestions.some((x) => x.kind === "earlier")).toBe(false);
  });

  it("uten engelsk lyd beregnes lengden fra oversettelsen", () => {
    const without = {
      ...s0,
      audioClips: Object.fromEntries(
        Object.entries(s0.audioClips).filter(([, a]) => a.language !== "en"),
      ),
    } as ProjectState;
    const cs = timingConflicts(without, main.id, "en");
    expect(cs.every((c) => c.source === "estimate")).toBe(true);
  });

  it("materialtype per klipp og råd om leppesynk; aldri automatisk regenerering (REQ-0345–0347)", () => {
    const clips = filmClips(s0, main.id);
    const kinds = clips.map((c) => clipMaterial(s0, c));
    expect(kinds).toContain("imported_film");
    expect(kinds.some((k) => k === "animatic2d" || k === "character2d" || k === "still")).toBe(
      true,
    );
    expect(lipSyncAdvice("still").action).toBe("direct");
    expect(lipSyncAdvice("animatic2d").action).toBe("direct");
    expect(lipSyncAdvice("character2d").action).toBe("check");
    expect(lipSyncAdvice("ai_video").action).toBe("lipsync");
    expect(lipSyncAdvice("imported_film").text).toMatch(/endres ikke automatisk/);
    expect(lipSyncAdvice("ai_video").text).toMatch(/kostnadsgodkjenning/);
  });

  it("oversikten teller oversatte replikker og lyd per språk", () => {
    const r = languageReport(s0, main.id, "en");
    const first = r[0]!;
    expect(first.lines).toBeGreaterThan(0);
    expect(first.translated).toBeGreaterThan(0);
    expect(first.withAudio).toBe(1);
    expect(first.withMainAudio).toBe(1);
  });
});

describe("spinoff", () => {
  it("en spinoff kan ha egen engelsk lyd uten at hovedfilmen endres (REQ-0371)", () => {
    const spin = Object.values(s0.productions).find((p) => p.kind !== "main")!;
    const occ = orderedOccurrences(s0, spin.id)[0]!;
    const en = enDialogue();
    const s = mustApply(s0, {
      type: "AddAudioClips",
      clips: [
        {
          clipId: tid(),
          fields: {
            ...audioClipFieldsOf(en),
            occurrenceId: occ.id,
            blockId: null,
            name: "Spinoff EN",
          },
        },
      ],
    });
    const fps = s.project.fps;
    const ids = (prod: string, lang: string) => {
      const v = languageState(s, lang);
      return filmAudio(v, filmClips(v, prod), fps, lang).map((x) => x.clip.name);
    };
    expect(ids(spin.id, "en")).toContain("Spinoff EN");
    expect(ids(main.id, "en")).not.toContain("Spinoff EN");
    expect(ids(spin.id, "nb")).not.toContain("Spinoff EN");
  });

  it("egen versjon av en scene i spinoffen tar med språket på lyden", () => {
    const spin = Object.values(s0.productions).find((p) => p.kind !== "main")!;
    const en = enDialogue();
    const shared = orderedOccurrences(s0, spin.id).find(
      (o) => o.variantId === s0.occurrences[en.occurrenceId]!.variantId,
    );
    if (!shared) return; // Scenen er ikke gjenbrukt i spinoffen i fixturen
    const s = mustApply(s0, {
      type: "AddAudioClips",
      clips: [{ clipId: tid(), fields: { ...audioClipFieldsOf(en), occurrenceId: shared.id } }],
    });
    const block = s.blocks[en.blockId!]!;
    const plan = forkPlan(s, {
      type: "EditBlockText",
      productionId: spin.id as never,
      blockId: block.id,
      text: `${block.text}!`,
    });
    expect(plan).toBeTruthy();
    if (!plan) return;
    let t = s;
    for (const c of plan.fork) t = mustApply(t, c);
    const copied = Object.values(t.audioClips).filter(
      (a) => a.occurrenceId === shared.id && a.language === "en",
    );
    expect(copied.length).toBe(1);
  });
});

describe("dialogspor og undertekster", () => {
  it("dialogsporet har bare tale, ikke musikk, effekter eller filmlyd (REQ-0350)", async () => {
    const { dialogueItems, encodeWav } = await import("@/engine/export/audio-stem");
    const v = languageState(s0, "en");
    const clips = filmClips(v, main.id);
    const items = [
      ...filmAudio(v, clips, s0.project.fps, "en"),
      ...filmTakeAudio(clips, s0.project.fps),
    ];
    const d = dialogueItems(items);
    expect(d.length).toBeGreaterThan(0);
    expect(
      d.every((it) => !it.film && (it.clip.kind === "dialogue" || it.clip.kind === "narration")),
    ).toBe(true);
    expect(d.map((it) => it.clip.id)).toContain(enDialogue().id);
    expect(d.map((it) => it.clip.id)).not.toContain(nbDialogue().id);
    // WAV: 44 byte topp + 16 bit per kanal og prøve
    const wav = encodeWav([new Float32Array([0, 1, -1]), new Float32Array([0.5, 0, 2])], 48000);
    expect(wav.byteLength).toBe(44 + 3 * 2 * 2);
    const view = new DataView(wav.buffer);
    expect(String.fromCharCode(...wav.slice(0, 4))).toBe("RIFF");
    expect(view.getUint16(22, true)).toBe(2);
    expect(view.getUint32(24, true)).toBe(48000);
    expect(view.getInt16(44 + 2, true)).toBe(Math.round(0.5 * 0x7fff));
    expect(view.getInt16(44 + 4, true)).toBe(0x7fff);
    expect(view.getInt16(44 + 8, true)).toBe(-0x8000);
    expect(view.getInt16(44 + 10, true)).toBe(0x7fff); // 2 klippes til 1
  });

  it("underteksten på et tidspunkt (REQ-0352)", async () => {
    const { cueAt } = await import("@/core");
    const cues = [
      { startMs: 0, endMs: 1000, text: "a" },
      { startMs: 1500, endMs: 3000, text: "b" },
      { startMs: 2500, endMs: 4000, text: "c" },
    ];
    expect(cueAt(cues, 500)?.text).toBe("a");
    expect(cueAt(cues, 1200)).toBe(null);
    expect(cueAt(cues, 2700)?.text).toBe("c");
    expect(cueAt(cues, 3500)?.text).toBe("c");
    expect(cueAt(cues, 5000)).toBe(null);
    expect(cueAt([], 10)).toBe(null);
  });
});
