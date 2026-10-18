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
  isScriptOccurrence,
  mainSceneNumbers,
  occurrenceKind,
  orderedOccurrences,
  scriptPages,
  scriptView,
  type Command,
  type CreditParticipant,
  type CreditSequence,
  type ProjectState,
} from "@/core";
import { envelope, mustApply, seedProject, tid } from "../helpers/fixtures";
import { keyBetween } from "@/core";

const run = (s: ProjectState, c: Command) => applyCommand(s, envelope(c));

/** Et prosjekt med to manusscener, der forekomst d er en rulletekstforekomst. */
function seeded() {
  const { state, mainId } = seedProject(2);
  const base = orderedOccurrences(state, mainId)[0]!;
  return { state, mainId, base };
}

function addKind(
  s: ProjectState,
  mainId: string,
  base: { sceneId: string; variantId: string },
  kind: "title" | "text" | "credits",
) {
  const id = tid<"scene_occurrence">();
  const r = mustApply(s, {
    type: "AddOccurrence",
    productionId: mainId as never,
    occurrenceId: id,
    sceneId: base.sceneId as never,
    variantId: base.variantId as never,
    orderKey: keyBetween(orderedOccurrences(s, mainId).at(-1)!.orderKey, null),
    kind,
  });
  return { state: r, id };
}

