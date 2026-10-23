/**
 * Prosjekttilstand i nettleseren. Lastes med brukerens egen tilgang (RLS) og holdes oppdatert når
 * andre medlemmer gjør endringer (sanntid på change_log, REQ-0520–0522). Egne endringer legges inn
 * lokalt med samme domenekjerne som serveren bruker (se use-commands.ts), så de trenger ingen ny lasting.
 */
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { mergeBlockHistory, type ProjectState } from "@/core";
import {
  fetchBlockHistory,
  fetchChangesAfter,
  fetchProjectSnapshot,
  subscribeProjectChanges,
} from "@/adapters/browser/project-data";
import { createRemoteSync, type RemoteSync } from "./remote-sync";
import { listMembers, listProfiles } from "@/adapters/browser/members";
import { useSyncProjectFonts } from "@/app/fonts/project-fonts";

export const projectStateKey = (projectId: string) => ["project-state", projectId] as const;

/** Kommando-ID-er denne fanen selv har sendt (sanntidsekko fra egne endringer ignoreres). */
export const ownCommandIds = new Set<string>();

/** Kommandoer som venter på lagring. Ny innlasting utsettes til køen er tom, så egne endringer ikke forsvinner. */
export const commandQueue = { pending: 0, onIdle: new Set<() => void>() };

/** Varsles med ID-ene andre brukere har endret (brukes til å stoppe angring av noe andre har endret). */
export const foreignChangeListeners = new Set<(ids: readonly string[]) => void>();

/** G-2: én synkronisering per prosjekt og spørringsklient (alle sider deler samme tilstand). */
const syncs = new WeakMap<QueryClient, Map<string, RemoteSync>>();
export function remoteSyncFor(qc: QueryClient, projectId: string): RemoteSync {
  let m = syncs.get(qc);
  if (!m) syncs.set(qc, (m = new Map()));
  let sync = m.get(projectId);
  if (!sync) {
    const key = projectStateKey(projectId);
    sync = createRemoteSync({
      getState: () => qc.getQueryData<ProjectState>(key),
      setState: (state) => qc.setQueryData(key, state),
      isFetching: () => qc.isFetching({ queryKey: key }) > 0,
      reload: () => void qc.invalidateQueries({ queryKey: key }),
      fetchAfter: (after) => fetchChangesAfter(projectId, after),
      isOwn: (id) => ownCommandIds.has(id),
      isBusy: () => commandQueue.pending > 0,
      onIdle: (fn) => commandQueue.onIdle.add(fn),
      onForeign: (ids) => {
        for (const f of foreignChangeListeners) f(ids);
      },
    });
    m.set(projectId, sync);
  }
  return sync;
}

/**
 * Full teksthistorikk hentes i bakgrunnen etter åpning og flettes inn (G-2). Kom det endringer fra andre mens den
 * ble hentet, hentes den én gang til, så historikk serveren kopierte i mellomtiden, kommer med.
 */
async function loadHistory(qc: QueryClient, projectId: string, sync: RemoteSync) {
  const key = projectStateKey(projectId);
  for (let attempt = 0; attempt < 3; attempt++) {
    const seq = sync.lastSeq();
    let history;
    try {
      history = await fetchBlockHistory(projectId);
    } catch (e) {
      console.warn("[sync] historikk ble ikke hentet", String(e)); // i18n-ignore: logg
      return;
    }
    const s = qc.getQueryData<ProjectState>(key);
    if (!s) return;
    if (s.blockHistory !== "current") return; // en full innlasting kom imellom
    if (sync.lastSeq() !== seq && attempt < 2) continue;
    qc.setQueryData(key, mergeBlockHistory(s, history));
    return;
  }
}

/**
 * Henting av prosjekttilstanden (samme for alle som bruker projectStateKey): øyeblikksbilde, ny loggposisjon for
 * synkroniseringen og historikk i bakgrunnen.
 */
export function projectStateQueryFn(qc: QueryClient, projectId: string) {
  return async (): Promise<ProjectState> => {
    const sync = remoteSyncFor(qc, projectId);
    const t0 = performance.now();
    const { state, logSeq, via } = await fetchProjectSnapshot(projectId);
    if (typeof console !== "undefined" && import.meta.env?.DEV)
      console.info(`[sync] prosjektet lastet (${via}) på ${Math.round(performance.now() - t0)} ms`); // i18n-ignore: logg
    sync.reset(logSeq);
    if (state.blockHistory === "current") setTimeout(() => void loadHistory(qc, projectId, sync), 0);
    return state;
  };
}

export function useProjectState(projectId: string) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: projectStateKey(projectId),
    queryFn: projectStateQueryFn(qc, projectId),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    const sync = remoteSyncFor(qc, projectId);
    // Andres endringer brukes direkte på lokal tilstand (G-2); egne ekko hoppes over
    const unsubscribe = subscribeProjectChanges(projectId, (row) => sync.receive(row as Record<string, unknown>));
    return () => {
      unsubscribe();
    };
  }, [projectId, qc]);

  // Ny tilstand fra en innlasting: bruk det som har ventet
  useEffect(() => {
    if (query.dataUpdatedAt) remoteSyncFor(qc, projectId).drainSoon();
  }, [query.dataUpdatedAt, projectId, qc]);

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
