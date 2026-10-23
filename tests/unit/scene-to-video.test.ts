// @vitest-environment node
/** AI-video fra 2D-scenen (DEC-0083, REQ-0633–0637). */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SCENE_DESCRIPTION_SYSTEM,
  briefStyle,
  composeStyleText,
  emptyStyleGuide,
  planReferences,
  referenceCount,
  sceneBackground,
  sceneDescriptionFromScript,
  sceneDescriptionUserText,
  stateWithSource,
  styleGuideError,
  styleText,
  styleTextEdited,
  adaptPromptForModel,
  applyCommand,
  batchInUse,
  batchSceneEdit,
  buildSceneVideoPrompt,
  castWithImages,
  compositionOfVariant,
  filmClips,
  filmSelection,
  isSceneVideoSourcePath,
  mainProduction,
  orderedOccurrences,
  planScenePieces,
  providerModel,
  providersFor,
  sceneCast,
  sceneVideoBatches,
  sceneVideoSourcePath,
  stateWithAnimatic,
  SCENE_VIDEO_SOURCE,
  type GenerationJob,
  type ProjectState,
} from "@/core";
import { ADAPTERS } from "@/adapters/ai/providers.server";
import { envelope, mustApply, tid } from "../helpers/fixtures";
import { fixture } from "../visual/fixture-state";

const s0 = fixture.state;
const main = mainProduction(s0)!;
// En scene med 2D-scene og figurer fra biblioteket som lag
const occ = orderedOccurrences(s0, main.id).find((o) => {
  const c = compositionOfVariant(s0, o.variantId);
  return (
    c && Object.values(s0.layers).some((l) => l.compositionId === c.id && !l.removed && l.assetId)
  );
})!;
const KLING = providerModel("fal", "fal-ai/kling-video/o3/pro/video-to-video/edit")!;
const ALEPH = providerModel("runway", "aleph2")!;
const FPS = { num: 24, den: 1 };

afterEach(() => vi.unstubAllGlobals());

describe("modellene for video fra 2D-scenen", () => {
  it("er egne modeller (ikke blandet med video fra startbilde)", () => {
    const all = new Set(["fal", "runway"]);
    const edit = providersFor("video_edit", all).flatMap((p) => p.models.map((m) => m.id));
    expect(edit).toEqual(["fal-ai/kling-video/o3/pro/video-to-video/edit", "aleph2"]);
    const video = providersFor("video", all).flatMap((p) => p.models.map((m) => m.id));
    expect(video).not.toContain("aleph2");
    expect(video.some((id) => id.includes("video-to-video"))).toBe(false);
    expect(KLING.editSeconds).toEqual({ min: 3, max: 15 });
    expect(KLING.maxElements).toBe(4);
    expect(ALEPH.maxElements).toBe(0);
  });
});

describe("biter", () => {
  it("deler en lang scene i like lange biter innenfor modellens grenser og dekker hele scenen", () => {
    const frames = Math.round(23.4 * 24);
    const p = planScenePieces(frames, FPS, KLING);
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.pieces).toHaveLength(2);
    expect(p.pieces[0]!.startFrame).toBe(0);
    expect(p.pieces[1]!.endFrame).toBe(frames);
    expect(p.pieces[0]!.endFrame).toBe(p.pieces[1]!.startFrame);
    for (const x of p.pieces) {
      expect((x.endMs - x.startMs) / 1000).toBeLessThanOrEqual(15);
      expect((x.endMs - x.startMs) / 1000).toBeGreaterThanOrEqual(3);
      expect(x.billedSeconds).toBe(Math.ceil((x.endMs - x.startMs) / 1000));
    }
  });

  it("én bit når scenen er kort nok, og Aleph tar 30 sekunder om gangen", () => {
    const k = planScenePieces(10 * 24, FPS, KLING);
    expect(k.ok && k.pieces.length).toBe(1);
    const a = planScenePieces(25 * 24, FPS, ALEPH);
    expect(a.ok && a.pieces.length).toBe(1);
    const long = planScenePieces(61 * 24, FPS, ALEPH);
    expect(long.ok && long.pieces.length).toBe(3);
  });

  it("en scene kortere enn modellens korteste lengde kan ikke sendes", () => {
    const p = planScenePieces(2 * 24, FPS, KLING);
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.message).toMatch(/minst 3 sekunder/);
    expect(planScenePieces(48, FPS, {}).ok).toBe(false);
  });
});

