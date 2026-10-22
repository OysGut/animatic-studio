/** Rigg R5: fra kopikode til sceneeditoren (riktig scene, frame og lag). Bare data via RLS. */
import { db } from "@/adapters/browser/client";
import { lookupPrintCopy } from "@/adapters/browser/print-copies";

export interface CopyDestination {
  readonly projectId: string;
  readonly occurrenceId: string;
  readonly frame: number;
  readonly layerId: string;
}

/** Null ved ukjent, tilbaketrukket kode eller manglende tilgang (nøytral feil). */
export async function resolveCopyCode(code: string, projectId?: string): Promise<CopyDestination | null> {
  const hit = await lookupPrintCopy(code, projectId);
  if (!hit) return null;
  const layer = await db.from("composition_layers" as never).select("composition_id").eq("id", hit.layerId).maybeSingle();
  const compId = (layer.data as { composition_id?: string } | null)?.composition_id;
  if (!compId) return null;
  const comp = await db.from("compositions" as never).select("variant_id").eq("id", compId).maybeSingle();
  const variantId = (comp.data as { variant_id?: string } | null)?.variant_id;
  if (!variantId) return null;
  const occ = await db
    .from("scene_occurrences" as never)
    .select("id")
    .eq("variant_id", variantId)
    .eq("active", true)
    .limit(1);
  const occurrenceId = ((occ.data ?? []) as { id: string }[])[0]?.id;
  if (!occurrenceId) return null;
  return { projectId: hit.projectId, occurrenceId, frame: hit.frame, layerId: hit.layerId };
}
