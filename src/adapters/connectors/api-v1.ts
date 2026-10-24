/**
 * C-0 API v1 for Creative Connectors (/api/v1/…). Én handler med en lagringsgrensesnitt (`ConnectorStore`),
 * så den samme koden kjører mot Lovable Cloud (store.server.ts) og mot en falsk lagring i testene (SDK).
 * Serveren sjekker alt: token-hash, utløp, tilbaketrekking, prosjekt, scope, fartsgrense, kvote,
 * idempotens, kontrollsum og innhold. Svar har alltid Cache-Control: no-store.
 */
import { ASSET_MIME_TYPES, type ProjectState } from "@/core";
import {
  ACCESS_TTL_SECONDS, CLIENT_ID_RE, clientKnown, DEVICE_INTERVAL_SECONDS, DEVICE_TTL_SECONDS, REFRESH_TTL_SECONDS,
  Sha256, buildProjectManifest, checkIntake, checkReserve, checkSession, chunkCount, expectedChunkSize, idempotentReplay,
  makeToken, makeUserCode, mimeForExtension, missingChunks, parseScopes, pkceMatches, reserveFingerprint, sha256Hex, tokenHash, tokenKind, toHex,
  planSbproReturn, readSbproReturn, planPremiereProposal, readPremiereReturn, type PremiereEdit, SBPRO_MAX_IMAGE_BYTES, MAX_MANIFEST_BYTES, type SbproCandidate, auditionPlan,
  type ConnectorScope, type ConnectorSessionRow, type ReserveRequest, type TransferStatus,
} from "@/core/connectors";

export interface StoredTransfer {
  readonly id: string; readonly projectId: string; readonly sessionId: string; readonly idempotencyKey: string; readonly fingerprint: string;
  readonly fileName: string; readonly byteSize: number; readonly sha256: string; readonly assetId: string; readonly variantId: string;
  readonly baseVersionId: string | null; status: TransferStatus; candidateVersionId: string | null; conflictId: string | null;
}
export interface ConnectorStore {
  rateLimit(scope: string, keys: string[]): Promise<boolean>;
  consumeCode(hash: string): Promise<{ clientId: string; redirectUri: string; challenge: string; projectId: string; userId: string; scopes: string[]; expiresAt: string } | null>;
  createSession(s: { projectId: string; userId: string; clientId: string; scopes: string[]; accessHash: string; refreshHash: string; accessExpiresAt: string; refreshExpiresAt: string }): Promise<string>;
  sessionByAccess(hash: string): Promise<ConnectorSessionRow | null>;
  /** Roterer refresh-token. Gjenbruk av et brukt refresh-token trekker tilbake hele sesjonen. */
  rotateRefresh(oldHash: string, next: { accessHash: string; refreshHash: string; accessExpiresAt: string; refreshExpiresAt: string }): Promise<ConnectorSessionRow | null>;
  createDevice(d: { deviceHash: string; userCode: string; clientId: string; scopes: string[]; expiresAt: string }): Promise<void>;
  pollDevice(hash: string): Promise<{ status: "pending" | "denied" | "expired" } | { status: "approved"; projectId: string; userId: string; clientId: string; scopes: string[] } | null>;
  revokeByToken(hash: string): Promise<void>;
  loadState(projectId: string): Promise<ProjectState>;
  findTransfer(projectId: string, idempotencyKey: string): Promise<StoredTransfer | null>;
  getTransfer(projectId: string, id: string): Promise<StoredTransfer | null>;
  insertTransfer(t: StoredTransfer): Promise<void>;
  checkQuota(projectId: string, bytes: number): Promise<boolean>;
  putChunk(transferId: string, index: number, bytes: Uint8Array): Promise<void>;
  chunkIndexes(transferId: string): Promise<number[]>;
  readChunk(transferId: string, index: number): Promise<Uint8Array>;
  /** Lagrer filen og legger kandidaten inn via apply_changes (AddAssetVersion, aldri godkjenning). */
  createCandidate(t: StoredTransfer, file: { bytes: Uint8Array[]; mimeType: string; sha256: string }, actor: string): Promise<{ versionId: string; conflictId: string | null }>;
  setTransferStatus(id: string, status: TransferStatus): Promise<void>;
  listConflicts(projectId: string): Promise<unknown[]>;
  /** C-2: leser filen til en versjon (lagringssti fra prosjektdata). null hvis den mangler. */
  readFile(projectId: string, path: string): Promise<Uint8Array | null>;
  /** C-2: konfliktvalg for sesjonsbrukeren (keep_both, choose_current, reject); choose_incoming skjer i appen. */
  resolveConflict(projectId: string, userId: string, id: string, choice: string, revision: number): Promise<"ok" | "stale" | "not_found" | "forbidden" | "choice">;
  /** C-5: lagrer en Storyboard Pro-retur som kandidater (idempotent på manifest-hash per prosjekt). */
  /** C-3: forslag fra Premiere (ett per panel, typen «edit»). Samme tabeller som C-5, kilde «premiere». */
  savePremiereReturn?(r: { projectId: string; productionId: string; sessionId: string; userId: string; hash: string; panelCount: number; edits: readonly PremiereEdit[]; conflicts: readonly string[] }): Promise<{ returnId: string; replayed: boolean }>;
  saveSbproReturn?(r: { projectId: string; productionId: string; sessionId: string; userId: string; hash: string; panelCount: number; candidates: readonly SbproCandidate[] }): Promise<{ returnId: string; replayed: boolean; uploads: { candidateId: string; key: string; sha256: string; byteSize: number }[] }>;
  /** C-5: panelbilde til en bildekandidat som venter på fil. */
  putSbproImage?(projectId: string, returnId: string, candidateId: string, bytes: Uint8Array): Promise<"ok" | "not_found" | "done" | "sha">;
}
export interface ApiDeps { store: ConnectorStore; now: () => number; random: (n: number) => Uint8Array; ip: string }

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", ...extra } });
export const apiError = (status: number, error: string) => json({ error }, status);

