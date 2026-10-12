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
import { checkKeyFormat, isProviderId, keyHint, newId, MAX_ACCOUNT_CAP_USD } from "@/core";
import { checkSchema, type AnyClient } from "@/adapters/storage/project-rows";

type Keyed = "openai" | "google" | "fal" | "runway" | "elevenlabs";

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
    ? "Databasen er ikke oppdatert for egne AI-leverandører. Lim inn meldingen i LOVABLE_SYNC.md i Lovable (migrasjon 0024)."
    : null;
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
    if (!isKeyed(x["provider"])) throw new Error("Ukjent leverandør");
    if (typeof x["key"] !== "string" || x["key"].length > 512) throw new Error("Ugyldig nøkkel");
    const label = typeof x["label"] === "string" ? x["label"].trim().slice(0, 80) : "";
    return { provider: x["provider"], key: x["key"].trim(), label };
  })
  .handler(async ({ data, context }): Promise<KeyResult> => {
    const fmt = checkKeyFormat(data.provider, data.key);
    if (fmt.error) return { ok: false, message: fmt.error };
    if (throttled(context.userId))
      return { ok: false, message: "For mange forsøk. Vent litt og prøv igjen." };
    const db = await admin();
    const bad = await schemaOk(db);
    if (bad) return { ok: false, message: bad };
    const { testProviderKey } = await import("./providers.server");
    const test = await testProviderKey(data.provider, data.key);
    if (test.result === "rejected")
      return {
        ok: false,
        message: `${test.message} Sjekk at du kopierte hele nøkkelen, og at den ikke er slettet hos leverandøren.`,
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
    if (error) return { ok: false, message: `Nøkkelen kunne ikke lagres: ${error.message}` };
    return { ok: true, status, message: test.message };
  });

export const testSavedProviderKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => {
    const p = (d as Record<string, unknown> | null)?.["provider"];
    if (!isKeyed(p)) throw new Error("Ukjent leverandør");
    return { provider: p };
  })
  .handler(async ({ data, context }): Promise<KeyResult> => {
    if (throttled(context.userId))
      return { ok: false, message: "For mange forsøk. Vent litt og prøv igjen." };
    const db = await admin();
    const bad = await schemaOk(db);
    if (bad) return { ok: false, message: bad };
    const { data: row } = await db
      .from("ai_provider_keys")
      .select("id, ciphertext, iv, key_version")
      .eq("user_id", context.userId)
      .eq("provider", data.provider)
      .maybeSingle();
    if (!row) return { ok: false, message: "Ingen nøkkel er lagt inn for denne leverandøren." };
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
    return status === "failed"
      ? { ok: false, message: test.message ?? "Tjenesten godtok ikke nøkkelen." }
      : { ok: true, status, message: test.message };
  });

export const removeProviderKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => {
    const p = (d as Record<string, unknown> | null)?.["provider"];
    if (!isKeyed(p)) throw new Error("Ukjent leverandør");
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
      throw new Error("Ugyldig tak");
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
    if (typeof p !== "string" || !/^[0-9a-f-]{36}$/i.test(p)) throw new Error("Ugyldig prosjekt");
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
