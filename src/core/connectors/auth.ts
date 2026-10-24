/**
 * C-0 tilgang for Creative Connectors: OAuth 2.0 Authorization Code med PKCE (RFC 7636, bare S256) og
 * enhetsflyt (RFC 8628). Tokens er tilfeldige, kortlivede og gjelder ett prosjekt og bestemte scopes.
 * Serveren lagrer bare SHA-256 av tokenene. Ren TypeScript; tilfeldige byte gis inn av kalleren.
 */
import { base64Url, sha256Bytes, sha256Hex } from "./sha256";

export const CONNECTOR_SCOPES = [
  "project:read", "manifest:read", "assets:read", "panels:read",
  "transfers:write", "conflicts:read", "notes:write",
] as const;
export type ConnectorScope = (typeof CONNECTOR_SCOPES)[number];

export const ACCESS_TTL_SECONDS = 15 * 60;
export const REFRESH_TTL_SECONDS = 30 * 24 * 3600;
export const CODE_TTL_SECONDS = 120;
export const DEVICE_TTL_SECONDS = 600;
export const DEVICE_INTERVAL_SECONDS = 5;

export const TOKEN_PREFIX = { access: "ptgc_", refresh: "ptgr_", code: "ptga_", device: "ptgd_" } as const;
export type TokenKind = keyof typeof TOKEN_PREFIX;
const TOKEN_RE = /^ptg[crad]_[A-Za-z0-9_-]{43}$/;

/** Lager et token av 32 tilfeldige byte. */
export function makeToken(kind: TokenKind, random32: Uint8Array): string {
  // i18n-ignore: utviklerfeil
  if (random32.length !== 32) throw new Error("need 32 random bytes");
  return TOKEN_PREFIX[kind] + base64Url(random32);
}
export function tokenKind(token: string): TokenKind | null {
  if (!TOKEN_RE.test(token)) return null;
  return (Object.entries(TOKEN_PREFIX).find(([, p]) => token.startsWith(p))?.[0] as TokenKind | undefined) ?? null;
}
/** Det eneste som lagres. */
export const tokenHash = (token: string): string => sha256Hex(token);

/** RFC 7636: verifier 43–128 tegn av [A-Za-z0-9-._~]. */
export const VERIFIER_RE = /^[A-Za-z0-9\-._~]{43,128}$/;
export const CHALLENGE_RE = /^[A-Za-z0-9_-]{43}$/;
export const pkceChallenge = (verifier: string): string => base64Url(sha256Bytes(verifier));
export function pkceMatches(verifier: string, challenge: string): boolean {
  if (!VERIFIER_RE.test(verifier) || !CHALLENGE_RE.test(challenge)) return false;
  return constantTimeEqual(pkceChallenge(verifier), challenge);
}
export function constantTimeEqual(a: string, b: string): boolean {
  let d = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return d === 0;
}

/** Brukerkode for enhetsflyt: 8 tegn uten forvekslbare tegn, vist som XXXX-XXXX. */
const USER_ALPHABET = "BCDFGHJKLMNPQRSTVWXZ";
export function makeUserCode(random8: Uint8Array): string {
  const s = Array.from(random8.slice(0, 8), b => USER_ALPHABET[b % USER_ALPHABET.length]!).join("");
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}
export const normalizeUserCode = (code: string): string => code.toUpperCase().replace(/[^A-Z]/g, "").replace(/^(.{4})(.{4})$/, "$1-$2");
export const USER_CODE_RE = /^[BCDFGHJKLMNPQRSTVWXZ]{4}-[BCDFGHJKLMNPQRSTVWXZ]{4}$/;

export function parseScopes(raw: string): ConnectorScope[] | null {
  const list = raw.trim().split(/\s+/).filter(Boolean);
  if (list.length === 0 || list.length > CONNECTOR_SCOPES.length) return null;
  if (!list.every(s => (CONNECTOR_SCOPES as readonly string[]).includes(s))) return null;
  return [...new Set(list)] as ConnectorScope[];
}

/**
 * Registered clients (mirrors private.connector_clients in 0109). Unknown client IDs are refused. Redirects:
 * loopback http with a port (RFC 8252: 127.0.0.1 or [::1]) or the program's own scheme (ptg-<name>://).
 * No free https host without a registered pattern.
 */
const LOOPBACK = /^http:\/\/(127\.0\.0\.1|\[::1\]):[0-9]{1,5}(\/[^#]*)?$/;
const scheme = (name: string) => new RegExp(`^ptg-${name}:\\/\\/[^#]*$`);
export const CONNECTOR_CLIENTS: Readonly<Record<string, readonly RegExp[]>> = {
  "ptg.photoshop": [LOOPBACK, scheme("photoshop")],
  "ptg.premiere": [LOOPBACK, scheme("premiere")],
  "ptg.audition": [LOOPBACK, scheme("audition")],
  "ptg.illustrator": [LOOPBACK, scheme("illustrator")],
  "ptg.krita": [LOOPBACK, scheme("krita")],
  "ptg.blender": [LOOPBACK, scheme("blender")],
  "ptg.toonboom-sbpro": [LOOPBACK, scheme("toonboom-sbpro")],
  "ptg.generic-loopback": [LOOPBACK],
};
export const clientKnown = (clientId: string): boolean => Object.prototype.hasOwnProperty.call(CONNECTOR_CLIENTS, clientId);
export function redirectAllowed(uri: string, clientId: string): boolean {
  if (typeof uri !== "string" || uri.length > 500 || !clientKnown(clientId)) return false;
  return CONNECTOR_CLIENTS[clientId]!.some((re) => re.test(uri));
}
export const CLIENT_ID_RE = /^[a-z0-9][a-z0-9.-]{2,63}$/;

export interface ConnectorSessionRow {
  readonly id: string;
  readonly projectId: string;
  readonly userId: string;
  readonly clientId: string;
  readonly scopes: readonly string[];
  readonly expiresAt: string;
  readonly revokedAt: string | null;
}
export type SessionCheck = { ok: true } | { ok: false; reason: "missing" | "expired" | "revoked" | "scope" | "project" };

/** Én regel for alle API-kall: gyldig, ikke tilbaketrukket, riktig prosjekt og scope. */
export function checkSession(s: ConnectorSessionRow | null, nowMs: number, need: { scope: ConnectorScope; projectId?: string }): SessionCheck {
  if (!s) return { ok: false, reason: "missing" };
  if (s.revokedAt) return { ok: false, reason: "revoked" };
  if (Date.parse(s.expiresAt) <= nowMs) return { ok: false, reason: "expired" };
  if (need.projectId !== undefined && need.projectId !== s.projectId) return { ok: false, reason: "project" };
  if (!s.scopes.includes(need.scope)) return { ok: false, reason: "scope" };
  return { ok: true };
}
