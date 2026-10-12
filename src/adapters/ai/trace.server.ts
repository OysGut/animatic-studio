/**
 * Sporbarhet per generering (DEC-0072, REQ-0257): serveren slår opp referansenes ressursversjoner, siste
 * lagrede manusversjon og revisjonen av manuslinjene i scenen når jobben registreres. Feiler et oppslag,
 * lagres det som er kjent (sporet skal aldri stoppe en jobb). Bare på serveren.
 */
import {
  SYSTEM_INSTRUCTIONS,
  fitTrace,
  textHash,
  type GenerationTrace,
  type TraceReference,
} from "@/core";
import type { AnyClient } from "@/adapters/storage/project-rows";

export async function buildTrace(
  db: AnyClient,
  projectId: string,
  input: {
    /** Nøkkel i SYSTEM_INSTRUCTIONS. */
    readonly systemInstruction?: string | null;
    readonly modelParams?: Readonly<Record<string, string | number | boolean | null | undefined>>;
    readonly referencePaths?: readonly (string | null | undefined)[];
    readonly occurrenceId?: string | null;
    readonly segmentId?: string | null;
  },
): Promise<GenerationTrace> {
  const paths = [...new Set((input.referencePaths ?? []).filter((p): p is string => !!p))].slice(
    0,
    20,
  );
  const references: TraceReference[] = paths.map((path) => ({
    path,
    versionId: null,
    assetId: null,
    assetName: null,
    variantName: null,
    number: null,
  }));
  try {
    if (paths.length) {
      const { data: versions } = await db
        .from("asset_versions")
        .select("id, variant_id, number, media_path")
        .eq("project_id", projectId)
        .in("media_path", paths);
      const vs = (versions ?? []) as {
        id: string;
        variant_id: string;
        number: number;
        media_path: string;
      }[];
      const variantIds = [...new Set(vs.map((v) => v.variant_id))];
      const { data: variants } = variantIds.length
        ? await db
            .from("asset_variants")
            .select("id, asset_id, name")
            .eq("project_id", projectId)
            .in("id", variantIds)
        : { data: [] };
      const vars = (variants ?? []) as { id: string; asset_id: string; name: string }[];
      const assetIds = [...new Set(vars.map((v) => v.asset_id))];
      const { data: assets } = assetIds.length
        ? await db.from("assets").select("id, name").eq("project_id", projectId).in("id", assetIds)
        : { data: [] };
      const names = new Map(
        ((assets ?? []) as { id: string; name: string }[]).map((a) => [a.id, a.name]),
      );
      for (let i = 0; i < references.length; i++) {
        const v = vs.find((x) => x.media_path === references[i]!.path);
        const variant = v ? vars.find((x) => x.id === v.variant_id) : undefined;
        if (!v) continue;
        references[i] = {
          path: v.media_path,
          versionId: v.id,
          assetId: variant?.asset_id ?? null,
          assetName: variant ? (names.get(variant.asset_id) ?? null) : null,
          variantName: variant?.name ?? null,
          number: v.number,
        };
      }
    }
  } catch {
    // Referansene står med sti
  }
  let scriptVersion: GenerationTrace["scriptVersion"] = null;
  try {
    const { data } = await db
      .from("script_versions")
      .select("id, number, name")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(1);
    const v = (data ?? [])[0] as { id: string; number: number; name: string } | undefined;
    if (v) scriptVersion = { id: v.id, number: v.number, name: v.name };
  } catch {
    scriptVersion = null;
  }
  const blockRevisions: Record<string, number> = {};
  try {
    if (input.occurrenceId) {
      const { data: occ } = await db
        .from("scene_occurrences")
        .select("variant_id")
        .eq("id", input.occurrenceId)
        .eq("project_id", projectId)
        .maybeSingle();
      const variantId = (occ as { variant_id?: string } | null)?.variant_id;
      if (variantId) {
        const { data: blocks } = await db
          .from("script_blocks")
          .select("id, current_rev, kind, removed")
          .eq("project_id", projectId)
          .eq("variant_id", variantId)
          .limit(2000);
        // Bare linjene som står i manuset (ikke scenehodet eller fjernede linjer)
        for (const b of (blocks ?? []) as {
          id: string;
          current_rev: number;
          kind?: string;
          removed?: boolean;
        }[])
          if (b.kind !== "heading" && b.removed !== true) blockRevisions[b.id] = b.current_rev;
      }
    }
  } catch {
    // Uten linjenes revisjoner
  }
  const modelParams: Record<string, string | number | boolean | null> = {};
  for (const [k, v] of Object.entries(input.modelParams ?? {}))
    if (v !== undefined) modelParams[k] = v;
  const sys = input.systemInstruction ? SYSTEM_INSTRUCTIONS[input.systemInstruction] : undefined;
  return fitTrace({
    v: 1,
    systemInstruction: input.systemInstruction ?? null,
    ...(sys ? { systemInstructionHash: textHash(sys.text) } : {}),
    modelParams,
    references,
    scriptVersion,
    blockRevisions,
    occurrenceId: input.occurrenceId ?? null,
    segmentId: input.segmentId ?? null,
  });
}
