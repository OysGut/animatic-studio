// @vitest-environment node
/** Tilbakeføring fra spinoff til hovedfilm (M7 del 4, DEC-0060, REQ-0373–0383, REQ-0500). */
import { describe, expect, it } from "vitest";
import {
  KEEP_ALL,
  applyCommand,
  blocksOfVariant,
  comparePromotion,
  compositionOfVariant,
  defaultChoice,
  filmClips,
  framesToSeconds,
  keyBetween,
  layerFieldsOf,
  layersOf,
  mainProduction,
  newMainVariantCommands,
  orderedOccurrences,
  ownCopyCommands,
  promotionCandidates,
  promotionCommands,
  scriptOnlyChoice,
  transferSceneCommands,
  type Command,
  type ProjectState,
} from "@/core";
import { envelope, mustApply, tid } from "../helpers/fixtures";
import { fixture } from "../visual/fixture-state";

const s0 = fixture.state;
const main = mainProduction(s0)!;
const spinId = "00000000-0000-7000-8000-00000000057a";

/** Kjører kommandoene og gir tilstanden og angringen (inversene i omvendt rekkefølge). */
function run(s: ProjectState, commands: readonly Command[]) {
  const undo: Command[] = [];
  for (const c of commands) {
    const r = applyCommand(s, envelope(c));
    if (!r.ok) throw new Error(`${c.type}: ${r.error.message}`);
    s = r.state;
    undo.unshift(r.inverse);
  }
  return { s, undo };
}

const texts = (s: ProjectState, variantId: string) =>
  blocksOfVariant(s, variantId).map((b) => `${b.kind}:${b.text}`);

/** Spinoffens forekomst med egen versjon (fixturen: replikken er endret til «… julenissen!»). */
function forked(s: ProjectState = s0) {
  const c = promotionCandidates(s, spinId).find((x) => x.mainOccurrenceId)!;
  const so = s.occurrences[c.occurrenceId]!;
  const mo = s.occurrences[c.mainOccurrenceId!]!;
  return { c, so, mo };
}

describe("tilbakeføring – sammenligning", () => {
  it("spinoffens egne versjoner foreslås; ingenting endres av seg selv (REQ-0373/0374)", () => {
    const list = promotionCandidates(s0, spinId);
    expect(list.length).toBe(1);
    expect(list[0]!.mainOccurrenceId).toBeTruthy();
    expect(promotionCandidates(s0, main.id)).toEqual([]);
    // Hovedfilmens tekst er fortsatt den gamle
    const { mo } = forked();
    expect(texts(s0, mo.variantId).join("\n")).not.toContain("julenissen");
  });

  it("viser originalen, spinoffens versjon og endringene per kategori (REQ-0375)", () => {
    const { so } = forked();
    const c = comparePromotion(s0, so.id)!;
    const changed = c.lines.filter((l) => l.status === "changed");
    expect(changed.length).toBe(1);
    expect(changed[0]!.spin!.text).toBe("Hører du det? Det er julenissen!");
    expect(changed[0]!.main!.text).not.toBe(changed[0]!.spin!.text);
    expect(c.lines.filter((l) => l.status === "conflict")).toEqual([]);
    expect(c.heading.changed).toBe(false);
    expect(c.audio.every((a) => a.status === "same")).toBe(true);
    expect(c.camera.changed).toBe(false);
    expect(c.timing.changed).toBe(false);
    expect(c.film.changed).toBe(false);
  });

  it("linje endret både i hovedfilmen og spinoffen er en konflikt og velges ikke som standard", () => {
    const { so, mo } = forked();
    const line = comparePromotion(s0, so.id)!.lines.find((l) => l.status === "changed")!;
    const s = mustApply(s0, {
      type: "EditBlockText",
      productionId: main.id as never,
      blockId: line.main!.id,
      text: "Hører du det? Noen roper!",
    });
    const c = comparePromotion(s, so.id)!;
    expect(c.lines.find((l) => l.key === line.key)!.status).toBe("conflict");
    expect(defaultChoice(c).lines).not.toContain(line.key);
    // Endret bare i hovedfilmen: «main_newer» (ingenting å overføre)
    const other = blocksOfVariant(s0, mo.variantId).find(
      (b) => b.kind === "action" && b.id !== line.main!.id,
    )!;
    const s2 = mustApply(s0, {
      type: "EditBlockText",
      productionId: main.id as never,
      blockId: other.id,
      text: `${other.text} Det knirker.`,
    });
    const c2 = comparePromotion(s2, so.id)!;
    expect(c2.lines.find((l) => l.main?.id === other.id)!.status).toBe("main_newer");
  });
});