describe("figurene og beskrivelsen", () => {
  it("figurene i 2D-scenen kommer først, med bildet laget viser", () => {
    const cast = sceneCast(s0, main.id, occ.id);
    expect(cast.length).toBeGreaterThan(0);
    const first = cast[0]!;
    expect(first.inComposition || first.kind === "character").toBe(true);
    for (const m of cast) expect(["location", "environment", "sound"]).not.toContain(m.kind);
    expect(castWithImages(cast, KLING).length).toBeLessThanOrEqual(4);
    expect(castWithImages(cast, ALEPH)).toEqual([]);
  });

  function promptFor(
    model: typeof KLING,
    sceneDescription: string,
    opts: { globalStyle?: string | null; withAudio?: boolean } = {},
  ) {
    const anim = stateWithAnimatic(s0, [occ.id]);
    const sel = filmSelection(filmClips(anim, main.id), new Set([occ.id]));
    const clip = sel.clips[0]!;
    const plan = planScenePieces(Math.max(clip.durationFrames, 5 * 24), FPS, model);
    if (!plan.ok) throw new Error(plan.message);
    const cast = sceneCast(s0, main.id, occ.id);
    const refs = planReferences(cast, sceneBackground(s0, main.id, occ.id), model);
    return {
      text: buildSceneVideoPrompt(anim, {
        clip,
        productionId: main.id,
        piece: plan.pieces[0]!,
        count: plan.pieces.length,
        cast,
        refs,
        globalStyle: opts.globalStyle === undefined ? "Watercolour on paper." : opts.globalStyle,
        sceneDescription,
        references: (model.maxElements ?? 0) > 0,
        withAudio: opts.withAudio ?? false,
        maxChars: model.maxPromptChars,
      }),
      refs,
    };
  }

  it("Kling: videoen er @Video1, referansene har navn, scenebeskrivelsen og den globale beskrivelsen kommer med", () => {
    const { text, refs } = promptFor(KLING, "Scene: Interior, Stua, day.\nAction: Maja ser ut.");
    expect(text).toMatch(/^Animated film shot: redraw @Video1/);
    expect(text).toMatch(/Keep everything that happens in @Video1 exactly/);
    if (refs.elements.length) expect(text).toContain(`@Element1 is ${refs.elements[0]!.name}.`);
    if (refs.background)
      expect(text).toContain(`@Image1 shows the location: ${refs.background.name}.`);
    expect(text).toContain("Scene description:\nScene: Interior, Stua, day.\nAction: Maja ser ut.");
    expect(text).toContain("Project style (applies to the whole film):\nWatercolour on paper.");
    expect(text).toMatch(/No on-screen text.*No sound\./);
    expect(text).not.toMatch(/must say these lines/);
  });

  it("den globale beskrivelsen kan slås av, og lyd sendt med brukes til munnbevegelser", () => {
    const { text } = promptFor(KLING, "Scene: x.", { globalStyle: null, withAudio: true });
    expect(text).not.toContain("Project style");
    expect(text).toMatch(/Use the sound in @Video1 for lip movement and timing/);
    expect(text).not.toMatch(/No sound\./);
  });

  it("Aleph: bare tekst (ingen @-referanser), og beskrivelsen kortes til 1000 tegn uten å miste scenebeskrivelsen", () => {
    const long = "Snøen faller tett og lyset fra vinduet er varmt. ".repeat(6).trim();
    const { text } = promptFor(ALEPH, long);
    expect(text).not.toContain("@");
    expect(text).toContain("the input video");
    expect(text.length).toBeLessThanOrEqual(1000);
    const a = adaptPromptForModel(text, ALEPH);
    expect(a.text).toBe(text);
    expect(a.text).toMatch(/^Animated film shot/);
    expect(a.text).toContain(long);
  });
});

