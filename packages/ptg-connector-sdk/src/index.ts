/**
 * From Pen to Glass Connector SDK (C-0). Alle plugins (UXP, ExtendScript-bro, iPad, DAW, CLI) bruker denne.
 * Plattformnøytral: `fetch`, tilfeldige byte og tokenlagring gis inn av verten. Ingen React, ingen
 * hemmeligheter i koden: klienten er offentlig (PKCE), og tokens lagres bare i vertens sikre lager.
 * Felles logikk (SHA-256, PKCE, manifestvalidering, bitstørrelse) kommer fra src/core/connectors, så
 * server og plugin regner likt.
 */
import { base64Url, sha256Hex, Sha256, toHex } from "../../../src/core/connectors/sha256";
import { pkceChallenge } from "../../../src/core/connectors/auth";
import { CHUNK_BYTES, chunkCount } from "../../../src/core/connectors/transfer";
import { validateManifest, type ConnectorManifest } from "../../../src/core/connectors/manifest";
import type { AuditionPlan } from "../../../src/core/connectors/audition-session";
import type { BlenderCameraPlan } from "../../../src/core/connectors/blender";

export type { ConnectorManifest };
/** C-7: delt, plattformnøytral SVG-/lenkemodell for Illustrator (CEP nå, UXP senere). */
export * as illustrator from "../../../src/core/connectors/illustrator-svg";
export interface TokenSet { accessToken: string; refreshToken: string; expiresAt: number; scope: string; projectId: string }
export interface TokenStore { load(): Promise<TokenSet | null>; save(t: TokenSet | null): Promise<void> }
export interface SdkOptions {
  baseUrl: string;            // f.eks. https://pentoglass.com
  clientId: string;           // offentlig klient-ID, ingen hemmelighet
  fetch: typeof fetch;
  random: (n: number) => Uint8Array;
  tokens: TokenStore;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}
export class ConnectorError extends Error {
  constructor(readonly status: number, readonly code: string) { super(code); }
}
export interface ConflictInfo { id: string; variantId: string; baseVersionId: string | null; currentVersionId: string | null; incomingVersionId: string; status: string; choice: string | null; revision: number }
export interface AssetInfo { id: string; kind: string; name: string; revision: number; variants: { id: string; name: string; approvedVersionId: string | null }[] }
export interface VersionInfo { id: string; variantId: string; number: number; mimeType: string; byteSize: number; sha256: string; approved: boolean; createdAt: string }
export interface PanelInfo { id: string; name: string; revision: number; occurrenceId: string | null; durationFrames: number; width: number; height: number }
export interface TransferInfo { id: string; status: string; chunkCount: number; missingChunks: number[]; candidateVersionId: string | null; conflictId: string | null }

export class PtgConnector {
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  constructor(private readonly o: SdkOptions) {
    this.now = o.now ?? (() => Date.now());
    this.sleep = o.sleep ?? (ms => new Promise(r => setTimeout(r, ms)));
  }

  // ---------- Innlogging ----------
  /** Steg 1 (PKCE): lag adressen brukeren åpner i nettleseren. Verifier og state beholdes lokalt. */
  beginAuthorization(redirectUri: string, scope: string): { url: string; verifier: string; state: string } {
    const verifier = base64Url(this.o.random(32)), state = base64Url(this.o.random(16));
    const u = new URL("/koble", this.o.baseUrl);
    u.searchParams.set("client_id", this.o.clientId);
    u.searchParams.set("redirect_uri", redirectUri);
    u.searchParams.set("response_type", "code");
    u.searchParams.set("code_challenge", pkceChallenge(verifier));
    u.searchParams.set("code_challenge_method", "S256");
    u.searchParams.set("scope", scope);
    u.searchParams.set("state", state);
    return { url: u.toString(), verifier, state };
  }
  /** Steg 2 (PKCE): bytt koden fra redirect mot tokens. State sjekkes mot CSRF. */
  async completeAuthorization(callbackUrl: string, expected: { verifier: string; state: string; redirectUri: string }): Promise<TokenSet> {
    const cb = new URL(callbackUrl);
    if (cb.searchParams.get("state") !== expected.state) throw new ConnectorError(400, "state_mismatch");
    const err = cb.searchParams.get("error"); if (err) throw new ConnectorError(400, err);
    return this.tokenRequest({ grant_type: "authorization_code", code: cb.searchParams.get("code") ?? "", code_verifier: expected.verifier, redirect_uri: expected.redirectUri, client_id: this.o.clientId });
  }
  /** Enhetsflyt for programmer uten nettleser: vis koden, så venter SDK-en til brukeren har godkjent. */
  async deviceLogin(scope: string, show: (d: { userCode: string; verificationUri: string; verificationUriComplete: string }) => void, signal?: { aborted: boolean }): Promise<TokenSet> {
    const d = await this.json<{ device_code: string; user_code: string; verification_uri: string; verification_uri_complete: string; interval: number; expires_in: number }>("POST", "/api/v1/oauth/device", { client_id: this.o.clientId, scope }, false);
    show({ userCode: d.user_code, verificationUri: d.verification_uri, verificationUriComplete: d.verification_uri_complete });
    let interval = d.interval * 1000;
    const until = this.now() + d.expires_in * 1000;
    while (this.now() < until && !signal?.aborted) {
      await this.sleep(interval);
      try { return await this.tokenRequest({ grant_type: "urn:ietf:params:oauth:grant-type:device_code", device_code: d.device_code, client_id: this.o.clientId }); }
      catch (e) {
        if (e instanceof ConnectorError && e.code === "authorization_pending") continue;
        if (e instanceof ConnectorError && e.code === "slow_down") { interval += 5000; continue; }
        throw e;
      }
    }
    throw new ConnectorError(400, "expired_token");
  }
  async logout(): Promise<void> {
    const t = await this.o.tokens.load();
    if (t) await this.raw("POST", "/api/v1/oauth/revoke", JSON.stringify({ token: t.refreshToken }), { "Content-Type": "application/json" }, false).catch(() => undefined);
    await this.o.tokens.save(null);
  }

