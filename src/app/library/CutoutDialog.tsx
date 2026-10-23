/**
 * Frilegg et bilde (DEC-0053, REQ-0580): gratis, i nettleseren. Et automatisk forslag fjerner bakgrunnen
 * ut fra fargen langs kanten; penselen legger til eller fjerner (med angre). Resultatet lagres som en ny
 * versjon i samme variant – originalen beholdes. Bildet sendes ingen steder for å friegges.
 */
import { ResizableDialogContent } from "@/app/shared/ResizableDialogContent";
import {
  Brush,
  Eraser,
  FlipHorizontal2,
  FlipVertical2,
  Loader2,
  Maximize2,
  Minus,
  Paintbrush,
  Plus,
  Redo2,
  Scissors,
  Undo2,
  Wand2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CUTOUT_MAX_PIXELS,
  DEFAULT_CUTOUT,
  alphaBounds,
  autoMask,
  paddedBox,
  trimPadding,
  worthTrimming,
  flipInPlace,
  keptShare,
  paintMask,
  paintPixels,
  type Asset,
  type AssetVersion,
  L,
} from "@/core";
import type { Commands } from "@/app/project/use-commands";
import { uploadAssetImage, useImageUrls } from "./asset-images";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { t as tk } from "@/core/i18n/keyed";

type Backdrop = "checker" | "dark" | "light";

/** Bildet dekodet: createImageBitmap, ellers via et <img> (noen formater, f.eks. SVG, og eldre Safari). */
async function decodeImage(
  blob: Blob,
): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  try {
    const b = await createImageBitmap(blob);
    return { source: b, width: b.width, height: b.height, close: () => b.close() };
  } catch {
    const u = URL.createObjectURL(blob);
    try {
      const img = new Image();
      img.src = u;
      await img.decode();
      const width = img.naturalWidth || 512;
      const height = img.naturalHeight || 512;
      return { source: img, width, height, close: () => URL.revokeObjectURL(u) };
    } catch (e) {
      URL.revokeObjectURL(u);
      throw e;
    }
  }
}
/** Angrehistorikken holdes under ~200 MB (én maske er én byte per piksel). */
const HISTORY_BYTES = 200 * 1024 * 1024;
const historyLimit = (pixels: number) =>
  Math.max(3, Math.min(30, Math.floor(HISTORY_BYTES / pixels)));

export function CutoutDialog({
  open,
  onOpenChange,
  projectId,
  asset,
  version,
  cmds,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  asset: Asset;
  version: AssetVersion | null;
  cmds: Commands;
  /** Den nye versjonen er lagret (f.eks. for å ta den i bruk på et lag). */
  onSaved?: (versionId: string, variantId: string) => void;
}) {
  return (
    <Dialog open={open && version !== null} onOpenChange={onOpenChange}>
      <ResizableDialogContent uiId="V-066" sizeKey="cutout" className="max-h-[92vh] max-w-[980px] overflow-y-auto border-border bg-surface-2">
        {version ? (
          <Editor
            key={version.id}
            projectId={projectId}
            asset={asset}
            version={version}
            cmds={cmds}
            onClose={() => onOpenChange(false)}
            {...(onSaved ? { onSaved } : {})}
          />
        ) : null}
      </ResizableDialogContent>
    </Dialog>
  );
}

interface Source {
  readonly w: number;
  readonly h: number;
  readonly pixels: Uint8ClampedArray;
  readonly scaled: boolean;
}

/** Et steg i angrehistorikken: masken før, et tegnestrøk (området før) eller en speilvending. */
type Entry =
  | { readonly kind: "mask"; readonly mask: Uint8Array }
  | {
      readonly kind: "paint";
      readonly mask: Uint8Array;
      readonly box: { x: number; y: number; w: number; h: number };
      readonly pixels: Uint8ClampedArray;
    }
  | { readonly kind: "flip"; readonly axis: "x" | "y" };