describe("MT6: scenetyper og manusinvarianten", () => {
  it("tittel, tekstscene og rulletekst er ikke manusscener", () => {
    const { state: s0, mainId, base } = seeded();
    const before = mainSceneNumbers(s0);
    let s = s0;
    const ids: string[] = [];
    for (const kind of ["title", "text", "credits"] as const) {
      const r = addKind(s, mainId, base, kind);
      s = r.state;
      ids.push(r.id);
    }
    const [titleId, textId, creditsId] = ids as [string, string, string];
    expect(occurrenceKind(s.occurrences[titleId]!)).toBe("title");
    expect(isScriptOccurrence(s.occurrences[titleId]!)).toBe(false);
    // Markørene er med i visningen, men uten nummer og blokker
    const view = scriptView(s, mainId);
    expect(view.map((v) => v.occurrenceId)).toContain(titleId);
    expect(view.find((v) => v.occurrenceId === titleId)?.marker).toBe("title");
    expect(view.find((v) => v.occurrenceId === titleId)?.blocks).toEqual([]);
    // Nummereringen av manusscenene er uendret
    expect(mainSceneNumbers(s)).toEqual(before);
    // Manussidene viser markørene, ikke sceneblokker
    const pages = scriptPages(s, mainId);
    const all = pages.pages.flatMap((pg) => pg.lines.map((l) => l.text)).join(" ");
    expect(all).toContain("[FILMTITTEL]");
    expect(all).toContain("[MELLOMTEKST]");
    expect(all).toContain("[RULLETEKST]");
    void textId;
    void creditsId;
  });

  it("AddOccurrence tar scenetypen, og angre beholder den", () => {
    const { state, mainId, base } = seeded();
    const id = tid<"scene_occurrence">();
    const r = run(state, {
      type: "AddOccurrence",
      productionId: mainId as never,
      occurrenceId: id,
      sceneId: base.sceneId as never,
      variantId: base.variantId as never,
      orderKey: keyBetween(orderedOccurrences(state, mainId).at(-1)!.orderKey, null),
      kind: "title",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(occurrenceKind(r.state.occurrences[id]!)).toBe("title");
    // Angre etter å ha lagt til én forekomst til av samme scene er lov (to forekomster finnes)
    const back = applyCommand(r.state, envelope(r.inverse));
    expect(back.ok).toBe(true);
    if (back.ok) expect(back.state.occurrences[id]).toBeUndefined();
  });

  it("ugyldig scenetype avvises", () => {
    const { state, mainId, base } = seeded();
    const r = run(state, {
      type: "AddOccurrence",
      productionId: mainId as never,
      occurrenceId: tid<"scene_occurrence">(),
      sceneId: base.sceneId as never,
      variantId: base.variantId as never,
      orderKey: keyBetween(orderedOccurrences(state, mainId).at(-1)!.orderKey, null),
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

  function withCredits() {
    const { state: s0, mainId, base } = seeded();
    const { state, id } = addKind(s0, mainId, base, "credits");
    const seq: CreditSequence = { ...defaultCreditSequence(tid<"credit_sequence">(), id), revision: 1 };
    return { state: { ...state, creditSequences: { [seq.id]: seq } }, occurrenceId: id, seq };
  }

  it("rekkefølge og skjuling endrer ikke malen, og skjulte deltakere tegnes ikke", () => {
    const { state, occurrenceId, seq } = withCredits();
    const s: ProjectState = {
      ...state,
      creditParticipants: {
        a: participant("a", "b", { navn: "Per" }),
        b: participant("b", "a", { navn: "Kari" }),
        c: participant("c", "c", { navn: "Skjult" }, true),
      },
    };
    const lines = creditLines(s);
    expect(lines.map((l) => l.participantId)).toEqual(["b", "a"]);
    expect(creditSequenceOf(s, occurrenceId)?.id).toBe(seq.id);
  });

  it("roll tegner bare det som er synlige i bildet (virtuell tegning, §63)", () => {
    const { state, seq } = withCredits();
    const parts: Record<string, CreditParticipant> = {};
    for (let i = 0; i < CREDIT_PARTICIPANTS_MAX; i++)
      parts[`p${i}`] = participant(`p${i}`, `k${String(i).padStart(6, "0")}`, { navn: `Navn ${i}` });
    const s: ProjectState = { ...state, creditParticipants: parts };
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
    const { state, seq } = withCredits();
    const q: CreditSequence = { ...seq, presentation: "one_at_a_time", durationFrames: 10, pauseFrames: 5 };
    const s: ProjectState = {
      ...state,
      creditParticipants: {
        a: participant("a", "a", { navn: "Per" }),
        b: participant("b", "b", { navn: "Kari" }),
      },
      creditSequences: { [q.id]: q },
    };
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
    const { state: s0 } = withCredits();
    const pid = tid<"credit_participant">();
    const add = run(s0, {
      type: "AddCreditParticipant",
      participantId: pid,
      fields: { orderKey: "a", groupKey: "", hidden: false, fields: { navn: "Per" } },
    });
    expect(add.ok).toBe(true);
    if (!add.ok) return;
    expect(add.state.creditParticipants[pid]?.fields["navn"]).toBe("Per");
    const upd = run(add.state, {
      type: "UpdateCreditParticipant",
      participantId: pid,
      fields: { fields: { navn: "Petter" } },
    });
    expect(upd.ok).toBe(true);
    if (!upd.ok) return;
    expect(upd.state.creditParticipants[pid]?.fields["navn"]).toBe("Petter");
    // Angre endringen
    const back = applyCommand(upd.state, envelope(upd.inverse));
    expect(back.ok && back.state.creditParticipants[pid]?.fields["navn"]).toBe("Per");
    // Fjern og angre
    const rm = run(upd.state, { type: "RemoveCreditParticipant", participantId: pid });
    expect(rm.ok && rm.state.creditParticipants[pid]?.removed).toBe(true);
    if (rm.ok) {
      const back2 = applyCommand(rm.state, envelope(rm.inverse));
      expect(back2.ok && back2.state.creditParticipants[pid]?.removed).toBe(false);
    }
  });

  it("SetCreditSequence krever en rulletekstforekomst", () => {
    const fields = { presentation: "roll" as const, durationFrames: 96, pauseFrames: 12, speed: 4, direction: "up" as const };
    const { state, mainId, base } = seeded();
    const r = run(state, {
      type: "SetCreditSequence",
      sequenceId: tid<"credit_sequence">() as never,
      occurrenceId: orderedOccurrences(state, mainId)[0]!.id,
      fields,
    });
    expect(r.ok).toBe(false);
    const { state: s2, id } = addKind(state, mainId, base, "credits");
    const qid = tid<"credit_sequence">();
    const r2 = run(s2, {
      type: "SetCreditSequence",
      sequenceId: qid as never,
      occurrenceId: id,
      fields,
    });
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    expect(r2.state.creditSequences[qid]?.presentation).toBe("roll");
    // Angre av opprettelsen fjerner sekvensen
    const back = applyCommand(r2.state, envelope(r2.inverse));
    expect(back.ok && back.state.creditSequences[qid]?.removed).toBe(true);
  });
});

describe("MT8: eksportfilteret for rulletekst", () => {
  it("SetExportSettings bevarer includeCredits (på som standard)", () => {
    const { state, mainId } = seeded();
    const set = run(state, {
      type: "SetExportSettings",
      productionId: mainId as never,
      settings: { size: "full", monochrome: false, output: "video", includeCredits: false } as never,
    });
    expect(set.ok).toBe(true);
    if (!set.ok) return;
    const r = run(set.state, {
      type: "SetExportSettings",
      productionId: mainId as never,
      settings: { size: "half", monochrome: false, output: "video" } as never,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.state.productions[mainId]?.exportSettings?.includeCredits).toBe(false);
  });
});