describe("tilbakeføring – valg (REQ-0376–0379, REQ-0383)", () => {
  it("«behold alt uendret» gir ingen endring (REQ-0376)", () => {
    const { so } = forked();
    expect(promotionCommands(s0, so.id, KEEP_ALL)).toEqual({ commands: [], blocked: null });
  });

  it("bare manusendringene: hovedfilmen får teksten med historikk; spinoffen er uendret; kan angres (REQ-0377/0383)", () => {
    const { so, mo } = forked();
    const c = comparePromotion(s0, so.id)!;
    const plan = promotionCommands(s0, so.id, scriptOnlyChoice(c));
    expect(plan.blocked).toBe(null);
    const { s, undo } = run(s0, plan.commands);
    expect(texts(s, mo.variantId)).toEqual(texts(s0, so.variantId));
    expect(texts(s, so.variantId)).toEqual(texts(s0, so.variantId));
    const line = c.lines.find((l) => l.status === "changed")!;
    // Historikken bevares: ny revisjon, den gamle teksten finnes fortsatt
    const revs = s.blockRevisions.filter((r) => r.blockId === line.main!.id);
    expect(revs.map((r) => r.text)).toContain(line.main!.text);
    expect(revs.map((r) => r.text)).toContain(line.spin!.text);
    // Etterpå er det ingenting igjen å overføre i manuset
    expect(comparePromotion(s, so.id)!.lines.every((l) => l.status === "same")).toBe(true);
    const back = run(s, undo).s;
    expect(texts(back, mo.variantId)).toEqual(texts(s0, mo.variantId));
  });

  it("nye og fjernede linjer i spinoffen kan føres over", () => {
    const { so, mo } = forked();
    const sb = blocksOfVariant(s0, so.variantId);
    const last = sb[sb.length - 1]!;
    const action = sb.find((b) => b.kind === "action")!;
    let s = mustApply(s0, {
      type: "InsertBlock",
      productionId: spinId as never,
      variantId: so.variantId,
      block: {
        blockId: tid(),
        kind: "action",
        text: "Maja løper ut i snøen.",
        orderKey: keyBetween(last.orderKey, null),
      },
    });
    s = mustApply(s, { type: "RemoveBlock", productionId: spinId as never, blockId: action.id });
    const c = comparePromotion(s, so.id)!;
    expect(c.lines.some((l) => l.status === "added")).toBe(true);
    expect(c.lines.some((l) => l.status === "removed")).toBe(true);
    const r = run(s, promotionCommands(s, so.id, scriptOnlyChoice(c)).commands);
    expect(texts(r.s, mo.variantId)).toEqual(texts(s, so.variantId));
    // Den fjernede linjen finnes fortsatt (som fjernet), med historikk
    expect(Object.values(r.s.blocks).some((b) => b.variantId === mo.variantId && b.removed)).toBe(
      true,
    );
  });

  it("bestemte endringer i 2D-scenen, kamera og lyd føres over; resten står (REQ-0378/0379)", () => {
    // Scene 1 deles med spinoffen: lag egen versjon (med kopi av 2D-scenen) og endre den
    const spinOcc = orderedOccurrences(s0, spinId)[0]!;
    const mainOcc = orderedOccurrences(s0, main.id).find((o) => o.sceneId === spinOcc.sceneId)!;
    let s = run(s0, ownCopyCommands(s0, spinOcc.id)!).s;
    const so = s.occurrences[spinOcc.id]!;
    const sc = compositionOfVariant(s, so.variantId)!;
    const mc = compositionOfVariant(s, mainOcc.variantId)!;
    const [l1, l2] = layersOf(s, sc.id).filter((l) => l.kind !== "group");
    s = mustApply(s, {
      type: "UpdateLayers",
      layers: [
        {
          layerId: l1!.id,
          fields: {
            ...layerFieldsOf(l1!),
            transform: { ...l1!.transform, x: l1!.transform.x + 100 },
          },
        },
        { layerId: l2!.id, fields: { ...layerFieldsOf(l2!), name: "Endret navn" } },
      ],
    });
    s = mustApply(s, {
      type: "UpdateComposition",
      compositionId: sc.id,
      fields: {
        name: sc.name,
        width: sc.width,
        height: sc.height,
        durationFrames: sc.durationFrames + 25,
        background: sc.background,
      },
      camera: {
        shots: sc.camera.shots.length
          ? sc.camera.shots.map((sh, i) =>
              i === 0 ? { ...sh, to: { ...sh.to, zoom: sh.to.zoom * 1.2 } } : sh,
            )
          : [
              {
                id: "skudd-spinoff",
                name: "Spinoff",
                startFrame: 0,
                endFrame: 20,
                from: { x: 0, y: 0, zoom: 1, rotation: 0 },
                to: { x: 10, y: 0, zoom: 1.2, rotation: 0 },
                curve: null,
                easing: "linear",
              },
            ],
      },
    });
    const c = comparePromotion(s, so.id)!;
    const changed = c.visual.layers.filter((l) => l.status === "changed");
    expect(changed.length).toBe(2);
    expect(changed.find((l) => l.spin!.id === l1!.id)!.what).toContain("plassering");
    expect(c.timing.changed).toBe(true);
    // Bare det første laget og timingen
    const plan = promotionCommands(s, so.id, {
      ...KEEP_ALL,
      layers: [changed.find((l) => l.spin!.id === l1!.id)!.key],
      timing: true,
    });
    const r = run(s, plan.commands);
    const ml = layersOf(r.s, mc.id);
    const m1 = ml.find((l) => l.orderKey === l1!.orderKey)!;
    const m2 = ml.find((l) => l.orderKey === l2!.orderKey)!;
    expect(m1.transform.x).toBe(l1!.transform.x + 100);
    expect(m2.name).not.toBe("Endret navn");
    expect(r.s.compositions[mc.id]!.durationFrames).toBe(sc.durationFrames + 25);
    expect(JSON.stringify(r.s.compositions[mc.id]!.camera)).toBe(JSON.stringify(mc.camera));
    // Spinoffens 2D-scene er uendret
    expect(layersOf(r.s, sc.id)).toEqual(layersOf(s, sc.id));
    const back = run(r.s, r.undo).s;
    expect(layersOf(back, mc.id).map((l) => layerFieldsOf(l))).toEqual(
      layersOf(s, mc.id).map((l) => layerFieldsOf(l)),
    );
  });

  it("lyd fra spinoffen føres over til hovedfilmens scene (REQ-0379)", () => {
    const { so, mo } = forked();
    const any = Object.values(s0.audioClips)[0]!;
    const s = mustApply(s0, {
      type: "AddAudioClips",
      clips: [
        {
          clipId: tid(),
          fields: {
            occurrenceId: so.id,
            kind: "sfx",
            name: "Bjeller",
            assetId: any.assetId,
            assetVariantId: null,
            versionId: null,
            blockId: null,
            offsetMs: 1000,
            sourceInMs: 0,
            lengthMs: 2000,
            gainDb: 0,
            fadeInMs: 0,
            fadeOutMs: 0,
            muted: false,
            continues: false,
            volumeKeys: [],
          },
        },
      ],
    });
    const c = comparePromotion(s, so.id)!;
    expect(c.audio.filter((a) => a.status === "added").length).toBe(1);
    const r = run(s, promotionCommands(s, so.id, { ...KEEP_ALL, audio: true }).commands);
    expect(
      Object.values(r.s.audioClips).some((a) => a.occurrenceId === mo.id && a.name === "Bjeller"),
    ).toBe(true);
    // Manuset er ikke endret
    expect(texts(r.s, mo.variantId)).toEqual(texts(s0, mo.variantId));
  });

  it("godkjent film i hovedfilmen byttes ikke uten bekreftelse (REQ-0382)", () => {
    // Scene 2 i hovedfilmen bruker en godkjent importert film; spinoffen bruker et kortere utdrag av den
    const mainOcc = orderedOccurrences(s0, main.id).find((o) => o.activeTakeId)!;
    const take = s0.takes[mainOcc.activeTakeId!]!;
    expect(take.status).toBe("approved");
    let s = mustApply(s0, {
      type: "AddOccurrence",
      productionId: spinId as never,
      occurrenceId: tid(),
      sceneId: mainOcc.sceneId,
      variantId: mainOcc.variantId,
      orderKey: keyBetween(orderedOccurrences(s0, spinId).at(-1)!.orderKey, null),
    });
    const spinOcc = orderedOccurrences(s, spinId).find((o) => o.sceneId === mainOcc.sceneId)!;
    s = run(s, ownCopyCommands(s, spinOcc.id)!).s;
    // En gjenbrukt scene uten egen klipping: ingenting å overføre for filmen
    expect(comparePromotion(s, spinOcc.id)!.film.changed).toBe(false);
    s = mustApply(s, {
      type: "SetSceneEdit",
      occurrenceId: spinOcc.id,
      activeTakeId: take.id,
      parts: [{ partId: tid(), source: "take", takeId: take.id, inMs: 1000, outMs: 3000 }],
    });
    const c = comparePromotion(s, spinOcc.id)!;
    expect(c.film.changed).toBe(true);
    expect(c.film.mainApproved).toBe(true);
    expect(defaultChoice(c).film).toBe(false);
    const blocked = promotionCommands(s, spinOcc.id, { ...KEEP_ALL, film: true });
    expect(blocked.blocked).toMatch(/godkjent/);
    expect(blocked.commands).toEqual([]);
    const ok = promotionCommands(s, spinOcc.id, { ...KEEP_ALL, film: true, confirmApproved: true });
    const r = run(s, ok.commands);
    const clip = filmClips(r.s, main.id).find((x) => x.occurrenceId === mainOcc.id)!;
    expect(clip.parts.map((p) => [p.inMs, p.durationFrames])).toEqual([[1000, 50]]);
    // Filmen selv er uendret, og hovedfilmens gamle klipping kan angres tilbake
    expect(r.s.takes[take.id]).toEqual(take);
    expect(filmClips(run(r.s, r.undo).s, main.id)).toEqual(filmClips(s, main.id));
  });
});

