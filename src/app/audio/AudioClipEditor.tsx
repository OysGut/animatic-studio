/**
 * Lydprofilen for et lydklipp (DEC-0045): stor bølgeform med tidslinjal, så man kan se når ting skjer i
 * lyden, og volumpunkter som dras opp og ned (som i After Effects). Klikk på kurven legger til et punkt,
 * dra flytter, dobbeltklikk eller Delete fjerner. Lytt til klippet med kurven.
 */
import { Pause, Play, Trash2 } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  L,
  AUDIO_KIND_LABEL,
  audioVersion,
  volumeKeyDbAt,
  type AudioClip,
  type AudioClipFields,
  type FilmAudioItem,
  type ProjectState,
  type VolumeKey,
  locale,
} from "@/core";
import { peaks, scheduleOne } from "@/engine/audio/mixer";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { audioBank, useAudioLoaded } from "./use-audio-playback";
import { t as tk } from "@/core/i18n/keyed";

const H = 220;
const TOP = 10;
const BOTTOM = 18;
const DB_MAX = 12;
const DB_MIN = -40;
const POINT_R = 5;

const fmt = (s: number) =>
  s < 60
    ? `${(Math.round(s * 10) / 10).toLocaleString(locale())} s`
    : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

export function AudioClipEditor({
  open,
  onOpenChange,
  state,
  clip,
  sceneSeconds,
  editable,
  url,
  onChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: ProjectState;
  clip: AudioClip | null;
  /** Hvor lang scenen er (s), for å vise hvor lyden kuttes; null = ukjent. */
  sceneSeconds: number | null;
  editable: boolean;
  /** Lenke til lydfilen (signert), eller null mens den hentes. */
  url: string | null;
  onChange: (label: string, patch: Partial<AudioClipFields>) => void;
}) {
  return (
    <Dialog open={open && clip !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[min(1100px,calc(100vw-32px))] border-border bg-surface-2">
        {clip ? (
          <Editor
            key={clip.id}
            state={state}
            clip={clip}
            sceneSeconds={sceneSeconds}
            editable={editable}
            url={url}
            onChange={onChange}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function Editor({
  state,
  clip,
  sceneSeconds,
  editable,
  url,
  onChange,
}: {
  state: ProjectState;
  clip: AudioClip;
  sceneSeconds: number | null;
  editable: boolean;
  url: string | null;
  onChange: (label: string, patch: Partial<AudioClipFields>) => void;
}) {
  const version = audioVersion(state, clip);
  const path = version?.mediaPath ?? null;
  const loaded = useAudioLoaded();
  useEffect(() => {
    if (path && url) void audioBank.load(path, url);
  }, [path, url]);
  const buf = path ? audioBank.get(path) : undefined;

  const length = clip.lengthMs / 1000;
  const sourceIn = clip.sourceInMs / 1000;
  /** Hastighet (DEC-0079): 1 = uendret. */
  const speed = clip.speed ?? 1;
  // Hvor scenen slutter, målt fra klippets start (bare når lyden ikke løper videre)
  const cut = !clip.continues && sceneSeconds !== null ? sceneSeconds - clip.offsetMs / 1000 : null;

  const boxRef = useRef<HTMLDivElement | null>(null);
  const [w, setW] = useState(800);
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const m = () => setW(Math.max(200, el.clientWidth));
    m();
    const ro = new ResizeObserver(m);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const [keys, setKeys] = useState<VolumeKey[]>(() => [...clip.volumeKeys]);
  useEffect(() => setKeys([...clip.volumeKeys]), [clip.volumeKeys]);
  const [sel, setSel] = useState<number | null>(null);
  const drag = useRef<{ index: number; moved: boolean } | null>(null);

  const xOf = (sec: number) => (sec / length) * w;
  const secOf = (x: number) => Math.max(0, Math.min(length, (x / w) * length));
  const yOf = (db: number) => TOP + ((DB_MAX - db) / (DB_MAX - DB_MIN)) * (H - TOP - BOTTOM);
  const dbOf = (y: number) =>
    Math.max(-60, Math.min(DB_MAX, DB_MAX - ((y - TOP) / (H - TOP - BOTTOM)) * (DB_MAX - DB_MIN)));

  // Bølgeform
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(w * dpr);
    c.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, H);
    if (!buf) return;
    const col = getComputedStyle(c).color || "#9aa";
    const p = peaks(buf, sourceIn, sourceIn + length * speed, Math.ceil(w / 2));
    const mid = TOP + (H - TOP - BOTTOM) / 2;
    const half = (H - TOP - BOTTOM) / 2;
    ctx.fillStyle = col;
    const bw = w / p.length;
    for (let i = 0; i < p.length; i++) {
      const v = Math.max(0.5, p[i]! * half);
      ctx.fillRect(i * bw, mid - v, Math.max(1, bw - 0.5), v * 2);
    }
  }, [buf, w, sourceIn, length, speed, loaded]);

  function commit(next: VolumeKey[]) {
    const sorted = [...next].sort((a, b) => a.t - b.t);
    setKeys(sorted);
    onChange(tk("app-audio-audio-clip-editor.commit.on-change.c0587669b9d5"), { volumeKeys: sorted });
  }

  function pointer(e: React.PointerEvent<SVGSVGElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  // Lytt til klippet
  const [playing, setPlaying] = useState(false);
  const [head, setHead] = useState(0);
  const ctxRef = useRef<AudioContext | null>(null);
  const srcRef = useRef<AudioBufferSourceNode | null>(null);
  const startRef = useRef<{ at: number; from: number } | null>(null);
  const item = useMemo(
    (): FilmAudioItem => ({
      clip,
      version,
      start: 0,
      length: cut !== null ? Math.max(0, Math.min(length, cut)) : length,
      fullLength: length,
      sourceIn,
      ...(speed !== 1 ? { speed } : {}),
      gain: Math.pow(10, clip.gainDb / 20),
      fadeIn: clip.fadeInMs / 1000,
      fadeOut: clip.fadeOutMs / 1000,
      keys: keys.map((k) => ({ t: k.t / 1000, db: k.db })),
    }),
    [clip, version, cut, length, sourceIn, speed, keys],
  );
  function stop() {
    try {
      srcRef.current?.stop();
    } catch {
      // allerede stoppet
    }
    srcRef.current = null;
    startRef.current = null;
    setPlaying(false);
  }
  function play(from: number) {
    stop();
    if (!buf) return;
    const ctx = (ctxRef.current ??= new AudioContext());
    if (ctx.state === "suspended") void ctx.resume();
    const at = ctx.currentTime + 0.03;
    srcRef.current = scheduleOne(ctx, ctx.destination, item, buf, { from, startAt: at });
    startRef.current = { at, from };
    setPlaying(true);
  }
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      const s = startRef.current;
      const ctx = ctxRef.current;
      if (s && ctx) {
        const t = s.from + Math.max(0, ctx.currentTime - s.at);
        if (t >= item.length) {
          setHead(item.length);
          setPlaying(false);
          return;
        }
        setHead(t);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, item.length]);
  useEffect(
    () => () => {
      stop();
      void ctxRef.current?.close();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Kurven: punktene, eller en flat linje når det ikke finnes punkter
  const linePts =
    keys.length > 0
      ? [
          { x: 0, y: yOf(keys[0]!.db) },
          ...keys.map((k) => ({ x: xOf(k.t / 1000), y: yOf(k.db) })),
          { x: w, y: yOf(keys[keys.length - 1]!.db) },
        ]
      : [
          { x: 0, y: yOf(0) },
          { x: w, y: yOf(0) },
        ];
  const step = [1, 2, 5, 10, 15, 30, 60, 120, 300].find((s) => (s / length) * w >= 70) ?? 600;
  const ticks: number[] = [];
  for (let t = 0; t <= length + 1e-9; t += step) ticks.push(t);

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {tk("app-audio-audio-clip-editor.editor.dialog-title.623645b2dc23")} – {clip.name || tk("app-audio-audio-clip-editor.editor.dialog-title.69c929975ce1")}
        </DialogTitle>
        <DialogDescription>
          {AUDIO_KIND_LABEL[clip.kind]} · {fmt(length)}
          {clip.continues
            ? tk("app-audio-audio-clip-editor.editor.dialog-description.1f5bc6cf7989")
            : ""}
          .{" "}
          {tk("app-audio-audio-clip-editor.editor.dialog-description.2d933392f1a3")}
        </DialogDescription>
      </DialogHeader>

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          disabled={!buf}
          onClick={() => (playing ? stop() : play(head >= item.length ? 0 : head))}
          aria-label={playing ? tk("app-audio-audio-clip-editor.editor.aria-label.a801f2fd8222") : tk("app-audio-audio-clip-editor.editor.aria-label.22be8db6636f")}
        >
          {playing ? <Pause /> : <Play />}
          {playing ? tk("app-audio-audio-clip-editor.editor.button.a801f2fd8222") : tk("app-audio-audio-clip-editor.editor.button.22be8db6636f")}
        </Button>
        <span className="font-mono text-xs tabular-nums text-text-secondary">
          {fmt(head)} / {fmt(item.length)}
        </span>
        {sel !== null && keys[sel] ? (
          <span className="text-xs text-text-tertiary">
            Punkt: {fmt(keys[sel]!.t / 1000)}, {keys[sel]!.db > 0 ? "+" : ""}
            {keys[sel]!.db.toLocaleString(locale())} dB
          </span>
        ) : (
          <span className="text-xs text-text-tertiary">
            {tk("app-audio-audio-clip-editor.editor.span.80c46dd1e04a")}{" "}
            {Math.round(volumeKeyDbAt(item.keys, head) * 10) / 10} dB
          </span>
        )}
        <span className="ml-auto" />
        {editable && keys.length > 0 ? (
          <Button size="sm" variant="ghost" onClick={() => commit([])}>
            <Trash2 />
            {tk("app-audio-audio-clip-editor.editor.button.7a795157459a")}
          </Button>
        ) : null}
      </div>

      <TrimAndSpeed
        clip={clip}
        buf={buf ?? null}
        editable={editable}
        loaded={loaded}
        onChange={(label, patch) => {
          stop();
          setHead(0);
          onChange(label, patch);
        }}
      />

      <div ref={boxRef} className="relative select-none" style={{ height: H + 18 }}>
        {/* Linjal: klikk for å flytte hodet */}
        <div
          className="relative h-[18px] cursor-pointer border-b border-border"
          onPointerDown={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const t = secOf(e.clientX - r.left);
            setHead(t);
            if (playing) play(t);
          }}
        >
          {ticks.map((t) => (
            <span
              key={t}
              className="absolute top-0 border-l border-border-control pl-1 text-[11px] leading-4 text-text-tertiary"
              style={{ left: xOf(t) }}
            >
              {fmt(t)}
            </span>
          ))}
        </div>
        <div className="relative rounded-sm bg-surface-1" style={{ height: H }}>
          <canvas
            ref={canvasRef}
            aria-hidden
            style={{ width: w, height: H, color: "var(--chart-1)" }}
            className="absolute inset-0 opacity-70"
          />
          {!buf ? (
            <p className="absolute inset-0 flex items-center justify-center text-xs text-text-tertiary">
              {version
                ? tk("app-audio-audio-clip-editor.editor.p.573560d6be1f")
                : tk("app-audio-audio-clip-editor.editor.p.ccaf87fbb749")}
            </p>
          ) : null}
          <svg
            width={w}
            height={H}
            className="absolute inset-0 touch-none"
            role="application"
            aria-label={tk("app-audio-audio-clip-editor.editor.aria-label.55c45cdf7d66")}
            tabIndex={0}
            onKeyDown={(e) => {
              if (sel === null || !editable) return;
              const k = keys[sel];
              if (!k) return;
              let next: VolumeKey | null = null;
              if (e.key === "ArrowUp") next = { ...k, db: Math.min(DB_MAX, k.db + 0.5) };
              else if (e.key === "ArrowDown") next = { ...k, db: Math.max(-60, k.db - 0.5) };
              else if (e.key === "ArrowLeft") next = { ...k, t: Math.max(0, k.t - 100) };
              else if (e.key === "ArrowRight")
                next = { ...k, t: Math.min(clip.lengthMs, k.t + 100) };
              else if (e.key === "Delete" || e.key === "Backspace") {
                e.preventDefault();
                commit(keys.filter((_, i) => i !== sel));
                setSel(null);
                return;
              } else return;
              e.preventDefault();
              if (keys.some((x, i) => i !== sel && x.t === next!.t)) return;
              commit(keys.map((x, i) => (i === sel ? next! : x)));
            }}
            onPointerDown={(e) => {
              if (!editable || e.button !== 0) return;
              const p = pointer(e);
              const hit = keys.findIndex(
                (k) => Math.hypot(xOf(k.t / 1000) - p.x, yOf(k.db) - p.y) <= POINT_R + 3,
              );
              e.currentTarget.setPointerCapture(e.pointerId);
              if (hit >= 0) {
                setSel(hit);
                drag.current = { index: hit, moved: false };
                return;
              }
              // Nytt punkt der man klikker
              const t = Math.round(secOf(p.x) * 1000);
              if (keys.some((k) => k.t === t)) return;
              const next = [...keys, { t, db: Math.round(dbOf(p.y) * 10) / 10 }].sort(
                (a, b) => a.t - b.t,
              );
              const index = next.findIndex((k) => k.t === t);
              setKeys(next);
              setSel(index);
              drag.current = { index, moved: true };
            }}
            onPointerMove={(e) => {
              const d = drag.current;
              if (!d) return;
              const p = pointer(e);
              const prev = keys[d.index - 1];
              const nxt = keys[d.index + 1];
              const lo = prev ? prev.t + 1 : 0;
              const hi = nxt ? nxt.t - 1 : clip.lengthMs;
              const t = Math.max(lo, Math.min(hi, Math.round(secOf(p.x) * 1000)));
              const db = Math.round(dbOf(p.y) * 10) / 10;
              d.moved = true;
              setKeys((ks) => ks.map((k, i) => (i === d.index ? { t, db } : k)));
            }}
            onPointerUp={() => {
              const d = drag.current;
              drag.current = null;
              if (d?.moved) commit(keys);
            }}
            onDoubleClick={(e) => {
              if (!editable) return;
              const p = pointer(e as unknown as React.PointerEvent<SVGSVGElement>);
              const hit = keys.findIndex(
                (k) => Math.hypot(xOf(k.t / 1000) - p.x, yOf(k.db) - p.y) <= POINT_R + 3,
              );
              if (hit >= 0) {
                commit(keys.filter((_, i) => i !== hit));
                setSel(null);
              }
            }}
          >
            {/* 0 dB */}
            <line
              x1={0}
              x2={w}
              y1={yOf(0)}
              y2={yOf(0)}
              stroke="var(--border-strong)"
              strokeDasharray="3 3"
            />
            <text x={4} y={yOf(0) - 3} fontSize={10} fill="var(--text-tertiary)">
              0 dB
            </text>
            {/* Der scenen slutter (lyden kuttes her uten «løper videre») */}
            {cut !== null && cut > 0 && cut < length ? (
              <>
                <rect
                  x={xOf(cut)}
                  y={0}
                  width={w - xOf(cut)}
                  height={H}
                  fill="var(--surface-0)"
                  opacity={0.55}
                />
                <line
                  x1={xOf(cut)}
                  x2={xOf(cut)}
                  y1={0}
                  y2={H}
                  stroke="var(--status-discrepancy)"
                  strokeDasharray="4 3"
                />
                <text x={xOf(cut) + 4} y={12} fontSize={10} fill="var(--status-discrepancy)">
                  {tk("app-audio-audio-clip-editor.editor.text.30810ea9869d")}
                </text>
              </>
            ) : null}
            {/* Kurven */}
            <polyline
              points={linePts.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="none"
              stroke="var(--accent-warm)"
              strokeWidth={1.5}
              strokeDasharray={keys.length ? undefined : "5 4"}
            />
            {keys.map((k, i) => (
              <circle
                key={`${k.t}-${i}`}
                cx={xOf(k.t / 1000)}
                cy={yOf(k.db)}
                r={POINT_R}
                fill={i === sel ? "var(--accent-warm)" : "var(--surface-2)"}
                stroke="var(--accent-warm)"
                strokeWidth={1.5}
                className={editable ? "cursor-grab" : ""}
              />
            ))}
            {/* Avspillingshodet */}
            <line x1={xOf(head)} x2={xOf(head)} y1={0} y2={H} stroke="var(--accent-brand)" />
          </svg>
        </div>
      </div>
      <p className="text-xs text-text-tertiary">
        {tk("app-audio-audio-clip-editor.editor.p.2ca0871d7126")}
      </p>
    </>
  );
}

/** Faste hastigheter (DEC-0079); mellomverdier velges med glidebryteren eller tallfeltet. */
export const SPEED_PRESETS = [25, 50, 75, 100, 125, 150, 200, 300, 400] as const;
const MIN_LENGTH_MS = 50;

/** Glidebryterens posisjon (0–1000) ↔ prosent, logaritmisk så 100 % står midt på. */
const sliderOf = (pct: number) => Math.round((Math.log(pct / 25) / Math.log(16)) * 1000);
const pctOf = (pos: number) => Math.round(25 * Math.pow(16, pos / 1000));

/**
 * Ny hastighet: den samme delen av lydfilen spilles, så lengden i filmen endres (raskere = kortere).
 * Volumpunktene følger lyden.
 */
export function withSpeed(
  clip: Pick<AudioClip, "lengthMs" | "speed" | "volumeKeys">,
  pct: number,
): Partial<AudioClipFields> {
  const speed = Math.min(4, Math.max(0.25, Math.round(pct) / 100));
  const old = clip.speed ?? 1;
  const k = old / speed;
  const lengthMs = Math.max(MIN_LENGTH_MS, Math.round(clip.lengthMs * k));
  return {
    speed,
    lengthMs,
    volumeKeys: clip.volumeKeys
      .map((v) => ({ t: Math.round(v.t * k), db: v.db }))
      .filter((v, i, a) => v.t <= lengthMs && (i === 0 || v.t !== a[i - 1]!.t)),
  };
}

/**
 * Nye masker for start og slutt i lydfilen (s): klippet spiller fra `inSec` til `outSec` i lydfilen, og
 * lengden i filmen blir (out − in) / hastighet. Starten i scenen står fast.
 */
export function withTrim(
  clip: Pick<AudioClip, "speed" | "volumeKeys" | "sourceInMs">,
  inSec: number,
  outSec: number,
): Partial<AudioClipFields> {
  const speed = clip.speed ?? 1;
  const sourceInMs = Math.max(0, Math.round(inSec * 1000));
  const lengthMs = Math.max(MIN_LENGTH_MS, Math.round(((outSec - inSec) * 1000) / speed));
  // Volumpunktene følger lyden: flyttes like mye som starten
  const shift = Math.round((sourceInMs - clip.sourceInMs) / speed);
  return {
    sourceInMs,
    lengthMs,
    volumeKeys: clip.volumeKeys
      .map((v) => ({ t: v.t - shift, db: v.db }))
      .filter((v) => v.t >= 0 && v.t <= lengthMs),
  };
}

function TrimAndSpeed({
  clip,
  buf,
  editable,
  loaded,
  onChange,
}: {
  clip: AudioClip;
  buf: AudioBuffer | null;
  editable: boolean;
  loaded: number;
  onChange: (label: string, patch: Partial<AudioClipFields>) => void;
}) {
  const speed = clip.speed ?? 1;
  const pct = Math.round(speed * 100);
  const [draftPct, setDraftPct] = useState(pct);
  useEffect(() => setDraftPct(pct), [pct]);
  const total = buf?.duration ?? null;
  const inSec = clip.sourceInMs / 1000;
  const outSec = inSec + (clip.lengthMs / 1000) * speed;

  // Oversikt over hele lydfilen med maskene
  const W = 1000;
  const BAR_H = 44;
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    c.width = W;
    c.height = BAR_H;
    ctx.clearRect(0, 0, W, BAR_H);
    if (!buf) return;
    ctx.fillStyle = getComputedStyle(c).color || "#9aa";
    const p = peaks(buf, 0, buf.duration, W / 2);
    for (let i = 0; i < p.length; i++) {
      const v = Math.max(0.5, p[i]! * (BAR_H / 2) * 0.95);
      ctx.fillRect(i * 2, BAR_H / 2 - v, 1.5, v * 2);
    }
  }, [buf, loaded]);

  const [drag, setDrag] = useState<{ edge: "in" | "out"; sec: number } | null>(null);
  const shownIn = drag?.edge === "in" ? drag.sec : inSec;
  const shownOut = drag?.edge === "out" ? drag.sec : outSec;
  const barRef = useRef<HTMLDivElement | null>(null);
  const secAt = (clientX: number) => {
    const r = barRef.current?.getBoundingClientRect();
    if (!r || !total) return 0;
    return Math.max(0, Math.min(total, ((clientX - r.left) / r.width) * total));
  };
  const pctPos = (sec: number) => (total ? `${(sec / total) * 100}%` : "0%");
  const minSpan = (MIN_LENGTH_MS / 1000) * speed;

  function applySpeed(next: number) {
    const v = Math.min(400, Math.max(25, Math.round(next)));
    if (v === pct) return;
    onChange(tk("app-audio-audio-clip-editor.apply-speed.on-change.99e09c01798c", { v: String(v) }), withSpeed(clip, v));
  }

  return (
    <div className="flex flex-col gap-2 rounded-sm border border-border bg-surface-1 p-2">
      <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
        <span className="font-medium text-text-primary">{tk("app-audio-audio-clip-editor.trim-and-speed.span.dee8596dbe05")}</span>
        <input
          type="range"
          min={0}
          max={1000}
          step={1}
          value={sliderOf(draftPct)}
          disabled={!editable}
          aria-label={tk("app-audio-audio-clip-editor.trim-and-speed.aria-label.82ffec0086b1")}
          onChange={(e) => setDraftPct(pctOf(Number(e.target.value)))}
          onPointerUp={() => applySpeed(draftPct)}
          onKeyUp={() => applySpeed(draftPct)}
          className="w-48 accent-[var(--accent-brand)]"
        />
        <label className="flex items-center gap-1">
          <input
            type="number"
            min={25}
            max={400}
            step={1}
            value={draftPct}
            disabled={!editable}
            aria-label={tk("app-audio-audio-clip-editor.trim-and-speed.aria-label.89e6181b1f5b")}
            onChange={(e) => setDraftPct(Number(e.target.value))}
            onBlur={() => applySpeed(draftPct)}
            onKeyDown={(e) => {
              if (e.key === "Enter") applySpeed(draftPct);
            }}
            className="h-7 w-16 rounded-sm border border-border-control bg-surface-3 px-1.5 text-right font-mono tabular-nums text-text-primary"
          />
          %
        </label>
        <span className="flex flex-wrap gap-1">
          {SPEED_PRESETS.map((v) => (
            <button
              key={v}
              type="button"
              disabled={!editable}
              aria-pressed={pct === v}
              onClick={() => applySpeed(v)}
              className={
                "h-6 rounded-sm px-1.5 font-mono text-[11px] tabular-nums " +
                (pct === v
                  ? "bg-accent-selection text-text-primary"
                  : "text-text-secondary hover:bg-surface-3 hover:text-text-primary")
              }
            >
              {v} %
            </button>
          ))}
        </span>
        <span className="text-text-tertiary">
          {tk("app-audio-audio-clip-editor.trim-and-speed.span.080de4547cad")}
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-medium text-text-primary">
            {tk("app-audio-audio-clip-editor.trim-and-speed.span.1ba450293c55")}
          </span>
          <span className="font-mono tabular-nums text-text-secondary">
            {fmt(shownIn)} – {fmt(shownOut)}
            {total !== null ? tk("app-audio-audio-clip-editor.trim-and-speed.span.dc81131a23cb", { value1: String(fmt(total)) }) : ""}
          </span>
          <span className="text-text-tertiary">
            {tk("app-audio-audio-clip-editor.trim-and-speed.span.992672bf1ee3")}{" "}
            {fmt((shownOut - shownIn) / speed)}
          </span>
        </div>
        <div
          ref={barRef}
          className="relative h-11 touch-none select-none overflow-hidden rounded-sm bg-surface-2"
          aria-label={tk("app-audio-audio-clip-editor.trim-and-speed.aria-label.3c660b5e7125")}
          onPointerMove={(e) => {
            if (!drag || !total) return;
            const t = secAt(e.clientX);
            setDrag({
              ...drag,
              sec:
                drag.edge === "in" ? Math.min(t, outSec - minSpan) : Math.max(t, inSec + minSpan),
            });
          }}
          onPointerUp={() => {
            const d = drag;
            setDrag(null);
            if (!d) return;
            const nextIn = d.edge === "in" ? d.sec : inSec;
            const nextOut = d.edge === "out" ? d.sec : outSec;
            if (Math.abs(nextIn - inSec) < 0.001 && Math.abs(nextOut - outSec) < 0.001) return;
            onChange(
              d.edge === "in"
                ? tk("app-audio-audio-clip-editor.trim-and-speed.on-change.5fbaab3a8440")
                : tk("app-audio-audio-clip-editor.trim-and-speed.on-change.77c2cb82e81a"),
              withTrim(clip, nextIn, nextOut),
            );
          }}
        >
          <canvas
            ref={ref}
            aria-hidden
            className="absolute inset-0 h-full w-full"
            style={{ color: "var(--chart-1)" }}
          />
          {total ? (
            <>
              {/* Maskert bort: utenfor start og slutt */}
              <div
                className="absolute inset-y-0 left-0 bg-surface-0/70"
                style={{ width: pctPos(shownIn) }}
              />
              <div
                className="absolute inset-y-0 right-0 bg-surface-0/70"
                style={{ left: pctPos(shownOut) }}
              />
              {(["in", "out"] as const).map((edge) => (
                <button
                  key={edge}
                  type="button"
                  disabled={!editable}
                  aria-label={
                    edge === "in" ? tk("app-audio-audio-clip-editor.trim-and-speed.aria-label.84d6f7f59489") : tk("app-audio-audio-clip-editor.trim-and-speed.aria-label.68b82b6e2c3b")
                  }
                  title={tk("app-audio-audio-clip-editor.trim-and-speed.title.15a0bb464174")}
                  onPointerDown={(e) => {
                    if (!editable) return;
                    e.preventDefault();
                    barRef.current?.setPointerCapture(e.pointerId);
                    setDrag({ edge, sec: edge === "in" ? inSec : outSec });
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
                    e.preventDefault();
                    const d = e.key === "ArrowLeft" ? -0.1 : 0.1;
                    const nIn =
                      edge === "in" ? Math.max(0, Math.min(outSec - minSpan, inSec + d)) : inSec;
                    const nOut =
                      edge === "out"
                        ? Math.min(total, Math.max(inSec + minSpan, outSec + d))
                        : outSec;
                    onChange(
                      edge === "in"
                        ? tk("app-audio-audio-clip-editor.trim-and-speed.on-change.5fbaab3a8440.2")
                        : tk("app-audio-audio-clip-editor.trim-and-speed.on-change.77c2cb82e81a.2"),
                      withTrim(clip, nIn, nOut),
                    );
                  }}
                  className="absolute inset-y-0 z-10 w-2.5 -translate-x-1/2 cursor-ew-resize rounded-sm bg-accent-warm focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-default"
                  style={{ left: pctPos(edge === "in" ? shownIn : shownOut) }}
                />
              ))}
            </>
          ) : (
            <p className="absolute inset-0 flex items-center justify-center text-xs text-text-tertiary">
              {tk("app-audio-audio-clip-editor.trim-and-speed.p.815c2f3377d3")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
