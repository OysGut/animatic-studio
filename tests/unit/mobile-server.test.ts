// @vitest-environment node
/**
 * Fase 2, bolk A (DEC-0090): serverfunksjonene for mobilbroen – bare redaktører lager QR-koder, tokenet lagres
 * bare som hash, konteksten må høre til prosjektet, mobilen får en signert opplastingslenke, innholdet sjekkes
 * etterpå (feil innhold slettes), og en delt lenke kan ikke deles videre. Falsk database og lagring.
 */
import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

type Row = Record<string, unknown>;
type Fn = (a: { data?: unknown; context?: unknown }) => Promise<Record<string, unknown>>;

const P = "00000000-0000-7000-8000-00000000aa01";
const OTHER = "00000000-0000-7000-8000-00000000aa02";
const ASSET = "00000000-0000-7000-8000-00000000aa03";
const ALICE = "00000000-0000-7000-8000-00000000aa04";
const BOB = "00000000-0000-7000-8000-00000000aa05";
const FILE = "00000000-0000-7000-8000-00000000aa06";
const SOUND = "00000000-0000-7000-8000-00000000aa07";
const OCC = "00000000-0000-7000-8000-00000000aa08";
const VAR = "00000000-0000-7000-8000-00000000aa0a";
const B1 = "00000000-0000-7000-8000-00000000aab1";
const B2 = "00000000-0000-7000-8000-00000000aab2";
const B3 = "00000000-0000-7000-8000-00000000aab3";
const sha = (t: string) => createHash("sha256").update(t).digest("hex");

/** Minimal falsk Supabase: tabeller, rpc og lagring (bare det funksjonene bruker). */
function fake(tables: Record<string, Row[]>) {
  const calls = {
    rpc: [] as [string, Row][],
    removed: [] as string[],
    signedUpload: [] as string[],
  };
  const query = (table: string) => {
    const filters: [string, unknown][] = [];
    let insertRow: Row | null = null;
    const rows = () =>
      (tables[table] ?? []).filter((r) =>
        filters.every(([k, v]) => (v === null ? r[k] == null : r[k] === v)),
      );
    const q: Record<string, unknown> = {
      select: () => q,
      eq: (k: string, v: unknown) => (filters.push([k, v]), q),
      order: () => q,
      limit: () => q,
      is: (k: string, v: unknown) => (filters.push([k, v]), q),
      insert: (r: Row) => {
        insertRow = { id: crypto.randomUUID(), ...r };
        (tables[table] ??= []).push(insertRow);
        return q;
      },
      single: () => Promise.resolve({ data: insertRow ?? rows()[0] ?? null, error: null }),
      maybeSingle: () => Promise.resolve({ data: rows()[0] ?? null, error: null }),
      then: (ok: (v: unknown) => unknown) =>
        Promise.resolve({ data: insertRow ?? rows(), error: null }).then(ok),
    };
    return q;
  };
  const db = {
    from: query,
    rpc: (name: string, args: Row) => {
      calls.rpc.push([name, args]);
      if (name === "mobile_session_touch") {
        const s = (tables["upload_sessions"] ?? []).find(
          (x) => x["token_hash"] === args["p_token_hash"],
        );
        return Promise.resolve({ data: s ?? null, error: null });
      }
      if (name === "mobile_register_upload")
        return Promise.resolve({ data: { status: "pending", path: args["p_path"] }, error: null });
      return Promise.resolve({ data: {}, error: null });
    },
    storage: {
      from: () => ({
        createSignedUploadUrl: (path: string) => {
          calls.signedUpload.push(path);
          return Promise.resolve({ data: { path, token: "opplastingsnokkel" }, error: null });
        },
        createSignedUrl: (path: string) =>
          Promise.resolve({ data: { signedUrl: `https://lagring/${path}` }, error: null }),
        remove: (paths: string[]) => {
          calls.removed.push(...paths);
          return Promise.resolve({ error: null });
        },
      }),
    },
  };
  return { db, calls, tables };
}

