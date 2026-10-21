/**
 * Prosjekttilstand i nettleseren. Lastes med brukerens egen tilgang (RLS) og holdes oppdatert når
 * andre medlemmer gjør endringer (sanntid på change_log, REQ-0520–0522). Egne endringer legges inn
 * lokalt med samme domenekjerne som serveren bruker (se use-commands.ts), så de trenger ingen ny lasting.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import type { ProjectState } from "@/core";
import { fetchProjectState, subscribeProjectChanges } from "@/adapters/browser/project-data";
import { listMembers, listProfiles } from "@/adapters/browser/members";
import { useSyncProjectFonts } from "@/app/fonts/project-fonts";

export const projectStateKey = (projectId: string) => ["project-state", projectId] as const;

/** Kommando-ID-er denne fanen selv har sendt (sanntidsekko fra egne endringer ignoreres). */
export const ownCommandIds = new Set<string>();

/** Kommandoer som venter på lagring. Ny innlasting utsettes til køen er tom, så egne endringer ikke forsvinner. */
export const commandQueue = { pending: 0, onIdle: new Set<() => void>() };

/** Varsles med ID-ene andre brukere har endret (brukes til å stoppe angring av noe andre har endret). */
export const foreignChangeListeners = new Set<(ids: readonly string[]) => void>();

export function useProjectState(projectId: string) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: projectStateKey(projectId),
    queryFn: () => fetchProjectState(projectId),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const unsubscribe = subscribeProjectChanges(projectId, (row) => {
      const id = row.id;
      if (id && ownCommandIds.has(id)) return;
      const ids = row.affected_ids ?? [];
      for (const f of foreignChangeListeners) f(ids);
      // Samle opp raske endringer fra andre og last på nytt én gang – men aldri midt i egen lagring
      if (timer.current) clearTimeout(timer.current);
      const refresh = () => {
        if (commandQueue.pending > 0) {
          commandQueue.onIdle.add(refresh);
          return;
        }
        void qc.invalidateQueries({ queryKey: projectStateKey(projectId) });
      };
      timer.current = setTimeout(refresh, 400);
    });
    return () => {
      if (timer.current) clearTimeout(timer.current);
      unsubscribe();
    };
  }, [projectId, qc]);

  // B-098: prosjektets egne fonter blir tilgjengelige i alle fontvelgere, forhåndsvisning og eksport
  useSyncProjectFonts(query.data);

  return query;
}

export interface MemberRow {
  user_id: string;
  role: string;
  joined_at: string;
}

export interface ProfileRow {
  user_id: string;
  display_name: string;
}

export function useMembers(projectId: string) {
  return useQuery({
    queryKey: ["project-members", projectId],
    queryFn: async (): Promise<MemberRow[]> => (await listMembers(projectId)) as MemberRow[],
    // En ny rolle (KI-136) vises når fanen får fokus igjen, og ellers innen et minutt
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
  });
}

/** Visningsnavn for medlemmene (migrasjon 0002). Tom liste hvis tabellen ikke finnes ennå. */
export function useProfiles(userIds: readonly string[]) {
  return useQuery({
    queryKey: ["profiles", [...userIds].sort().join(",")],
    enabled: userIds.length > 0,
    queryFn: async (): Promise<Record<string, ProfileRow>> => {
      const { data, error } = await listProfiles(userIds);
      if (error) return {};
      return Object.fromEntries(((data ?? []) as ProfileRow[]).map((p) => [p.user_id, p]));
    },
  });
}

export const ROLE_RANK: Record<string, number> = { owner: 4, editor: 3, commenter: 2, viewer: 1 };

export function canEdit(role: string | undefined): boolean {
  return (ROLE_RANK[role ?? ""] ?? 0) >= (ROLE_RANK["editor"] ?? 3);
}

export type { ProjectState };