describe("referansebildene", () => {
  const fig = (n: number, kind: "character" | "object" = "character") =>
    ({
      assetId: `a${n}`,
      name: `Figur ${n}`,
      kind,
      description: `Figur ${n}`,
      visualBrief: "",
      imagePath: `p/${n}.png`,
      inComposition: true,
    }) as const;
  const bg = { assetId: "bg", name: "Stua", imagePath: "p/bg.png" };

  it("plass til alle: figurene som egne referanser og bakgrunnen som bilde", () => {
    const p = planReferences([fig(1), fig(2)], bg, KLING);
    expect(p.elements.map((m) => m.assetId)).toEqual(["a1", "a2"]);
    expect(p.background?.name).toBe("Stua");
    expect(p.sheet).toEqual([]);
    expect(referenceCount(p)).toBe(3);
  });

  it("for mange: resten settes sammen i ett samlebilde, høyst modellens grense til sammen", () => {
    const p = planReferences([fig(1), fig(2), fig(3), fig(4), fig(5, "object")], bg, KLING);
    expect(p.elements.map((m) => m.assetId)).toEqual(["a1", "a2"]);
    expect(p.sheet.map((m) => m.assetId)).toEqual(["a3", "a4", "a5"]);
    expect(referenceCount(p)).toBe(4);
    // Uten bakgrunn: tre egne og ett samlebilde
    const q = planReferences([fig(1), fig(2), fig(3), fig(4), fig(5)], null, KLING);
    expect(q.elements).toHaveLength(3);
    expect(q.sheet).toHaveLength(2);
    expect(referenceCount(q)).toBe(4);
  });

  it("figurer uten bilde og modeller uten referanser gir ingen bilder", () => {
    const none = { ...fig(9), imagePath: null };
    expect(planReferences([none], null, KLING).elements).toEqual([]);
    expect(referenceCount(planReferences([fig(1)], bg, ALEPH))).toBe(0);
  });
});

describe("scenebeskrivelsen fra manuset", () => {
  it("følger formen modellene anbefaler: sted, figurer, handling, hvem som snakker", () => {
    const clip = filmClips(s0, main.id).find((c) => c.occurrenceId === occ.id)!;
    const text = sceneDescriptionFromScript(s0, main.id, clip, sceneCast(s0, main.id, occ.id));
    expect(text).toMatch(/^Scene: /);
    expect(text).toMatch(/\nAction: /);
    const v = s0.variants[occ.variantId]!;
    expect(text).toContain(v.heading.location.trim());
    // Replikkene siteres ikke; bare hvem som snakker
    expect(text).not.toMatch(/«/);
    const user = sceneDescriptionUserText(s0, clip, text, sceneCast(s0, main.id, occ.id));
    expect(user).toContain("SCREENPLAY (in the film's original language, the scene in full)");
    expect(user).not.toMatch(/Norwegian/);
    expect(user).toContain("DRAFT MADE FROM THE SCREENPLAY");
    expect(SCENE_DESCRIPTION_SYSTEM).toMatch(/Scene:.*\n.*Characters:/s);
  });
});

describe("den globale beskrivelsen (én versjon)", () => {
  it("settes sammen av feltene, og en redigert tekst erstatter dem overalt", () => {
    const g = { ...emptyStyleGuide(), visualStyle: "Akvarell", mood: "Varm" };
    expect(composeStyleText(g)).toBe("Visual style: Akvarell\nMood: Varm");
    expect(styleText(g)).toBe(composeStyleText(g));
    expect(styleTextEdited(g)).toBe(false);
    const edited = { ...g, prompt: "Én tekst for hele filmen." };
    expect(styleText(edited)).toBe("Én tekst for hele filmen.");
    expect(styleTextEdited(edited)).toBe(true);
    expect(styleGuideError(edited)).toBe(null);
    expect(styleGuideError({ ...g, prompt: "x".repeat(5001) })).toMatch(/for lang/);
    // Bildebestillingen bruker den redigerte teksten
    const b = briefStyle(edited, "cutout", "");
    expect(b.look).toBe("Én tekst for hele filmen.");
    expect(b.mood).toBe("");
  });
});

