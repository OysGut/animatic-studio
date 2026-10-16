/**
 * «Mobilimport» i ressursbiblioteket (fase 2, bolk A, DEC-0090, REQ-0676/0682/0683): alle filer fra mobilbroen
 * med filter for type, dato, importøkt, kobling og bidragsyter. Bilder har miniatyr, video og lyd kan spilles.
 * Originalene bevares; ingenting godkjent overskrives. Lenkene kan tilbakekalles her.
 */
import { EyeOff, Eye, Link2Off } from "lucide-react";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  L,
  formatDate,
  formatHeading,
  parseUploadContext,
  sceneNumberOf,
  type ProjectState,
} from "@/core";
import {
  dismissMobileImport,
  revokeUploadSession,
  type MobileImportRow,
  type UploadSessionRow,
} from "@/adapters/browser/mobile-import";
import { ASSET_BUCKET, createSignedUrls } from "@/adapters/browser/storage-files";
import { Button } from "@/components/ui/button";
import { useMobileImports, useUploadSessions } from "./use-mobile-imports";

type KindFilter = "all" | "image" | "video" | "audio";
type DateFilter = "all" | "1" | "7" | "30";
type LinkFilter = "all" | "linked" | "unlinked";

/** Hva filen er knyttet til, i klartekst. */
export function contextLabel(s: ProjectState, row: MobileImportRow): string {
  const c = parseUploadContext(row.context);
  const assetId = row.asset_id ?? (c && "assetId" in c ? c.assetId : undefined);
  if (assetId && s.assets[assetId]) return s.assets[assetId]!.name;
  if (c?.type === "occurrence") {
    const o = s.occurrences[c.occurrenceId as never];
    const v = o ? s.variants[o.variantId] : undefined;
    if (o && v)
      return `${L("Scene", "Scene")} ${sceneNumberOf(s, o) ?? ""} ${formatHeading(v.heading)}`;
  }
  if (c?.type === "draft") return L("Ny ressurs (ikke lagret)", "New asset (not saved)");
  return L("Prosjektet", "The project");
}

function isLinked(r: MobileImportRow): boolean {
  return !!(r.asset_version_id || r.take_id || r.asset_id);
}

