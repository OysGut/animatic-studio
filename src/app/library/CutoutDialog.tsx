/**
 * Frilegg et bilde (DEC-0053, REQ-0580): gratis, i nettleseren. Et automatisk forslag fjerner bakgrunnen
 * ut fra fargen langs kanten; penselen legger til eller fjerner (med angre). Resultatet lagres som en ny
 * versjon i samme variant – originalen beholdes. Bildet sendes ingen steder for å friegges.
 */
import { Brush, Eraser, Loader2, Redo2, Scissors, Undo2, Wand2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CUTOUT_MAX_PIXELS,
  DEFAULT_CUTOUT,
  autoMask,
  keptShare,
  paintMask,
  type Asset,
  type AssetVersion,
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
      <DialogContent className="max-h-[92vh] max-w-[980px] overflow-y-auto border-border bg-surface-2">
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
      </DialogContent>
    </Dialog>
  );
}

interface Source {
  readonly w: number;
  readonly h: number;
  readonly pixels: Uint8ClampedArray;
  readonly scaled: boolean;
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
  const [tool, setTool] = useState<"remove" | "add">("remove");
  const [size, setSize] = useState(24);
  const [backdrop, setBackdrop] = useState<Backdrop>("checker");
  const [busy, setBusy] = useState<string | null>("Henter bildet …");
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [kept, setKept] = useState(1);
  const mask = useRef<Uint8Array | null>(null);
  const undo = useRef<Uint8Array[]>([]);
  const redo = useRef<Uint8Array[]>([]);
  /** Bildet med gjennomsiktighet, i full oppløsning (oppdateres bare der penselen har vært). */
  const work = useRef<{ canvas: HTMLCanvasElement; img: ImageData } | null>(null);
  const view = useRef<HTMLCanvasElement>(null);
  const stroke = useRef<{ pointerId: number; pts: { x: number; y: number }[] } | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);

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
              ? "lenken har gått ut – lukk og åpne vinduet igjen"
              : `feil ${res.status}`,
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
        if (!cancelled) setLoadError(`Bildet kunne ikke hentes: ${(e as Error).message}`);
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

  const pushHistory = () => {
    if (!mask.current) return;
    undo.current.push(new Uint8Array(mask.current));
    if (undo.current.length > historyLimit(mask.current.length)) undo.current.shift();
    redo.current = [];
  };

  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const runAuto = useCallback(
    (record: boolean) => {
      if (!src) return;
      setBusy("Lager forslag …");
      // La vinduet tegne «Lager forslag …» før regnestykket
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        if (record && mask.current) {
          undo.current.push(new Uint8Array(mask.current));
          if (undo.current.length > historyLimit(mask.current.length)) undo.current.shift();
          redo.current = [];
        }
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

  function step(
    from: React.MutableRefObject<Uint8Array[]>,
    to: React.MutableRefObject<Uint8Array[]>,
  ) {
    const prev = from.current.pop();
    if (!prev || !mask.current) return;
    to.current.push(mask.current);
    mask.current = prev;
    setKept(keptShare(prev));
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

  // Visningen: bakgrunn og bildet tilpasset vinduet
  const box = useMemo(() => {
    if (!src) return { w: 0, h: 0, k: 1 };
    const maxW = 900;
    const maxH = Math.max(240, Math.round(window.innerHeight * 0.58));
    const k = Math.min(maxW / src.w, maxH / src.h, 4);
    return { w: Math.round(src.w * k), h: Math.round(src.h * k), k };
  }, [src]);
  useEffect(() => {
    const c = view.current;
    const wk = work.current;
    if (!c || !wk || box.w === 0) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(box.w * dpr);
    c.height = Math.round(box.h * dpr);
    const ctx = c.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(wk.canvas, 0, 0, box.w, box.h);
    if (cursor) {
      ctx.strokeStyle = tool === "add" ? "#22c55e" : "#ef4444";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cursor.x, cursor.y, Math.max(1, size * box.k), 0, Math.PI * 2);
      ctx.stroke();
    }
  }, [tick, box, backdrop, cursor, size, tool]);

  const toImage = (e: React.PointerEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    return {
      sx: e.clientX - r.left,
      sy: e.clientY - r.top,
      x: (e.clientX - r.left) / box.k,
      y: (e.clientY - r.top) / box.k,
    };
  };

  function paint(pts: { x: number; y: number }[]) {
    if (!src || !mask.current || pts.length === 0) return;
    paintMask(mask.current, src.w, src.h, { points: pts, radius: size, mode: tool, hardness: 0.7 });
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    compose({
      x0: Math.floor(Math.min(...xs) - size - 1),
      y0: Math.floor(Math.min(...ys) - size - 1),
      x1: Math.ceil(Math.max(...xs) + size + 1),
      y1: Math.ceil(Math.max(...ys) + size + 1),
    });
  }

  async function save() {
    if (!src || !mask.current || !work.current) return;
    setBusy("Lagrer …");
    setError(null);
    try {
      compose();
      const blob = await new Promise<Blob>((ok, fail) =>
        work.current!.canvas.toBlob(
          (b) => (b ? ok(b) : fail(new Error("Bildet kunne ikke lages"))),
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
          note: `Frilagt fra v${version.number}${src.scaled ? " (skalert ned)" : ""}`,
        },
        `Frilagt bilde av «${asset.name}»`,
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
          Frilegg «{asset.name}» (v{version.number})
        </DialogTitle>
        <DialogDescription>
          Bakgrunnen fjernes ut fra fargen langs kanten av bildet. Rett med penselen. Resultatet
          lagres som en ny versjon; originalen beholdes. Gratis – bildet sendes ingen steder.
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className={label}>
          Toleranse
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
          Myk kant
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
          Nytt forslag
        </Button>
        <div className="h-5 w-px bg-border" aria-hidden />
        <div role="group" aria-label="Pensel" className="flex items-center gap-0.5">
          <button
            type="button"
            aria-pressed={tool === "remove"}
            className={seg(tool === "remove")}
            onClick={() => setTool("remove")}
          >
            <Eraser className="mr-1 inline size-3.5" aria-hidden />
            Fjern
          </button>
          <button
            type="button"
            aria-pressed={tool === "add"}
            className={seg(tool === "add")}
            onClick={() => setTool("add")}
          >
            <Brush className="mr-1 inline size-3.5" aria-hidden />
            Legg til
          </button>
        </div>
        <label className={label}>
          Størrelse
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
          aria-label="Angre"
          title="Angre (⌘Z)"
          disabled={!!busy}
          onClick={() => step(undo, redo)}
        >
          <Undo2 />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          aria-label="Gjør om"
          title="Gjør om (⇧⌘Z)"
          disabled={!!busy}
          onClick={() => step(redo, undo)}
        >
          <Redo2 />
        </Button>
        <div
          role="group"
          aria-label="Bakgrunn i visningen"
          className="ml-auto flex items-center gap-0.5"
        >
          {(
            [
              ["checker", "Rutet"],
              ["dark", "Mørk"],
              ["light", "Lys"],
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

      <div className="relative flex min-h-[240px] items-center justify-center rounded-sm border border-border bg-surface-1 p-2">
        {loadError ? (
          <p role="alert" className="text-xs text-status-danger">
            {loadError}
          </p>
        ) : src ? (
          <canvas
            ref={view}
            role="img"
            aria-label="Frilagt bilde"
            style={{ width: box.w, height: box.h, cursor: "none" }}
            className="touch-none"
            onPointerDown={(e) => {
              if (e.button !== 0 || busy) return;
              e.currentTarget.setPointerCapture(e.pointerId);
              pushHistory();
              const p = toImage(e);
              stroke.current = { pointerId: e.pointerId, pts: [{ x: p.x, y: p.y }] };
              paint([{ x: p.x, y: p.y }]);
            }}
            onPointerMove={(e) => {
              const p = toImage(e);
              setCursor({ x: p.sx, y: p.sy });
              const s = stroke.current;
              if (!s || s.pointerId !== e.pointerId) return;
              const last = s.pts[s.pts.length - 1]!;
              s.pts.push({ x: p.x, y: p.y });
              paint([last, { x: p.x, y: p.y }]);
            }}
            onPointerUp={() => {
              stroke.current = null;
              if (mask.current) setKept(keptShare(mask.current));
            }}
            onPointerCancel={() => {
              stroke.current = null;
            }}
            onPointerLeave={() => setCursor(null)}
          />
        ) : null}
        {busy ? (
          <span className="absolute inset-0 flex items-center justify-center gap-2 bg-surface-2/60 text-[13px] text-text-secondary">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {busy}
          </span>
        ) : null}
      </div>
      <p className="text-xs text-text-tertiary">
        {src
          ? `${src.w} × ${src.h} px${src.scaled ? " (skalert ned for frilegging)" : ""} · ${Math.round(kept * 100)} % av bildet beholdes. ` +
            (kept > 0.97
              ? "Nesten ingenting ble fjernet – øk toleransen, eller fjern bakgrunnen med penselen."
              : kept < 0.03
                ? "Nesten alt ble fjernet – senk toleransen."
                : "Fungerer best når bakgrunnen er rolig og ulik figuren.")
          : ""}
      </p>
      {error ? (
        <p role="alert" className="text-xs text-status-danger">
          {error}
        </p>
      ) : null}
      <DialogFooter>
        <Button variant="secondary" disabled={busy === "Lagrer …"} onClick={onClose}>
          Avbryt
        </Button>
        <Button disabled={!src || !!busy} onClick={() => void save()}>
          <Scissors />
          Lagre som ny versjon
        </Button>
      </DialogFooter>
    </>
  );
}
