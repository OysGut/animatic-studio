/**
 * B-114 C0: grunnmur for Community. Plattformnøytral modell og validering som speiler reglene i databasen
 * (migrasjon 0080). Databasen og serverfunksjonene håndhever; klienten bruker dette bare til å skjule og validere.
 */

/* ------------------------------------------------------------ funksjonsbrytere */

export const FEATURE_KEYS = [
  "community.sharing",
  "community.review",
  "community.abtest",
  "community.profiles",
  "community.public",
  "ui.test-languages",
] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];
export type FeatureState = "off" | "beta" | "on";
export const FEATURE_STATES: readonly FeatureState[] = ["off", "beta", "on"];

export const isFeatureKey = (v: unknown): v is FeatureKey =>
  typeof v === "string" && (FEATURE_KEYS as readonly string[]).includes(v);
export const isFeatureState = (v: unknown): v is FeatureState =>
  typeof v === "string" && (FEATURE_STATES as readonly string[]).includes(v);

/** Samme regel som private.feature_enabled: «på» for alle, «beta» bare for innloggede testere, «av» for ingen. */
export function featureEnabled(state: FeatureState, signedIn: boolean, isTester: boolean): boolean {
  if (state === "on") return true;
  if (state === "beta") return signedIn && isTester;
  return false;
}

/** Svaret fra my_features(): ukjente nøkler og verdier ignoreres; alt som mangler, er av. */
export function parseMyFeatures(v: unknown): Readonly<Record<FeatureKey, boolean>> {
  const out = Object.fromEntries(FEATURE_KEYS.map((k) => [k, false])) as Record<FeatureKey, boolean>;
  if (!v || typeof v !== "object" || Array.isArray(v)) return out;
  for (const [k, on] of Object.entries(v as Record<string, unknown>)) if (isFeatureKey(k)) out[k] = on === true;
  return out;
}

/* ------------------------------------------------------------ publiseringer */

export const SCOPE_KINDS = ["project", "production", "occurrence", "range", "variant", "take", "export"] as const;
export type ScopeKind = (typeof SCOPE_KINDS)[number];
export const AUDIENCES = ["private", "selected", "testgroup", "public"] as const;
export type Audience = (typeof AUDIENCES)[number];
export const PUBLICATION_STATUSES = ["draft", "scheduled", "live", "closed", "revoked"] as const;
export type PublicationStatus = (typeof PUBLICATION_STATUSES)[number];

export interface PublicationRights {
  readonly view: boolean;
  readonly comment: boolean;
  readonly download: boolean;
  readonly remix: boolean;
}
/** Standard i C0/C1: bare visning. */
export const DEFAULT_PUBLICATION_RIGHTS: PublicationRights = { view: true, comment: false, download: false, remix: false };

export interface PublicationWindow {
  readonly status: PublicationStatus;
  readonly publishAt: string | null;
  readonly expiresAt: string | null;
}

/** Samme regel som private.publication_open: planlagt eller publisert, innenfor tidsvinduet. */
export function publicationOpen(p: PublicationWindow, now: number): boolean {
  if (p.status !== "live" && p.status !== "scheduled") return false;
  if (p.publishAt !== null && Date.parse(p.publishAt) > now) return false;
  if (p.expiresAt !== null && Date.parse(p.expiresAt) <= now) return false;
  return true;
}

export interface PublicationDraft {
  readonly scopeKind: string;
  readonly audience: string;
  readonly title: string;
  readonly description: string;
  readonly publishAt: string | null;
  readonly expiresAt: string | null;
}

/** Feilnøkkel eller null. Offentlig publik krever i tillegg community.public (sjekkes i databasen). */
export function publicationError(p: PublicationDraft): string | null {
  if (!(SCOPE_KINDS as readonly string[]).includes(p.scopeKind)) return "community.error.scope";
  if (!(AUDIENCES as readonly string[]).includes(p.audience)) return "community.error.audience";
  const title = p.title.trim();
  if (title.length < 1 || title.length > 200) return "community.error.title";
  if (p.description.length > 5000) return "community.error.description";
  if (p.publishAt !== null && p.expiresAt !== null && Date.parse(p.expiresAt) <= Date.parse(p.publishAt))
    return "community.error.window";
  return null;
}

