/**
 * Fase 2, bolk B (DEC-0093, REQ-0684–0690): lydopptak som takes. Et nytt take blir alltid en ny versjon (et
 * tidligere overskrives aldri), første opptak av en replikk legges i scenen der replikken begynner, senere
 * takes blir aktive først når brukeren velger dem, romlyd havner i egen ressurs, og mobilens opptak blir
 * takes når de kommer inn.
 */
import { describe, expect, it, vi } from "vitest";
import {
  applyCommand,
  audioTakeLabel,
  formatTakeLength,
  isRoomToneFile,
  lineInfo,
  lineTitle,
  mediaKindsFor,
  orderedOccurrences,
  parseUploadContext,
  roomToneAsset,
  scriptForLine,
  soundTakes,
  takeFileName,
  type Command,
  type ProjectState,
} from "@/core";
import { envelope } from "../helpers/fixtures";
import { fixture } from "../visual/fixture-state";

vi.mock("@/adapters/browser/mobile-import", () => ({
  claimMobileImport: vi.fn(() => Promise.resolve(true)),
  linkMobileImport: vi.fn(() => Promise.resolve(null)),
  fetchMobileImports: vi.fn(),
  fetchUploadSessions: vi.fn(),
  subscribeMobileImports: vi.fn(),
}));
vi.mock("@/app/library/asset-audio", () => ({
  audioMediaFromStoredFile: vi.fn((path: string, mime: string) =>
    Promise.resolve({
      path,
      mimeType: mime,
      width: null,
      height: null,
      byteSize: 1000,
      sha256: "1".repeat(64),
      durationMs: 4200,
    }),
  ),
}));

const { saveTake, saveRoomTone, chooseTake } = await import("@/app/audio/takes");
const { importAudio } = await import("@/app/mobile/use-mobile-imports");

const P = fixture.project.id;
let n = 0;
const media = (ms = 3000) => ({
  path: `${P}/source/x/${++n}.webm`,
  mimeType: "audio/webm",
  width: null,
  height: null,
  byteSize: 1000,
  sha256: "a".repeat(64),
  durationMs: ms,
});

function fakeCmds(start: ProjectState) {
  let s = start;
  const sent: Command[] = [];
  return {
    sent,
    current: () => s,
    runAndWait: (c: Command) => {
      sent.push(c);
      const r = applyCommand(s, envelope(c));
      if (!r.ok) return Promise.resolve({ error: r.error.message, commandId: null });
      s = r.state;
      return Promise.resolve({ error: null, commandId: null });
    },
  };
}

const main = Object.values(fixture.state.productions).find((p) => p.kind === "main")!;
/** En replikk uten lyd i en aktiv scene. */
function silentLine(s: ProjectState) {
  for (const o of orderedOccurrences(s, main.id).filter((x) => x.active))
    for (const b of Object.values(s.blocks))
      if (b.variantId === o.variantId && b.kind === "dialogue" && !b.removed) {
        const info = lineInfo(s, o.id, b.id);
        if (info && !info.clip) return info;
      }
  throw new Error("fant ingen replikk uten lyd");
}

describe("kontekstene for lydopptak", () => {
  it("lydressurs og replikk tar bare imot lyd; ugyldige ID-er avvises", () => {
    const a = "00000000-0000-7000-8000-0000000000a1";
    const b = "00000000-0000-7000-8000-0000000000b1";
    expect(parseUploadContext({ type: "sound", assetId: a })).toEqual({
      type: "sound",
      assetId: a,
    });
    expect(parseUploadContext({ type: "line", occurrenceId: a, blockId: b })).toEqual({
      type: "line",
      occurrenceId: a,
      blockId: b,
    });
    expect(parseUploadContext({ type: "line", occurrenceId: a })).toBeNull();
    expect(parseUploadContext({ type: "sound", assetId: "x" })).toBeNull();
    expect(mediaKindsFor({ type: "sound", assetId: a })).toEqual(["audio"]);
    expect(mediaKindsFor({ type: "line", occurrenceId: a, blockId: b })).toEqual(["audio"]);
  });

  it("filnavn, romlyd og visning av takes", () => {
    expect(takeFileName(3, "webm")).toBe("take-03.webm");
    expect(takeFileName(1, "m4a", true)).toBe("romlyd-01.m4a");
    expect(isRoomToneFile("romlyd-01.m4a")).toBe(true);
    expect(isRoomToneFile("take-01.webm")).toBe(false);
    expect(audioTakeLabel(2)).toBe("Take 02");
    expect(formatTakeLength(12_400)).toBe("0:12");
    expect(formatTakeLength(65_000)).toBe("1:05");
  });

  it("mobilen får replikken med karakter og regianvisning (serveren leser blokkene)", () => {
    const blocks = [
      { id: "h", kind: "heading", text: "INT. STUE" },
      { id: "c", kind: "character", text: "MAJA" },
      { id: "p", kind: "parenthetical", text: "(hvisker)" },
      { id: "d", kind: "dialogue", text: "Jeg tror det er\\nnoen der ute." },
      { id: "a", kind: "action", text: "Det knirker." },
    ];
    expect(scriptForLine(blocks, "d")).toEqual({
      speaker: "MAJA",
      parenthetical: "(hvisker)",
      text: "Jeg tror det er\\nnoen der ute.",
    });
    expect(scriptForLine(blocks, "a")).toBeNull();
  });
});

