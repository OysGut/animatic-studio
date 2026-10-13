// @vitest-environment node
/**
 * Funn fra Mars' testrunde 13.10.2026 (DEC-0079): formater ved opplasting, nedskalering av store bilder,
 * siste beskrivelse per ressurs, bildestørrelse og tydelig melding når forbindelsen brytes.
 */
import { describe, expect, it } from "vitest";
import {
  applyCommand,
  assetSymbol,
  assetSymbolColors,
  assetUsageCounts,
  filmClips,
  flipInPlace,
  flippedTransformPatch,
  fullSizeOriginal,
  layersOf,
  mainProduction,
  paintPixels,
  renderFrame,
  sceneDialogueLines,
  scriptMentions,
  sortedAssets,
  steppedFrame,
  trashContents,
  versionsOf,
  voiceUsers,
  estimateCostUsd,
  type GenerationJob,
  imageSizesOf,
  jobForResult,
  lastImagePrompt,
  providerModel,
  scaledToFit,
  workingImageMaxSide,
} from "@/core";
import { mimeOf } from "@/app/assembly/film-import";
import { isTiff, withExtension } from "@/app/library/image-prep";
import { checkImageFile } from "@/app/library/asset-images";
import { lostConnection } from "@/app/library/GenerateImagePanel";
import { withSpeed, withTrim } from "@/app/audio/AudioClipEditor";
import { scheduleOne } from "@/engine/audio/mixer";
import { envelope, mustApply, tid } from "../helpers/fixtures";
import { fixture } from "../visual/fixture-state";

const s0 = fixture.state;
const main = mainProduction(s0)!;
const anyAsset = Object.values(s0.assets).find(
  (a) => a.kind === "character" && Object.values(s0.assetVariants).some((v) => v.assetId === a.id),
)!;

const job = (over: Partial<GenerationJob>): GenerationJob => ({
  id: "j",
  kind: "image",
  provider: "google",
  model: "gemini-3-pro-image",
  prompt: "",
  assetId: "a1",
  status: "done",
  error: null,
  resultPath: null,
  resultText: null,
  createdAt: "2026-10-13T10:00:00Z",
  finishedAt: null,
  createdBy: "u",
  estimatedCost: null,
  occurrenceId: null,
  segmentId: null,
  ...over,
});

describe("filmformater ved opplasting", () => {
  it("MP4 i alle varianter, MOV og WebM gjenkjennes – også uten oppgitt type", () => {
    expect(mimeOf({ name: "klipp.MP4", type: "" })).toBe("video/mp4");
    expect(mimeOf({ name: "klipp.m4v", type: "video/x-m4v" })).toBe("video/mp4");
    expect(mimeOf({ name: "klipp.mov", type: "" })).toBe("video/quicktime");
    expect(mimeOf({ name: "klipp.qt", type: "" })).toBe("video/quicktime");
    expect(mimeOf({ name: "klipp.webm", type: "video/webm" })).toBe("video/webm");
    expect(mimeOf({ name: "klipp.avi", type: "video/x-msvideo" })).toBe("video/x-msvideo");
  });

  it("en film valgt som bilde gir en forklaring, ikke en feil om bildeformat", () => {
    const f = new File([new Uint8Array([1])], "scene.mp4", { type: "video/mp4" });
    expect(checkImageFile(f)).toMatch(/monteringen/);
  });

  it("TIFF godtas som bilde (gjøres om til PNG)", () => {
    const t = new File([new Uint8Array([1])], "plate.tif", { type: "image/tiff" });
    expect(isTiff(t)).toBe(true);
    expect(isTiff(new File([new Uint8Array([1])], "PLATE.TIFF", { type: "" }))).toBe(true);
    expect(checkImageFile(t)).toBe(null);
    expect(withExtension("plate.tiff", "png")).toBe("plate.png");
    expect(withExtension("uten-endelse", "png")).toBe("uten-endelse.png");
  });
});

describe("nedskalering av store bilder", () => {
  it("grensen er to ganger filmformatets lengste side, aldri under 2048 px", () => {
    expect(workingImageMaxSide(1920, 1080)).toBe(3840);
    expect(workingImageMaxSide(800, 600)).toBe(2048);
    expect(workingImageMaxSide(4096, 1716)).toBe(8192);
  });

  it("skalerer med samme forhold, og lar små bilder være", () => {
    expect(scaledToFit(6000, 4000, 3840)).toEqual({ width: 3840, height: 2560 });
    expect(scaledToFit(3000, 9000, 3840)).toEqual({ width: 1280, height: 3840 });
    expect(scaledToFit(3840, 2000, 3840)).toBe(null);
    expect(scaledToFit(0, 0, 3840)).toBe(null);
  });
});

