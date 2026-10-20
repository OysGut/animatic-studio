// @vitest-environment node
/** M6 resten: prognose fra historikk, kontekstuell kobling og ikke-destruktiv AI-oppdatering. */
import { describe, expect, it } from "vitest";
import {
  applyCommand,
  blocksOfVariant,
  contextLinkCommands,
  contextLinkSuggestions,
  contextLinksFromJson,
  contextLinkAssessmentsFromJson,
  contextLinkDefaultSelected,
  durationForecast,
  estimateProduction,
  filmClips,
  FORECAST_MIN_FINISHED_SCENES,
  mainProduction,
  materialUpdateFromJson,
  materialUpdateTargets,
  orderedOccurrences,
  shotSuggestionNote,
  speechRates,
  useVersionOnLayerCommand,
  type ProjectState,
  type SpeechSample,
} from "@/core";
import { mustApply, seedProject } from "../helpers/fixtures";
import { fixture } from "../visual/fixture-state";

describe("varighetsprognose fra historikk", () => {
  it("lite data: faller tilbake på standardantakelsene og gir samme tall som anslaget", () => {
    const { state, mainId } = seedProject();
    const f = durationForecast(state, mainId);
    const e = estimateProduction(state, mainId);
    expect(f.fallback).toBe(true);
    expect(f.basedOnScenes).toBe(0);
    expect(f.ratio).toBe(1);
    expect(f.seconds).toBe(e.activeSeconds);
    expect(f.lowSeconds).toBeLessThanOrEqual(f.seconds);
    expect(f.highSeconds).toBeGreaterThanOrEqual(f.seconds);
  });

  it("talehastighet per karakter krever minst to replikker, prosjektets minst fem", () => {
    const x = (characterId: string, words: number, seconds: number): SpeechSample => ({ characterId, language: "nb", words, seconds });
    const one = speechRates([x("a", 10, 4)]);
    expect(one.size).toBe(0);
    const r = speechRates([x("a", 10, 4), x("a", 10, 6), x("b", 6, 2), x("b", 6, 2), x("b", 6, 2)]);
    expect(r.get("a|nb")!.wordsPerMinute).toBe(120);
    expect(r.get("b|nb")!.wordsPerMinute).toBe(180);
    expect(r.get("*|nb")!.lines).toBe(5);
  });

  it("ferdige scener gir forholdet faktisk/anslått; prognosen endrer ikke tilstanden", () => {
    const s0 = fixture.state;
    const main = mainProduction(s0)!;
    const clips = filmClips(s0, main.id);
    const finished = clips.filter((c) => c.durationKind === "film" || c.durationKind === "set");
    const f = durationForecast(s0, main.id);
    const before = JSON.stringify(s0);
    expect(f.basedOnScenes).toBe(finished.filter((c) => s0.occurrences[c.occurrenceId]?.active).length);
    if (f.basedOnScenes < FORECAST_MIN_FINISHED_SCENES) expect(f.ratio).toBe(1);
    // Faktiske scener har ingen usikkerhet
    for (const sc of f.scenes.filter((x) => x.actual)) expect(sc.lowSeconds).toBe(sc.highSeconds);
    expect(JSON.stringify(s0)).toBe(before);
  });

  it("med nok ferdige scener skaleres de øvrige med medianforholdet", () => {
    const { state, mainId } = seedProject();
    const occs = orderedOccurrences(state, mainId);
    expect(occs.length).toBeGreaterThanOrEqual(1);
    // Simulerer tre ferdige scener som er dobbelt så lange som anslaget
    const base = estimateProduction(state, mainId).scenes;
    let s: ProjectState = state;
    const fps = state.project.fps;
    const extra: Record<string, unknown> = {};
    const scenes = base.slice(0, 3);
    expect(scenes.length).toBe(3);
    for (const sc of scenes) {
      const o = state.occurrences[sc.occurrenceId]!;
      const id = `00000000-0000-7000-8000-0000000c${String(Object.keys(extra).length).padStart(4, "0")}`;
      extra[id] = {
        id, variantId: o.variantId, name: "c", width: 1920, height: 1080,
        durationFrames: Math.round((sc.seconds * 2 * fps.num) / fps.den), background: "#000",
        camera: (Object.values(fixture.state.compositions)[0] as { camera: unknown } | undefined)?.camera ?? null,
        removed: false, revision: 1,
      };
    }
    s = { ...s, compositions: { ...s.compositions, ...(extra as ProjectState["compositions"]) } };
    const f = durationForecast(s, mainId);
    expect(f.basedOnScenes).toBe(3);
    expect(f.ratio).toBeGreaterThan(1.8);
    expect(f.fallback).toBe(false);
    // Scener uten ferdig materiale skaleres og får et spenn
    const rest = f.scenes.filter((x) => !x.actual);
    for (const r of rest) expect(r.highSeconds).toBeGreaterThan(r.lowSeconds);
  });
});

