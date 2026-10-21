/**
 * Serverfunksjoner for det globale ressursbiblioteket (GP2, migrasjon 0046).
 * Filene ligger i bøtta «assets» under global/<gruppe>/… – ingen klient har lagringstilgang dit; her sjekkes
 * medlemskap og rolle med brukerens egen tilkobling (RLS), og filene leses, kopieres og lastes opp med
 * service role. Metadata skrives med brukerens tilkobling gjennom databasefunksjonene, som sjekker rollen igjen.
 * - «Lagre i globalt bibliotek» (§6, G2): kopierer prosjektressursens filer til gruppen (én fil per sha256).
 * - «Bruk i prosjekt» (§5, §7, G3/G4): kopierer den globale filen inn i prosjektet (én kopi per prosjekt og
 *   versjon); kommandoene som kobler den inn, kjøres i nettleseren gjennom den vanlige kommandostakken.
 */
import type { FontSpec } from "@/core/typography/project-fonts";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assetFilePath, extensionOf, globalFilePath, globalKindOf, isGlobalPathOf, isUuid, templateError, type AssetMedia, type TemplateDefinition } from "@/core";
import type { AnyClient } from "@/adapters/storage/project-rows";
import { t as tk } from "@/core/i18n/keyed";

const BUCKET = "assets";
const ROLE_RANK: Record<string, number> = { member: 1, editor: 2, owner: 3 };
const PROJECT_RANK: Record<string, number> = { viewer: 1, commenter: 2, editor: 3, owner: 4 };

async function admin(): Promise<AnyClient> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as AnyClient;
}

