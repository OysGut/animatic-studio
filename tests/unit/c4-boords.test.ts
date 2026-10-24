/** C-4 Boords: alt mot en falsk Boords-server og et minnelager; ingen ekte kall. */
import { describe, expect, it } from "vitest";
import {
  ADAPTERS, BOORDS_LIMITS, RateWindow, applyTextCandidate, boordsFramePayload, constantTimeEqual, fieldsHash, hmacSha256Hex,
  nextCursor, panelToBoordsFields, planBoordsIntake, retryAfterMs, verifyBoordsWebhook, type PanelLike,
} from "@/core/connectors";
import { BoordsClient, pullStoryboard, pushStoryboard, scrub, type BoordsStore, type Clock } from "@/adapters/connectors/boords.server";

const KEY = "bk_live_SECRETSECRET1234";
const clock = (): Clock & { slept: number[]; t: number } => { const c = { t: 1_700_000_000_000, slept: [] as number[], now: () => c.t, sleep: async (ms: number) => { c.slept.push(ms); c.t += ms; } }; return c; };

describe("HMAC og webhook", () => {
  const secret = "whsec_test", body = '{"event":"frame.updated"}', ts = "1700000000";
  const sig = hmacSha256Hex(secret, `${ts}.${body}`);
  const base = { rawBody: body, timestamp: ts, eventId: "evt_1", secret, nowMs: 1_700_000_010_000 };
  it("RFC 4231 test 2", () => expect(hmacSha256Hex("Jefe", "what do ya want for nothing?")).toBe("5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843"));
  it("gyldig", () => expect(verifyBoordsWebhook({ ...base, signature: `sha256=${sig}` }).ok).toBe(true));
  it("ugyldig", () => expect(verifyBoordsWebhook({ ...base, signature: sig.replace(/^./, c => (c === "a" ? "b" : "a")) })).toEqual({ ok: false, reason: "signature" }));
  it("gammel", () => expect(verifyBoordsWebhook({ ...base, signature: sig, nowMs: 1_700_000_000_000 + 301_000 })).toEqual({ ok: false, reason: "stale" }));
  it("format", () => expect(verifyBoordsWebhook({ ...base, signature: null }).ok).toBe(false));
  it("konstant-tid", () => { expect(constantTimeEqual("abc", "abc")).toBe(true); expect(constantTimeEqual("abc", "abd")).toBe(false); expect(constantTimeEqual("ab", "abc")).toBe(false); });
  it("duplikat avvises av webhook-ruten via boords_webhook_once (primærnøkkel)", async () => {
    const sql = (await import("node:fs")).readFileSync("db/migrations/0112_c4_boords.sql", "utf8");
    expect(sql).toMatch(/primary key\(connection_id,event_id\)/);
    expect(sql).not.toMatch(/^\s*(begin|commit);/m);
    const route = (await import("node:fs")).readFileSync("src/routes/api/public/boords/webhook.$connectionId.ts", "utf8");
    expect(route).toMatch(/boords_webhook_once/); expect(route).toMatch(/duplicate: true/);
  });
});