/** Hex-farge (#rrggbb) til RGB. */
function rgbOf(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const n = m ? parseInt(m[1]!, 16) : 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function Editor({
  projectId,
  asset,
  version,
  cmds,
  onClose,
  onSaved,
}: {
  projectId: string;
  asset: Asset;
  version: AssetVersion;
  cmds: Commands;
  onClose: () => void;
  onSaved?: (versionId: string, variantId: string) => void;
}) {
  const url = useImageUrls([version.mediaPath]).data?.[version.mediaPath];
  const [src, setSrc] = useState<Source | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tolerance, setTolerance] = useState(DEFAULT_CUTOUT.tolerance);
  const [feather, setFeather] = useState(DEFAULT_CUTOUT.feather);
  const [tool, setTool] = useState<"remove" | "add" | "paint">("remove");
  /** Fargen tegnepenselen maler med (DEC-0079). */
  const [color, setColor] = useState("#1a2233");
  /** Speilvendt og tegnet på (står i merknaden til den nye versjonen). */
  const [flipped, setFlipped] = useState<{ x: boolean; y: boolean }>({ x: false, y: false });
  const [painted, setPainted] = useState(false);
  const [size, setSize] = useState(24);
  const [backdrop, setBackdrop] = useState<Backdrop>("checker");
  const [busy, setBusy] = useState<"load" | "auto" | "save" | null>("load");
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [kept, setKept] = useState(1);
  const mask = useRef<Uint8Array | null>(null);
  const undo = useRef<Entry[]>([]);
  const redo = useRef<Entry[]>([]);
  /** Pikslene før et tegnestrøk (området lagres i historikken når strøket er ferdig). */
  const strokeBefore = useRef<{ pixels: Uint8ClampedArray; mask: Uint8Array } | null>(null);
  const strokeBox = useRef<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  /** Bildet med gjennomsiktighet, i full oppløsning (oppdateres bare der penselen har vært). */
  const work = useRef<{ canvas: HTMLCanvasElement; img: ImageData } | null>(null);
  const view = useRef<HTMLCanvasElement>(null);
  const stroke = useRef<{ pointerId: number; pts: { x: number; y: number }[] } | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  /** Fjern luften rundt figuren når den lagres (DEC-0080). */
  const [trim, setTrim] = useState(true);
  /** Zoom og flytting i visningen (DEC-0080): null = tilpasset vinduet. Bildepiksel → skjerm: p·z + (x, y). */
  const [zoomView, setZoomView] = useState<{ z: number; x: number; y: number } | null>(null);
  const holder = useRef<HTMLDivElement>(null);
  const [vpW, setVpW] = useState(900);
  const pan = useRef<{ pointerId: number; sx: number; sy: number; vx: number; vy: number } | null>(
    null,
  );
  const spaceDown = useRef(false);

  // Hent bildet (som blob, så lerretet ikke blir «skittent» av en annen opprinnelse)
  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok)
          throw new Error(
            res.status === 400 || res.status === 403
              ? tk("app-library-cutout-dialog.editor.async-try-const-res-await-fetch-url-if-res-ok-throw-new-error-res-status-400-res-status-403-l-lenken-har-g-tt-ut-lukk-og-pne-vinduet-igjen-the-link-has-expired-close-and-reopen-the-window-l-feil-res-status-error-res-status-const-blob-await-res-blob-const-bmp-await-decode-image-blob-const-k-math-min-1-math-sqrt-cutout-max-pixels-bmp-width-bmp-height-const-w-math-max-1-math-round-bmp-width-k-const-h-math-max-1-math-round-bmp-height-k-const-c-document-create-element-canvas-c-width-w-c-height-h-const-ctx-c-get-context-2d-will-read-frequently-true-ctx-draw-image-bmp-source-0-0-w-h-bmp-close-const-img-ctx-get-image-data-0-0-w-h-if-cancelled-return-work-current-canvas-c-img-new-image-data-new-uint8clamped-array-img-data-w-h-set-src-w-h-pixels-img-data-scaled-k-1-catch-e-if-cancelled-set-load-error-l-bildet-kunne-ikke-hentes-e-as-error-message-the-image-could-not-be-fetched-e-as-error-message-finally-if-cancelled-set-busy-null.2c8e61fb3e8f")
              : tk("app-library-cutout-dialog.editor.async-try-const-res-await-fetch-url-if-res-ok-throw-new-error-res-status-400-res-status-403-l-lenken-har-g-tt-ut-lukk-og-pne-vinduet-igjen-the-link-has-expired-close-and-reopen-the-window-l-feil-res-status-error-res-status-const-blob-await-res-blob-const-bmp-await-decode-image-blob-const-k-math-min-1-math-sqrt-cutout-max-pixels-bmp-width-bmp-height-const-w-math-max-1-math-round-bmp-width-k-const-h-math-max-1-math-round-bmp-height-k-const-c-document-create-element-canvas-c-width-w-c-height-h-const-ctx-c-get-context-2d-will-read-frequently-true-ctx-draw-image-bmp-source-0-0-w-h-bmp-close-const-img-ctx-get-image-data-0-0-w-h-if-cancelled-return-work-current-canvas-c-img-new-image-data-new-uint8clamped-array-img-data-w-h-set-src-w-h-pixels-img-data-scaled-k-1-catch-e-if-cancelled-set-load-error-l-bildet-kunne-ikke-hentes-e-as-error-message-the-image-could-not-be-fetched-e-as-error-message-finally-if-cancelled-set-busy-null.d1f68b901710", { status: String(res.status) }),
          );
        const blob = await res.blob();
        const bmp = await decodeImage(blob);
        const k = Math.min(1, Math.sqrt(CUTOUT_MAX_PIXELS / (bmp.width * bmp.height)));
        const w = Math.max(1, Math.round(bmp.width * k));
        const h = Math.max(1, Math.round(bmp.height * k));
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        const ctx = c.getContext("2d", { willReadFrequently: true })!;
        ctx.drawImage(bmp.source, 0, 0, w, h);
        bmp.close();
        const img = ctx.getImageData(0, 0, w, h);
        if (cancelled) return;
        work.current = { canvas: c, img: new ImageData(new Uint8ClampedArray(img.data), w, h) };
        setSrc({ w, h, pixels: img.data, scaled: k < 1 });
      } catch (e) {
        if (!cancelled)
          setLoadError(
            tk("app-library-cutout-dialog.editor.set-load-error.c6d0e5541b19", { message: String((e as Error).message) }),
          );
      } finally {
        if (!cancelled) setBusy(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);

  /** Skriv masken inn i arbeidsbildet innenfor et område (hele bildet når det ikke er gitt). */
  const compose = useCallback(
    (box?: { x0: number; y0: number; x1: number; y1: number }) => {
      const s = src;
      const m = mask.current;
      const wk = work.current;
      if (!s || !m || !wk) return;
      const { w, h } = s;
      const b = box ?? { x0: 0, y0: 0, x1: w - 1, y1: h - 1 };
      const d = wk.img.data;
      for (let y = Math.max(0, b.y0); y <= Math.min(h - 1, b.y1); y++)
        for (let x = Math.max(0, b.x0); x <= Math.min(w - 1, b.x1); x++) {
          const i = y * w + x;
          d[i * 4 + 3] = Math.round((s.pixels[i * 4 + 3]! * m[i]!) / 255);
        }
      const ctx = wk.canvas.getContext("2d")!;
      const bx = Math.max(0, b.x0);
      const by = Math.max(0, b.y0);
      ctx.putImageData(
        wk.img,
        0,
        0,
        bx,
        by,
        Math.min(w - 1, b.x1) - bx + 1,
        Math.min(h - 1, b.y1) - by + 1,
      );
      setTick((t) => t + 1);
    },
    [src],
  );

  const record = (e: Entry) => {
    undo.current.push(e);
    if (undo.current.length > historyLimit(mask.current?.length ?? 1)) undo.current.shift();
    redo.current = [];
  };
  const pushHistory = () => {
    if (!mask.current) return;
    record({ kind: "mask", mask: new Uint8Array(mask.current) });
  };

  /** Et område av pikslene (RGBA). */
  const region = (b: { x: number; y: number; w: number; h: number }) => {
    const s = src!;
    const out = new Uint8ClampedArray(b.w * b.h * 4);
    for (let y = 0; y < b.h; y++)
      out.set(
        s.pixels.subarray(((b.y + y) * s.w + b.x) * 4, ((b.y + y) * s.w + b.x + b.w) * 4),
        y * b.w * 4,
      );
    return out;
  };
  /** Skriv et område tilbake i pikslene og arbeidsbildet (farge; alfa settes av compose). */
  const writeRegion = (
    b: { x: number; y: number; w: number; h: number },
    px: Uint8ClampedArray,
  ) => {
    const s = src!;
    const wk = work.current!;
    for (let y = 0; y < b.h; y++) {
      const row = px.subarray(y * b.w * 4, (y + 1) * b.w * 4);
      s.pixels.set(row, ((b.y + y) * s.w + b.x) * 4);
      wk.img.data.set(row, ((b.y + y) * s.w + b.x) * 4);
    }
  };
  /** Speilvend bilde, maske og arbeidsbilde (sin egen invers). */
  const flipAll = (axis: "x" | "y") => {
    const s = src;
    const wk = work.current;
    if (!s || !wk || !mask.current) return;
    flipInPlace(s.pixels, s.w, s.h, 4, axis);
    flipInPlace(wk.img.data, s.w, s.h, 4, axis);
    flipInPlace(mask.current, s.w, s.h, 1, axis);
    setFlipped((f) => ({ ...f, [axis]: !f[axis] }));
    compose();
  };

  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const runAuto = useCallback(
    (record: boolean) => {
      if (!src) return;
      setBusy("auto");
      // La vinduet tegne «Lager forslag …» før regnestykket
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        if (record && mask.current) pushHistory();
        mask.current = autoMask(src.pixels, src.w, src.h, { tolerance, feather });
        setKept(keptShare(mask.current));
        compose();
        setBusy(null);
      }, 30);
    },
    [src, tolerance, feather, compose],
  );

  // Første forslag når bildet er hentet
  useEffect(() => {
    if (src && !mask.current) runAuto(false);
  }, [src, runAuto]);

  function step(from: React.MutableRefObject<Entry[]>, to: React.MutableRefObject<Entry[]>) {
    const prev = from.current.pop();
    if (!prev || !mask.current) return;
    if (prev.kind === "flip") {
      to.current.push(prev);
      flipAll(prev.axis);
      return;
    }
    if (prev.kind === "paint") {
      to.current.push({
        kind: "paint",
        mask: mask.current,
        box: prev.box,
        pixels: region(prev.box),
      });
      writeRegion(prev.box, prev.pixels);
    } else to.current.push({ kind: "mask", mask: mask.current });
    mask.current = prev.mask;
    setKept(keptShare(prev.mask));
    compose();
  }

  // ⌘Z / ⇧⌘Z i vinduet
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (!(e.metaKey || e.ctrlKey) || (key !== "z" && key !== "y")) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.shiftKey || key === "y") step(redo, undo);
      else step(undo, redo);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compose]);

  // Visningen (DEC-0080): et fast vindu der bildet kan zoomes og flyttes; standard er hele bildet synlig
  useEffect(() => {
    const el = holder.current;
    if (!el) return;
    const measure = () => setVpW(Math.max(240, Math.min(940, el.clientWidth - 16)));
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [src]);
  const box = useMemo(() => {
    if (!src) return { w: 0, h: 0, k: 1 };
    const maxH = Math.max(240, Math.round(window.innerHeight * 0.58));
    const k = Math.min(vpW / src.w, maxH / src.h, 4);
    // Vinduet er like bredt som plassen tillater og høyt nok for bildet tilpasset
    return { w: vpW, h: Math.round(src.h * k), k };
  }, [src, vpW]);
  const fitView = useMemo(
    () =>
      src ? { z: box.k, x: (box.w - src.w * box.k) / 2, y: (box.h - src.h * box.k) / 2 } : null,
    [src, box],
  );
  const v = zoomView ?? fitView ?? { z: 1, x: 0, y: 0 };
  const zoomAt = (z: number, at?: { x: number; y: number }) => {
    const p = at ?? { x: box.w / 2, y: box.h / 2 };
    const nz = Math.min(16, Math.max(0.05, z));
    const k = nz / v.z;
    setZoomView({ z: nz, x: p.x - (p.x - v.x) * k, y: p.y - (p.y - v.y) * k });
  };
  // Rullehjulet zoomer i bildet, ikke dialogen
  useEffect(() => {
    const c = view.current;
    if (!c) return;
    const stop = (e: WheelEvent) => e.preventDefault();
    c.addEventListener("wheel", stop, { passive: false });
    return () => c.removeEventListener("wheel", stop);
  }, [src]);
  // Mellomrom + dra flytter bildet (som i scenen)
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !(e.target instanceof HTMLInputElement)) {
        spaceDown.current = true;
        e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") spaceDown.current = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);
  useEffect(() => {
    const c = view.current;
    const wk = work.current;
    if (!c || !wk || box.w === 0 || !src) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(box.w * dpr);
    c.height = Math.round(box.h * dpr);
    const ctx = c.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#101114";
    ctx.fillRect(0, 0, box.w, box.h);
    const iw = src.w * v.z;
    const ih = src.h * v.z;
    ctx.save();
    ctx.beginPath();
    ctx.rect(v.x, v.y, iw, ih);
    ctx.clip();
    if (backdrop === "checker") {
      const s = 12;
      for (let y = 0; y < box.h; y += s)
        for (let x = 0; x < box.w; x += s) {
          ctx.fillStyle = ((x + y) / s) % 2 === 0 ? "#cfcfcf" : "#ffffff";
          ctx.fillRect(x, y, s, s);
        }
    } else {
      ctx.fillStyle = backdrop === "dark" ? "#16181d" : "#f4f4f4";
      ctx.fillRect(0, 0, box.w, box.h);
    }
    // Skarpe piksler når det er zoomet langt inn, ellers jevnt
    ctx.imageSmoothingEnabled = v.z < 2;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(wk.canvas, v.x, v.y, iw, ih);
    ctx.restore();
    if (cursor) {
      ctx.strokeStyle = tool === "add" ? "#22c55e" : tool === "paint" ? color : "#ef4444";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cursor.x, cursor.y, Math.max(1, size * v.z), 0, Math.PI * 2);
      ctx.stroke();
    }
  }, [tick, box, backdrop, cursor, size, tool, color, src, v.x, v.y, v.z]);

  const toImage = (e: React.PointerEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    return {
      sx: e.clientX - r.left,
      sy: e.clientY - r.top,
      x: (e.clientX - r.left - v.x) / v.z,
      y: (e.clientY - r.top - v.y) / v.z,
    };
  };

  function paint(pts: { x: number; y: number }[]) {
    if (!src || !mask.current || pts.length === 0) return;
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const b = {
      x0: Math.floor(Math.min(...xs) - size - 1),
      y0: Math.floor(Math.min(...ys) - size - 1),
      x1: Math.ceil(Math.max(...xs) + size + 1),
      y1: Math.ceil(Math.max(...ys) + size + 1),
    };
    if (tool === "paint") {
      // Tegn med farge: inn i pikslene (og arbeidsbildet), og gjør området synlig i masken
      paintPixels(src.pixels, src.w, src.h, {
        points: pts,
        radius: size,
        hardness: 0.7,
        color: rgbOf(color),
      });
      const wk = work.current!;
      for (let y = Math.max(0, b.y0); y <= Math.min(src.h - 1, b.y1); y++) {
        const a = (y * src.w + Math.max(0, b.x0)) * 4;
        const z = (y * src.w + Math.min(src.w - 1, b.x1) + 1) * 4;
        wk.img.data.set(src.pixels.subarray(a, z), a);
      }
      paintMask(mask.current, src.w, src.h, {
        points: pts,
        radius: size,
        mode: "add",
        hardness: 0.7,
      });
      const sb = strokeBox.current;
      strokeBox.current = sb
        ? {
            x0: Math.min(sb.x0, b.x0),
            y0: Math.min(sb.y0, b.y0),
            x1: Math.max(sb.x1, b.x1),
            y1: Math.max(sb.y1, b.y1),
          }
        : b;
    } else
      paintMask(mask.current, src.w, src.h, {
        points: pts,
        radius: size,
        mode: tool,
        hardness: 0.7,
      });
    compose(b);
  }

  /** Avslutt et tegnestrøk: området før strøket legges i historikken. */
  function endStroke() {
    const before = strokeBefore.current;
    const sb = strokeBox.current;
    strokeBefore.current = null;
    strokeBox.current = null;
    if (!before || !sb || !src) return;
    const x = Math.max(0, sb.x0);
    const y = Math.max(0, sb.y0);
    const box = {
      x,
      y,
      w: Math.min(src.w - 1, sb.x1) - x + 1,
      h: Math.min(src.h - 1, sb.y1) - y + 1,
    };
    const px = new Uint8ClampedArray(box.w * box.h * 4);
    for (let r = 0; r < box.h; r++)
      px.set(
        before.pixels.subarray(((y + r) * src.w + x) * 4, ((y + r) * src.w + x + box.w) * 4),
        r * box.w * 4,
      );
    record({ kind: "paint", mask: before.mask, box, pixels: px });
    setPainted(true);
  }

  async function save() {
    if (!src || !mask.current || !work.current) return;
    setBusy("save");
    setError(null);
    try {
      compose();
      // Fjern luften rundt figuren (DEC-0080): beskjær tett rundt det synlige, med litt luft
      let out = work.current!.canvas;
      let trimmed: { w: number; h: number } | null = null;
      if (trim) {
        const b = alphaBounds(work.current!.img.data, src.w, src.h);
        if (b && worthTrimming(b, src.w, src.h)) {
          const pb = paddedBox(b, trimPadding(b), src.w, src.h);
          const c = document.createElement("canvas");
          c.width = pb.w;
          c.height = pb.h;
          c.getContext("2d")!.drawImage(out, pb.x, pb.y, pb.w, pb.h, 0, 0, pb.w, pb.h);
          out = c;
          trimmed = { w: pb.w, h: pb.h };
        }
      }
      const blob = await new Promise<Blob>((ok, fail) =>
        out.toBlob(
          (b) =>
            b
              ? ok(b)
              : fail(new Error(tk("app-library-cutout-dialog.blob.fail.7baa99e6f3b7"))),
          "image/png",
        ),
      );
      const base = asset.name.replace(/[^\p{L}\p{N}_-]+/gu, "_").slice(0, 60) || "bilde";
      const file = new File([blob], `${base}-frilagt.png`, { type: "image/png" });
      const { versionId, media } = await uploadAssetImage(projectId, asset.id, file);
      const r = await cmds.runAndWait(
        {
          type: "AddAssetVersion",
          versionId: versionId as never,
          variantId: version.variantId,
          media,
          // REQ-0037: kilden som permanent ID (nummeret i merknaden er bare tekst)
          derivedFromVersionId: version.id,
          // i18n-ignore (merknaden leses av provenance.ts)
          note: `Frilagt fra v${version.number}${src.scaled ? " (skalert ned)" : ""}${
            flipped.x || flipped.y
              ? `, speilvendt ${[flipped.x ? "vannrett" : "", flipped.y ? "loddrett" : ""].filter(Boolean).join(" og ")}`
              : ""
          }${painted ? ", tegnet på" : ""}${
            trimmed ? `, luften rundt fjernet (${trimmed.w} × ${trimmed.h} px)` : ""
          }`,
        },
        tk("app-library-cutout-dialog.r.cmds-run-and-wait.82b2cc47596c", { name: String(asset.name) }),
      );
      if (r.error) throw new Error(r.error);
      onSaved?.(versionId, version.variantId);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const seg = (on: boolean) =>
    "h-7 rounded-sm px-2 text-xs " +
    (on ? "bg-accent-selection text-text-primary" : "text-text-secondary hover:bg-surface-3");
  const label = "flex items-center gap-2 text-xs text-text-secondary";

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {tk("app-library-cutout-dialog.editor.dialog-title.88bcec1459bc", { name: String(asset.name), number: String(version.number) })}
        </DialogTitle>
        <DialogDescription>
          {tk("app-library-cutout-dialog.editor.dialog-description.1b177d85e268")}
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className={label}>
          {tk("app-library-cutout-dialog.editor.label.3c80dfcb2c4a")}
          <input
            type="range"
            min={0}
            max={100}
            value={tolerance}
            onChange={(e) => setTolerance(Number(e.target.value))}
            className="w-28 accent-[var(--accent-brand)]"
          />
          <span className="w-7 tabular-nums">{tolerance}</span>
        </label>
        <label className={label}>
          {tk("app-library-cutout-dialog.editor.label.8d994ccffbb7")}
          <input
            type="range"
            min={0}
            max={4}
            value={feather}
            onChange={(e) => setFeather(Number(e.target.value))}
            className="w-16 accent-[var(--accent-brand)]"
          />
        </label>
        <Button
          size="sm"
          variant="secondary"
          disabled={!src || !!busy}
          onClick={() => runAuto(true)}
        >
          <Wand2 />
          {tk("app-library-cutout-dialog.editor.button.2da3b50c8d02")}
        </Button>
        <div className="h-5 w-px bg-border" aria-hidden />
        <div role="group" aria-label={tk("app-library-cutout-dialog.editor.aria-label.54fd552b7963")} className="flex items-center gap-0.5">
          <button
            type="button"
            aria-pressed={tool === "remove"}
            className={seg(tool === "remove")}
            onClick={() => setTool("remove")}
          >
            <Eraser className="mr-1 inline size-3.5" aria-hidden />
            {tk("app-library-cutout-dialog.editor.button.c2829357228e")}
          </button>
          <button
            type="button"
            aria-pressed={tool === "add"}
            className={seg(tool === "add")}
            onClick={() => setTool("add")}
          >
            <Brush className="mr-1 inline size-3.5" aria-hidden />
            {tk("app-library-cutout-dialog.editor.button.282f8c951060")}
          </button>
          <button
            type="button"
            aria-pressed={tool === "paint"}
            className={seg(tool === "paint")}
            onClick={() => setTool("paint")}
            title={tk("app-library-cutout-dialog.editor.title.c0fa2a3e9759")}
          >
            <Paintbrush className="mr-1 inline size-3.5" aria-hidden />
            {tk("app-library-cutout-dialog.editor.button.2d5158c89ade")}
          </button>
          {tool === "paint" ? (
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              aria-label={tk("app-library-cutout-dialog.editor.aria-label.4504bcd05ebb")}
              className="ml-1 h-7 w-8 cursor-pointer rounded-sm border border-border-control bg-surface-3"
            />
          ) : null}
        </div>
        <div role="group" aria-label={tk("app-library-cutout-dialog.editor.aria-label.f595f6f1f54e")} className="flex items-center gap-0.5">
          <Button
            size="sm"
            variant="ghost"
            disabled={!src || !!busy}
            onClick={() => {
              record({ kind: "flip", axis: "x" });
              flipAll("x");
            }}
            title={tk("app-library-cutout-dialog.editor.title.06d5ca23b0df")}
          >
            <FlipHorizontal2 /> {tk("app-library-cutout-dialog.editor.button.f595f6f1f54e")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            aria-label={tk("app-library-cutout-dialog.editor.aria-label.1592ab60ea46")}
            disabled={!src || !!busy}
            onClick={() => {
              record({ kind: "flip", axis: "y" });
              flipAll("y");
            }}
            title={tk("app-library-cutout-dialog.editor.title.a6d22c27b02f")}
          >
            <FlipVertical2 />
          </Button>
        </div>
        <label className={label}>
          {tk("app-library-cutout-dialog.editor.label.d4cc3816922e")}
          <input
            type="range"
            min={2}
            max={Math.max(40, Math.round((src ? Math.max(src.w, src.h) : 400) / 6))}
            value={size}
            onChange={(e) => setSize(Number(e.target.value))}
            className="w-24 accent-[var(--accent-brand)]"
          />
        </label>
        <Button
          size="sm"
          variant="ghost"
          aria-label={tk("app-library-cutout-dialog.editor.aria-label.5e440908b18b")}
          title={tk("app-library-cutout-dialog.editor.title.fc3b9294ef72")}
          disabled={!!busy}
          onClick={() => step(undo, redo)}
        >
          <Undo2 />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          aria-label={tk("app-library-cutout-dialog.editor.aria-label.a2e598242fea")}
          title={tk("app-library-cutout-dialog.editor.title.b61904c034f4")}
          disabled={!!busy}
          onClick={() => step(redo, undo)}
        >
          <Redo2 />
        </Button>
        <div
          role="group"
          aria-label={tk("app-library-cutout-dialog.editor.aria-label.87cb6769faa2")}
          className="ml-auto flex items-center gap-0.5"
        >
          {(
            [
              ["checker", tk("app-library-cutout-dialog.editor.checker-l-rutet-checkered-dark-l-m-rk-dark-light-l-lys-light-as-const-map.3d7c273c809d")],
              ["dark", tk("app-library-cutout-dialog.editor.checker-l-rutet-checkered-dark-l-m-rk-dark-light-l-lys-light-as-const-map.049acd949d04")],
              ["light", tk("app-library-cutout-dialog.editor.checker-l-rutet-checkered-dark-l-m-rk-dark-light-l-lys-light-as-const-map.c462797af573")],
            ] as const
          ).map(([id, text]) => (
            <button
              key={id}
              type="button"
              aria-pressed={backdrop === id}
              className={seg(backdrop === id)}
              onClick={() => setBackdrop(id)}
            >
              {text}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1 text-xs text-text-secondary">
        <Button
          size="sm"
          variant="ghost"
          aria-label={tk("app-library-cutout-dialog.editor.aria-label.cfb5e40bad89")}
          onClick={() => zoomAt(v.z / 1.5)}
        >
          <Minus />
        </Button>
        <span className="w-12 text-center font-mono tabular-nums">{Math.round(v.z * 100)} %</span>
        <Button
          size="sm"
          variant="ghost"
          aria-label={tk("app-library-cutout-dialog.editor.aria-label.29435e6752c4")}
          onClick={() => zoomAt(v.z * 1.5)}
        >
          <Plus />
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setZoomView(null)}>
          <Maximize2 /> {tk("app-library-cutout-dialog.editor.button.b913966d6787")}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => zoomAt(1)}>
          100 %
        </Button>
        <span className="text-text-tertiary">
          {tk("app-library-cutout-dialog.editor.span.576f4e6e04e3")}
        </span>
      </div>
      <div
        ref={holder}
        className="relative flex min-h-[240px] items-center justify-center rounded-sm border border-border bg-surface-1 p-2"
      >
        {loadError ? (
          <p role="alert" className="text-xs text-status-danger">
            {loadError}
          </p>
        ) : src ? (
          <canvas
            ref={view}
            role="img"
            aria-label={tk("app-library-cutout-dialog.editor.aria-label.1a594b1c83ef")}
            style={{ width: box.w, height: box.h, cursor: pan.current ? "grabbing" : "none" }}
            className="touch-none"
            onWheel={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              zoomAt(v.z * Math.exp(-e.deltaY * 0.0015), {
                x: e.clientX - r.left,
                y: e.clientY - r.top,
              });
            }}
            onPointerDown={(e) => {
              if (busy) return;
              // Flytt visningen: midtre museknapp, eller mellomrom + dra
              if (e.button === 1 || (e.button === 0 && spaceDown.current)) {
                e.preventDefault();
                e.currentTarget.setPointerCapture(e.pointerId);
                pan.current = {
                  pointerId: e.pointerId,
                  sx: e.clientX,
                  sy: e.clientY,
                  vx: v.x,
                  vy: v.y,
                };
                return;
              }
              if (e.button !== 0) return;
              e.currentTarget.setPointerCapture(e.pointerId);
              if (tool === "paint" && src && mask.current)
                // Tegning: området før strøket lagres når strøket er ferdig
                strokeBefore.current = {
                  pixels: new Uint8ClampedArray(src.pixels),
                  mask: new Uint8Array(mask.current),
                };
              else pushHistory();
              const p = toImage(e);
              stroke.current = { pointerId: e.pointerId, pts: [{ x: p.x, y: p.y }] };
              paint([{ x: p.x, y: p.y }]);
            }}
            onPointerMove={(e) => {
              const pn = pan.current;
              if (pn && pn.pointerId === e.pointerId) {
                setZoomView({ z: v.z, x: pn.vx + e.clientX - pn.sx, y: pn.vy + e.clientY - pn.sy });
                return;
              }
              const p = toImage(e);
              setCursor({ x: p.sx, y: p.sy });
              const s = stroke.current;
              if (!s || s.pointerId !== e.pointerId) return;
              const last = s.pts[s.pts.length - 1]!;
              s.pts.push({ x: p.x, y: p.y });
              paint([last, { x: p.x, y: p.y }]);
            }}
            onPointerUp={(e) => {
              if (pan.current?.pointerId === e.pointerId) {
                pan.current = null;
                return;
              }
              stroke.current = null;
              endStroke();
              if (mask.current) setKept(keptShare(mask.current));
            }}
            onPointerCancel={() => {
              pan.current = null;
              stroke.current = null;
              endStroke();
            }}
            onPointerLeave={() => setCursor(null)}
          />
        ) : null}
        {busy ? (
          <span className="absolute inset-0 flex items-center justify-center gap-2 bg-surface-2/60 text-[13px] text-text-secondary">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {busy === "load"
              ? tk("app-library-cutout-dialog.editor.span.f9bee35d3138")
              : busy === "auto"
                ? tk("app-library-cutout-dialog.editor.span.5ce40ba2449d")
                : tk("app-library-cutout-dialog.editor.span.4058c2d03631")}
          </span>
        ) : null}
      </div>
      <p className="text-xs text-text-tertiary">
        {src
          ? (src.scaled ? tk("app-library-cutout-dialog.size-kept-scaled", { w: src.w, h: src.h, percent: Math.round(kept * 100) }) : tk("app-library-cutout-dialog.size-kept", { w: src.w, h: src.h, percent: Math.round(kept * 100) })) +
            (kept > 0.97
              ? tk("app-library-cutout-dialog.editor.p.134340f122e8")
              : kept < 0.03
                ? tk("app-library-cutout-dialog.editor.p.7d352c265cc6")
                : tk("app-library-cutout-dialog.editor.p.e764cb259544"))
          : ""}
      </p>
      {error ? (
        <p role="alert" className="text-xs text-status-danger">
          {error}
        </p>
      ) : null}
      <DialogFooter className="sm:items-center">
        <label
          className="mr-auto flex items-center gap-1.5 text-xs text-text-secondary"
          title={tk("app-library-cutout-dialog.editor.title.4395dd79eb3c")}
        >
          <input
            type="checkbox"
            checked={trim}
            onChange={(e) => setTrim(e.target.checked)}
            className="size-3.5 accent-[var(--accent-brand)]"
          />
          {tk("app-library-cutout-dialog.editor.label.a6a3ad8b5149")}
        </label>
        <Button variant="secondary" disabled={busy === "save"} onClick={onClose}>
          {tk("app-library-cutout-dialog.editor.button.c6da9add20d8")}
        </Button>
        <Button disabled={!src || !!busy} onClick={() => void save()}>
          <Scissors />
          {tk("app-library-cutout-dialog.editor.button.517baced0d51")}
        </Button>
      </DialogFooter>
    </>
  );
}
