/**
 * Tilstedeværelse (DEC-0010, REQ-0526) for nettleseren (KI-181): Supabase Realtime Presence på en privat
 * kanal per prosjekt. Ingenting lagres i databasen.
 */
import { browserClient } from "./client";

export interface PresencePayload {
  name?: string;
  occurrenceId?: string | null;
}

export interface PresenceChannel {
  /** Meld egen posisjon (navn og valgt scene). */
  track(payload: PresencePayload): Promise<unknown>;
  /** Forlat kanalen. */
  leave(): Promise<unknown>;
}

/**
 * En kanal med samme navn som er på vei ut (rask remount) må være helt borte først, ellers gir
 * kanaloppslaget den gamle tilbake og ingenting meldes.
 */
export async function removeStalePresence(projectId: string): Promise<void> {
  const topic = `presence-${projectId}`;
  const old = browserClient.getChannels().find((c) => c.topic === `realtime:${topic}`);
  if (old) await browserClient.removeChannel(old);
}

/**
 * Bli med i prosjektets tilstedeværelseskanal. `onSync` får alle som er til stede (nøkkel = bruker-ID);
 * `onSubscribed` kalles når kanalen er klar til å melde posisjon.
 */
export function joinPresence(
  projectId: string,
  userId: string,
  onSync: (state: Record<string, PresencePayload[]>) => void,
  onSubscribed: (channel: PresenceChannel) => void,
): PresenceChannel {
  // Privat kanal: bare medlemmer av prosjektet kan lytte og melde seg (policy i migrasjon 0003)
  const ch = browserClient.channel(`presence-${projectId}`, {
    config: { private: true, presence: { key: userId } },
  });
  const handle: PresenceChannel = {
    track: (payload) => ch.track(payload),
    leave: () => browserClient.removeChannel(ch),
  };
  ch.on("presence", { event: "sync" }, () => {
    onSync(ch.presenceState() as Record<string, PresencePayload[]>);
  }).subscribe((status) => {
    if (status === "SUBSCRIBED") onSubscribed(handle);
  });
  return handle;
}
