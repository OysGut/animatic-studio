// @vitest-environment node
/**
 * DEC-0088: element som skal inn i flere scener (planer og oppgaver), systemmerknader i manus og eksport,
 * TODO-oversikten og dørdeler med ankerpunkt på hengselsiden.
 */
import { describe, expect, it } from "vitest";
import {
  applyCommand,
  assetTasks,
  defaultLayerFields,
  exportNotes,
  orderedOccurrences,
  partLayers,
  pendingPlansFor,
  planNoteText,
  projectTodo,
  sceneChoices,
  stepTask,
  systemNoteAuthor,
  type AssetFields,
  type Command,
  type ProjectState,
} from "@/core";
import { envelope, mustApply, seedProject, tid } from "../helpers/fixtures";

const TEDDY: AssetFields = {
  kind: "object",
  name: "Teddybjørn",
  names: [],
  description: "",
  category: "",
  tags: [],
};

function setup() {
  const { state, mainId } = seedProject(6);
  const occ = orderedOccurrences(state, mainId);
  const assetId = tid<"asset">();
  const assetVariantId = tid<"asset_variant">();
  const versionId = tid<"asset_version">();
  let s = mustApply(state, { type: "CreateAssets", assets: [{ assetId, fields: TEDDY }] });
  s = mustApply(s, {
    type: "CreateAssetVariant",
    variantId: assetVariantId,
    assetId,
    fields: { name: "Animatic", style: "animatic", appearance: "" },
  });
  s = mustApply(s, {
    type: "AddAssetVersion",
    versionId,
    variantId: assetVariantId,
    media: {
      path: `${s.project.id}/${assetId}/${versionId}/teddy.png`,
      mimeType: "image/png",
      width: 400,
      height: 200,
      byteSize: 1000,
      sha256: "d".repeat(64),
    },
    note: "",
  });
  return { s, mainId, occ, assetId, assetVariantId, versionId };
}

/** Legg ressursen som lag i scenens 2D-scene (lager 2D-scenen om den mangler). */
function place(s: ProjectState, occurrenceId: string, assetId: string, assetVariantId: string) {
  const variantId = s.occurrences[occurrenceId]!.variantId;
  let comp = Object.values(s.compositions).find((c) => c.variantId === variantId && !c.removed);
  if (!comp) {
    const compositionId = tid<"composition">();
    s = mustApply(s, {
      type: "CreateComposition",
      compositionId,
      variantId,
      fields: {
        name: "Scene",
        width: 1000,
        height: 600,
        durationFrames: 100,
        background: "#000000",
      },
    });
    comp = s.compositions[compositionId]!;
  }
  const layerId = tid<"composition_layer">();
  s = mustApply(s, {
    type: "AddLayers",
    layers: [
      {
        layerId,
        compositionId: comp.id,
        fields: defaultLayerFields(s, comp, {
          assetId: assetId as never,
          assetVariantId: assetVariantId as never,
        }),
      },
    ],
  });
  return { s, layerId };
}

function systemNote(s: ProjectState, occurrenceId: string, taskId: string) {
  const id = tid<"annotation">();
  return {
    id,
    s: mustApply(s, {
      type: "AddAnnotations",
      annotations: [
        {
          annotationId: id,
          blockId: null,
          variantId: s.occurrences[occurrenceId]!.variantId,
          start: 0,
          end: 0,
          quote: "",
          text: planNoteText("Teddybjørn", "1"),
          authorName: "Mars",
          stampAt: "2026-10-15T10:00:00.000Z",
          source: "system",
          taskId,
        },
      ],
    }),
  };
}

