/**
 * Serverfunksjoner for det globale ressursbiblioteket (GP2, migrasjon 0046).
 * Filene ligger i bøtta «assets» under global/<gruppe>/… – ingen klient har lagringstilgang dit; her sjekkes
 * medlemskap og rolle med brukerens egen tilkobling (RLS), og filene leses, kopieres og lastes opp med
 * service role. Metadata skrives med brukerens tilkobling gjennom databasefunksjonene, som sjekker rollen igjen.
 * - «Lagre i globalt bibliotek» (§6, G2): kopierer prosjektressursens filer til gruppen (én fil per sha256).
 * - «Bruk i prosjekt» (§5, §7, G3/G4): kopierer den globale filen inn i prosjektet (én kopi per prosjekt og
 *   versjon); kommandoene som kobler den inn, kjøres i nettleseren gjennom den vanlige kommandostakken.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  L,
  assetFilePath,
  extensionOf,
  globalFilePath,
  globalKindOf,
  isGlobalPathOf,
  isUuid,
  templateError,
  type AssetMedia,
  type TemplateDefinition,
} from "@/core";
import type { AnyClient } from "@/adapters/storage/project-rows";

const BUCKET = "assets";
const ROLE_RANK: Record<string, number> = { member: 1, editor: 2, owner: 3 };
const PROJECT_RANK: Record<string, number> = { viewer: 1, commenter: 2, editor: 3, owner: 4 };

async function admin(): Promise<AnyClient> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as AnyClient;
}

function bad(): never {
  throw new Error(L("Ugyldig forespørsel", "Invalid request"));
}
function obj(d: unknown): Record<string, unknown> {
  if (!d || typeof d !== "object") bad();
  return d as Record<string, unknown>;
}
function uuid(v: unknown): string {
  if (typeof v !== "string" || !isUuid(v)) bad();
  return v.toLowerCase();
}

async function workspaceRank(db: AnyClient, workspaceId: string, userId: string): Promise<number> {
  const { data } = await db
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .is("removed_at", null)
    .maybeSingle();
  return ROLE_RANK[(data as { role?: string } | null)?.role ?? ""] ?? 0;
}

async function projectRank(db: AnyClient, projectId: string, userId: string): Promise<number> {
  const { data } = await db
    .from("project_members")
    .select("role")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .is("removed_at", null)
    .maybeSingle();
  return PROJECT_RANK[(data as { role?: string } | null)?.role ?? ""] ?? 0;
}

/** Kopierer en fil i lagringen. En fil som allerede finnes (samme innhold, samme sti), regnes som kopiert. */
async function copyFile(a: AnyClient, from: string, to: string): Promise<string | null> {
  const storage = (a as unknown as {
    storage: {
      from: (b: string) => {
        copy: (f: string, t: string) => Promise<{ error: { message: string } | null }>;
      };
    };
  }).storage;
  const { error } = await storage.from(BUCKET).copy(from, to);
  if (!error || /already exists|Duplicate/i.test(error.message)) return null;
  return error.message;
}

type Storage = {
  from: (b: string) => {
    createSignedUrls: (
      p: string[],
      s: number,
    ) => Promise<{ data: { path: string | null; signedUrl: string }[] | null; error: { message: string } | null }>;
    createSignedUploadUrl: (
      p: string,
      o: { upsert: boolean },
    ) => Promise<{ data: { path: string; token: string } | null; error: { message: string } | null }>;
    list: (
      folder: string,
      o: { search: string; limit: number },
    ) => Promise<{ data: { name: string }[] | null; error: { message: string } | null }>;
  };
};
function storageOf(a: AnyClient): Storage {
  return (a as unknown as { storage: Storage }).storage;
}

// ---------- Forhåndsvisning (G7) ----------