/** Mediefiler til en publisering ligger alltid under <prosjekt>/shares/ og kan aldri peke ut av mappen. */
export function publicationMediaKeyValid(projectId: string, key: string): boolean {
  return key.startsWith(`${projectId}/shares/`) && !key.includes("..") && key.length <= 500;
}

/* ------------------------------------------------------------ kommentarer */

export const COMMENT_CATEGORIES = ["general", "story", "animation", "sound", "timing", "technical", "other"] as const;
export type CommentCategory = (typeof COMMENT_CATEGORIES)[number];

export interface CommentRegion {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface CommentDraft {
  readonly atMs: number;
  readonly frame: number | null;
  readonly region: CommentRegion | null;
  readonly category: string;
  readonly text: string;
}

/** Regionen er normalisert (0–1) i bildet. */
export function regionValid(r: CommentRegion): boolean {
  const ok = (n: number) => Number.isFinite(n) && n >= 0 && n <= 1;
  return ok(r.x) && ok(r.y) && ok(r.width) && ok(r.height) && r.x + r.width <= 1 && r.y + r.height <= 1;
}

export function commentError(c: CommentDraft): string | null {
  if (!Number.isInteger(c.atMs) || c.atMs < 0) return "community.error.time";
  if (c.frame !== null && (!Number.isInteger(c.frame) || c.frame < 0)) return "community.error.time";
  if (c.region !== null && !regionValid(c.region)) return "community.error.region";
  if (!(COMMENT_CATEGORIES as readonly string[]).includes(c.category)) return "community.error.category";
  const text = c.text.trim();
  if (text.length < 1 || text.length > 5000) return "community.error.text";
  return null;
}

/** Hvem kan kommentere: prosjektets redaktører, eller en mottaker når publiseringen gir kommentarrett. */
export function canComment(o: { isEditor: boolean; canSee: boolean; rights: PublicationRights; blocked: boolean }): boolean {
  if (!o.canSee || o.blocked) return false;
  return o.isEditor || o.rights.comment;
}

/* ------------------------------------------------------------ profil */

export const HANDLE_RE = /^[a-z0-9_]{3,30}$/;
export const BIO_MAX = 1000;

export function handleValid(h: string): boolean {
  return HANDLE_RE.test(h);
}
/** Brukeren kan skrive med store bokstaver og @; lagres alltid normalisert. */
export function normalizeHandle(input: string): string {
  return input.trim().replace(/^@/, "").toLowerCase();
}

/* ------------------------------------------------------------ rettigheter på ressurser */

export interface AssetRights {
  readonly source?: string;
  readonly license?: string;
  readonly attribution?: string;
  readonly shareable?: boolean;
  readonly adaptable?: boolean;
}
const RIGHTS_TEXT: readonly (keyof AssetRights)[] = ["source", "license", "attribution"];
const RIGHTS_FLAGS: readonly (keyof AssetRights)[] = ["shareable", "adaptable"];

/** Speiler private.valid_asset_rights. null = privat, alle rettigheter forbeholdt. */
export function assetRightsValid(v: unknown): v is AssetRights | null {
  if (v === null) return true;
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    if ((RIGHTS_TEXT as readonly string[]).includes(k)) {
      if (typeof x !== "string" || x.length > 500) return false;
    } else if ((RIGHTS_FLAGS as readonly string[]).includes(k)) {
      if (typeof x !== "boolean") return false;
    } else return false;
  }
  return true;
}

/** Hva som faktisk er tillatt: mangler rettigheter, er alt forbeholdt. */
export function effectiveAssetRights(r: AssetRights | null | undefined): { shareable: boolean; adaptable: boolean } {
  return { shareable: r?.shareable === true, adaptable: r?.adaptable === true };
}

/* ------------------------------------------------------------ rapportering */

export const REPORT_TARGETS = ["publication", "comment", "profile", "user"] as const;
export const REPORT_REASONS = ["spam", "abuse", "copyright", "privacy", "other"] as const;
export const REPORT_STATUSES = ["open", "dismissed", "actioned"] as const;
