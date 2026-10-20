/**
 * Stor visning av et bilde (Mars 2026-10-13, DEC-0079/DEC-0080): klikk eller dobbeltklikk på et bilde for å
 * se det stort, zoome og flytte rundt i det. «Tilpass» er standard. Beskrivelsen (prompten) som laget bildet
 * vises ved siden av – den følger bildet og slettes aldri – med «Sett inn denne beskrivelsen».
 *
 * Bildeverktøy (DEC-0080, når visningen får `tools`): frilegg, fjern luften rundt, utsnitt med fri markering
 * (gis navn og legges i et eksisterende eller nytt objekt), del opp i ruter (karakterark), vinkelen bildet
 * viser, lag andre vinkler og oppskaler. Alt lagres som nye versjoner; originalen beholdes.
 *
 * Mars 15.10.2026: delelinjene i «Del opp» kan dras hver for seg, og hver rute får et navn i sidepanelet
 * (rute med fokus: varm gul ramme). «Fjern luften rundt» virker også på hvit/ensfarget bakgrunn. «Lag
 * variasjoner …» ved siden av «Lag andre vinkler …», og «Deler …»: del et bilde i egne objekter (f.eks.
 * dørramme og dørblad) med ankerpunkt.
 */
import {
  Copy,
  Crop,
  Grid3x3,
  Layers,
  Loader2,
  Maximize2,
  Minus,
  Plus,
  Scissors,
  Shrink,
  TextQuote,
  Rotate3d,
  Shuffle,
  ZoomIn,
  Palette,
} from "lucide-react";
import { TurnaroundPanel, UpscalePanel, VariationPanel, ViewLabel } from "./ImageAiPanels";
import { HarmonizePanel } from "./HarmonizePanel";
import { PartsPanel, type PartsTab } from "./ImagePartsPanel";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ASSET_KIND_LABEL, ASSET_KINDS, cellAt, cellsFromLines, evenLines, formatJobTime, jobForResult, jobFromRow, moveLine, newId, polygonBounds, sortedAssets, stripAttachedSection, tileName, type Asset, type AssetKind, type AssetVersion, type PartAnchor, type PixelBox, type ProjectState } from "@/core";
import { fetchJobForResult } from "@/adapters/browser/ai";
import { useAiJobs } from "@/app/ai/use-ai-jobs";
import type { Commands } from "@/app/project/use-commands";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  canvasToPng,
  cropCanvas,
  loadImage,
  noTrimMessage,
  saveImageTo,
  trimCanvasInfo,
  type ImageTarget,
  type Polygon,
} from "./image-actions";
import { t as tk } from "@/core/i18n/keyed";

/** Beskrivelsen som laget filen (fra AI-jobbloggen), eller null når bildet ikke er laget med AI. */
export function useImagePrompt(projectId: string, path: string | null) {
  const jobs = useAiJobs(projectId, !!path);
  const recent = useMemo(
    () => (path ? jobForResult(jobs.data?.jobs ?? [], path) : null),
    [jobs.data, path],
  );
  const older = useQuery({
    queryKey: ["ai-job-for-result", projectId, path],
    enabled: !!path && jobs.isSuccess && !recent,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const r = await fetchJobForResult(projectId, path!);
      return r.data ? jobFromRow(r.data) : null;
    },
  });
  const job = recent ?? older.data ?? null;
  return {
    loading: jobs.isLoading || older.isFetching,
    prompt: job && job.prompt.trim() ? job.prompt : null,
    model: job ? `${job.provider}/${job.model}` : null,
    when: job ? formatJobTime(job.createdAt) : null,
  };
}

const MIN = 0.05;
const MAX = 16;

/** Bildeverktøyene i stor visning (DEC-0080). Utelatt: bare visning og beskrivelse. */
export interface LightboxTools {
  readonly state: ProjectState;
  readonly cmds: Commands;
  readonly asset: Asset;
  readonly editable: boolean;
  /** Åpne frileggingen for bildet. */
  readonly onCutout?: (version: AssetVersion) => void;
  /** Et nytt bilde er lagret (f.eks. for å vise det eller ta det i bruk). */
  readonly onSaved?: (r: { versionId: string; variantId: string; assetId: string }) => void;
  /**
   * P8 «Bruk bare her» (REQ-0141): det harmoniserte bildet brukes bare i plakaten eller scenen som åpnet
   * visningen. Utelatt: valget vises ikke (biblioteket).
   */
  readonly onUseHere?: (versionId: string) => void;
  /**
   * «Legg delene i scenen» (Mars 15.10.2026, «Deler …»): delene som er laget, med plassen i originalbildet
   * (`box`, i `source`-bildets piksler) og ankerpunktet. Utelatt: knappen vises ikke.
   */
  readonly onPlaceParts?: (
    parts: readonly LightboxPart[],
    source: { width: number; height: number },
  ) => void;
}

/** En del av et bilde som eget objekt (Mars 15.10.2026). */
export interface LightboxPart {
  readonly assetId: string;
  readonly versionId: string;
  /** Hvor delen lå i originalbildet (piksler). AI-deler: hele bildet. */
  readonly box: PixelBox;
  /** Ankerpunktet (for et dørblad: hengselsiden). */
  readonly anchor: PartAnchor;
}

type Mode = "view" | "select" | "grid" | "parts";
export type AiPanel = "views" | "upscale" | "variations" | "harmonize";

/** Rutenettet i «Del opp»: antall og delelinjene (brøkdeler 0–1), Mars 15.10.2026. */
interface GridState {
  readonly cols: number;
  readonly rows: number;
  readonly xs: readonly number[];
  readonly ys: readonly number[];
}
const newGrid = (cols: number, rows: number): GridState => ({
  cols,
  rows,
  xs: evenLines(cols),
  ys: evenLines(rows),
});

