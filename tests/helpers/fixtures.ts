/**
 * Testhjelpere: deterministiske ID-er, et lite prosjekt (hovedfilm + spinoff) og en generator
 * for tilfeldige kommandoer til egenskapsbaserte invarianttester (test-quality-engineering/INVARIANT_TESTING.md).
 *
 * Nummermønsteret i fixturen etterligner referansemanuset (hull i nummereringen, en unummerert scene),
 * men inneholder ingen manustekst (DEC-0004).
 */
import {
  applyCommand,
  emptyProjectState,
  keyBetween,
  keysEvenly,
  orderedOccurrences,
  FPS_25,
  type Command,
  type CommandEnvelope,
  type Id,
  type ProjectState,
  type UserId,
} from "@/core";

let counter = 0;
/** Deterministisk UUID-lignende ID for tester. */
export function tid<K extends string>(): Id<K> {
  counter++;
  const h = counter.toString(16).padStart(12, "0");
  return `00000000-0000-7000-8000-${h}` as Id<K>;
}

export const ALICE = "00000000-0000-7000-8000-a11ce0000001" as UserId;
export const BOB = "00000000-0000-7000-8000-b0b000000002" as UserId;

export function envelope(
  command: Command,
  actor: UserId = ALICE,
  baseRevisions?: Record<string, number>,
): CommandEnvelope {
  return {
    id: tid<"command">(),
    actor,
    at: "2026-10-08T12:00:00.000Z",
    command,
    ...(baseRevisions ? { baseRevisions } : {}),
  };
}

export function mustApply(
  state: ProjectState,
  command: Command,
  actor: UserId = ALICE,
): ProjectState {
  const r = applyCommand(state, envelope(command, actor));
  if (!r.ok)
    throw new Error(
      `${command.type} feilet: ${r.error.code} ${r.error.message} ${(r.error.details ?? []).join("; ")}`,
    );
  return r.state;
}

/** Scenenumre med hull og én unummerert scene (mønster fra referansemanuset). */
export const NUMBER_PATTERN = ["1", null, "2", "3", "5", "6", "7", "9", "10", "12"] as const;

export interface Seed {
  state: ProjectState;
  mainId: string;
  spinoffId: string;
}

export function seedProject(sceneCount = NUMBER_PATTERN.length): Seed {
  let s = emptyProjectState({
    id: tid<"project">(),
    revision: 1,
    name: "Testprosjekt",
    fps: FPS_25,
    primaryLanguage: "nb",
  });
  const mainId = tid<"production">();
  const spinoffId = tid<"production">();
  s = mustApply(s, {
    type: "CreateProduction",
    productionId: mainId as never,
    kind: "main",
    name: "Hovedfilm",
    parentProductionId: null,
  });
  s = mustApply(s, {
    type: "CreateProduction",
    productionId: spinoffId as never,
    kind: "spinoff",
    name: "Trailer",
    parentProductionId: mainId as never,
  });
  const keys = keysEvenly(sceneCount);
  for (let i = 0; i < sceneCount; i++) {
    const blockKeys = keysEvenly(3);
    s = mustApply(s, {
      type: "CreateScene",
      productionId: mainId as never,
      sceneId: tid(),
      variantId: tid(),
      occurrenceId: tid(),
      orderKey: keys[i]!,
      heading: { intExt: i % 2 ? "EXT." : "INT.", location: `STED ${i}`, time: "DAG" },
      blocks: [
        { blockId: tid(), kind: "action", text: `Handling ${i}`, orderKey: blockKeys[0]! },
        { blockId: tid(), kind: "character", text: "MAJA", orderKey: blockKeys[1]! },
        { blockId: tid(), kind: "dialogue", text: `Replikk ${i}`, orderKey: blockKeys[2]! },
      ],
      productionNumber: NUMBER_PATTERN[i % NUMBER_PATTERN.length] ?? null,
    });
  }
  // Spinoffen gjenbruker tre scener fra hovedfilmen (delt variant, egen rekkefølge)
  const mainOcc = orderedOccurrences(s, mainId);
  const reuse = [mainOcc[4], mainOcc[1], mainOcc[7]].filter((o) => o !== undefined);
  const spinKeys = keysEvenly(reuse.length);
  reuse.forEach((o, i) => {
    s = mustApply(s, {
      type: "AddOccurrence",
      productionId: spinoffId as never,
      occurrenceId: tid(),
      sceneId: o!.sceneId,
      variantId: o!.variantId,
      orderKey: spinKeys[i]!,
    });
  });
  // Ferdig materiale på to scener i hovedfilmen
  for (const o of [mainOcc[0], mainOcc[2]]) {
    if (!o) continue;
    const takeId = tid<"take">();
    s = mustApply(s, {
      type: "AddTake",
      takeId,
      occurrenceId: o.id,
      segmentId: null,
      kind: "composition2d",
      status: "approved",
      durationFrames: 250,
      mediaRef: null,
    });
    s = mustApply(s, { type: "SetActiveTake", occurrenceId: o.id, takeId });
  }
  return { state: s, mainId, spinoffId };
}

