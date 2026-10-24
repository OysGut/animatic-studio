/**
 * Valgt scene på tvers av skjermene (REQ-0168, DEC-0075): manus, montering og sceneeditor husker sist valgte
 * scene per prosjekt for denne fanen, så «Sceneeditor» i hovedmenyen åpner scenen du sto på – ikke scene 1.
 * Bare i minnet (ingen lagring); ugyldige ID-er ignoreres av skjermen som leser.
 */
import { useEffect, useState } from "react";
import { createActiveSceneBus, type ActiveScene, type SceneMessage, type SceneTransport } from "./active-scene-bus";

const last = new Map<string, string>();
const buses = new Map<string, ReturnType<typeof createActiveSceneBus>>();
let identity: string | null = null;

/** Called only after hydration or from browser handlers. */
export function sourceWindowId(): string {
  if (identity) return identity;
  const key = "animatic:window-id";
  try {
    const stored = JSON.parse(window.sessionStorage.getItem(key) ?? "null") as { id?: string; name?: string } | null;
    if (stored?.id && stored.name === window.name) identity = stored.id;
  } catch { /* Storage may be unavailable. */ }
  identity ??= window.crypto.randomUUID();
  // A newly opened/duplicated tab can inherit sessionStorage, but not this main-window name.
  if (!window.name) window.name = `animatic-main-${identity}`;
  try { window.sessionStorage.setItem(key, JSON.stringify({ id: identity, name: window.name })); } catch { /* Memory fallback. */ }
  return identity;
}

function bus(projectId: string) {
  const existing = buses.get(projectId);
  if (existing) return existing;
  const KEY = "animatic-active-scene:" + projectId;
  let transport: SceneTransport;
  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel(KEY);
    transport = {
      send: (message) => channel.postMessage(message),
      listen: (receive) => {
        const fn = (e: MessageEvent<unknown>) => receive(e.data);
        channel.addEventListener("message", fn);
        return () => channel.removeEventListener("message", fn);
      },
      close: () => channel.close(),
    };
  } else {
    transport = {
      send: (message: SceneMessage) => {
        try { window.localStorage.setItem(KEY, JSON.stringify({ message, nonce: window.crypto.randomUUID() })); window.localStorage.removeItem(KEY); } catch { /* Same-window subscription still works. */ }
      },
      listen: (receive) => {
        const fn = (e: StorageEvent) => {
          if (e.key !== KEY || !e.newValue) return;
          try { receive((JSON.parse(e.newValue) as { message: unknown }).message); } catch { /* Ignore malformed events. */ }
        };
        window.addEventListener("storage", fn);
        return () => window.removeEventListener("storage", fn);
      },
      close: () => undefined,
    };
  }
  const next = createActiveSceneBus(sourceWindowId(), transport);
  buses.set(projectId, next);
  return next;
}

export function rememberScene(projectId: string, occurrenceId: string | null | undefined, sceneId: string | null = null): void {
  if (!occurrenceId) return;
  last.set(projectId, occurrenceId);
  if (typeof window !== "undefined") {
    const channel = bus(projectId);
    const old = channel.get();
    channel.publish(occurrenceId, sceneId, old?.occurrenceId === occurrenceId ? { productionId: old.productionId ?? null, panelId: old.panelId ?? null, blockId: old.blockId ?? null, timeMs: old.timeMs ?? 0 } : {});
  }
}

export function currentPosition(projectId: string): ActiveScene | null {
  return typeof window === "undefined" ? null : bus(projectId).get();
}
export function rememberPosition(projectId: string, position: { occurrenceId: string; sceneId: string | null; productionId: string; panelId: string | null; blockId: string | null; timeMs: number }): void {
  if (!Number.isFinite(position.timeMs) || position.timeMs < 0) return;
  last.set(projectId, position.occurrenceId);
  if (typeof window !== "undefined") bus(projectId).publish(position.occurrenceId, position.sceneId, position);
}

export function useActiveSceneInfo(projectId: string, source?: string) {
  const [scene, setScene] = useState<ActiveScene | null>(null);
  const [closed, setClosed] = useState(false);
  useEffect(() => {
    const channel = bus(projectId);
    const id = source ?? sourceWindowId();
    let deadline: ReturnType<typeof setTimeout> | undefined;
    let receivedAt = 0;
    const update = () => {
      const next = channel.get(id);
      setScene(next);
      if (next && next.at >= receivedAt) { receivedAt = next.at; setClosed(false); }
    };
    update();
    const unsubscribe = channel.subscribe(update);
    const ask = () => {
      const sentAt = Date.now();
      receivedAt = sentAt;
      channel.ask(id);
      deadline = setTimeout(() => setClosed((channel.get(id)?.at ?? 0) < sentAt), 10_000);
    };
    if (source) ask();
    const heartbeat = source ? setInterval(ask, 12_000) : undefined;
    return () => { unsubscribe(); clearTimeout(deadline); clearInterval(heartbeat); };
  }, [projectId, source]);
  return { scene, closed };
}

export function useActiveScene(projectId: string, sourceWindowId?: string): string | null {
  return useActiveSceneInfo(projectId, sourceWindowId).scene?.occurrenceId ?? null;
}

export function lastScene(projectId: string): string | null {
  return last.get(projectId) ?? null;
}

const GOTO = "animatic-goto-scene";

/**
 * Gå til en scene i arbeidsflaten som er åpen (manus eller sceneeditor), f.eks. fra oppgavene i toppstripen
 * (DEC-0088). Arbeidsflatene lytter med `useGotoScene`.
 */
export function gotoScene(projectId: string, occurrenceId: string): void {
  window.dispatchEvent(new CustomEvent(GOTO, { detail: { projectId, occurrenceId } }));
}

export function onGotoScene(projectId: string, fn: (occurrenceId: string) => void): () => void {
  const on = (e: Event) => {
    const d = (e as CustomEvent<{ projectId: string; occurrenceId: string }>).detail;
    if (d?.projectId === projectId) fn(d.occurrenceId);
  };
  window.addEventListener(GOTO, on);
  return () => window.removeEventListener(GOTO, on);
}