export function ImageLightbox({
  open,
  onOpenChange,
  projectId,
  version,
  url: urlProp,
  title,
  onInsertPrompt,
  tools,
  initialPanel = null,
}: {
  /** Åpne med et AI-verktøy fremme (f.eks. «Oppskaler» fra advarselen i scenen). */
  initialPanel?: AiPanel | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  version: AssetVersion | null;
  url: string | undefined;
  title: string;
  /** «Sett inn denne beskrivelsen» i genereringsfeltet (utelatt: knappen vises ikke). */
  onInsertPrompt?: (prompt: string) => void;
  tools?: LightboxTools;
}) {
  const info = useImagePrompt(projectId, open && version ? version.mediaPath : null);
  /**
   * Lenken til bildet holdes mens en ny lenke hentes (når en ny versjon lagres, hentes lenkene på nytt og
   * er et øyeblikk tomme): ellers blinker bildet og verktøypanelet tegnes på nytt, så det som er laget i
   * økten (f.eks. delene) ble borte.
   */
  const [held, setHeld] = useState<{ id: string; url: string } | null>(null);
  useEffect(() => {
    if (urlProp && version) setHeld({ id: version.id, url: urlProp });
  }, [urlProp, version]);
  const url = urlProp ?? (held && version && held.id === version.id ? held.url : undefined);
  const box = useRef<HTMLDivElement | null>(null);
  /**
   * Boksen settes når dialogen faktisk er tegnet (den ligger i en portal og finnes ikke ved første effekt –
   * derfor viste «Tilpass» 100 %): målingen og hjulet kobles til elementet når det kommer.
   */
  const [boxEl, setBoxEl] = useState<HTMLDivElement | null>(null);
  const setBox = (el: HTMLDivElement | null) => {
    box.current = el;
    setBoxEl(el);
  };
  const [view, setView] = useState<{ z: number; x: number; y: number } | null>(null);
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const [copied, setCopied] = useState(false);
  /** Bildets egne mål: fra versjonen, ellers fra selve bildefilen når den er lastet. */
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  /** Boksens størrelse, målt når dialogen er tegnet (og når vinduet endres). */
  const [boxSize, setBoxSize] = useState<{ w: number; h: number } | null>(null);
  const [mode, setMode] = useState<Mode>("view");
  /** Den frie markeringen (bildets piksler); `closed` når musen er sluppet. */
  const [poly, setPoly] = useState<{ pts: { x: number; y: number }[]; closed: boolean } | null>(
    null,
  );
  const drawing = useRef<number | null>(null);
  const spaceDown = useRef(false);
  const [grid, setGrid] = useState<GridState>(() => newGrid(4, 1));
  /** Navnene på rutene (fra sidepanelet) og ruten som har fokus (varm gul ramme). */
  const [tileNames, setTileNames] = useState<string[]>([]);
  const [activeTile, setActiveTile] = useState<number | null>(null);
  const tileId = useId();
  /** Delelinjen som dras (pekeren holdes fast på linjen). */
  const lineDrag = useRef<{ axis: "x" | "y"; index: number; pointer: number } | null>(null);
  /** «Deler …»: fanen, og områdene som er fjernet fra originalen i økten (vises skravert). */
  const [partsTab, setPartsTab] = useState<PartsTab>("cut");
  const [erased, setErased] = useState<Polygon[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [panel, setPanel] = useState<AiPanel | null>(initialPanel);

  useEffect(() => {
    setView(null);
    setCopied(false);
    setNatural(null);
    setMode("view");
    setPoly(null);
    setMsg(null);
    setPanel(initialPanel);
    setActiveTile(null);
    setErased([]);
  }, [version?.id, open, initialPanel]);
  useEffect(() => {
    const el = boxEl;
    if (!open || !el) return;
    const measure = () => setBoxSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open, boxEl]);
  // Rullehjulet zoomer i bildet, ikke dialogen; mellomrom + dra flytter (også i markering)
  useEffect(() => {
    const el = boxEl;
    if (!open || !el) return;
    const stop = (e: WheelEvent) => e.preventDefault();
    el.addEventListener("wheel", stop, { passive: false });
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !(e.target instanceof HTMLInputElement)) spaceDown.current = true;
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") spaceDown.current = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      el.removeEventListener("wheel", stop);
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [open, boxEl]);
  const imgW = version?.width || natural?.w || 0;
  const imgH = version?.height || natural?.h || 0;

  // Tilpass (standard): hele bildet synlig og så stort som boksen tillater – også små bilder forstørres
  function fit() {
    if (!boxSize || !boxSize.w || !boxSize.h || !imgW || !imgH) return { z: 1, x: 0, y: 0 };
    const z = Math.min(boxSize.w / imgW, boxSize.h / imgH);
    return { z, x: (boxSize.w - imgW * z) / 2, y: (boxSize.h - imgH * z) / 2 };
  }
  const v = view ?? fit();
  function zoomAt(z: number, at?: { x: number; y: number }) {
    const el = box.current;
    const p = at ?? { x: (el?.clientWidth ?? 0) / 2, y: (el?.clientHeight ?? 0) / 2 };
    const nz = Math.min(MAX, Math.max(MIN, z));
    const k = nz / v.z;
    setView({ z: nz, x: p.x - (p.x - v.x) * k, y: p.y - (p.y - v.y) * k });
  }
  const toImage = (e: React.PointerEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(imgW, Math.max(0, (e.clientX - r.left - v.x) / v.z)),
      y: Math.min(imgH, Math.max(0, (e.clientY - r.top - v.y) / v.z)),
    };
  };
  const toScreen = (p: { x: number; y: number }) => `${p.x * v.z + v.x},${p.y * v.z + v.y}`;

  const canEdit = !!tools?.editable && !!version && version.mimeType.startsWith("image/") && !!url;
  const cells = useMemo(
    () => (mode === "grid" && imgW && imgH ? cellsFromLines(imgW, imgH, grid.xs, grid.ys) : []),
    [mode, imgW, imgH, grid],
  );
  /** Fri markering: i «Utsnitt» og når en del klippes ut. */
  const drawMode = mode === "select" || (mode === "parts" && partsTab === "cut");

  /** Nytt antall kolonner/rader: delelinjene nullstilles (jevnt fordelt). */
  function resizeGrid(g: { cols: number; rows: number }) {
    setGrid(newGrid(g.cols, g.rows));
    setActiveTile(null);
  }
  /** Fokuser navnefeltet for ruten i sidepanelet. */
  function focusTile(i: number) {
    setActiveTile(i);
    // Feltet finnes når panelet er tegnet
    requestAnimationFrame(() => document.getElementById(`${tileId}-tile-${i}`)?.focus());
  }
  /** Delelinjen flyttes til pekerens plass (brøkdel av bildet). */
  function dragLineTo(e: React.PointerEvent<HTMLElement>) {
    const d = lineDrag.current;
    const el = box.current;
    if (!d || d.pointer !== e.pointerId || !el || !imgW || !imgH) return;
    const r = el.getBoundingClientRect();
    const f =
      d.axis === "x"
        ? (e.clientX - r.left - v.x) / v.z / imgW
        : (e.clientY - r.top - v.y) / v.z / imgH;
    setGrid((g) =>
      d.axis === "x"
        ? { ...g, xs: moveLine(g.xs, d.index, f) }
        : { ...g, ys: moveLine(g.ys, d.index, f) },
    );
  }

  /** Kjør en bildejobb (hent bildet, lag nye filer, lagre) med melding og feilhåndtering. */
  async function job(label: string, fn: () => Promise<string>) {
    setBusy(label);
    setMsg(null);
    try {
      setMsg({ kind: "ok", text: await fn() });
    } catch (e) {
      setMsg({ kind: "error", text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  async function trimNow() {
    if (!tools || !version || !url) return;
    await job(tk("app-library-image-lightbox.trim-now.job.fe9d03eca4af"), async () => {
      const src = await loadImage(url);
      const info = trimCanvasInfo(src.canvas);
      if (!("canvas" in info)) throw new Error(noTrimMessage(info.reason));
      const t = info.canvas;
      const file = await canvasToPng(t, `${tools.asset.name}-tett`);
      const r = await saveImageTo(
        tools.cmds.runAndWait,
        tools.state,
        projectId,
        { kind: "existing", assetId: tools.asset.id, variantId: version.variantId },
        file,
        tk("app-library-image-lightbox.r.save-image-to.553398db5c84", { number: String(version.number), width: String(t.width), height: String(t.height) }),
        tk("app-library-image-lightbox.r.save-image-to.10a3fd10fec5", { name: String(tools.asset.name) }),
      );
      if ("error" in r) throw new Error(r.error);
      tools.onSaved?.(r);
      return (
        tk("app-library-image-lightbox.trim-now.job.d16df9bc2dac", { width: String(t.width), height: String(t.height) }) +
        (info.by === "color"
          ? tk("app-library-image-lightbox.trim-now.job.ac476c38ef1c")
          : "")
      );
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="flex h-[min(900px,calc(100vh-48px))] max-w-[min(1400px,calc(100vw-32px))] flex-col border-border bg-surface-2">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {imgW && imgH ? `${imgW} × ${imgH} px. ` : ""}
            {drawMode
              ? tk("app-library-image-lightbox.image-lightbox.dialog-description.2f024db283ed")
              : mode === "grid"
                ? tk("app-library-image-lightbox.image-lightbox.dialog-description.d106631702ca")
                : mode === "parts"
                  ? tk("app-library-image-lightbox.image-lightbox.dialog-description.13eb9bb6f8f8")
                  : tk("app-library-image-lightbox.image-lightbox.dialog-description.afe54a67be63")}
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => zoomAt(v.z / 1.5)}
                aria-label={tk("app-library-image-lightbox.image-lightbox.aria-label.84fc5bc845d1")}
              >
                <Minus />
              </Button>
              <span className="w-14 text-center font-mono text-xs tabular-nums text-text-secondary">
                {Math.round(v.z * 100)} %
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => zoomAt(v.z * 1.5)}
                aria-label={tk("app-library-image-lightbox.image-lightbox.aria-label.83389ff73896")}
              >
                <Plus />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setView(null)}>
                <Maximize2 /> {tk("app-library-image-lightbox.image-lightbox.button.70a5a553290b")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => zoomAt(1)}>
                100 %
              </Button>
            </div>
            <div
              ref={setBox}
              data-testid="lightbox-stage"
              className={
                "relative min-h-0 flex-1 touch-none overflow-hidden rounded-sm bg-[repeating-conic-gradient(var(--surface-3)_0%_25%,var(--surface-1)_0%_50%)] bg-[length:24px_24px] " +
                (drawMode ? "cursor-crosshair" : "cursor-grab active:cursor-grabbing")
              }
              onWheel={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                zoomAt(v.z * Math.exp(-e.deltaY * 0.0015), {
                  x: e.clientX - r.left,
                  y: e.clientY - r.top,
                });
              }}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                if (drawMode && e.button === 0 && !spaceDown.current) {
                  drawing.current = e.pointerId;
                  setPoly({ pts: [toImage(e)], closed: false });
                  return;
                }
                drag.current = { x: e.clientX, y: e.clientY, vx: v.x, vy: v.y };
              }}
              onPointerMove={(e) => {
                if (drawing.current === e.pointerId) {
                  const p = toImage(e);
                  setPoly((cur) => {
                    if (!cur) return cur;
                    const last = cur.pts[cur.pts.length - 1]!;
                    // Et punkt per ~2 skjermpiksler holder markeringen jevn uten tusenvis av punkter
                    if (Math.hypot(p.x - last.x, p.y - last.y) * v.z < 2) return cur;
                    return { pts: [...cur.pts, p], closed: false };
                  });
                  return;
                }
                const d = drag.current;
                if (!d) return;
                setView({ z: v.z, x: d.vx + e.clientX - d.x, y: d.vy + e.clientY - d.y });
              }}
              onPointerUp={(e) => {
                if (drawing.current === e.pointerId) {
                  drawing.current = null;
                  setPoly((cur) => (cur && cur.pts.length >= 3 ? { ...cur, closed: true } : null));
                  return;
                }
                const d = drag.current;
                drag.current = null;
                // Et klikk (ingen flytting) på en rute fokuserer navnefeltet for ruten
                if (mode === "grid" && d && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 4) {
                  const p = toImage(e);
                  const i = cellAt(cells, p.x, p.y);
                  if (i >= 0) focusTile(i);
                }
              }}
            >
              {url ? (
                <img
                  src={url}
                  alt={title}
                  draggable={false}
                  onLoad={(e) =>
                    setNatural({
                      w: e.currentTarget.naturalWidth,
                      h: e.currentTarget.naturalHeight,
                    })
                  }
                  className="absolute left-0 top-0 max-w-none select-none"
                  style={{
                    transform: `translate(${v.x}px, ${v.y}px) scale(${v.z})`,
                    transformOrigin: "0 0",
                    width: imgW || undefined,
                    height: imgH || undefined,
                    // Til målene er kjent, vises bildet ikke (unngår et blink i full størrelse)
                    visibility: imgW && boxSize ? undefined : "hidden",
                  }}
                />
              ) : (
                <p className="absolute inset-0 flex items-center justify-center text-xs text-text-tertiary">
                  {tk("app-library-image-lightbox.image-lightbox.p.5a90f60107ec")}
                </p>
              )}
              {/* Markering og ruter tegnes oppå bildet (skjermkoordinater) */}
              {(drawMode && poly) || erased.length ? (
                <svg
                  aria-hidden
                  className="pointer-events-none absolute inset-0 size-full overflow-visible"
                >
                  {mode === "parts"
                    ? erased.map((pts, i) => (
                        <polygon
                          key={i}
                          data-testid="erased-part"
                          points={pts.map(toScreen).join(" ")}
                          fill="rgb(0 0 0 / 0.55)"
                          stroke="#ffffff"
                          strokeWidth={1}
                          strokeDasharray="3 3"
                        />
                      ))
                    : null}
                  {poly && drawMode ? (
                    <polygon
                      points={poly.pts.map(toScreen).join(" ")}
                      fill={poly.closed ? "rgb(79 140 255 / 0.15)" : "none"}
                      stroke="#4f8cff"
                      strokeWidth={1.5}
                      strokeDasharray={poly.closed ? "6 4" : undefined}
                    />
                  ) : null}
                </svg>
              ) : null}
              {/* Rutene: nummer i hjørnet; ruten med fokus får varm gul ramme (Mars 15.10.2026) */}
              {cells.map((c, i) => {
                const on = activeTile === i;
                return (
                  <div
                    key={`t${i}`}
                    data-testid={`grid-tile-${i + 1}`}
                    data-active={on ? "true" : undefined}
                    aria-hidden
                    className={
                      "pointer-events-none absolute " + (on ? "border-2 border-accent-warm" : "")
                    }
                    style={{
                      left: c.x * v.z + v.x,
                      top: c.y * v.z + v.y,
                      width: c.w * v.z,
                      height: c.h * v.z,
                    }}
                  >
                    <span
                      className={
                        "absolute left-1.5 top-1.5 leading-none " +
                        (on
                          ? "text-base font-bold text-accent-warm"
                          : "rounded-sm bg-media/45 px-1 py-0.5 text-[11px] text-on-media/90")
                      }
                      style={{
                        textShadow: on
                          ? "0 1px 6px rgb(0 0 0 / 0.95), 0 0 3px rgb(0 0 0 / 0.9)"
                          : "0 0 3px rgb(0 0 0 / 0.9)",
                      }}
                    >
                      {i + 1}
                    </span>
                  </div>
                );
              })}
              {/* Delelinjene: dras hver for seg (pekeren holdes på linjen), også med piltastene */}
              {mode === "grid" && imgW && imgH
                ? (["x", "y"] as const).flatMap((axis) =>
                    (axis === "x" ? grid.xs : grid.ys).map((f, i) => {
                      const vertical = axis === "x";
                      const pos = vertical ? f * imgW * v.z + v.x : f * imgH * v.z + v.y;
                      return (
                        <div
                          key={`${axis}${i}`}
                          role="separator"
                          tabIndex={0}
                          data-testid={`grid-line-${axis}-${i + 1}`}
                          aria-orientation={vertical ? "vertical" : "horizontal"}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={Math.round(f * 100)}
                          aria-label={
                            vertical
                              ? tk("app-library-image-lightbox.image-lightbox.aria-label.1fe63ef8ec35", { value1: String(i + 1) })
                              : tk("app-library-image-lightbox.image-lightbox.aria-label.2a58853c65ce", { value1: String(i + 1) })
                          }
                          title={tk("app-library-image-lightbox.image-lightbox.title.724c71b03118")}
                          className={
                            "group absolute z-10 flex touch-none items-center justify-center outline-none " +
                            (vertical ? "w-3 cursor-col-resize" : "h-3 cursor-row-resize")
                          }
                          style={
                            vertical
                              ? { left: pos - 6, top: v.y, height: imgH * v.z }
                              : { top: pos - 6, left: v.x, width: imgW * v.z }
                          }
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            if (e.button !== 0) return;
                            e.currentTarget.setPointerCapture(e.pointerId);
                            lineDrag.current = { axis, index: i, pointer: e.pointerId };
                          }}
                          onPointerMove={(e) => {
                            if (lineDrag.current?.pointer !== e.pointerId) return;
                            e.stopPropagation();
                            dragLineTo(e);
                          }}
                          onPointerUp={(e) => {
                            e.stopPropagation();
                            lineDrag.current = null;
                          }}
                          onKeyDown={(e) => {
                            const step = e.shiftKey ? 0.02 : 0.005;
                            const dir =
                              e.key === (vertical ? "ArrowLeft" : "ArrowUp")
                                ? -1
                                : e.key === (vertical ? "ArrowRight" : "ArrowDown")
                                  ? 1
                                  : 0;
                            if (!dir) return;
                            e.preventDefault();
                            setGrid((g) =>
                              vertical
                                ? { ...g, xs: moveLine(g.xs, i, f + dir * step) }
                                : { ...g, ys: moveLine(g.ys, i, f + dir * step) },
                            );
                          }}
                        >
                          <span
                            className={
                              "pointer-events-none border-dashed border-accent-brand group-hover:border-accent-warm group-focus-visible:border-accent-warm " +
                              (vertical ? "h-full border-l-2" : "w-full border-t-2")
                            }
                            style={{ filter: "drop-shadow(0 0 1px rgb(0 0 0 / 0.8))" }}
                          />
                        </div>
                      );
                    }),
                  )
                : null}
            </div>
          </div>
          <aside
            aria-label={tk("app-library-image-lightbox.image-lightbox.aria-label.b5ae59f68645")}
            className="flex w-[340px] shrink-0 flex-col gap-3 overflow-y-auto rounded-sm border border-border bg-surface-1 p-2"
          >
            {tools && canEdit ? (
              <section
                aria-label={tk("app-library-image-lightbox.image-lightbox.aria-label.5750bf7d33c3")}
                className="flex flex-col gap-2"
              >
                <h3 className="text-[13px] font-medium text-text-primary">
                  {tk("app-library-image-lightbox.image-lightbox.h3.5750bf7d33c3")}
                </h3>
                {mode === "view" ? (
                  <>
                    <div className="flex flex-wrap gap-1.5">
                      {tools.onCutout ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={!!busy}
                          onClick={() => version && tools.onCutout!(version)}
                          title={tk("app-library-image-lightbox.image-lightbox.title.33e3bad6fa05")}
                        >
                          <Scissors /> {tk("app-library-image-lightbox.image-lightbox.button.408f557ce365")}
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={!!busy}
                        onClick={() => void trimNow()}
                        title={tk("app-library-image-lightbox.image-lightbox.title.208a59a6af29")}
                      >
                        <Shrink /> {tk("app-library-image-lightbox.image-lightbox.button.282e98f92d24")}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={!!busy}
                        onClick={() => {
                          setMode("select");
                          setPoly(null);
                          setMsg(null);
                        }}
                        title={tk("app-library-image-lightbox.image-lightbox.title.4908c379bdbc")}
                      >
                        <Crop /> {tk("app-library-image-lightbox.image-lightbox.button.4c8db4438427")}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={!!busy}
                        onClick={() => {
                          setMode("grid");
                          setMsg(null);
                        }}
                        title={tk("app-library-image-lightbox.image-lightbox.title.694681aac8d3")}
                      >
                        <Grid3x3 /> {tk("app-library-image-lightbox.image-lightbox.button.ffd161fd3e71")}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={!!busy}
                        onClick={() => {
                          setMode("parts");
                          setPartsTab("cut");
                          setPoly(null);
                          setErased([]);
                          setMsg(null);
                        }}
                        title={tk("app-library-image-lightbox.image-lightbox.title.936fa9fb8de7")}
                      >
                        <Layers /> {tk("app-library-image-lightbox.image-lightbox.button.d77d3407b95a")}
                      </Button>
                      <Button
                        size="sm"
                        variant={panel === "upscale" ? "default" : "secondary"}
                        disabled={!!busy}
                        onClick={() => setPanel((p) => (p === "upscale" ? null : "upscale"))}
                        title={tk("app-library-image-lightbox.image-lightbox.title.d5a8f1e2eb9e")}
                      >
                        <ZoomIn /> {tk("app-library-image-lightbox.image-lightbox.button.d73b9919a037")}
                      </Button>
                    </div>
                    <ViewLabel tools={tools} version={version!} />
                    {panel === "views" ? (
                      <TurnaroundPanel
                        tools={tools}
                        version={version!}
                        projectId={projectId}
                        onClose={() => setPanel(null)}
                      />
                    ) : panel === "variations" ? (
                      <VariationPanel
                        tools={tools}
                        version={version!}
                        projectId={projectId}
                        onClose={() => setPanel(null)}
                      />
                    ) : panel === "harmonize" ? (
                      <HarmonizePanel
                        tools={tools}
                        version={version!}
                        projectId={projectId}
                        onClose={() => setPanel(null)}
                      />
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={!!busy}
                          onClick={() => setPanel("views")}
                          title={tk("app-library-image-lightbox.image-lightbox.title.f2be8be6af4c")}
                        >
                          <Rotate3d /> {tk("app-library-image-lightbox.image-lightbox.button.5a973df63c8f")}
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={!!busy}
                          onClick={() => setPanel("variations")}
                          title={tk("app-library-image-lightbox.image-lightbox.title.68d3e0b359ce")}
                        >
                          <Shuffle /> {tk("app-library-image-lightbox.image-lightbox.button.646da0c720fb")}
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={!!busy}
                          data-testid="harmonize-open"
                          onClick={() => setPanel("harmonize")}
                          title={tk("app-library-image-lightbox.image-lightbox.title.189db72c5164")}
                        >
                          <Palette /> {tk("app-library-image-lightbox.image-lightbox.button.6015d99f816d")}
                        </Button>
                      </div>
                    )}
                    {panel === "upscale" ? (
                      <UpscalePanel
                        tools={tools}
                        version={version!}
                        projectId={projectId}
                        onClose={() => setPanel(null)}
                      />
                    ) : null}
                  </>
                ) : mode === "select" ? (
                  <SelectionPanel
                    tools={tools}
                    projectId={projectId}
                    version={version!}
                    url={url!}
                    poly={poly?.closed ? poly.pts : null}
                    busy={busy}
                    onJob={job}
                    onRedraw={() => setPoly(null)}
                    onDone={() => {
                      setMode("view");
                      setPoly(null);
                    }}
                  />
                ) : mode === "parts" ? (
                  <PartsPanel
                    tools={tools}
                    projectId={projectId}
                    version={version!}
                    url={url!}
                    poly={poly?.closed ? poly.pts : null}
                    tab={partsTab}
                    onTab={(t) => {
                      setPartsTab(t);
                      setPoly(null);
                    }}
                    busy={busy}
                    onJob={job}
                    onRedraw={() => setPoly(null)}
                    onErased={setErased}
                    onDone={() => {
                      setMode("view");
                      setPoly(null);
                      setErased([]);
                    }}
                  />
                ) : (
                  <GridPanel
                    tools={tools}
                    projectId={projectId}
                    version={version!}
                    url={url!}
                    grid={grid}
                    onGrid={resizeGrid}
                    names={tileNames}
                    onNames={setTileNames}
                    active={activeTile}
                    onActive={setActiveTile}
                    idPrefix={tileId}
                    busy={busy}
                    onJob={job}
                    onDone={() => {
                      setMode("view");
                      setActiveTile(null);
                    }}
                  />
                )}
                {busy ? (
                  <p
                    className="flex items-center gap-1.5 text-xs text-text-secondary"
                    role="status"
                  >
                    <Loader2 className="size-3.5 animate-spin" aria-hidden /> {busy}
                  </p>
                ) : msg ? (
                  <p
                    role={msg.kind === "error" ? "alert" : "status"}
                    className={
                      "text-xs " +
                      (msg.kind === "error" ? "text-status-danger" : "text-status-success")
                    }
                  >
                    {msg.text}
                  </p>
                ) : null}
              </section>
            ) : null}
            <section
              aria-label={tk("app-library-image-lightbox.image-lightbox.aria-label.c543dfa37997")}
              className="flex flex-col gap-2"
            >
              <h3 className="flex items-center gap-1 text-[13px] font-medium text-text-primary">
                <TextQuote className="size-4" aria-hidden />{" "}
                {tk("app-library-image-lightbox.image-lightbox.h3.5e432baf86dc")}
              </h3>
              {info.loading ? (
                <p className="text-xs text-text-tertiary">{tk("app-library-image-lightbox.image-lightbox.p.20a91f3deb1e")}</p>
              ) : info.prompt ? (
                <>
                  <p className="text-[11px] text-text-tertiary">
                    {info.model} · {info.when}
                  </p>
                  <pre className="whitespace-pre-wrap break-words rounded-sm bg-surface-3 p-1.5 font-mono text-[11px] leading-snug text-text-primary">
                    {stripAttachedSection(info.prompt)}
                  </pre>
                  <div className="flex flex-wrap gap-1.5">
                    {onInsertPrompt ? (
                      <Button
                        size="sm"
                        onClick={() => {
                          onInsertPrompt(info.prompt!);
                          onOpenChange(false);
                        }}
                      >
                        <TextQuote /> {tk("app-library-image-lightbox.image-lightbox.button.15018526ca50")}
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        void navigator.clipboard
                          ?.writeText(stripAttachedSection(info.prompt!))
                          .then(() => setCopied(true));
                      }}
                    >
                      <Copy /> {copied ? tk("app-library-image-lightbox.image-lightbox.button.901c339103c5") : tk("app-library-image-lightbox.image-lightbox.button.2714219c21bc")}
                    </Button>
                  </div>
                </>
              ) : (
                <p className="text-xs text-text-tertiary">
                  {tk("app-library-image-lightbox.image-lightbox.p.1778bb211aa3")}
                  {version?.note ? tk("app-library-image-lightbox.image-lightbox.p.45b657b30f51", { note: String(version.note) }) : ""}
                </p>
              )}
            </section>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const field =
  "h-7 w-full rounded-sm border border-border-control bg-surface-3 px-1.5 text-xs text-text-primary";

/** Hvor utsnittet eller rutene skal: et eksisterende objekt (standard: dette) eller et nytt. */
function TargetPicker({
  state,
  asset,
  value,
  onChange,
  allowEach,
}: {
  state: ProjectState;
  asset: Asset;
  value: TargetChoice;
  onChange: (t: TargetChoice) => void;
  /** Rutene: «ett nytt objekt per rute». */
  allowEach?: boolean;
}) {
  const assets = useMemo(
    () => sortedAssets(state).filter((a) => !a.archived && a.kind !== "sound"),
    [state],
  );
  return (
    <fieldset className="flex flex-col gap-1.5 text-xs text-text-secondary">
      <legend className="mb-1">{tk("app-library-image-lightbox.target-picker.legend.384804aaea00")}</legend>
      <label className="flex items-center gap-1.5">
        <input
          type="radio"
          checked={value.kind === "existing"}
          onChange={() => onChange({ ...value, kind: "existing" })}
        />
        {tk("app-library-image-lightbox.target-picker.label.38ffb1de03e1")}
      </label>
      {value.kind === "existing" ? (
        <select
          aria-label={tk("app-library-image-lightbox.target-picker.aria-label.7c65528cbe6b")}
          value={value.assetId}
          onChange={(e) => onChange({ ...value, assetId: e.target.value })}
          className={field}
        >
          {assets.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({ASSET_KIND_LABEL[a.kind]})
              {a.id === asset.id ? tk("app-library-image-lightbox.target-picker.option.b6b823c4456e") : ""}
            </option>
          ))}
        </select>
      ) : null}
      <label className="flex items-center gap-1.5">
        <input
          type="radio"
          checked={value.kind === "new"}
          onChange={() => onChange({ ...value, kind: "new" })}
        />
        {allowEach
          ? tk("app-library-image-lightbox.target-picker.label.8b02d838cac1")
          : tk("app-library-image-lightbox.target-picker.label.bc400b391679")}
      </label>
      {value.kind === "new" ? (
        <select
          aria-label="Type"
          value={value.assetKind}
          onChange={(e) => onChange({ ...value, assetKind: e.target.value as AssetKind })}
          className={field}
        >
          {ASSET_KINDS.filter((k) => k !== "sound").map((k) => (
            <option key={k} value={k}>
              {ASSET_KIND_LABEL[k]}
            </option>
          ))}
        </select>
      ) : null}
    </fieldset>
  );
}