/** Enkel deterministisk pseudotilfeldig generator. */
export function rng(seed: number) {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}

function pick<T>(r: () => number, list: readonly T[]): T | undefined {
  return list.length ? list[Math.floor(r() * list.length)] : undefined;
}

/** Lag en (vanligvis gyldig) tilfeldig kommando ut fra gjeldende tilstand. */
export function randomCommand(s: ProjectState, r: () => number): Command | null {
  const prods = Object.values(s.productions);
  const prod = pick(r, prods);
  if (!prod) return null;
  const occs = orderedOccurrences(s, prod.id);
  const occ = pick(r, occs);
  const choice = Math.floor(r() * 9);
  switch (choice) {
    case 0: {
      if (!occ) return null;
      const i = Math.floor(r() * (occs.length + 1));
      const before = i > 0 ? (occs[i - 1]?.orderKey ?? null) : null;
      const after = occs[i]?.orderKey ?? null;
      if (before === occ.orderKey || after === occ.orderKey) return null;
      return { type: "MoveOccurrence", occurrenceId: occ.id, orderKey: keyBetween(before, after) };
    }
    case 1:
      return occ ? { type: "SetOccurrenceActive", occurrenceId: occ.id, active: r() < 0.5 } : null;
    case 2: {
      if (!occ) return null;
      const blocks = Object.values(s.blocks).filter((b) => b.variantId === occ.variantId);
      const b = pick(r, blocks);
      return b
        ? {
            type: "EditBlockText",
            productionId: prod.id,
            blockId: b.id,
            text: `${b.text} (rev ${Math.floor(r() * 1000)})`,
          }
        : null;
    }
    case 3: {
      if (!occ) return null;
      const v = s.variants[occ.variantId];
      if (!v || v.ownerProductionId === occ.productionId) return null;
      const map: Record<string, never> = {};
      for (const b of Object.values(s.blocks)) if (b.variantId === v.id) map[b.id] = tid() as never;
      return { type: "ForkVariant", occurrenceId: occ.id, newVariantId: tid(), blockIdMap: map };
    }
    case 4: {
      if (!occ) return null;
      const n = 1 + Math.floor(r() * 3);
      return {
        type: "CreateSegments",
        occurrenceId: occ.id,
        reason: pick(r, ["continuity_change", "model_limit", "manual"] as const)!,
        segments: keysEvenly(n).map((k) => ({
          segmentId: tid(),
          orderKey: k,
          startBlockId: null,
          endBlockId: null,
        })),
      };
    }
    case 5:
      return occ
        ? {
            type: "AddTake",
            takeId: tid(),
            occurrenceId: occ.id,
            segmentId: null,
            kind: "ai_video",
            status: "in_progress",
            durationFrames: Math.floor(r() * 500),
            mediaRef: null,
          }
        : null;
    case 6: {
      if (!occ) return null;
      const sameScene = Object.values(s.takes).filter(
        (t) => s.occurrences[t.occurrenceId]?.sceneId === occ.sceneId,
      );
      const t = pick(r, sameScene);
      return { type: "SetActiveTake", occurrenceId: occ.id, takeId: t ? t.id : null };
    }
    case 7: {
      const last = occs[occs.length - 1]?.orderKey ?? null;
      return {
        type: "CreateScene",
        productionId: prod.id,
        sceneId: tid(),
        variantId: tid(),
        occurrenceId: tid(),
        orderKey: keyBetween(last, null),
        heading: { intExt: "INT.", location: "NY", time: "NATT" },
        blocks: [{ blockId: tid(), kind: "action", text: "Ny handling", orderKey: "i" }],
      };
    }
    default: {
      const scene = pick(r, Object.values(s.scenes));
      const anchor = pick(r, Object.values(s.scenes));
      if (!scene || !anchor || scene.id === anchor.id) return null;
      return r() < 0.5
        ? {
            type: "SetStoryTime",
            sceneId: scene.id,
            storyTime: {
              kind: "flashback",
              anchorSceneId: anchor.id,
              offset: -1 - Math.floor(r() * 5),
            },
          }
        : {
            type: "SetStoryTime",
            sceneId: scene.id,
            storyTime: { kind: "linear", anchorSceneId: null, offset: 0 },
          };
    }
  }
}
