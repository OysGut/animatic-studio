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
    (v["sceneId"] === null || typeof v["sceneId"] === "string") && typeof v["at"] === "number" && Number.isFinite(v["at"]) &&
    ["productionId", "panelId", "blockId"].every(k => v[k] === undefined || v[k] === null || typeof v[k] === "string") &&
    (v["timeMs"] === undefined || (typeof v["timeMs"] === "number" && Number.isFinite(v["timeMs"]) && v["timeMs"] >= 0));
}
export function createActiveSceneBus(windowId: string, transport: SceneTransport, now = Date.now) {
  const scenes = new Map<string, ActiveScene>();
  const listeners = new Set<() => void>();
  let lastSent = 0;
  const notify = () => { for (const fn of listeners) fn(); };
  const selectionChanged = (a: ActiveScene | undefined, b: ActiveScene) => !a || a.occurrenceId !== b.occurrenceId || a.sceneId !== b.sceneId || a.productionId !== b.productionId || a.panelId !== b.panelId || a.blockId !== b.blockId;
  const unlisten = transport.listen((value) => {
    if (!validSceneMessage(value)) return;
    if ("type" in value) {
      if (!value.sourceWindowId || value.sourceWindowId === windowId) {
        const current = scenes.get(windowId);
        // A reply is also a heartbeat, even when no workspace has selected a scene.
        transport.send({ ...current, windowId, occurrenceId: current?.occurrenceId ?? null, sceneId: current?.sceneId ?? null, at: now() });
      }
      return;
    }
    if (value.windowId === windowId) return;
    const previous = scenes.get(value.windowId);
    if (previous && previous.at > value.at) return;
    scenes.set(value.windowId, value);
    if (selectionChanged(previous, value)) notify();
  });
  return {
    publish(occurrenceId: string, sceneId: string | null, position: Pick<ActiveScene, "productionId" | "panelId" | "blockId" | "timeMs"> = {}) {
      const scene = { windowId, occurrenceId, sceneId, ...position, at: now() };
      const previous = scenes.get(windowId);
      scenes.set(windowId, scene);
      // Exact local time is retained every frame; remote heartbeat/time updates are bounded.
      const changed = selectionChanged(previous, scene);
      if (changed || !previous || scene.at - lastSent >= 250) { transport.send(scene); lastSent = scene.at; }
      if (changed) notify();
    },
    ask(sourceWindowId: string) { transport.send({ type: "ask", windowId, sourceWindowId }); },
    get(sourceWindowId = windowId) { return scenes.get(sourceWindowId) ?? null; },
    subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    close() { unlisten(); transport.close(); listeners.clear(); },
  };
}