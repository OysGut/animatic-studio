/**
 * C-1 return intake. One flow for the token return page and the signed-in return page, over a small
 * HandoffStore (Cloud: intake-store.server.ts; tests: an in-memory store). It reuses the C-0 rules:
 * whitelist + content sniff + SHA-256 (checkIntake), candidate via planCandidate (AddAssetVersion only),
 * conflicts against the revision base. Nothing is approved or shown automatically.
 */
import { applyCommand, newId, type Command, type ProjectState } from "@/core";
import { Sha256, checkIntake, mimeForExtension, planCandidate, readSbproReturn, planSbproReturn, toHex, MAX_TRANSFER_BYTES, type SbproCandidate } from "@/core/connectors";
import { FORMAT_FACTS, readStoredZip, recognizeReturn, fromUtf8, type HandoffFormat, type HandoffTarget } from "@/core/handoff";
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
  /** PSD returns: a displayable PNG from the PSD composite (null when it cannot be read). */
  previewFromPsd(bytes: Uint8Array, marker: string): Promise<{ png: Uint8Array; width: number; height: number } | null>;
  /** Runs each command through apply_changes as `actor`, returning the final state. */
  applyCommands(projectId: string, actor: string, state: ProjectState, commands: readonly Command[]): Promise<ProjectState>;
  insertConflict(c: { projectId: string; transferId: string; variantId: string; baseVersionId: string | null; currentVersionId: string | null; incomingVersionId: string }): Promise<string>;
  markHandoff(id: string, patch: { status: "returned" | "conflict"; transferId: string; candidateVersionId: string | null }): Promise<void>;
  /** C-5: lagrer en Storyboard Pro-retur som kandidatrader (idempotent på manifest-hash). */
  saveSbproReturn(r: { projectId: string; productionId: string; userId: string; hash: string; panelCount: number; candidates: readonly SbproCandidate[] }): Promise<{ returnId: string; uploads: { candidateId: string; key: string; sha256: string; byteSize: number }[] }>;
  putSbproImage(projectId: string, returnId: string, candidateId: string, bytes: Uint8Array): Promise<"ok" | "sha" | "done" | "not_found">;
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
  // En .ptgsb-pakke (lagret ZIP) er bare gyldig for et produksjonsmål; ellers gjelder den vanlige hvitelisten.
  if (h.format === "sbpro" ? !["ptgsb", "zip"].includes(extOf(f.fileName)) : !mimeForExtension(extOf(f.fileName))) throw new ReturnError("extension");
  if (!(await store.checkQuota(h.projectId, f.byteSize))) throw new ReturnError("quota");
  let assetId = h.assetId, variantId = h.variantId;
  if (h.targetKind === "panel") { assetId = random(); variantId = random(); }
  // Produksjonsreturer lager ingen ressurs på forhånd; kolonnene krever likevel en uuid.
  if (h.targetKind === "production") { assetId = random(); variantId = random(); }
  if (h.targetKind === "clip" && !variantId) {
    const st = await store.loadState(h.projectId);
    variantId = Object.values(st.assetVariants).find((v) => v.assetId === h.assetId && !v.archived)?.id ?? null;
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
  const all = new Uint8Array(t.byteSize); let o = 0; for (const p of parts) { all.set(p, o); o += p.length; }
  const rec = recognizeReturn({ bytes: all, linkHandoffId: how.linkHandoffId, knownHandoffIds: how.knownHandoffIds ?? [], outgoingNames: [h.fileName], fileName: t.fileName });
  if (!rec.ok) return reject(rec.reason);
  if (rec.handoffId !== h.id) return reject("mismatch");
  const sha256Of = (b: Uint8Array) => { const x = new Sha256(); x.update(b); return toHex(x.digest()); };

  // C-5: en .ptgsb-pakke til et produksjonsmål blir kandidatrader (tekst/timing/bilde/nye paneler/
  // sammenstilling), aldri en ressursversjon og aldri tatt i bruk. Bildene sjekkes mot manifestets SHA-256.
  if (h.format === "sbpro") {
    if (toHex(sha.digest()) !== t.sha256) return reject("checksum");
    const zip = readStoredZip(all);
    if (!zip.ok) return reject(zip.reason === "deflate" || zip.reason === "too-large" || zip.reason === "too-many" ? "format" : "content");
    const mf = zip.files.find((f) => f.path === "manifest.json");
    if (!mf) return reject("content");
    let parsed: unknown; try { parsed = JSON.parse(fromUtf8(mf.data)); } catch { return reject("content"); }
    const rr = readSbproReturn(parsed, mf.data.length);
    if (!rr.ok) return reject("content");
    if (rr.value.projectId !== h.projectId || rr.value.productionId !== h.targetId) return reject("mismatch");
    const retState = await store.loadState(h.projectId);
    const { candidates } = planSbproReturn(retState, h.targetId, rr.value);
    const saved = await store.saveSbproReturn({ projectId: h.projectId, productionId: h.targetId, userId: actor, hash: rr.value.hash, panelCount: rr.value.panels.length, candidates });
    const byKey = new Map(candidates.map((c) => [c.key, c]));
    for (const up of saved.uploads) {
      const c = byKey.get(up.key); if (!c?.image) continue;
      const file = zip.files.find((x) => x.path === c.image!.path); if (!file) continue;
      if (sha256Of(file.data) !== up.sha256) continue;
      await store.putSbproImage(h.projectId, saved.returnId, up.candidateId, file.data);
    }
    const hasConflict = candidates.some((c) => c.conflict);
    await store.setTransfer(t.id, { status: "candidate", candidateVersionId: saved.returnId, conflictId: null });
    await store.markHandoff(h.id, { status: hasConflict ? "conflict" : "returned", transferId: t.id, candidateVersionId: saved.returnId });
    await store.removeChunks(t);
    return { versionId: saved.returnId, conflictId: null, targetKind: h.targetKind, via: rec.via };
  }

  const check = checkIntake({ fileName: t.fileName, byteSize: t.byteSize, head: parts[0]!.slice(0, 16), declaredSha256: t.sha256, actualSha256: toHex(sha.digest()) });
  if (!check.ok) return reject(check.reason === "checksum" ? "checksum" : check.reason === "extension" ? "extension" : check.reason === "mismatch" ? "content" : check.reason === "content" ? "content" : "size");

  let state = await store.loadState(h.projectId);
  // The returned bytes are always kept unchanged as their own version. A PSD also gets a PNG preview
  // version (from its composite) so it can be shown, compared and used as an SB-7 sketch. Both are candidates.
  const isPanel = h.targetKind === "panel";
  const baseNote = { handoffId: h.id, transferId: t.id, ...(isPanel ? { panelId: h.targetId } : {}) };
  const originalId = newId<"assetVersion">();
  const originalPath = `${h.projectId}/${t.assetId}/${originalId}/${t.fileName}`;
  await store.uploadFile(originalPath, parts, check.mimeType);
  type V = { id: string; media: { path: string; mimeType: string; byteSize: number; sha256: string; width: number | null; height: number | null }; note: string };
  const versions: V[] = [];
  let versionId = originalId;
  if (check.extension === "psd") {
    const pv = await store.previewFromPsd(all, `ptg-handoff:v1:${h.id}`);
    versions.push({ id: originalId, media: { path: originalPath, mimeType: check.mimeType, byteSize: t.byteSize, sha256: t.sha256, width: pv?.width ?? null, height: pv?.height ?? null }, note: JSON.stringify({ kind: "handoff-original", ...baseNote }) });
    if (pv) {
      const pid = newId<"assetVersion">();
      const ppath = `${h.projectId}/${t.assetId}/${pid}/${t.fileName.replace(/\.[^.]+$/, "")}.png`;
      await store.uploadFile(ppath, [pv.png], "image/png");
      versions.push({ id: pid, media: { path: ppath, mimeType: "image/png", byteSize: pv.png.length, sha256: sha256Of(pv.png), width: pv.width, height: pv.height }, note: JSON.stringify({ kind: isPanel ? "sketch" : "handoff", source: "handoff", derivedFromVersionId: originalId, ...baseNote }) });
      versionId = pid;
    }
  } else {
    versions.push({ id: originalId, media: { path: originalPath, mimeType: check.mimeType, byteSize: t.byteSize, sha256: t.sha256, width: null, height: null }, note: JSON.stringify({ kind: isPanel ? "sketch" : "handoff", source: "handoff", ...baseNote }) });
  }
  const shownIsImage = versions.find((v) => v.id === versionId)!.media.mimeType !== "image/vnd.adobe.photoshop";
  let conflictId: string | null = null;
  if (isPanel) {
    const panel = state.compositions[h.targetId as never];
    if (!panel || panel.removed) return reject("target");
    const name = h.fileName.replace(/\.[^.]+$/, "");
    const commands: Command[] = [
      { type: "CreateAssets", assets: [{ assetId: t.assetId as never, fields: { kind: "other", name, names: [], description: "", category: "", tags: [] } }] } as Command,
      { type: "CreateAssetVariant", assetId: t.assetId as never, variantId: t.variantId as never, fields: { name, style: "other", appearance: "" } } as Command,
      ...versions.map((v) => ({ type: "AddAssetVersion", versionId: v.id as never, variantId: t.variantId as never, media: v.media, note: v.note }) as Command),
    ];
    state = await store.applyCommands(h.projectId, actor, state, commands);
    // Hidden candidate layer (SB-7 rule): nothing shows in the panel until the user turns it on.
    if (shownIsImage) state = await store.applyCommands(h.projectId, actor, state, [panelCandidateLayer(state, state.compositions[h.targetId as never]!, t.assetId, t.variantId, versionId)]);
    if (panel.revision !== h.baseRevision) conflictId = await store.insertConflict({ projectId: h.projectId, transferId: t.id, variantId: t.variantId, baseVersionId: null, currentVersionId: null, incomingVersionId: versionId });
  } else {
    const variant = state.assetVariants[t.variantId as never];
    if (!variant) return reject("target");
    let conflict = false;
    for (const v of versions) {
      const plan = planCandidate({ versionId: v.id, variantId: t.variantId, approvedVersionId: variant.approvedVersionId, baseVersionId: t.baseVersionId, media: v.media, note: v.note });
      state = await store.applyCommands(h.projectId, actor, state, plan.commands);
      conflict = conflict || plan.conflict;
    }
    if (conflict) conflictId = await store.insertConflict({ projectId: h.projectId, transferId: t.id, variantId: t.variantId, baseVersionId: t.baseVersionId, currentVersionId: variant.approvedVersionId, incomingVersionId: versionId });
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
