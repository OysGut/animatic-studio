/**
 * Brukerens egne AI-nøkler og kostnadstak (DEC-0069, REQ-0566, REQ-0413).
 *
 * - Nøkkelen sendes én gang fra nettleseren til serveren (HTTPS), prøves hos leverandøren, krypteres
 *   (key-vault.server.ts) og lagres. Den sendes aldri tilbake; nettleseren ser bare leverandør, navn,
 *   de fire siste tegnene og status.
 * - Bare brukeren selv kan legge inn, prøve og fjerne sine nøkler. Fjerning sletter raden.
 * - Kostnadstaket (USD per måned) gjelder alle prosjekter som bruker brukerens nøkler.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { checkKeyFormat, isProviderId, isTextProviderId, keyHint, newId, MAX_ACCOUNT_CAP_USD, type TextProviderId } from "@/core";
import { checkSchema, type AnyClient } from "@/adapters/storage/project-rows";
import { t as tk } from "@/core/i18n/keyed";

type Keyed = "openai" | "google" | "fal" | "runway" | "elevenlabs" | "anthropic" | "xai";

export type KeyResult =
  | { readonly ok: true; readonly status: "ok" | "untested"; readonly message: string | null }
  | { readonly ok: false; readonly message: string };

const isKeyed = (p: unknown): p is Keyed => isProviderId(p) && p !== "lovable";

async function admin(): Promise<AnyClient> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as AnyClient;
}

async function schemaOk(db: AnyClient): Promise<string | null> {
  const s = await checkSchema(db);
  return s.kind === "missing" || s.version < 24
    ? tk("adapters-ai-provider-keys-functions.schema-ok.message.cf6f4a308b35")
    : null;
}

/**
 * Tekstleverandører (T1): leverandørens egen modelliste hentes når nøkkelen godtas, og lagres på nøkkelraden
 * (migrasjon 0038). Feiler hentingen, beholdes den gamle listen. Før 0038 hoppes dette over.
 */
async function storeTextModels(
  db: AnyClient,
  rowId: string,
  provider: string,
  key: string,
): Promise<void> {
  if (!isTextProviderId(provider)) return;
  const s = await checkSchema(db);
  if (s.kind === "missing" || s.version < 38) return;
  try {
    const { TEXT_ADAPTERS } = await import("./providers.server");
    const models = await TEXT_ADAPTERS[provider].listTextModels(key);
    await db
      .from("ai_provider_keys")
      .update({ text_models: models, text_models_at: new Date().toISOString() } as never)
      .eq("id", rowId);
  } catch {
    /* listen beholdes; nøkkelen er lagret uansett */
  }
}

/** Hvor mange ganger i timen en bruker kan lagre eller prøve nøkler (mot misbruk). */
const KEY_OPS_PER_HOUR = 30;
const recent = new Map<string, number[]>();
function throttled(userId: string): boolean {
  const now = Date.now();
  const list = (recent.get(userId) ?? []).filter((t) => now - t < 3600_000);
  list.push(now);
  recent.set(userId, list);
  return list.length > KEY_OPS_PER_HOUR;
}

