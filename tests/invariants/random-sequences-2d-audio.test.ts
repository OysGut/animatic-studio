// @vitest-environment node
/**
 * Egenskapsbaserte invarianttester for 2D-scener, lag, nøkkelbilder, lyd, klippdeler og scenens klipping
 * (KI-42, INVARIANTS.md, ADR-0005). Tilfeldige kommandosekvenser blandes med manuskommandoene fra
 * randomCommand, så samspillet (f.eks. deling og sammenslåing av scener med 2D-scene og lyd) prøves også.
 * Etter hvert steg kontrolleres strukturelle invarianter, og hver kommando etterfulgt av sin invers skal gi
 * samme innhold.
 */
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_COMPOSITION,
  IDENTITY_TRANSFORM,
  applyCommand,
  checkInvariants,
  compositionOfVariant,
  keyBetween,
  orderedOccurrences,
  type AnimatedProperty,
  type AudioClipFields,
  type Command,
  type Keyframe,
  type LayerFields,
  type ProjectState,
  type TakeMedia,
} from "@/core";
import { envelope, mustApply, randomCommand, rng, seedProject, tid } from "../helpers/fixtures";

const MEDIA: TakeMedia = {
  fileName: "film.mp4",
  mimeType: "video/mp4",
  byteSize: 1000,
  width: 1920,
  height: 1080,
  fps: 25,
  durationMs: 8000,
  videoCodec: "avc",
  hasAudio: true,
};

interface World {
  readonly state: ProjectState;
  readonly mainId: string;
  readonly soundId: string;
}

/** Prosjektet fra fixturen med en lydfil i biblioteket og 2D-scener i to av scenene. */
function seedWorld(): World {
  const { state, mainId } = seedProject(6);
  let s = state;
  const soundId = tid<"asset">();
  s = mustApply(s, {
    type: "CreateAssets",
    assets: [
      {
        assetId: soundId,
        fields: { kind: "sound", name: "Vind", names: [], description: "", category: "", tags: [] },
      },
    ],
  });
  for (const o of orderedOccurrences(s, mainId).slice(0, 2)) {
    s = mustApply(s, {
      type: "CreateComposition",
      compositionId: tid(),
      variantId: o.variantId,
      fields: { ...DEFAULT_COMPOSITION, name: "2D", durationFrames: 125 },
    });
  }
  return { state: s, mainId, soundId };
}

function pick<T>(r: () => number, list: readonly T[]): T | undefined {
  return list.length ? list[Math.floor(r() * list.length)] : undefined;
}

const PROPS: readonly AnimatedProperty[] = ["x", "y", "scaleX", "rotation", "opacity"];

function keyframes(r: () => number): Keyframe[] {
  const out: Keyframe[] = [];
  const n = Math.floor(r() * 4);
  for (let i = 0; i < n; i++) {
    const property = pick(r, PROPS)!;
    const frame = Math.floor(r() * 120);
    if (out.some((k) => k.property === property && k.frame === frame)) continue;
    out.push({
      frame,
      property,
      value: property === "opacity" ? r() : Math.round(r() * 1000),
      easing: pick(r, ["linear", "ease-in", "ease-out", "ease-in-out", "hold"] as const)!,
      ...(r() < 0.3 ? { easeOut: Math.round(r() * 100) / 100 } : {}),
    });
  }
  return out;
}

function layerFields(r: () => number, name: string): LayerFields {
  return {
    kind: pick(r, ["background", "midground", "foreground", "object", "effect"] as const)!,
    name,
    assetId: null,
    assetVariantId: null,
    versionId: null,
    fill: pick(r, ["#336699", "#aa2200", "#ffffff"])!,
    width: 100 + Math.floor(r() * 900),
    height: 100 + Math.floor(r() * 900),
    parallax: Math.round(r() * 20) / 10,
    transform: {
      ...IDENTITY_TRANSFORM,
      x: Math.round(r() * 1920),
      y: Math.round(r() * 1080),
      rotation: Math.round(r() * 360) - 180,
      opacity: Math.round(r() * 100) / 100,
    },
    keyframes: keyframes(r),
    visible: r() < 0.9,
    locked: false,
    groupId: null,
    swaps: [],
    path: null,
    anchor: null,
  };
}

function audioFields(
  r: () => number,
  w: World,
  occurrenceId: string,
  blockId: string | null,
): AudioClipFields {
  return {
    occurrenceId: occurrenceId as never,
    kind: pick(r, ["dialogue", "sfx", "ambience", "music"] as const)!,
    name: `Lyd ${Math.floor(r() * 99)}`,
    assetId: w.soundId as never,
    assetVariantId: null,
    versionId: null,
    blockId: blockId as never,
    offsetMs: Math.floor(r() * 5000),
    sourceInMs: Math.floor(r() * 1000),
    lengthMs: 1 + Math.floor(r() * 6000),
    gainDb: Math.round(r() * 30) - 20,
    fadeInMs: Math.floor(r() * 500),
    fadeOutMs: Math.floor(r() * 500),
    muted: r() < 0.1,
    continues: r() < 0.2,
    volumeKeys: r() < 0.3 ? [{ t: 0, db: -6 }] : [],
  };
}

