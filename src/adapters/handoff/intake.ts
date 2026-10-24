/**
 * C-1 return intake. One flow for the token return page and the signed-in return page, over a small
 * HandoffStore (Cloud: intake-store.server.ts; tests: an in-memory store). It reuses the C-0 rules:
 * whitelist + content sniff + SHA-256 (checkIntake), candidate via planCandidate (AddAssetVersion only),
 * conflicts against the revision base. Nothing is approved or shown automatically.
 */
import { applyCommand, newId, type Command, type ProjectState } from "@/core";
import { Sha256, checkIntake, mimeForExtension, planCandidate, toHex, MAX_TRANSFER_BYTES } from "@/core/connectors";
import { FORMAT_FACTS, recognizeReturn, type HandoffFormat, type HandoffTarget } from "@/core/handoff";
import { panelCandidateLayer } from "@/core/storyboard/ai";

export const RETURN_CHUNK_BYTES = 4 * 1024 * 1024;
export const returnChunkCount = (size: number) => Math.max(1, Math.ceil(size / RETURN_CHUNK_BYTES));
export const returnChunkSize = (size: number, i: number) => (i < returnChunkCount(size) - 1 ? RETURN_CHUNK_BYTES : size - RETURN_CHUNK_BYTES * (returnChunkCount(size) - 1));

export interface HandoffRecord {
  readonly id: string; readonly projectId: string; readonly createdBy: string;
  readonly targetKind: HandoffTarget; readonly targetId: string;
  readonly assetId: string | null; readonly variantId: string | null; readonly sceneId: string | null;
  readonly baseVersionId: string | null; readonly baseRevision: number;
  readonly format: HandoffFormat; readonly fileName: string; readonly expiresAt: string; readonly status: string;
}
export interface ReturnTransfer {
  readonly id: string; readonly projectId: string; readonly handoffId: string; readonly sender: string;
  readonly fileName: string; readonly byteSize: number; readonly sha256: string;
  readonly assetId: string; readonly variantId: string; readonly baseVersionId: string | null;
  status: "reserved" | "candidate" | "rejected"; candidateVersionId: string | null; conflictId: string | null;
}
export interface HandoffStore {
  rateLimit(scope: string, keys: string[]): Promise<boolean>;
  byToken(hash: string): Promise<HandoffRecord | null>;
  getTransfer(id: string): Promise<ReturnTransfer | null>;
  insertTransfer(t: ReturnTransfer, idempotencyKey: string): Promise<void>;
  setTransfer(id: string, patch: Partial<Pick<ReturnTransfer, "status" | "candidateVersionId" | "conflictId">>): Promise<void>;
  checkQuota(projectId: string, bytes: number): Promise<boolean>;
  putChunk(t: ReturnTransfer, i: number, bytes: Uint8Array): Promise<void>;
  chunkIndexes(t: ReturnTransfer): Promise<number[]>;
  readChunk(t: ReturnTransfer, i: number): Promise<Uint8Array>;
  removeChunks(t: ReturnTransfer): Promise<void>;
  loadState(projectId: string): Promise<ProjectState>;
  uploadFile(path: string, parts: Uint8Array[], mimeType: string): Promise<void>;
  /** Runs each command through apply_changes as `actor`, returning the final state. */
  applyCommands(projectId: string, actor: string, state: ProjectState, commands: readonly Command[]): Promise<ProjectState>;
  insertConflict(c: { projectId: string; transferId: string; variantId: string; baseVersionId: string | null; currentVersionId: string | null; incomingVersionId: string }): Promise<string>;
  markHandoff(id: string, patch: { status: "returned" | "conflict"; transferId: string; candidateVersionId: string }): Promise<void>;
}

export class ReturnError extends Error {
  constructor(readonly code: "unavailable" | "format" | "size" | "checksum" | "extension" | "content" | "mismatch" | "filename_only" | "unknown" | "incomplete" | "quota" | "rate" | "target" | "chunk") { super(code); }
}
const SHA_RE = /^[0-9a-f]{64}$/, KEY_RE = /^[A-Za-z0-9_-]{16,128}$/;
const extOf = (n: string) => (/\.([A-Za-z0-9]{1,8})$/.exec(n)?.[1] ?? "").toLowerCase();