describe("kilden: det scenen viser", () => {
  it("en tidligere versjon eller bitene i en bunt kan sendes i stedet for 2D-scenen", () => {
    const takeId = tid<"take">();
    const s = mustApply(s0, {
      type: "AddTake",
      takeId,
      occurrenceId: occ.id,
      segmentId: null,
      kind: "imported_film",
      status: "approved",
      durationFrames: 120,
      mediaRef: `${s0.project.id}/films/${takeId}/film.mp4`,
      media: {
        fileName: "film.mp4",
        mimeType: "video/mp4",
        byteSize: 10,
        width: 1280,
        height: 720,
        fps: 24,
        durationMs: 5000,
        videoCodec: null,
        hasAudio: true,
      },
    });
    const viaTake = stateWithSource(s, [occ.id], { kind: "take", takeId });
    const c1 = filmClips(viaTake, main.id).find((c) => c.occurrenceId === occ.id)!;
    expect(c1.source).toBe("film");
    expect(c1.parts[0]!.take?.id).toBe(takeId);
    const viaParts = stateWithSource(s, [occ.id], {
      kind: "parts",
      parts: [
        { partId: tid() as never, source: "take", takeId, inMs: 0, outMs: 2000 },
        { partId: tid() as never, source: "take", takeId, inMs: 2000, outMs: 4000 },
      ],
    });
    const c2 = filmClips(viaParts, main.id).find((c) => c.occurrenceId === occ.id)!;
    expect(c2.parts).toHaveLength(2);
    expect(c2.edited).toBe(true);
    // Prosjektet selv er uendret
    expect(s.occurrences[occ.id]!.activeTakeId).toBe(null);
    expect(Object.values(s.clipParts).filter((p) => p.occurrenceId === occ.id)).toEqual([]);
  });
});

describe("2D-scenen sendes, ikke versjonen som vises", () => {
  it("stateWithAnimatic gir 2D-scenen selv om en AI-video er valgt for scenen", () => {
    const takeId = tid<"take">();
    let s = mustApply(s0, {
      type: "AddTake",
      takeId,
      occurrenceId: occ.id,
      segmentId: null,
      kind: "ai_video",
      status: "in_progress",
      durationFrames: 120,
      mediaRef: `${s0.project.id}/films/${takeId}/ai.mp4`,
      media: {
        fileName: "ai.mp4",
        mimeType: "video/mp4",
        byteSize: 10,
        width: 1280,
        height: 720,
        fps: 24,
        durationMs: 5000,
        videoCodec: null,
        hasAudio: false,
      },
    });
    s = mustApply(s, {
      type: "SetSceneEdit",
      occurrenceId: occ.id,
      activeTakeId: takeId,
      parts: [],
    });
    const shown = filmClips(s, main.id).find((c) => c.occurrenceId === occ.id)!;
    expect(shown.source).toBe("film");
    const anim = filmClips(stateWithAnimatic(s, [occ.id]), main.id).find(
      (c) => c.occurrenceId === occ.id,
    )!;
    expect(anim.parts.every((p) => p.source === "composition")).toBe(true);
    // Prosjektet selv er uendret
    expect(s.occurrences[occ.id]!.activeTakeId).toBe(takeId);
  });

  it("stiene for videoen hører til prosjektet", () => {
    const p = sceneVideoSourcePath(s0.project.id, "b", 0);
    expect(p).toBe(`${s0.project.id}/temp/ai-source/b/1.mp4`);
    // Eldre filer i <prosjekt>/ai-source godtas fortsatt (KI-178)
    expect(isSceneVideoSourcePath(s0.project.id, `${s0.project.id}/ai-source/b/1.mp4`)).toBe(true);
    expect(isSceneVideoSourcePath(s0.project.id, p)).toBe(true);
    expect(isSceneVideoSourcePath(s0.project.id, `${s0.project.id}/films/x.mp4`)).toBe(false);
    expect(isSceneVideoSourcePath(s0.project.id, `${s0.project.id}/ai-source/../x.mp4`)).toBe(
      false,
    );
    expect(isSceneVideoSourcePath("annet", p)).toBe(false);
  });
});

