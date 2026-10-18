/**
 * MT6/MT7 (MOTION_TYPOGRAPHY_SPEC): scenetyper, sidelag, sideoverganger og rulletekst.
 * Invariant: tittel-, tekst- og rulletekstscener påvirker aldri manusnummerering, manuseksport eller
 * sceneidentiteter (produksjonsteknisk segmentering endrer ikke manusscenene).
 */
import { describe, expect, it } from "vitest";
import {
  CREDIT_PARTICIPANTS_MAX,
  applyCommand,
  creditDrawTexts,
  creditDurationFrames,
  creditLines,
  creditParticipantError,
  creditSequenceError,
  creditSequenceOf,
  defaultCreditSequence,
  emptyProjectState,
  isScriptOccurrence,
  mainSceneNumbers,
  occurrenceKind,
  scriptPages,
  scriptView,
  type Command,
  type CreditParticipant,
  type CreditSequence,
  type ProjectState,
  type SceneOccurrence,
} from "@/core";
import { envelope } from "../helpers/fixtures";

const run = (s: ProjectState, c: Command) => applyCommand(s, envelope(c));

function occ(partial: Partial<SceneOccurrence> & Pick<SceneOccurrence, "id">): SceneOccurrence {
  return {
    revision: 1,
    productionId: "p" as never,
    sceneId: `sc-${partial.id}` as never,
    variantId: `v-${partial.id}` as never,
    orderKey: partial.id,
    active: true,
    excerpt: null,
    activeTakeId: null,
    productionNumber: null,
    ...partial,
  };
}

function withOccurrences(...os: SceneOccurrence[]): ProjectState {
  const s = emptyProjectState({ id: "p" } as never);
  return {
    ...s,
    occurrences: Object.fromEntries(os.map((o) => [o.id, o])),
  };
}