describe("kontekstuell kobling av betegnelser", () => {
  const s0 = fixture.state;
  const main = mainProduction(s0)!;

  it("bare sikre regler er forhåndsvalgt; AI med 92 prosent og manuelt mål krever kryss", () => {
    const item = { key: "b:hun", occurrenceId: "o", blockId: "b", word: "Hun", assetId: "a", confidence: "sure" as const, rule: "present" as const, candidates: ["a", "b"] };
    expect(contextLinkDefaultSelected(item, false, false)).toBe(true);
    expect(contextLinkDefaultSelected(item, true, false)).toBe(false);
    expect(contextLinkDefaultSelected(item, false, true)).toBe(false);
    expect(contextLinkDefaultSelected({ ...item, confidence: "uncertain" }, false, false)).toBe(false);
    const result = contextLinkAssessmentsFromJson({ links: [{ key: item.key, assetId: "b", confidence: 0.92 }] }, [item]);
    expect(result.get(item.key)).toEqual({ assetId: "b", confidence: 0.92 });
  });

  it("manglende og ugyldig AI-sikkerhet blir ukjent, ikke et oppdiktet prosenttall", () => {
    const item = { key: "b:hun", occurrenceId: "o", blockId: "b", word: "Hun", assetId: "a", confidence: "uncertain" as const, rule: "pronoun" as const, candidates: ["a"] };
    for (const confidence of [undefined, -1, 1.2, NaN, "92 %"])
      expect(contextLinkAssessmentsFromJson({ links: [{ key: item.key, assetId: "a", confidence }] }, [item]).get(item.key)?.confidence).toBeNull();
  });

  it("tvetydig alias avgjøres av hvem som er til stede, og forslaget blir én SetContextNames som kan angres", () => {
    const occ = orderedOccurrences(s0, main.id).find((o) => o.active && blocksOfVariant(s0, o.variantId).some((b) => b.kind === "action"))!;
    const action = blocksOfVariant(s0, occ.variantId).find((b) => b.kind === "action")!;
    // To ressurser får aliaset «gamla»; bare den ene er i scenen (snakker der)
    const speakerBlock = blocksOfVariant(s0, occ.variantId).find((b) => b.kind === "character");
    const persons = Object.values(s0.assets).filter((a) => !a.removed && a.kind === "character");
    const present = speakerBlock
      ? persons.find((a) => a.name.toUpperCase().startsWith(speakerBlock.text.trim().split(" ")[0]!.toUpperCase()))
      : undefined;
    expect(present).toBeDefined();
    if (!present) return;
    const absent = persons.find((a) => a.id !== present.id && !blocksOfVariant(s0, occ.variantId).some((b) => b.text.toUpperCase().includes(a.name.toUpperCase())));
    expect(absent).toBeDefined();
    if (!absent) return;
    let s = s0;
    for (const a of [present, absent])
      s = { ...s, assets: { ...s.assets, [a.id]: { ...s.assets[a.id]!, names: [...s.assets[a.id]!.names, { name: "gamla", kind: "alias", language: null } as never] } } };
    s = mustApply(s, { type: "EditBlockText", productionId: main.id, blockId: action.id, text: `${action.text} Gamla ser opp.` } as never);
    const sug = contextLinkSuggestions(s, main.id, occ.id).filter((x) => x.word.toLowerCase() === "gamla");
    expect(sug.length).toBe(1);
    expect(sug[0]!.assetId).toBe(present.id);
    expect(sug[0]!.confidence).toBe("sure");
    expect(sug[0]!.rule).toBe("present");
    const cmds = contextLinkCommands(s, sug);
    expect(cmds.length).toBe(1);
    expect((cmds[0] as { type: string }).type).toBe("SetContextNames");
    const r = applyCommand(s, { id: "00000000-0000-7000-8000-00000000f0f2" as never, actor: "00000000-0000-7000-8000-000000000001" as never, at: new Date().toISOString(), command: cmds[0]! });
    if (!r.ok) throw new Error(JSON.stringify(r.error));
    expect(r.state.assets[present.id]!.contextNames?.find((n) => n.name === "gamla")?.blockIds).toContain(action.id);
    // Etter kobling foreslås linjen ikke igjen
    expect(contextLinkSuggestions(r.state, main.id, occ.id).some((x) => x.key === sug[0]!.key)).toBe(false);
    // Angring fjerner koblingen
    const back = mustApply(r.state, r.inverse as never);
    expect(back.assets[present.id]!.contextNames ?? []).toEqual(s.assets[present.id]!.contextNames ?? []);
  });

  it("pronomen er alltid usikre, og AI-svar godtas bare for kjente nøkler og kandidater", () => {
    const items = [{ key: "b1:hun", occurrenceId: "o", blockId: "b1", word: "hun", assetId: "a1", confidence: "uncertain" as const, rule: "pronoun" as const, candidates: ["a1", "a2"] }];
    const m = contextLinksFromJson({ links: [{ key: "b1:hun", assetId: "a2" }, { key: "x", assetId: "a1" }] }, items);
    expect(m.get("b1:hun")).toBe("a2");
    expect(m.has("x")).toBe(false);
    const bad = contextLinksFromJson({ links: [{ key: "b1:hun", assetId: "evil" }] }, items);
    expect(bad.has("b1:hun")).toBe(false);
    for (const x of contextLinkSuggestions(s0, main.id)) if (x.rule === "pronoun") expect(x.confidence).toBe("uncertain");
  });
});

