/**
 * Automatisk gjenkjenning i bakgrunnen (OG2, B-047). Watcheren i prosjektskallet sammenligner
 * scenehashene med lagret analyse og ber serveren analysere bare nye eller endrede scener:
 * - straks når prosjektet ikke har lagret analyse (etter import) og etter Story Lab-overføringer;
 * - ellers 30 sekunder etter siste manusendring.
 * Én kjøring om gangen per fane. Ingenting opprettes; resultatet brukes bare i forslagsdialogen.
 */
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef } from "react";
import { mainProduction, type ProjectState } from "@/core";
import {
  ENTITY_ANALYSIS_DEBOUNCE_MS,
  analysisScenes,
  scenesNeedingAnalysis,
  type StoredSceneAnalysis,
} from "@/core/library/analysis-hash";
import { analyzeScriptEntities, listEntityAnalysis } from "@/adapters/ai/entity-analysis.functions";
import { fetchProjectState } from "@/adapters/browser/project-data";
import { projectStateKey } from "@/app/project/use-project";
import { useLanguage } from "@/app/i18n/language";
import {
  NOW_EVENT,
  REANALYZE_EVENT,
  setAnalysisRows,
  setAnalysisStatus,
  type ReanalyzeDetail,
} from "./entity-analysis-store";

export { requestAnalysisNow } from "./entity-analysis-store";

export function EntityAnalysisWatcher({ projectId, editable }: { projectId: string; editable: boolean }) {
  const language = useLanguage();
  const analyze = useServerFn(analyzeScriptEntities);
  const list = useServerFn(listEntityAnalysis);
  const state = useQuery({
    queryKey: projectStateKey(projectId),
    queryFn: projectStateQueryFn(qc, projectId),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
  const stored = useQuery({
    queryKey: ["entity-analysis", projectId],
    queryFn: async (): Promise<StoredSceneAnalysis[]> => (await list({ data: { projectId } })).rows,
    staleTime: Infinity,
    retry: false,
  });
  useEffect(() => {
    if (stored.data) setAnalysisRows(projectId, stored.data);
  }, [projectId, stored.data]);
  const pending = useMemo(() => {
    const s = state.data as ProjectState | undefined;
    if (!s || !stored.data) return [];
    const prod = mainProduction(s);
    return prod ? scenesNeedingAnalysis(analysisScenes(s, prod.id), stored.data) : [];
  }, [state.data, stored.data]);
  const busy = useRef(false);
  const stopped = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef(pending);
  pendingRef.current = pending;

  const run = useRef<(all?: boolean) => Promise<string | null>>(async () => null);
  run.current = async (all = false) => {
    if (busy.current || !editable) return null;
    if (!all && (stopped.current || !pendingRef.current.length)) return null;
    busy.current = true;
    setAnalysisStatus(projectId, { kind: "running" });
    let total = 0;
    try {
      // Store manus deles i flere kjøringer på serveren (40 scener hver)
      for (let i = 0; i < 20; i++) {
        const scope = all && i === 0 ? ("all" as const) : { sceneIds: pendingRef.current.slice(0, 500) };
        const r = await analyze({ data: { projectId, scope, language } });
        if (!r.ok) {
          // Feil stopper automatikken til neste endring; reglene brukes i mellomtiden
          if (!r.retryable) stopped.current = true;
          setAnalysisStatus(projectId, r.retryable ? { kind: "idle" } : { kind: "error", message: r.message });
          return r.message;
        }
        total += r.newSuggestions;
        const fresh = await stored.refetch();
        const st = state.data as ProjectState | undefined;
        const prod = st ? mainProduction(st) : undefined;
        if (fresh.data && st && prod) pendingRef.current = scenesNeedingAnalysis(analysisScenes(st, prod.id), fresh.data);
        if (!r.remainingScenes || !r.analyzedScenes) break;
      }
      setAnalysisStatus(projectId, { kind: "done", newSuggestions: total });
      return null;
    } catch {
      stopped.current = true;
      setAnalysisStatus(projectId, { kind: "idle" });
      return null;
    } finally {
      busy.current = false;
    }
  };

  // Ny endring etter en feil: prøv igjen (én gang per endring)
  const lastKey = useRef("");
  useEffect(() => {
    const key = pending.join(",");
    if (key !== lastKey.current) stopped.current = false;
    lastKey.current = key;
    if (!pending.length || !editable) return;
    if (timer.current) clearTimeout(timer.current);
    const fresh = (stored.data?.length ?? 0) === 0;
    timer.current = setTimeout(() => void run.current(), fresh ? 1500 : ENTITY_ANALYSIS_DEBOUNCE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [pending, editable, stored.data]);

  useEffect(() => {
    const onNow = (e: Event) => {
      if ((e as CustomEvent<{ projectId: string }>).detail?.projectId !== projectId) return;
      if (timer.current) clearTimeout(timer.current);
      stopped.current = false;
      timer.current = setTimeout(() => void run.current(), 500);
    };
    const onAgain = (e: Event) => {
      const d = (e as CustomEvent<ReanalyzeDetail>).detail;
      if (d?.projectId !== projectId || !editable) return;
      d.accepted = true;
      void run.current(true).then(d.resolve);
    };
    window.addEventListener(NOW_EVENT, onNow);
    window.addEventListener(REANALYZE_EVENT, onAgain);
    return () => {
      window.removeEventListener(NOW_EVENT, onNow);
      window.removeEventListener(REANALYZE_EVENT, onAgain);
    };
  }, [projectId, editable]);

  return null;
}