describe("instruksene for scenen", () => {
  it("lagres, kan angres og tømmes; for lange og uendrede avvises", () => {
    const s = mustApply(s0, {
      type: "SetSceneVideoInstructions",
      occurrenceId: occ.id,
      text: "  Varmt lys.\r\nSnø.  ",
    });
    expect(s.occurrences[occ.id]!.videoInstructions).toBe("Varmt lys.\nSnø.");
    const r = applyCommand(
      s,
      envelope({ type: "SetSceneVideoInstructions", occurrenceId: occ.id, text: "x".repeat(2001) }),
    );
    expect(r.ok).toBe(false);
    const same = applyCommand(
      s,
      envelope({
        type: "SetSceneVideoInstructions",
        occurrenceId: occ.id,
        text: "Varmt lys.\nSnø.",
      }),
    );
    expect(same.ok).toBe(false);
    const done = applyCommand(
      s0,
      envelope({ type: "SetSceneVideoInstructions", occurrenceId: occ.id, text: "Hei" }),
    );
    expect(done.ok && done.inverse).toEqual({
      type: "SetSceneVideoInstructions",
      occurrenceId: occ.id,
      text: "",
    });
    const cleared = mustApply(s, {
      type: "SetSceneVideoInstructions",
      occurrenceId: occ.id,
      text: "",
    });
    expect("videoInstructions" in cleared.occurrences[occ.id]!).toBe(false);
  });
});

describe("resultatene", () => {
  function job(batch: string, piece: number, status: GenerationJob["status"], take?: string) {
    return {
      id: tid(),
      kind: "video",
      provider: "fal",
      model: KLING.id,
      prompt: "p",
      assetId: null,
      status,
      error: status === "failed" ? "Avvist" : null,
      resultPath: take ? `${s0.project.id}/films/${take}/ai-video.mp4` : null,
      resultText: null,
      createdAt: `2026-10-15T10:0${piece}:00Z`,
      finishedAt: null,
      createdBy: "u",
      estimatedCost: null,
      occurrenceId: occ.id,
      segmentId: null,
      params: {
        source: SCENE_VIDEO_SOURCE,
        batch,
        piece,
        pieces: 2,
        startMs: piece * 6000,
        endMs: (piece + 1) * 6000,
      },
    } as GenerationJob;
  }
  function withTake(s: ProjectState, takeId: string) {
    return mustApply(s, {
      type: "AddTake",
      takeId: takeId as never,
      occurrenceId: occ.id,
      segmentId: null,
      kind: "ai_video",
      status: "in_progress",
      durationFrames: 150,
      mediaRef: `${s0.project.id}/films/${takeId}/ai-video.mp4`,
      media: {
        fileName: "ai.mp4",
        mimeType: "video/mp4",
        byteSize: 10,
        width: 1280,
        height: 720,
        fps: 24,
        durationMs: 6250,
        videoCodec: null,
        hasAudio: false,
      },
    });
  }

  it("bitene i en bunt settes sammen i rekkefølge, hver så lang som biten i 2D-scenen", () => {
    const t1 = tid<"take">();
    const t2 = tid<"take">();
    let s = withTake(withTake(s0, t1), t2);
    const running = sceneVideoBatches(
      s,
      [job("b1", 1, "running"), job("b1", 0, "done", t1)],
      new Set([occ.id]),
    );
    expect(running).toHaveLength(1);
    expect(running[0]!.status).toBe("running");
    expect(batchSceneEdit(s, running[0]!, () => tid())).toBe(null);
    const [b] = sceneVideoBatches(
      s,
      [job("b1", 1, "done", t2), job("b1", 0, "done", t1)],
      new Set([occ.id]),
    );
    expect(b!.status).toBe("done");
    expect(b!.takes.map((t) => t!.id)).toEqual([t1, t2]);
    const edit = batchSceneEdit(s, b!, () => tid())!;
    expect(edit.activeTakeId).toBe(null);
    expect(edit.parts.map((p) => [p.takeId, p.inMs, p.outMs])).toEqual([
      [t1, 0, 6000],
      [t2, 0, 6000],
    ]);
    expect(batchInUse(s, b!, occ.id)).toBe(false);
    s = mustApply(s, {
      type: "SetSceneEdit",
      occurrenceId: occ.id,
      activeTakeId: null,
      parts: edit.parts as never,
    });
    expect(batchInUse(s, b!, occ.id)).toBe(true);
    // Scenens lyd er uendret, og videoene er uten lyd
    expect(s.audioClips).toEqual(s0.audioClips);
    expect(s.takes[t1]!.media?.hasAudio).toBe(false);
  });

  it("en bit som feilet, gjør bunten feilet; andre jobber teller ikke", () => {
    const other = { ...job("x", 0, "done"), params: {} } as GenerationJob;
    const list = sceneVideoBatches(
      s0,
      [job("b2", 0, "failed"), job("b2", 1, "running"), other],
      new Set([occ.id]),
    );
    expect(list).toHaveLength(1);
    expect(list[0]!.status).toBe("failed");
  });
});