let fns: {
  createUploadSession: Fn;
  mobileSession: Fn;
  mobileUploadTicket: Fn;
  mobileConfirmUpload: Fn;
  mobileShareLink: Fn;
};
beforeEach(async () => {
  fns = (await import("@/adapters/mobile/mobile.functions")) as unknown as typeof fns;
});

function setup(head: number[] = [0xff, 0xd8, 0xff, 0xe0], size = 1234) {
  const f = fake({
    project_members: [
      { project_id: P, user_id: ALICE, role: "editor", removed_at: null },
      { project_id: P, user_id: BOB, role: "viewer", removed_at: null },
    ],
    assets: [
      { id: ASSET, project_id: P, kind: "character" },
      { id: SOUND, project_id: P, kind: "sound" },
      { id: "00000000-0000-7000-8000-00000000aa09", project_id: OTHER },
    ],
    profiles: [{ user_id: ALICE, display_name: "Alice" }],
    scene_occurrences: [{ id: OCC, project_id: P, variant_id: VAR }],
    script_blocks: [
      { id: B1, project_id: P, variant_id: VAR, kind: "character", text: "MAJA", removed: false },
      {
        id: B2,
        project_id: P,
        variant_id: VAR,
        kind: "dialogue",
        text: "Jeg tror det er noen der ute.",
        removed: false,
      },
      {
        id: B3,
        project_id: P,
        variant_id: VAR,
        kind: "action",
        text: "Det knirker.",
        removed: false,
      },
    ],
    upload_sessions: [],
    mobile_imports: [],
  });
  h.db = f.db;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      const body = new Uint8Array(32);
      body.set(head);
      return new Response(body, {
        status: 206,
        headers: { "content-range": `bytes 0-31/${size}` },
      });
    }),
  );
  return f;
}
const ctx = (u: string) => ({ userId: u, supabase: h.db, claims: {} });

describe("QR-koder på datamaskinen", () => {
  it("bare redaktører; tokenet lagres som hash; konteksten må høre til prosjektet", async () => {
    const f = setup();
    const viewer = await fns.createUploadSession({
      data: { projectId: P, context: { type: "project" }, label: "x" },
      context: ctx(BOB),
    });
    expect(viewer["ok"]).toBe(false);
    const other = await fns.createUploadSession({
      data: {
        projectId: P,
        context: { type: "asset", assetId: "00000000-0000-7000-8000-00000000aa09" },
        label: "x",
      },
      context: ctx(ALICE),
    });
    expect(other["ok"]).toBe(false);
    const ok = await fns.createUploadSession({
      data: { projectId: P, context: { type: "asset", assetId: ASSET }, label: "Bilder av Maja" },
      context: ctx(ALICE),
    });
    expect(ok["ok"]).toBe(true);
    const token = ok["token"] as string;
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const row = f.tables["upload_sessions"]![0]!;
    expect(row["token_hash"]).toBe(sha(token));
    expect(JSON.stringify(row)).not.toContain(token);
    expect(row["kind"]).toBe("personal");
    expect(row["creator_name"]).toBe("Alice");
    expect(Date.parse(row["expires_at"] as string) - Date.now()).toBeLessThanOrEqual(
      2 * 3600_000 + 1000,
    );
    await expect(
      fns.createUploadSession({
        data: { projectId: P, context: { type: "hack" } },
        context: ctx(ALICE),
      }),
    ).rejects.toThrow();
  });
});

