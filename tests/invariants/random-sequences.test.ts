// @vitest-environment node
/**
 * Egenskapsbaserte invarianttester (INVARIANTS.md, test-quality-engineering/INVARIANT_TESTING.md).
 * Tusenvis av tilfeldige kommandosekvenser kjøres mot kjernen. Etter hvert steg kontrolleres
 * strukturelle invarianter, og hvert steg sammenlignes med tilstanden før.
 */
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  applyCommand,
  assemblyView,
  checkInvariants,
  orderedOccurrences,
  scriptView,
  type Command,
  type ProjectState,
} from "@/core";
import { envelope, randomCommand, rng, seedProject } from "../helpers/fixtures";

interface Step {
  before: ProjectState;
  after: ProjectState;
  command: Command;
  inverse: Command;
}

function runSequence(
  seed: number,
  length: number,
): { steps: Step[]; rejected: number; mainId: string; spinoffId: string } {
  const { state, mainId, spinoffId } = seedProject();
  const r = rng(seed);
  let s = state;
  const steps: Step[] = [];
  let rejected = 0;
  for (let i = 0; i < length; i++) {
    const command = randomCommand(s, r);
    if (!command) continue;
    const res = applyCommand(s, envelope(command));
    if (!res.ok) {
      rejected++;
      continue;
    }
    steps.push({ before: s, after: res.state, command, inverse: res.inverse });
    s = res.state;
  }
  return { steps, rejected, mainId, spinoffId };
}

const seeds = fc.integer({ min: 1, max: 2 ** 31 - 1 });
const RUNS = 150;
const LEN = 40;

/** Projeksjon uten revisjonstellere og historikk – for «samme innhold»-sammenligning. */
function content(s: ProjectState) {
  const strip = <T extends { revision: number }>(rec: Readonly<Record<string, T>>) =>
    Object.fromEntries(
      Object.entries(rec).map(([k, v]) => [
        k,
        { ...v, revision: 0, ...("currentRev" in v ? { currentRev: 0 } : {}) },
      ]),
    );
  return {
    productions: strip(s.productions),
    scenes: strip(s.scenes),
    variants: strip(s.variants),
    blocks: strip(s.blocks),
    occurrences: strip(s.occurrences),
    segments: strip(s.segments),
    takes: strip(s.takes),
  };
}

