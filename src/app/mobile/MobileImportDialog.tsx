/**
 * «Importer fra mobil» (fase 2, bolk A, DEC-0090, REQ-0668/0670/0677): QR-koden vises med en gang vinduet åpnes
 * – ingen egen knapp for å vise den. Under står hva filene gjelder (f.eks. «Bilder av Maja»), om mobilen er
 * tilkoblet, hva som er mottatt, siste fil, pågående opplastinger og feil. Hver kontekst får sin egen kode.
 */
import { Camera, Check, Copy, Loader2, Smartphone, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { L, formatDate, type UploadContext } from "@/core";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { createUploadSession } from "@/adapters/mobile/mobile.functions";
import type { MobileImportRow } from "@/adapters/browser/mobile-import";
import { useImageUrls } from "@/app/library/asset-images";
import { QrCode } from "./QrCode";
import { sessionConnected, useMobileImports, useUploadSessions } from "./use-mobile-imports";

interface CachedSession {
  readonly sessionId: string;
  readonly token: string;
  readonly expiresAt: string;
}

/** Økten for en kontekst gjenbrukes mens vinduet åpnes og lukkes (så lenge det er minst 15 minutter igjen). */
const cache = new Map<string, CachedSession>();
/** Økter som er under oppretting (så en ny tegning eller StrictMode ikke lager to). */
const inflight = new Map<string, Promise<CachedSession | string>>();

function sessionFor(projectId: string, key: string, context: UploadContext, label: string) {
  let p = inflight.get(key);
  if (!p) {
    p = createUploadSession({ data: { projectId, context, label } })
      .then((r): CachedSession | string => {
        if (!r.ok || !r.token || !r.sessionId || !r.expiresAt)
          return r.message || L("QR-koden kunne ikke lages.", "The QR code could not be made.");
        const s = { sessionId: r.sessionId, token: r.token, expiresAt: r.expiresAt };
        cache.set(key, s);
        return s;
      })
      // Nettleserens egne nettfeil («Failed to fetch» o.l.) vises på brukerens språk (DEC-0091)
      .catch(() =>
        L(
          "QR-koden kunne ikke lages: ingen forbindelse med serveren. Prøv igjen.",
          "The QR code could not be made: no connection to the server. Try again.",
        ),
      )
      .finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  return p;
}
const keyOf = (projectId: string, c: UploadContext) => `${projectId}:${JSON.stringify(c)}`;

export function mobileUrl(token: string): string {
  return `${window.location.origin}/m/${token}`;
}

export function MobileImportDialog({
  open,
  onOpenChange,
  projectId,
  context,
  label,
  actions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  context: UploadContext;
  /** Hva filene gjelder, vist på datamaskinen og mobilen (f.eks. «Bilder av Maja»). */
  label: string;
  /** Knapper for en mottatt fil (f.eks. «Bruk som film for scenen»). */
  actions?: ((row: MobileImportRow) => ReactNode) | undefined;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[88vh] max-w-[720px] overflow-y-auto border-border bg-surface-2"
        data-testid="mobile-import-dialog"
      >
        {open ? (
          <Body projectId={projectId} context={context} label={label} actions={actions} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Økten (QR-koden) for en kontekst og det som er mottatt i den – brukt av «Importer fra mobil» og av
 * lydvinduet (bolk B). Økten lages straks og gjenbrukes mens den gjelder.
 */
export function useMobileSession(projectId: string, context: UploadContext, label: string) {
  const key = keyOf(projectId, context);
  const [session, setSession] = useState<CachedSession | null>(() => {
    const c = cache.get(key);
    return c && Date.parse(c.expiresAt) - Date.now() > 15 * 60_000 ? c : null;
  });
  const [error, setError] = useState<string | null>(null);
  // Konteksten lages på nytt for hver tegning hos kalleren: nøkkelen styrer når en ny økt trengs
  const input = useRef({ context, label });
  input.current = { context, label };
  useEffect(() => {
    if (session) return;
    let alive = true;
    const { context: c, label: l } = input.current;
    void sessionFor(projectId, key, c, l).then((r) => {
      if (!alive) return;
      if (typeof r === "string") setError(r);
      else setSession(r);
    });
    return () => {
      alive = false;
    };
  }, [session, projectId, key]);

  const sessions = useUploadSessions(projectId, !!session);
  const imports = useMobileImports(projectId, !!session);
  // Økten og lenkene som er delt fra den
  const ids = useMemo(() => {
    const out = new Set<string>();
    if (!session) return out;
    out.add(session.sessionId);
    for (const s of sessions.data ?? []) if (s.parent_id === session.sessionId) out.add(s.id);
    return out;
  }, [session, sessions.data]);
  const mine = (imports.data ?? []).filter((r) => ids.has(r.session_id));
  const own = sessions.data?.find((s) => s.id === session?.sessionId);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);
  return {
    session,
    error,
    url: session ? mobileUrl(session.token) : "",
    received: mine.filter((r) => r.status === "done"),
    pending: mine.filter((r) => r.status === "pending"),
    failed: mine.filter((r) => r.status === "failed"),
    connected: sessionConnected(own, now),
    /** «Ny kode»: glem økten og lag en ny. */
    renew: () => {
      cache.delete(key);
      setError(null);
      setSession(null);
    },
  };
}

/** QR-koden med «Kopier lenken» (eller feilen / en plassholder mens den lages). */
export function MobileQr({
  m,
  size = 220,
}: {
  m: ReturnType<typeof useMobileSession>;
  size?: number;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col items-center gap-2">
      {m.error ? (
        <div
          role="alert"
          style={{ width: size }}
          className="flex flex-col gap-1 rounded-sm border border-status-danger/60 p-3 text-xs text-status-danger"
        >
          <TriangleAlert className="size-4" aria-hidden />
          {m.error}
        </div>
      ) : m.session ? (
        <QrCode value={m.url} size={size} />
      ) : (
        <div
          style={{ width: size, height: size }}
          className="animate-pulse rounded-sm bg-surface-3"
          aria-label={L("Lager QR-koden …", "Making the QR code …")}
          data-testid="mobile-qr-loading"
        />
      )}
      {m.session ? (
        <button
          type="button"
          className="flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary"
          onClick={() => {
            void navigator.clipboard?.writeText(m.url).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
          data-testid="mobile-copy-link"
        >
          {copied ? (
            <Check className="size-3.5" aria-hidden />
          ) : (
            <Copy className="size-3.5" aria-hidden />
          )}
          {copied ? L("Kopiert", "Copied") : L("Kopier lenken", "Copy the link")}
        </button>
      ) : null}
    </div>
  );
}

function Body({
  projectId,
  context,
  label,
  actions,
}: {
  projectId: string;
  context: UploadContext;
  label: string;
  actions?: ((row: MobileImportRow) => ReactNode) | undefined;
}) {
  const m = useMobileSession(projectId, context, label);
  const { session, received, pending, failed, connected } = m;
  const thumbs = useImageUrls(received.filter((r) => r.kind === "image").map((r) => r.path));
  return (
    <>
      <div className="flex items-start gap-2 pr-6">
        <Camera className="mt-0.5 size-4 shrink-0 text-accent-brand" aria-hidden />
        <div className="min-w-0">
          <DialogTitle className="text-base font-semibold text-text-primary">
            {L("Importer fra mobil", "Import from mobile")}
          </DialogTitle>
          <DialogDescription className="mt-0.5 text-[13px] text-text-secondary">
            {L(
              "Skann koden med kameraet på mobilen. Bilder og video du tar eller velger der, kommer rett inn hit.",
              "Scan the code with your phone's camera. Pictures and video you take or choose there come straight in here.",
            )}
          </DialogDescription>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-5">
        <MobileQr m={m} />
        <div className="flex min-w-[240px] flex-1 flex-col gap-2 text-[13px]">
          <p className="text-text-primary" data-testid="mobile-import-label">
            {label}
          </p>
          <p
            className={
              "flex items-center gap-1.5 text-xs " +
              (connected ? "text-status-success" : "text-text-tertiary")
            }
            data-testid="mobile-connected"
          >
            <Smartphone className="size-3.5" aria-hidden />
            {connected
              ? L("Mobilen er tilkoblet", "The phone is connected")
              : L("Venter på mobilen …", "Waiting for the phone …")}
          </p>
          <p className="text-xs text-text-secondary" data-testid="mobile-received-count">
            {received.length === 1
              ? L("Én fil mottatt", "One file received")
              : L(`${received.length} filer mottatt`, `${received.length} files received`)}
            {pending.length
              ? L(` · ${pending.length} lastes opp`, ` · ${pending.length} uploading`)
              : ""}
          </p>
          {received[0] ? (
            <p className="text-xs text-text-tertiary">
              {L("Siste:", "Latest:")} {received[0].file_name || received[0].kind} ·{" "}
              {formatDate(received[0].confirmed_at ?? received[0].created_at)}
            </p>
          ) : null}
          {failed.length ? (
            <ul
              className="flex flex-col gap-0.5 text-xs text-status-danger"
              data-testid="mobile-failed"
            >
              {failed.slice(0, 5).map((r) => (
                <li key={r.id} className="flex items-start gap-1">
                  <TriangleAlert className="mt-0.5 size-3 shrink-0" aria-hidden />
                  {r.file_name || r.kind}: {r.error}
                </li>
              ))}
            </ul>
          ) : null}
          {session ? (
            <p className="text-[11px] text-text-tertiary">
              {L(
                `Koden gjelder til ${formatDate(session.expiresAt)} og gir bare rett til å laste opp hit. Fra mobilen kan du dele en egen lenke med andre.`,
                `The code is valid until ${formatDate(session.expiresAt)} and only allows uploading here. From the phone you can share a separate link with others.`,
              )}
            </p>
          ) : null}
        </div>
      </div>
      {received.length ? (
        <ul className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4" data-testid="mobile-received">
          {received.slice(0, 24).map((r) => (
            <li
              key={r.id}
              className="flex flex-col gap-1 rounded-sm border border-border bg-surface-1 p-1"
            >
              <div className="flex aspect-square items-center justify-center overflow-hidden bg-surface-3">
                {r.kind === "image" && thumbs.data?.[r.path] ? (
                  <img src={thumbs.data[r.path]} alt="" className="size-full object-cover" />
                ) : r.kind === "image" ? (
                  <Loader2 className="size-4 animate-spin text-text-tertiary" aria-hidden />
                ) : (
                  <span className="text-xs text-text-secondary">
                    {r.kind === "video" ? L("Video", "Video") : L("Lyd", "Audio")}
                  </span>
                )}
              </div>
              <span className="truncate text-[11px] text-text-tertiary">
                {r.contributor_name || r.file_name}
              </span>
              {r.asset_version_id ? (
                <span className="text-[11px] text-status-success">
                  {L("Lagt inn som ny versjon", "Added as a new version")}
                </span>
              ) : null}
              {actions ? actions(r) : null}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-4 flex justify-end">
        <Button size="sm" variant="secondary" onClick={m.renew} disabled={!session}>
          {L("Ny kode", "New code")}
        </Button>
      </div>
    </>
  );
}

/** Kameraikonet øverst til høyre i bilde- og videodialoger (REQ-0670): åpner vinduet med QR-koden. */
export function MobileCameraButton({
  projectId,
  context,
  label,
  actions,
  className,
}: {
  projectId: string;
  context: UploadContext;
  label: string;
  actions?: ((row: MobileImportRow) => ReactNode) | undefined;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          "inline-flex size-7 items-center justify-center rounded-sm text-text-secondary hover:bg-surface-3 hover:text-text-primary " +
          (className ?? "")
        }
        aria-label={L(`Importer fra mobil: ${label}`, `Import from mobile: ${label}`)}
        title={L(
          `Ta bilde eller video med mobilen – ${label}`,
          `Take a picture or video with your phone – ${label}`,
        )}
        data-testid="mobile-camera-button"
      >
        <Camera className="size-4" aria-hidden />
      </button>
      <MobileImportDialog
        open={open}
        onOpenChange={setOpen}
        projectId={projectId}
        context={context}
        label={label}
        actions={actions}
      />
    </>
  );
}