describe("takes for en replikk", () => {
  it("første opptak lager lydressurs og lydklipp der replikken begynner; neste take erstatter ikke", async () => {
    const info = silentLine(fixture.state);
    const cmds = fakeCmds(fixture.state);
    const target = {
      kind: "line",
      occurrenceId: info.occurrenceId,
      blockId: info.blockId,
    } as const;
    const first = await saveTake(cmds, cmds.current(), target, media(3000), "Opptak");
    expect(first.clipId).not.toBeNull();
    const after1 = lineInfo(cmds.current(), info.occurrenceId, info.blockId)!;
    expect(after1.clip?.versionId).toBe(first.versionId);
    expect(after1.clip?.offsetMs).toBe(info.startMs);
    expect(after1.clip?.lengthMs).toBe(3000);
    expect(cmds.current().assets[first.assetId]?.name).toBe(lineTitle(info));

    const second = await saveTake(cmds, cmds.current(), target, media(4500), "Opptak");
    expect(second.clipId).toBeNull();
    expect(second.assetId).toBe(first.assetId);
    const takes = soundTakes(cmds.current(), first.assetId);
    expect(takes.map((t) => t.number)).toEqual([1, 2]);
    // Det første er fortsatt aktivt til brukeren velger noe annet
    expect(lineInfo(cmds.current(), info.occurrenceId, info.blockId)!.clip?.versionId).toBe(
      first.versionId,
    );

    await chooseTake(cmds, cmds.current(), target, {
      variantId: second.variantId,
      versionId: second.versionId,
      durationMs: 4500,
    });
    const chosen = lineInfo(cmds.current(), info.occurrenceId, info.blockId)!.clip!;
    expect(chosen.versionId).toBe(second.versionId);
    expect(chosen.lengthMs).toBe(4500);
    expect(soundTakes(cmds.current(), first.assetId).find((t) => t.approved)?.versionId).toBe(
      second.versionId,
    );
    // Begge opptakene finnes fortsatt
    expect(soundTakes(cmds.current(), first.assetId)).toHaveLength(2);
  });

  it("romlyd havner i én romlydressurs per sted, merket «romlyd»", async () => {
    const cmds = fakeCmds(fixture.state);
    const a = await saveRoomTone(cmds, cmds.current(), "Scene 7", media(5000), "");
    const b = await saveRoomTone(cmds, cmds.current(), "Scene 7", media(5000), "");
    expect(b.assetId).toBe(a.assetId);
    const asset = roomToneAsset(cmds.current(), "Scene 7")!;
    expect(asset.tags).toContain("romlyd");
    expect(soundTakes(cmds.current(), asset.id)).toHaveLength(2);
  });
});

describe("opptak fra mobilen", () => {
  it("to takes fra mobilen til samme replikk gir én lydressurs med to takes", async () => {
    const info = silentLine(fixture.state);
    const cmds = fakeCmds(fixture.state);
    const row = (id: string, file: string) =>
      ({
        id,
        project_id: P,
        session_id: "s",
        path: `${P}/source/mobile/s/${id}.webm`,
        kind: "audio",
        mime_type: "audio/webm",
        file_name: file,
        status: "done",
        contributor_name: "Kari",
        context: { type: "line", occurrenceId: info.occurrenceId, blockId: info.blockId },
        asset_id: null,
        asset_version_id: null,
        dismissed: false,
      }) as never;
    let chain: Promise<unknown> = Promise.resolve();
    for (const [id, f] of [
      ["00000000-0000-7000-8000-0000000d0001", "take-01.webm"],
      ["00000000-0000-7000-8000-0000000d0002", "take-02.webm"],
      ["00000000-0000-7000-8000-0000000d0003", "romlyd-01.webm"],
    ] as const)
      chain = chain.then(async () => {
        expect(await importAudio(cmds.current(), cmds as never, row(id, f))).toBeNull();
      });
    await chain;
    const s = cmds.current();
    const clip = lineInfo(s, info.occurrenceId, info.blockId)!.clip!;
    const takes = soundTakes(s, clip.assetId);
    expect(takes).toHaveLength(2);
    expect(takes[0]!.note).toContain("Kari");
    expect(clip.versionId).toBe(takes[0]!.versionId);
    expect(Object.values(s.assets).filter((a) => a.tags.includes("romlyd"))).toHaveLength(1);
  });
});
