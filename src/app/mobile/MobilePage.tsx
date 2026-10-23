/**
 * Mobilsiden (fase 2, bolk A, DEC-0090, REQ-0669/0673–0675/0681): åpnes fra QR-koden eller en delt lenke, uten
 * innlogging og uten resten av appen. Viser bare det økten gjelder (f.eks. «Bilder av Maja») og store knapper:
 * ta bilder (hurtigmodus: bilde etter bilde, sendes automatisk), velg bilder, ta opp eller velg video, og «Del
 * lenke» med telefonens egen deling. Bidragsytere ser bare sine egne filer.
 */
import { Thumbnail } from "@/app/shared/Thumbnail";
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
  Mic,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { checkMobileFile, formatDate, type MobileMediaKind } from "@/core";
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
import { MouthShapeCapture } from "./MouthShapeCapture";
import { MobileAudio } from "./MobileAudio";
import { t as tk } from "@/core/i18n/keyed";

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
    uploader.start();
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
  /** B-099: «Ta opp lyd» for en scene (ved siden av bilde og video). */
  const [recordAudio, setRecordAudio] = useState(false);

  if (!info)
    return (
      <Shell>
        <div className="flex flex-1 items-center justify-center text-text-tertiary">
          <Loader2 className="size-6 animate-spin" aria-label={tk("app-mobile-mobile-page.mobile-page.aria-label.6f75c5f9dc18")} />
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
            queue.add(blob, tk("app-mobile-mobile-page.mobile-page.queue-add.c1fb4610e044", { n: String(n) }));
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
              ? tk("app-mobile-mobile-page.mobile-page.p.cfc6f3f6eaa9")
              : tk("app-mobile-mobile-page.mobile-page.p.58407ddefbbc")}
          </p>
          <h1 className="mt-1 text-xl font-semibold text-text-primary" data-testid="mobile-label">
            {info.label || tk("app-mobile-mobile-page.mobile-page.h1.c3aad59fb0f5")}
          </h1>
          <p className="mt-1 text-xs text-text-tertiary">
            {info.from ? tk("app-mobile-mobile-page.mobile-page.p.d344bf9b9045", { from: String(info.from) }) : ""}
            {tk("app-mobile-mobile-page.mobile-page.p.3c59d68146da", { value1: String(formatDate(info.expiresAt ?? "")) })}
          </p>
        </div>
        {info.kind === "shared" ? (
          <label className="flex flex-col gap-1 text-sm text-text-secondary">
            {tk("app-mobile-mobile-page.mobile-page.label.2093f4055cfb")}
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
        {info.rigCapture ? <MouthShapeCapture referenceUrl={info.rigCapture.referenceUrl} slot={info.rigCapture.slot} onConfirm={file => { queue.add(file, file.name); uploader.pump(); }} /> : null}
        {audioOnly || recordAudio ? (
          <MobileAudio script={info.script} items={items} queue={queue} uploader={uploader} />
        ) : null}
        <div className="grid grid-cols-2 gap-3">
          {can("image") && !info.rigCapture ? (
            <>
              <BigButton
                icon={<Camera className="size-7" aria-hidden />}
                label={tk("app-mobile-mobile-page.mobile-page.label.5788fd736553")}
                hint={tk("app-mobile-mobile-page.mobile-page.hint.8b6416086462")}
                onClick={() => setCamera(true)}
                testId="mobile-take-photos"
              />
              <FileButton
                icon={<Images className="size-7" aria-hidden />}
                label={tk("app-mobile-mobile-page.mobile-page.label.cc9bbe80a022")}
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
                label={tk("app-mobile-mobile-page.mobile-page.label.da08e380f532")}
                accept="video/*"
                capture="environment"
                onFiles={addFiles}
                testId="mobile-record-video"
              />
              <FileButton
                icon={<Film className="size-7" aria-hidden />}
                label={tk("app-mobile-mobile-page.mobile-page.label.c3ce9f6e925d")}
                accept="video/*"
                multiple
                onFiles={addFiles}
                testId="mobile-pick-video"
              />
            </>
          ) : null}
          {can("audio") && !audioOnly && !recordAudio ? (
            <BigButton
              icon={<Mic className="size-7" aria-hidden />}
              label={tk("b099.mobile.record-audio")}
              hint={tk("b099.mobile.record-audio-hint")}
              onClick={() => setRecordAudio(true)}
              testId="mobile-record-audio"
            />
          ) : null}
          {can("audio") ? (
            <FileButton
              icon={<Music className="size-7" aria-hidden />}
              label={tk("app-mobile-mobile-page.mobile-page.label.e9269b3edefb")}
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
            {tk("app-mobile-mobile-page.mobile-page.p.d8a5dbfe574a")}
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
        Pen to Glass
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
      className="flex min-h-[112px] flex-col items-center justify-center gap-2 rounded-lg border border-border bg-surface-2 p-3 text-center text-base font-medium text-text-primary active:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
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
    <section aria-label={tk("app-mobile-mobile-page.queue-list.aria-label.f96134cf464a")} data-testid="mobile-queue">
      <h2 className="mb-2 text-sm font-medium text-text-secondary">
        {tk("app-mobile-mobile-page.queue-list.h2.f96134cf464a")} ({items.filter((x) => x.status === "sent").length}/
        {items.length} {tk("app-mobile-mobile-page.queue-list.h2.42af69203fa2")})
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
          <Thumbnail src={url} />
        ) : (
          <Film className="size-6 text-text-tertiary" aria-hidden />
        )}
      </div>
      <span className="absolute right-1 top-1 rounded-full bg-media/60 p-1">
        {it.status === "sent" ? (
          <Check className="size-3.5 text-status-success" aria-label={tk("app-mobile-mobile-page.queue-tile.aria-label.708b930cd1f8")} />
        ) : it.status === "failed" ? (
          <TriangleAlert
            className="size-3.5 text-status-danger"
            aria-label={tk("app-mobile-mobile-page.queue-tile.aria-label.23d0f8859898")}
          />
        ) : (
          <Loader2
            className="size-3.5 animate-spin text-on-media"
            aria-label={it.status === "uploading" ? tk("app-mobile-mobile-page.queue-tile.aria-label.8676fe5a4c87") : tk("app-mobile-mobile-page.queue-tile.aria-label.6fec569fcf3e")}
          />
        )}
      </span>
      {it.status === "failed" ? (
        <button
          type="button"
          onClick={() => onRetry(it.id)}
          className="flex min-h-11 items-center justify-center gap-1 rounded-sm bg-surface-2 py-2 text-xs text-text-primary focus-visible:ring-2 focus-visible:ring-focus-ring"
          title={it.error}
        >
          <RotateCw className="size-3" aria-hidden />
          {tk("app-mobile-mobile-page.queue-tile.button.27aa076f0fdc")}
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
      ? tk("app-mobile-mobile-page.text.message.624aef06af2d", { label: String(label) })
      : tk("app-mobile-mobile-page.text.message.9e50fa7f0f72", { label: String(label) });
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: "Pen to Glass", text, url });
        return;
      } catch {
        /* avbrutt eller ikke tillatt: vis lenken til kopiering */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setMsg(tk("app-mobile-mobile-page.share.set-msg.5bd04ec339d2"));
    } catch {
      setMsg(tk("app-mobile-mobile-page.share.set-msg.a225248ddb7e"));
    }
  }
  return (
    <section className="mt-2 flex flex-col gap-2 rounded-lg border border-border p-3">
      <button
        type="button"
        onClick={() => void share()}
        className="flex h-12 items-center justify-center gap-2 rounded-md bg-accent-brand text-base font-medium text-accent-fg"
        data-testid="mobile-share"
      >
        <Share2 className="size-5" aria-hidden />
        {tk("app-mobile-mobile-page.share-button.button.99e3105dec94")}
      </button>
      <p className="text-xs text-text-tertiary">
        {audio
          ? tk("app-mobile-mobile-page.share-button.p.1e0be1e60984")
          : tk("app-mobile-mobile-page.share-button.p.62630d14dd8d")}
      </p>
      {link ? (
        <input
          readOnly
          value={link}
          onFocus={(e) => e.target.select()}
          className="h-11 rounded-sm border border-border-control bg-surface-3 px-2 text-sm text-text-primary"
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
        tk("app-mobile-mobile-page.quick-camera.set-error.27dd10b8f10d"),
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
          tk("app-mobile-mobile-page.quick-camera.set-error.55678955401e"),
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
    <div className="fixed inset-0 z-50 flex flex-col bg-media" data-testid="mobile-camera">
      <video ref={videoRef} playsInline muted className="min-h-0 flex-1 object-contain" />
      {flash ? (
        <div className="pointer-events-none absolute inset-0 bg-on-media/70" aria-hidden />
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
          className="flex h-12 min-w-[88px] items-center justify-center gap-1 rounded-full bg-on-media/15 px-4 text-sm text-on-media"
          data-testid="mobile-camera-done"
        >
          <X className="size-4" aria-hidden />
          {tk("app-mobile-mobile-page.quick-camera.button.8b143bc1fa2c")}
        </button>
        <button
          type="button"
          onClick={() => void shoot()}
          disabled={!!error}
          aria-label={tk("app-mobile-mobile-page.quick-camera.aria-label.d2402c0a18ef")}
          className="size-20 rounded-full border-4 border-on-media bg-on-media/30 active:bg-on-media/70 disabled:opacity-40"
          data-testid="mobile-shutter"
        />
        <span className="min-w-[88px] text-right text-xs text-on-media/80" aria-live="polite">
          {tk("app-mobile-mobile-page.quick-camera.span.9489a31f8b7b", { count: String(count) })}
          <br />
          {busy ? tk("app-mobile-mobile-page.quick-camera.span.08ffddadb4d3", { busy: String(busy) }) : tk("app-mobile-mobile-page.quick-camera.span.130e0ae7ec9c", { sent: String(sent) })}
        </span>
      </div>
    </div>
  );
}