interface TargetChoice {
  readonly kind: "existing" | "new";
  readonly assetId: string;
  readonly assetKind: AssetKind;
}

function targetFor(
  t: TargetChoice,
  name: string,
  version: AssetVersion,
  asset: Asset,
): ImageTarget {
  if (t.kind === "new") return { kind: "new", name, assetKind: t.assetKind };
  // Samme objekt: samme variant som bildet; et annet objekt: dets første variant (ellers en ny)
  return {
    kind: "existing",
    assetId: t.assetId,
    variantId: t.assetId === asset.id ? version.variantId : null,
  };
}

function SelectionPanel({
  tools,
  projectId,
  version,
  url,
  poly,
  busy,
  onJob,
  onRedraw,
  onDone,
}: {
  tools: LightboxTools;
  projectId: string;
  version: AssetVersion;
  url: string;
  poly: Polygon | null;
  busy: string | null;
  onJob: (label: string, fn: () => Promise<string>) => Promise<void>;
  onRedraw: () => void;
  onDone: () => void;
}) {
  const [name, setName] = useState(
    tk("app-library-image-lightbox.name-set-name.use-state.f0641eebdc00", { name: String(tools.asset.name) }),
  );
  const [target, setTarget] = useState<TargetChoice>({
    kind: "new",
    assetId: tools.asset.id,
    assetKind:
      tools.asset.kind === "location" || tools.asset.kind === "environment"
        ? "object"
        : tools.asset.kind,
  });
  const [trim, setTrim] = useState(true);
  async function save() {
    if (!poly) return;
    await onJob(tk("app-library-image-lightbox.save.on-job.d86e62c5cb47"), async () => {
      const src = await loadImage(url);
      // Markeringen er i bildets visningsmål; filen kan ha andre mål (skaler punktene)
      const k = { x: src.w / (version.width || src.w), y: src.h / (version.height || src.h) };
      const pts = poly.map((p) => ({ x: p.x * k.x, y: p.y * k.y }));
      const b = polygonBounds(pts, src.w, src.h);
      if (!b)
        throw new Error(
          tk("app-library-image-lightbox.save.on-job.5bd7bbdd287e"),
        );
      const c = cropCanvas(src, b, pts, trim);
      const file = await canvasToPng(c, name);
      const r = await saveImageTo(
        tools.cmds.runAndWait,
        tools.state,
        projectId,
        targetFor(target, name, version, tools.asset),
        file,
        tk("app-library-image-lightbox.r.save-image-to.92a351401678", { value1: String(name.trim()), name: String(tools.asset.name), number: String(version.number), width: String(c.width), height: String(c.height) }),
        tk("app-library-image-lightbox.r.save-image-to.f943d92d2010", { value1: String(name.trim()) }),
      );
      if ("error" in r) throw new Error(r.error);
      tools.onSaved?.(r);
      onDone();
      const where =
        target.kind === "new"
          ? tk("app-library-image-lightbox.where.on-job.617b13d90316", { value1: String(name.trim()) })
          : tk("app-library-image-lightbox.where.on-job.2debdc89bd73", { value1: String(tools.state.assets[target.assetId]?.name ?? "") });
      return tk("app-library-image-lightbox.save.on-job.b449aeec09e6", { where: String(where) });
    });
  }
  return (
    <div className="flex flex-col gap-2">
      {!poly ? (
        <p className="text-xs text-text-secondary">
          {tk("app-library-image-lightbox.selection-panel.p.b0ad79651f44")}
        </p>
      ) : (
        <>
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            {tk("app-library-image-lightbox.selection-panel.label.222c695aa6b0")}
            <input
              value={name}
              maxLength={200}
              onChange={(e) => setName(e.target.value)}
              className={field}
            />
          </label>
          <TargetPicker
            state={tools.state}
            asset={tools.asset}
            value={target}
            onChange={setTarget}
          />
          <label className="flex items-center gap-1.5 text-xs text-text-secondary">
            <input type="checkbox" checked={trim} onChange={(e) => setTrim(e.target.checked)} />
            {tk("app-library-image-lightbox.selection-panel.label.30c8da238a5d")}
          </label>
        </>
      )}
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" disabled={!poly || !!busy || !name.trim()} onClick={() => void save()}>
          <Crop /> {tk("app-library-image-lightbox.selection-panel.button.dca0fda644f1")}
        </Button>
        {poly ? (
          <Button size="sm" variant="ghost" disabled={!!busy} onClick={onRedraw}>
            {tk("app-library-image-lightbox.selection-panel.button.5cec689b9402")}
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" disabled={!!busy} onClick={onDone}>
          {tk("app-library-image-lightbox.selection-panel.button.2cafa3f9383a")}
        </Button>
      </div>
    </div>
  );
}

function GridPanel({
  tools,
  projectId,
  version,
  url,
  grid,
  onGrid,
  names,
  onNames,
  active,
  onActive,
  idPrefix,
  busy,
  onJob,
  onDone,
}: {
  tools: LightboxTools;
  projectId: string;
  version: AssetVersion;
  url: string;
  grid: GridState;
  onGrid: (g: { cols: number; rows: number }) => void;
  /** Navnene på rutene (ett felt per rute, Mars 15.10.2026). */
  names: string[];
  onNames: (n: string[]) => void;
  active: number | null;
  onActive: (i: number | null) => void;
  /** Prefiks for ID-ene til navnefeltene (klikk på en rute fokuserer feltet). */
  idPrefix: string;
  busy: string | null;
  onJob: (label: string, fn: () => Promise<string>) => Promise<void>;
  onDone: () => void;
}) {
  const [target, setTarget] = useState<TargetChoice>({
    kind: "existing",
    assetId: tools.asset.id,
    assetKind: tools.asset.kind,
  });
  const [prefix, setPrefix] = useState(tools.asset.name);
  const [trim, setTrim] = useState(true);
  const n = grid.cols * grid.rows;
  const base = prefix.trim() || tools.asset.name;
  async function split() {
    await onJob(tk("app-library-image-lightbox.split.on-job.df0e9c6a4fd3", { n: String(n) }), async () => {
      const src = await loadImage(url);
      // Delelinjene er brøkdeler: de gjelder også når filen har andre mål enn visningen
      const cells = cellsFromLines(src.w, src.h, grid.xs, grid.ys);
      const group = newId();
      let saved = 0;
      let empty = 0;
      for (const [i, c] of cells.entries()) {
        const canvas = cropCanvas(src, c, null, false);
        let out = canvas;
        if (trim) {
          // «Fjern luften rundt» per rute: gjennomsiktig eller ensfarget bakgrunn; tomme ruter hoppes over
          const t = trimCanvasInfo(canvas);
          if ("canvas" in t) out = t.canvas;
          else if (t.reason === "empty") {
            empty++;
            continue;
          }
        }
        const label = tileName(names, i, base);
        const file = await canvasToPng(out, label);
        const r = await saveImageTo(
          tools.cmds.runAndWait,
          tools.state,
          projectId,
          targetFor(target, label, version, tools.asset),
          file,
          tk("app-library-image-lightbox.r.save-image-to.3a99853fee25", { value1: String(i + 1), length: String(cells.length), label: String(label), name: String(tools.asset.name), number: String(version.number) }),
          tk("app-library-image-lightbox.r.save-image-to.2b14e6733108", { name: String(tools.asset.name) }),
          group,
        );
        if ("error" in r)
          throw new Error(tk("app-library-image-lightbox.split.on-job.8ae526ba5754", { value1: String(i + 1), error: String(r.error) }));
        saved++;
        if (i === cells.length - 1) tools.onSaved?.(r);
      }
      onDone();
      return empty ? tk("app-library-image-lightbox.tiles-saved-skipped", { saved, empty }) : tk("app-library-image-lightbox.tiles-saved", { saved });
    });
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-end gap-2 text-xs text-text-secondary">
        <label className="flex flex-col gap-1">
          {tk("app-library-image-lightbox.grid-panel.label.e8a814a178e6")}
          <input
            type="number"
            min={1}
            max={12}
            value={grid.cols}
            onChange={(e) =>
              onGrid({ ...grid, cols: Math.max(1, Math.min(12, Number(e.target.value) || 1)) })
            }
            className={field + " w-16"}
          />
        </label>
        <label className="flex flex-col gap-1">
          {tk("app-library-image-lightbox.grid-panel.label.b2e74fd75550")}
          <input
            type="number"
            min={1}
            max={12}
            value={grid.rows}
            onChange={(e) =>
              onGrid({ ...grid, rows: Math.max(1, Math.min(12, Number(e.target.value) || 1)) })
            }
            className={field + " w-16"}
          />
        </label>
        <span className="pb-1.5">
          = {n} {tk("app-library-image-lightbox.grid-panel.span.1de987a78e52")}
        </span>
      </div>
      <p className="text-[11px] text-text-tertiary">
        {tk("app-library-image-lightbox.grid-panel.p.37259e891eec")}
      </p>
      <fieldset className="flex flex-col gap-1 text-xs text-text-secondary">
        <legend className="mb-1">
          {tk("app-library-image-lightbox.grid-panel.legend.11eb638c07b3")}
        </legend>
        <div className="flex max-h-56 flex-col gap-1 overflow-y-auto pr-1">
          {Array.from({ length: n }, (_, i) => (
            <label key={i} className="flex items-center gap-1.5">
              <span
                className={
                  "w-6 shrink-0 text-right tabular-nums " +
                  (active === i ? "font-bold text-accent-warm" : "")
                }
              >
                {i + 1}.
              </span>
              <input
                id={`${idPrefix}-tile-${i}`}
                data-testid={`tile-name-${i + 1}`}
                value={names[i] ?? ""}
                maxLength={200}
                placeholder={`${base} ${i + 1}`}
                aria-label={tk("app-library-image-lightbox.grid-panel.aria-label.23fd5837ab7d", { value1: String(i + 1) })}
                onFocus={() => onActive(i)}
                onBlur={() => onActive(null)}
                onChange={(e) => {
                  const next = [...names];
                  while (next.length <= i) next.push("");
                  next[i] = e.target.value;
                  onNames(next);
                }}
                className={
                  field + (active === i ? " border-accent-warm ring-1 ring-accent-warm" : "")
                }
              />
            </label>
          ))}
        </div>
      </fieldset>
      <TargetPicker
        state={tools.state}
        asset={tools.asset}
        value={target}
        onChange={setTarget}
        allowEach
      />
      <label className="flex flex-col gap-1 text-xs text-text-secondary">
        {tk("app-library-image-lightbox.grid-panel.label.58e45a32bed8")}
        <input value={prefix} onChange={(e) => setPrefix(e.target.value)} className={field} />
      </label>
      <label className="flex items-center gap-1.5 text-xs text-text-secondary">
        <input type="checkbox" checked={trim} onChange={(e) => setTrim(e.target.checked)} />
        {tk("app-library-image-lightbox.grid-panel.label.8e9c244dd4b2")}
      </label>
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" disabled={!!busy || n < 2} onClick={() => void split()}>
          <Grid3x3 /> {tk("app-library-image-lightbox.grid-panel.button.f45726c387aa")}
        </Button>
        <Button size="sm" variant="ghost" disabled={!!busy} onClick={onDone}>
          {tk("app-library-image-lightbox.grid-panel.button.3e4ff7d040c9")}
        </Button>
      </div>
    </div>
  );
}
