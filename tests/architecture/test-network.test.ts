// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { denyTestNetwork } from "../helpers/network-guard";

describe("DV4 test network isolation", () => {
  it("blocks real provider requests without a mock", () => {
    expect(() => globalThis.fetch("https://api.elevenlabs.io/v1/models")).toThrow("Test network blocked");
    expect(() => denyTestNetwork()).toThrow("Test network blocked");
  });
  it("allows a fake response then restores the network guard", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("mock")));
    expect(await (await fetch("https://api.elevenlabs.io/v1/models")).text()).toBe("mock");
    vi.unstubAllGlobals();
    expect(() => fetch("https://api.elevenlabs.io/v1/models")).toThrow("Test network blocked");
  });
});