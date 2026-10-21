/**
 * Story Lab (SL1): arbeidslogg for samtaler, intervju og analyser (story_sessions) og forslag fra dem
 * (story_suggestions). Dette er brukerens eget arbeidsmateriale: turene lagres i klartekst, men aldri
 * systemprompten (den bygges på nytt fra konteksten). Skrives med service role etter rollekontroll
 * (redaktør eller eier). AI kalles ikke her – klienten bruker generateText (T1).
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isUuid, newId } from "@/core";
import { checkSchema, type AnyClient } from "@/adapters/storage/project-rows";
import { t as tk } from "@/core/i18n/keyed";

export const STORY_SESSION_KINDS = [
  "interview",
  "character",
  "group",
  "scene_analysis",
  "scene_improv",
] as const;
export type StorySessionKind = (typeof STORY_SESSION_KINDS)[number];
export const STORY_SESSION_STATUSES = ["active", "paused", "stopped", "archived"] as const;
export type StorySessionStatus = (typeof STORY_SESSION_STATUSES)[number];
export const STORY_SUGGESTION_KINDS = [
  "line",
  "motivation",
  "plot_point",
  "scene_draft",
  "profile_change",
  "analysis",
] as const;
export type StorySuggestionKind = (typeof STORY_SUGGESTION_KINDS)[number];

export interface StorySuggestion {
  readonly id: string;
  readonly sessionId: string | null;
  readonly turnId: string | null;
  readonly kind: StorySuggestionKind;
  readonly payload: { [k: string]: JsonValue };
  readonly status: "open" | "applied" | "discarded";
  readonly createdAt: string;
  readonly createdBy: string;
}

export const listStorySuggestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => {
    const x = obj(d);
    const status = x["status"], kind = x["kind"];
    if (status !== undefined && !oneOf(["open", "applied", "discarded"] as const, status))
      throw new Error(tk("adapters-storylab-sessions-functions.list-story-suggestions.create-server-fn-method-post-middleware-require-supabase-auth-input-validator.0f7084a4922f"));
    if (kind !== undefined && !oneOf(STORY_SUGGESTION_KINDS, kind))
      throw new Error(tk("adapters-storylab-sessions-functions.list-story-suggestions.create-server-fn-method-post-middleware-require-supabase-auth-input-validator.984da1592680"));
    return { projectId: projectIdOf(x),
      ...(status !== undefined ? { status: status as StorySuggestion["status"] } : {}),
      ...(kind !== undefined ? { kind: kind as StorySuggestionKind } : {}),
      ...(x["sessionId"] !== undefined ? { sessionId: idOf(x, "sessionId") } : {}) };
  })
  .handler(async ({ data, context }): Promise<{ ok: true; suggestions: StorySuggestion[] } | Fail> => {
    const g = await gate(context.supabase as unknown as AnyClient, data.projectId, context.userId, "editor");
    if ("ok" in g) return g;
    let query = g.admin.from("story_suggestions")
      .select("id, session_id, turn_id, kind, payload, status, created_at, created_by")
      .eq("project_id", data.projectId);
    if (data.status) query = query.eq("status", data.status);
    if (data.kind) query = query.eq("kind", data.kind);
    if (data.sessionId) query = query.eq("session_id", data.sessionId);
    const { data: rows, error } = await query.order("created_at", { ascending: false }).limit(500);
    if (error) return fail(tk("adapters-storylab-sessions-functions.list-story-suggestions.fail.b223ebe86741"));
    return { ok: true, suggestions: ((rows ?? []) as Record<string, unknown>[]).map((r) => ({
      id: String(r["id"]), sessionId: r["session_id"] as string | null, turnId: r["turn_id"] as string | null,
      kind: r["kind"] as StorySuggestionKind, payload: r["payload"] as StorySuggestion["payload"],
      status: r["status"] as StorySuggestion["status"], createdAt: String(r["created_at"]), createdBy: String(r["created_by"]),
    })) };
  });

/** Grensene (litt under databasens, så brukeren får en forståelig melding). */
export const MAX_SESSION_TURNS_BYTES = 2_000_000;
export const MAX_SESSION_CONTEXT_BYTES = 250_000;
export const MAX_APPEND_TURNS = 50;
const MAX_TURN_TEXT = 8000;

/** JSON som kan sendes mellom server og nettleser. */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };

export interface StoredTurn {
  readonly id: string;
  readonly speaker: string;
  readonly text: string;
  readonly kind: "line" | "question" | "direction" | "analysis";
  readonly at: string;
  readonly to?: string | null;
}

