/**
 * «Mobilimport» i ressursbiblioteket (fase 2, bolk A, DEC-0090, REQ-0676/0682/0683): alle filer fra mobilbroen
 * med filter for type, dato, importøkt, kobling og bidragsyter. Bilder har miniatyr, video og lyd kan spilles.
 * Originalene bevares; ingenting godkjent overskrives. Lenkene kan tilbakekalles her.
 */
import { Thumbnail } from "@/app/shared/Thumbnail";
import { EyeOff, Eye, Link2Off } from "lucide-react";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDate, formatHeading, parseUploadContext, sceneNumberOf, type ProjectState } from "@/core";
import {
  dismissMobileImport,
  revokeUploadSession,
  type MobileImportRow,
  type UploadSessionRow,
} from "@/adapters/browser/mobile-import";
import { ASSET_BUCKET, createSignedUrls } from "@/adapters/browser/storage-files";
import { Button } from "@/components/ui/button";
import { useMobileImports, useUploadSessions } from "./use-mobile-imports";
import { t } from "@/core/i18n/keyed";

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
      return `${t("app-mobile-mobile-import-library.context-label.message.dc949fff9beb")} ${sceneNumberOf(s, o) ?? ""} ${formatHeading(v.heading)}`;
  }
  if (c?.type === "draft") return t("app-mobile-mobile-import-library.context-label.message.7f0c2c4832e7");
  return t("app-mobile-mobile-import-library.context-label.message.5f17aefb4923");
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
        {t("app-mobile-mobile-import-library.mobile-import-library.p.4da285fc2cec")}
      </p>
    );
  const select =
    "h-7 rounded-sm border border-border-control bg-surface-3 px-1.5 text-xs text-text-primary";
  const roots = (sessions.data ?? []).filter((s) => s.kind === "personal");
  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-4 p-6" data-testid="mobile-library">
      <div>
        <h2 className="text-base font-semibold text-text-primary">
          {t("app-mobile-mobile-import-library.mobile-import-library.h2.a63b6aa9da9f")}
        </h2>
        <p className="mt-1 text-xs text-text-secondary">
          {t("app-mobile-mobile-import-library.mobile-import-library.p.4930d9390487")}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2" data-testid="mobile-filters">
        <select
          aria-label={t("app-mobile-mobile-import-library.mobile-import-library.aria-label.02e2aa63a15c")}
          value={kind}
          onChange={(e) => setKind(e.target.value as KindFilter)}
          className={select}
        >
          <option value="all">{t("app-mobile-mobile-import-library.mobile-import-library.option.47d6e256d584")}</option>
          <option value="image">{t("app-mobile-mobile-import-library.mobile-import-library.option.420e01744edb")}</option>
          <option value="video">{t("app-mobile-mobile-import-library.mobile-import-library.option.989e3f54b491")}</option>
          <option value="audio">{t("app-mobile-mobile-import-library.mobile-import-library.option.1380b1d9eb4a")}</option>
        </select>
        <select
          aria-label={t("app-mobile-mobile-import-library.mobile-import-library.aria-label.02cdcad9587c")}
          value={days}
          onChange={(e) => setDays(e.target.value as DateFilter)}
          className={select}
        >
          <option value="all">{t("app-mobile-mobile-import-library.mobile-import-library.option.711df01c1a37")}</option>
          <option value="1">{t("app-mobile-mobile-import-library.mobile-import-library.option.c9dbc4dcd875")}</option>
          <option value="7">{t("app-mobile-mobile-import-library.mobile-import-library.option.faadb340a673")}</option>
          <option value="30">{t("app-mobile-mobile-import-library.mobile-import-library.option.84361d3af8ee")}</option>
        </select>
        <select
          aria-label={t("app-mobile-mobile-import-library.mobile-import-library.aria-label.29ba6a60d36b")}
          value={session}
          onChange={(e) => setSession(e.target.value)}
          className={select}
        >
          <option value="">{t("app-mobile-mobile-import-library.mobile-import-library.option.36920688f5d4")}</option>
          {roots.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label || t("app-mobile-mobile-import-library.mobile-import-library.option.5d720587ddf1")} · {formatDate(s.created_at)}
            </option>
          ))}
        </select>
        <select
          aria-label={t("app-mobile-mobile-import-library.mobile-import-library.aria-label.7d020634513b")}
          value={link}
          onChange={(e) => setLink(e.target.value as LinkFilter)}
          className={select}
        >
          <option value="all">{t("app-mobile-mobile-import-library.mobile-import-library.option.4dbfeca9604e")}</option>
          <option value="linked">
            {t("app-mobile-mobile-import-library.mobile-import-library.option.a5e63605fdb4")}
          </option>
          <option value="unlinked">{t("app-mobile-mobile-import-library.mobile-import-library.option.9a5d2d7cf450")}</option>
        </select>
        {contributors.length ? (
          <select
            aria-label={t("app-mobile-mobile-import-library.mobile-import-library.aria-label.fb770f065a77")}
            value={contributor}
            onChange={(e) => setContributor(e.target.value)}
            className={select}
          >
            <option value="">{t("app-mobile-mobile-import-library.mobile-import-library.option.6108fc62ecb8")}</option>
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
          {t("app-mobile-mobile-import-library.mobile-import-library.label.2877be4d417e")}
        </label>
      </div>
      {shown.length === 0 ? (
        <p className="text-[13px] text-text-tertiary">
          {all.length
            ? t("app-mobile-mobile-import-library.mobile-import-library.p.9e7714526f7c")
            : t("app-mobile-mobile-import-library.mobile-import-library.p.48b9bc9c073e")}
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
                    <Thumbnail src={url} alt="" className="size-full" />
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
                  {s?.kind === "shared" ? t("app-mobile-mobile-import-library.mobile-import-library.p.a227602b2f19") : ""} ·{" "}
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
                        ? t("app-mobile-mobile-import-library.mobile-import-library.button.2a3748786540")
                        : t("app-mobile-mobile-import-library.mobile-import-library.button.3d0a98a892a3")}
                    </button>
                  ) : r.take_id ? (
                    <span className="text-[11px] text-status-success">
                      {t("app-mobile-mobile-import-library.mobile-import-library.span.36cd2dc8aaa7")}
                    </span>
                  ) : null}
                  {editable ? (
                    <button
                      type="button"
                      onClick={() => void dismissMobileImport(r.id, !r.dismissed)}
                      className="ml-auto inline-flex size-6 items-center justify-center rounded-sm text-text-tertiary hover:bg-surface-3 hover:text-text-primary"
                      aria-label={r.dismissed ? t("app-mobile-mobile-import-library.mobile-import-library.aria-label.feb70fb17044") : t("app-mobile-mobile-import-library.mobile-import-library.aria-label.1f9badcce02d")}
                      title={
                        r.dismissed
                          ? t("app-mobile-mobile-import-library.mobile-import-library.title.feb70fb17044")
                          : t("app-mobile-mobile-import-library.mobile-import-library.title.852693d9a3e1")
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
    <section aria-label={t("app-mobile-mobile-import-library.session-list.aria-label.bacd3536f52d")} data-testid="mobile-sessions">
      <h3 className="mb-1 text-sm font-medium text-text-primary">
        {t("app-mobile-mobile-import-library.session-list.h3.bacd3536f52d")}
      </h3>
      <ul className="flex flex-col divide-y divide-border rounded-sm border border-border">
        {active.map((s) => (
          <li key={s.id} className="flex items-center gap-2 px-2 py-1.5 text-xs">
            <span className="min-w-0 flex-1 truncate text-text-primary">
              {s.kind === "shared" ? t("app-mobile-mobile-import-library.session-list.span.5aefceca8d07") : t("app-mobile-mobile-import-library.session-list.span.0cb88709352f")} ·{" "}
              {s.label || t("app-mobile-mobile-import-library.session-list.span.14006ed8019d")}
            </span>
            <span className="shrink-0 text-text-tertiary">
              {s.files_count === 1
                ? t("app-mobile-mobile-import-library.session-list.span.7efacefcf5e0")
                : t("app-mobile-mobile-import-library.session-list.span.4d5ff15aef41", { files_count: String(s.files_count) })}{" "}
              · {t("app-mobile-mobile-import-library.session-list.span.c2a19c2744e2", { value1: String(formatDate(s.expires_at)) })}
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
                        ? t("app-mobile-mobile-import-library.session-list.set-err.c116e415f3d9")
                        : null,
                    ),
                  )
                }
                data-testid="mobile-revoke"
              >
                <Link2Off />
                {t("app-mobile-mobile-import-library.session-list.button.59da93eea68c")}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {err ? <p className="mt-1 text-xs text-status-danger">{err}</p> : null}
    </section>
  );
}