  // ---------- Data ----------
  session() { return this.json<{ id: string; projectId: string; scopes: string[]; expiresAt: string }>("GET", "/api/v1/session"); }
  async manifest(projectId: string): Promise<ConnectorManifest> {
    const m = await this.json<unknown>("GET", `/api/v1/projects/${projectId}/manifest`);
    const r = validateManifest(m);
    if (!r.ok) throw new ConnectorError(502, "invalid_manifest");
    return r.manifest;
  }
  conflicts(projectId: string) { return this.json<{ conflicts: ConflictInfo[] }>("GET", `/api/v1/projects/${projectId}/conflicts`); }
  projects() { return this.json<{ projects: { id: string; name: string; revision: number }[] }>("GET", "/api/v1/projects"); }
  assets(projectId: string) { return this.json<{ assets: AssetInfo[] }>("GET", `/api/v1/projects/${projectId}/assets`); }
  versions(projectId: string, assetId: string) { return this.json<{ versions: VersionInfo[] }>("GET", `/api/v1/projects/${projectId}/assets/${assetId}/versions`); }
  panels(projectId: string) { return this.json<{ panels: PanelInfo[] }>("GET", `/api/v1/projects/${projectId}/panels`); }
  /** C-2: henter filen til en versjon og kontrollerer SHA-256 mot det serveren har lagret. */
  async download(projectId: string, assetId: string, versionId: string): Promise<{ bytes: Uint8Array; mimeType: string; sha256: string }> {
    const res = await this.raw("GET", `/api/v1/projects/${projectId}/assets/${assetId}/versions/${versionId}/file`, undefined, {});
    const bytes = new Uint8Array(await res.arrayBuffer());
    const sha256 = sha256Hex(bytes), declared = res.headers.get("x-content-sha256");
    if (declared && declared !== sha256) throw new ConnectorError(502, "checksum_mismatch");
    return { bytes, mimeType: res.headers.get("content-type") ?? "application/octet-stream", sha256 };
  }
  /**
   * C-2: konfliktvalg for den innloggede brukeren. «Behold begge» og «Behold gjeldende» (og avvis) skjer her;
   * «Bruk den nye» kaster `approve_in_app`, fordi bare brukerens egen godkjenning i appen bytter aktiv versjon.
   */
  resolveConflict(projectId: string, conflictId: string, choice: "keep_both" | "choose_current" | "choose_incoming" | "reject", revision: number) {
    return this.json<{ resolved: boolean; choice: string }>("POST", `/api/v1/projects/${projectId}/conflicts/${conflictId}/resolve`, { choice, revision });
  }

