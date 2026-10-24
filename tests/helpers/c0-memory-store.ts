/**
 * C-0: falsk ConnectorStore i minnet med samme regler som RPC-ene i 0109 (engangskoder, rotasjon med
 * gjenbruksdeteksjon, tilbaketrekking, fartsgrense, kvote). Brukes av API- og SDK-testene; ingen nettverk.
 */
import { applyCommand, type ProjectState } from "@/core";
import { planCandidate } from "@/core/connectors";
import type { ConnectorStore, StoredTransfer } from "@/adapters/connectors/api-v1";

type Pending = { kind: "code" | "device"; userCode?: string; clientId: string; redirectUri?: string; challenge?: string; projectId?: string; userId?: string; scopes: string[]; status: "pending" | "approved" | "denied" | "used"; expiresAt: string };
type Session = { id: string; projectId: string; userId: string; clientId: string; scopes: string[]; accessHash: string; refreshHash: string; accessExpiresAt: string; refreshExpiresAt: string; revokedAt: string | null };

export function memoryStore(state: ProjectState, opts: { now: () => number; rateLimit?: number; quotaBytes?: number }) {
  let s = state;
  const pending = new Map<string, Pending>();
  const sessions: Session[] = [];
  const usedRefresh = new Map<string, string>();
  const transfers = new Map<string, StoredTransfer>();
  const chunks = new Map<string, Map<number, Uint8Array>>();
  const conflicts: Record<string, unknown>[] = [];
  const hits = new Map<string, number>();
  const files = new Map<string, Uint8Array>();
  let n = 0;
  const view = (x: Session) => ({ id: x.id, projectId: x.projectId, userId: x.userId, scopes: x.scopes, expiresAt: x.accessExpiresAt, revokedAt: x.revokedAt });
  const store: ConnectorStore = {
    async rateLimit(scope, keys) {
      const limit = opts.rateLimit ?? 1000;
      let ok = true;
      for (const k of keys) { const key = scope + k; const c = (hits.get(key) ?? 0) + 1; hits.set(key, c); if (c > limit) ok = false; }
      return ok;
    },
    async consumeCode(hash) {
      const p = pending.get(hash);
      if (!p || p.kind !== "code" || p.status !== "approved") return null;
      p.status = "used";
      if (Date.parse(p.expiresAt) <= opts.now()) return null;
      return { clientId: p.clientId, redirectUri: p.redirectUri!, challenge: p.challenge!, projectId: p.projectId!, userId: p.userId!, scopes: p.scopes, expiresAt: p.expiresAt };
    },
    async createSession(x) { const id = `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`; sessions.push({ id, ...x, revokedAt: null }); return id; },
    async sessionByAccess(h) { const x = sessions.find(y => y.accessHash === h); return x ? view(x) : null; },
    async rotateRefresh(old, next) {
      const reused = usedRefresh.get(old);
      if (reused) { const x = sessions.find(y => y.id === reused); if (x) x.revokedAt ??= new Date(opts.now()).toISOString(); return null; }
      const x = sessions.find(y => y.refreshHash === old);
      if (!x || x.revokedAt || Date.parse(x.refreshExpiresAt) <= opts.now()) return null;
      usedRefresh.set(old, x.id);
      Object.assign(x, next);
      return view(x);
    },
    async createDevice(d) { pending.set(d.deviceHash, { kind: "device", userCode: d.userCode, clientId: d.clientId, scopes: d.scopes, status: "pending", expiresAt: d.expiresAt }); },
    async pollDevice(h) {
      const p = pending.get(h);
      if (!p || p.kind !== "device" || p.status === "used") return null;
      if (Date.parse(p.expiresAt) <= opts.now()) return { status: "expired" };
      if (p.status !== "approved") return { status: p.status };
      p.status = "used";
      return { status: "approved", projectId: p.projectId!, userId: p.userId!, clientId: p.clientId, scopes: p.scopes };
    },
    async revokeByToken(h) { for (const x of sessions) if (x.accessHash === h || x.refreshHash === h) x.revokedAt ??= new Date(opts.now()).toISOString(); },
    async loadState() { return s; },
    async findTransfer(p, k) { return [...transfers.values()].find(t => t.projectId === p && t.idempotencyKey === k) ?? null; },
    async getTransfer(p, id) { const t = transfers.get(id); return t && t.projectId === p ? t : null; },
    async insertTransfer(t) { transfers.set(t.id, t); },
    async checkQuota(_p, bytes) { return bytes <= (opts.quotaBytes ?? Infinity); },
    async putChunk(id, i, b) { const m = chunks.get(id) ?? new Map(); m.set(i, b); chunks.set(id, m); },
    async chunkIndexes(id) { return [...(chunks.get(id)?.keys() ?? [])].sort((a, b) => a - b); },
    async readChunk(id, i) { return chunks.get(id)!.get(i)!; },
    async createCandidate(t, file, actor) {
      const variant = s.assetVariants[t.variantId]!;
      const versionId = `00000000-0000-4000-9000-${String(++n).padStart(12, "0")}`;
      const path = `${t.projectId}/${t.assetId}/${versionId}/${t.fileName}`;
      files.set(path, Uint8Array.from(file.bytes.flatMap(b => [...b])));
      const plan = planCandidate({ versionId, variantId: t.variantId, approvedVersionId: variant.approvedVersionId, baseVersionId: t.baseVersionId, media: { path, mimeType: file.mimeType, byteSize: t.byteSize, sha256: file.sha256, width: null, height: null }, note: `connector:${t.id}` });
      for (const command of plan.commands) {
        const r = applyCommand(s, { id: `00000000-0000-4000-a000-${String(++n).padStart(12, "0")}` as never, actor: actor as never, at: new Date(opts.now()).toISOString(), command });
        if (!r.ok) throw new Error(r.error.message);
        s = r.state;
      }
      let conflictId: string | null = null;
      if (plan.conflict) { conflictId = `c-${++n}`; conflicts.push({ id: conflictId, variantId: t.variantId, baseVersionId: t.baseVersionId, currentVersionId: variant.approvedVersionId, incomingVersionId: versionId, status: "open", revision: 1, choice: null }); }
      t.status = "candidate"; t.candidateVersionId = versionId; t.conflictId = conflictId;
      return { versionId, conflictId };
    },
    async setTransferStatus(id, st) { const t = transfers.get(id); if (t) t.status = st; },
    async listConflicts() { return conflicts; },
    async readFile(projectId, path) { return path.startsWith(projectId + "/") ? files.get(path) ?? null : null; },
    async resolveConflict(_p, _u, id, choice, revision) {
      if (!["keep_both", "choose_current", "reject"].includes(choice)) return "choice";
      const c = conflicts.find(x => x["id"] === id);
      if (!c) return "not_found";
      if (c["revision"] !== revision || c["status"] !== "open") return "stale";
      Object.assign(c, { status: choice === "reject" ? "rejected" : "resolved", choice, revision: revision + 1 });
      return "ok";
    },
  };
  return {
    store,
    get state() { return s; },
    files, sessions, transfers, chunks,
    /** Det nettlesersiden (connector_approve_code) gjør etter brukerens godkjenning. */
    approveCode(hash: string, p: { clientId: string; redirectUri: string; challenge: string; projectId: string; userId: string; scopes: string[] }) {
      pending.set(hash, { kind: "code", ...p, status: "approved", expiresAt: new Date(opts.now() + 120_000).toISOString() });
    },
    approveDevice(userCode: string, projectId: string, userId: string, approve = true) {
      const p = [...pending.values()].find(x => x.kind === "device" && x.userCode === userCode && x.status === "pending");
      if (!p) throw new Error("code");
      p.status = approve ? "approved" : "denied"; p.projectId = projectId; p.userId = userId;
    },
    revokeSession(id: string) { const x = sessions.find(y => y.id === id); if (x) x.revokedAt = new Date(opts.now()).toISOString(); },
  };
}