export interface StorySessionSummary {
  readonly id: string;
  readonly kind: StorySessionKind;
  readonly title: string;
  readonly status: StorySessionStatus;
  readonly parentSessionId: string | null;
  readonly fromTurn: number | null;
  readonly costUsd: number;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}
export interface StorySession extends StorySessionSummary {
  readonly context: { [k: string]: JsonValue };
  readonly turns: StoredTurn[];
}

type Fail = { readonly ok: false; readonly message: string };
const fail = (message: string): Fail => ({ ok: false, message });

const bytes = (v: unknown) => new TextEncoder().encode(JSON.stringify(v)).length;
const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T =>
  typeof v === "string" && (list as readonly string[]).includes(v);

function projectIdOf(x: Record<string, unknown>): string {
  const p = x["projectId"];
  if (typeof p !== "string" || !isUuid(p))
    throw new Error(tk("adapters-storylab-sessions-functions.project-id-of.message.de93966f2a75"));
  return p;
}
function idOf(x: Record<string, unknown>, k: string): string {
  const v = x[k];
  if (typeof v !== "string" || !isUuid(v)) throw new Error(tk("adapters-storylab-sessions-functions.id-of.message.01d65cac801c"));
  return v;
}
const obj = (d: unknown): Record<string, unknown> => {
  if (!d || typeof d !== "object") throw new Error(tk("adapters-storylab-sessions-functions.obj.message.2d0cf835cadd"));
  return d as Record<string, unknown>;
};

/** Kontroll av turer (eksportert for testene). */
export function turnsError(turns: unknown): string | null {
  if (!Array.isArray(turns) || turns.length > MAX_APPEND_TURNS)
    return tk("adapters-storylab-sessions-functions.turns-error.message.9398c4f56ee9");
  for (const t of turns as Record<string, unknown>[]) {
    if (
      !t ||
      typeof t["id"] !== "string" ||
      t["id"].length > 100 ||
      typeof t["speaker"] !== "string" ||
      t["speaker"].length > 100 ||
      typeof t["text"] !== "string" ||
      t["text"].length > MAX_TURN_TEXT ||
      !oneOf(["line", "question", "direction", "analysis"] as const, t["kind"]) ||
      typeof t["at"] !== "string" ||
      t["at"].length > 40
    )
      return tk("adapters-storylab-sessions-functions.turns-error.message.9398c4f56ee9.2");
  }
  return null;
}

const cleanTurns = (turns: readonly Record<string, unknown>[]): StoredTurn[] =>
  turns.map((t) => ({
    id: String(t["id"]),
    speaker: String(t["speaker"]),
    text: String(t["text"]),
    kind: t["kind"] as StoredTurn["kind"],
    at: String(t["at"]),
    ...(typeof t["to"] === "string" || t["to"] === null ? { to: t["to"] as string | null } : {}),
  }));

/** Rolle og database: gir admin-klienten eller en melding. */
async function gate(
  userDb: AnyClient,
  projectId: string,
  userId: string,
  minRole: "viewer" | "editor",
): Promise<{ admin: AnyClient } | Fail> {
  const { memberRole, ROLE_RANK } = await import("@/adapters/ai/ai-gate.server");
  const role = await memberRole(userDb, projectId, userId);
  if ((ROLE_RANK[role ?? ""] ?? 0) < ROLE_RANK[minRole]!)
    return fail(
      tk("adapters-storylab-sessions-functions.gate.fail.649c18dd16a8"),
    );
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as unknown as AnyClient;
  const s = await checkSchema(admin);
  if (s.kind === "missing" || s.version < 39)
    return fail(
      tk("adapters-storylab-sessions-functions.gate.fail.cc0601aff526"),
    );
  return { admin };
}

function summaryOf(r: Record<string, unknown>): StorySessionSummary {
  return {
    id: String(r["id"]),
    kind: r["kind"] as StorySessionKind,
    title: String(r["title"] ?? ""),
    status: r["status"] as StorySessionStatus,
    parentSessionId: (r["parent_session_id"] as string | null) ?? null,
    fromTurn:
      r["from_turn"] === null || r["from_turn"] === undefined ? null : Number(r["from_turn"]),
    costUsd: Number(r["cost_usd"] ?? 0),
    createdBy: String(r["created_by"]),
    createdAt: String(r["created_at"]),
    updatedAt: String(r["updated_at"]),
  };
}
const SUMMARY_COLUMNS =
  "id, kind, title, status, parent_session_id, from_turn, cost_usd, created_by, created_at, updated_at";