export const saveProviderKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => {
    const x = (d ?? {}) as Record<string, unknown>;
    if (!isKeyed(x["provider"])) throw new Error(tk("adapters-ai-provider-keys-functions.save-provider-key.create-server-fn-method-post-middleware-require-supabase-auth-validator.dff2aecbcf39"));
    if (typeof x["key"] !== "string" || x["key"].length > 512)
      throw new Error(tk("adapters-ai-provider-keys-functions.save-provider-key.create-server-fn-method-post-middleware-require-supabase-auth-validator.992141553490"));
    const label = typeof x["label"] === "string" ? x["label"].trim().slice(0, 80) : "";
    return { provider: x["provider"], key: x["key"].trim(), label };
  })
  .handler(async ({ data, context }): Promise<KeyResult> => {
    const fmt = checkKeyFormat(data.provider, data.key);
    if (fmt.error) return { ok: false, message: fmt.error };
    if (throttled(context.userId))
      return {
        ok: false,
        message: tk("adapters-ai-provider-keys-functions.message.message.359542d5bb9b"),
      };
    const db = await admin();
    const bad = await schemaOk(db);
    if (bad) return { ok: false, message: bad };
    const { testProviderKey } = await import("./providers.server");
    const test = await testProviderKey(data.provider, data.key);
    if (test.result === "rejected")
      return {
        ok: false,
        message: `${test.message} ${tk("adapters-ai-provider-keys-functions.message.message.ee574a702c4e")}`,
      };
    const { encryptKey } = await import("./key-vault.server");
    const { data: existing } = await db
      .from("ai_provider_keys")
      .select("id")
      .eq("user_id", context.userId)
      .eq("provider", data.provider)
      .maybeSingle();
    const id = (existing as { id?: string } | null)?.id ?? newId();
    const sealed = await encryptKey(data.key, {
      userId: context.userId,
      provider: data.provider,
      rowId: id,
    });
    const status = test.result === "ok" || test.result === "limited" ? "ok" : "untested";
    const row = {
      id,
      user_id: context.userId,
      provider: data.provider,
      label: data.label,
      ciphertext: sealed.ciphertext,
      iv: sealed.iv,
      key_version: sealed.version,
      key_hint: keyHint(data.key),
      status,
      status_message: test.message,
      last_tested_at: test.result === "unknown" ? null : new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const { error } = existing
      ? await db
          .from("ai_provider_keys")
          .update(row as never)
          .eq("id", id)
      : await db.from("ai_provider_keys").insert(row as never);
    if (error)
      return {
        ok: false,
        message: tk("adapters-ai-provider-keys-functions.message.message.9b6c3ed1f5f7", { message: String(error.message) }),
      };
    if (test.result === "ok" || test.result === "limited")
      await storeTextModels(db, id, data.provider, data.key);
    return { ok: true, status, message: test.message };
  });

export const testSavedProviderKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => {
    const p = (d as Record<string, unknown> | null)?.["provider"];
    if (!isKeyed(p)) throw new Error(tk("adapters-ai-provider-keys-functions.test-saved-provider-key.create-server-fn-method-post-middleware-require-supabase-auth-validator.ce3935f8c63d"));
    return { provider: p };
  })
  .handler(async ({ data, context }): Promise<KeyResult> => {
    if (throttled(context.userId))
      return {
        ok: false,
        message: tk("adapters-ai-provider-keys-functions.message.message.359542d5bb9b.2"),
      };
    const db = await admin();
    const bad = await schemaOk(db);
    if (bad) return { ok: false, message: bad };
    const { data: row } = await db
      .from("ai_provider_keys")
      .select("id, ciphertext, iv, key_version")
      .eq("user_id", context.userId)
      .eq("provider", data.provider)
      .maybeSingle();
    if (!row)
      return {
        ok: false,
        message: tk("adapters-ai-provider-keys-functions.message.message.7559b11b5c62"),
      };
    const r = row as { id: string; ciphertext: string; iv: string; key_version: number };
    const { decryptKey } = await import("./key-vault.server");
    let key: string;
    try {
      key = await decryptKey(r, { userId: context.userId, provider: data.provider, rowId: r.id });
    } catch (e) {
      await db
        .from("ai_provider_keys")
        .update({ status: "failed", status_message: (e as Error).message.slice(0, 400) } as never)
        .eq("id", r.id);
      return { ok: false, message: (e as Error).message };
    }
    const { testProviderKey } = await import("./providers.server");
    const test = await testProviderKey(data.provider, key);
    const status =
      test.result === "rejected" ? "failed" : test.result === "unknown" ? "untested" : "ok";
    await db
      .from("ai_provider_keys")
      .update({
        status,
        status_message: test.message,
        last_tested_at: new Date().toISOString(),
      } as never)
      .eq("id", r.id);
    if (status === "ok") await storeTextModels(db, r.id, data.provider, key);
    return status === "failed"
      ? {
          ok: false,
          message:
            test.message ??
            tk("adapters-ai-provider-keys-functions.message.message.94cfab19e590"),
        }
      : { ok: true, status, message: test.message };
  });

