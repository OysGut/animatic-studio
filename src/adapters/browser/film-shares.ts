/**
 * QR-deling av filmversjoner (GP5) i nettleseren: rader via RLS, skriving via databasefunksjonene, filen
 * lastes opp til prosjektets sti (eksisterende policy: redaktører laster opp, ingen kan overskrive).
 */
import type { ShareDays, ShareRowStatus } from "@/core";
import { backendMessage, db } from "./client";

export interface FilmShareRow {
  readonly id: string;
  readonly exportRecordId: string;
  readonly title: string;
  readonly status: ShareRowStatus;
  readonly expiresAt: string | null;
  readonly shareDays: number | null;
  readonly byteSize: number;
  readonly createdAt: string;
}

export async function listFilmShares(projectId: string): Promise<FilmShareRow[]> {
  const { data, error } = await db
    .from("film_shares" as never)
    .select("id, export_record_id, title, status, expires_at, share_days, byte_size, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(backendMessage(error));
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r["id"]),
    exportRecordId: String(r["export_record_id"]),
    title: String(r["title"]),
    status: r["status"] as ShareRowStatus,
    expiresAt: (r["expires_at"] as string | null) ?? null,
    shareDays: (r["share_days"] as number | null) ?? null,
    byteSize: Number(r["byte_size"]),
    createdAt: String(r["created_at"]),
  }));
}

export async function createFilmShare(
  projectId: string,
  v: {
    exportRecordId: string;
    title: string;
    byteSize: number;
    durationMs: number;
    width: number;
    height: number;
    days: ShareDays;
  },
): Promise<{ id: string; storageKey: string }> {
  const { data, error } = await db.rpc("create_film_share" as never, {
    p_project: projectId,
    p_export_record: v.exportRecordId,
    p_title: v.title,
    p_byte_size: v.byteSize,
    p_duration_ms: v.durationMs,
    p_width: v.width,
    p_height: v.height,
    p_share_days: v.days,
  } as never);
  if (error) throw new Error(backendMessage(error));
  const r = data as unknown as { id: string; storage_key: string };
  return { id: r.id, storageKey: r.storage_key };
}

export async function uploadShareFile(path: string, file: Blob): Promise<void> {
  const { error } = await db.storage
    .from("assets")
    .upload(path, file, { contentType: "video/mp4", upsert: false });
  if (error) throw new Error(backendMessage(error));
}

export async function revokeFilmShare(shareId: string): Promise<void> {
  const { error } = await db.rpc("revoke_film_share" as never, { p_share: shareId } as never);
  if (error) throw new Error(backendMessage(error));
}

export async function filmShareToken(shareId: string): Promise<string | null> {
  const { data, error } = await db.rpc("film_share_token" as never, { p_share: shareId } as never);
  if (error) throw new Error(backendMessage(error));
  return (data as unknown as string | null) ?? null;
}
