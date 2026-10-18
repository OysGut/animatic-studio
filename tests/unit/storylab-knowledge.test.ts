// @vitest-environment node
/** Story Lab (SL1): hva karakteren vet og hvordan profilen er, i fortellingstid (ikke filmrekkefølge). */
import { describe, expect, it } from "vitest";
import {
  emptyStoryProfile,
  knowledgeAt,
  mainProduction,
  orderedOccurrences,
  profileAt,
  storyTimeFor,
  storyTimes,
  type AssetId,
  type ProjectState,
  type SceneId,
} from "@/core";
import { mustApply, tid } from "../helpers/fixtures";
import { fixture } from "../visual/fixture-state";

const s0 = fixture.state;
const occs = orderedOccurrences(s0, mainProduction(s0)!.id);
const scene = (i: number) => occs[i]!.sceneId as SceneId;
const chars = Object.values(s0.assets).filter((a) => a.kind === "character");
const maja = chars[0]!.id as AssetId;
const anne = chars[1]!.id as AssetId;

/** Den siste scenen i filmen blir et tilbakeblikk til før scene 2 (fortellingstid). */
function withFlashback(): { s: ProjectState; flash: SceneId } {
  const flash = scene(occs.length - 1);
  const s = mustApply(s0, {
    type: "SetStoryTime",
    sceneId: flash,
    storyTime: storyTimeFor("flashback", scene(1), "before"),
  } as never);
  return { s, flash };
}

function addFact(
  s: ProjectState,
  text: string,
  atSceneId: SceneId | null,
  knownBy: { assetId: AssetId; fromSceneId: SceneId | null }[],
  kind: "fact" | "secret" = "fact",
) {
  return mustApply(s, {
    type: "AddStoryFact",
    factId: tid(),
    fields: { text, kind, atSceneId, knownBy },
  } as never);
}

describe("knowledgeAt", () => {
  it("et tilbakeblikk sent i filmen kjenner ikke til det som skjer senere i fortellingen", () => {
    const { s: s1, flash } = withFlashback();
    const t = storyTimes(s1);
    expect(t.get(flash)!).toBeLessThan(t.get(scene(2))!);
    // Hendelsen skjer i scene 3 (i filmen før tilbakeblikket, men senere i fortellingen)
    const s = addFact(s1, "Bestemor har solgt huset", scene(2), [{ assetId: maja, fromSceneId: null }]);
    expect(knowledgeAt(s, maja, scene(3)).facts.map((f) => f.text)).toEqual(["Bestemor har solgt huset"]);
    expect(knowledgeAt(s, maja, flash).facts).toEqual([]);
  });

  it("uten knownBy vet bare regissøren; andre karakterer vet ikke", () => {
    let s = addFact(s0, "Regissørens hemmelighet", null, []);
    s = addFact(s, "Bare Anne vet", null, [{ assetId: anne, fromSceneId: null }]);
    expect(knowledgeAt(s, maja, scene(3)).facts).toEqual([]);
    expect(knowledgeAt(s, anne, scene(3)).facts.map((f) => f.text)).toEqual(["Bare Anne vet"]);
  });

  it("fromSceneId: karakteren får vite det først fra den scenen", () => {
    const s = addFact(s0, "Brevet er funnet", scene(0), [{ assetId: maja, fromSceneId: scene(2) }]);
    expect(knowledgeAt(s, maja, scene(1)).facts).toEqual([]);
    expect(knowledgeAt(s, maja, scene(2)).facts).toHaveLength(1);
  });

  it("egne hemmeligheter kommer for seg; fjernede fakta er borte", () => {
    let s = addFact(s0, "Maja har knust vasen", null, [{ assetId: maja, fromSceneId: null }], "secret");
    const k = knowledgeAt(s, maja, scene(0));
    expect(k.ownSecrets.map((f) => f.text)).toEqual(["Maja har knust vasen"]);
    expect(k.facts).toEqual([]);
    s = mustApply(s, { type: "RemoveStoryFact", factId: k.ownSecrets[0]!.id, removed: true } as never);
    expect(knowledgeAt(s, maja, scene(0)).ownSecrets).toEqual([]);
  });
});

describe("profileAt", () => {
  const base = { ...emptyStoryProfile(), notes: "grunn" };
  const withProfile = (s: ProjectState) =>
    mustApply(s, { type: "SetStoryProfile", profileId: tid(), assetId: maja, profile: base } as never);

  it("slår sammen stadiene i fortellingstid, også med tilbakeblikk", () => {
    const { s: s1, flash } = withFlashback();
    let s = withProfile(s1);
    s = mustApply(s, {
      type: "AddStoryProfileStage",
      stageId: tid(),
      assetId: maja,
      fromSceneId: scene(2),
      patch: { speech: { mood: "bitter" } },
    } as never);
    s = mustApply(s, {
      type: "AddStoryProfileStage",
      stageId: tid(),
      assetId: maja,
      fromSceneId: scene(3),
      patch: { speech: { mood: "forsonet" }, notes: "etter" },
    } as never);
    expect(profileAt(s, maja, scene(0))!.speech.mood).toBe("");
    expect(profileAt(s, maja, scene(2))!.speech.mood).toBe("bitter");
    expect(profileAt(s, maja, scene(3))!).toMatchObject({ notes: "etter", speech: { mood: "forsonet", level: "adult" } });
    // Tilbakeblikket kommer sist i filmen, men før scene 2 i fortellingen
    expect(profileAt(s, maja, flash)!.speech.mood).toBe("");
    expect(profileAt(s, maja, null)!.notes).toBe("grunn");
  });

  it("fjernet profil gir null, og angring henter den tilbake med stadiene urørt", () => {
    let s = withProfile(s0);
    const p = Object.values(s.storyProfiles)[0]!;
    s = mustApply(s, {
      type: "AddStoryProfileStage",
      stageId: tid(),
      assetId: maja,
      fromSceneId: scene(1),
      patch: { notes: "stadium" },
    } as never);
    s = mustApply(s, { type: "RemoveStoryProfile", profileId: p.id, removed: true } as never);
    expect(profileAt(s, maja, scene(2))).toBeNull();
    expect(Object.values(s.storyProfileStages).every((g) => !g.removed)).toBe(true);
    s = mustApply(s, { type: "RemoveStoryProfile", profileId: p.id, removed: false } as never);
    expect(profileAt(s, maja, scene(2))!.notes).toBe("stadium");
  });
});
