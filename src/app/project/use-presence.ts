/**
 * Tilstedeværelse (DEC-0010, REQ-0526): hvem som har prosjektet åpent nå, og hvilken scene de står i.
 * Bruker Supabase Realtime Presence – ingenting lagres i databasen.
 */
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface PresentUser {
  readonly userId: string;
  readonly name: string;
  readonly occurrenceId: string | null;
}

interface PresencePayload {
  name?: string;
  occurrenceId?: string | null;
}

export function usePresence(
  projectId: string,
  userId: string,
  name: string,
  occurrenceId: string | null,
): PresentUser[] {
  const [others, setOthers] = useState<PresentUser[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const subscribed = useRef(false);
  const latest = useRef({ name, occurrenceId });
  latest.current = { name, occurrenceId };

  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    const topic = `presence-${projectId}`;
    void (async () => {
      // En kanal med samme navn som er på vei ut (rask remount) må være helt borte først,
      // ellers gir supabase.channel() den gamle tilbake og ingenting meldes.
      const old = supabase.getChannels().find((c) => c.topic === `realtime:${topic}`);
      if (old) await supabase.removeChannel(old);
      if (cancelled) return;
      // Privat kanal: bare medlemmer av prosjektet kan lytte og melde seg (policy i migrasjon 0003)
      const ch = supabase.channel(topic, { config: { private: true, presence: { key: userId } } });
      channel = ch;
      channelRef.current = ch;
      ch.on("presence", { event: "sync" }, () => {
        const state = ch.presenceState() as Record<string, PresencePayload[]>;
        const list: PresentUser[] = [];
        for (const [key, metas] of Object.entries(state)) {
          if (key === userId) continue;
          const m = metas[metas.length - 1];
          if (!m) continue;
          list.push({
            userId: key,
            name: m.name || "Medlem",
            occurrenceId: m.occurrenceId ?? null,
          });
        }
        list.sort((a, b) => a.name.localeCompare(b.name, "nb"));
        setOthers(list);
      }).subscribe((status) => {
        if (status === "SUBSCRIBED") {
          subscribed.current = true;
          void ch.track({ ...latest.current });
        }
      });
    })();
    return () => {
      cancelled = true;
      channelRef.current = null;
      subscribed.current = false;
      setOthers([]);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [projectId, userId]);

  // Oppdater egen posisjon når valgt scene eller navn endres
  useEffect(() => {
    const ch = channelRef.current;
    if (ch && subscribed.current) void ch.track({ name, occurrenceId });
  }, [userId, name, occurrenceId]);

  return others;
}

export function initials(name: string): string {
  const parts = name
    .trim()
    .split(/[\s._-]+/)
    .filter(Boolean);
  const s = (parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "");
  return s.toUpperCase();
}