async function loadSession(
  admin: AnyClient,
  projectId: string,
  id: string,
): Promise<StorySession | null> {
  const { data } = await admin
    .from("story_sessions")
    .select(`${SUMMARY_COLUMNS}, context, turns`)
    .eq("project_id", projectId)
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const r = data as Record<string, unknown>;
  return {
    ...summaryOf(r),
    context: (r["context"] as { [k: string]: JsonValue }) ?? {},
    turns: (r["turns"] as StoredTurn[]) ?? [],
  };
}

export const createStorySession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => {
    const x = obj(d);
    if (!oneOf(STORY_SESSION_KINDS, x["kind"]))
      throw new Error(tk("adapters-storylab-sessions-functions.create-story-session.create-server-fn-method-post-middleware-require-supabase-auth-validator.6c2a10ded8f0"));
    const title = typeof x["title"] === "string" ? x["title"].trim().slice(0, 200) : "";
    const context = x["context"] ?? {};
    if (!context || typeof context !== "object" || Array.isArray(context))
      throw new Error(tk("adapters-storylab-sessions-functions.create-story-session.create-server-fn-method-post-middleware-require-supabase-auth-validator.9dc2f199fd73"));
    if (bytes(context) > MAX_SESSION_CONTEXT_BYTES)
      throw new Error(tk("adapters-storylab-sessions-functions.create-story-session.create-server-fn-method-post-middleware-require-supabase-auth-validator.2a6859befa58"));
    return {
      projectId: projectIdOf(x),
      kind: x["kind"],
      title,
      context: context as Record<string, unknown>,
    };
  })
  .handler(async ({ data, context }): Promise<{ ok: true; session: StorySession } | Fail> => {
    const g = await gate(
      context.supabase as unknown as AnyClient,
      data.projectId,
      context.userId,
      "editor",
    );
    if ("ok" in g) return g;
    const id = newId<"story_session">();
    const { error } = await g.admin.from("story_sessions").insert({
      id,
      project_id: data.projectId,
      kind: data.kind,
      title: data.title,
      context: data.context,
      turns: [],
      status: "active",
      created_by: context.userId,
    } as never);
    if (error)
      return fail(
        tk("adapters-storylab-sessions-functions.create-story-session.fail.0f113d4c39e6", { message: String(error.message) }),
      );
    const s = await loadSession(g.admin, data.projectId, id);
    return s ? { ok: true, session: s } : fail(tk("adapters-storylab-sessions-functions.create-story-session.fail.051cfc3dcf13"));
  });

