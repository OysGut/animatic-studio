/**
 * QR-deling av den eksporterte filmversjonen (GP5, §29–35, Q1–Q8). Filmen lastes opp én gang som mp4
 * (H.264 og AAC, høyst 500 MB), serveren sjekker filen, og først da vises QR-koden og lenken. Varighet:
 * 7 dager, 30 dager (standard) eller til den trekkes tilbake. Tilbakekalling virker med en gang.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Share2 } from "lucide-react";
import { DEFAULT_SHARE_DAYS, SHARE_DAYS, shareEligibility, shareIneligibleText, shareStatus, shareStatusText, shareUrl, tm, type ShareDays } from "@/core";
import {
  createFilmShare,
  filmShareToken,
  listFilmShares,
  revokeFilmShare,
  uploadShareFile,
} from "@/adapters/browser/film-shares";
import { activateFilmShare } from "@/adapters/share/film-share.functions";
import { QrCode } from "@/app/mobile/QrCode";
import { useSchemaAtLeast } from "@/app/shell/use-schema";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { t } from "@/core/i18n/keyed";

export const SHARE_SCHEMA = 47;

export interface ShareSource {
  readonly file: Blob;
  readonly mimeType: string;
  readonly codec: string;
  readonly audioCodec: string | null;
  readonly bytes: number;
  readonly width: number;
  readonly height: number;
  readonly durationMs: number;
  readonly title: string;
  /** Id-en i eksportloggen (filmversjonen). null = registreringen feilet. */
  readonly exportRecord: Promise<string | null>;
  /** Om rulleteksten er med i filmversjonen (MTS MT8). Utelatt = ukjent. */
  readonly creditsIncluded?: boolean;
}

const daysLabel = (d: ShareDays) =>
  d === null ? t("app-share-film-share-dialog.days-label.message.a4bdac33eac3") : t("app-share-film-share-dialog.days-label.message.5a4047009447", { d: String(d) });