describe("PlanAssetInScenes (DEC-0088)", () => {
  it("legger planer på ressursen og kan angres", () => {
    const { s, occ, assetId } = setup();
    const taskId = tid<"task">();
    const c: Command = {
      type: "PlanAssetInScenes",
      assetId: assetId as never,
      taskId,
      fromOccurrenceId: occ[0]!.id,
      occurrenceIds: [occ[2]!.id, occ[4]!.id, occ[2]!.id],
    };
    const r = applyCommand(s, envelope(c));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const plans = r.state.assets[assetId]!.scenePlans!;
    expect(plans.map((p) => p.occurrenceId)).toEqual([occ[2]!.id, occ[4]!.id]);
    expect(plans.every((p) => p.taskId === taskId && p.fromOccurrenceId === occ[0]!.id)).toBe(true);
    const undone = mustApply(r.state, r.inverse as Command);
    expect(undone.assets[assetId]!.scenePlans ?? []).toEqual([]);
  });

  it("avviser ugyldig oppgave-ID og ukjente scener", () => {
    const { s, occ, assetId } = setup();
    const bad = (c: Command) => {
      const r = applyCommand(s, envelope(c));
      return r.ok ? null : r.error.code;
    };
    expect(
      bad({
        type: "PlanAssetInScenes",
        assetId: assetId as never,
        taskId: "ikke-en-id",
        fromOccurrenceId: occ[0]!.id,
        occurrenceIds: [occ[1]!.id],
      }),
    ).not.toBeNull();
    expect(
      bad({
        type: "PlanAssetInScenes",
        assetId: assetId as never,
        taskId: tid(),
        fromOccurrenceId: occ[0]!.id,
        occurrenceIds: [tid()],
      }),
    ).not.toBeNull();
    expect(
      bad({
        type: "PlanAssetInScenes",
        assetId: assetId as never,
        taskId: tid(),
        fromOccurrenceId: occ[0]!.id,
        occurrenceIds: [],
      }),
    ).not.toBeNull();
  });

  it("RemoveScenePlans fjerner bare de valgte scenene", () => {
    const { s, occ, assetId } = setup();
    const taskId = tid<"task">();
    let t = mustApply(s, {
      type: "PlanAssetInScenes",
      assetId: assetId as never,
      taskId,
      fromOccurrenceId: occ[0]!.id,
      occurrenceIds: [occ[1]!.id, occ[2]!.id],
    });
    t = mustApply(t, {
      type: "RemoveScenePlans",
      assetId: assetId as never,
      occurrenceIds: [occ[1]!.id],
    });
    expect(t.assets[assetId]!.scenePlans!.map((p) => p.occurrenceId)).toEqual([occ[2]!.id]);
  });
});

describe("Ventende elementer og oppgaver (DEC-0088)", () => {
  it("elementet venter med gul ramme til det er dratt inn; oppgaven er ferdig når merknaden er lagret", () => {
    const { s: s0, mainId, occ, assetId, assetVariantId } = setup();
    const taskId = tid<"task">();
    let s = mustApply(s0, {
      type: "PlanAssetInScenes",
      assetId: assetId as never,
      taskId,
      fromOccurrenceId: occ[0]!.id,
      occurrenceIds: [occ[1]!.id, occ[3]!.id],
    });
    const note = systemNote(s, occ[1]!.id, taskId);
    s = note.s;
    expect(pendingPlansFor(s, occ[1]!.id).map((p) => p.asset.id)).toEqual([assetId]);
    expect(pendingPlansFor(s, occ[2]!.id)).toEqual([]);

    let tasks = assetTasks(s, mainId);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]!.remaining).toBe(2);
    expect(tasks[0]!.scenes[0]!.noteId).toBe(note.id);

    // Neste/forrige går rundt i ring blant scenene som ikke er ferdige
    expect(stepTask(tasks[0]!, null, 1)).toBe(occ[1]!.id);
    expect(stepTask(tasks[0]!, occ[1]!.id, 1)).toBe(occ[3]!.id);
    expect(stepTask(tasks[0]!, occ[3]!.id, 1)).toBe(occ[1]!.id);
    expect(stepTask(tasks[0]!, occ[1]!.id, -1)).toBe(occ[3]!.id);

    // Dra inn i scene 2: fortsatt merknad igjen → ikke ferdig
    s = place(s, occ[1]!.id, assetId, assetVariantId).s;
    expect(pendingPlansFor(s, occ[1]!.id)).toEqual([]);
    tasks = assetTasks(s, mainId);
    expect(tasks[0]!.remaining).toBe(2);
    // Merknaden lagret som ferdig
    s = mustApply(s, {
      type: "SetAnnotationRemoved",
      annotationId: note.id as never,
      removed: true,
    });
    tasks = assetTasks(s, mainId);
    expect(tasks[0]!.remaining).toBe(1);
    expect(tasks[0]!.scenes.find((x) => x.occurrenceId === occ[1]!.id)!.done).toBe(true);
    // Siste scene: oppgaven forsvinner
    s = place(s, occ[3]!.id, assetId, assetVariantId).s;
    expect(assetTasks(s, mainId)).toEqual([]);
  });

  it("hurtigvalg: alle scener med karakteren og alle scener etter denne", () => {
    const { s, mainId, occ } = setup();
    const choices = sceneChoices(s, mainId, occ[2]!.id);
    const rest = choices.find((c) => c.key === "rest");
    expect(rest?.occurrenceIds).toEqual(occ.slice(3).map((o) => o.id));
    for (const c of choices) expect(c.occurrenceIds).not.toContain(occ[2]!.id);
  });
});