describe("Invarianter under tilfeldige kommandosekvenser", () => {
  it("strukturelle invarianter holder etter hvert steg", () => {
    fc.assert(
      fc.property(seeds, (seed) => {
        const { steps } = runSequence(seed, LEN);
        for (const st of steps) expect(checkInvariants(st.after)).toEqual([]);
      }),
      { numRuns: RUNS },
    );
  });

  it("INV-01: manus og film har alltid samme aktive rekkefølge i alle produksjoner", () => {
    fc.assert(
      fc.property(seeds, (seed) => {
        const { steps } = runSequence(seed, LEN);
        for (const st of steps) {
          for (const p of Object.keys(st.after.productions)) {
            expect(assemblyView(st.after, p).map((x) => x.occurrenceId)).toEqual(
              scriptView(st.after, p).map((x) => x.occurrenceId),
            );
          }
        }
      }),
      { numRuns: RUNS },
    );
  });

  it("INV-02/03: ingen scene, forekomst eller produksjonsnummer forsvinner eller bytter scene", () => {
    fc.assert(
      fc.property(seeds, (seed) => {
        const { steps } = runSequence(seed, LEN);
        for (const st of steps) {
          for (const [id, o] of Object.entries(st.before.occurrences)) {
            const now = st.after.occurrences[id];
            expect(now).toBeDefined();
            expect(now!.sceneId).toBe(o.sceneId);
            expect(now!.productionNumber).toBe(o.productionNumber);
          }
          for (const id of Object.keys(st.before.scenes)) expect(st.after.scenes[id]).toBeDefined();
        }
      }),
      { numRuns: RUNS },
    );
  });

  it("INV-04: kommandoer i én produksjon endrer aldri en annen produksjons forekomster", () => {
    fc.assert(
      fc.property(seeds, (seed) => {
        const { steps } = runSequence(seed, LEN);
        for (const st of steps) {
          const touched = new Set<string>();
          for (const [id, o] of Object.entries(st.after.occurrences)) {
            const old = st.before.occurrences[id];
            if (old !== o) touched.add(o.productionId);
          }
          expect(touched.size).toBeLessThanOrEqual(1);
          // Blokker i en variant eid av produksjon X endres bare av kommandoer i X
          if (st.command.type === "EditBlockText") {
            const changed = Object.values(st.after.blocks).filter(
              (b) => st.before.blocks[b.id] !== b,
            );
            for (const b of changed) {
              const owner = st.after.variants[b.variantId]!.ownerProductionId;
              const prod = st.after.productions[st.command.productionId]!;
              expect(owner === null ? prod.kind === "main" : owner === prod.id).toBe(true);
            }
          }
        }
      }),
      { numRuns: RUNS },
    );
  });

  it("INV-07/13: produsert materiale og historikk endres eller slettes aldri", () => {
    fc.assert(
      fc.property(seeds, (seed) => {
        const { steps } = runSequence(seed, LEN);
        for (const st of steps) {
          for (const [id, t] of Object.entries(st.before.takes))
            expect(st.after.takes[id]).toEqual(t);
          const after = new Set(
            st.after.blockRevisions.map((r) => `${r.blockId}:${r.rev}:${r.text}`),
          );
          // Historikk kan bare fjernes ved angre av opprettelse (ingen slike i den tilfeldige generatoren)
          for (const r of st.before.blockRevisions)
            expect(after.has(`${r.blockId}:${r.rev}:${r.text}`)).toBe(true);
        }
      }),
      { numRuns: RUNS },
    );
  });

  it("INV-10: segmentering endrer aldri scener, manusblokker eller rekkefølge", () => {
    fc.assert(
      fc.property(seeds, (seed) => {
        const { steps } = runSequence(seed, LEN);
        for (const st of steps.filter((x) => x.command.type === "CreateSegments")) {
          expect(st.after.scenes).toBe(st.before.scenes);
          expect(st.after.blocks).toBe(st.before.blocks);
          expect(st.after.occurrences).toBe(st.before.occurrences);
        }
      }),
      { numRuns: RUNS },
    );
  });

  it("INV-14: deaktivering sletter ingenting", () => {
    fc.assert(
      fc.property(seeds, (seed) => {
        const { steps } = runSequence(seed, LEN);
        for (const st of steps.filter((x) => x.command.type === "SetOccurrenceActive")) {
          for (const k of ["scenes", "variants", "blocks", "segments", "takes"] as const) {
            expect(Object.keys(st.after[k]).sort()).toEqual(Object.keys(st.before[k]).sort());
          }
          expect(st.after.blockRevisions).toBe(st.before.blockRevisions);
        }
      }),
      { numRuns: RUNS },
    );
  });

  it("ADR-0005: hver kommando etterfulgt av sin invers gir samme innhold", () => {
    fc.assert(
      fc.property(seeds, (seed) => {
        const { steps } = runSequence(seed, LEN);
        for (const st of steps) {
          const undo = applyCommand(st.after, envelope(st.inverse));
          expect(undo.ok).toBe(true);
          if (!undo.ok) continue;
          if (st.command.type === "AddTake") {
            // Produsert materiale kastes aldri: angre fjerner bare aktiv-markeringen (INV-07)
            const { takes: _t1, ...a } = content(undo.state);
            const { takes: _t2, ...b } = content(st.before);
            expect(a).toEqual(b);
          } else {
            expect(content(undo.state)).toEqual(content(st.before));
          }
        }
      }),
      { numRuns: RUNS },
    );
  });

  it("rekkefølgen i hovedfilmen er alltid fullstendig (ingen forekomst mistes)", () => {
    fc.assert(
      fc.property(seeds, (seed) => {
        const { steps, mainId } = runSequence(seed, LEN);
        for (const st of steps) {
          const n = Object.values(st.after.occurrences).filter(
            (o) => o.productionId === mainId,
          ).length;
          expect(orderedOccurrences(st.after, mainId)).toHaveLength(n);
        }
      }),
      { numRuns: RUNS },
    );
  });
});