describe("AI-oppdatering ved avvik er ikke destruktiv", () => {
  const s0 = fixture.state;
  const main = mainProduction(s0)!;

  it("svaret valideres mot målene; ukjente ID-er forkastes", () => {
    const targets = { images: [{ layerId: "l", assetId: "a", variantId: "v", versionId: null, name: "A" }], dialogueCharacters: [], shots: [{ blockId: "b", oldText: "x", newText: "y" }] };
    const r = materialUpdateFromJson({ images: [{ assetId: "a", prompt: "p" }, { assetId: "z", prompt: "q" }], shots: [{ blockId: "b", text: "t" }, { blockId: "q", text: "t" }] }, targets)!;
    expect(r.images).toEqual([{ assetId: "a", prompt: "p" }]);
    expect(r.shots).toEqual([{ blockId: "b", text: "t" }]);
    expect(materialUpdateFromJson({ images: [{ assetId: "z", prompt: "q" }] }, targets)).toBeNull();
  });

  it("kommandoene endrer verken manus, film eller godkjente versjoner", () => {
    const occ = orderedOccurrences(s0, main.id).find((o) => o.active)!;
    const block = blocksOfVariant(s0, occ.variantId).find((b) => b.kind === "action")!;
    const note = shotSuggestionNote(s0, block.id, "Close-up", "00000000-0000-7000-8000-0000000a0001", "AI-forslag:", "Test")!;
    const s1 = mustApply(s0, note as never);
    expect(s1.blocks).toEqual(s0.blocks);
    expect(s1.takes).toEqual(s0.takes);
    expect(Object.values(s1.assetVariants).map((v) => v.approvedVersionId)).toEqual(Object.values(s0.assetVariants).map((v) => v.approvedVersionId));
    const t = materialUpdateTargets(s0, occ.id, [{ blockId: block.id, kind: "changed", blockKind: "action", oldText: "a", newText: block.text }]);
    expect(t.shots.map((x) => x.blockId)).toEqual([block.id]);
    // «Bruk i scenen» bytter bare bildet på laget; resten av lagets felt beholdes
    const layer = Object.values(s0.layers).find((l) => !l.removed && l.assetId)!;
    const cmd = useVersionOnLayerCommand(s0, layer.id, "v", "x") as unknown as { type: string; layers: { fields: Record<string, unknown> }[] };
    expect(cmd.type).toBe("UpdateLayers");
    expect(cmd.layers[0]!.fields["versionId"]).toBe("x");
    expect(cmd.layers[0]!.fields["kind"]).toBe(layer.kind);
    expect(cmd.layers[0]!.fields["assetId"]).toBe(layer.assetId);
    expect(useVersionOnLayerCommand(s0, "mangler", "v", "x")).toBeNull();
  });
});
