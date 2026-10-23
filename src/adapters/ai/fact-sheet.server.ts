/**
 * Faktaarket på serveren (Øystein 23.10): hentes fra ressursen, og studien av manuset bygges og lagres her
 * når det mangler. Lagringen er en vanlig, angrebar kommando (SetAssetVisualBrief via apply_changes), så den
 * synes for alle med sanntidsoppdateringen og kan tas inn på brukerens angreliste.
 * Ingen prompter logges.
 */
import { applyCommand, diffStates, factSheetStudy, newId, type Command } from "@/core";
import { loadProjectState, type AnyClient } from "@/adapters/storage/project-rows";
import { t } from "@/core/i18n/keyed";

export async function sha256Hex(text: string): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

export interface FactSheetSubject {
  readonly sheet: string;
  readonly revision: number;
  /** Studien (bare når faktaarket mangler). */
  readonly study: ReturnType<typeof factSheetStudy> | null;
}

export async function loadFactSheetSubject(
  admin: AnyClient,
  projectId: string,
  assetId: string,
): Promise<FactSheetSubject | null> {
  const { data: row } = await admin
    .from("assets")
    .select("visual_brief, revision")
    .eq("id", assetId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (!row) return null;
  const r = row as { visual_brief?: string | null; revision?: number | null };
  const sheet = (r.visual_brief ?? "").trim();
  if (sheet) return { sheet, revision: Number(r.revision ?? 0), study: null };
  const state = await loadProjectState(admin, projectId);
  const asset = state.assets[assetId];
  if (!asset) return null;
  return { sheet: "", revision: asset.revision, study: factSheetStudy(state, asset) };
}

export type SavedFactSheet = {
  readonly commandId: string;
  readonly inverse: Command;
  readonly affected: readonly string[];
};

/** Lagrer studien som faktaark (merket «laget automatisk»). */
export async function saveFactSheet(
  admin: AnyClient,
  projectId: string,
  userId: string,
  assetId: string,
  text: string,
): Promise<
  | { ok: true; revision: number; saved: SavedFactSheet }
  | { ok: false; message: string }
> {
  const { writeBlocked } = await import("@/adapters/account/lock.server");
  const blocked = await writeBlocked(admin, projectId, userId);
  if (blocked) return { ok: false, message: blocked };
  const state = await loadProjectState(admin, projectId);
  const command: Command = {
    type: "SetAssetVisualBrief",
    assetId: assetId as never,
    text,
    autoAt: new Date().toISOString(),
  };
  const id = newId<"command">();
  const result = applyCommand(state, { id, actor: userId as never, at: new Date().toISOString(), command });
  if (!result.ok) return { ok: false, message: result.error.message };
  const { error } = await admin.rpc("apply_changes", {
    p_project: projectId,
    p_actor: userId,
    p_command_id: id,
    p_command: command,
    p_inverse: result.inverse,
    p_changes: diffStates(state, result.state),
  });
  if (error) {
    // i18n-ignore: serverlogg for utvikleren (bare kode, ingen tekst fra prompten)
    console.error("[saveFactSheet]", error.code);
    return { ok: false, message: t("factSheet.error.save") };
  }
  return {
    ok: true,
    revision: result.state.assets[assetId]?.revision ?? 0,
    saved: { commandId: id, inverse: result.inverse, affected: result.affected },
  };
}
