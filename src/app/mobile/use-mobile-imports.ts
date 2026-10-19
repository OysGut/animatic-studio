/**
 * Mobilimporten på datamaskinen (fase 2, bolk A, DEC-0090): filene og øktene i prosjektet, oppdatert i sanntid
 * (ingen manuell oppfriskning), og watcheren som gjør bilder fra mobilen til nye versjoner i riktig ressurs
 * når en redaktør har prosjektet åpent. Ingenting godkjennes automatisk (versjonene godkjennes som før).
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";
import {
  L,
  roomToneSceneName,
  isRoomToneFile,
  lineInfo,
  newId,
  parseUploadContext,
  targetAssetOf,
  variantsOf,
  type ProjectState,
} from "@/core";
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
import { audioMediaFromStoredFile } from "@/app/library/asset-audio";
import { saveRoomTone, saveTake } from "@/app/audio/takes";

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

/** Navnet på varianten som lages når ressursen ikke har noen (på begge språk, så den kjennes igjen). */
const MOBILE_VARIANT_NAMES = ["Fra mobil", "From mobile"]; // i18n-ignore: gjenkjenning av begge språk

/**
 * Varianten et bilde fra mobilen legges i (DEC-0091, KI-238): den valgte, ellers en «Fra mobil»-variant som
 * finnes fra før, ellers den første som ikke er arkivert. Null betyr at en ny «Fra mobil» må lages.
 */
export function pickMobileVariant(
  s: ProjectState,
  assetId: string,
  preferred?: string,
): string | null {
  const vs = variantsOf(s, assetId).filter((v) => !v.archived);
  if (preferred && vs.some((v) => v.id === preferred)) return preferred;
  const mobile = vs.find((v) => MOBILE_VARIANT_NAMES.includes(v.name.trim()));
  return mobile?.id ?? vs[0]?.id ?? null;
}

/** Gjør et bilde fra mobilen til en ny versjon i ressursen. Gir feilmelding eller null. */
export async function importImage(
  state: ProjectState,
  cmds: Pick<Commands, "runAndWait">,
  row: MobileImportRow,
): Promise<string | null> {
  const ctx = parseUploadContext(row.context);
  const target = ctx ? targetAssetOf(ctx, row.asset_id) : null;
  if (!target || !state.assets[target.assetId] || state.assets[target.assetId]!.removed)
    return null;
  if (!(await claimMobileImport(row.id))) return null;
  const who = row.contributor_name || L("mobil", "mobile");
  const group = `mobil-${row.id}`;
  let variantId = pickMobileVariant(state, target.assetId, target.variantId);
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

/** Kan filen bli et take automatisk (lyd til en lydressurs eller en replikk, bolk B)? */
function isTakeRow(r: MobileImportRow): boolean {
  const c = parseUploadContext(r.context);
  return r.kind === "audio" && (c?.type === "sound" || c?.type === "line");
}

/** Stedet romlyd fra en økt hører til: scenen for en replikk, ellers lydressursens navn. */
function roomToneWhere(state: ProjectState, row: MobileImportRow): string | null {
  const c = parseUploadContext(row.context);
  if (c?.type === "line") {
    return roomToneSceneName(lineInfo(state, c.occurrenceId, c.blockId));
  }
  if (c?.type === "sound") return state.assets[c.assetId]?.name ?? null;
  return null;
}

/** Gjør et lydopptak fra mobilen til et nytt take (eller romlyd). Gir feilmelding eller null. */
export async function importAudio(
  state: ProjectState,
  cmds: Pick<Commands, "runAndWait">,
  row: MobileImportRow,
): Promise<string | null> {
  const c = parseUploadContext(row.context);
  if (!c || (c.type !== "sound" && c.type !== "line")) return null;
  if (c.type === "sound" && (!state.assets[c.assetId] || state.assets[c.assetId]!.removed))
    return null;
  if (!(await claimMobileImport(row.id))) return null;
  const who = row.contributor_name || L("mobil", "mobile");
  const media = await audioMediaFromStoredFile(row.path, row.mime_type);
  const note = L(`Fra mobil (${who})`, `From mobile (${who})`);
  const saved = isRoomToneFile(row.file_name)
    ? await saveRoomTone(cmds, state, roomToneWhere(state, row) ?? L("Scene", "Scene"), media, note)
    : await saveTake(
        cmds,
        state,
        c.type === "sound"
          ? { kind: "sound", assetId: c.assetId, variantId: c.variantId }
          : { kind: "line", occurrenceId: c.occurrenceId, blockId: c.blockId, ...(c.clipId ? { clipId: c.clipId } : {}) },
        media,
        note,
      );
  const e = await linkMobileImport(row.id, { assetId: saved.assetId, versionId: saved.versionId });
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
  /** Bildene behandles ett om gangen, så flere bilder samtidig ikke lager hver sin variant (KI-238). */
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const state = project.data;
  const todo = useMemo(
    () =>
      (imports.data ?? []).filter(
        (r) =>
          r.status === "done" &&
          (r.kind === "image" || isTakeRow(r)) &&
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
      const take = isTakeRow(r);
      if (!ctx || (!take && !targetAssetOf(ctx, r.asset_id))) continue;
      busy.current.add(r.id);
      chain.current = chain.current
        // Tilstanden hentes når det er filens tur, så det forrige laget (variant, lydklipp) er med
        .then(() =>
          take
            ? importAudio(cmds.current() ?? state, cmds, r)
            : importImage(cmds.current() ?? state, cmds, r),
        )
        .catch((e: Error) => e.message)
        .finally(() => busy.current.delete(r.id));
    }
  }, [todo, state, cmds, editable]);
  return null;
}