describe("beskrivelsene følger bildene", () => {
  it("siste beskrivelse for ressursen huskes (også et feilet forsøk)", () => {
    const jobs = [
      job({ id: "1", prompt: "Eldre", createdAt: "2026-10-12T10:00:00Z" }),
      job({ id: "2", prompt: "Nyeste", status: "failed", createdAt: "2026-10-13T09:00:00Z" }),
      job({ id: "3", prompt: "Annen ressurs", assetId: "a2", createdAt: "2026-10-13T11:00:00Z" }),
      job({ id: "4", prompt: "Video", kind: "video", createdAt: "2026-10-13T12:00:00Z" }),
    ];
    expect(lastImagePrompt(jobs, "a1")?.prompt).toBe("Nyeste");
    expect(lastImagePrompt(jobs, "a1")?.when).toMatch(/2026 kl\. /);
    expect(lastImagePrompt(jobs, "ingen")).toBe(null);
  });

  it("beskrivelsen til et bilde finnes fra stien", () => {
    const jobs = [job({ id: "x", prompt: "Fyret i tåke", resultPath: "p/a/v/ai.png" })];
    expect(jobForResult(jobs, "p/a/v/ai.png")?.prompt).toBe("Fyret i tåke");
    expect(jobForResult(jobs, "p/a/v/annet.png")).toBe(null);
  });
});

describe("bildestørrelse som eget valg", () => {
  it("Nano Banana Pro tilbyr 1K, 2K og 4K med 2K som standard; 4K koster mer", () => {
    const pro = providerModel("google", "gemini-3-pro-image");
    expect(imageSizesOf(pro)).toEqual({ sizes: ["1K", "2K", "4K"], standard: "2K" });
    expect(estimateCostUsd("google", "gemini-3-pro-image", { size: "4K" })).toBeCloseTo(0.24);
    expect(estimateCostUsd("google", "gemini-3-pro-image", { size: "2K" })).toBeCloseTo(0.14);
    expect(imageSizesOf(providerModel("openai", "gpt-image-2.5-flare")).sizes).toEqual([]);
  });
});

describe("brutt forbindelse", () => {
  it("«Internal server error» forklares: bildet kan være laget og betalt", () => {
    expect(lostConnection("Internal Server Error")).toMatch(/kan likevel ha laget/);
    expect(lostConnection("")).toMatch(/Forbindelsen/);
    expect(lostConnection("Budsjettet er brukt opp")).toBe("Budsjettet er brukt opp");
  });
});

