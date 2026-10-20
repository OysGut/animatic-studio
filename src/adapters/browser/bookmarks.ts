/**
 * DV8 (B1–B4): personlig bokmerke, ett per bruker og prosjekt. Tabellen er lesbar bare for eieren (RLS
 * user_id = auth.uid()); skriving og fjerning går via set_my_bookmark og consume_my_bookmark.
 */
import { db } from "./client";

export interface BookmarkTarget {
  /** Skjermen: «scene», «manus», «montering» … */
  readonly view: string;
  readonly occurrenceId?: string | null;
  readonly frame?: number | null;
  readonly tab?: string | null;
}
export interface Bookmark { readonly target: BookmarkTarget; readonly updatedAt: string }

export async function getMyBookmark(projectId: string): Promise<Bookmark | null> {
  const { data, error } = await db.from("user_bookmarks").select("target, updated_at").eq("project_id", projectId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const row = data as { target: BookmarkTarget; updated_at: string };
  return { target: row.target, updatedAt: row.updated_at };
}

export async function setMyBookmark(projectId: string, target: BookmarkTarget): Promise<void> {
  const { error } = await db.rpc("set_my_bookmark", { p_project: projectId, p_target: target });
  if (error) throw new Error(error.message);
}

/** Fjerner bokmerket – kalles bare etter vellykket navigasjon (B3). */
export async function consumeMyBookmark(projectId: string, updatedAt: string): Promise<boolean> {
  const { data, error } = await db.rpc("consume_my_bookmark", { p_project: projectId, p_updated_at: updatedAt });
  if (error) throw new Error(error.message);
  return data === true;
}
