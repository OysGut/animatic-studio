/**
 * GP2–GP5 (N1, migrasjon 0088): atomisk lagring av en global versjon, samme mønster som B-116.
 *   1. global_reserve_version (brukerens klient: redaktørrolle og gyldige gruppestier),
 *   2. opplasting eller kopiering av filene,
 *   3. kontroll av at alle reserverte filer finnes (lagrings-API, ingen SQL mot storage),
 *   4. global_commit_version (brukerens klient; godtar bare reserverte nøkler).
 * Feiler 2–4, slettes filene som ingen versjon eller annen reservasjon bruker, og reservasjonen frigjøres.
 * Er utfallet av commit uklart (tapt svar), avklares det før noe slettes. Bare på serveren.
 */
import type { AnyClient } from "@/adapters/storage/project-rows";

const BUCKET = "assets";
type Log = (msg: string, meta: Record<string, unknown>) => void;
const defaultLog: Log = (m, meta) => console.error(m, meta);

type Rpc = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string; code?: string } | null }>;
type Bucket = {
  remove: (p: string[]) => Promise<{ error: unknown }>;
  list: (folder: string, o: { search: string; limit: number }) => Promise<{ data: { name: string }[] | null; error: unknown }>;
};
const rpc = (c: AnyClient): Rpc => (c as unknown as { rpc: Rpc }).rpc.bind(c);
const bucket = (c: AnyClient): Bucket => (c as unknown as { storage: { from: (b: string) => Bucket } }).storage.from(BUCKET);

export interface GlobalCommitParams {
  readonly mime: string;
  readonly width: number | null;
  readonly height: number | null;
  readonly bytes: number;
  readonly sha256: string;
  readonly durationMs: number | null;
  readonly note: string;
  readonly templateSpec?: unknown;
  readonly fontSpec?: unknown;
  readonly derivedFiles?: unknown;
}

export async function globalFileExists(admin: AnyClient, path: string): Promise<boolean> {
  const i = path.lastIndexOf("/");
  try {
    const { data } = await bucket(admin).list(path.slice(0, i), { search: path.slice(i + 1), limit: 10 });
    return (data ?? []).some((f) => f.name === path.slice(i + 1));
  } catch {
    return false;
  }
}

/** Reserverer nøklene (første er hovedfilen). Gir reservasjons-ID-en. */
export async function reserveGlobalVersion(user: AnyClient, variantId: string, keys: readonly string[]): Promise<string> {
  const unique = [...new Set(keys)];
  const { data, error } = await rpc(user)("global_reserve_version", { p_variant: variantId, p_storage_keys: unique });
  if (error || typeof data !== "string") throw new Error(error?.message ?? "reserve failed");
  return data;
}

/** Sjekker filene og sluttfører. Kaster ved feil (uten å rydde; se releaseGlobalReservation). */
export async function commitGlobalVersion(
  user: AnyClient, admin: AnyClient, reservationId: string, keys: readonly string[], p: GlobalCommitParams,
): Promise<string> {
  for (const k of new Set(keys)) if (!(await globalFileExists(admin, k))) throw new Error("file missing");
  const { data, error } = await rpc(user)("global_commit_version", {
    p_reservation: reservationId, p_mime: p.mime, p_width: p.width, p_height: p.height, p_bytes: p.bytes,
    p_sha256: p.sha256, p_duration_ms: p.durationMs, p_note: p.note,
    p_template_spec: p.templateSpec ?? null, p_font_spec: p.fontSpec ?? null, p_derived_files: p.derivedFiles ?? null,
  });
  if (error || typeof data !== "string") throw Object.assign(new Error(error?.message ?? "commit failed"), { ambiguous: !error });
  return data;
}

/**
 * Rydder etter en feilet lagring: sletter trygge filer først og frigjør så reservasjonen. Er reservasjonen
 * sluttført (tapt svar etter commit), slettes ingenting og versjons-ID-en finnes. Feil logges uten lagringsnøkler;
 * reservasjonen beholdes da til sweepen.
 */