describe("slettede objekter (DEC-0079)", () => {
  it("en slettet ressurs forsvinner fra lister og lagvalg, ligger i «Slettede objekter» og kan hentes inn igjen", () => {
    const s = mustApply(s0, { type: "SetAssetsRemoved", assetIds: [anyAsset.id], removed: true });
    expect(sortedAssets(s).some((a) => a.id === anyAsset.id)).toBe(false);
    expect(trashContents(s).assets.map((a) => a.id)).toEqual([anyAsset.id]);
    const back = mustApply(s, {
      type: "SetAssetsRemoved",
      assetIds: [anyAsset.id],
      removed: false,
    });
    expect(back.assets[anyAsset.id]!.removed).toBeUndefined();
    expect(trashContents(back).assets).toEqual([]);
    // Angre gir samme tilstand
    const r = applyCommand(
      s0,
      envelope({ type: "SetAssetsRemoved", assetIds: [anyAsset.id], removed: true }),
    );
    expect(r.ok && r.inverse).toEqual({
      type: "SetAssetsRemoved",
      assetIds: [anyAsset.id],
      removed: false,
    });
  });

  it("et bilde kan slettes – men ikke det godkjente", () => {
    const va = Object.values(s0.assetVariants).find(
      (v) => v.approvedVersionId && versionsOf(s0, v.id).length > 1,
    );
    if (!va) return;
    const other = versionsOf(s0, va.id).find((v) => v.id !== va.approvedVersionId)!;
    const s = mustApply(s0, {
      type: "SetAssetVersionsRemoved",
      versionIds: [other.id],
      removed: true,
    });
    expect(versionsOf(s, va.id).some((v) => v.id === other.id)).toBe(false);
    expect(trashContents(s).versions.map((x) => x.version.id)).toEqual([other.id]);
    const r = applyCommand(
      s0,
      envelope({
        type: "SetAssetVersionsRemoved",
        versionIds: [va.approvedVersionId!],
        removed: true,
      }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toMatch(/godkjent/);
  });

  it("advarselen teller lag og lyd som bruker ressursen", () => {
    const used = Object.values(s0.layers).find((l) => l.assetId && !l.removed);
    if (!used?.assetId) return;
    expect(assetUsageCounts(s0, used.assetId).layers).toBeGreaterThan(0);
  });

  it("originalen til en nedskalert arbeidskopi finnes (versjonen før, med merknaden)", () => {
    const va = Object.values(s0.assetVariants)[0]!;
    const o = tid<"asset_version">();
    const w = tid<"asset_version">();
    const media = (n: string) => ({
      path: `${s0.project.id}/${va.assetId}/${n}/x.png`,
      mimeType: "image/png",
      width: 10,
      height: 10,
      byteSize: 10,
      sha256: "a".repeat(64),
    });
    let s = mustApply(s0, {
      type: "AddAssetVersion",
      versionId: o,
      variantId: va.id,
      media: media(o),
      note: "Original i full størrelse (6000 × 4000 px). Brukes ikke før den godkjennes.",
    });
    s = mustApply(s, {
      type: "AddAssetVersion",
      versionId: w,
      variantId: va.id,
      media: media(w),
      note: "Arbeidskopi skalert ned",
    });
    expect(fullSizeOriginal(s, w)?.id).toBe(o);
    expect(fullSizeOriginal(s, o)).toBe(null);
  });
});

describe("lyd: hastighet og masker (DEC-0079)", () => {
  const clip = { lengthMs: 4000, speed: 1, sourceInMs: 1000, volumeKeys: [{ t: 2000, db: -6 }] };
  it("dobbel hastighet halverer lengden; volumpunktene følger lyden", () => {
    expect(withSpeed(clip, 200)).toEqual({
      speed: 2,
      lengthMs: 2000,
      volumeKeys: [{ t: 1000, db: -6 }],
    });
    expect(withSpeed(clip, 25).lengthMs).toBe(16000);
    expect(withSpeed(clip, 1000).speed).toBe(4);
  });
  it("masker for start og slutt gir ny varighet, i lydfilens tid", () => {
    expect(withTrim({ ...clip, speed: 2 }, 2, 5)).toEqual({
      sourceInMs: 2000,
      lengthMs: 1500,
      volumeKeys: [{ t: 1500, db: -6 }],
    });
  });
  it("mikseren spiller lydfilen raskere og like langt inn", () => {
    const started: { when: number; offset: number; dur: number; rate: number }[] = [];
    const ctx = {
      currentTime: 0,
      createBufferSource: () => {
        const node = {
          buffer: null,
          playbackRate: { setValueAtTime: (v: number) => (node.rate = v) },
          rate: 1,
          connect: (x: unknown) => x,
          start: (when: number, offset: number, dur: number) =>
            started.push({ when, offset, dur, rate: node.rate }),
        };
        return node;
      },
      createGain: () => ({
        gain: { setValueAtTime: () => undefined, linearRampToValueAtTime: () => undefined },
        connect: (x: unknown) => x,
      }),
    };
    const buf = { duration: 20 } as AudioBuffer;
    scheduleOne(
      ctx as never,
      {} as never,
      {
        clip: {} as never,
        version: null,
        start: 0,
        length: 2,
        fullLength: 2,
        sourceIn: 1,
        speed: 2,
        gain: 1,
        fadeIn: 0,
        fadeOut: 0,
        keys: [],
      },
      buf as never,
      { from: 0.5, startAt: 0 },
    );
    expect(started).toEqual([{ when: 0, offset: 2, dur: 3, rate: 2 }]);
  });
});

describe("scene: toere, speilvending og symboler (DEC-0079)", () => {
  it("på toere står bevegelsen stille annethvert bilde", () => {
    expect([0, 1, 2, 3, 4, 5].map((f) => steppedFrame(f, 2))).toEqual([0, 0, 2, 2, 4, 4]);
    expect(steppedFrame(7, undefined)).toBe(7);
    const comp = Object.values(s0.compositions).find(
      (c) => !c.removed && layersOf(s0, c.id).length,
    );
    if (!comp) return;
    const s = mustApply(s0, { type: "SetCompositionStep", compositionId: comp.id, step: 2 });
    expect(renderFrame(s, comp.id, 3)).toEqual(renderFrame(s, comp.id, 2));
  });

  it("speilvending snur skaleringen, også i nøkkelbildene", () => {
    const p = flippedTransformPatch(
      {
        transform: { x: 0, y: 0, scaleX: 0.5, scaleY: 1, rotation: 0, opacity: 1 },
        keyframes: [{ property: "scaleX", frame: 3, value: 0.8, easing: "linear" } as never],
      },
      "x",
    );
    expect(p.transform.scaleX).toBe(-0.5);
    expect((p.keyframes[0] as { value: number }).value).toBe(-0.8);
  });

  it("hver ressurs får et symbol: form etter type, ulik farge", () => {
    const colors = assetSymbolColors(s0);
    const chars = Object.values(s0.assets).filter((a) => a.kind === "character");
    expect(new Set(chars.map((a) => colors.get(a.id))).size).toBe(chars.length);
    expect(assetSymbol(s0, chars[0]!.id)?.shape).toBe("figure");
    // Lag uten bilde tegnes med symbolet
    const comp = Object.values(s0.compositions).find((c) => !c.removed)!;
    const lid = tid<"composition_layer">();
    const plain = mustApply(s0, {
      type: "CreateAssets",
      assets: [
        {
          assetId: tid<"asset">(),
          fields: {
            kind: "object",
            name: "Lykt",
            names: [],
            description: "",
            category: "",
            tags: [],
          },
        },
      ],
    });
    const newAsset = Object.values(plain.assets).find((a) => a.name === "Lykt")!;
    const withLayer = mustApply(plain, {
      type: "AddLayers",
      layers: [
        {
          layerId: lid,
          compositionId: comp.id,
          fields: {
            kind: "object",
            name: "Lykt",
            assetId: newAsset.id,
            assetVariantId: null,
            versionId: null,
            fill: null,
            width: 100,
            height: 100,
            parallax: 1,
            transform: { x: 50, y: 50, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 },
            keyframes: [],
            visible: true,
            locked: false,
            groupId: null,
            swaps: [],
            path: null,
            anchor: null,
          } as never,
        },
      ],
    });
    const item = renderFrame(withLayer, comp.id, 0).items.find((i) => i.layerId === lid);
    expect(item?.symbol?.color).toBe(assetSymbolColors(withLayer).get(newAsset.id));
  });

  it("tegning og speilvending i frileggingen", () => {
    const px = new Uint8ClampedArray(4 * 4 * 4);
    paintPixels(px, 4, 4, { points: [{ x: 0, y: 0 }], radius: 1, hardness: 1, color: [255, 0, 0] });
    expect([...px.subarray(0, 4)]).toEqual([255, 0, 0, 255]);
    flipInPlace(px, 4, 4, 4, "x");
    expect([...px.subarray(12, 16)]).toEqual([255, 0, 0, 255]);
    const m = new Uint8Array([1, 2, 3, 4]);
    flipInPlace(m, 2, 2, 1, "y");
    expect([...m]).toEqual([3, 4, 1, 2]);
  });
});

describe("AI-tekst fra manuset og stemmer (DEC-0079)", () => {
  it("bildebeskrivelsen henter setningene der manuset omtaler ressursen", () => {
    const said = scriptMentions(s0, main.id, anyAsset);
    expect(said.length).toBeGreaterThan(0);
    const names = [anyAsset.name, ...anyAsset.names.map((n) => n.name)].map((n) => n.toLowerCase());
    expect(said.every((x) => names.some((n) => x.text.toLowerCase().includes(n)))).toBe(true);
    expect(said.reduce((t, x) => t + x.text.length, 0)).toBeLessThanOrEqual(1200);
  });

  it("dialoglista viser hva som har lyd, og hvem som bruker hver stemme", () => {
    const clip = filmClips(s0, main.id).find((c) =>
      sceneDialogueLines(s0, c).some((l) => l.character),
    )!;
    const lines = sceneDialogueLines(s0, clip);
    expect(lines.every((l) => (l.audio !== null) === l.hasAudio)).toBe(true);
    const a = lines.find((l) => l.character)!.character!;
    const s = mustApply(s0, {
      type: "SetAssetVoice",
      assetId: a.id,
      voice: { provider: "elevenlabs", voiceId: "v1", label: "Ingrid" },
    } as never);
    expect(voiceUsers(s).get("v1")).toEqual([a.name]);
  });
});