export const appendStoryTurns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => {
    const x = obj(d);
    const e = turnsError(x["turns"]);
    if (e) throw new Error(e);
    const cost = x["addCostUsd"] ?? 0;
    if (typeof cost !== "number" || !Number.isFinite(cost) || cost < 0 || cost > 1000)
      throw new Error(tk("adapters-storylab-sessions-functions.append-story-turns.create-server-fn-method-post-middleware-require-supabase-auth-validator.5418eefbb941"));
    const status = x["status"];
    if (status !== undefined && !oneOf(STORY_SESSION_STATUSES, status))
      throw new Error(tk("adapters-storylab-sessions-functions.append-story-turns.create-server-fn-method-post-middleware-require-supabase-auth-validator.153ddc87b33c"));
    return {
      projectId: projectIdOf(x),
      sessionId: idOf(x, "sessionId"),
      turns: cleanTurns(x["turns"] as Record<string, unknown>[]),
      addCostUsd: cost,
      ...(status !== undefined ? { status: status as StorySessionStatus } : {}),
    };
  })
  .handler(
    async ({ data, context }): Promise<{ ok: true; turns: number; costUsd: number } | Fail> => {
      const g = await gate(
        context.supabase as unknown as AnyClient,
        data.projectId,
        context.userId,
        "editor",
      );
      if ("ok" in g) return g;
      const s = await loadSession(g.admin, data.projectId, data.sessionId);
      if (!s) return fail(tk("adapters-storylab-sessions-functions.append-story-turns.fail.bda2c0f7725c"));
      if (s.status === "archived") return fail(tk("adapters-storylab-sessions-functions.append-story-turns.fail.50b458ba5298"));
      const known = new Set(s.turns.map((t) => t.id));
      const turns = [...s.turns, ...data.turns.filter((t) => !known.has(t.id))];
      if (bytes(turns) > MAX_SESSION_TURNS_BYTES)
        return fail(
          tk("adapters-storylab-sessions-functions.append-story-turns.fail.16237d7b1faa"),
        );
      const costUsd = Math.round((s.costUsd + data.addCostUsd) * 1e6) / 1e6;
      // Revisjonskontroll på updated_at: samtidige skrivinger overskriver ikke hverandre
      const { data: upd, error } = await g.admin
        .from("story_sessions")
        .update({
          turns,
          cost_usd: costUsd,
          ...(data.status ? { status: data.status } : {}),
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id", s.id)
        .eq("updated_at", s.updatedAt)
        .select("id");
      if (error)
        return fail(
          tk("adapters-storylab-sessions-functions.append-story-turns.fail.bf71948de891", { message: String(error.message) }),
        );
      if (!upd || !(upd as unknown[]).length)
        return fail(
          tk("adapters-storylab-sessions-functions.append-story-turns.fail.cacb5b7f2a4f"),
        );
      return { ok: true, turns: turns.length, costUsd };
    },
  );

export const forkStorySession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => {
    const x = obj(d);
    // REQ-0037: forgreiningspunktet er turens ID (null = fra start). Eldre klienter sender plassen (`fromTurn`);
    // den oversettes til turens ID i den lagrede økten før kopien lages.
    const id = x["fromTurnId"];
    const t = x["fromTurn"];
    const hasId = id === null || (typeof id === "string" && id.length > 0 && id.length <= 200);
    if (!hasId && (!Number.isInteger(t) || (t as number) < -1))
      throw new Error(tk("adapters-storylab-sessions-functions.fork-story-session.create-server-fn-method-post-middleware-require-supabase-auth-validator.2e9a297eec70"));
    return { projectId: projectIdOf(x), sessionId: idOf(x, "sessionId"),
      ...(hasId ? { fromTurnId: id as string | null } : { fromTurn: t as number }),
      ...(typeof x["title"] === "string" ? { title: x["title"].trim().slice(0, 200) } : {}) };
  })
  .handler(async ({ data, context }): Promise<{ ok: true; session: StorySession } | Fail> => {
    const g = await gate(
      context.supabase as unknown as AnyClient,
      data.projectId,
      context.userId,
      "editor",
    );
    if ("ok" in g) return g;
    const s = await loadSession(g.admin, data.projectId, data.sessionId);
    if (!s) return fail(tk("adapters-storylab-sessions-functions.fork-story-session.fail.1a24d9b9ef7c"));
    const at =
      "fromTurnId" in data
        ? data.fromTurnId === null ? -1 : s.turns.findIndex((t) => t.id === data.fromTurnId)
        : data.fromTurn;
    if (at < -1 || at >= s.turns.length) return fail(tk("adapters-storylab-sessions-functions.fork-story-session.fail.2e9a297eec70"));
    const id = newId<"story_session">();
    const { error } = await g.admin.from("story_sessions").insert({
      id,
      project_id: data.projectId,
      kind: s.kind,
      title: data.title ?? s.title,
      context: s.context,
      turns: s.turns.slice(0, at + 1),
      parent_session_id: s.id,
      // Antallet beholdte turer (visning); identiteten er den siste kopierte turen (samme ID i begge øktene)
      from_turn: at,
      status: "paused",
      created_by: context.userId,
    } as never);
    if (error)
      return fail(
        tk("adapters-storylab-sessions-functions.fork-story-session.fail.a8d419af9760", { message: String(error.message) }),
      );
    const n = await loadSession(g.admin, data.projectId, id);
    return n ? { ok: true, session: n } : fail(tk("adapters-storylab-sessions-functions.fork-story-session.fail.1a24d9b9ef7c.2"));
  });

export const listStorySessions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => ({ projectId: projectIdOf(obj(d)) }))
  .handler(
    async ({ data, context }): Promise<{ ok: true; sessions: StorySessionSummary[] } | Fail> => {
      const g = await gate(
        context.supabase as unknown as AnyClient,
        data.projectId,
        context.userId,
        "editor",
      );
      if ("ok" in g) return g;
      const { data: rows, error } = await g.admin
        .from("story_sessions")
        .select(SUMMARY_COLUMNS)
        .eq("project_id", data.projectId)
        .order("updated_at", { ascending: false })
        .limit(500);
      if (error) return fail(error.message);
      return { ok: true, sessions: ((rows ?? []) as Record<string, unknown>[]).map(summaryOf) };
    },
  );