function bad(): never {
  throw new Error(tk("adapters-global-global-library-functions.bad.message.a3b892b887e4"));
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

/** Avledede bildefiler slik de lagres i derived_files (B-105a): nøklene er working/proxy/thumbnail/originalRaw. */
type GlobalDerivedFile = {
  readonly path: string;
  readonly width: number | null;
  readonly height: number | null;
  readonly byteSize: number;
  readonly sha256: string;
};
type GlobalDerivedFiles = Partial<Record<"working" | "proxy" | "thumbnail" | "originalRaw", GlobalDerivedFile>>;

/** Kopierer de avledede filene og returnerer samme struktur med de nye stiene (undefined når det ikke er noen). */
async function copyDerivedFiles(
  a: AnyClient,
  derived: GlobalDerivedFiles | null | undefined,
  to: (d: GlobalDerivedFile) => string,
  /** Kildestiene må ligge under dette prefikset (eget prosjekt eller egen gruppe); andre hoppes over. */
  fromPrefix: string,
): Promise<GlobalDerivedFiles | undefined> {
  if (!derived || typeof derived !== "object") return undefined;
  const out: GlobalDerivedFiles = {};
  for (const key of ["working", "proxy", "thumbnail", "originalRaw"] as const) {
    const d = derived[key];
    if (!d || typeof d.path !== "string" || !d.path) continue;
    if (!d.path.startsWith(fromPrefix) || d.path.includes("..")) continue;
    const target = to(d);
    const err = await copyFile(a, d.path, target);
    if (err) throw new Error(err);
    out[key] = { ...d, path: target };
  }
  return Object.keys(out).length > 0 ? out : undefined;
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
      throw new Error(tk("adapters-global-global-library-functions.get-global-file-urls.create-server-fn-method-post-middleware-require-supabase-auth-validator-d-unknown-const-x-obj-d-const-workspace-id-uuid-x-workspace-id-const-paths-x-paths-if-array-is-array-paths-paths-length-200-bad-for-const-p-of-paths-if-typeof-p-string-is-global-path-of-p-workspace-id-bad-return-workspace-id-paths-paths-as-string-handler.0f36e968a276"));
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
        tk("adapters-global-global-library-functions.create-global-upload.create-server-fn-method-post-middleware-require-supabase-auth-validator-d-unknown-const-x-obj-d-const-sha256-x-sha256-const-ext-x-ext-if-typeof-sha256-string-0-9a-f-64-test-sha256-bad-if-typeof-ext-string-a-z0-9-1-8-i-test-ext-bad-return-workspace-id-uuid-x-workspace-id-global-asset-id-uuid-x-global-asset-id-sha256-ext-handler.2ef81d018d0e"),
      );
    const { data: ga } = await db
      .from("global_assets")
      .select("id")
      .eq("id", data.globalAssetId)
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    if (!ga) throw new Error(tk("adapters-global-global-library-functions.create-global-upload.create-server-fn-method-post-middleware-require-supabase-auth-validator-d-unknown-const-x-obj-d-const-sha256-x-sha256-const-ext-x-ext-if-typeof-sha256-string-0-9a-f-64-test-sha256-bad-if-typeof-ext-string-a-z0-9-1-8-i-test-ext-bad-return-workspace-id-uuid-x-workspace-id-global-asset-id-uuid-x-global-asset-id-sha256-ext-handler.88b0cfae5299"));
    const path = globalFilePath(data.workspaceId, data.globalAssetId, data.sha256, data.ext);
    const { data: up, error } = await storageOf(await admin())
      .from(BUCKET)
      .createSignedUploadUrl(path, { upsert: true });
    if (error || !up) throw new Error(error?.message ?? tk("adapters-global-global-library-functions.create-global-upload.create-server-fn-method-post-middleware-require-supabase-auth-validator-d-unknown-const-x-obj-d-const-sha256-x-sha256-const-ext-x-ext-if-typeof-sha256-string-0-9a-f-64-test-sha256-bad-if-typeof-ext-string-a-z0-9-1-8-i-test-ext-bad-return-workspace-id-uuid-x-workspace-id-global-asset-id-uuid-x-global-asset-id-sha256-ext-handler.ca2b638ccbcc"));
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
      throw new Error(tk("adapters-global-global-library-functions.register-global-version.create-server-fn-method-post-middleware-require-supabase-auth-validator-d-unknown-global-version-input-const-x-obj-d-const-s-k-string-max-number-const-v-x-k-if-typeof-v-string-v-length-max-bad-return-v-const-byte-size-x-byte-size-if-typeof-byte-size-number-number-is-integer-byte-size-byte-size-0-bad-const-template-x-template-null-if-template-null-const-error-template-error-template-if-error-throw-new-error-error-return-variant-id-uuid-x-variant-id-path-s-path-600-mime-type-s-mime-type-100-width-int-or-null-x-width-height-int-or-null-x-height-byte-size-sha256-s-sha256-64-duration-ms-int-or-null-x-duration-ms-note-s-note-2000-template-template-as-template-definition-null-handler.7ad1560b4c41"));
    if (!(await fileExists(await admin(), data.path)))
      throw new Error(tk("adapters-global-global-library-functions.register-global-version.create-server-fn-method-post-middleware-require-supabase-auth-validator-d-unknown-global-version-input-const-x-obj-d-const-s-k-string-max-number-const-v-x-k-if-typeof-v-string-v-length-max-bad-return-v-const-byte-size-x-byte-size-if-typeof-byte-size-number-number-is-integer-byte-size-byte-size-0-bad-const-template-x-template-null-if-template-null-const-error-template-error-template-if-error-throw-new-error-error-return-variant-id-uuid-x-variant-id-path-s-path-600-mime-type-s-mime-type-100-width-int-or-null-x-width-height-int-or-null-x-height-byte-size-sha256-s-sha256-64-duration-ms-int-or-null-x-duration-ms-note-s-note-2000-template-template-as-template-definition-null-handler.8a2981a00f8b"));
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
      throw new Error(tk("adapters-global-global-library-functions.save-asset-to-global.create-server-fn-method-post-middleware-require-supabase-auth-validator-d-unknown-const-x-obj-d-return-project-id-uuid-x-project-id-asset-id-uuid-x-asset-id-workspace-id-uuid-x-workspace-id-handler.dbc199e2c031"));
    if ((await workspaceRank(db, data.workspaceId, context.userId)) < 2)
      throw new Error(
        tk("adapters-global-global-library-functions.save-asset-to-global.create-server-fn-method-post-middleware-require-supabase-auth-validator-d-unknown-const-x-obj-d-return-project-id-uuid-x-project-id-asset-id-uuid-x-asset-id-workspace-id-uuid-x-workspace-id-handler.388ed67c15e2"),
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
    if (!a) throw new Error(tk("adapters-global-global-library-functions.save-asset-to-global.create-server-fn-method-post-middleware-require-supabase-auth-validator-d-unknown-const-x-obj-d-return-project-id-uuid-x-project-id-asset-id-uuid-x-asset-id-workspace-id-uuid-x-workspace-id-handler.d555549b72ad"));
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
      .select("id, variant_id, number, media_path, mime_type, width, height, byte_size_big, sha256, duration_ms, note, removed, template_spec, font_spec, derived_files")
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
      font_spec?: FontSpec | null;
      derived_files?: GlobalDerivedFiles | null;
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
        // B-105a: de avledede filene følger med til det globale biblioteket
        const derivedFiles = await copyDerivedFiles(sa, ver.derived_files, (d) =>
          globalFilePath(data.workspaceId, globalAssetId, d.sha256, extensionOf(d.path)),
          `${data.projectId}/`,
        );
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
          ...(ver.font_spec ? { p_font_spec: ver.font_spec } : {}),
          ...(derivedFiles ? { p_derived_files: derivedFiles } : {}),
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
      throw new Error(tk("adapters-global-global-library-functions.copy-global-to-project.create-server-fn-method-post-middleware-require-supabase-auth-validator-d-unknown-const-x-obj-d-const-items-x-items-if-array-is-array-items-items-length-0-items-length-50-bad-return-project-id-uuid-x-project-id-items-items-map-i-const-o-obj-i-return-global-version-id-uuid-o-global-version-id-project-asset-id-uuid-o-project-asset-id-project-version-id-uuid-o-project-version-id-handler.4d58d387b738"));
    const { data: project } = await db
      .from("projects")
      .select("workspace_id")
      .eq("id", data.projectId)
      .maybeSingle();
    const ws = (project as { workspace_id?: string | null } | null)?.workspace_id ?? null;
    if (!ws)
      throw new Error(
        tk("adapters-global-global-library-functions.copy-global-to-project.create-server-fn-method-post-middleware-require-supabase-auth-validator-d-unknown-const-x-obj-d-const-items-x-items-if-array-is-array-items-items-length-0-items-length-50-bad-return-project-id-uuid-x-project-id-items-items-map-i-const-o-obj-i-return-global-version-id-uuid-o-global-version-id-project-asset-id-uuid-o-project-asset-id-project-version-id-uuid-o-project-version-id-handler.394d754dcfb0"),
      );
    // Lest med brukerens tilgang: bare versjoner i gruppen brukeren er med i
    const { data: rows } = await db
      .from("global_asset_versions")
      .select("id, workspace_id, storage_key, mime_type, width, height, byte_size, sha256, duration_ms, derived_files")
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
        derived_files: GlobalDerivedFiles | null;
      }[]).map((r) => [r.id, r]),
    );
    const sa = await admin();
    const out: Record<string, AssetMedia> = {};
    for (const it of data.items) {
      const g = byId.get(it.globalVersionId);
      if (!g || g.workspace_id !== ws)
        throw new Error(
          tk("adapters-global-global-library-functions.copy-global-to-project.create-server-fn-method-post-middleware-require-supabase-auth-validator-d-unknown-const-x-obj-d-const-items-x-items-if-array-is-array-items-items-length-0-items-length-50-bad-return-project-id-uuid-x-project-id-items-items-map-i-const-o-obj-i-return-global-version-id-uuid-o-global-version-id-project-asset-id-uuid-o-project-asset-id-project-version-id-uuid-o-project-version-id-handler.8a9c9397f987"),
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
      // B-105a: de avledede filene kopieres én gang per global versjon, som originalen
      const derivedFiles = await copyDerivedFiles(sa, g.derived_files, (d) =>
        assetFilePath(
          data.projectId,
          "source",
          it.projectAssetId,
          it.projectVersionId,
          `${d.sha256}.${extensionOf(d.path)}`,
        ),
        `global/${ws}/`,
      );
      out[it.globalVersionId] = {
        path,
        mimeType: g.mime_type,
        width: g.width,
        height: g.height,
        byteSize: Number(g.byte_size),
        sha256: g.sha256,
        ...(g.duration_ms ? { durationMs: g.duration_ms } : {}),
        ...(derivedFiles ? { derivedFiles } : {}),
      };
    }
    return out;
  });