export const getGlobalFileUrls = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => {
    const x = obj(d);
    const workspaceId = uuid(x["workspaceId"]);
    const paths = x["paths"];
    if (!Array.isArray(paths) || paths.length > 200) bad();
    for (const p of paths) if (typeof p !== "string" || !isGlobalPathOf(p, workspaceId)) bad();
    return { workspaceId, paths: paths as string[] };
  })
  .handler(async ({ data, context }): Promise<Record<string, string>> => {
    const db = context.supabase as unknown as AnyClient;
    if ((await workspaceRank(db, data.workspaceId, context.userId)) < 1)
      throw new Error(L("Ingen tilgang til gruppen", "No access to the workspace"));
    if (!data.paths.length) return {};
    const { data: urls, error } = await storageOf(await admin())
      .from(BUCKET)
      .createSignedUrls(data.paths, 600);
    if (error) throw new Error(error.message);
    const out: Record<string, string> = {};
    for (const u of urls ?? []) if (u.path && u.signedUrl) out[u.path] = u.signedUrl;
    return out;
  });

// ---------- Ny global fil (G1, G8) ----------

export const createGlobalUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => {
    const x = obj(d);
    const sha256 = x["sha256"];
    const ext = x["ext"];
    if (typeof sha256 !== "string" || !/^[0-9a-f]{64}$/.test(sha256)) bad();
    if (typeof ext !== "string" || !/^[a-z0-9]{1,8}$/i.test(ext)) bad();
    return { workspaceId: uuid(x["workspaceId"]), globalAssetId: uuid(x["globalAssetId"]), sha256, ext };
  })
  .handler(async ({ data, context }): Promise<{ path: string; token: string }> => {
    const db = context.supabase as unknown as AnyClient;
    if ((await workspaceRank(db, data.workspaceId, context.userId)) < 2)
      throw new Error(
        L("Bare eier og redaktør kan laste opp", "Only owners and editors can upload"),
      );
    const { data: ga } = await db
      .from("global_assets")
      .select("id")
      .eq("id", data.globalAssetId)
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    if (!ga) throw new Error(L("Ressursen finnes ikke", "The asset does not exist"));
    const path = globalFilePath(data.workspaceId, data.globalAssetId, data.sha256, data.ext);
    const { data: up, error } = await storageOf(await admin())
      .from(BUCKET)
      .createSignedUploadUrl(path, { upsert: true });
    if (error || !up) throw new Error(error?.message ?? L("Lagringen svarte ikke", "The storage did not respond"));
    return { path, token: up.token };
  });

async function fileExists(a: AnyClient, path: string): Promise<boolean> {
  const i = path.lastIndexOf("/");
  const { data } = await storageOf(a)
    .from(BUCKET)
    .list(path.slice(0, i), { search: path.slice(i + 1), limit: 10 });
  return (data ?? []).some((f) => f.name === path.slice(i + 1));
}

export interface GlobalVersionInput {
  readonly variantId: string;
  readonly path: string;
  readonly mimeType: string;
  readonly width: number | null;
  readonly height: number | null;
  readonly byteSize: number;
  readonly sha256: string;
  readonly durationMs: number | null;
  readonly note: string;
  readonly template?: TemplateDefinition | null;
}

function intOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isInteger(v) && v > 0 ? v : null;
}

export const registerGlobalVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown): GlobalVersionInput => {
    const x = obj(d);
    const s = (k: string, max: number) => {
      const v = x[k];
      if (typeof v !== "string" || v.length > max) bad();
      return v;
    };
    const byteSize = x["byteSize"];
    if (typeof byteSize !== "number" || !Number.isInteger(byteSize) || byteSize <= 0) bad();
    const template = x["template"] ?? null;
    if (template !== null) {
      const error = templateError(template);
      if (error) throw new Error(error);
    }
    return {
      variantId: uuid(x["variantId"]),
      path: s("path", 600),
      mimeType: s("mimeType", 100),
      width: intOrNull(x["width"]),
      height: intOrNull(x["height"]),
      byteSize,
      sha256: s("sha256", 64),
      durationMs: intOrNull(x["durationMs"]),
      note: s("note", 2000),
      template: template as TemplateDefinition | null,
    };
  })
  .handler(async ({ data, context }): Promise<string> => {
    const db = context.supabase as unknown as AnyClient;
    const { data: v } = await db
      .from("global_asset_variants")
      .select("workspace_id, global_asset_id")
      .eq("id", data.variantId)
      .maybeSingle();
    const row = v as { workspace_id: string; global_asset_id: string } | null;
    if (!row || !isGlobalPathOf(data.path, row.workspace_id, row.global_asset_id))
      throw new Error(L("Ugyldig lagringssti", "Invalid storage path"));
    if (!(await fileExists(await admin(), data.path)))
      throw new Error(L("Filen ble ikke lastet opp", "The file was not uploaded"));
    const { data: id, error } = await db.rpc("global_add_version", {
      p_variant: data.variantId,
      p_storage_key: data.path,
      p_mime: data.mimeType,
      p_width: data.width,
      p_height: data.height,
      p_bytes: data.byteSize,
      p_sha256: data.sha256,
      p_duration_ms: data.durationMs,
      p_note: data.note,
      p_template_spec: data.template ?? null,
    });
    if (error) throw new Error(error.message);
    return id as string;
  });