  /**
   * Sender en fil som ny kandidatversjon. Gjenopptakbar: samme idempotensnøkkel hopper over biter serveren
   * allerede har. Resultatet godkjennes aldri automatisk; `conflictId` vises for brukeren hvis satt.
   */
  async upload(projectId: string, file: { name: string; bytes: Uint8Array }, target: { assetId: string; variantId: string; baseVersionId: string | null }, idempotencyKey: string, onProgress?: (done: number, total: number) => void): Promise<TransferInfo> {
    const sha256 = sha256Hex(file.bytes);
    const t = await this.json<TransferInfo>("POST", `/api/v1/projects/${projectId}/transfers`, { fileName: file.name, byteSize: file.bytes.length, sha256, target: { assetId: target.assetId, variantId: target.variantId }, base: { versionId: target.baseVersionId } }, true, { "Idempotency-Key": idempotencyKey });
    if (t.status === "candidate") return t;
    const n = chunkCount(file.bytes.length);
    let done = n - t.missingChunks.length;
    for (const i of t.missingChunks) {
      const part = file.bytes.subarray(i * CHUNK_BYTES, Math.min(file.bytes.length, (i + 1) * CHUNK_BYTES));
      await this.withRetry(() => this.raw("PUT", `/api/v1/projects/${projectId}/transfers/${t.id}/chunks/${i}`, part, { "Content-Type": "application/octet-stream" }));
      onProgress?.(++done, n);
    }
    return this.json<TransferInfo>("POST", `/api/v1/projects/${projectId}/transfers/${t.id}/complete`, {});
  }
  /**
   * C-3: sender klipperytmen fra Premiere tilbake som forslag (manifest v1, adapter «adobe-premiere-uxp»).
   * Serveren lager ett forslag per endret panel; ingenting tas i bruk før brukeren godtar det i appen.
   * Samme manifest to ganger gir samme retur (idempotent).
   */
  sendPremiereReturn(projectId: string, manifest: ConnectorManifest) {
    return this.json<{ returnId: string; proposals: number; conflicts: number; missing: number; unknown: number }>("POST", `/api/v1/projects/${projectId}/premiere/returns`, manifest);
  }
  /**
   * C-6: lydplanen for én scene (sceneforekomst) eller ett panel til Audition: klipp med ressurs-, variant- og
   * versjons-ID, roller og markører for panel og replikk. Bare lesing.
   */
  auditionPlan(projectId: string, occurrenceId: string, panelId?: string | null) {
    const q = new URLSearchParams({ occurrenceId }); if (panelId) q.set("panelId", panelId);
    return this.json<AuditionPlan>("GET", `/api/v1/projects/${projectId}/audition/plan?${q}`);
  }
  /** C-8: SB-9-kameraene per panel for én scene (Blender). Bare lesing. */
  blenderCameras(projectId: string, occurrenceId: string) {
    return this.json<BlenderCameraPlan>("GET", `/api/v1/projects/${projectId}/blender/cameras?${new URLSearchParams({ occurrenceId })}`);
  }
  /** Stabil idempotensnøkkel for en fil og et mål (samme fil til samme mål gjenopptas). */
  static idempotencyKey(fileSha256: string, target: { variantId: string; baseVersionId: string | null }): string {
    return base64Url(new Sha256().update(new TextEncoder().encode(`${fileSha256}|${target.variantId}|${target.baseVersionId ?? ""}`)).digest()).slice(0, 43);
  }
  static checksum(bytes: Uint8Array): string { return toHex(new Sha256().update(bytes).digest()); }

  // ---------- Transport ----------
  private async tokenRequest(body: Record<string, string>): Promise<TokenSet> {
    const r = await this.json<{ access_token: string; refresh_token: string; expires_in: number; scope: string; project_id: string }>("POST", "/api/v1/oauth/token", body, false);
    const t: TokenSet = { accessToken: r.access_token, refreshToken: r.refresh_token, expiresAt: this.now() + r.expires_in * 1000, scope: r.scope, projectId: r.project_id };
    await this.o.tokens.save(t);
    return t;
  }
  private async bearer(): Promise<string> {
    let t = await this.o.tokens.load();
    if (!t) throw new ConnectorError(401, "not_signed_in");
    if (t.expiresAt - 30_000 <= this.now()) t = await this.tokenRequest({ grant_type: "refresh_token", refresh_token: t.refreshToken, client_id: this.o.clientId });
    return t.accessToken;
  }
  private async raw(method: string, path: string, body: BodyInit | Uint8Array | undefined, headers: Record<string, string>, auth = true): Promise<Response> {
    const h: Record<string, string> = { ...headers };
    if (auth) h["Authorization"] = `Bearer ${await this.bearer()}`;
    const init: RequestInit = { method, headers: h };
    if (body !== undefined) init.body = body as BodyInit;
    const res = await this.o.fetch(new URL(path, this.o.baseUrl).toString(), init);
    if (!res.ok) { const j = await res.json().catch(() => ({})) as { error?: string }; throw new ConnectorError(res.status, j.error ?? "http_" + res.status); }
    return res;
  }
  private async json<T>(method: string, path: string, body?: unknown, auth = true, headers: Record<string, string> = {}): Promise<T> {
    const res = await this.raw(method, path, body === undefined ? undefined : JSON.stringify(body), body === undefined ? headers : { "Content-Type": "application/json", ...headers }, auth);
    return (await res.json()) as T;
  }
  private async withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
    for (let i = 0; ; i++) {
      try { return await fn(); }
      catch (e) { if (i + 1 >= tries || (e instanceof ConnectorError && e.status < 500 && e.status !== 429)) throw e; await this.sleep(500 * 2 ** i); }
    }
  }
}

/** Minnelager for tokens (tester og kortlivede CLI-kjøringer). Verter bruker sitt sikre lager. */
export function memoryTokenStore(): TokenStore {
  let v: TokenSet | null = null;
  return { async load() { return v; }, async save(t) { v = t; } };
}
