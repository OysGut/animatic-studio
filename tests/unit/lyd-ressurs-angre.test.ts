// @vitest-environment node
/** KI-56: en ny lydressurs (ressurs, variant og første versjon) angres i ett steg – samme gruppe. */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/adapters/browser/storage-files", () => ({ uploadFile: vi.fn(async () => null) }));
vi.mock("@/engine/import/browser", () => ({ sha256Hex: vi.fn(async () => "a".repeat(64)) }));

import { createSoundAsset } from "@/app/library/asset-audio";

class FakeAudioContext {
  async decodeAudioData() {
    return { duration: 1.5 };
  }
}

describe("KI-56 – ny lyd er ett angresteg", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("alle tre endringene sendes med samme gruppe", async () => {
    vi.stubGlobal("OfflineAudioContext", FakeAudioContext);
    const calls: { type: string; group: string | undefined }[] = [];
    const cmds = {
      runAndWait: vi.fn(async (command: { type: string }, _label: string, group?: string) => {
        calls.push({ type: command.type, group });
        return { error: null, commandId: "c" };
      }),
    };
    const file = new File([new Uint8Array([1, 2, 3])], "vind_i_traerne.mp3", {
      type: "audio/mpeg",
    });
    const r = await createSoundAsset(cmds as never, "prosjekt", file, "Vind");
    expect(r.durationMs).toBe(1500);
    expect(calls.map((c) => c.type)).toEqual([
      "CreateAssets",
      "CreateAssetVariant",
      "AddAssetVersion",
    ]);
    expect(calls[0]!.group).toBeTruthy();
    expect(new Set(calls.map((c) => c.group)).size).toBe(1);
  });
});
