// @vitest-environment node
/** Story Lab (SL1): turmaskinen – regi, tak, forgrening og valg av taler. */
import { describe, expect, it } from "vitest";
import {
  activeDirections,
  newEngineState,
  reduceEngine,
  suggestSpeaker,
  type EngineAction,
  type EngineState,
} from "@/core";

const A = "a0000000-0000-7000-8000-000000000001";
const B = "b0000000-0000-7000-8000-000000000002";
const C = "c0000000-0000-7000-8000-000000000003";
const names = { [A]: "Maja", [B]: "Anne", [C]: "Ola" };
const at = "2026-10-18T10:00:00.000Z";
let n = 0;
const id = () => `t${++n}`;

const run = (s: EngineState, ...actions: EngineAction[]) => actions.reduce(reduceEngine, s);
const line = (speaker: string, text = "…"): EngineAction => ({ type: "appendLine", id: id(), speaker, text, at });
const started = (max = 8, seed = 1) =>
  run(newEngineState({ participants: [A, B, C], mode: "improv", seed, maxTurnsPerRun: max }), { type: "start" });

describe("regi", () => {
  it("«next» gjelder bare målets neste tur; «scene» og «session» står til de fjernes", () => {
    let s = run(
      started(),
      { type: "direct", id: "d1", text: "Maja er bakfull", target: A, scope: "next", at },
      { type: "direct", id: "d2", text: "Det regner", target: null, scope: "scene", at },
      { type: "direct", id: "d3", text: "Anne er sint", target: B, scope: "session", at },
    );
    expect(activeDirections(s, A).map((d) => d.id)).toEqual(["d1", "d2"]);
    s = run(s, line(B));
    expect(activeDirections(s, A).map((d) => d.id)).toEqual(["d1", "d2"]);
    s = run(s, line(A));
    expect(activeDirections(s, A).map((d) => d.id)).toEqual(["d2"]);
    expect(activeDirections(s, B).map((d) => d.id)).toEqual(["d2", "d3"]);
    s = run(s, { type: "removeDirection", id: "d3" });
    expect(activeDirections(s, B).map((d) => d.id)).toEqual(["d2"]);
  });
});

describe("tak og status", () => {
  it("pauser ved maxTurnsPerRun; resume nullstiller; ingen replikker uten at maskinen går", () => {
    let s = run(started(2), line(A), line(B));
    expect(s.status).toBe("paused");
    expect(run(s, line(C)).turns).toHaveLength(2);
    s = run(s, { type: "resume" });
    expect(s).toMatchObject({ status: "running", turnsThisRun: 0 });
    s = run(s, { type: "stop" }, { type: "resume" }, line(A));
    expect(s.status).toBe("stopped");
    expect(s.turns).toHaveLength(2);
  });
});

describe("forgrening", () => {
  it("branchFrom beholder turene til og med indeksen og regien som var gitt da", () => {
    const s = run(
      started(),
      line(A),
      { type: "direct", id: "d1", text: "x", target: null, scope: "session", at },
      line(B),
      line(C),
    );
    const b = run(s, { type: "branchFrom", turnId: s.turns[0]!.id });
    expect(b.turns.map((t) => t.speaker)).toEqual([A]);
    expect(b.directions).toEqual([]);
    expect(b.status).toBe("paused");
    expect(run(s, { type: "branchFrom", turnId: s.turns[1]!.id }).directions.map((d) => d.id)).toEqual(["d1"]);
    expect(run(s, { type: "branchFrom", turnId: "ukjent" })).toBe(s);
  });
});

describe("valg av taler", () => {
  it("samme taler kommer aldri tre ganger på rad (200 seed-verdier)", () => {
    for (let seed = 0; seed < 200; seed++) {
      let s = started(100, seed);
      for (let i = 0; i < 30; i++) {
        const next = suggestSpeaker(s, names)!;
        s = run(s, line(next));
        const l = s.turns;
        if (l.length >= 3) {
          const [x, y, z] = l.slice(-3).map((t) => t.speaker);
          expect(x === y && y === z).toBe(false);
        }
      }
    }
  });

  it("tvinger bort en taler som har hatt de to siste replikkene, også når den er valgt eller tiltalt", () => {
    let s = run(started(), line(A), line(A), { type: "nextSpeaker", assetId: A });
    expect(suggestSpeaker(s, names)).not.toBe(A);
    s = run(s, { type: "ask", id: id(), text: "Maja?", to: A, at });
    expect(suggestSpeaker(s, names)).not.toBe(A);
  });

  it("den som ble tiltalt eller nevnt sist, går foran", () => {
    let s = run(started(), { type: "ask", id: id(), text: "Hva tenker du?", to: C, at });
    expect(suggestSpeaker(s, names)).toBe(C);
    s = run(s, line(C, "Spør heller Anne om det."));
    expect(suggestSpeaker(s, names)).toBe(B);
  });

  it("samme seed gir samme taler, og deltakere utenfor samtalen avvises", () => {
    const a = run(started(8, 42), line(A));
    const b = run(started(8, 42), line(A));
    expect(suggestSpeaker(a, names)).toBe(suggestSpeaker(b, names));
    expect(run(a, line("ukjent")).turns).toHaveLength(1);
  });
});
