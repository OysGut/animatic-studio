import { afterEach, describe, expect, it, vi } from "vitest";
import { createActiveSceneBus, type SceneMessage, type SceneTransport } from "@/app/shell/active-scene-bus";
import { act, renderHook } from "@testing-library/react";

class MockBroadcastChannel {
  static channels = new Set<MockBroadcastChannel>();
  listeners = new Set<(event: MessageEvent) => void>();
  constructor(readonly name: string) { MockBroadcastChannel.channels.add(this); }
  postMessage(data: SceneMessage) { for (const channel of MockBroadcastChannel.channels) if (channel !== this && channel.name === this.name) for (const fn of channel.listeners) fn({ data } as MessageEvent); }
  addEventListener(_type: string, fn: (event: MessageEvent) => void) { this.listeners.add(fn); }
  removeEventListener(_type: string, fn: (event: MessageEvent) => void) { this.listeners.delete(fn); }
  close() { MockBroadcastChannel.channels.delete(this); }
}
function transport(channel: MockBroadcastChannel): SceneTransport {
  return { send: (message) => channel.postMessage(message), listen: (receive) => { const fn = (e: MessageEvent) => receive(e.data); channel.addEventListener("message", fn); return () => channel.removeEventListener("message", fn); }, close: () => channel.close() };
}
afterEach(() => { MockBroadcastChannel.channels.clear(); vi.unstubAllGlobals(); vi.useRealTimers(); vi.resetModules(); sessionStorage.clear(); window.name = ""; });
describe("active scene bus", () => {
  it("SB-4 retains exact time without per-frame renders and returns complete position to a new follower", () => {
    let now=100;
    const main=createActiveSceneBus("main",transport(new MockBroadcastChannel("sb4")),()=>now);
    const listener=vi.fn(); main.subscribe(listener);
    const position={productionId:"production",panelId:"panel",blockId:"line",timeMs:1250};
    main.publish("occ","scene",position);
    now=110; main.publish("occ","scene",{...position,timeMs:1260});
    expect(listener).toHaveBeenCalledTimes(1);
    expect(main.get()?.timeMs).toBe(1260);
    const follower=createActiveSceneBus("follower",transport(new MockBroadcastChannel("sb4")),()=>now);
    follower.ask("main");
    expect(follower.get("main")).toMatchObject({...position,timeMs:1260});
    main.close();follower.close();
  });
  it("follows one source, ignores other window selections and replies immediately to ask", () => {
    const main = createActiveSceneBus("main", transport(new MockBroadcastChannel("project")), () => 100);
    main.publish("occ-1", "scene-1");
    const explorer = createActiveSceneBus("explorer", transport(new MockBroadcastChannel("project")), () => 100);
    const other = createActiveSceneBus("other", transport(new MockBroadcastChannel("project")), () => 100);
    explorer.ask("main");
    expect(explorer.get("main")).toEqual({ windowId: "main", occurrenceId: "occ-1", sceneId: "scene-1", at: 100 });
    other.publish("occ-other", "scene-other");
    expect(explorer.get("main")?.occurrenceId).toBe("occ-1");
    main.publish("occ-2", "scene-2");
    expect(explorer.get("main")?.occurrenceId).toBe("occ-2");
    expect(main.get()?.occurrenceId).toBe("occ-2");
    main.close(); explorer.close(); other.close();
  });
  it("separates projects and ignores malformed or older messages", () => {
    const incoming = new MockBroadcastChannel("one");
    const explorer = createActiveSceneBus("explorer", transport(new MockBroadcastChannel("one")));
    createActiveSceneBus("main", transport(new MockBroadcastChannel("two"))).publish("wrong", "wrong");
    expect(explorer.get("main")).toBeNull();
    incoming.postMessage({ windowId: "main", occurrenceId: "new", sceneId: "scene", at: 20 });
    incoming.postMessage({ windowId: "main", occurrenceId: "old", sceneId: "scene", at: 10 });
    incoming.postMessage({ windowId: "main" } as SceneMessage);
    expect(explorer.get("main")?.occurrenceId).toBe("new");
  });
  it("marks a source closed ten seconds after an unanswered ask and resumes on a new message", async () => {
    vi.useFakeTimers(); vi.stubGlobal("BroadcastChannel", MockBroadcastChannel);
    const { useActiveSceneInfo } = await import("@/app/shell/current-scene");
    const { result, unmount } = renderHook(() => useActiveSceneInfo("timeout-project", "source"));
    act(() => vi.advanceTimersByTime(9999)); expect(result.current.closed).toBe(false);
    act(() => vi.advanceTimersByTime(1)); expect(result.current.closed).toBe(true);
    const channel = new MockBroadcastChannel("animatic-active-scene:timeout-project");
    act(() => channel.postMessage({ windowId: "source", occurrenceId: "occ", sceneId: "scene", at: Date.now() }));
    expect(result.current.closed).toBe(false); expect(result.current.scene?.occurrenceId).toBe("occ");
    unmount();
  });
  it("preserves identity on reload but does not inherit a main window identity in a new tab", async () => {
    let module = await import("@/app/shell/current-scene");
    const first = module.sourceWindowId();
    vi.resetModules(); module = await import("@/app/shell/current-scene");
    expect(module.sourceWindowId()).toBe(first);
    window.name = "";
    vi.resetModules(); module = await import("@/app/shell/current-scene");
    expect(module.sourceWindowId()).not.toBe(first);
  });
  it("receives storage fallback events and updates its own subscribers", async () => {
    vi.stubGlobal("BroadcastChannel", undefined);
    const { rememberScene, useActiveSceneInfo } = await import("@/app/shell/current-scene");
    const own = renderHook(() => useActiveSceneInfo("fallback"));
    act(() => rememberScene("fallback", "own-occ", "own-scene"));
    expect(own.result.current.scene?.occurrenceId).toBe("own-occ");
    const remote = renderHook(() => useActiveSceneInfo("fallback", "remote"));
    act(() => window.dispatchEvent(new StorageEvent("storage", { key: "animatic-active-scene:fallback", newValue: JSON.stringify({ message: { windowId: "remote", occurrenceId: "remote-occ", sceneId: "remote-scene", at: Date.now() } }) })));
    expect(remote.result.current.scene?.occurrenceId).toBe("remote-occ");
    own.unmount(); remote.unmount();
  });
});