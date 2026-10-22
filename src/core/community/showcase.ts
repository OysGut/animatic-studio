/**
 * B-116: utstillingsvindu. Plattformnøytral modell og validering som speiler reglene i databasen
 * (migrasjon 0087). Databasen og serverfunksjonene håndhever; klienten bruker dette til å skjule,
 * validere og tolke svar.
 */

export const SHOWCASE_KINDS = ["character", "asset", "scene", "script", "audio"] as const;
export type ShowcaseKind = (typeof SHOWCASE_KINDS)[number];
export const isShowcaseKind = (v: unknown): v is ShowcaseKind =>
  typeof v === "string" && (SHOWCASE_KINDS as readonly string[]).includes(v);

export const SHOWCASE_STATUSES = ["pending", "live", "rejected", "revoked"] as const;
export type ShowcaseStatus = (typeof SHOWCASE_STATUSES)[number];

export const SHOWCASE_TITLE_MAX = 200;
export const SHOWCASE_TEXT_MAX = 2000;
export const SHOWCASE_EXCERPT_MAX = 1000;
export const SHOWCASE_DEFAULT_DAYS = 7;
export const SHOWCASE_MAX_DAYS = 90;

export interface ShowcaseDraft {
  readonly kind: string;
  readonly title: string;
  readonly text: string;
  readonly excerpt: string;
  /** Om bidraget har en mediefil (alt unntatt manusutdrag krever det). */
  readonly hasMedia: boolean;
  readonly expiresAt: string | null;
}

/** Standard utløp: én uke fra nå. */
export function showcaseDefaultExpires(now: number): string {
  return new Date(now + SHOWCASE_DEFAULT_DAYS * 86_400_000).toISOString();
}

/** Feilnøkkel eller null (samme regler som create_showcase_item i 0087). */
export function showcaseDraftError(d: ShowcaseDraft, now: number): string | null {
  if (!isShowcaseKind(d.kind)) return "showcase.error.kind";
  const title = d.title.trim();
  if (title.length < 1 || title.length > SHOWCASE_TITLE_MAX) return "showcase.error.title";
  if (d.text.length > SHOWCASE_TEXT_MAX) return "showcase.error.text";
  const excerpt = d.excerpt.trim();
  if (d.kind === "script" && (excerpt.length < 1 || excerpt.length > SHOWCASE_EXCERPT_MAX))
    return "showcase.error.excerpt";
  if (d.kind !== "script" && !d.hasMedia) return "showcase.error.media";
  if (d.expiresAt !== null) {
    const t = Date.parse(d.expiresAt);
    if (!Number.isFinite(t) || t <= now || t > now + SHOWCASE_MAX_DAYS * 86_400_000)
      return "showcase.error.expires";
  }
  return null;
}

export interface ShowcaseItem {
  readonly id: string;
  readonly kind: ShowcaseKind;
  readonly title: string;
  readonly text: string;
  readonly excerpt: string | null;
  readonly storageKey: string | null;
  readonly mime: string | null;
  readonly durationMs: number | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly createdAt: string;
  readonly authorName: string;
  /** Signert lenke fylles inn av serverfunksjonen; aldri en direkte prosjektfil. */
  readonly url: string | null;
}

const str = (v: unknown) => (typeof v === "string" && v ? v : null);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Tåler ukjente felt: ukjente rader droppes, manglende felter får trygge standarder. */
export function parseShowcaseItem(v: unknown): ShowcaseItem | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const r = v as Record<string, unknown>;
  if (typeof r["id"] !== "string" || !isShowcaseKind(r["kind"]) || typeof r["title"] !== "string") return null;
  return {
    id: r["id"],
    kind: r["kind"],
    title: r["title"],
    text: typeof r["text"] === "string" ? r["text"] : "",
    excerpt: str(r["excerpt"]),
    storageKey: str(r["storage_key"]),
    mime: str(r["mime"]),
    durationMs: num(r["duration_ms"]),
    width: num(r["width"]),
    height: num(r["height"]),
    createdAt: typeof r["created_at"] === "string" ? r["created_at"] : "",
    authorName: str(r["author_name"]) ?? "",
    url: null,
  };
}