// ---------- «Lagre i globalt bibliotek» (§6, G2) ----------

export const saveAssetToGlobal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => {
    const x = obj(d);
    return {
      projectId: uuid(x["projectId"]),
      assetId: uuid(x["assetId"]),
      workspaceId: uuid(x["workspaceId"]),
    };
  })
  .handler(async ({ data, context }): Promise<{ globalAssetId: string; versions: number }> => {
    const db = context.supabase as unknown as AnyClient;
    if ((await projectRank(db, data.projectId, context.userId)) < 3)
      throw new Error(L("Du har ikke skriverett i prosjektet", "You cannot edit this project"));
    if ((await workspaceRank(db, data.workspaceId, context.userId)) < 2)
      throw new Error(
        L(
          "Bare eier og redaktør i gruppen kan legge til i det globale biblioteket",
          "Only owners and editors in the workspace can add to the global library",
        ),
      );
    // Prosjektets egne rader, lest med brukerens tilgang (RLS)
    const { data: asset } = await db
      .from("assets")
      .select("id, kind, name, description, category, tags")
      .eq("id", data.assetId)
      .eq("project_id", data.projectId)
      .maybeSingle();
    const a = asset as {
      kind: string;
      name: string;
      description: string;
      category: string;
      tags: string[];
    } | null;
    if (!a) throw new Error(L("Ressursen finnes ikke", "The asset does not exist"));
    const { data: variants } = await db
      .from("asset_variants")
      .select("id, name, style, appearance, archived")
      .eq("asset_id", data.assetId)
      .eq("project_id", data.projectId);
    const vars = ((variants ?? []) as {
      id: string;
      name: string;
      style: string;
      appearance: string;
      archived: boolean;
    }[]).filter((v) => !v.archived);
    const { data: versions } = await db
      .from("asset_versions")
      .select("id, variant_id, number, media_path, mime_type, width, height, byte_size_big, sha256, duration_ms, note, removed, template_spec")
      .in(
        "variant_id",
        vars.map((v) => v.id),
      )
      .eq("project_id", data.projectId);
    const vers = ((versions ?? []) as {
      variant_id: string;
      number: number;
      media_path: string;
      mime_type: string;
      width: number | null;
      height: number | null;
      byte_size_big: number;
      sha256: string;
      duration_ms: number | null;
      note: string;
      removed: boolean | null;
      template_spec: TemplateDefinition | null;
    }[])
      .filter((v) => !v.removed && v.media_path.startsWith(`${data.projectId}/`))
      .sort((x, y) => x.number - y.number);
    const { data: gid, error: e1 } = await db.rpc("global_create_asset", {
      p_workspace: data.workspaceId,
      p_kind: globalKindOf(a.kind as never),
      p_name: a.name,
      p_description: a.description ?? "",
      p_categories: a.category ? [a.category] : [],
      p_tags: a.tags ?? [],
    });
    if (e1) throw new Error(e1.message);
    const globalAssetId = gid as string;
    const sa = await admin();
    let count = 0;
    for (const v of vars) {
      const { data: gv, error: e2 } = await db.rpc("global_create_variant", {
        p_asset: globalAssetId,
        p_name: v.name,
        p_style: v.style,
        p_appearance: v.appearance ?? "",
      });
      if (e2) throw new Error(e2.message);
      for (const ver of vers.filter((x) => x.variant_id === v.id)) {
        const to = globalFilePath(data.workspaceId, globalAssetId, ver.sha256, extensionOf(ver.media_path));
        const err = await copyFile(sa, ver.media_path, to);
        if (err) throw new Error(err);
        const { error: e3 } = await db.rpc("global_add_version", {
          p_variant: gv as string,
          p_storage_key: to,
          p_mime: ver.mime_type,
          p_width: ver.width,
          p_height: ver.height,
          p_bytes: ver.byte_size_big,
          p_sha256: ver.sha256,
          p_duration_ms: ver.duration_ms,
          p_note: ver.note ?? "",
          p_template_spec: ver.template_spec ?? null,
        });
        if (e3) throw new Error(e3.message);
        count++;
      }
    }
    return { globalAssetId, versions: count };
  });