// ---------- R3: publisering til en ressurs som allerede er global (migrasjon 0068) ----------

export interface PublishToGlobalResult {
  readonly globalAssetId: string;
  readonly globalVariantId: string;
  readonly globalVersionId: string;
  readonly number: number;
  /** En ny global variant ble laget (prosjektvarianten var ikke koblet til noen). */
  readonly newVariant: boolean;
}

/**
 * R3 «Publiser globalt» for en stilharmonisert versjon når ressursen allerede er koblet til det globale
 * biblioteket: ny global versjon på den koblede varianten (eller en ny variant), aldri en kopi av hele
 * ressursen. Andre prosjekter endres ikke; de får varselet «Ny versjon finnes» og velger selv.
 * Rettigheter: redaktør eller eier i prosjektet og i gruppen (databasefunksjonene sjekker gruppen igjen).
 */
export const publishVersionToGlobal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => {
    const x = obj(d);
    return { projectId: uuid(x["projectId"]), versionId: uuid(x["versionId"]), workspaceId: uuid(x["workspaceId"]) };
  })
  .handler(async ({ data, context }): Promise<PublishToGlobalResult> => {
    const db = context.supabase as unknown as AnyClient;
    if ((await projectRank(db, data.projectId, context.userId)) < 3) throw new Error(tk("r3-global.error.project-rights"));
    if ((await workspaceRank(db, data.workspaceId, context.userId)) < 2) throw new Error(tk("r3-global.error.workspace-rights"));
    const { data: ver } = await db
      .from("asset_versions")
      .select("id, variant_id, media_path, mime_type, width, height, byte_size_big, sha256, duration_ms, note, removed, template_spec, font_spec, derived_files")
      .eq("id", data.versionId)
      .eq("project_id", data.projectId)
      .maybeSingle();
    const v = ver as {
      variant_id: string; media_path: string; mime_type: string; width: number | null; height: number | null;
      byte_size_big: number; sha256: string; duration_ms: number | null; note: string | null; removed: boolean | null;
      template_spec: TemplateDefinition | null;
      font_spec?: FontSpec | null;
      derived_files?: GlobalDerivedFiles | null;
    } | null;
    if (!v || v.removed || !v.media_path.startsWith(`${data.projectId}/`)) throw new Error(tk("r3-global.error.no-version"));
    const { data: va } = await db
      .from("asset_variants")
      .select("id, asset_id, name, style, appearance")
      .eq("id", v.variant_id)
      .eq("project_id", data.projectId)
      .maybeSingle();
    const variant = va as { asset_id: string; name: string; style: string; appearance: string | null } | null;
    if (!variant) throw new Error(tk("r3-global.error.no-version"));
    const { data: as } = await db
      .from("assets")
      .select("source_global_asset_id, removed")
      .eq("id", variant.asset_id)
      .eq("project_id", data.projectId)
      .maybeSingle();
    const globalAssetId = (as as { source_global_asset_id: string | null } | null)?.source_global_asset_id ?? null;
    if (!globalAssetId) throw new Error(tk("r3-global.error.not-global"));
    const { data: ga } = await db
      .from("global_assets")
      .select("id, workspace_id, archived_at")
      .eq("id", globalAssetId)
      .maybeSingle();
    const g = ga as { workspace_id: string; archived_at: string | null } | null;
    if (!g || g.workspace_id !== data.workspaceId || g.archived_at) throw new Error(tk("r3-global.error.not-global"));
    // Den koblede globale varianten: fra versjonene i prosjektvarianten som er kopiert fra den globale ressursen
    const { data: links } = await db
      .from("asset_versions")
      .select("source_global_variant_id")
      .eq("project_id", data.projectId)
      .eq("variant_id", v.variant_id)
      .eq("source_global_asset_id", globalAssetId)
      .not("source_global_variant_id", "is", null)
      .limit(20);
    let globalVariantId: string | null = null;
    for (const l of (links ?? []) as { source_global_variant_id: string }[]) {
      const { data: gv } = await db
        .from("global_asset_variants")
        .select("id, archived_at")
        .eq("id", l.source_global_variant_id)
        .eq("global_asset_id", globalAssetId)
        .maybeSingle();
      if (gv && !(gv as { archived_at: string | null }).archived_at) { globalVariantId = l.source_global_variant_id; break; }
    }
    let newVariant = false;
    if (!globalVariantId) {
      const { data: id, error } = await db.rpc("global_create_variant", {
        p_asset: globalAssetId, p_name: variant.name, p_style: variant.style, p_appearance: variant.appearance ?? "",
      });
      if (error) throw new Error(error.message);
      globalVariantId = id as string;
      newVariant = true;
    }
    const to = globalFilePath(data.workspaceId, globalAssetId, v.sha256, extensionOf(v.media_path));
    const err = await copyFile(await admin(), v.media_path, to);
    if (err) throw new Error(err);
    // B-105a: de avledede filene følger med til det globale biblioteket
    const derivedFiles = await copyDerivedFiles(await admin(), v.derived_files, (d) =>
      globalFilePath(data.workspaceId, globalAssetId, d.sha256, extensionOf(d.path)),
    );
    const { data: gid, error: e2 } = await db.rpc("global_add_version", {
      p_variant: globalVariantId, p_storage_key: to, p_mime: v.mime_type, p_width: v.width, p_height: v.height,
      p_bytes: v.byte_size_big, p_sha256: v.sha256, p_duration_ms: v.duration_ms, p_note: v.note ?? "",
      p_template_spec: v.template_spec ?? null,
      ...(v.font_spec ? { p_font_spec: v.font_spec } : {}),
      ...(derivedFiles ? { p_derived_files: derivedFiles } : {}),
    });
    if (e2) throw new Error(e2.message);
    const { data: num } = await db.from("global_asset_versions").select("number").eq("id", gid as string).maybeSingle();
    return {
      globalAssetId, globalVariantId, globalVersionId: gid as string,
      number: Number((num as { number?: number } | null)?.number ?? 0), newVariant,
    };
  });