export function handoffOpen(h: HandoffRecord | null, nowMs: number): h is HandoffRecord {
  return !!h && Date.parse(h.expiresAt) > nowMs && (h.status === "out" || h.status === "returned" || h.status === "conflict");
}

export async function beginReturn(store: HandoffStore, h: HandoffRecord, actor: string, f: { fileName: string; byteSize: number; sha256: string; idempotencyKey: string }, random: () => string = () => crypto.randomUUID()): Promise<ReturnTransfer> {
  if (!FORMAT_FACTS[h.format].returnable || h.targetKind === "scene") throw new ReturnError("format");
  if (!KEY_RE.test(f.idempotencyKey) || !SHA_RE.test(f.sha256) || typeof f.fileName !== "string" || f.fileName.length < 1 || f.fileName.length > 255 || /[\\/]/.test(f.fileName)) throw new ReturnError("unknown");
  if (!Number.isInteger(f.byteSize) || f.byteSize < 1 || f.byteSize > MAX_TRANSFER_BYTES) throw new ReturnError("size");
  if (!mimeForExtension(extOf(f.fileName))) throw new ReturnError("extension");
  if (!(await store.checkQuota(h.projectId, f.byteSize))) throw new ReturnError("quota");
  let assetId = h.assetId, variantId = h.variantId;
  if (h.targetKind === "panel") { assetId = random(); variantId = random(); }
  if (h.targetKind === "clip" && !variantId) {
    const st = await store.loadState(h.projectId);
    variantId = Object.values(st.assetVariants).find((v) => v.assetId === h.assetId && !v.removed)?.id ?? null;
  }
  if (!assetId || !variantId) throw new ReturnError("target");
  const t: ReturnTransfer = { id: random(), projectId: h.projectId, handoffId: h.id, sender: actor, fileName: f.fileName, byteSize: f.byteSize, sha256: f.sha256, assetId, variantId, baseVersionId: h.baseVersionId, status: "reserved", candidateVersionId: null, conflictId: null };
  await store.insertTransfer(t, f.idempotencyKey);
  return t;
}

export async function putReturnChunk(store: HandoffStore, t: ReturnTransfer, index: number, bytes: Uint8Array): Promise<void> {
  if (t.status !== "reserved") throw new ReturnError("unavailable");
  if (!Number.isInteger(index) || index < 0 || index >= returnChunkCount(t.byteSize) || bytes.length !== returnChunkSize(t.byteSize, index)) throw new ReturnError("chunk");
  await store.putChunk(t, index, bytes);
}

export interface ReturnResult { readonly versionId: string; readonly conflictId: string | null; readonly targetKind: HandoffTarget; readonly via: string }