describe("mobilen uten innlogging", () => {
  async function session(f: ReturnType<typeof setup>, kind = "personal") {
    const token = "a".repeat(43);
    f.tables["upload_sessions"]!.push({
      id: "00000000-0000-7000-8000-00000000bb01",
      project_id: P,
      token_hash: sha(token),
      kind,
      label: "Bilder av Maja",
      creator_name: "Alice",
      media_kinds: ["image", "video"],
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
      files_count: 0,
      max_files: 10,
      bytes_total: 0,
      max_bytes: 1e9,
      created_by: ALICE,
      context: { type: "asset", assetId: ASSET },
    });
    return token;
  }

  it("økten viser bare hva filene gjelder, ikke prosjektets innhold", async () => {
    const f = setup();
    const token = await session(f);
    const r = await fns.mobileSession({ data: { token } });
    expect(r).toMatchObject({
      ok: true,
      kind: "personal",
      label: "Bilder av Maja",
      mediaKinds: ["image", "video"],
    });
    expect(JSON.stringify(r)).not.toContain(P);
    const bad = await fns.mobileSession({ data: { token: "b".repeat(43) } });
    expect(bad["ok"]).toBe(false);
    await expect(fns.mobileSession({ data: { token: "kort" } })).rejects.toThrow();
  });

  it("gir signert opplastingslenke under prosjektets mobile-mappe; feil filtype avvises", async () => {
    const f = setup();
    const token = await session(f);
    const wrong = await fns.mobileUploadTicket({
      data: { token, clientFileId: FILE, mime: "audio/mpeg", bytes: 10, fileName: "a.mp3" },
    });
    expect(wrong["ok"]).toBe(false);
    const r = await fns.mobileUploadTicket({
      data: {
        token,
        clientFileId: FILE,
        mime: "image/jpeg",
        bytes: 1234,
        fileName: "a.jpg",
        contributor: "Kari\n",
      },
    });
    expect(r["ok"]).toBe(true);
    expect(r["path"]).toBe(`${P}/source/mobile/00000000-0000-7000-8000-00000000bb01/${FILE}.jpg`);
    expect(r["uploadToken"]).toBe("opplastingsnokkel");
    const reg = f.calls.rpc.find(([n]) => n === "mobile_register_upload")![1];
    expect(reg["p_contributor"]).toBe("Kari");
    expect(reg["p_token_hash"]).toBe(sha(token));
  });

  it("innhold som ikke stemmer med filtypen, slettes og merkes som feilet", async () => {
    const f = setup([0x3c, 0x68, 0x74, 0x6d]);
    const token = await session(f);
    f.tables["mobile_imports"]!.push({
      session_id: "00000000-0000-7000-8000-00000000bb01",
      client_file_id: FILE,
      path: `${P}/source/mobile/x/${FILE}.jpg`,
      mime_type: "image/jpeg",
      status: "pending",
    });
    const r = await fns.mobileConfirmUpload({ data: { token, clientFileId: FILE } });
    expect(r["ok"]).toBe(false);
    expect(f.calls.removed).toEqual([`${P}/source/mobile/x/${FILE}.jpg`]);
    const conf = f.calls.rpc.find(([n]) => n === "mobile_confirm_upload")![1];
    expect(conf["p_ok"]).toBe(false);
  });

  it("riktig innhold bekreftes med faktisk størrelse", async () => {
    const f = setup([0xff, 0xd8, 0xff, 0xe0], 5555);
    const token = await session(f);
    f.tables["mobile_imports"]!.push({
      session_id: "00000000-0000-7000-8000-00000000bb01",
      client_file_id: FILE,
      path: `${P}/source/mobile/x/${FILE}.jpg`,
      mime_type: "image/jpeg",
      status: "pending",
    });
    const r = await fns.mobileConfirmUpload({ data: { token, clientFileId: FILE } });
    expect(r["ok"]).toBe(true);
    const conf = f.calls.rpc.find(([n]) => n === "mobile_confirm_upload")![1];
    expect(conf).toMatchObject({ p_ok: true, p_bytes: 5555 });
  });

  it("«Del lenke» lager en egen delt økt; en delt lenke kan ikke deles videre", async () => {
    const f = setup();
    const token = await session(f);
    const r = await fns.mobileShareLink({ data: { token } });
    expect(r["ok"]).toBe(true);
    const shared = f.tables["upload_sessions"]!.find((s) => s["kind"] === "shared")!;
    expect(shared["parent_id"]).toBe("00000000-0000-7000-8000-00000000bb01");
    expect(shared["token_hash"]).toBe(sha(r["token"] as string));
    expect(shared["max_files"]).toBe(200);
    expect(Date.parse(shared["expires_at"] as string) - Date.now()).toBeGreaterThan(
      6.9 * 86400_000,
    );
    const again = await fns.mobileShareLink({ data: { token: r["token"] as string } });
    expect(again["ok"]).toBe(false);
  });

  it("E7 (REQ-0712): mange opplastinger får hver sin plass; en stor video godtas, for stor avvises", async () => {
    const f = setup();
    const token = await session(f);
    const ids = Array.from(
      { length: 20 },
      (_, i) => `00000000-0000-7000-8000-0000000cc0${String(i).padStart(2, "0")}`,
    );
    // Kallene sendes etter hverandre her: vitest-mockingen av dynamiske importer tåler ikke samtidige kall.
    // Samtidige opplastinger fra telefonen (to om gangen) prøves i nettleseren (dec0090-mobile-ui.mjs).
    const rs: Record<string, unknown>[] = [];
    for (const [i, id] of ids.entries())
      rs.push(
        await fns.mobileUploadTicket({
          data: { token, clientFileId: id, mime: "image/jpeg", bytes: 1000, fileName: `b${i}.jpg` },
        }),
      );
    expect(rs.every((r) => r["ok"] === true)).toBe(true);
    expect(new Set(rs.map((r) => r["path"])).size).toBe(20);
    expect(f.calls.rpc.filter(([n]) => n === "mobile_register_upload")).toHaveLength(20);
    const big = await fns.mobileUploadTicket({
      data: {
        token,
        clientFileId: "00000000-0000-7000-8000-0000000cc100",
        mime: "video/mp4",
        bytes: 490 * 1024 * 1024,
        fileName: "lang.mp4",
      },
    });
    expect(big["ok"]).toBe(true);
    const tooBig = await fns.mobileUploadTicket({
      data: {
        token,
        clientFileId: "00000000-0000-7000-8000-0000000cc101",
        mime: "video/mp4",
        bytes: 600 * 1024 * 1024,
        fileName: "for-lang.mp4",
      },
    });
    expect(tooBig["ok"]).toBe(false);
    expect(String(tooBig["message"]).length).toBeGreaterThan(5);
  });
});