export function MobileImportLibrary({
  state,
  projectId,
  editable,
  onOpenAsset,
}: {
  state: ProjectState;
  projectId: string;
  editable: boolean;
  onOpenAsset: (assetId: string) => void;
}) {
  const imports = useMobileImports(projectId);
  const sessions = useUploadSessions(projectId);
  const [kind, setKind] = useState<KindFilter>("all");
  const [days, setDays] = useState<DateFilter>("all");
  const [session, setSession] = useState("");
  const [link, setLink] = useState<LinkFilter>("all");
  const [contributor, setContributor] = useState("");
  const [showHidden, setShowHidden] = useState(false);
  const sessionById = useMemo(
    () => new Map((sessions.data ?? []).map((s) => [s.id, s] as const)),
    [sessions.data],
  );
  const all = imports.data ?? [];
  const contributors = useMemo(
    () => [...new Set(all.map((r) => r.contributor_name).filter(Boolean))].sort(),
    [all],
  );
  const shown = all.filter((r) => {
    if (r.status !== "done") return false;
    if (!showHidden && r.dismissed) return false;
    if (kind !== "all" && r.kind !== kind) return false;
    if (days !== "all" && Date.now() - Date.parse(r.created_at) > Number(days) * 86_400_000)
      return false;
    if (session && r.session_id !== session && sessionById.get(r.session_id)?.parent_id !== session)
      return false;
    if (link === "linked" && !isLinked(r)) return false;
    if (link === "unlinked" && isLinked(r)) return false;
    if (contributor && r.contributor_name !== contributor) return false;
    return true;
  });
  const urls = useQuery({
    queryKey: ["mobile-import-urls", shown.map((r) => r.path).join("|")],
    enabled: shown.length > 0,
    staleTime: 50 * 60_000,
    queryFn: async () => {
      const out: Record<string, string> = {};
      const paths = shown.slice(0, 200).map((r) => r.path);
      for (const d of await createSignedUrls(ASSET_BUCKET, paths, 3600)) out[d.path] = d.signedUrl;
      return out;
    },
  });
  if (imports.data === null)
    return (
      <p className="p-6 text-[13px] text-text-secondary">
        {L(
          "Databasen mangler mobilimport. Den må oppdateres (migrasjon 0035).",
          "The database is missing mobile import. It must be updated (migration 0035).",
        )}
      </p>
    );
  const select =
    "h-7 rounded-sm border border-border-control bg-surface-3 px-1.5 text-xs text-text-primary";
  const roots = (sessions.data ?? []).filter((s) => s.kind === "personal");
  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-4 p-6" data-testid="mobile-library">
      <div>
        <h2 className="text-base font-semibold text-text-primary">
          {L("Mobilimport", "Mobile import")}
        </h2>
        <p className="mt-1 text-xs text-text-secondary">
          {L(
            "Alt som er tatt eller valgt på mobil – også av andre via delte lenker. Bilder tatt for en ressurs er lagt inn som nye versjoner (ikke godkjent).",
            "Everything taken or chosen on a phone – also by others through shared links. Pictures taken for an asset have been added as new versions (not approved).",
          )}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2" data-testid="mobile-filters">
        <select
          aria-label={L("Type", "Type")}
          value={kind}
          onChange={(e) => setKind(e.target.value as KindFilter)}
          className={select}
        >
          <option value="all">{L("Alle typer", "All types")}</option>
          <option value="image">{L("Bilder", "Images")}</option>
          <option value="video">{L("Video", "Video")}</option>
          <option value="audio">{L("Lyd", "Audio")}</option>
        </select>
        <select
          aria-label={L("Dato", "Date")}
          value={days}
          onChange={(e) => setDays(e.target.value as DateFilter)}
          className={select}
        >
          <option value="all">{L("Alle datoer", "All dates")}</option>
          <option value="1">{L("Siste døgn", "Last 24 hours")}</option>
          <option value="7">{L("Siste 7 dager", "Last 7 days")}</option>
          <option value="30">{L("Siste 30 dager", "Last 30 days")}</option>
        </select>
        <select
          aria-label={L("Importøkt", "Import session")}
          value={session}
          onChange={(e) => setSession(e.target.value)}
          className={select}
        >
          <option value="">{L("Alle økter", "All sessions")}</option>
          {roots.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label || L("Prosjektet", "The project")} · {formatDate(s.created_at)}
            </option>
          ))}
        </select>
        <select
          aria-label={L("Kobling", "Link")}
          value={link}
          onChange={(e) => setLink(e.target.value as LinkFilter)}
          className={select}
        >
          <option value="all">{L("Alle koblinger", "All links")}</option>
          <option value="linked">
            {L("Knyttet til ressurs eller scene", "Linked to an asset or scene")}
          </option>
          <option value="unlinked">{L("Ikke knyttet", "Not linked")}</option>
        </select>
        {contributors.length ? (
          <select
            aria-label={L("Bidragsyter", "Contributor")}
            value={contributor}
            onChange={(e) => setContributor(e.target.value)}
            className={select}
          >
            <option value="">{L("Alle bidragsytere", "All contributors")}</option>
            {contributors.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        ) : null}
        <label className="flex items-center gap-1 text-xs text-text-secondary">
          <input
            type="checkbox"
            checked={showHidden}
            onChange={(e) => setShowHidden(e.target.checked)}
          />
          {L("Vis skjulte", "Show hidden")}
        </label>
      </div>
      {shown.length === 0 ? (
        <p className="text-[13px] text-text-tertiary">
          {all.length
            ? L("Ingen filer passer med filteret.", "No files match the filter.")
            : L(
                "Ingen filer fra mobil ennå. Bruk «Importer fra mobil» på prosjektsiden eller kameraikonet i en ressurs.",
                "No files from mobile yet. Use “Import from mobile” on the project page or the camera icon in an asset.",
              )}
        </p>
      ) : (
        <ul
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
          data-testid="mobile-library-items"
        >
          {shown.map((r) => {
            const url = urls.data?.[r.path];
            const s = sessionById.get(r.session_id);
            const assetId = r.asset_id ?? undefined;
            return (
              <li
                key={r.id}
                className={
                  "flex flex-col gap-1 rounded-sm border border-border bg-surface-1 p-1.5 " +
                  (r.dismissed ? "opacity-50" : "")
                }
                data-kind={r.kind}
              >
                <div className="flex aspect-video items-center justify-center overflow-hidden bg-surface-3">
                  {!url ? null : r.kind === "image" ? (
                    <img src={url} alt="" className="size-full object-contain" />
                  ) : r.kind === "video" ? (
                    <video
                      src={url}
                      controls
                      preload="metadata"
                      className="size-full object-contain"
                    />
                  ) : (
                    <audio src={url} controls preload="none" className="w-full" />
                  )}
                </div>
                <p className="truncate text-xs text-text-primary">{contextLabel(state, r)}</p>
                <p className="truncate text-[11px] text-text-tertiary">
                  {r.contributor_name || s?.creator_name || ""}
                  {s?.kind === "shared" ? L(" · delt lenke", " · shared link") : ""} ·{" "}
                  {formatDate(r.created_at)}
                </p>
                <div className="flex items-center gap-1">
                  {assetId && state.assets[assetId] ? (
                    <button
                      type="button"
                      onClick={() => onOpenAsset(assetId)}
                      className="text-[11px] text-accent-brand hover:underline"
                    >
                      {r.asset_version_id
                        ? L("Ny versjon – åpne ressursen", "New version – open the asset")
                        : L("Åpne ressursen", "Open the asset")}
                    </button>
                  ) : r.take_id ? (
                    <span className="text-[11px] text-status-success">
                      {L("Film for scenen", "Film for the scene")}
                    </span>
                  ) : null}
                  {editable ? (
                    <button
                      type="button"
                      onClick={() => void dismissMobileImport(r.id, !r.dismissed)}
                      className="ml-auto inline-flex size-6 items-center justify-center rounded-sm text-text-tertiary hover:bg-surface-3 hover:text-text-primary"
                      aria-label={r.dismissed ? L("Vis igjen", "Show again") : L("Skjul", "Hide")}
                      title={
                        r.dismissed
                          ? L("Vis igjen", "Show again")
                          : L(
                              "Skjul (filen og koblingene beholdes)",
                              "Hide (the file and links are kept)",
                            )
                      }
                    >
                      {r.dismissed ? (
                        <Eye className="size-3.5" aria-hidden />
                      ) : (
                        <EyeOff className="size-3.5" aria-hidden />
                      )}
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <SessionList sessions={sessions.data ?? []} editable={editable} />
    </div>
  );
}

/** Aktive QR-koder og delte lenker, med «Tilbakekall» (REQ-0682). */
function SessionList({
  sessions,
  editable,
}: {
  sessions: readonly UploadSessionRow[];
  editable: boolean;
}) {
  const [err, setErr] = useState<string | null>(null);
  const now = Date.now();
  const active = sessions.filter((s) => !s.revoked_at && Date.parse(s.expires_at) > now);
  if (!active.length) return null;
  return (
    <section aria-label={L("Aktive lenker", "Active links")} data-testid="mobile-sessions">
      <h3 className="mb-1 text-sm font-medium text-text-primary">
        {L("Aktive lenker", "Active links")}
      </h3>
      <ul className="flex flex-col divide-y divide-border rounded-sm border border-border">
        {active.map((s) => (
          <li key={s.id} className="flex items-center gap-2 px-2 py-1.5 text-xs">
            <span className="min-w-0 flex-1 truncate text-text-primary">
              {s.kind === "shared" ? L("Delt lenke", "Shared link") : L("QR-kode", "QR code")} ·{" "}
              {s.label || L("Prosjektet", "The project")}
            </span>
            <span className="shrink-0 text-text-tertiary">
              {s.files_count === 1
                ? L("1 fil", "1 file")
                : L(`${s.files_count} filer`, `${s.files_count} files`)}{" "}
              · {L(`til ${formatDate(s.expires_at)}`, `until ${formatDate(s.expires_at)}`)}
            </span>
            {editable ? (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-1.5"
                onClick={() =>
                  void revokeUploadSession(s.id).then((e) =>
                    setErr(
                      e
                        ? L(
                            "Du kan bare tilbakekalle dine egne QR-koder (eieren kan alle).",
                            "You can only revoke your own QR codes (the owner can revoke all).",
                          )
                        : null,
                    ),
                  )
                }
                data-testid="mobile-revoke"
              >
                <Link2Off />
                {L("Tilbakekall", "Revoke")}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {err ? <p className="mt-1 text-xs text-status-danger">{err}</p> : null}
    </section>
  );
}
