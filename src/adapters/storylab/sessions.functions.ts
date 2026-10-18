/**
 * Story Lab (SL1): arbeidslogg for samtaler, intervju og analyser (story_sessions) og forslag fra dem
 * (story_suggestions). Dette er brukerens eget arbeidsmateriale: turene lagres i klartekst, men aldri
 * systemprompten (den bygges på nytt fra konteksten). Skrives med service role etter rollekontroll
 * (redaktør eller eier). AI kalles ikke her – klienten bruker generateText (T1).
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { L, isUuid, newId } from "@/core";
import { checkSchema, type AnyClient } from "@/adapters/storage/project-rows";

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
    throw new Error(L("Ugyldig prosjekt", "Invalid project"));
  return p;
}
function idOf(x: Record<string, unknown>, k: string): string {
  const v = x[k];
  if (typeof v !== "string" || !isUuid(v)) throw new Error(L("Ugyldig ID", "Invalid ID"));
  return v;
}
const obj = (d: unknown): Record<string, unknown> => {
  if (!d || typeof d !== "object") throw new Error(L("Ugyldig forespørsel", "Invalid request"));
  return d as Record<string, unknown>;
};

/** Kontroll av turer (eksportert for testene). */
export function turnsError(turns: unknown): string | null {
  if (!Array.isArray(turns) || turns.length > MAX_APPEND_TURNS)
    return L("Ugyldige turer", "Invalid turns");
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
      return L("Ugyldige turer", "Invalid turns");
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
      L(
        "Du har ikke tilgang til Story Lab i dette prosjektet.",
        "You do not have access to Story Lab in this project.",
      ),
    );
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as unknown as AnyClient;
  const s = await checkSchema(admin);
  if (s.kind === "missing" || s.version < 39)
    return fail(
      L(
        "Databasen mangler Story Lab. Den må oppdateres (migrasjon 0039).",
        "The database is missing Story Lab. It must be updated (migration 0039).",
      ),
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
      throw new Error(L("Ukjent type økt", "Unknown kind of session"));
    const title = typeof x["title"] === "string" ? x["title"].trim().slice(0, 200) : "";
    const context = x["context"] ?? {};
    if (!context || typeof context !== "object" || Array.isArray(context))
      throw new Error(L("Ugyldig kontekst", "Invalid context"));
    if (bytes(context) > MAX_SESSION_CONTEXT_BYTES)
      throw new Error(L("Konteksten er for stor", "The context is too large"));
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
        L(
          `Økten kunne ikke lagres: ${error.message}`,
          `The session could not be saved: ${error.message}`,
        ),
      );
    const s = await loadSession(g.admin, data.projectId, id);
    return s ? { ok: true, session: s } : fail(L("Økten finnes ikke", "The session was not found"));
  });

export const appendStoryTurns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => {
    const x = obj(d);
    const e = turnsError(x["turns"]);
    if (e) throw new Error(e);
    const cost = x["addCostUsd"] ?? 0;
    if (typeof cost !== "number" || !Number.isFinite(cost) || cost < 0 || cost > 1000)
      throw new Error(L("Ugyldig kostnad", "Invalid cost"));
    const status = x["status"];
    if (status !== undefined && !oneOf(STORY_SESSION_STATUSES, status))
      throw new Error(L("Ugyldig status", "Invalid status"));
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
      if (!s) return fail(L("Økten finnes ikke", "The session was not found"));
      if (s.status === "archived") return fail(L("Økten er arkivert", "The session is archived"));
      const known = new Set(s.turns.map((t) => t.id));
      const turns = [...s.turns, ...data.turns.filter((t) => !known.has(t.id))];
      if (bytes(turns) > MAX_SESSION_TURNS_BYTES)
        return fail(
          L(
            "Økten er full. Lag en ny økt (forgren fra en tur) for å fortsette.",
            "The session is full. Create a new session (branch from a turn) to continue.",
          ),
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
          L(
            `Turene kunne ikke lagres: ${error.message}`,
            `The turns could not be saved: ${error.message}`,
          ),
        );
      if (!upd || !(upd as unknown[]).length)
        return fail(
          L(
            "Økten ble endret samtidig. Last den inn på nytt.",
            "The session was changed at the same time. Reload it.",
          ),
        );
      return { ok: true, turns: turns.length, costUsd };
    },
  );

export const forkStorySession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => {
    const x = obj(d);
    const t = x["fromTurn"];
    if (!Number.isInteger(t) || (t as number) < -1)
      throw new Error(L("Ugyldig tur", "Invalid turn"));
    return { projectId: projectIdOf(x), sessionId: idOf(x, "sessionId"), fromTurn: t as number,
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
    if (!s) return fail(L("Økten finnes ikke", "The session was not found"));
    if (data.fromTurn >= s.turns.length) return fail(L("Ugyldig tur", "Invalid turn"));
    const id = newId<"story_session">();
    const { error } = await g.admin.from("story_sessions").insert({
      id,
      project_id: data.projectId,
      kind: s.kind,
      title: data.title ?? s.title,
      context: s.context,
      turns: s.turns.slice(0, data.fromTurn + 1),
      parent_session_id: s.id,
      from_turn: data.fromTurn,
      status: "paused",
      created_by: context.userId,
    } as never);
    if (error)
      return fail(
        L(
          `Økten kunne ikke lagres: ${error.message}`,
          `The session could not be saved: ${error.message}`,
        ),
      );
    const n = await loadSession(g.admin, data.projectId, id);
    return n ? { ok: true, session: n } : fail(L("Økten finnes ikke", "The session was not found"));
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
    return s ? { ok: true, session: s } : fail(L("Økten finnes ikke", "The session was not found"));
  });

export const saveStorySuggestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => {
    const x = obj(d);
    if (!oneOf(STORY_SUGGESTION_KINDS, x["kind"]))
      throw new Error(L("Ukjent type forslag", "Unknown kind of suggestion"));
    const payload = x["payload"];
    if (!payload || typeof payload !== "object" || Array.isArray(payload))
      throw new Error(L("Ugyldig forslag", "Invalid suggestion"));
    if (bytes(payload) > 60_000)
      throw new Error(L("Forslaget er for stort", "The suggestion is too large"));
    const turnId = x["turnId"];
    if (
      turnId !== undefined &&
      turnId !== null &&
      (typeof turnId !== "string" || turnId.length > 100)
    )
      throw new Error(L("Ugyldig tur", "Invalid turn"));
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
      return fail(L("Økten finnes ikke", "The session was not found"));
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
          L(
            `Forslaget kunne ikke lagres: ${error.message}`,
            `The suggestion could not be saved: ${error.message}`,
          ),
        )
      : { ok: true, id };
  });

export const setSuggestionStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => {
    const x = obj(d);
    if (!oneOf(["open", "applied", "discarded"] as const, x["status"]))
      throw new Error(L("Ugyldig status", "Invalid status"));
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
      : fail(L("Forslaget finnes ikke", "The suggestion was not found"));
  });