describe("ny hovedfilmvariant og ny scene (REQ-0380/0381/0383)", () => {
  it("hovedfilmen får en egen kopi av spinoffens versjon; gamle versjoner finnes og henger sammen", () => {
    const { so, mo } = forked();
    const oldVariant = mo.variantId;
    const plan = newMainVariantCommands(s0, so.id);
    expect(plan.blocked).toBe(null);
    const r = run(s0, plan.commands);
    const nv = r.s.occurrences[mo.id]!.variantId;
    expect(nv).not.toBe(oldVariant);
    expect(texts(r.s, nv)).toEqual(texts(s0, so.variantId));
    // Relasjonene: ny → spinoffens → hovedfilmens gamle
    expect(r.s.variants[nv]!.basedOnVariantId).toBe(so.variantId);
    expect(r.s.variants[so.variantId]!.basedOnVariantId).toBe(oldVariant);
    expect(r.s.variants[oldVariant]).toBeTruthy();
    expect(texts(r.s, oldVariant)).toEqual(texts(s0, oldVariant));
    // Hovedfilmens nye versjon deles (som hovedfilmens andre versjoner), spinoffens er uendret
    expect(r.s.variants[nv]!.ownerProductionId).toBe(null);
    expect(r.s.occurrences[so.id]!.variantId).toBe(so.variantId);
    // Historikken følger med
    const nb = blocksOfVariant(r.s, nv).find((b) => b.text.includes("julenissen"))!;
    expect(r.s.blockRevisions.filter((x) => x.blockId === nb.id).length).toBeGreaterThan(1);
    // Hovedfilmen kan redigere den nye versjonen
    expect(
      applyCommand(
        r.s,
        envelope({
          type: "EditBlockText",
          productionId: main.id as never,
          blockId: nb.id,
          text: "Ho ho!",
        }),
      ).ok,
    ).toBe(true);
    // Angring gir hovedfilmen tilbake den gamle versjonen
    const back = run(r.s, r.undo).s;
    expect(back.occurrences[mo.id]!.variantId).toBe(oldVariant);
    expect(back.variants[nv]).toBeUndefined();
  });

  it("lyd koblet til en linje i hovedfilmen følger med til den nye versjonen", () => {
    // Scene 1: hovedfilmen har dialoglyd koblet til en replikk; spinoffen får egen versjon
    const spinOcc = orderedOccurrences(s0, spinId)[0]!;
    const mainOcc = orderedOccurrences(s0, main.id).find((o) => o.sceneId === spinOcc.sceneId)!;
    const s = run(s0, ownCopyCommands(s0, spinOcc.id)!).s;
    const clip = Object.values(s.audioClips).find(
      (a) => a.occurrenceId === mainOcc.id && a.blockId,
    )!;
    const r = run(s, newMainVariantCommands(s, spinOcc.id).commands);
    const nv = r.s.occurrences[mainOcc.id]!.variantId;
    const moved = r.s.audioClips[clip.id]!;
    expect(r.s.blocks[moved.blockId!]!.variantId).toBe(nv);
    // 2D-scenen er kopiert til den nye versjonen
    expect(compositionOfVariant(r.s, nv)).toBeTruthy();
  });

  it("en ny scene fra spinoffen legges inn i hovedfilmen med egen kopi; spinoffen er uendret (REQ-0381)", () => {
    const spinOccs = orderedOccurrences(s0, spinId);
    const sceneId = tid<"scene">();
    const variantId = tid<"scene_variant">();
    const occurrenceId = tid<"scene_occurrence">();
    let s = mustApply(s0, {
      type: "CreateScene",
      productionId: spinId as never,
      sceneId,
      variantId,
      occurrenceId,
      orderKey: keyBetween(spinOccs[0]!.orderKey, spinOccs[1]!.orderKey),
      heading: { intExt: "EXT.", location: "VEIEN TIL DOVRE", time: "KVELD" },
      blocks: [
        {
          blockId: tid(),
          kind: "action",
          text: "Maja går alene gjennom snøen.",
          orderKey: keyBetween(null, null),
        },
      ],
    });
    expect(
      promotionCandidates(s, spinId).find((c) => c.occurrenceId === occurrenceId)!.mainOccurrenceId,
    ).toBe(null);
    const plan = transferSceneCommands(s, occurrenceId);
    expect(plan.blocked).toBe(null);
    const r = run(s, plan.commands);
    const mainOccs = orderedOccurrences(r.s, main.id);
    const added = mainOccs.find((o) => o.sceneId === sceneId)!;
    expect(added).toBeTruthy();
    // Plassen: rett etter hovedfilmens forekomst av spinoffens forrige scene
    const prevIdx = mainOccs.findIndex((o) => o.sceneId === spinOccs[0]!.sceneId);
    expect(mainOccs[prevIdx + 1]!.id).toBe(added.id);
    expect(added.variantId).not.toBe(variantId);
    expect(r.s.variants[added.variantId]!.ownerProductionId).toBe(null);
    expect(r.s.variants[added.variantId]!.basedOnVariantId).toBe(variantId);
    expect(texts(r.s, added.variantId)).toEqual(texts(s, variantId));
    expect(r.s.occurrences[occurrenceId]!.variantId).toBe(variantId);
    // To ganger går ikke
    expect(transferSceneCommands(r.s, occurrenceId).blocked).toMatch(/allerede/);
    s = run(r.s, r.undo).s;
    expect(orderedOccurrences(s, main.id).some((o) => o.sceneId === sceneId)).toBe(false);
    expect(s.variants[added.variantId]).toBeUndefined();
  });
});