describe("leverandørene", () => {
  it("fal.ai: Kling O3 Edit får videoen, figurene som elementer og ingen lyd", async () => {
    let body: Record<string, unknown> = {};
    let url = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (u: string, init?: RequestInit) => {
        url = u;
        body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(JSON.stringify({ request_id: "r1" }));
      }),
    );
    const id = await ADAPTERS.fal.editVideo({
      key: "k:s",
      model: KLING.id,
      prompt: "Redraw @Video1. @Element1 is Maja.",
      videoUrl: "https://signed/video.mp4",
      elementUrls: ["https://signed/maja.png"],
      imageUrls: ["https://signed/stua.png"],
    });
    expect(id).toBe("r1");
    expect(body["image_urls"]).toEqual(["https://signed/stua.png"]);
    expect(url).toContain("fal-ai/kling-video/o3/pro/video-to-video/edit");
    expect(body["video_url"]).toBe("https://signed/video.mp4");
    expect(body["keep_audio"]).toBe(false);
    expect(body["elements"]).toEqual([
      {
        frontal_image_url: "https://signed/maja.png",
        reference_image_urls: ["https://signed/maja.png"],
      },
    ]);
    await expect(
      ADAPTERS.fal.editVideo({
        key: "k",
        model: "fal-ai/kling-video/v3/4k/image-to-video",
        prompt: "x",
        videoUrl: "u",
        elementUrls: [],
      }),
    ).rejects.toThrow();
  });

  it("Runway: Aleph 2 får videoen og teksten (video_to_video)", async () => {
    let body: Record<string, unknown> = {};
    let url = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (u: string, init?: RequestInit) => {
        url = u;
        body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(JSON.stringify({ id: "task-9" }));
      }),
    );
    const id = await ADAPTERS.runway.editVideo({
      key: "key_x",
      model: "aleph2",
      prompt: "Redraw the input video.",
      videoUrl: "https://signed/video.mp4",
      elementUrls: [],
    });
    expect(id).toBe("task-9");
    expect(url).toMatch(/\/v1\/video_to_video$/);
    expect(body).toEqual({
      model: "aleph2",
      videoUri: "https://signed/video.mp4",
      promptText: "Redraw the input video.",
    });
  });
});
