/** Browser transport only; injectable for deterministic cross-window tests. */
export interface ActiveScene {
  readonly windowId: string;
  readonly occurrenceId: string | null;
  readonly sceneId: string | null;
  readonly at: number;
  readonly productionId?: string | null;
  readonly panelId?: string | null;
  readonly blockId?: string | null;
  /** Scene-local time; never an absolute film timestamp. */
  readonly timeMs?: number;
}
export type SceneMessage = ActiveScene | { readonly type: "ask"; readonly windowId: string; readonly sourceWindowId?: string };
export interface SceneTransport {
  send(message: SceneMessage): void;
  listen(receive: (message: unknown) => void): () => void;
  close(): void;
}
export function validSceneMessage(value: unknown): value is SceneMessage {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (typeof v["windowId"] !== "string") return false;
  if (v["type"] === "ask") return v["sourceWindowId"] === undefined || typeof v["sourceWindowId"] === "string";
  return (v["occurrenceId"] === null || typeof v["occurrenceId"] === "string") &&
    (v["sceneId"] === null || typeof v["sceneId"] === "string") && typeof v["at"] === "number" && Number.isFinite(v["at"]);
}
export function createActiveSceneBus(windowId: string, transport: SceneTransport, now = Date.now) {
  const scenes = new Map<string, ActiveScene>();
  const listeners = new Set<() => void>();
  const notify = () => { for (const fn of listeners) fn(); };
  const unlisten = transport.listen((value) => {
    if (!validSceneMessage(value)) return;
    if ("type" in value) {
      if (!value.sourceWindowId || value.sourceWindowId === windowId) {
        const current = scenes.get(windowId);
        // A reply is also a heartbeat, even when no workspace has selected a scene.
        transport.send({ windowId, occurrenceId: current?.occurrenceId ?? null, sceneId: current?.sceneId ?? null, at: now() });
      }
      return;
    }
    if (value.windowId === windowId) return;
    const previous = scenes.get(value.windowId);
    if (previous && previous.at > value.at) return;
    scenes.set(value.windowId, value);
    notify();
  });
  return {
    publish(occurrenceId: string, sceneId: string | null, position: Pick<ActiveScene, "productionId" | "panelId" | "blockId" | "timeMs"> = {}) {
      const scene = { windowId, occurrenceId, sceneId, ...position, at: now() };
      scenes.set(windowId, scene);
      transport.send(scene);
      notify();
    },
    ask(sourceWindowId: string) { transport.send({ type: "ask", windowId, sourceWindowId }); },
    get(sourceWindowId = windowId) { return scenes.get(sourceWindowId) ?? null; },
    subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    close() { unlisten(); transport.close(); listeners.clear(); },
  };
}