describe("utdrag og sammenbindende scener (REQ-0367/0368/0370)", () => {
  it("spinoffen bruker et utdrag av hovedfilmens ferdige film; filen og hovedfilmen er uendret", () => {
    const mainOcc = orderedOccurrences(s0, main.id).find((o) => o.activeTakeId)!;
    const take = s0.takes[mainOcc.activeTakeId!]!;
    const occurrenceId = tid<"scene_occurrence">();
    let s = mustApply(s0, {
      type: "AddOccurrence",
      productionId: spinId as never,
      occurrenceId,
      sceneId: mainOcc.sceneId,
      variantId: mainOcc.variantId,
      orderKey: keyBetween(orderedOccurrences(s0, spinId).at(-1)!.orderKey, null),
    });
    s = mustApply(s, {
      type: "SetSceneEdit",
      occurrenceId,
      activeTakeId: take.id,
      parts: [{ partId: tid(), source: "take", takeId: take.id, inMs: 2000, outMs: 6000 }],
    });
    const clip = filmClips(s, spinId).find((c) => c.occurrenceId === occurrenceId)!;
    expect(framesToSeconds(clip.durationFrames, s.project.fps)).toBeCloseTo(4, 1);
    expect(clip.parts[0]!.inMs).toBe(2000);
    expect(s.takes[take.id]).toEqual(take);
    expect(filmClips(s, main.id)).toEqual(filmClips(s0, main.id));
  });

  it("en ny sammenbindende scene og en overgang i spinoffen endrer ikke hovedfilmen", () => {
    const spinOccs = orderedOccurrences(s0, spinId);
    const occurrenceId = tid<"scene_occurrence">();
    let s = mustApply(s0, {
      type: "CreateScene",
      productionId: spinId as never,
      sceneId: tid(),
      variantId: tid(),
      occurrenceId,
      orderKey: keyBetween(spinOccs[1]!.orderKey, spinOccs[2]!.orderKey),
      heading: { intExt: "INT.", location: "GANGEN", time: "NATT" },
      blocks: [
        {
          blockId: tid(),
          kind: "action",
          text: "Det banker igjen.",
          orderKey: keyBetween(null, null),
        },
      ],
    });
    s = mustApply(s, {
      type: "SetTransition",
      occurrenceId,
      transition: { kind: "dissolve", frames: 12 },
    });
    expect(orderedOccurrences(s, spinId).map((o) => o.id)).toContain(occurrenceId);
    expect(orderedOccurrences(s, main.id)).toEqual(orderedOccurrences(s0, main.id));
    expect(filmClips(s, main.id)).toEqual(filmClips(s0, main.id));
  });
});