export async function releaseGlobalReservation(admin: AnyClient, reservationId: string, actor: string, log: Log = defaultLog): Promise<"released" | "committed" | "kept"> {
  let rows: { committed?: unknown; storage_key?: unknown }[];
  try {
    const r = await rpc(admin)("global_reservation_safe_keys", { p_reservation: reservationId, p_actor: actor });
    if (r.error || !Array.isArray(r.data)) throw new Error("list");
    rows = r.data as typeof rows;
  } catch {
    log("[global-reservation] safe keys failed", { reservation: reservationId });
    return "kept";
  }
  if (rows.some((r) => r.committed === true)) return "committed";
  const keys = rows.map((r) => r.storage_key).filter((k): k is string => typeof k === "string" && k.startsWith("global/") && !k.includes(".."));
  if (keys.length) {
    let ok = false;
    try { ok = !(await bucket(admin).remove(keys)).error; } catch { ok = false; }
    if (!ok) { log("[global-reservation] remove failed, kept for sweep", { reservation: reservationId }); return "kept"; }
  }
  try {
    const r = await rpc(admin)("global_cancel_reservation", { p_reservation: reservationId, p_actor: actor });
    if (r.error) throw new Error("cancel");
  } catch {
    log("[global-reservation] cancel failed", { reservation: reservationId });
    return "kept";
  }
  return "released";
}

/**
 * Hele løpet: reserver → put (opplasting/kopi) → kontroll → commit. Ved feil etter reservasjonen ryddes det,
 * og den opprinnelige feilen kastes videre. En commit som faktisk lyktes (tapt svar), gir versjons-ID-en.
 */
export async function storeGlobalVersionAtomically(args: {
  readonly user: AnyClient;
  readonly admin: AnyClient;
  readonly actor: string;
  readonly variantId: string;
  /** Første nøkkel er hovedfilen; resten er avledede filer. */
  readonly keys: readonly string[];
  readonly put: () => Promise<void>;
  readonly params: () => GlobalCommitParams;
  readonly log?: Log;
}): Promise<string> {
  const reservationId = await reserveGlobalVersion(args.user, args.variantId, args.keys);
  try {
    await args.put();
    return await commitGlobalVersion(args.user, args.admin, reservationId, args.keys, args.params());
  } catch (e) {
    const outcome = await releaseGlobalReservation(args.admin, reservationId, args.actor, args.log);
    if (outcome === "committed") {
      const { data } = await (args.admin as unknown as { from: (t: string) => { select: (c: string) => { eq: (k: string, v: string) => { maybeSingle: () => Promise<{ data: unknown }> } } } })
        .from("global_version_reservations").select("committed_version_id").eq("id", reservationId).maybeSingle();
      const id = (data as { committed_version_id?: unknown } | null)?.committed_version_id;
      if (typeof id === "string") return id;
    }
    throw e;
  }
}

/**
 * Sweep (orphan-cleanup): utløpte, åpne reservasjoner i gruppen. Filen slettes først; reservasjonen frigjøres
 * bare når slettingen lyktes.
 */
export async function sweepGlobalReservations(admin: AnyClient, workspaceId: string, log: Log = defaultLog): Promise<{ released: number; kept: number }> {
  let listed: { data: unknown; error: unknown };
  try { listed = await rpc(admin)("stale_global_reservations", { p_workspace: workspaceId }); }
  catch { listed = { data: null, error: true }; }
  if (listed.error || !Array.isArray(listed.data)) {
    log("[global-sweep] list failed", { workspaceId });
    return { released: 0, kept: 0 };
  }
  let released = 0, kept = 0;
  for (const row of listed.data as { id?: unknown; storage_keys?: unknown }[]) {
    const id = typeof row.id === "string" ? row.id : null;
    if (!id) continue;
    const keys = Array.isArray(row.storage_keys) ? row.storage_keys.filter((k): k is string => typeof k === "string") : [];
    if (keys.some((k) => !k.startsWith(`global/${workspaceId}/`) || k.includes(".."))) { kept++; log("[global-sweep] invalid target kept", { workspaceId, reservation: id }); continue; }
    if (keys.length) {
      let ok = false;
      try { ok = !(await bucket(admin).remove(keys)).error; } catch { ok = false; }
      if (!ok) { kept++; log("[global-sweep] remove failed, kept for next run", { workspaceId, reservation: id }); continue; }
    }
    let relError: unknown = null;
    try { relError = (await rpc(admin)("release_stale_global_reservation", { p_reservation: id })).error; } catch { relError = true; }
    if (relError) { kept++; log("[global-sweep] release failed", { workspaceId, reservation: id }); continue; }
    released++;
  }
  return { released, kept };
}