/** Tilfeldig kommando for 2D-scener, lag, nøkkelbilder, lyd og klipping av scenen. */
function randomMediaCommand(w: World, s: ProjectState, r: () => number): Command | null {
  const occs = orderedOccurrences(s, w.mainId);
  const occ = pick(r, occs);
  if (!occ) return null;
  const comp = compositionOfVariant(s, occ.variantId);
  const comps = Object.values(s.compositions);
  const layers = Object.values(s.layers).filter((l) => s.compositions[l.compositionId]);
  const clips = Object.values(s.audioClips);
  switch (Math.floor(r() * 14)) {
    case 0:
      return comp
        ? null
        : {
            type: "CreateComposition",
            compositionId: tid(),
            variantId: occ.variantId,
            fields: {
              ...DEFAULT_COMPOSITION,
              name: "Ny 2D",
              durationFrames: 25 + Math.floor(r() * 200),
            },
          };
    case 1: {
      const c = pick(r, comps);
      if (!c) return null;
      return r() < 0.7
        ? {
            type: "UpdateComposition",
            compositionId: c.id,
            fields: {
              name: `${c.name}*`.slice(0, 50),
              width: c.width,
              height: c.height,
              durationFrames: 25 + Math.floor(r() * 250),
              background: pick(r, ["#000000", "#101114", "#224466"])!,
            },
          }
        : { type: "SetCompositionRemoved", compositionId: c.id, removed: !c.removed };
    }
    case 2:
    case 3: {
      const c = pick(
        r,
        comps.filter((x) => !x.removed),
      );
      if (!c) return null;
      const n = 1 + Math.floor(r() * 3);
      return {
        type: "AddLayers",
        layers: Array.from({ length: n }, (_, i) => ({
          layerId: tid(),
          compositionId: c.id,
          fields: layerFields(r, `Lag ${i}`),
        })),
      };
    }
    case 4:
    case 5: {
      // Endre lag: flytte, nøkkelbilder, synlighet (som i tidslinjen og på lerretet)
      const chosen = [
        ...new Set([pick(r, layers), pick(r, layers)].filter((l) => l !== undefined)),
      ];
      if (chosen.length === 0) return null;
      return {
        type: "UpdateLayers",
        layers: chosen.map((l) => ({
          layerId: l!.id,
          fields: {
            kind: l!.kind,
            name: l!.name,
            assetId: l!.assetId,
            assetVariantId: l!.assetVariantId,
            versionId: l!.versionId,
            fill: l!.fill,
            width: l!.width,
            height: l!.height,
            parallax: l!.parallax,
            transform: { ...l!.transform, x: l!.transform.x + Math.round(r() * 200) - 100 },
            keyframes: r() < 0.5 ? keyframes(r) : l!.keyframes,
            visible: r() < 0.8 ? l!.visible : !l!.visible,
            locked: l!.locked,
            groupId: l!.groupId,
            swaps: l!.swaps,
            path: l!.path,
            anchor: l!.anchor,
          },
        })),
      };
    }
    case 6: {
      const l = pick(r, layers);
      if (!l) return null;
      const same = layers.filter((x) => x.compositionId === l.compositionId && x.id !== l.id);
      return { type: "MoveLayer", layerId: l.id, beforeLayerId: pick(r, same)?.id ?? null };
    }
    case 7: {
      const l = pick(r, layers);
      return l ? { type: "SetLayersRemoved", layerIds: [l.id], removed: !l.removed } : null;
    }
    case 8: {
      const blocks = Object.values(s.blocks).filter(
        (b) => b.variantId === occ.variantId && b.kind === "dialogue",
      );
      const b = r() < 0.5 ? pick(r, blocks) : undefined;
      return {
        type: "AddAudioClips",
        clips: [{ clipId: tid(), fields: audioFields(r, w, occ.id, b ? b.id : null) }],
      };
    }
    case 9: {
      const a = pick(r, clips);
      if (!a) return null;
      return {
        type: "UpdateAudioClips",
        clips: [
          {
            clipId: a.id,
            fields: { ...audioFields(r, w, a.occurrenceId, a.blockId), name: a.name },
          },
        ],
      };
    }
    case 10: {
      const a = pick(r, clips);
      return a ? { type: "SetAudioClipsRemoved", clipIds: [a.id], removed: !a.removed } : null;
    }
    case 11: {
      const takeId = tid<"take">();
      return {
        type: "AddTake",
        takeId,
        occurrenceId: occ.id,
        segmentId: null,
        kind: "imported_film",
        status: "approved",
        durationFrames: 200,
        mediaRef: `${s.project.id}/films/${takeId}/film.mp4`,
        media: MEDIA,
      };
    }
    default: {
      // Klipping av scenen (SetSceneEdit): deler fra film i scenen og/eller 2D-scenen, eller ingen deler
      const films = Object.values(s.takes).filter(
        (t) => t.kind === "imported_film" && s.occurrences[t.occurrenceId]?.sceneId === occ.sceneId,
      );
      const film = pick(r, films);
      const compMs = comp ? Math.floor((comp.durationFrames / 25) * 1000) : 0;
      const n = Math.floor(r() * 4);
      const parts = [];
      for (let i = 0; i < n; i++) {
        const fromFilm = film && (!comp || compMs < 2 || r() < 0.5);
        const max = fromFilm ? 8000 : compMs;
        if (!fromFilm && (!comp || compMs < 2)) continue;
        const a = Math.floor(r() * (max - 1));
        const b = a + 1 + Math.floor(r() * (max - a - 1));
        parts.push({
          partId: tid() as never,
          source: fromFilm ? ("take" as const) : ("composition" as const),
          takeId: fromFilm ? film!.id : null,
          inMs: a,
          outMs: b,
          ...(i > 0 && r() < 0.3 ? { transitionMs: Math.floor(r() * 500) } : {}),
        });
      }
      return {
        type: "SetSceneEdit",
        occurrenceId: occ.id,
        activeTakeId: film && r() < 0.5 ? film.id : null,
        parts,
      };
    }
  }
}