describe("tilbakeføring – rettelser etter gjennomgang", () => {
  it("hovedfilmens lyd, tidskoblinger og film fjernes aldri bare fordi spinoffen ikke har dem", () => {
    const spinOcc = orderedOccurrences(s0, spinId)[0]!;
    const s = run(s0, ownCopyCommands(s0, spinOcc.id)!).s;
    const c = comparePromotion(s, spinOcc.id)!;
    expect(c.audio.some((a) => a.status === "removed")).toBe(false);
    expect(c.timing.links).toBe(0);
    expect(c.film.changed).toBe(false);
    expect(c.visual.layers.some((l) => l.status === "removed")).toBe(false);
    const plan = promotionCommands(s, spinOcc.id, defaultChoice(c));
    expect(
      plan.commands.some(
        (x) =>
          x.type === "SetAudioClipsRemoved" ||
          x.type === "SetTimeLinksRemoved" ||
          x.type === "SetSceneEdit" ||
          x.type === "SetLayersRemoved",
      ),
    ).toBe(false);
  });

  it("lag lagt til hver for seg på samme plass regnes ikke som samme lag", () => {
    const spinOcc = orderedOccurrences(s0, spinId)[0]!;
    const mainOcc = orderedOccurrences(s0, main.id).find((o) => o.sceneId === spinOcc.sceneId)!;
    let s = run(s0, ownCopyCommands(s0, spinOcc.id)!).s;
    const sc = compositionOfVariant(s, s.occurrences[spinOcc.id]!.variantId)!;
    const mc = compositionOfVariant(s, mainOcc.variantId)!;
    const base = layersOf(s, mc.id)[0]!;
    const fill = (name: string, color: string) => ({
      ...layerFieldsOf(base),
      kind: "foreground" as const,
      name,
      assetId: null,
      assetVariantId: null,
      versionId: null,
      fill: color,
      swaps: [],
      path: null,
      groupId: null,
      anchor: null,
    });
    s = mustApply(s, {
      type: "AddLayers",
      layers: [
        {
          layerId: tid(),
          compositionId: mc.id,
          fields: { ...fill("Hoved", "#ff0000"), kind: "effect" },
        },
      ],
    });
    s = mustApply(s, {
      type: "AddLayers",
      layers: [{ layerId: tid(), compositionId: sc.id, fields: fill("Spinoff", "#00ff00") }],
    });
    const c = comparePromotion(s, spinOcc.id)!;
    const d = c.visual.layers.find((l) => l.spin?.name === "Spinoff")!;
    expect(d.status).toBe("added");
    const r = run(s, promotionCommands(s, spinOcc.id, { ...KEEP_ALL, layers: [d.key] }).commands);
    const names = layersOf(r.s, mc.id).map((l) => l.name);
    expect(names).toContain("Hoved");
    expect(names).toContain("Spinoff");
  });

  it("ny hovedfilmversjon kan angres selv om spinoffen er endret etterpå", () => {
    const { so, mo } = forked();
    const r = run(s0, newMainVariantCommands(s0, so.id).commands);
    const line = blocksOfVariant(r.s, so.variantId).find((b) => b.kind === "action")!;
    const s = mustApply(r.s, {
      type: "EditBlockText",
      productionId: spinId as never,
      blockId: line.id,
      text: "Endret i spinoffen etterpå.",
    });
    const back = run(s, r.undo).s;
    expect(back.occurrences[mo.id]!.variantId).toBe(mo.variantId);
    // Men en endring i hovedfilmens nye versjon må angres først
    const nb = blocksOfVariant(r.s, r.s.occurrences[mo.id]!.variantId)[1]!;
    const edited = mustApply(r.s, {
      type: "EditBlockText",
      productionId: main.id as never,
      blockId: nb.id,
      text: "Endret i hovedfilmen.",
    });
    expect(() => run(edited, r.undo)).toThrow(/endret/);
  });

  it("overføring med tidskoblinger kan angres", () => {
    const spinOccs = orderedOccurrences(s0, spinId);
    const occurrenceId = tid<"scene_occurrence">();
    const blockId = tid<"script_block">();
    let s = mustApply(s0, {
      type: "CreateScene",
      productionId: spinId as never,
      sceneId: tid(),
      variantId: tid(),
      occurrenceId,
      orderKey: keyBetween(spinOccs.at(-1)!.orderKey, null),
      heading: { intExt: "EXT.", location: "VEIEN", time: "NATT" },
      blocks: [{ blockId, kind: "action", text: "Hun løper.", orderKey: keyBetween(null, null) }],
    });
    s = mustApply(s, {
      type: "AddTimeLinks",
      links: [{ linkId: tid(), fields: { occurrenceId, blockId, startMs: 500, endMs: 1500 } }],
    });
    const r = run(s, transferSceneCommands(s, occurrenceId).commands);
    const back = run(r.s, r.undo).s;
    expect(orderedOccurrences(back, main.id)).toEqual(orderedOccurrences(s, main.id));
  });
});
