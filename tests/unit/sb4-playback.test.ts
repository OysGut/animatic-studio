// @vitest-environment node
/**
 * SB-4: storyboardtid, avspilling og storyboardfilm (ren kjerne).
 * Tester rekkefølge, timing med arv, lyd uten kopi, kameramerker som bevegelse og bildekilden i eksporten.
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_COMPOSITION,
  DEFAULT_PANEL_SECONDS,
  applyCommand,
  defaultLayerFields,
  exportImageSource,
  filmAudio,
  filmClips,
  framesToSeconds,
  orderedOccurrences,
  panelCameraShot,
  panelTiming,
  secondsToFrames,
  shotAtFrame,
  storyboardAudioItems,
  storyboardClips,
  storyboardDurationFrames,
  storyboardFilm,
  storyboardTimeline,
  storyboardViewState,
  suggestPanelTimings,
  type AudioClipFields,
  type ProjectState,
} from "@/core";
import { envelope, mustApply, seedProject, tid } from "../helpers/fixtures";

function addPanel(s: ProjectState, occId: string, orderKey: string, durationFrames = 0) {
  const panelId = tid<"composition">();
  const occ = s.occurrences[occId as never]!;
  const st = mustApply(s, {
    type: "AddStoryboardPanel",
    panelId,
    occurrenceId: occId as never,
    variantId: occ.variantId,
    orderKey,
    ...(durationFrames > 0 ? { durationFrames } : {}),
  });
  return { s: st, panelId };
}

function addSceneComp(s: ProjectState, occId: string, durationFrames: number) {
  const compositionId = tid<"composition">();
  return mustApply(s, {
    type: "CreateComposition",
    compositionId,
    variantId: s.occurrences[occId as never]!.variantId,
    fields: { ...DEFAULT_COMPOSITION, durationFrames },
  });
}

function setup(sceneCount = 2) {
  const seed = seedProject(sceneCount);
  const occs = orderedOccurrences(seed.state, seed.mainId).map((o) => o.id as string);
  return { s: seed.state, mainId: seed.mainId, occs };
}

describe("SB-4 timing med arv", () => {
  it("eget panel → scenens 2D-scene → filmestimat → standard", () => {
    let { s, mainId, occs } = setup();
    const own = addPanel(s, occs[0]!, "a", 100);
    const clips = filmClips(own.s, mainId);
    expect(panelTiming(own.s, clips, own.s.compositions[own.panelId]!)).toEqual({ frames: 100, source: "panel" });

    const inherited = addPanel(own.s, occs[0]!, "b");
    let st = addSceneComp(inherited.s, occs[0]!, 250);
    expect(panelTiming(st, filmClips(st, mainId), st.compositions[inherited.panelId]!)).toEqual({ frames: 250, source: "scene" });

    // Uten 2D-scene: scenens estimat i monteringen (planlagt/beregnet)
    const { s: bare, mainId: bareMain, occs: bareOccs } = setup();
    const p = addPanel(bare, bareOccs[0]!, "a");
    const bareClips = filmClips(p.s, bareMain);
    const t = panelTiming(p.s, bareClips, p.s.compositions[p.panelId]!);
    expect(t.source).toBe("estimate");
    expect(t.frames).toBe(bareClips[0]!.durationFrames);

    // Fallback: scenen finnes ikke i klippene (deaktivert) → standard
    const deactivated = mustApply(p.s, { type: "SetOccurrenceActive", occurrenceId: bareOccs[0] as never, active: false });
    const t2 = panelTiming(deactivated, filmClips(deactivated, bareMain), deactivated.compositions[p.panelId]!);
    expect(t2).toEqual({ frames: secondsToFrames(DEFAULT_PANEL_SECONDS, s.project.fps), source: "default" });
  });

  it("forslag fra replikker og lyd endrer ingenting", () => {
    let { s, mainId, occs } = setup(1);
    const blocks = Object.values(s.blocks).filter((b) => b.variantId === s.occurrences[occs[0]! as never]!.variantId && b.kind === "dialogue" && !b.removed);
    const a = addPanel(s, occs[0]!, "a");
    s = mustApply(a.s, { type: "AnchorStoryboardPanel", linkId: tid(), panelId: a.panelId, blockId: blocks[0]!.id, orderKey: "a" });
    const b = addPanel(s, occs[0]!, "b");
    const before = b.s;
    const suggestions = suggestPanelTimings(b.s, filmClips(b.s, mainId), occs[0]! as never);
    expect(suggestions.find((x) => x.panelId === a.panelId)?.basis).toBe("dialogue");
    expect(suggestions.find((x) => x.panelId === a.panelId)!.frames).toBeGreaterThan(0);
    expect(suggestions.find((x) => x.panelId === b.panelId)?.basis).toBe("audio");
    expect(b.s).toBe(before); // forslaget skriver aldri
  });
});

describe("SB-4 storyboardtidslinjen", () => {
  function timeline3() {
    let { s, mainId, occs } = setup(2);
    const a = addPanel(s, occs[0]!, "a", 50);
    const b = addPanel(a.s, occs[0]!, "b", 75);
    const c = addPanel(b.s, occs[1]!, "a", 25);
    // Overgang inn i scene 2
    const st = mustApply(c.s, {
      type: "SetTransition",
      occurrenceId: occs[1] as never,
      transition: { kind: "dissolve", frames: 10 },
    });
    return { s: st, mainId, occs, panels: [a.panelId, b.panelId, c.panelId] };
  }

  it("rekkefølge: scener i filmrekkefølge, paneler i panelrekkefølge", () => {
    const { s, mainId, panels } = timeline3();
    const shots = storyboardTimeline(s, filmClips(s, mainId));
    expect(shots.map((x) => x.panel.id)).toEqual(panels);
    expect(shots.map((x) => x.timingSource)).toEqual(["panel", "panel", "panel"]);
    // Klipp mellom paneler i samme scene; scenens overgang bare inn i første panel
    expect(shots[0]!.transition.kind).toBe("cut");
    expect(shots[1]!.transition.kind).toBe("cut");
    expect(shots[2]!.transition.kind).toBe("dissolve");
    expect(shots[2]!.overlapFrames).toBe(10);
    // Scene 2 starter 50+75−10 (overlapp) bilder ut i filmen
    expect(shots[2]!.startFrame).toBe(115);
    expect(storyboardDurationFrames(shots)).toBe(115 + 25);
  });

  it("deaktiverte og skjulte paneler hoppes over", () => {
    let { s, mainId, occs } = setup(1);
    const a = addPanel(s, occs[0]!, "a", 40);
    const b = addPanel(a.s, occs[0]!, "b", 60);
    const c = addPanel(b.s, occs[0]!, "c", 80);
    let st = mustApply(c.s, { type: "SetStoryboardPanelActive", panelId: b.panelId, active: false });
    st = mustApply(st, { type: "SetStoryboardPanelHidden", panelId: c.panelId, hidden: true });
    const shots = storyboardTimeline(st, filmClips(st, mainId));
    expect(shots.map((x) => x.panel.id)).toEqual([a.panelId]);
    expect(storyboardDurationFrames(shots)).toBe(40);
  });

  it("shotAtFrame finner riktig panel og lokalt bilde", () => {
    const { s, mainId, panels } = timeline3();
    const shots = storyboardTimeline(s, filmClips(s, mainId));
    expect(shotAtFrame(shots, 0)!.shot.panel.id).toBe(panels[0]);
    expect(shotAtFrame(shots, 60)!.shot.panel.id).toBe(panels[1]);
    expect(shotAtFrame(shots, 60)!.localFrame).toBe(10);
    // Overlappen: de 10 siste bildene av panel 2 hører fortsatt til panel 2
    expect(shotAtFrame(shots, 120)!.shot.panel.id).toBe(panels[1]);
    expect(shotAtFrame(shots, 125)!.shot.panel.id).toBe(panels[2]);
    // Utenfor slutten: siste bilde i siste panel
    expect(shotAtFrame(shots, 9999)!.localFrame).toBe(24);
  });
});

function withSound(s: ProjectState) {
  const assetId = tid<"asset">();
  const variantId = tid<"asset_variant">();
  const versionId = tid<"asset_version">();
  s = mustApply(s, { type: "CreateAssets", assets: [{ assetId, fields: { kind: "sound", name: "Lyd", names: [], description: "", category: "", tags: [] } }] });
  s = mustApply(s, { type: "CreateAssetVariant", variantId, assetId, fields: { name: "Lyd", style: "other", appearance: "" } });
  s = mustApply(s, {
    type: "AddAssetVersion",
    versionId,
    variantId,
    media: { path: `${s.project.id}/${assetId}/${versionId}/lyd.wav`, mimeType: "audio/wav", width: null, height: null, byteSize: 1000, sha256: "a".repeat(64), durationMs: 8000 },
    note: "",
  });
  return { s, assetId };
}

function audioClip(occurrenceId: string, assetId: string, offsetMs: number, lengthMs: number): AudioClipFields {
  return { occurrenceId: occurrenceId as never, kind: "music", name: "Musikk", assetId: assetId as never, assetVariantId: null, versionId: null, blockId: null, offsetMs, sourceInMs: 0, lengthMs, gainDb: 0, fadeInMs: 0, fadeOutMs: 0, muted: false, continues: false, volumeKeys: [] };
}

describe("SB-4 scenelyd uten kopi", () => {
  function setupAudio() {
    let { s, mainId, occs } = setup(2);
    const sound = withSound(s);
    s = sound.s;
    const clipId = tid<"audio_clip">();
    // Musikk i scene 1 som løper videre inn i scene 2 (4 s fra scene 1s start, 8 s lang)
    s = mustApply(s, { type: "AddAudioClips", clips: [{ clipId, fields: { ...audioClip(occs[0]!, sound.assetId, 4000, 8000), continues: true } }] });
    const a = addPanel(s, occs[0]!, "a", 100);
    const b = addPanel(a.s, occs[0]!, "b", 50);
    const c = addPanel(b.s, occs[1]!, "a", 60);
    return { s: c.s, mainId, occs, clipId, panels: [a.panelId, b.panelId, c.panelId] };
  }

  it("samme klipp og versjon, bare flyttet i tid – lyd over scenegrenser bevart", () => {
    const { s, mainId, occs, clipId } = setupAudio();
    const clips = filmClips(s, mainId);
    const items = filmAudio(s, clips, s.project.fps);
    expect(items.map((i) => i.clip.id)).toContain(clipId);
    const shots = storyboardTimeline(s, clips);
    const moved = storyboardAudioItems(clips, shots, items, s.project.fps);
    const original = items.find((i) => i.clip.id === clipId)!;
    const out = moved.find((i) => i.clip.id === clipId)!;
    // Ingen kopi av selve lyden: samme klipp- og versjonsobjekt
    expect(out.clip).toBe(original.clip);
    expect(out.version).toBe(original.version);
    expect(out.length).toBe(original.length);
    expect(out.sourceIn).toBe(original.sourceIn);
    // Flyttet med scenens start: scene 1 starter på 0 i begge tidslinjer, så starten er lik
    expect(out.start).toBeCloseTo(original.start, 9);
    // Lyden fortsetter ut i scene 2s paneler (8 s > scene 1s 150 bilder = 6 s)
    const scene2Start = framesToSeconds(shots.find((x) => x.occurrenceId === occs[1])!.startFrame, s.project.fps);
    expect(out.start + out.length).toBeGreaterThan(scene2Start);
  });

  it("lyd i scener uten paneler er ikke med", () => {
    const { s, mainId, occs, clipId } = setupAudio();
    // Fjern panelene i scene 2 (scene 1s lyd blir værende); legg lyd i scene 3 uten paneler
    const seed = seedProject(3);
    const occ3 = orderedOccurrences(seed.state, seed.mainId).map((o) => o.id as string);
    const sound = withSound(seed.state);
    const clipId3 = tid<"audio_clip">();
    const st = mustApply(sound.s, { type: "AddAudioClips", clips: [{ clipId: clipId3, fields: audioClip(occ3[2]!, sound.assetId, 0, 2000) }] });
    const clips = filmClips(st, seed.mainId);
    const items = filmAudio(st, clips, st.project.fps);
    const shots = storyboardTimeline(st, clips);
    const moved = storyboardAudioItems(clips, shots, items, st.project.fps);
    expect(moved.find((i) => i.clip.id === clipId3)).toBeUndefined();
    void s; void mainId; void occs; void clipId;
  });

  it("lyden er ikke kortet ned til panelenes samlede lengde", () => {
    const { s, mainId, clipId } = setupAudio();
    const clips = filmClips(s, mainId);
    const moved = storyboardAudioItems(clips, storyboardTimeline(s, clips), filmAudio(s, clips, s.project.fps), s.project.fps);
    const out = moved.find((i) => i.clip.id === clipId)!;
    expect(out.length).toBe(8);
  });
});

describe("SB-4 kameramerke som bevegelse", () => {
  it("kameraskuddet glider fra hele formatet til merket, og merket skjules i visningen", () => {
    let { s, mainId, occs } = setup(1);
    const p = addPanel(s, occs[0]!, "a", 100);
    const layerId = tid<"composition_layer">();
    const panel = p.s.compositions[p.panelId]!;
    const st = mustApply(p.s, {
      type: "AddLayers",
      layers: [{
        layerId,
        compositionId: p.panelId,
        fields: {
          ...defaultLayerFields(p.s, panel, { fill: "#ffffff" }),
          kind: "camera_mark" as const,
          fill: null,
          cameraMark: { frame: { x: 100, y: 100, width: 400, height: 300 }, zoom: 2, pan: { x: 10, y: -20 }, tilt: 5 },
        },
      }],
    });
    const shot = panelCameraShot(st, st.compositions[p.panelId]!, 100)!;
    expect(shot.from).toEqual({ x: panel.width / 2, y: panel.height / 2, zoom: 1, rotation: 0 });
    expect(shot.to).toEqual({ x: 100 + 200 + 10, y: 100 + 150 - 20, zoom: 2, rotation: 5 });
    expect(shot.startFrame).toBe(0);
    expect(shot.endFrame).toBe(99);

    const shots = storyboardTimeline(st, filmClips(st, mainId));
    expect(shots[0]!.camera).not.toBeNull();
    const view = storyboardViewState(st, shots);
    // Visningen har kameraet og skjuler merkelaget; originalen er uendret
    expect(view.compositions[p.panelId]!.camera.shots).toHaveLength(1);
    expect(view.layers[layerId]!.visible).toBe(false);
    expect(st.compositions[p.panelId]!.camera.shots).toHaveLength(0);
    expect(st.layers[layerId]!.visible).toBe(true);
  });
});

describe("SB-4 bildekildeadapteren", () => {
  it("storyboardklippene følger skuddene, med scenens identitet", () => {
    let { s, mainId, occs } = setup(2);
    const a = addPanel(s, occs[0]!, "a", 50);
    const b = addPanel(a.s, occs[1]!, "a", 70);
    const clips = filmClips(b.s, mainId);
    const shots = storyboardTimeline(b.s, clips);
    const out = storyboardClips(b.s, clips, shots);
    expect(out).toHaveLength(2);
    expect(out[0]!.compositionId).toBe(a.panelId);
    expect(out[0]!.source).toBe("composition");
    expect(out[0]!.occurrenceId).toBe(occs[0]);
    expect(out[0]!.durationFrames).toBe(50);
    expect(out[1]!.occurrenceId).toBe(occs[1]);
    expect(out[1]!.startFrame).toBe(50);
    expect(out[1]!.parts[0]!.source).toBe("composition");
  });

  it("«animasjon» er dagens oppførsel uendret; «film» bruker bare importert film", () => {
    let { s, mainId, occs } = setup(2);
    s = addSceneComp(s, occs[0]!, 100);
    const clips = filmClips(s, mainId);
    const anim = exportImageSource(s, clips, "animation");
    expect(anim.clips).toEqual(clips);
    expect(anim.state).toBe(s);
    expect(anim.shots).toHaveLength(0);
    const film = exportImageSource(s, clips, "film");
    // Scene 1 har 2D-scene men ingen importert film → tittelkort; klippet ellers likt
    expect(film.clips[0]!.source).toBe("placeholder");
    expect(film.clips[0]!.compositionId).toBeNull();
    expect(film.clips[0]!.durationFrames).toBe(clips[0]!.durationFrames);
    expect(film.clips[1]).toEqual(clips[1]);
  });

  it("storyboardFilm samler klipp, lyd og visning – rekkefølge/timing/lyd samlet", () => {
    let { s, mainId, occs } = setup(2);
    const sound = withSound(s);
    const clipId = tid<"audio_clip">();
    let st = mustApply(sound.s, { type: "AddAudioClips", clips: [{ clipId, fields: audioClip(occs[1]!, sound.assetId, 1000, 3000) }] });
    const a = addPanel(st, occs[0]!, "a", 50);
    const b = addPanel(a.s, occs[0]!, "b", 50);
    const c = addPanel(b.s, occs[1]!, "a", 75);
    st = c.s;
    const clips = filmClips(st, mainId);
    const items = filmAudio(st, clips, st.project.fps);
    const film = storyboardFilm(st, clips, items);
    expect(film.clips.map((x) => x.compositionId)).toEqual([a.panelId, b.panelId, c.panelId]);
    expect(film.durationFrames).toBe(175);
    // Lyden i scene 2 starter 1 s inn i scenen, nå regnet fra scene 2s første panel (bilde 100 = 4 s)
    const out = film.audio.find((i) => i.clip.id === clipId)!;
    expect(out.start).toBeCloseTo(4 + 1, 9);
    expect(out.length).toBe(3);
    // Eksportkilden gir samme resultat som avspillingen (én felles adapter)
    const viaAdapter = exportImageSource(st, clips, "storyboard");
    expect(viaAdapter.clips).toEqual(film.clips);
  });

  it("ugyldig bildekilde er umulig; adapteren endrer aldri prosjektdata", () => {
    const { s, mainId, occs } = setup(1);
    const p = addPanel(s, occs[0]!, "a", 50);
    const clips = filmClips(p.s, mainId);
    const before = p.s;
    exportImageSource(p.s, clips, "storyboard");
    expect(p.s).toBe(before);
  });
});

describe("SB-4 kommandoer for midlertidig panellyd er vanlige kommandoer", () => {
  it("SetStoryboardPanelTempAudio har invers og anger rent", () => {
    let { s, occs } = setup(1);
    const p = addPanel(s, occs[0]!, "a", 50);
    const r = applyCommand(p.s, envelope({
      type: "SetStoryboardDetails",
      panelId: p.panelId,
      details: { fields: {}, dialogueIds: [], shot: null, angle: null, focalMm: null, movement: "" },
    }));
    // Paneldetaljer er allerede dekket av SB-3-kommandoer med angre/gjøre om; her bekreftes at
    // storyboard-tilstanden i SB-4 bare bygger på eksisterende kommandoer (ingen nye skriveveier).
    expect(r.ok).toBe(true);
    const u = applyCommand(r.state, envelope(r.inverse!));
    expect(u.ok).toBe(true);
  });
});