export async function finishReturn(store: HandoffStore, h: HandoffRecord, t: ReturnTransfer, actor: string, how: { linkHandoffId: string | null; knownHandoffIds?: readonly string[] }, nowIso = new Date().toISOString()): Promise<ReturnResult> {
  if (t.handoffId !== h.id) throw new ReturnError("mismatch");
  if (t.status === "candidate" && t.candidateVersionId) return { versionId: t.candidateVersionId, conflictId: t.conflictId, targetKind: h.targetKind, via: "replay" };
  if (t.status !== "reserved") throw new ReturnError("unavailable");
  const have = new Set(await store.chunkIndexes(t));
  for (let i = 0; i < returnChunkCount(t.byteSize); i++) if (!have.has(i)) throw new ReturnError("incomplete");
  const parts: Uint8Array[] = [], sha = new Sha256();
  for (let i = 0; i < returnChunkCount(t.byteSize); i++) { const p = await store.readChunk(t, i); parts.push(p); sha.update(p); }
  const reject = async (code: ReturnError["code"]) => { await store.setTransfer(t.id, { status: "rejected" }); await store.removeChunks(t); throw new ReturnError(code); };
  const check = checkIntake({ fileName: t.fileName, byteSize: t.byteSize, head: parts[0]!.slice(0, 16), declaredSha256: t.sha256, actualSha256: toHex(sha.digest()) });
  if (!check.ok) return reject(check.reason === "checksum" ? "checksum" : check.reason === "extension" ? "extension" : check.reason === "mismatch" ? "content" : check.reason === "content" ? "content" : "size");
  const all = new Uint8Array(t.byteSize); let o = 0; for (const p of parts) { all.set(p, o); o += p.length; }
  const rec = recognizeReturn({ bytes: all, linkHandoffId: how.linkHandoffId, knownHandoffIds: how.knownHandoffIds ?? [], outgoingNames: [h.fileName], fileName: t.fileName });
  if (!rec.ok) return reject(rec.reason);
  if (rec.handoffId !== h.id) return reject("mismatch");

  let state = await store.loadState(h.projectId);
  const versionId = newId<"assetVersion">();
  const path = `${h.projectId}/${t.assetId}/${versionId}/${t.fileName}`;
  await store.uploadFile(path, parts, check.mimeType);
  const media = { path, mimeType: check.mimeType, byteSize: t.byteSize, sha256: t.sha256, width: null, height: null };
  const note = JSON.stringify({ kind: "handoff", handoffId: h.id, transferId: t.id, ...(h.targetKind === "panel" ? { panelId: h.targetId, sketch: true } : {}) });
  let conflictId: string | null = null;
  if (h.targetKind === "panel") {
    const panel = state.compositions[h.targetId as never];
    if (!panel || panel.removed) return reject("target");
    const name = h.fileName.replace(/\.[^.]+$/, "");
    const commands: Command[] = [
      { type: "CreateAssets", assets: [{ assetId: t.assetId as never, fields: { kind: "other", name, names: [], description: "", category: "", tags: [] } }] } as Command,
      { type: "CreateAssetVariant", assetId: t.assetId as never, variantId: t.variantId as never, fields: { name, style: "other", appearance: "" } } as Command,
      { type: "AddAssetVersion", versionId: versionId as never, variantId: t.variantId as never, media, note } as Command,
    ];
    state = await store.applyCommands(h.projectId, actor, state, commands);
    const layer = panelCandidateLayer(state, state.compositions[h.targetId as never]!, t.assetId, t.variantId, versionId);
    state = await store.applyCommands(h.projectId, actor, state, [layer]);
    if (panel.revision !== h.baseRevision) conflictId = await store.insertConflict({ projectId: h.projectId, transferId: t.id, variantId: t.variantId, baseVersionId: null, currentVersionId: null, incomingVersionId: versionId });
  } else {
    const variant = state.assetVariants[t.variantId as never];
    if (!variant || variant.removed) return reject("target");
    const plan = planCandidate({ versionId, variantId: t.variantId, approvedVersionId: variant.approvedVersionId, baseVersionId: t.baseVersionId, media, note });
    state = await store.applyCommands(h.projectId, actor, state, plan.commands);
    if (plan.conflict) conflictId = await store.insertConflict({ projectId: h.projectId, transferId: t.id, variantId: t.variantId, baseVersionId: t.baseVersionId, currentVersionId: variant.approvedVersionId, incomingVersionId: versionId });
  }
  void nowIso;
  await store.setTransfer(t.id, { status: "candidate", candidateVersionId: versionId, conflictId });
  await store.markHandoff(h.id, { status: conflictId ? "conflict" : "returned", transferId: t.id, candidateVersionId: versionId });
  await store.removeChunks(t);
  return { versionId, conflictId, targetKind: h.targetKind, via: rec.via };
}

/** Shared check used by applyCommands implementations: the command must apply locally first. */
export function applyLocally(state: ProjectState, actor: string, command: Command) {
  const r = applyCommand(state, { id: newId<"command">(), actor: actor as never, at: new Date().toISOString(), command });
  if (!r.ok) throw new Error(r.error.message);
  return r;
}