describe("MT6: scenetyper og manusinvarianten", () => {
  it("tittel, tekstscene og rulletekst er ikke manusscener", () => {
    const s = withOccurrences(
      occ({ id: "a" as never }),
      occ({ id: "b" as never, kind: "title" }),
      occ({ id: "c" as never, kind: "text" }),
      occ({ id: "d" as never, kind: "credits" }),
    );
    expect(occurrenceKind(s.occurrences["a"]!)).toBe("scene");
    expect(isScriptOccurrence(s.occurrences["b"]!)).toBe(false);
    const view = scriptView(s, "p");
    // Markøren er med i visningen, men uten nummer og blokker
    expect(view.map((v) => v.occurrenceId)).toEqual(["a", "b", "c", "d"]);
    expect(view.find((v) => v.occurrenceId === "b")?.marker).toBe("title");
    expect(view.find((v) => v.occurrenceId === "b")?.blocks).toEqual([]);
    // Bare manusscenen nummereres
    expect(mainSceneNumbers(s).size).toBe(1);
    // Manussidene viser markøren, ikke sceneblokker
    const pages = scriptPages(s, "p");
    const all = pages.pages.flatMap((pg) => pg.lines.map((l) => l.text)).join(" ");
    expect(all).toContain("[FILMTITTEL]");
    expect(all).toContain("[MELLOMTEKST]");
    expect(all).toContain("[RULLETEKST]");
  });

  it("AddOccurrence tar scenetypen, og angre beholder den", () => {
    const s = withOccurrences();
    const r = run(s, {
      type: "AddOccurrence",
      productionId: "p" as never,
      occurrenceId: "t1" as never,
      sceneId: "sc-t1" as never,
      variantId: "v-t1" as never,
      orderKey: "a",
      kind: "title",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(occurrenceKind(r.state.occurrences["t1"]!)).toBe("title");
    const back = applyCommand(r.state, envelope(r.inverse));
    expect(back.ok).toBe(true);
    if (back.ok) expect(back.state.occurrences["t1"]).toBeUndefined();
  });

  it("ugyldig scenetype avvises", () => {
    const s = withOccurrences();
    const r = run(s, {
      type: "AddOccurrence",
      productionId: "p" as never,
      occurrenceId: "t1" as never,
      sceneId: "sc-t1" as never,
      variantId: "v-t1" as never,
      orderKey: "a",
      kind: "bogus" as never,
    });
    expect(r.ok).toBe(false);
  });
});

describe("MT7: rulletekst", () => {
  const participant = (
    id: string,
    orderKey: string,
    fields: Record<string, string>,
    hidden = false,
  ): CreditParticipant => ({
    id: id as never,
    revision: 1,
    orderKey,
    groupKey: "g",
    hidden,
    fields,
    removed: false,
  });
  const seq: CreditSequence = {
    ...defaultCreditSequence("q" as never, "d" as never),
    revision: 1,
  };

  it("rekkefølge og skjuling endrer ikke malen, og skjulte deltakere tegnes ikke", () => {
    const s: ProjectState = {
      ...withOccurrences(occ({ id: "d" as never, kind: "credits" })),
      creditParticipants: {
        a: participant("a", "b", { navn: "Per" }),
        b: participant("b", "a", { navn: "Kari" }),
        c: participant("c", "c", { navn: "Skjult" }, true),
      },
      creditSequences: { q: seq },
    };
    const lines = creditLines(s);
    expect(lines.map((l) => l.participantId)).toEqual(["b", "a"]);
    expect(creditSequenceOf(s, "d")?.id).toBe("q");
  });

  it("roll tegner bare det som er synlige i bildet (virtuell tegning, §63)", () => {
    const parts: Record<string, CreditParticipant> = {};
    for (let i = 0; i < CREDIT_PARTICIPANTS_MAX; i++)
      parts[`p${i}`] = participant(`p${i}`, `k${String(i).padStart(6, "0")}`, { navn: `Navn ${i}` });
    const s: ProjectState = {
      ...withOccurrences(occ({ id: "d" as never, kind: "credits" })),
      creditParticipants: parts,
      creditSequences: { q: seq },
    };
    const t0 = performance.now();
    const texts = creditDrawTexts(s, seq, 100, 1920, 1080);
    const ms = performance.now() - t0;
    // 2000 deltakere: bare en håndfull linjer er i bildet, og beregningen er rask
    expect(texts.length).toBeLessThan(40);
    expect(texts.length).toBeGreaterThan(0);
    expect(ms).toBeLessThan(500);
    expect(creditDurationFrames(s, seq, 1080)).toBeGreaterThan(1000);
  });

  it("one_at_a_time viser én deltaker om gangen med pause", () => {
    const s: ProjectState = {
      ...withOccurrences(occ({ id: "d" as never, kind: "credits" })),
      creditParticipants: {
        a: participant("a", "a", { navn: "Per" }),
        b: participant("b", "b", { navn: "Kari" }),
      },
      creditSequences: {
        q: { ...seq, presentation: "one_at_a_time", durationFrames: 10, pauseFrames: 5 },
      },
    };
    const q = s.creditSequences["q"]!;
    expect(creditDrawTexts(s, q, 0, 1920, 1080)[0]?.text).toBe("Per");
    expect(creditDrawTexts(s, q, 12, 1920, 1080)).toEqual([]); // pausen
    expect(creditDrawTexts(s, q, 15, 1920, 1080)[0]?.text).toBe("Kari");
  });

  it("valideringen avviser ugyldige verdier", () => {
    expect(creditParticipantError({ orderKey: "", groupKey: "", fields: {} })).not.toBeNull();
    expect(
      creditParticipantError({ orderKey: "a", groupKey: "", fields: { navn: "x".repeat(501) } }),
    ).not.toBeNull();
    expect(
      creditSequenceError({
        presentation: "bogus" as never,
        durationFrames: 1,
        pauseFrames: 0,
        speed: 1,
        direction: "up",
      }),
    ).not.toBeNull();
    expect(
      creditSequenceError({
        presentation: "roll",
        durationFrames: 0,
        pauseFrames: 0,
        speed: 1,
        direction: "up",
      }),
    ).not.toBeNull();
    expect(
      creditSequenceError({
        presentation: "roll",
        durationFrames: 1,
        pauseFrames: 0,
        speed: 4,
        direction: "up",
      }),
    ).toBeNull();
  });

  it("kommandoene: legg til, endre, fjern – med angre og gjør om", () => {
    const s0: ProjectState = withOccurrences(occ({ id: "d" as never, kind: "credits" }));
    const add = run(s0, {
      type: "AddCreditParticipant",
      participantId: "a" as never,
      fields: { orderKey: "a", groupKey: "", hidden: false, fields: { navn: "Per" } },
    });
    expect(add.ok).toBe(true);
    if (!add.ok) return;
    expect(add.state.creditParticipants["a"]?.fields["navn"]).toBe("Per");
    const upd = run(add.state, {
      type: "UpdateCreditParticipant",
      participantId: "a" as never,
      fields: { fields: { navn: "Petter" } },
    });
    expect(upd.ok).toBe(true);
    if (!upd.ok) return;
    expect(upd.state.creditParticipants["a"]?.fields["navn"]).toBe("Petter");
    // Angre endringen
    const back = applyCommand(upd.state, envelope(upd.inverse));
    expect(back.ok && back.state.creditParticipants["a"]?.fields["navn"]).toBe("Per");
    // Fjern og angre
    const rm = run(upd.state, { type: "RemoveCreditParticipant", participantId: "a" as never });
    expect(rm.ok && rm.state.creditParticipants["a"]?.removed).toBe(true);
    if (rm.ok) {
      const back2 = applyCommand(rm.state, envelope(rm.inverse));
      expect(back2.ok && back2.state.creditParticipants["a"]?.removed).toBe(false);
    }
  });

  it("SetCreditSequence krever en rulletekstforekomst", () => {
    const fields = { presentation: "roll" as const, durationFrames: 96, pauseFrames: 12, speed: 4, direction: "up" as const };
    const r = run(withOccurrences(occ({ id: "d" as never })), {
      type: "SetCreditSequence",
      sequenceId: "q" as never,
      occurrenceId: "d" as never,
      fields,
    });
    expect(r.ok).toBe(false);
    const r2 = run(withOccurrences(occ({ id: "d" as never, kind: "credits" })), {
      type: "SetCreditSequence",
      sequenceId: "q" as never,
      occurrenceId: "d" as never,
      fields,
    });
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    expect(r2.state.creditSequences["q"]?.presentation).toBe("roll");
    // Angre av opprettelsen fjerner sekvensen
    const back = applyCommand(r2.state, envelope(r2.inverse));
    expect(back.ok && back.state.creditSequences["q"]?.removed).toBe(true);
  });
});

describe("MT8: eksportfilteret for rulletekst", () => {
  it("SetExportSettings bevarer includeCredits (på som standard)", () => {
    const s = withOccurrences();
    const p = {
      ...s.project,
      exportSettings: {
        size: "full" as const,
        monochrome: false,
        output: "video" as const,
        includeCredits: false,
      },
    };
    const s2 = { ...s, project: p };
    const r = run(s2, {
      type: "SetExportSettings",
      productionId: "p" as never,
      settings: { size: "half", monochrome: false, output: "video" },
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.state.productions["p"]?.exportSettings?.includeCredits).toBe(false);
  });
});
