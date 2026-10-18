/**
 * QR-deling av den eksporterte filmversjonen (GP5, §29–35, Q1–Q8). Filmen lastes opp én gang som mp4
 * (H.264 og AAC, høyst 500 MB), serveren sjekker filen, og først da vises QR-koden og lenken. Varighet:
 * 7 dager, 30 dager (standard) eller til den trekkes tilbake. Tilbakekalling virker med en gang.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Share2 } from "lucide-react";
import {
  DEFAULT_SHARE_DAYS,
  L,
  SHARE_DAYS,
  shareEligibility,
  shareIneligibleText,
  shareStatus,
  shareStatusText,
  shareUrl,
  tm,
  type ShareDays,
} from "@/core";
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
  d === null ? L("Til jeg trekker den tilbake", "Until I revoke it") : L(`${d} dager`, `${d} days`);

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
          <DialogTitle>{L("Del filmen med QR-kode", "Share the film with a QR code")}</DialogTitle>
          <DialogDescription>
            {L(
              "Lenken viser bare denne filmversjonen. Den gir ikke tilgang til manus, ressurser eller noe annet i prosjektet.",
              "The link shows only this film version. It gives no access to the script, assets or anything else in the project.",
            )}
          </DialogDescription>
        </DialogHeader>

        {!ready ? (
          <p className="text-[13px] text-text-secondary">
            {L("Deling krever en nyere databaseversjon.", "Sharing requires a newer database version.")}
          </p>
        ) : !eligible.ok ? (
          <p role="alert" className="text-[13px] text-status-warning" data-testid="film-share-ineligible">
            {shareIneligibleText(eligible.reason)}
          </p>
        ) : recordId === null ? (
          <p role="alert" className="text-[13px] text-status-danger">
            {L(
              "Filmversjonen kunne ikke registreres i eksportloggen, så den kan ikke deles. Eksporter på nytt.",
              "The film version could not be recorded in the export log, so it cannot be shared. Export again.",
            )}
          </p>
        ) : url && active ? (
          <div className="flex flex-col items-center gap-3" data-testid="film-share-ready">
            <QrCode value={url} />
            <p className="text-xs text-text-secondary" data-testid="film-share-status" data-status="available">
              {shareStatusText("available")}
              {active.expiresAt
                ? L(
                    ` til ${new Date(active.expiresAt).toLocaleDateString("nb-NO")}`,
                    ` until ${new Date(active.expiresAt).toLocaleDateString("en-GB")}`,
                  )
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
                {copied ? L("Kopiert", "Copied") : L("Kopier lenken", "Copy the link")}
              </Button>
              {typeof navigator !== "undefined" && "share" in navigator ? (
                <Button
                  size="sm"
                  variant="secondary"
                  data-testid="film-share-native"
                  onClick={() => void navigator.share({ title: source.title, url }).catch(() => undefined)}
                >
                  <Share2 />
                  {L("Del …", "Share …")}
                </Button>
              ) : null}
              <Button size="sm" variant="ghost" data-testid="film-share-revoke" onClick={() => void revoke(active.id)}>
                {L("Trekk tilbake", "Revoke")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-xs text-text-secondary">
              {L("Lenken virker i", "The link works for")}
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
                ? L("Laster opp filmen …", "Uploading the film …")
                : phase === "checking"
                  ? L("Sjekker at filmen kan spilles …", "Checking that the film can be played …")
                  : L("Ikke delt ennå. QR-koden vises når filmen er klar.", "Not shared yet. The QR code appears when the film is ready.")}
            </p>
            <Button
              onClick={() => void share()}
              disabled={phase !== "idle" || recordId === undefined}
              data-testid="film-share-create"
            >
              {L("Lag delingslenke", "Create share link")}
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