describe("kø og 429", () => {
  it("Retry-After i sekunder og dato", () => { expect(retryAfterMs("3", 0)).toBe(3000); expect(retryAfterMs(new Date(5000).toUTCString(), 0)).toBe(5000); expect(retryAfterMs("x", 0)).toBeNull(); });
  it("venter Retry-After ved 429 og prøver igjen", async () => {
    const c = clock(); let n = 0;
    const f = (async () => (++n === 1 ? new Response("", { status: 429, headers: { "Retry-After": "2" } }) : Response.json({ ok: 1 }))) as unknown as typeof fetch;
    expect(await new BoordsClient(KEY, { fetch: f, clock: c, windowKey: "t429" }).request("GET", "/me")).toEqual({ ok: 1 });
    expect(c.slept).toContain(2000); expect(n).toBe(2);
  });
  it("høyst 120 kall per minutt", async () => {
    const c = clock(); const f = (async () => Response.json({})) as unknown as typeof fetch;
    const cl = new BoordsClient(KEY, { fetch: f, clock: c, windowKey: "t120" });
    for (let i = 0; i < 121; i++) await cl.request("GET", "/me");
    expect(c.slept.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(59_000);
    const w = new RateWindow(2); w.record(0); w.record(10); expect(w.waitMs(20)).toBe(59_980);
  });
  it("gir opp etter maks forsøk uten å lekke nøkkelen", async () => {
    const c = clock(); const f = (async () => new Response("", { status: 429 })) as unknown as typeof fetch;
    const e = await new BoordsClient(KEY, { fetch: f, clock: c, windowKey: "tmax" }).request("GET", "/me").catch(x => x as Error);
    expect(String((e as Error).message)).not.toContain(KEY);
    expect(scrub(`fail ${KEY}`, KEY)).toBe("fail [redacted]");
  });
  it("nøkkelen sendes bare i X-API-KEY", async () => {
    const seen: { url: string; headers: Record<string, string>; body: unknown }[] = [];
    const f = (async (url: string, init: RequestInit) => { seen.push({ url, headers: init.headers as Record<string, string>, body: init.body }); return Response.json({}); }) as unknown as typeof fetch;
    await new BoordsClient(KEY, { fetch: f, clock: clock(), windowKey: "thdr" }).request("POST", "/x", { a: 1 });
    expect(seen[0]!.headers["X-API-KEY"]).toBe(KEY); expect(seen[0]!.url).not.toContain(KEY); expect(String(seen[0]!.body)).not.toContain(KEY);
  });
});

describe("feltmapping og updated_since", () => {
  const panel: PanelLike = { id: "p1", number: "3A", fields: { action: "Hun løper", sound: "Vind", dialogue: "", camera: "WS" }, dialogueLines: ["ANNA: Vent!"] };
  it("panel → Boords", () => {
    expect(panelToBoordsFields(panel)).toEqual({ action: "Hun løper", sound: "Vind", dialogue: "ANNA: Vent!" });
    expect(boordsFramePayload(panel, "m1")).toMatchObject({ number: "3A", reference: "ptg:m1:p1" });
    expect(boordsFramePayload(panel, "m1")).not.toHaveProperty("camera");
  });
  it("Boords → panel bare ved valg, andre felt bevares", () => {
    expect(applyTextCandidate(panel.fields, { action: "Hun går" }, "keep_both")).toBeNull();
    expect(applyTextCandidate(panel.fields, { action: "Hun går" }, "choose_incoming")).toEqual({ ...panel.fields, action: "Hun går" });
  });
  it("kandidat, konflikt og uendret", () => {
    const ours = fieldsHash(panelToBoordsFields(panel));
    const frame = { id: "f1", number: "3A", action: "Hun går", sound: "Vind", dialogue: "ANNA: Vent!", imageUrl: null, updatedAt: "2026-10-24T10:00:00Z" };
    const states = [{ linkId: "l1", panelId: "p1", frameId: "f1", ourHash: ours, theirHash: ours }];
    const panels = new Map([["p1", panel]]);
    const plan = planBoordsIntake({ frames: [frame], states, panels, imageChanged: () => false });
    expect(plan).toHaveLength(1); expect(plan[0]).toMatchObject({ kind: "text", conflict: false, incoming: { action: "Hun går" } });
    const changedHere = new Map([["p1", { ...panel, fields: { ...panel.fields, sound: "Regn" } }]]);
    expect(planBoordsIntake({ frames: [frame], states, panels: changedHere, imageChanged: () => false })[0]!.conflict).toBe(true);
    expect(planBoordsIntake({ frames: [{ ...frame, action: "Hun løper" }], states, panels, imageChanged: () => false })).toEqual([]);
    expect(nextCursor("2026-10-24T09:00:00.000Z", [frame])).toBe("2026-10-24T10:00:00.000Z");
    expect(nextCursor("2026-10-25T00:00:00.000Z", [frame])).toBe("2026-10-25T00:00:00.000Z");
  });
});

/** Falsk Boords-server + minnelager: send, hent med updated_since, kandidat uten automatisk bruk. */
function fakeWorld() {
  const frames = new Map<string, Record<string, string>>(); const comments: Record<string, string>[] = [{ id: "c1", frame_id: "f-1", author: "Kari", text: "<b>Fint</b>", created_at: "" }];
  const requests: string[] = [];
  const f = (async (url: string, init: RequestInit) => {
    requests.push(`${init.method} ${url}`);
    const u = new URL(url), path = u.pathname.replace("/api/v1", "");
    if (init.method === "POST" && path === "/storyboards") return Response.json({ id: "sb1" });
    if (init.method === "POST" && path.endsWith("/frames")) { const id = `f-${frames.size + 1}`; const b = init.body instanceof FormData ? Object.fromEntries([...init.body.entries()].filter(([, v]) => typeof v === "string")) as Record<string, string> : JSON.parse(String(init.body)); frames.set(id, { ...b, id, updated_at: "2026-10-24T10:00:00Z" }); return Response.json({ id }); }
    if (init.method === "GET" && path.endsWith("/frames")) return Response.json({ data: [...frames.values()].filter(x => !u.searchParams.get("updated_since") || x["updated_at"]! > u.searchParams.get("updated_since")!) });
    if (init.method === "GET" && path.endsWith("/comments")) return Response.json(comments);
    if (init.method === "POST" && path.endsWith("/comments")) return Response.json({ id: "c-out-1" });
    return new Response("", { status: 404 });
  }) as unknown as typeof fetch;
  const panel: PanelLike = { id: "00000000-0000-4000-8000-000000000001", number: "1", fields: { action: "A", sound: "S", dialogue: "D" }, dialogueLines: [] };
  const db = { pl: null as null | { storyboardId: string; manifestId: string }, links: [] as { id: string; projectId: string; panelId: string; frameId: string }[], st: new Map<string, { ourHash: string | null; theirHash: string | null }>(), cands: [] as Record<string, unknown>[], comments: [] as Record<string, unknown>[], cursor: null as string | null, applied: 0 };
  const store: BoordsStore = {
    async panels() { return new Map([[panel.id, panel]]); },
    async projectLink() { return db.pl; },
    async saveProjectLink(l) { db.pl = { storyboardId: l.storyboardId, manifestId: l.manifestId }; },
    async links() { return db.links; },
    async saveLink(l) { const id = `l${db.links.length + 1}`; db.links.push({ id, projectId: l.projectId, panelId: l.panelId, frameId: l.frameId }); return id; },
    async frameStates() { return db.links.map(l => ({ linkId: l.id, panelId: l.panelId, frameId: l.frameId, ...(db.st.get(l.id) ?? { ourHash: null, theirHash: null }) })); },
    async saveFrameState(s) { db.st.set(s.linkId, { ourHash: s.ourHash, theirHash: s.theirHash }); },
    async imageSeen() { return null; },
    async insertCandidate(c) { if (db.cands.some(x => x["incomingHash"] === c.incomingHash)) return false; db.cands.push({ ...c, status: "open" }); return true; },
    async storeImage() { return { path: "p/x.png", sha256: "0".repeat(64) }; },
    async knownComments() { return new Set(db.comments.map(c => String(c["boordsId"]))); },
    async insertComment(c) { db.comments.push(c); },
    async unsentFeedback() { return db.comments.some(c => c["feedbackId"] === "fb1") ? [] : [{ id: "fb1", panelId: panel.id, author: "Gjest", text: "Mer lys" }]; },
    async setCursor(_id, c) { db.cursor = c; },
  };
  return { f, frames, store, db, panel, requests };
}

describe("send og hent mot falsk Boords", () => {
  it("rundtur: send, endring i Boords blir kandidat, ingen automatisk bruk, idempotent", async () => {
    const w = fakeWorld(), client = new BoordsClient(KEY, { fetch: w.f, clock: clock(), windowKey: "world" });
    const r = await pushStoryboard({ client, store: w.store, projectId: "p", connectionId: "c", userId: "u", title: "T", panelOrder: [w.panel.id], images: new Map([[w.panel.id, new Uint8Array([137, 80, 78, 71])]]), newManifestId: () => "m1" });
    expect(r).toEqual({ storyboardId: "sb1", created: 1, updated: 0 });
    expect(w.frames.get("f-1")).toMatchObject({ action: "A", sound: "S", dialogue: "D", reference: `ptg:m1:${w.panel.id}` });
    w.frames.set("f-1", { ...w.frames.get("f-1")!, action: "Endret i Boords", updated_at: "2026-10-24T11:00:00Z" });
    const p1 = await pullStoryboard({ client, store: w.store, projectId: "p", connectionId: "c", since: null });
    expect(p1.candidates).toBe(1); expect(w.db.cands[0]).toMatchObject({ kind: "text", conflict: false, incoming: { action: "Endret i Boords" }, status: "open" });
    expect(w.db.applied).toBe(0);
    expect(w.db.cursor).toBe("2026-10-24T11:00:00.000Z");
    // Kommentarer begge veier, HTML fjernet, SB-10-tilbakemelding sendt én gang
    expect(w.db.comments.find(c => c["direction"] === "in")).toMatchObject({ text: "Fint", panelId: w.panel.id });
    expect(w.db.comments.filter(c => c["direction"] === "out")).toHaveLength(1);
    const p2 = await pullStoryboard({ client, store: w.store, projectId: "p", connectionId: "c", since: null });
    expect(p2.candidates).toBe(0);
    expect(w.db.comments.filter(c => c["direction"] === "out")).toHaveLength(1);
    expect(w.requests.some(r => r.includes("updated_since"))).toBe(false);
    await pullStoryboard({ client, store: w.store, projectId: "p", connectionId: "c", since: w.db.cursor });
    expect(w.requests.some(r => r.includes("updated_since=2026-10-24T11"))).toBe(true);
  });
});

describe("kapabiliteter og nøkkelsikkerhet", () => {
  it("Boords sier ærlig hva den kan", () => {
    const b = ADAPTERS.find(a => a.id === "boords-api")!;
    expect(b.capabilities).toEqual(["read", "write", "notes"]);
    expect(BOORDS_LIMITS).toContain("paid-plan"); expect(BOORDS_LIMITS).toContain("no-etag");
  });
  it("chifferet kan ikke leses fra nettleseren og svar inneholder ikke nøkkelen", async () => {
    const fs = await import("node:fs");
    const sql = fs.readFileSync("db/migrations/0112_c4_boords.sql", "utf8");
    const grant = sql.match(/grant select\(([^)]*)\) on public\.boords_connections to authenticated/)![1]!;
    expect(grant).not.toMatch(/ciphertext|iv\b|webhook/);
    const fns = fs.readFileSync("src/adapters/connectors/boords.functions.ts", "utf8");
    expect(fns).not.toMatch(/console\.(log|error)\([^)]*(key|apiKey)/i);
    const view = fns.match(/interface BoordsConnectionView \{([^}]*)\}/)![1]!;
    expect(view).not.toMatch(/apiKey|ciphertext|secret/i);
    for (const f of ["src/app/account/BoordsCard.tsx", "src/app/storyboard/BoordsSend.tsx"]) expect(fs.readFileSync(f, "utf8")).not.toMatch(/key-vault|boords\.server|boords-store/);
  });
  it("kryptering: rundtur og binding til rad (AAD)", async () => {
    process.env["ANIMATIC_KEY_ENCRYPTION_KEY"] = Buffer.alloc(32, 7).toString("base64");
    const { encryptKey, decryptKey } = await import("@/adapters/ai/key-vault.server");
    const ctx = { userId: "u1", provider: "boords", rowId: "r1" };
    const s = await encryptKey(KEY, ctx);
    expect(s.ciphertext).not.toContain(KEY.slice(0, 8));
    expect(await decryptKey({ ...s, key_version: s.version }, ctx)).toBe(KEY);
    await expect(decryptKey({ ...s, key_version: s.version }, { ...ctx, rowId: "r2" })).rejects.toThrow();
    await expect(decryptKey({ ...s, key_version: s.version }, { ...ctx, provider: "boords-webhook" })).rejects.toThrow();
  });
});