/** Scenebytte i manuset (flytt, deaktiver, ny scene) – samspillet med klipp og lyd. */
function randomSceneCommand(w: World, s: ProjectState, r: () => number): Command | null {
  const occs = orderedOccurrences(s, w.mainId);
  const occ = pick(r, occs);
  if (!occ) return null;
  if (r() < 0.5) return { type: "SetOccurrenceActive", occurrenceId: occ.id, active: r() < 0.5 };
  const i = Math.floor(r() * (occs.length + 1));
  const before = i > 0 ? (occs[i - 1]?.orderKey ?? null) : null;
  const after = occs[i]?.orderKey ?? null;
  if (before === occ.orderKey || after === occ.orderKey) return null;
  return { type: "MoveOccurrence", occurrenceId: occ.id, orderKey: keyBetween(before, after) };
}

interface Step {
  before: ProjectState;
  after: ProjectState;
  command: Command;
  inverse: Command;
}

function runSequence(seed: number, length: number): { steps: Step[]; w: World } {
  const w = seedWorld();
  const r = rng(seed);
  let s = w.state;
  const steps: Step[] = [];
  for (let i = 0; i < length; i++) {
    const x = r();
    const command =
      x < 0.65
        ? randomMediaCommand(w, s, r)
        : x < 0.8
          ? randomSceneCommand(w, s, r)
          : randomCommand(s, r);
    if (!command) continue;
    const res = applyCommand(s, envelope(command));
    if (!res.ok) continue;
    steps.push({ before: s, after: res.state, command, inverse: res.inverse });
    s = res.state;
  }
  return { steps, w };
}

/**
 * Lagrekkefølgen sammenlignes som plass blant lagene i 2D-scenen, ikke som sorteringsnøkkel: angre av
 * MoveLayer setter laget tilbake på samme plass, men med en ny nøkkel (inversen angir naboen, ikke nøkkelen).
 */
function layerRanks<T extends { compositionId: string; orderKey: string }>(
  rec: Readonly<Record<string, T>>,
): Record<string, T> {
  const out: Record<string, T> = {};
  const byComp = new Map<string, [string, T][]>();
  for (const [k, l] of Object.entries(rec)) {
    const list = byComp.get(l.compositionId) ?? [];
    list.push([k, l]);
    byComp.set(l.compositionId, list);
  }
  for (const list of byComp.values()) {
    list.sort((a, b) =>
      a[1].orderKey < b[1].orderKey ? -1 : a[1].orderKey > b[1].orderKey ? 1 : 0,
    );
    list.forEach(([k, l], i) => (out[k] = { ...l, orderKey: String(i) }));
  }
  return out;
}

/** Innhold uten revisjonstellere og historikk – for «samme innhold»-sammenligning. */
function content(s: ProjectState) {
  const strip = <T extends { revision: number }>(rec: Readonly<Record<string, T>>) =>
    Object.fromEntries(
      Object.entries(rec).map(([k, v]) => [
        k,
        { ...v, revision: 0, ...("currentRev" in v ? { currentRev: 0 } : {}) },
      ]),
    );
  return {
    scenes: strip(s.scenes),
    variants: strip(s.variants),
    blocks: strip(s.blocks),
    occurrences: strip(s.occurrences),
    segments: strip(s.segments),
    takes: strip(s.takes),
    assets: strip(s.assets),
    annotations: strip(s.annotations),
    compositions: strip(s.compositions),
    layers: layerRanks(strip(s.layers)),
    audioClips: strip(s.audioClips),
    clipParts: strip(s.clipParts),
  };
}