export function FilmShareDialog({
  open,
  onOpenChange,
  projectId,
  source,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  source: ShareSource;
}) {
  const ready = useSchemaAtLeast(SHARE_SCHEMA);
  const qc = useQueryClient();
  const eligible = useMemo(() => shareEligibility(source), [source]);
  const [days, setDays] = useState<ShareDays>(DEFAULT_SHARE_DAYS);
  const [recordId, setRecordId] = useState<string | null | undefined>(undefined);
  const [phase, setPhase] = useState<"idle" | "uploading" | "checking">("idle");
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let live = true;
    void source.exportRecord.then((id) => live && setRecordId(id));
    return () => {
      live = false;
    };
  }, [source]);

  const shares = useQuery({
    queryKey: ["film-shares", projectId],
    queryFn: () => listFilmShares(projectId),
    enabled: open && ready,
  });
  const mine = (shares.data ?? []).filter((s) => s.exportRecordId === recordId);
  const active = mine.find((s) => shareStatus(s) === "available") ?? null;

  // QR for en aktiv deling som allerede finnes (vises igjen)
  useEffect(() => {
    if (!active || token) return;
    void filmShareToken(active.id).then(setToken).catch(() => undefined);
  }, [active, token]);

  const url = token ? shareUrl(window.location.origin, token) : null;

  async function share() {
    if (!recordId) return;
    setError(null);
    try {
      setPhase("uploading");
      const s = await createFilmShare(projectId, {
        exportRecordId: recordId,
        title: source.title.slice(0, 200),
        byteSize: source.bytes,
        durationMs: source.durationMs,
        width: source.width,
        height: source.height,
        days,
      });
      await uploadShareFile(s.storageKey, source.file);
      setPhase("checking");
      const r = await activateFilmShare({ data: { shareId: s.id } });
      setToken(r.token);
    } catch (e) {
      setError(tm((e as Error).message));
    } finally {
      setPhase("idle");
      void qc.invalidateQueries({ queryKey: ["film-shares", projectId] });
    }
  }

  async function revoke(id: string) {
    setError(null);
    try {
      await revokeFilmShare(id);
      setToken(null);
    } catch (e) {
      setError(tm((e as Error).message));
    } finally {
      void qc.invalidateQueries({ queryKey: ["film-shares", projectId] });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="film-share-dialog">
        <DialogHeader>
          <DialogTitle>{t("app-share-film-share-dialog.film-share-dialog.dialog-title.6399849814e9")}</DialogTitle>
          <DialogDescription>
            {t("app-share-film-share-dialog.film-share-dialog.dialog-description.d5bff1c6dc21")}
          </DialogDescription>
          {source.creditsIncluded !== undefined ? (
            <p className="text-xs text-text-tertiary" data-testid="film-share-credits-note">
              {source.creditsIncluded
                ? t("app-share-film-share-dialog.film-share-dialog.p.0c3aa664633e")
                : t("app-share-film-share-dialog.film-share-dialog.p.5c4a38c4dd48")}
            </p>
          ) : null}
        </DialogHeader>

        {!ready ? (
          <p className="text-[13px] text-text-secondary">
            {t("app-share-film-share-dialog.film-share-dialog.p.c318b43bbde3")}
          </p>
        ) : !eligible.ok ? (
          <p role="alert" className="text-[13px] text-status-warning" data-testid="film-share-ineligible">
            {shareIneligibleText(eligible.reason)}
          </p>
        ) : recordId === null ? (
          <p role="alert" className="text-[13px] text-status-danger">
            {t("app-share-film-share-dialog.film-share-dialog.p.9f7a07c8a5ea")}
          </p>
        ) : url && active ? (
          <div className="flex flex-col items-center gap-3" data-testid="film-share-ready">
            <QrCode value={url} />
            <p className="text-xs text-text-secondary" data-testid="film-share-status" data-status="available">
              {shareStatusText("available")}
              {active.expiresAt
                ? t("app-share-film-share-dialog.expires", { date: new Date(active.expiresAt) })
                : ""}
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                data-testid="film-share-copy"
                onClick={() => {
                  void navigator.clipboard?.writeText(url).then(() => setCopied(true));
                }}
              >
                <Copy />
                {copied ? t("app-share-film-share-dialog.film-share-dialog.button.653a513dd967") : t("app-share-film-share-dialog.film-share-dialog.button.cfdd73806aa2")}
              </Button>
              {typeof navigator !== "undefined" && "share" in navigator ? (
                <Button
                  size="sm"
                  variant="secondary"
                  data-testid="film-share-native"
                  onClick={() => void navigator.share({ title: source.title, url }).catch(() => undefined)}
                >
                  <Share2 />
                  {t("app-share-film-share-dialog.film-share-dialog.button.c47960429bcd")}
                </Button>
              ) : null}
              <Button size="sm" variant="ghost" data-testid="film-share-revoke" onClick={() => void revoke(active.id)}>
                {t("app-share-film-share-dialog.film-share-dialog.button.83646cb35a17")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-xs text-text-secondary">
              {t("app-share-film-share-dialog.film-share-dialog.label.4ec0a35ea370")}
              <select
                className="h-8 rounded-sm border border-border-control bg-surface-3 px-2 text-[13px] text-text-primary"
                value={days === null ? "none" : String(days)}
                onChange={(e) => setDays(e.target.value === "none" ? null : (Number(e.target.value) as ShareDays))}
                data-testid="film-share-days"
              >
                {SHARE_DAYS.map((d) => (
                  <option key={String(d)} value={d === null ? "none" : String(d)}>
                    {daysLabel(d)}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-xs text-text-tertiary" data-testid="film-share-status" data-status={phase === "idle" ? "not_shared" : "uploading"}>
              {phase === "uploading"
                ? t("app-share-film-share-dialog.film-share-dialog.p.8119b22f18b2")
                : phase === "checking"
                  ? t("app-share-film-share-dialog.film-share-dialog.p.518e7d63fe9d")
                  : t("app-share-film-share-dialog.film-share-dialog.p.bd4238e22171")}
            </p>
            <Button
              onClick={() => void share()}
              disabled={phase !== "idle" || recordId === undefined}
              data-testid="film-share-create"
            >
              {t("app-share-film-share-dialog.film-share-dialog.button.517bc0ddf2a2")}
            </Button>
          </div>
        )}

        {mine.some((s) => shareStatus(s) !== "available") ? (
          <ul className="flex flex-col gap-1 border-t border-border pt-2 text-xs text-text-tertiary" data-testid="film-share-history">
            {mine
              .filter((s) => shareStatus(s) !== "available")
              .map((s) => (
                <li key={s.id} data-share-status={shareStatus(s)}>
                  {new Date(s.createdAt).toLocaleString()} – {shareStatusText(shareStatus(s))}
                </li>
              ))}
          </ul>
        ) : null}
        {error ? (
          <p role="alert" className="text-xs text-status-danger" data-testid="film-share-error">
            {error}
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