/**
 * R3: «Angre» trekker en publisert global versjon tilbake (skjules for ny bruk; raden og filen beholdes), og
 * «gjør om» publiserer den igjen. Prosjekter som har kopiert versjonen, endres aldri.
 * Rettigheter: redaktør eller eier i gruppen (sjekkes her og igjen i databasefunksjonen).
 */
export const setGlobalVersionWithdrawn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => {
    const x = obj(d);
    if (typeof x["withdrawn"] !== "boolean") bad();
    return { versionId: uuid(x["versionId"]), withdrawn: x["withdrawn"] as boolean };
  })
  .handler(async ({ data, context }): Promise<{ changed: boolean }> => {
    const db = context.supabase as unknown as AnyClient;
    const { data: row } = await db.from("global_asset_versions").select("workspace_id").eq("id", data.versionId).maybeSingle();
    const ws = (row as { workspace_id?: string } | null)?.workspace_id;
    if (!ws || (await workspaceRank(db, ws, context.userId)) < 2) throw new Error(tk("r3-global.error.workspace-rights"));
    const { data: changed, error } = await db.rpc("global_set_version_withdrawn", { p_version: data.versionId, p_withdrawn: data.withdrawn });
    if (error) throw new Error(error.message);
    return { changed: changed === true };
  });