async function body(req: Request): Promise<Record<string, unknown>> {
  const text = await req.text();
  if (text.length > 64_000) return {};
  if ((req.headers.get("content-type") ?? "").includes("application/x-www-form-urlencoded")) return Object.fromEntries(new URLSearchParams(text));
  try { const v = JSON.parse(text || "{}"); return v && typeof v === "object" && !Array.isArray(v) ? v : {}; } catch { return {}; }
}
/** UUID v4 fra 16 tilfeldige byte. */
export function uuidFrom(r: Uint8Array): string {
  const b = Uint8Array.from(r.slice(0, 16));
  b[6] = (b[6]! & 0x0f) | 0x40; b[8] = (b[8]! & 0x3f) | 0x80;
  const h = toHex(b);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
const s = (v: unknown) => (typeof v === "string" ? v : "");
const iso = (ms: number) => new Date(ms).toISOString();

async function issue(d: ApiDeps, base: { projectId: string; userId: string; clientId: string; scopes: string[] }) {
  const access = makeToken("access", d.random(32)), refresh = makeToken("refresh", d.random(32));
  await d.store.createSession({ ...base, accessHash: tokenHash(access), refreshHash: tokenHash(refresh), accessExpiresAt: iso(d.now() + ACCESS_TTL_SECONDS * 1000), refreshExpiresAt: iso(d.now() + REFRESH_TTL_SECONDS * 1000) });
  return json({ access_token: access, token_type: "Bearer", expires_in: ACCESS_TTL_SECONDS, refresh_token: refresh, scope: base.scopes.join(" "), project_id: base.projectId });
}

async function token(req: Request, d: ApiDeps): Promise<Response> {
  const b = await body(req);
  const grant = s(b["grant_type"]);
  if (!(await d.store.rateLimit("connector_token", ["ip:" + sha256Hex(d.ip), "c:" + s(b["client_id"]).slice(0, 64)]))) return apiError(429, "slow_down");
  if (grant === "authorization_code") {
    const code = s(b["code"]);
    if (tokenKind(code) !== "code") return apiError(400, "invalid_grant");
    const row = await d.store.consumeCode(tokenHash(code)); // engangs: slettes/merkes brukt uansett utfall
    if (!row || Date.parse(row.expiresAt) <= d.now() || row.clientId !== s(b["client_id"]) || row.redirectUri !== s(b["redirect_uri"]) || !pkceMatches(s(b["code_verifier"]), row.challenge)) return apiError(400, "invalid_grant");
    return issue(d, row);
  }
  if (grant === "refresh_token") {
    const rt = s(b["refresh_token"]);
    if (tokenKind(rt) !== "refresh") return apiError(400, "invalid_grant");
    const access = makeToken("access", d.random(32)), refresh = makeToken("refresh", d.random(32));
    const row = await d.store.rotateRefresh(tokenHash(rt), { accessHash: tokenHash(access), refreshHash: tokenHash(refresh), accessExpiresAt: iso(d.now() + ACCESS_TTL_SECONDS * 1000), refreshExpiresAt: iso(d.now() + REFRESH_TTL_SECONDS * 1000) });
    if (!row || row.revokedAt) return apiError(400, "invalid_grant");
    return json({ access_token: access, token_type: "Bearer", expires_in: ACCESS_TTL_SECONDS, refresh_token: refresh, scope: row.scopes.join(" "), project_id: row.projectId });
  }
  if (grant === "urn:ietf:params:oauth:grant-type:device_code") {
    const dc = s(b["device_code"]);
    if (tokenKind(dc) !== "device") return apiError(400, "invalid_grant");
    const r = await d.store.pollDevice(tokenHash(dc));
    if (!r) return apiError(400, "invalid_grant");
    if (r.status === "pending") return apiError(400, "authorization_pending");
    if (r.status === "denied") return apiError(400, "access_denied");
    if (r.status !== "approved") return apiError(400, "expired_token");
    if (r.clientId !== s(b["client_id"])) return apiError(400, "invalid_grant");
    return issue(d, r);
  }
  return apiError(400, "unsupported_grant_type");
}

async function device(req: Request, d: ApiDeps, origin: string): Promise<Response> {
  const b = await body(req);
  const clientId = s(b["client_id"]), scopes = parseScopes(s(b["scope"]));
  if (!CLIENT_ID_RE.test(clientId) || !clientKnown(clientId)) return apiError(400, "invalid_client");
  if (!scopes) return apiError(400, "invalid_scope");
  if (!(await d.store.rateLimit("connector_device", ["ip:" + sha256Hex(d.ip)]))) return apiError(429, "slow_down");
  const deviceCode = makeToken("device", d.random(32)), userCode = makeUserCode(d.random(8));
  await d.store.createDevice({ deviceHash: tokenHash(deviceCode), userCode, clientId, scopes, expiresAt: iso(d.now() + DEVICE_TTL_SECONDS * 1000) });
  return json({ device_code: deviceCode, user_code: userCode, verification_uri: `${origin}/koble`, verification_uri_complete: `${origin}/koble?user_code=${userCode}`, expires_in: DEVICE_TTL_SECONDS, interval: DEVICE_INTERVAL_SECONDS });
}

async function authed(req: Request, d: ApiDeps, scope: ConnectorScope, projectId?: string): Promise<ConnectorSessionRow | Response> {
  const m = /^Bearer (\S+)$/.exec(req.headers.get("authorization") ?? "");
  const tok = m?.[1] ?? "";
  if (tokenKind(tok) !== "access") return apiError(401, "invalid_token");
  const h = tokenHash(tok);
  if (!(await d.store.rateLimit("connector_api", ["t:" + h.slice(0, 32), "ip:" + sha256Hex(d.ip)]))) return apiError(429, "rate_limited");
  const row = await d.store.sessionByAccess(h);
  const c = checkSession(row, d.now(), projectId === undefined ? { scope } : { scope, projectId });
  if (!c.ok) return apiError(c.reason === "scope" || c.reason === "project" ? 403 : 401, c.reason === "scope" ? "insufficient_scope" : c.reason === "project" ? "wrong_project" : "invalid_token");
  return row!;
}

const publicTransfer = (t: StoredTransfer, received: number[]) => ({
  id: t.id, status: t.status, fileName: t.fileName, byteSize: t.byteSize, sha256: t.sha256, chunkCount: chunkCount(t.byteSize),
  missingChunks: missingChunks(t.byteSize, received), candidateVersionId: t.candidateVersionId, conflictId: t.conflictId,
});

export async function handleApiV1(req: Request, d: ApiDeps): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\/v1/, "").replace(/\/+$/, "") || "/";
  const seg = path.split("/").filter(Boolean);
  const m = req.method;
  try {
    if (m === "POST" && path === "/oauth/token") return await token(req, d);
    if (m === "POST" && path === "/oauth/device") return await device(req, d, url.origin);
    if (m === "POST" && path === "/oauth/revoke") {
      const b = await body(req); const tk = s(b["token"]);
      if (tokenKind(tk)) await d.store.revokeByToken(tokenHash(tk));
      return json({}); // RFC 7009: alltid 200
    }
    if (m === "GET" && path === "/session") {
      const a = await authed(req, d, "project:read"); if (a instanceof Response) return a;
      return json({ id: a.id, projectId: a.projectId, scopes: a.scopes, expiresAt: a.expiresAt });
    }
    if (m === "GET" && path === "/projects") {
      const a = await authed(req, d, "project:read"); if (a instanceof Response) return a;
      const st = await d.store.loadState(a.projectId);
      return json({ projects: [{ id: st.project.id, name: st.project.name, revision: st.project.revision, frameRate: st.project.fps }] });
    }
    if (seg[0] === "projects" && seg[1]) {
      const pid = seg[1], rest = seg.slice(2);
      if (m === "GET" && rest[0] === "manifest" && rest.length === 1) {
        const a = await authed(req, d, "manifest:read", pid); if (a instanceof Response) return a;
        return json(buildProjectManifest(await d.store.loadState(pid), iso(d.now()), { id: "api-v1", version: "1" }));
      }
      if (m === "GET" && rest[0] === "audition" && rest[1] === "plan" && rest.length === 2) {
        const a = await authed(req, d, "manifest:read", pid); if (a instanceof Response) return a;
        const occ = url.searchParams.get("occurrenceId") ?? "", panel = url.searchParams.get("panelId");
        if (!/^[0-9a-zA-Z_-]{1,80}$/.test(occ) || (panel !== null && !/^[0-9a-zA-Z_-]{1,80}$/.test(panel))) return apiError(400, "invalid_request");
        const plan = auditionPlan(await d.store.loadState(pid), occ, panel);
        return plan ? json(plan) : apiError(404, "not_found");
      }
      if (rest[0] === "sbpro" && rest[1] === "returns") {
        const a = await authed(req, d, "transfers:write", pid); if (a instanceof Response) return a;
        if (!d.store.saveSbproReturn || !d.store.putSbproImage) return apiError(501, "not_available");
        if (m === "POST" && rest.length === 2) {
          const text = await req.text();
          if (text.length > MAX_MANIFEST_BYTES) return apiError(413, "too_large");
          let raw: unknown; try { raw = JSON.parse(text); } catch { return apiError(400, "invalid_json"); }
          const r = readSbproReturn(raw, text.length);
          if (!r.ok) return json({ error: "invalid_manifest", reason: r.reason }, 422);
          if (r.value.projectId !== pid) return apiError(403, "wrong_project");
          const st = await d.store.loadState(pid);
          if (!st.productions[r.value.productionId as never]) return apiError(404, "production_not_found");
          const plan = planSbproReturn(st, r.value.productionId, r.value);
          const saved = await d.store.saveSbproReturn({ projectId: pid, productionId: r.value.productionId, sessionId: a.id, userId: a.userId, hash: r.value.hash, panelCount: r.value.panels.length, candidates: plan.candidates });
          return json({ returnId: saved.returnId, candidates: plan.candidates.length, conflicts: plan.candidates.filter(c => c.conflict).length, conform: { lossless: plan.conform.lossless, reasons: plan.conform.reasons }, uploads: saved.uploads }, saved.replayed ? 200 : 201, saved.replayed ? { "Idempotent-Replayed": "true" } : {});
        }
        if (m === "PUT" && rest[3] === "images" && rest.length === 5) {
          const declared = Number(req.headers.get("content-length") ?? "0");
          if (declared > SBPRO_MAX_IMAGE_BYTES) return apiError(413, "too_large");
          const bytes = new Uint8Array(await req.arrayBuffer());
          if (bytes.length > SBPRO_MAX_IMAGE_BYTES || bytes.length < 8) return apiError(413, "too_large");
          const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b);
          if (!png) return apiError(415, "rejected_type");
          const res = await d.store.putSbproImage(pid, rest[2]!, rest[4]!, bytes);
          if (res === "not_found") return apiError(404, "not_found");
          if (res === "sha") return apiError(422, "rejected_checksum");
          if (res === "done") return json({ ok: true }, 200, { "Idempotent-Replayed": "true" });
          return json({ ok: true });
        }
        return apiError(404, "not_found");
      }
      if (m === "POST" && rest[0] === "premiere" && rest[1] === "returns" && rest.length === 2) {
        const a = await authed(req, d, "transfers:write", pid); if (a instanceof Response) return a;
        if (!d.store.savePremiereReturn) return apiError(501, "not_available");
        const text = await req.text();
        if (text.length > MAX_MANIFEST_BYTES) return apiError(413, "too_large");
        let raw: unknown; try { raw = JSON.parse(text); } catch { return apiError(400, "invalid_json"); }
        const r = readPremiereReturn(raw, text.length);
        if (!r.ok) return json({ error: "invalid_manifest", reason: r.reason }, 422);
        if (r.value.projectId !== pid) return apiError(403, "wrong_project");
        const st = await d.store.loadState(pid);
        if (!st.productions[r.value.productionId as never]) return apiError(404, "production_not_found");
        const plan = planPremiereProposal(st, r.value.productionId, r.value);
        const saved = await d.store.savePremiereReturn({ projectId: pid, productionId: r.value.productionId, sessionId: a.id, userId: a.userId, hash: r.value.hash, panelCount: r.value.items.length, edits: plan.edits, conflicts: plan.conflicts });
        return json({ returnId: saved.returnId, proposals: plan.edits.length, conflicts: plan.conflicts.length, missing: plan.missing, unknown: plan.unknown }, saved.replayed ? 200 : 201, saved.replayed ? { "Idempotent-Replayed": "true" } : {});
      }
      if (m === "GET" && rest[0] === "assets" && rest.length === 1) {
        const a = await authed(req, d, "assets:read", pid); if (a instanceof Response) return a;
        const st = await d.store.loadState(pid);
        return json({ assets: Object.values(st.assets).filter(x => !x.removed).map(x => ({ id: x.id, kind: x.kind, name: x.name, revision: x.revision, variants: Object.values(st.assetVariants).filter(v => v.assetId === x.id).map(v => ({ id: v.id, name: v.name, approvedVersionId: v.approvedVersionId })) })) });
      }
      if (m === "GET" && rest[0] === "assets" && rest[2] === "versions" && rest.length === 3) {
        const a = await authed(req, d, "assets:read", pid); if (a instanceof Response) return a;
        const st = await d.store.loadState(pid);
        const variants = new Set(Object.values(st.assetVariants).filter(v => v.assetId === rest[1]).map(v => v.id as string));
        if (!variants.size) return apiError(404, "not_found");
        return json({ versions: Object.values(st.assetVersions).filter(v => !v.removed && variants.has(v.variantId)).map(v => ({ id: v.id, variantId: v.variantId, number: v.number, mimeType: v.mimeType, byteSize: v.byteSize, sha256: v.sha256, approved: st.assetVariants[v.variantId]?.approvedVersionId === v.id, createdAt: v.createdAt })) });
      }
      if (m === "GET" && rest[0] === "assets" && rest[2] === "versions" && rest[4] === "file" && rest.length === 5) {
        const a = await authed(req, d, "assets:read", pid); if (a instanceof Response) return a;
        const st = await d.store.loadState(pid);
        const v = st.assetVersions[rest[3] as never];
        const variant = v ? st.assetVariants[v.variantId] : undefined;
        if (!v || v.removed || !variant || variant.assetId !== rest[1]) return apiError(404, "version_not_found");
        const bytes = await d.store.readFile(pid, v.mediaPath);
        if (!bytes) return apiError(404, "file_missing");
        return new Response(bytes as BodyInit, { status: 200, headers: { "Content-Type": v.mimeType, "Content-Length": String(bytes.length), "X-Content-SHA256": v.sha256, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff", "Content-Disposition": "attachment" } });
      }
      if (m === "POST" && rest[0] === "conflicts" && rest[2] === "resolve" && rest.length === 3) {
        const a = await authed(req, d, "transfers:write", pid); if (a instanceof Response) return a;
        const b = await body(req);
        const choice = s(b["choice"]), revision = Number(b["revision"]);
        if (choice === "choose_incoming") return apiError(409, "approve_in_app");
        if (!["keep_both", "choose_current", "reject"].includes(choice) || !Number.isInteger(revision)) return apiError(400, "invalid_choice");
        const r = await d.store.resolveConflict(pid, a.userId, rest[1]!, choice, revision);
        if (r === "ok") return json({ resolved: true, choice });
        return apiError(r === "stale" ? 409 : r === "forbidden" ? 403 : r === "not_found" ? 404 : 400, r === "not_found" ? "conflict_not_found" : r === "stale" ? "stale" : r);
      }
      if (m === "GET" && rest[0] === "panels" && rest.length === 1) {
        const a = await authed(req, d, "panels:read", pid); if (a instanceof Response) return a;
        const st = await d.store.loadState(pid);
        return json({ panels: Object.values(st.compositions).filter(c => !c.removed && c.kind === "storyboard").map(c => ({ id: c.id, name: c.name, revision: c.revision, occurrenceId: c.occurrenceId ?? null, durationFrames: c.durationFrames, width: c.width, height: c.height })) });
      }
      if (m === "GET" && rest[0] === "conflicts" && rest.length === 1) {
        const a = await authed(req, d, "conflicts:read", pid); if (a instanceof Response) return a;
        return json({ conflicts: await d.store.listConflicts(pid) });
      }
      if (rest[0] === "transfers") {
        const a = await authed(req, d, "transfers:write", pid); if (a instanceof Response) return a;
        if (m === "POST" && rest.length === 1) {
          const b = await body(req);
          const target = (b["target"] ?? {}) as Record<string, unknown>, base = (b["base"] ?? {}) as Record<string, unknown>;
          const r: ReserveRequest = { idempotencyKey: req.headers.get("idempotency-key") ?? "", fileName: s(b["fileName"]), byteSize: Number(b["byteSize"]), sha256: s(b["sha256"]), target: { assetId: s(target["assetId"]), variantId: s(target["variantId"]) }, base: { versionId: typeof base["versionId"] === "string" ? base["versionId"] : null } };
          const c = checkReserve(r);
          if (!c.ok) return apiError(c.reason === "file" ? 415 : 400, "invalid_" + c.reason);
          // C-2: bildeformater prosjektmodellen ikke kan lagre som versjon (i dag PSD) avvises før noen byte sendes,
          // så klienten kan sende en flat PNG i stedet. Se ASSET_MIME_TYPES og C2_REPORT.md.
          const mime = mimeForExtension((/\.([A-Za-z0-9]{1,8})$/.exec(r.fileName)?.[1] ?? "").toLowerCase());
          if (mime && mime.startsWith("image/") && !ASSET_MIME_TYPES.includes(mime)) return apiError(415, "unsupported_version_type");
          const fp = reserveFingerprint(r);
          const existing = await d.store.findTransfer(pid, r.idempotencyKey);
          const replay = idempotentReplay(existing, fp);
          if (replay === "conflict") return apiError(409, "idempotency_key_reused");
          if (replay === "replay" && existing) return json(publicTransfer(existing, await d.store.chunkIndexes(existing.id)), 200, { "Idempotent-Replayed": "true" });
          const st = await d.store.loadState(pid);
          const variant = st.assetVariants[r.target.variantId];
          if (!variant || variant.assetId !== r.target.assetId || st.assets[r.target.assetId]?.removed) return apiError(404, "target_not_found");
          if (!(await d.store.checkQuota(pid, r.byteSize))) return apiError(413, "quota_exceeded");
          const t: StoredTransfer = { id: uuidFrom(d.random(16)), projectId: pid, sessionId: a.id, idempotencyKey: r.idempotencyKey, fingerprint: fp, fileName: r.fileName, byteSize: r.byteSize, sha256: r.sha256, assetId: r.target.assetId, variantId: r.target.variantId, baseVersionId: r.base.versionId, status: "reserved", candidateVersionId: null, conflictId: null };
          await d.store.insertTransfer(t);
          return json(publicTransfer(t, []), 201);
        }
        const t = rest[1] ? await d.store.getTransfer(pid, rest[1]) : null;
        if (!t) return apiError(404, "not_found");
        if (m === "GET" && rest.length === 2) return json(publicTransfer(t, await d.store.chunkIndexes(t.id)));
        if (m === "PUT" && rest[2] === "chunks" && rest.length === 4) {
          if (t.status !== "reserved" && t.status !== "uploading") return apiError(409, "transfer_closed");
          const idx = Number(rest[3]);
          const bytes = new Uint8Array(await req.arrayBuffer());
          if (!Number.isInteger(idx) || bytes.length !== expectedChunkSize(t.byteSize, idx)) return apiError(400, "invalid_chunk");
          await d.store.putChunk(t.id, idx, bytes); // samme bit kan sendes på nytt (gjenopptak)
          if (t.status === "reserved") await d.store.setTransferStatus(t.id, "uploading");
          return json({ received: idx });
        }
        if (m === "POST" && rest[2] === "complete" && rest.length === 3) {
          if (t.status === "candidate") return json(publicTransfer(t, await d.store.chunkIndexes(t.id)), 200, { "Idempotent-Replayed": "true" });
          if (t.status === "rejected") return apiError(409, "transfer_closed");
          const have = await d.store.chunkIndexes(t.id);
          if (missingChunks(t.byteSize, have).length) return apiError(409, "incomplete");
          const parts: Uint8Array[] = [], h = new Sha256();
          for (let i = 0; i < chunkCount(t.byteSize); i++) { const p = await d.store.readChunk(t.id, i); parts.push(p); h.update(p); }
          const head = parts[0]!.slice(0, 16);
          const check = checkIntake({ fileName: t.fileName, byteSize: t.byteSize, head, declaredSha256: t.sha256, actualSha256: toHex(h.digest()) });
          if (!check.ok) { await d.store.setTransferStatus(t.id, "rejected"); return apiError(check.reason === "checksum" ? 422 : 415, "rejected_" + check.reason); }
          const st = await d.store.loadState(pid);
          if (!st.assetVariants[t.variantId]) return apiError(404, "target_not_found");
          const res = await d.store.createCandidate(t, { bytes: parts, mimeType: check.mimeType, sha256: t.sha256 }, a.userId);
          t.status = "candidate"; t.candidateVersionId = res.versionId; t.conflictId = res.conflictId;
          return json(publicTransfer(t, have));
        }
      }
    }
    return apiError(404, "not_found");
  } catch {
    return apiError(500, "server_error");
  }
}

