/**
 * Mobilsiden (fase 2, bolk A, DEC-0090, REQ-0669/0673–0675/0681): åpnes fra QR-koden eller en delt lenke, uten
 * innlogging og uten resten av appen. Viser bare det økten gjelder (f.eks. «Bilder av Maja») og store knapper:
 * ta bilder (hurtigmodus: bilde etter bilde, sendes automatisk), velg bilder, ta opp eller velg video, og «Del
 * lenke» med telefonens egen deling. Bidragsytere ser bare sine egne filer.
 */
import {
  Camera,
  Check,
  Film,
  Images,
  Loader2,
  Music,
  RotateCw,
  Share2,
  TriangleAlert,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { L, checkMobileFile, formatDate, type MobileMediaKind } from "@/core";
import {
  mobileConfirmUpload,
  mobileSession,
  mobileShareLink,
  mobileUploadTicket,
  type MobileSessionInfo,
} from "@/adapters/mobile/mobile.functions";
import { uploadWithTicket } from "@/adapters/browser/mobile-import";
import { LanguageSwitch } from "@/app/i18n/language";
import { UploadQueue, Uploader, type QueueItem } from "./upload-queue";
import { MobileAudio } from "./MobileAudio";

const NO_ITEMS: QueueItem[] = [];
const serverItems = () => NO_ITEMS;

const NAME_KEY = "animatic:mobile:name"; // i18n-ignore: nøkkel i nettleserens lager

function readName(): string {
  try {
    return window.localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

export function MobilePage({ token }: { token: string }) {
  const [info, setInfo] = useState<MobileSessionInfo | null>(null);
  const [name, setName] = useState(readName);
  const nameRef = useRef(name);
  nameRef.current = name;
  const queue = useMemo(() => new UploadQueue(token), [token]);
  const uploader = useMemo(
    () =>
      new Uploader(queue, {
        ticket: (it) =>
          mobileUploadTicket({
            data: {
              token,
              clientFileId: it.id,
              mime: it.mime,
              bytes: it.size,
              fileName: it.name,
              contributor: nameRef.current,
            },
          }),
        put: async (path, uploadToken, it) =>
          (await uploadWithTicket(path, uploadToken, it.blob, it.mime))?.message ?? null,
        confirm: (it) => mobileConfirmUpload({ data: { token, clientFileId: it.id } }),
      }),
    [queue, token],
  );
  const subscribe = useCallback((fn: () => void) => queue.subscribe(fn), [queue]);
  const items = useSyncExternalStore(subscribe, () => queue.list(), serverItems);

  // Økten (og «sist sett» for datamaskinen) hvert 20. sekund
  useEffect(() => {
    let alive = true;
    const load = () =>
      void mobileSession({ data: { token } })
        .then((r) => alive && setInfo(r))
        .catch(() => alive && setInfo((i) => i));
    load();
    const t = setInterval(load, 20_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [token]);

  useEffect(() => {
    void queue.load().then(() => uploader.pump());
    const online = () => {
      for (const it of queue.list()) if (it.status === "failed") uploader.retry(it.id);
      uploader.pump();
    };
    window.addEventListener("online", online);
    return () => {
      window.removeEventListener("online", online);
      uploader.stop();
    };
  }, [queue, uploader]);

  // Advar før siden forlates med filer som ikke er sendt (og ikke kan tas vare på på telefonen)
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      // Lokale lydopptak varsles alltid: nettleseren kan slette dem (REQ-0689)
      if ((queue.unsent() > 0 && !queue.persistent) || queue.local() > 0) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [queue]);

  const kinds = useMemo(() => info?.mediaKinds ?? [], [info?.mediaKinds]);
  const [notice, setNotice] = useState<string | null>(null);
  const addFiles = useCallback(
    (files: FileList | File[] | null) => {
      if (!files) return;
      const problems: string[] = [];
      for (const f of Array.from(files)) {
        const p = checkMobileFile(f.type, f.size, kinds);
        if (p) problems.push(`${f.name}: ${p}`);
        else queue.add(f, f.name);
      }
      setNotice(problems.length ? problems.slice(0, 3).join("\n") : null);
      uploader.pump();
    },
    [kinds, queue, uploader],
  );
  const [camera, setCamera] = useState(false);

  if (!info)
    return (
      <Shell>
        <div className="flex flex-1 items-center justify-center text-text-tertiary">
          <Loader2 className="size-6 animate-spin" aria-label={L("Henter …", "Loading …")} />
        </div>
      </Shell>
    );
  if (!info.ok)
    return (
      <Shell>
        <div role="alert" className="mx-auto mt-16 max-w-sm px-6 text-center">
          <TriangleAlert className="mx-auto size-8 text-status-danger" aria-hidden />
          <p className="mt-3 text-base text-text-primary" data-testid="mobile-expired">
            {info.message}
          </p>
        </div>
      </Shell>
    );
  const sent = items.filter((x) => x.status === "sent").length;
  const busy = items.filter((x) => x.status === "queued" || x.status === "uploading").length;
  const can = (k: MobileMediaKind) => kinds.includes(k);
  // Lydopptak (bolk B): replikk eller lydressurs – takes som sendes når brukeren velger dem
  const audioOnly = kinds.length === 1 && kinds[0] === "audio";

  return (
    <Shell>
      {camera ? (
        <QuickCamera
          onShot={(blob, n) => {
            queue.add(blob, L(`Bilde ${n}.jpg`, `Picture ${n}.jpg`));
            uploader.pump();
          }}
          sent={sent}
          busy={busy}
          onClose={() => setCamera(false)}
        />
      ) : null}
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pb-10 pt-4">
        <div>
          <p className="text-xs uppercase tracking-[0.06em] text-text-tertiary">
            {info.kind === "shared"
              ? L("Du er invitert til å sende inn", "You are invited to send in")
              : L("Last opp til Animatic Studio", "Upload to Animatic Studio")}
          </p>
          <h1 className="mt-1 text-xl font-semibold text-text-primary" data-testid="mobile-label">
            {info.label || L("Prosjektet", "The project")}
          </h1>
          <p className="mt-1 text-xs text-text-tertiary">
            {info.from ? L(`Fra ${info.from} · `, `From ${info.from} · `) : ""}
            {L(
              `Lenken gjelder til ${formatDate(info.expiresAt ?? "")}`,
              `The link is valid until ${formatDate(info.expiresAt ?? "")}`,
            )}
          </p>
        </div>
        {info.kind === "shared" ? (
          <label className="flex flex-col gap-1 text-sm text-text-secondary">
            {L("Navnet ditt (valgfritt)", "Your name (optional)")}
            <input
              value={name}
              maxLength={100}
              onChange={(e) => {
                setName(e.target.value);
                try {
                  window.localStorage.setItem(NAME_KEY, e.target.value);
                } catch {
                  /* privat vindu */
                }
              }}
              className="h-11 rounded-md border border-border-control bg-surface-3 px-3 text-base text-text-primary"
              data-testid="mobile-name"
            />
          </label>
        ) : null}
        {audioOnly ? (
          <MobileAudio script={info.script} items={items} queue={queue} uploader={uploader} />
        ) : null}
        <div className="grid grid-cols-2 gap-3">
          {can("image") ? (
            <>
              <BigButton
                icon={<Camera className="size-7" aria-hidden />}
                label={L("Ta bilder", "Take pictures")}
                hint={L(
                  "Bilde etter bilde – sendes automatisk",
                  "One after another – sent automatically",
                )}
                onClick={() => setCamera(true)}
                testId="mobile-take-photos"
              />
              <FileButton
                icon={<Images className="size-7" aria-hidden />}
                label={L("Velg bilder", "Choose pictures")}
                accept="image/*"
                multiple
                onFiles={addFiles}
                testId="mobile-pick-images"
              />
            </>
          ) : null}
          {can("video") ? (
            <>
              <FileButton
                icon={<Film className="size-7" aria-hidden />}
                label={L("Ta opp video", "Record video")}
                accept="video/*"
                capture="environment"
                onFiles={addFiles}
                testId="mobile-record-video"
              />
              <FileButton
                icon={<Film className="size-7" aria-hidden />}
                label={L("Velg video", "Choose video")}
                accept="video/*"
                multiple
                onFiles={addFiles}
                testId="mobile-pick-video"
              />
            </>
          ) : null}
          {can("audio") ? (
            <FileButton
              icon={<Music className="size-7" aria-hidden />}
              label={L("Velg lydfiler", "Choose audio files")}
              accept="audio/*"
              multiple
              onFiles={addFiles}
              testId="mobile-pick-audio"
            />
          ) : null}
        </div>
        {notice ? (
          <p
            role="alert"
            className="whitespace-pre-line text-sm text-status-danger"
            data-testid="mobile-notice"
          >
            {notice}
          </p>
        ) : null}
        {!queue.persistent && items.length ? (
          <p className="text-xs text-status-uncertain">
            {L(
              "Filene lagres ikke på telefonen i dette vinduet. Ikke lukk siden før alt er sendt.",
              "The files are not kept on the phone in this window. Do not close the page until everything is sent.",
            )}
          </p>
        ) : null}
        {audioOnly ? null : <QueueList items={items} onRetry={(id) => uploader.retry(id)} />}
        {info.kind === "personal" ? (
          <ShareButton token={token} label={info.label ?? ""} audio={audioOnly} />
        ) : null}
        <div className="mt-2 flex justify-center">
          <LanguageSwitch compact />
        </div>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex min-h-[100dvh] flex-col bg-bg-app text-text-primary"
      data-testid="mobile-page"
    >
      <header className="flex h-11 items-center border-b border-border px-4 text-[13px] font-semibold">
        Animatic Studio
      </header>
      {children}
    </div>
  );
}

function BigButton({
  icon,
  label,
  hint,
  onClick,
  testId,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className="flex min-h-[112px] flex-col items-center justify-center gap-2 rounded-lg border border-border bg-surface-2 p-3 text-center text-base font-medium text-text-primary active:bg-surface-3"
    >
      {icon}
      {label}
      {hint ? <span className="text-[11px] font-normal text-text-tertiary">{hint}</span> : null}
    </button>
  );
}

function FileButton({
  icon,
  label,
  accept,
  multiple,
  capture,
  onFiles,
  testId,
}: {
  icon: React.ReactNode;
  label: string;
  accept: string;
  multiple?: boolean;
  capture?: "environment" | "user";
  onFiles: (f: FileList | null) => void;
  testId: string;
}) {
  const ref = useRef<HTMLInputElement | null>(null);
  return (
    <>
      <BigButton icon={icon} label={label} onClick={() => ref.current?.click()} testId={testId} />
      <input
        ref={ref}
        type="file"
        accept={accept}
        multiple={multiple}
        {...(capture ? { capture } : {})}
        className="hidden"
        data-testid={`${testId}-input`}
        onChange={(e) => {
          onFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </>
  );
}

function QueueList({
  items,
  onRetry,
}: {
  items: readonly QueueItem[];
  onRetry: (id: string) => void;
}) {
  if (!items.length) return null;
  return (
    <section aria-label={L("Dine filer", "Your files")} data-testid="mobile-queue">
      <h2 className="mb-2 text-sm font-medium text-text-secondary">
        {L("Dine filer", "Your files")} ({items.filter((x) => x.status === "sent").length}/
        {items.length} {L("sendt", "sent")})
      </h2>
      <ul className="grid grid-cols-3 gap-2">
        {[...items].reverse().map((it) => (
          <QueueTile key={it.id} it={it} onRetry={onRetry} />
        ))}
      </ul>
    </section>
  );
}

function QueueTile({ it, onRetry }: { it: QueueItem; onRetry: (id: string) => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!it.mime.startsWith("image/")) return;
    const u = URL.createObjectURL(it.blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [it.blob, it.mime]);
  return (
    <li
      className="relative flex flex-col gap-1"
      data-status={it.status}
      data-testid="mobile-queue-item"
    >
      <div className="flex aspect-square items-center justify-center overflow-hidden rounded-md bg-surface-3">
        {url ? (
          <img src={url} alt="" className="size-full object-cover" />
        ) : (
          <Film className="size-6 text-text-tertiary" aria-hidden />
        )}
      </div>
      <span className="absolute right-1 top-1 rounded-full bg-black/60 p-1">
        {it.status === "sent" ? (
          <Check className="size-3.5 text-status-success" aria-label={L("Sendt", "Sent")} />
        ) : it.status === "failed" ? (
          <TriangleAlert
            className="size-3.5 text-status-danger"
            aria-label={L("Feilet", "Failed")}
          />
        ) : (
          <Loader2
            className="size-3.5 animate-spin text-white"
            aria-label={it.status === "uploading" ? L("Sendes", "Sending") : L("I kø", "Queued")}
          />
        )}
      </span>
      {it.status === "failed" ? (
        <button
          type="button"
          onClick={() => onRetry(it.id)}
          className="flex items-center justify-center gap-1 rounded-sm bg-surface-2 py-1 text-[11px] text-text-primary"
          title={it.error}
        >
          <RotateCw className="size-3" aria-hidden />
          {L("Prøv igjen", "Try again")}
        </button>
      ) : null}
    </li>
  );
}

/** «Del lenke» (REQ-0681/0682): en egen, delt lenke med begrensede rettigheter, via telefonens deling. */
function ShareButton({ token, label, audio }: { token: string; label: string; audio: boolean }) {
  const [link, setLink] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  async function share() {
    setMsg(null);
    let url = link;
    if (!url) {
      const r = await mobileShareLink({ data: { token } }).catch((e: Error) => ({
        ok: false,
        message: e.message,
        token: undefined,
      }));
      if (!r.ok || !r.token) {
        setMsg(r.message);
        return;
      }
      url = `${window.location.origin}/m/${r.token}`;
      setLink(url);
    }
    const text = audio
      ? L(`Ta opp lyd til Animatic Studio: ${label}`, `Record audio for Animatic Studio: ${label}`)
      : L(
          `Send bilder og video til Animatic Studio: ${label}`,
          `Send pictures and video to Animatic Studio: ${label}`,
        );
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: "Animatic Studio", text, url });
        return;
      } catch {
        /* avbrutt eller ikke tillatt: vis lenken til kopiering */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setMsg(L("Lenken er kopiert.", "The link has been copied."));
    } catch {
      setMsg(L("Kopier lenken under.", "Copy the link below."));
    }
  }
  return (
    <section className="mt-2 flex flex-col gap-2 rounded-lg border border-border p-3">
      <button
        type="button"
        onClick={() => void share()}
        className="flex h-12 items-center justify-center gap-2 rounded-md bg-accent-brand text-base font-medium text-white"
        data-testid="mobile-share"
      >
        <Share2 className="size-5" aria-hidden />
        {L("Del lenke", "Share link")}
      </button>
      <p className="text-xs text-text-tertiary">
        {audio
          ? L(
              "Andre kan ta opp og sende lyd hit uten konto. De ser bare det de selv sender, gjelder i 7 dager og kan stoppes fra prosjektet.",
              "Others can record and send audio here without an account. They only see what they send themselves; it is valid for 7 days and can be stopped from the project.",
            )
          : L(
              "Andre kan sende inn bilder og video hit uten konto. De ser bare det de selv sender, gjelder i 7 dager og kan stoppes fra prosjektet.",
              "Others can send pictures and video here without an account. They only see what they send themselves; it is valid for 7 days and can be stopped from the project.",
            )}
      </p>
      {link ? (
        <input
          readOnly
          value={link}
          onFocus={(e) => e.target.select()}
          className="h-9 rounded-sm border border-border-control bg-surface-3 px-2 text-xs text-text-primary"
          data-testid="mobile-share-link"
        />
      ) : null}
      {msg ? <p className="text-xs text-text-secondary">{msg}</p> : null}
    </section>
  );
}

/**
 * Hurtigfoto (REQ-0673): kameraet i nettleseren med en stor utløserknapp. Hvert bilde legges i køen og sendes
 * mens man tar neste. Kameraet tar aldri bilder uten at brukeren trykker.
 */
function QuickCamera({
  onShot,
  onClose,
  sent,
  busy,
}: {
  onShot: (blob: Blob, n: number) => void;
  onClose: () => void;
  sent: number;
  busy: number;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState(0);
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    let alive = true;
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(
        L(
          "Nettleseren gir ikke tilgang til kameraet her. Bruk «Velg bilder» i stedet.",
          "The browser does not give access to the camera here. Use “Choose pictures” instead.",
        ),
      );
      return;
    }
    void navigator.mediaDevices
      .getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 4096 },
          height: { ideal: 3072 },
        },
        audio: false,
      })
      .then((s) => {
        if (!alive) return s.getTracks().forEach((t) => t.stop());
        streamRef.current = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          void videoRef.current.play().catch(() => undefined);
        }
      })
      .catch(() =>
        setError(
          L(
            "Fikk ikke bruke kameraet. Gi tillatelse i nettleseren, eller bruk «Velg bilder».",
            "Could not use the camera. Allow it in the browser, or use “Choose pictures”.",
          ),
        ),
      );
    return () => {
      alive = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);
  async function shoot() {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext("2d")!.drawImage(v, 0, 0);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.92));
    if (!blob) return;
    const n = count + 1;
    setCount(n);
    setFlash(true);
    setTimeout(() => setFlash(false), 120);
    onShot(blob, n);
  }
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black" data-testid="mobile-camera">
      <video ref={videoRef} playsInline muted className="min-h-0 flex-1 object-contain" />
      {flash ? (
        <div className="pointer-events-none absolute inset-0 bg-white/70" aria-hidden />
      ) : null}
      {error ? (
        <p
          role="alert"
          className="absolute inset-x-4 top-1/3 rounded-md bg-surface-2 p-4 text-center text-sm"
        >
          {error}
        </p>
      ) : null}
      <div className="flex items-center justify-between px-6 py-5">
        <button
          type="button"
          onClick={onClose}
          className="flex h-12 min-w-[88px] items-center justify-center gap-1 rounded-full bg-white/15 px-4 text-sm text-white"
          data-testid="mobile-camera-done"
        >
          <X className="size-4" aria-hidden />
          {L("Ferdig", "Done")}
        </button>
        <button
          type="button"
          onClick={() => void shoot()}
          disabled={!!error}
          aria-label={L("Ta bilde", "Take picture")}
          className="size-20 rounded-full border-4 border-white bg-white/30 active:bg-white/70 disabled:opacity-40"
          data-testid="mobile-shutter"
        />
        <span className="min-w-[88px] text-right text-xs text-white/80" aria-live="polite">
          {L(`${count} tatt`, `${count} taken`)}
          <br />
          {busy ? L(`${busy} sendes`, `${busy} sending`) : L(`${sent} sendt`, `${sent} sent`)}
        </span>
      </div>
    </div>
  );
}
