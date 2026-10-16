/**
 * Mobilimporten på datamaskinen (fase 2, bolk A, DEC-0090): filene og øktene i prosjektet, oppdatert i sanntid
 * (ingen manuell oppfriskning), og watcheren som gjør bilder fra mobilen til nye versjoner i riktig ressurs
 * når en redaktør har prosjektet åpent. Ingenting godkjennes automatisk (versjonene godkjennes som før).
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";
import { L, newId, parseUploadContext, targetAssetOf, variantsOf, type ProjectState } from "@/core";
import {
  claimMobileImport,
  fetchMobileImports,
  fetchUploadSessions,
  linkMobileImport,
  subscribeMobileImports,
  type MobileImportRow,
  type UploadSessionRow,
} from "@/adapters/browser/mobile-import";
import { fetchProjectState } from "@/adapters/browser/project-data";
import { projectStateKey } from "@/app/project/use-project";
import { useCommands, type Commands } from "@/app/project/use-commands";
import { mediaFromStoredFile } from "@/app/library/asset-images";

export const mobileImportsKey = (projectId: string) => ["mobile-imports", projectId] as const;
export const uploadSessionsKey = (projectId: string) => ["upload-sessions", projectId] as const;

/** Filene fra mobilen. `data` er null før migrasjon 0035. */
export function useMobileImports(projectId: string, enabled = true) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    return subscribeMobileImports(projectId, () => {
      void qc.invalidateQueries({ queryKey: mobileImportsKey(projectId) });
      void qc.invalidateQueries({ queryKey: uploadSessionsKey(projectId) });
    });
  }, [projectId, enabled, qc]);
  return useQuery({
    queryKey: mobileImportsKey(projectId),
    enabled,
    queryFn: () => fetchMobileImports(projectId),
    // Sanntid er hovedveien; dette er reserven om kanalen faller ut
    refetchInterval: 30_000,
  });
}

export function useUploadSessions(projectId: string, enabled = true) {
  return useQuery({
    queryKey: uploadSessionsKey(projectId),
    enabled,
    queryFn: () => fetchUploadSessions(projectId),
    refetchInterval: 10_000,
  });
}

/** Filene som hører til en økt eller en kontekst (f.eks. det som kom inn mens QR-vinduet var åpent). */
export function importsForSession(
  rows: readonly MobileImportRow[] | null | undefined,
  sessionIds: ReadonlySet<string>,
): MobileImportRow[] {
  return (rows ?? []).filter((r) => sessionIds.has(r.session_id));
}

/** Er mobilen tilkoblet (har vist seg de siste 45 sekundene)? */
export function sessionConnected(s: UploadSessionRow | undefined, now = Date.now()): boolean {
  return !!s?.last_seen_at && now - Date.parse(s.last_seen_at) < 45_000;
}

/** Varianten et bilde fra mobilen legges i: den valgte, ellers den første som ikke er arkivert. */
function pickVariant(s: ProjectState, assetId: string, preferred?: string): string | null {
  const vs = variantsOf(s, assetId).filter((v) => !v.archived);
  if (preferred && vs.some((v) => v.id === preferred)) return preferred;
  return vs[0]?.id ?? null;
}

/** Gjør et bilde fra mobilen til en ny versjon i ressursen. Gir feilmelding eller null. */
async function importImage(
  state: ProjectState,
  cmds: Commands,
  row: MobileImportRow,
): Promise<string | null> {
  const ctx = parseUploadContext(row.context);
  const target = ctx ? targetAssetOf(ctx, row.asset_id) : null;
  if (!target || !state.assets[target.assetId] || state.assets[target.assetId]!.removed)
    return null;
  if (!(await claimMobileImport(row.id))) return null;
  const who = row.contributor_name || L("mobil", "mobile");
  const group = `mobil-${row.id}`;
  let variantId = pickVariant(state, target.assetId, target.variantId);
  if (!variantId) {
    variantId = newId<"asset_variant">();
    const r = await cmds.runAndWait(
      {
        type: "CreateAssetVariant",
        variantId: variantId as never,
        assetId: target.assetId as never,
        fields: { name: L("Fra mobil", "From mobile"), style: "animatic", appearance: "" },
      },
      L("Bilde fra mobil", "Image from mobile"),
      group,
    );
    if (r.error) return r.error;
  }
  const media = await mediaFromStoredFile(row.path);
  const versionId = newId<"asset_version">();
  const r = await cmds.runAndWait(
    {
      type: "AddAssetVersion",
      versionId: versionId as never,
      variantId: variantId as never,
      media,
      note: L(`Fra mobil (${who})`, `From mobile (${who})`),
    },
    L("Bilde fra mobil", "Image from mobile"),
    group,
  );
  if (r.error) return r.error;
  const e = await linkMobileImport(row.id, { assetId: target.assetId, versionId });
  return e?.message ?? null;
}

/**
 * Montert i prosjektet for redaktører: nye bilder fra mobilen blir versjoner i ressursen de ble tatt for
 * (kontekst «ressurs», «bildeplass» eller et utkast som er lagret). Video og lyd registreres bare (de knyttes
 * til ressursen eller scenen i mobilimporten). Bare én fane behandler hver fil.
 */
export function MobileImportWatcher({
  projectId,
  userId,
  editable,
}: {
  projectId: string;
  userId: string;
  editable: boolean;
}) {
  const imports = useMobileImports(projectId, editable);
  const project = useQuery({
    queryKey: projectStateKey(projectId),
    queryFn: () => fetchProjectState(projectId),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    enabled: editable,
  });
  const cmds = useCommands(projectId, userId, editable);
  const busy = useRef(new Set<string>());
  const state = project.data;
  const todo = useMemo(
    () =>
      (imports.data ?? []).filter(
        (r) =>
          r.status === "done" &&
          r.kind === "image" &&
          !r.asset_version_id &&
          !r.dismissed &&
          !busy.current.has(r.id),
      ),
    [imports.data],
  );
  useEffect(() => {
    if (!editable || !state) return;
    for (const r of todo) {
      const ctx = parseUploadContext(r.context);
      if (!ctx || !targetAssetOf(ctx, r.asset_id)) continue;
      busy.current.add(r.id);
      void importImage(state, cmds, r)
        .catch((e: Error) => e.message)
        .finally(() => busy.current.delete(r.id));
    }
  }, [todo, state, cmds, editable]);
  return null;
}