export const getStorySession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => {
    const x = obj(d);
    return { projectId: projectIdOf(x), sessionId: idOf(x, "sessionId") };
  })
  .handler(async ({ data, context }): Promise<{ ok: true; session: StorySession } | Fail> => {
    const g = await gate(
      context.supabase as unknown as AnyClient,
      data.projectId,
      context.userId,
      "editor",
    );
    if ("ok" in g) return g;
    const s = await loadSession(g.admin, data.projectId, data.sessionId);
    return s ? { ok: true, session: s } : fail(tk("adapters-storylab-sessions-functions.get-story-session.fail.d0bb4ba3429c"));
  });

export const saveStorySuggestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => {
    const x = obj(d);
    if (!oneOf(STORY_SUGGESTION_KINDS, x["kind"]))
      throw new Error(tk("adapters-storylab-sessions-functions.save-story-suggestion.create-server-fn-method-post-middleware-require-supabase-auth-validator.3ffb9fa1bcfb"));
    const payload = x["payload"];
    if (!payload || typeof payload !== "object" || Array.isArray(payload))
      throw new Error(tk("adapters-storylab-sessions-functions.save-story-suggestion.create-server-fn-method-post-middleware-require-supabase-auth-validator.741dfd84a76d"));
    if (bytes(payload) > 60_000)
      throw new Error(tk("adapters-storylab-sessions-functions.save-story-suggestion.create-server-fn-method-post-middleware-require-supabase-auth-validator.9467b14a104e"));
    const turnId = x["turnId"];
    if (
      turnId !== undefined &&
      turnId !== null &&
      (typeof turnId !== "string" || turnId.length > 100)
    )
      throw new Error(tk("adapters-storylab-sessions-functions.save-story-suggestion.create-server-fn-method-post-middleware-require-supabase-auth-validator.b91db806aba0"));
    return {
      projectId: projectIdOf(x),
      sessionId:
        x["sessionId"] === null || x["sessionId"] === undefined ? null : idOf(x, "sessionId"),
      turnId: (turnId as string | null | undefined) ?? null,
      kind: x["kind"],
      payload: payload as { [k: string]: JsonValue },
    };
  })
  .handler(async ({ data, context }): Promise<{ ok: true; id: string } | Fail> => {
    const g = await gate(
      context.supabase as unknown as AnyClient,
      data.projectId,
      context.userId,
      "editor",
    );
    if ("ok" in g) return g;
    if (data.sessionId && !(await loadSession(g.admin, data.projectId, data.sessionId)))
      return fail(tk("adapters-storylab-sessions-functions.save-story-suggestion.fail.e5bae59f5da0"));
    const id = newId<"story_suggestion">();
    const { error } = await g.admin.from("story_suggestions").insert({
      id,
      project_id: data.projectId,
      session_id: data.sessionId,
      turn_id: data.turnId,
      kind: data.kind,
      payload: data.payload,
      status: "open",
      created_by: context.userId,
    } as never);
    return error
      ? fail(
          tk("adapters-storylab-sessions-functions.save-story-suggestion.fail.de232cc45dbf", { message: String(error.message) }),
        )
      : { ok: true, id };
  });

export const setSuggestionStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => {
    const x = obj(d);
    if (!oneOf(["open", "applied", "discarded"] as const, x["status"]))
      throw new Error(tk("adapters-storylab-sessions-functions.set-suggestion-status.create-server-fn-method-post-middleware-require-supabase-auth-validator.dd0b8818378d"));
    return {
      projectId: projectIdOf(x),
      suggestionId: idOf(x, "suggestionId"),
      status: x["status"],
    };
  })
  .handler(async ({ data, context }): Promise<{ ok: true } | Fail> => {
    const g = await gate(
      context.supabase as unknown as AnyClient,
      data.projectId,
      context.userId,
      "editor",
    );
    if ("ok" in g) return g;
    const { data: upd, error } = await g.admin
      .from("story_suggestions")
      .update({ status: data.status } as never)
      .eq("id", data.suggestionId)
      .eq("project_id", data.projectId)
      .select("id");
    if (error) return fail(error.message);
    return upd && (upd as unknown[]).length
      ? { ok: true }
      : fail(tk("adapters-storylab-sessions-functions.set-suggestion-status.fail.9603fb08dc3e"));
  });