const seeds = fc.integer({ min: 1, max: 2 ** 31 - 1 });
const RUNS = 80;
const LEN = 40;

// Tunge egenskapstester: egen tidsgrense, så de ikke feiler når maskinen er travel (DEC-0078)
describe("Invarianter for 2D-scener, lag, lyd og klipping (KI-42)", { timeout: 60_000 }, () => {
  it("generatoren dekker kommandotypene (ellers tester egenskapene lite)", () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 40; seed++)
      for (const st of runSequence(seed, LEN).steps) seen.add(st.command.type);
    for (const t of [
      "CreateComposition",
      "UpdateComposition",
      "SetCompositionRemoved",
      "AddLayers",
      "UpdateLayers",
      "MoveLayer",
      "SetLayersRemoved",
      "AddAudioClips",
      "UpdateAudioClips",
      "SetAudioClipsRemoved",
      "AddTake",
      "SetSceneEdit",
      "MoveOccurrence",
      "SetOccurrenceActive",
    ])
      expect(seen, t).toContain(t);
  });

  it("strukturelle invarianter holder etter hvert steg", () => {
    fc.assert(
      fc.property(seeds, (seed) => {
        for (const st of runSequence(seed, LEN).steps) {
          const s = st.after;
          expect(checkInvariants(s)).toEqual([]);
          // Lag, lyd og klippdeler peker alltid på noe som finnes
          for (const l of Object.values(s.layers))
            expect(s.compositions[l.compositionId]).toBeDefined();
          for (const a of Object.values(s.audioClips)) {
            expect(s.occurrences[a.occurrenceId]).toBeDefined();
            if (a.blockId !== null) expect(s.blocks[a.blockId]).toBeDefined();
          }
          for (const p of Object.values(s.clipParts)) {
            expect(s.occurrences[p.occurrenceId]).toBeDefined();
            expect(p.outMs).toBeGreaterThan(p.inMs);
            if (p.source === "take") expect(s.takes[p.takeId!]).toBeDefined();
          }
          // Keyframes er sortert og unike per egenskap
          for (const l of Object.values(s.layers)) {
            const keys = l.keyframes.map((k) => `${k.property}@${k.frame}`);
            expect(new Set(keys).size).toBe(keys.length);
          }
        }
      }),
      { numRuns: RUNS },
    );
  });

  it("INV-07: produsert materiale slettes aldri (versjoner, lag og lyd forsvinner ikke)", () => {
    fc.assert(
      fc.property(seeds, (seed) => {
        for (const st of runSequence(seed, LEN).steps) {
          for (const id of Object.keys(st.before.takes)) expect(st.after.takes[id]).toBeDefined();
          // Bare angre av opprettelse fjerner lag/lyd/2D-scener (ingen slike i generatoren)
          for (const id of Object.keys(st.before.layers)) expect(st.after.layers[id]).toBeDefined();
          for (const id of Object.keys(st.before.audioClips))
            expect(st.after.audioClips[id]).toBeDefined();
          for (const id of Object.keys(st.before.compositions))
            expect(st.after.compositions[id]).toBeDefined();
        }
      }),
      { numRuns: RUNS },
    );
  });

  it("ADR-0005: hver kommando etterfulgt av sin invers gir samme innhold", () => {
    fc.assert(
      fc.property(seeds, (seed) => {
        for (const st of runSequence(seed, LEN).steps) {
          const undo = applyCommand(st.after, envelope(st.inverse));
          expect(undo.ok, `${st.command.type}: ${undo.ok ? "" : undo.error.message}`).toBe(true);
          if (!undo.ok) continue;
          if (st.command.type === "AddTake") {
            // Produsert materiale kastes aldri: angre fjerner bare aktiv-markeringen (INV-07)
            const { takes: _t1, ...a } = content(undo.state);
            const { takes: _t2, ...b } = content(st.before);
            expect(a).toEqual(b);
          } else if (st.command.type === "SetSceneEdit") {
            // Nye klippdeler slettes ikke ved angre, de merkes fjernet (som annet materiale)
            const a = content(undo.state);
            const b = content(st.before);
            for (const [id, p] of Object.entries(a.clipParts))
              if (!b.clipParts[id]) {
                expect(p.removed).toBe(true);
                delete a.clipParts[id];
              }
            expect(a, st.command.type).toEqual(b);
          } else {
            expect(content(undo.state), st.command.type).toEqual(content(st.before));
          }
        }
      }),
      { numRuns: RUNS },
    );
  });
});