export function parseShowcaseFeed(v: unknown): readonly ShowcaseItem[] {
  if (!Array.isArray(v)) return [];
  return v.map(parseShowcaseItem).filter((x): x is ShowcaseItem => x !== null);
}

/** Statusen brukeren ser på «Mine delinger»: utløpt regnes ut fra tiden, lagres ikke. */
export type ShowcaseDisplayStatus = ShowcaseStatus | "expired";
export function showcaseDisplayStatus(
  item: { status: string; expiresAt: string | null },
  now: number,
): ShowcaseDisplayStatus {
  if (item.status === "live" && item.expiresAt !== null && Date.parse(item.expiresAt) <= now)
    return "expired";
  return (SHOWCASE_STATUSES as readonly string[]).includes(item.status)
    ? (item.status as ShowcaseStatus)
    : "pending";
}

export interface MyShowcaseItem extends ShowcaseItem {
  readonly projectId: string;
  readonly projectName: string;
  readonly status: ShowcaseDisplayStatus;
  readonly expiresAt: string | null;
}

export function parseMyShowcaseItems(v: unknown, now: number): readonly MyShowcaseItem[] {
  if (!Array.isArray(v)) return [];
  const out: MyShowcaseItem[] = [];
  for (const raw of v) {
    const base = parseShowcaseItem(raw);
    if (!base || !raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    out.push({
      ...base,
      projectId: typeof r["project_id"] === "string" ? r["project_id"] : "",
      projectName: str(r["project_name"]) ?? "",
      status: showcaseDisplayStatus(
        { status: typeof r["status"] === "string" ? r["status"] : "", expiresAt: str(r["expires_at"]) },
        now,
      ),
      expiresAt: str(r["expires_at"]),
    });
  }
  return out;
}

export interface ShowcaseComment {
  readonly id: string;
  readonly text: string;
  readonly createdAt: string;
  readonly authorName: string;
  readonly mine: boolean;
}

export function parseShowcaseComments(v: unknown): readonly ShowcaseComment[] {
  if (!Array.isArray(v)) return [];
  const out: ShowcaseComment[] = [];
  for (const raw of v) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const r = raw as Record<string, unknown>;
    if (typeof r["id"] !== "string" || typeof r["text"] !== "string") continue;
    out.push({
      id: r["id"],
      text: r["text"],
      createdAt: typeof r["created_at"] === "string" ? r["created_at"] : "",
      authorName: str(r["author_name"]) ?? "",
      mine: r["mine"] === true,
    });
  }
  return out;
}

/** Kommentarteksten: 1–2000 tegn (samme grense som showcase_comments i 0087). */
export function showcaseCommentError(text: string): string | null {
  const t = text.trim();
  return t.length < 1 || t.length > 2000 ? "showcase.error.comment" : null;
}

/** Filnøkkelen til et bidrag ligger alltid under <prosjekt>/shares/ (samme regel som publicationMediaKeyValid). */
export function showcaseMediaKeyValid(projectId: string, key: string): boolean {
  return key.startsWith(`${projectId}/shares/`) && !key.includes("..") && key.length <= 500;
}

export interface AdminShowcaseQueue {
  readonly requireApproval: boolean;
  readonly items: readonly (ShowcaseItem & { projectName: string })[];
}

export function parseAdminShowcaseQueue(v: unknown): AdminShowcaseQueue {
  const empty: AdminShowcaseQueue = { requireApproval: true, items: [] };
  if (!v || typeof v !== "object" || Array.isArray(v)) return empty;
  const r = v as Record<string, unknown>;
  const items: (ShowcaseItem & { projectName: string })[] = [];
  for (const raw of Array.isArray(r["items"]) ? r["items"] : []) {
    const base = parseShowcaseItem(raw);
    if (!base || !raw || typeof raw !== "object") continue;
    items.push({ ...base, projectName: str((raw as Record<string, unknown>)["project_name"]) ?? "" });
  }
  return { requireApproval: r["require_approval"] !== false, items };
}
