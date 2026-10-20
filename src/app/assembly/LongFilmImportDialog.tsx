/**
 * «Importer lang film …» (DEC-0048, REQ-0003, REQ-0235–0236): én filmfil som dekker flere scener. Filen
 * lastes opp én gang og deles på scenene etter starttider brukeren justerer (med forslag etter scenenes
 * lengde). Hver scene får sin egen versjon (samme fil) med utsnittet sitt, og den tas i bruk.
 */
import { Film, Loader2, MapPin, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cutsToRanges, formatHeading, newId, proposeCuts, type FilmClip, type TakeMedia } from "@/core";
import type { Commands } from "@/app/project/use-commands";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FILM_ACCEPT, checkFilmFile, readFilmMetadata, uploadFilm } from "./film-import";
import { t as tk } from "@/core/i18n/keyed";

const fmt = (ms: number) => {
  const s = ms / 1000;
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(2).padStart(5, "0")}`;
};

function parseTime(text: string): number | null {
  const t = text.trim().replace(",", ".");
  const m = /^(?:(\d+):)?(\d+(?:\.\d+)?)$/.exec(t);
  if (!m) return null;
  return Math.round(((m[1] ? Number(m[1]) * 60 : 0) + Number(m[2])) * 1000);
}

export function LongFilmImportDialog({
  open,
  onOpenChange,
  projectId,
  clips,
  firstOccurrenceId,
  cmds,
  fps,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  clips: readonly FilmClip[];
  firstOccurrenceId: string | null;
  cmds: Commands;
  fps: { num: number; den: number };
}) {
  const [file, setFile] = useState<File | null>(null);
  const [media, setMedia] = useState<TakeMedia | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [fromId, setFromId] = useState<string>("");
  const [toId, setToId] = useState<string>("");
  const [starts, setStarts] = useState<number[]>([]);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Bare når vinduet åpnes (ikke når filmen endres underveis, f.eks. av en annen bruker)
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      setFromId(firstOccurrenceId ?? clips[0]?.occurrenceId ?? "");
      setToId(clips[clips.length - 1]?.occurrenceId ?? "");
      setError(null);
    }
    wasOpen.current = open;
  }, [open, firstOccurrenceId, clips]);
  /** Opplastet fil og scener som allerede er ferdige (et nytt forsøk etter feil fortsetter der). */
  const progress = useRef<{
    up: Awaited<ReturnType<typeof uploadFilm>> | null;
    done: Set<string>;
    takes: Map<string, string>;
    /** Alle endringene i importen angres som ett steg (DEC-0049). */
    group: string;
  }>({
    up: null,
    done: new Set(),
    takes: new Map(),
    group: newId(),
  });
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );

  const range = useMemo(() => {
    let a = clips.findIndex((c) => c.occurrenceId === fromId);
    let b = clips.findIndex((c) => c.occurrenceId === toId);
    if (a < 0 || b < 0) return [];
    if (b < a) [a, b] = [b, a];
    return clips.slice(a, b + 1);
  }, [clips, fromId, toId]);

  // Nytt forslag når filmen eller utvalget av scener endres (ikke ved andre endringer i filmen)
  const rangeKey = range.map((c) => c.occurrenceId).join("|");
  const rangeRef = useRef(range);
  rangeRef.current = range;
  useEffect(() => {
    if (!media) return;
    setStarts(
      proposeCuts(
        rangeRef.current.map((c) => c.durationFrames),
        media.durationMs,
      ),
    );
    setDrafts({});
  }, [media, rangeKey]);

  const ranges = media ? cutsToRanges(starts, media.durationMs) : null;

  async function pick(f: File) {
    setError(null);
    const problem = checkFilmFile(f);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(tk("app-assembly-long-film-import-dialog.pick.set-busy.b905cc13d3b2"));
    try {
      const m = await readFilmMetadata(f);
      progress.current = { up: null, done: new Set(), takes: new Map(), group: newId() };
      setFile(f);
      setMedia(m);
      if (url) URL.revokeObjectURL(url);
      setUrl(URL.createObjectURL(f));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function setStart(i: number, ms: number) {
    setStarts((s) => s.map((x, j) => (j === i ? Math.max(0, ms) : x)));
  }

  async function run() {
    if (!file || !media || !ranges || ranges.length !== range.length) return;
    setError(null);
    try {
      const prog = progress.current;
      if (!prog.up) {
        setBusy(tk("app-assembly-long-film-import-dialog.run.set-busy.6b8a233433fe"));
        prog.up = await uploadFilm(projectId, file, fps);
      }
      const up = prog.up;
      const label = tk("app-assembly-long-film-import-dialog.import-long-film", { count: range.length });
      for (let i = 0; i < range.length; i++) {
        const c = range[i]!;
        const r = ranges[i]!;
        if (prog.done.has(c.occurrenceId)) continue;
        setBusy(
          tk("app-assembly-long-film-import-dialog.run.set-busy.ef739bdfca38", { value1: String(i + 1), length: String(range.length) }),
        );
        // Første scene får versjonen filen ble lastet opp med; de andre egne versjoner av samme fil.
        // Versjonen lages bare én gang, også om et nytt forsøk kommer etter en feil.
        let takeId = prog.takes.get(c.occurrenceId);
        if (!takeId) {
          takeId = [...prog.takes.values()].includes(up.takeId) ? newId() : up.takeId;
          const add = await cmds.runAndWait(
            {
              type: "AddTake",
              takeId: takeId as never,
              occurrenceId: c.occurrenceId,
              segmentId: null,
              kind: "imported_film",
              status: "approved",
              durationFrames: up.durationFrames,
              mediaRef: up.mediaRef,
              media: up.media,
            },
            label,
            prog.group,
          );
          if (add.error) throw new Error(add.error);
          prog.takes.set(c.occurrenceId, takeId);
        }
        const edit = await cmds.runAndWait(
          {
            type: "SetSceneEdit",
            occurrenceId: c.occurrenceId,
            activeTakeId: takeId as never,
            parts: [
              {
                partId: newId() as never,
                source: "take",
                takeId: takeId as never,
                inMs: r.inMs,
                outMs: r.outMs,
              },
            ],
          },
          label,
          prog.group,
        );
        if (edit.error) throw new Error(edit.error);
        prog.done.add(c.occurrenceId);
      }
      progress.current = { up: null, done: new Set(), takes: new Map(), group: newId() };
      setBusy(null);
      onOpenChange(false);
      setFile(null);
      setMedia(null);
    } catch (e) {
      setBusy(null);
      setError(
        (e as Error).message ||
          tk("app-assembly-long-film-import-dialog.run.set-error.5dae08110e8e"),
      );
    }
  }

  const input =
    "h-7 rounded-sm border border-border-control bg-surface-3 px-1.5 text-xs text-text-primary disabled:opacity-50";

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-h-[90vh] max-w-[860px] overflow-y-auto border-border bg-surface-2">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Film className="size-5 text-accent-warm" aria-hidden />{" "}
            {tk("app-assembly-long-film-import-dialog.long-film-import-dialog.dialog-title.5180c4f99f3c")}
          </DialogTitle>
          <DialogDescription>
            {tk("app-assembly-long-film-import-dialog.long-film-import-dialog.dialog-description.66b5eca007ee")}
          </DialogDescription>
        </DialogHeader>

        <input
          ref={fileRef}
          type="file"
          accept={FILM_ACCEPT}
          className="sr-only"
          aria-label={tk("app-assembly-long-film-import-dialog.long-film-import-dialog.aria-label.7c66ceb13047")}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void pick(f);
          }}
        />
        {!media ? (
          <div className="flex flex-col items-start gap-2">
            <Button
              variant="secondary"
              disabled={busy !== null}
              onClick={() => fileRef.current?.click()}
            >
              {busy ? <Loader2 className="animate-spin" /> : <Upload />}
              {busy ?? tk("app-assembly-long-film-import-dialog.long-film-import-dialog.button.68fb15bc8a30")}
            </Button>
            <p className="text-xs text-text-tertiary">
              {tk("app-assembly-long-film-import-dialog.long-film-import-dialog.p.6260126c0451")}
            </p>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-[1fr_1.1fr]">
            <div className="flex flex-col gap-2">
              {url ? (
                <video
                  ref={videoRef}
                  src={url}
                  controls
                  muted
                  className="aspect-video w-full rounded-sm bg-media"
                  aria-label={tk("app-assembly-long-film-import-dialog.long-film-import-dialog.aria-label.fad52a56a257")}
                />
              ) : null}
              <p className="text-[11px] text-text-tertiary">
                {media.fileName} · {fmt(media.durationMs)}
                {media.width && media.height ? ` · ${media.width}×${media.height}` : ""}
                {media.fps ? ` · ${Math.round(media.fps * 100) / 100} ${tk("app-assembly-long-film-import-dialog.long-film-import-dialog.p.09fae3fb4dc7")}` : ""}
              </p>
              <p className="text-[11px] text-text-tertiary">
                {tk("app-assembly-long-film-import-dialog.long-film-import-dialog.p.ac4b7ed24588")}{" "}
                <MapPin className="inline size-3" /> {tk("app-assembly-long-film-import-dialog.long-film-import-dialog.p.25403909d332")}
              </p>
            </div>
            <div className="flex min-w-0 flex-col gap-2">
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-text-secondary">
                {tk("app-assembly-long-film-import-dialog.long-film-import-dialog.div.2b61e9f29719")}
                <select
                  aria-label={tk("app-assembly-long-film-import-dialog.long-film-import-dialog.aria-label.651f42bc7e1f")}
                  value={fromId}
                  onChange={(e) => setFromId(e.target.value)}
                  disabled={busy !== null}
                  className={input + " max-w-[160px]"}
                >
                  {clips.map((c) => (
                    <option key={c.occurrenceId} value={c.occurrenceId}>
                      {c.productionNumber ?? ""} {formatHeading(c.heading)}
                    </option>
                  ))}
                </select>
                {tk("app-assembly-long-film-import-dialog.long-film-import-dialog.div.2325536f85e0")}
                <select
                  aria-label={tk("app-assembly-long-film-import-dialog.long-film-import-dialog.aria-label.1ca025d9c17f")}
                  value={toId}
                  onChange={(e) => setToId(e.target.value)}
                  disabled={busy !== null}
                  className={input + " max-w-[160px]"}
                >
                  {clips.map((c) => (
                    <option key={c.occurrenceId} value={c.occurrenceId}>
                      {c.productionNumber ?? ""} {formatHeading(c.heading)}
                    </option>
                  ))}
                </select>
              </div>
              <ol className="flex max-h-[44vh] flex-col gap-1 overflow-y-auto pr-1">
                {range.map((c, i) => {
                  const r = ranges?.[i];
                  return (
                    <li
                      key={c.occurrenceId}
                      className="flex items-center gap-1.5 rounded-sm border border-border bg-surface-1 px-2 py-1 text-xs"
                    >
                      <span className="w-8 shrink-0 font-mono text-[11px] text-text-tertiary">
                        {c.productionNumber ?? i + 1}
                      </span>
                      <button
                        type="button"
                        className="min-w-0 flex-1 truncate text-left text-text-primary hover:text-accent-brand"
                        onClick={() => {
                          if (videoRef.current)
                            videoRef.current.currentTime = (starts[i] ?? 0) / 1000;
                        }}
                        title={tk("app-assembly-long-film-import-dialog.long-film-import-dialog.title.9b2c241dfd22")}
                      >
                        {formatHeading(c.heading)}
                      </button>
                      <input
                        aria-label={`Start for scene ${c.productionNumber ?? i + 1}`}
                        value={drafts[i] ?? fmt(starts[i] ?? 0)}
                        disabled={busy !== null || i === 0}
                        onChange={(e) => setDrafts((d) => ({ ...d, [i]: e.target.value }))}
                        onBlur={() => {
                          const t = drafts[i] !== undefined ? parseTime(drafts[i]) : null;
                          if (t !== null) setStart(i, t);
                          setDrafts((d) => {
                            const n = { ...d };
                            delete n[i];
                            return n;
                          });
                        }}
                        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                        className={input + " w-20 font-mono"}
                        title={
                          i === 0
                            ? tk("app-assembly-long-film-import-dialog.long-film-import-dialog.title.3f7ab5edbd82")
                            : "m:ss.ss"
                        }
                      />
                      <button
                        type="button"
                        disabled={busy !== null || i === 0}
                        onClick={() =>
                          setStart(i, Math.round((videoRef.current?.currentTime ?? 0) * 1000))
                        }
                        aria-label={tk("app-assembly-long-film-import-dialog.long-film-import-dialog.aria-label.f85939752011", { value1: String(c.productionNumber ?? i + 1) })}
                        title={tk("app-assembly-long-film-import-dialog.long-film-import-dialog.title.16b077370031")}
                        className="rounded-sm p-1 text-text-tertiary hover:bg-surface-3 hover:text-text-primary disabled:opacity-30"
                      >
                        <MapPin className="size-3.5" />
                      </button>
                      <span className="w-12 shrink-0 text-right font-mono text-[11px] text-text-tertiary">
                        {r ? `${((r.outMs - r.inMs) / 1000).toFixed(1)} s` : "–"}
                      </span>
                    </li>
                  );
                })}
              </ol>
              {!ranges && range.length > 0 ? (
                <p className="text-xs text-status-danger">
                  {tk("app-assembly-long-film-import-dialog.long-film-import-dialog.p.b024d0f4f87a")}
                </p>
              ) : null}
            </div>
          </div>
        )}

        {error ? (
          <p role="alert" className="text-xs text-status-danger">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          {busy && media ? (
            <span className="mr-auto flex items-center gap-2 text-xs text-text-secondary">
              <Loader2 className="size-3.5 animate-spin" aria-hidden /> {busy}
            </span>
          ) : null}
          <Button variant="ghost" disabled={busy !== null} onClick={() => onOpenChange(false)}>
            {tk("app-assembly-long-film-import-dialog.long-film-import-dialog.button.d80d9fc4f7f9")}
          </Button>
          <Button
            disabled={!media || !ranges || range.length === 0 || busy !== null}
            onClick={() => void run()}
          >
            <Film /> {tk("app-assembly-long-film-import-dialog.long-film-import-dialog.button.805a98aa960a")} {range.length}{" "}
            {range.length === 1 ? tk("app-assembly-long-film-import-dialog.long-film-import-dialog.button.65dca74acff7") : tk("app-assembly-long-film-import-dialog.long-film-import-dialog.button.4b293f9836fe")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
