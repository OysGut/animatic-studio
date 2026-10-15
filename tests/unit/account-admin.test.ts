/**
 * DEC-0086: administrator, blokkering, sletting med 30 dager, ny eier, personvern og AI-forbruk på serveren.
 * Falsk database (som verifiseringen i DEC-0075) og falsk innloggingstjeneste (auth.admin).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeWriteDb, type FakeDb } from "../helpers/verifisering3-db";

const h = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@tanstack/react-start", async () => {
  const { serverFnStub } = await import("../helpers/verifisering3-db");
  return { createServerFn: serverFnStub(), createMiddleware: () => ({ server: () => ({}) }) };
});
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/integrations/supabase/client.server", () => ({
  get supabaseAdmin() {
    return h.db;
  },
}));

type Fn = (a: { data?: unknown; context: unknown }) => Promise<Record<string, unknown>>;

const OYSTEIN = crypto.randomUUID();
const ALICE = crypto.randomUUID();
const BOB = crypto.randomUUID();
const CAROL = crypto.randomUUID();
const P = crypto.randomUUID();
const EMAIL: Record<string, string> = {
  [OYSTEIN]: "oystein@gutu.no",
  [ALICE]: "alice@example.no",
  [BOB]: "bob@example.no",
  [CAROL]: "carol@example.no",
};
const ctx = (u: string) => ({ userId: u, claims: { email: EMAIL[u] }, supabase: h.db });

let auth: { updateUserById: ReturnType<typeof vi.fn>; listUsers: ReturnType<typeof vi.fn> };

function setup(): FakeDb {
  const db = fakeWriteDb({
    account_status: [],
    app_admins: [],
    profiles: [
      { user_id: ALICE, display_name: "Alice" },
      { user_id: BOB, display_name: "Bob" },
    ],
    projects: [
      { id: P, name: "Jula på Dovre", created_at: "2026-01-01T00:00:00Z", deleted_at: null },
    ],
    project_members: [
      { project_id: P, user_id: ALICE, role: "owner", removed_at: null },
      { project_id: P, user_id: BOB, role: "editor", removed_at: null },
    ],
    generation_jobs: [
      job({ created_by: ALICE, cost_usd: 1.5, status: "done" }),
      job({ created_by: BOB, cost_usd: 2, status: "done" }),
      job({ created_by: BOB, cost_usd: 9, status: "failed" }),
      job({ created_by: BOB, cost_usd: 4, status: "queued" }),
    ],
    ai_provider_keys: [{ id: crypto.randomUUID(), user_id: BOB, provider: "fal" }],
    ai_account_limits: [{ user_id: BOB, monthly_cap_usd: 10 }],
    privacy_policy: [{ version: 1, controller_name: "" }],
  });
  auth = {
    updateUserById: vi.fn(async () => ({ error: null })),
    listUsers: vi.fn(async () => ({
      data: {
        users: Object.entries(EMAIL).map(([id, email]) => ({
          id,
          email,
          created_at: "2026-09-01T00:00:00Z",
          last_sign_in_at: null,
        })),
      },
      error: null,
    })),
  };
  (db as unknown as { auth: unknown }).auth = { admin: auth };
  h.db = db;
  return db;
}

function job(over: Record<string, unknown>) {
  return {
    id: crypto.randomUUID(),
    project_id: P,
    kind: "video",
    provider: "fal",
    model: "fal-ai/kling-video/o3/pro/video-to-video/edit",
    created_at: new Date().toISOString(),
    external_id: "req-1",
    occurrence_id: null,
    asset_id: null,
    params: { seconds: 5 },
    ...over,
  };
}

const admin = () => import("@/adapters/account/admin.functions");
const account = () => import("@/adapters/account/account.functions");
const status = (db: FakeDb, u: string) =>
  db.tables["account_status"]!.find((r) => r["user_id"] === u);

beforeEach(() => vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test"));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("REQ-0650 – adminsiden er bare for administrator; oystein@gutu.no er fast administrator", () => {
  it("REQ-0650: en vanlig bruker får ingen oversikt; den faste administratoren får alle brukerne", async () => {
    setup();
    const f = (await admin()).fetchAdminOverview as unknown as Fn;
    expect((await f({ context: ctx(ALICE) }))["ok"]).toBe(false);
    const o = (await f({ context: ctx(OYSTEIN) })) as {
      ok: boolean;
      users: {
        id: string;
        spendUsd: number;
        jobs: number;
        permanentAdmin: boolean;
        projects: unknown[];
      }[];
    };
    expect(o.ok).toBe(true);
    expect(o.users).toHaveLength(4);
    const bob = o.users.find((u) => u.id === BOB)!;
    // Feilede jobber og jobber i køen telles ikke
    expect(bob.spendUsd).toBe(2);
    expect(bob.jobs).toBe(1);
    expect(bob.projects).toEqual([{ id: P, name: "Jula på Dovre", role: "editor" }]);
    expect(o.users.find((u) => u.id === OYSTEIN)!.permanentAdmin).toBe(true);
  });

  it("REQ-0650: administrator kan gjøre andre til admin, men aldri endre den faste", async () => {
    const db = setup();
    const set = (await admin()).adminSetAdmin as unknown as Fn;
    expect((await set({ data: { userId: OYSTEIN, on: false }, context: ctx(OYSTEIN) }))["ok"]).toBe(
      false,
    );
    expect((await set({ data: { userId: CAROL, on: true }, context: ctx(ALICE) }))["ok"]).toBe(
      false,
    );
    expect((await set({ data: { userId: CAROL, on: true }, context: ctx(OYSTEIN) }))["ok"]).toBe(
      true,
    );
    expect(db.tables["app_admins"]!.map((r) => r["user_id"])).toEqual([CAROL]);
    // Carol er nå admin og kan selv bruke siden
    const f = (await admin()).fetchAdminOverview as unknown as Fn;
    expect((await f({ context: ctx(CAROL) }))["ok"]).toBe(true);
    expect((await set({ data: { userId: OYSTEIN, on: false }, context: ctx(CAROL) }))["ok"]).toBe(
      false,
    );
  });
});

describe("REQ-0651 – blokkering og sletting med 30 dager", () => {
  it("REQ-0651: blokkering sperrer innloggingen og kan oppheves; den faste administratoren og en selv kan ikke blokkeres", async () => {
    const db = setup();
    const act = (await admin()).adminSetUserStatus as unknown as Fn;
    expect(
      (await act({ data: { userId: OYSTEIN, action: "block" }, context: ctx(OYSTEIN) }))["ok"],
    ).toBe(false);
    await act({ data: { userId: CAROL, action: "block" }, context: ctx(OYSTEIN) });
    expect(status(db, CAROL)!["status"]).toBe("blocked");
    expect(auth.updateUserById).toHaveBeenLastCalledWith(CAROL, { ban_duration: "876000h" });
    await act({ data: { userId: CAROL, action: "unblock" }, context: ctx(OYSTEIN) });
    expect(status(db, CAROL)!["status"]).toBe("active");
    expect(auth.updateUserById).toHaveBeenLastCalledWith(CAROL, { ban_duration: "none" });
  });

  it("REQ-0651: brukeren sletter seg selv ved å skrive e-posten; låst i 30 dager; bare admin låser opp", async () => {
    const db = setup();
    const del = (await account()).requestMyDeletion as unknown as Fn;
    expect(
      (await del({ data: { confirmEmail: "feil@example.no" }, context: ctx(BOB) }))["ok"],
    ).toBe(false);
    expect(
      (await del({ data: { confirmEmail: "oystein@gutu.no" }, context: ctx(OYSTEIN) }))["ok"],
    ).toBe(false);
    expect(
      (await del({ data: { confirmEmail: " Bob@Example.no " }, context: ctx(BOB) }))["ok"],
    ).toBe(true);
    const s = status(db, BOB)!;
    expect(s["status"]).toBe("deleting");
    const days = (Date.parse(String(s["delete_after"])) - Date.now()) / 86_400_000;
    expect(Math.round(days)).toBe(30);
    expect(auth.updateUserById).toHaveBeenCalledWith(BOB, { ban_duration: "876000h" });
    // Låses opp av administrator
    const act = (await admin()).adminSetUserStatus as unknown as Fn;
    await act({ data: { userId: BOB, action: "unlock" }, context: ctx(OYSTEIN) });
    expect(status(db, BOB)!["status"]).toBe("active");
    expect(status(db, BOB)!["delete_after"]).toBe(null);
  });

  it("REQ-0651: etter 30 dager anonymiseres kontoen; eierskap står til prosjektet får ny eier", async () => {
    const db = setup();
    db.tables["project_members"]!.push({
      project_id: crypto.randomUUID(),
      user_id: BOB,
      role: "owner",
      removed_at: null,
    });
    db.tables["account_status"]!.push({
      user_id: BOB,
      status: "deleting",
      delete_after: new Date(Date.now() - 1000).toISOString(),
    });
    const { purgeDueAccounts } = await admin();
    expect(await purgeDueAccounts(db as never)).toBe(1);
    expect(status(db, BOB)!["status"]).toBe("deleted");
    expect(db.tables["ai_provider_keys"]!.filter((r) => r["user_id"] === BOB)).toHaveLength(0);
    expect(db.tables["ai_account_limits"]!.filter((r) => r["user_id"] === BOB)).toHaveLength(0);
    const bobMembers = db.tables["project_members"]!.filter((r) => r["user_id"] === BOB);
    expect(bobMembers.find((m) => m["role"] === "editor")!["removed_at"]).not.toBe(null);
    expect(bobMembers.find((m) => m["role"] === "owner")!["removed_at"]).toBe(null);
    expect(db.tables["profiles"]!.find((r) => r["user_id"] === BOB)!["display_name"]).toBe("");
    const call = auth.updateUserById.mock.calls.find((c) => c[0] === BOB)!;
    expect(String((call[1] as { email: string }).email)).toMatch(/^deleted-.*@deleted\.invalid$/);
  });
});

describe("REQ-0652 – låste prosjekter og ny eier", () => {
  it("REQ-0652: eieren blokkeres → prosjektet er låst; en blokkert redaktør låser ikke prosjektet", async () => {
    const db = setup();
    const { projectLock, writeBlocked } = await import("@/adapters/account/lock.server");
    db.tables["account_status"]!.push({ user_id: BOB, status: "blocked" });
    expect(await projectLock(db as never, P)).toBe(null);
    expect(await writeBlocked(db as never, P, ALICE)).toBe(null);
    expect(await writeBlocked(db as never, P, BOB)).toMatch(/ikke aktiv|not active/);
    db.tables["account_status"]!.push({ user_id: ALICE, status: "blocked" });
    expect(await projectLock(db as never, P)).toBe("owner_blocked");
    expect(await writeBlocked(db as never, P, ALICE)).toMatch(/./);
  });

  it("REQ-0652: administrator gir prosjektet ny eier; den gamle eieren blir redaktør", async () => {
    const db = setup();
    db.tables["account_status"]!.push({ user_id: ALICE, status: "blocked" });
    const re = (await admin()).adminReassignProject as unknown as Fn;
    // Den nye eieren må være aktiv
    db.tables["account_status"]!.push({ user_id: CAROL, status: "blocked" });
    expect(
      (await re({ data: { projectId: P, newOwnerId: CAROL }, context: ctx(OYSTEIN) }))["ok"],
    ).toBe(false);
    expect((await re({ data: { projectId: P, newOwnerId: BOB }, context: ctx(ALICE) }))["ok"]).toBe(
      false,
    );
    expect(
      (await re({ data: { projectId: P, newOwnerId: BOB }, context: ctx(OYSTEIN) }))["ok"],
    ).toBe(true);
    const m = (u: string) => db.tables["project_members"]!.find((r) => r["user_id"] === u)!;
    expect(m(BOB)["role"]).toBe("owner");
    expect(m(ALICE)["role"]).toBe("editor");
    const { projectLock } = await import("@/adapters/account/lock.server");
    expect(await projectLock(db as never, P)).toBe(null);
  });
});

describe("REQ-0653 – personvernerklæringen får ny versjon ved hver lagring", () => {
  it("REQ-0653: bare administrator lagrer; versjonen øker", async () => {
    const db = setup();
    const save = (await admin()).adminSavePrivacy as unknown as Fn;
    const fields = { controllerName: "Diagonalen AS", storageRegion: "EU", contactEmail: "x@y.no" };
    expect((await save({ data: fields, context: ctx(ALICE) }))["ok"]).toBe(false);
    const r = await save({ data: fields, context: ctx(OYSTEIN) });
    expect(r).toMatchObject({ ok: true, version: 2 });
    expect(db.tables["privacy_policy"]!.find((x) => x["version"] === 2)).toMatchObject({
      controller_name: "Diagonalen AS",
      storage_region: "EU",
    });
  });
});

describe("REQ-0654 – AI-forbruk: mitt i prosjektet, prosjektet totalt (bare eier), på tvers av prosjekter", () => {
  it("REQ-0654: redaktøren ser bare sitt eget; bare eieren ser prosjektet totalt; feilet og kø er ikke med", async () => {
    setup();
    const f = (await account()).fetchAiUsage as unknown as Fn;
    const mine = (await f({ data: { scope: "mine", projectId: P }, context: ctx(BOB) })) as {
      ok: boolean;
      rows: { createdBy: string; costUsd: number }[];
    };
    expect(mine.ok).toBe(true);
    expect(mine.rows.map((r) => r.costUsd)).toEqual([2]);
    expect((await f({ data: { scope: "project", projectId: P }, context: ctx(BOB) }))["ok"]).toBe(
      false,
    );
    const all = (await f({ data: { scope: "project", projectId: P }, context: ctx(ALICE) })) as {
      rows: unknown[];
      userNames: Record<string, string>;
      projectNames: Record<string, string>;
    };
    expect(all.rows).toHaveLength(2);
    expect(all.userNames[BOB]).toBe("Bob");
    expect(all.projectNames[P]).toBe("Jula på Dovre");
    // Kontoen: alle prosjekter, bare egne jobber, uten å være medlem-sjekket
    const acc = (await f({ data: { scope: "account" }, context: ctx(ALICE) })) as {
      rows: unknown[];
    };
    expect(acc.rows).toHaveLength(1);
    // Et vanlig medlem uten endringsrett ser ikke forbruket i prosjektet
    expect((await f({ data: { scope: "mine", projectId: P }, context: ctx(CAROL) }))["ok"]).toBe(
      false,
    );
  });
});