// ---------- «Bruk i prosjekt» (§5, §7) ----------

export interface CopyGlobalItem {
  readonly globalVersionId: string;
  readonly projectAssetId: string;
  readonly projectVersionId: string;
}

export const copyGlobalToProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => {
    const x = obj(d);
    const items = x["items"];
    if (!Array.isArray(items) || items.length === 0 || items.length > 50) bad();
    return {
      projectId: uuid(x["projectId"]),
      items: items.map((i) => {
        const o = obj(i);
        return {
          globalVersionId: uuid(o["globalVersionId"]),
          projectAssetId: uuid(o["projectAssetId"]),
          projectVersionId: uuid(o["projectVersionId"]),
        };
      }),
    };
  })
  .handler(async ({ data, context }): Promise<Record<string, AssetMedia>> => {
    const db = context.supabase as unknown as AnyClient;
    if ((await projectRank(db, data.projectId, context.userId)) < 3)
      throw new Error(L("Du har ikke skriverett i prosjektet", "You cannot edit this project"));
    const { data: project } = await db
      .from("projects")
      .select("workspace_id")
      .eq("id", data.projectId)
      .maybeSingle();
    const ws = (project as { workspace_id?: string | null } | null)?.workspace_id ?? null;
    if (!ws)
      throw new Error(
        L(
          "Prosjektet er ikke koblet til en arbeidsgruppe. Eieren kan koble det på gruppesiden.",
          "The project is not linked to a workspace. The owner can link it on the workspace page.",
        ),
      );
    // Lest med brukerens tilgang: bare versjoner i gruppen brukeren er med i
    const { data: rows } = await db
      .from("global_asset_versions")
      .select("id, workspace_id, storage_key, mime_type, width, height, byte_size, sha256, duration_ms")
      .in(
        "id",
        data.items.map((i) => i.globalVersionId),
      );
    const byId = new Map(
      ((rows ?? []) as {
        id: string;
        workspace_id: string;
        storage_key: string;
        mime_type: string;
        width: number | null;
        height: number | null;
        byte_size: number;
        sha256: string;
        duration_ms: number | null;
      }[]).map((r) => [r.id, r]),
    );
    const sa = await admin();
    const out: Record<string, AssetMedia> = {};
    for (const it of data.items) {
      const g = byId.get(it.globalVersionId);
      if (!g || g.workspace_id !== ws)
        throw new Error(
          L(
            "Ressursen hører ikke til prosjektets arbeidsgruppe, eller du har ikke tilgang til den.",
            "The asset does not belong to the project's workspace, or you do not have access to it.",
          ),
        );
      const path = assetFilePath(
        data.projectId,
        "source",
        it.projectAssetId,
        it.projectVersionId,
        `${g.sha256}.${extensionOf(g.storage_key)}`,
      );
      const err = await copyFile(sa, g.storage_key, path);
      if (err) throw new Error(err);
      out[it.globalVersionId] = {
        path,
        mimeType: g.mime_type,
        width: g.width,
        height: g.height,
        byteSize: Number(g.byte_size),
        sha256: g.sha256,
        ...(g.duration_ms ? { durationMs: g.duration_ms } : {}),
      };
    }
    return out;
  });