describe("Systemmerknader i eksport og TODO-oversikten (DEC-0088)", () => {
  it("eksporten merker systemmerknader med eget forfatternavn", () => {
    const { s: s0, occ } = setup();
    const { s } = systemNote(s0, occ[1]!.id, tid());
    const pins = exportNotes(s, [occ[1]!.id]).pins.get(occ[1]!.id)!;
    expect(pins).toHaveLength(1);
    expect(pins[0]!.author).toBe(systemNoteAuthor());
    expect(pins[0]!.system).toBe(true);
  });

  it("TODO viser notater fra andre, ikke mine og ikke systemmerknader", () => {
    const { s: s0, mainId, occ } = setup();
    const { s: s1 } = systemNote(s0, occ[1]!.id, tid());
    const add = (s: ProjectState, author: string, text: string, at: string) =>
      mustApply(s, {
        type: "AddAnnotations",
        annotations: [
          {
            annotationId: tid(),
            blockId: null,
            variantId: s.occurrences[occ[2]!.id]!.variantId,
            start: 0,
            end: 0,
            quote: "",
            text,
            authorName: author,
            stampAt: at,
          },
        ],
      });
    let s = add(s1, "Anita", "Lysere her", "2026-10-14T10:00:00.000Z");
    s = add(s, "Mars", "Mitt eget", "2026-10-14T11:00:00.000Z");
    s = add(s, "Kari", "Nyeste", "2026-10-15T09:00:00.000Z");
    const todo = projectTodo(s, mainId, { myName: "mars" });
    expect(todo.notesFromOthers.map((n) => n.annotation.text)).toEqual(["Nyeste", "Lysere her"]);
    expect(todo.notesFromOthers[0]!.occurrenceId).toBe(occ[2]!.id);
  });
});

describe("Dørdeler (DEC-0088)", () => {
  it("dørblad med hengsel til venstre får gruppe med ankerpunkt på venstre kant", () => {
    const { s: s0, occ, assetId, assetVariantId, versionId } = setup();
    const placed = place(s0, occ[0]!.id, assetId, assetVariantId);
    const s = placed.s;
    const original = s.layers[placed.layerId]!;
    let n = 0;
    const out = partLayers(
      s,
      original,
      [
        { assetId, versionId, box: { x: 0, y: 0, w: 200, h: 200 }, anchor: "left" },
        { assetId: tid(), versionId: tid(), box: { x: 0, y: 0, w: 1, h: 1 }, anchor: "center" },
      ],
      { width: 400, height: 200 },
      () => `00000000-0000-7000-8000-${(0xfff000 + ++n).toString(16).padStart(12, "0")}`,
    );
    // Ukjent versjon hoppes over; dørbladet gir gruppe + lag
    expect(out.layers).toHaveLength(2);
    const [group, leaf] = out.layers;
    expect(group!.fields.kind).toBe("group");
    expect(leaf!.fields.groupId).toBe(group!.layerId);
    const t = original.transform;
    const kx = (t.scaleX * original.width) / 400;
    // Ankerpunktet ligger på venstre kant av dørbladet
    expect(group!.fields.anchor!.x).toBe(Math.round(leaf!.fields.transform.x - (kx * 200) / 2));
    // Resten av originalen er med (samme ressurs) → originallaget skjules
    expect(out.hideOriginal?.layerId).toBe(original.id);
    expect(out.hideOriginal?.fields.visible).toBe(false);
  });
});