export const removeProviderKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => {
    const p = (d as Record<string, unknown> | null)?.["provider"];
    if (!isKeyed(p)) throw new Error(tk("adapters-ai-provider-keys-functions.remove-provider-key.create-server-fn-method-post-middleware-require-supabase-auth-validator.2eba611988e2"));
    return { provider: p };
  })
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string | null }> => {
    const db = await admin();
    const bad = await schemaOk(db);
    if (bad) return { ok: false, message: bad };
    // Raden slettes (ingen kopi av hemmeligheten blir liggende); jobbene beholder loggen uten nøkkel
    const { error } = await db
      .from("ai_provider_keys")
      .delete()
      .eq("user_id", context.userId)
      .eq("provider", data.provider);
    return error ? { ok: false, message: error.message } : { ok: true, message: null };
  });

export const setAccountCap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => {
    const c = (d as Record<string, unknown> | null)?.["capUsd"];
    if (
      c !== null &&
      (typeof c !== "number" || !Number.isFinite(c) || c < 0 || c > MAX_ACCOUNT_CAP_USD)
    )
      throw new Error(tk("adapters-ai-provider-keys-functions.set-account-cap.create-server-fn-method-post-middleware-require-supabase-auth-validator.196b744b677e"));
    return { capUsd: c === null ? null : Math.round((c as number) * 100) / 100 };
  })
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string | null }> => {
    const db = await admin();
    const bad = await schemaOk(db);
    if (bad) return { ok: false, message: bad };
    const { error } = await db.from("ai_account_limits").upsert(
      {
        user_id: context.userId,
        monthly_cap_usd: data.capUsd,
        updated_at: new Date().toISOString(),
      } as never,
      { onConflict: "user_id" } as never,
    );
    return error ? { ok: false, message: error.message } : { ok: true, message: null };
  });

/**
 * Leverandørene et prosjekt kan bruke (DEC-0069): den innebygde, og de prosjektets eiere har koblet til.
 * Bare leverandør-ID-ene – aldri nøkler eller hvem som eier dem.
 */
export const projectAiProviders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => {
    const p = (d as Record<string, unknown> | null)?.["projectId"];
    if (typeof p !== "string" || !/^[0-9a-f-]{36}$/i.test(p))
      throw new Error(tk("adapters-ai-provider-keys-functions.project-ai-providers.create-server-fn-method-post-middleware-require-supabase-auth-validator.131b75d842d4"));
    return { projectId: p };
  })
  .handler(async ({ data, context }): Promise<{ providers: string[]; missing: boolean }> => {
    const { memberRole, projectProviderIds } = await import("./ai-gate.server");
    const role = await memberRole(
      context.supabase as unknown as AnyClient,
      data.projectId,
      context.userId,
    );
    if (!role) return { providers: ["lovable"], missing: false };
    const db = await admin();
    if (await schemaOk(db)) return { providers: ["lovable"], missing: true };
    return {
      providers: ["lovable", ...(await projectProviderIds(db, data.projectId, context.userId))],
      missing: false,
    };
  });

/** En tekstleverandør med gyldig nøkkel og modellene (uten nøkkelen). */
export interface TextProviderChoice {
  readonly provider: TextProviderId;
  readonly models: readonly string[];
  readonly fetchedAt: string | null;
}

/**
 * Brukerens egne tekstleverandører (T1) for «Tekst-AI» i dialogen: leverandør, hentede modeller og når de
 * ble hentet. Aldri nøkler. Før migrasjon 0038 er modellistene tomme (katalogens modeller brukes da).
 */
export const listTextChoices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ providers: TextProviderChoice[]; missing: boolean }> => {
    const db = await admin();
    const s = await checkSchema(db);
    if (s.kind === "missing" || s.version < 24) return { providers: [], missing: true };
    const withModels = s.version >= 38;
    const { data, error } = await db
      .from("ai_provider_keys")
      .select(withModels ? "provider, status, text_models, text_models_at" : "provider, status")
      .eq("user_id", context.userId)
      .neq("status", "failed");
    if (error) return { providers: [], missing: false };
    const rows = (data ?? []) as unknown as {
      provider: string;
      text_models?: unknown;
      text_models_at?: string | null;
    }[];
    return {
      providers: rows
        .filter((r) => isTextProviderId(r.provider))
        .map((r) => ({
          provider: r.provider as TextProviderId,
          models: Array.isArray(r.text_models)
            ? r.text_models.filter((m): m is string => typeof m === "string")
            : [],
          fetchedAt: r.text_models_at ?? null,
        })),
      missing: false,
    };
  });