describe("lydopptak (bolk B)", () => {
  it("QR-kode for lyd: bare lydressurser og replikker i prosjektet, og bare lyd tillatt", async () => {
    const f = setup();
    const notSound = await fns.createUploadSession({
      data: { projectId: P, context: { type: "sound", assetId: ASSET }, label: "x" },
      context: ctx(ALICE),
    });
    expect(notSound["ok"]).toBe(false);
    const notLine = await fns.createUploadSession({
      data: { projectId: P, context: { type: "line", occurrenceId: OCC, blockId: B3 }, label: "x" },
      context: ctx(ALICE),
    });
    expect(notLine["ok"]).toBe(false);
    const ok = await fns.createUploadSession({
      data: {
        projectId: P,
        context: { type: "line", occurrenceId: OCC, blockId: B2 },
        label: "Scene 1 · MAJA",
      },
      context: ctx(ALICE),
    });
    expect(ok["ok"]).toBe(true);
    expect(f.tables["upload_sessions"]![0]!["media_kinds"]).toEqual(["audio"]);
  });

  it("mobilen får hele replikken, lest fra databasen", async () => {
    const f = setup();
    const token = "c".repeat(43);
    f.tables["upload_sessions"]!.push({
      id: "00000000-0000-7000-8000-00000000bb09",
      project_id: P,
      token_hash: sha(token),
      kind: "personal",
      label: "Scene 1 · MAJA",
      creator_name: "Alice",
      media_kinds: ["audio"],
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
      files_count: 0,
      max_files: 10,
      bytes_total: 0,
      max_bytes: 1e9,
      created_by: ALICE,
      context: { type: "line", occurrenceId: OCC, blockId: B2 },
    });
    const r = await fns.mobileSession({ data: { token } });
    expect(r["script"]).toEqual({
      speaker: "MAJA",
      parenthetical: "",
      text: "Jeg tror det er noen der ute.",
    });
  });
});
