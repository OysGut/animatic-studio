/**
 * Forhåndsvisning av ferdig utsnitt (DEC-0040, DEC-0041): det filmen viser på gjeldende bilde – kamerabevegelse,
 * parallakse og animerte lag – mens lerretet brukes til redigering.
 *
 * To former:
 *  - et flytende vindu over arbeidsflaten: flyttes ved å dra i tittellinjen, endrer størrelse fra hjørnene;
 *  - et eget nettleservindu («Eget vindu») som kan legges på en annen skjerm.
 * Zoom: «Tilpass» (bildet følger vinduet) eller faste nivåer (25 %, 50 %, 1:1, 200 %). 1:1 = ett bildepunkt
 * per skjermpunkt. Størrelse, plassering og zoom huskes for begge former, også når vinduet lukkes og åpnes
 * igjen (automatisk ved avspilling) og mellom økter.
 */
import { textSpecsOf, useTextFonts } from "@/engine/typography/fonts";
import { ExternalLink, PanelBottomClose, X } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { renderFrame, type Composition, type ProjectState, L } from "@/core";
import { ImageCache, drawFrame } from "@/engine/compositor/canvas";
import { storedNumber, usePaneSize, useStoredNumber } from "@/app/shell/pane-size";
import { t as tk } from "@/core/i18n/keyed";

const loadListeners = new Set<() => void>();
const sharedCache = new ImageCache(() => {
  for (const l of loadListeners) l();
});
function onImageLoad(l: () => void) {
  loadListeners.add(l);
  return () => {
    loadListeners.delete(l);
  };
}

/** Zoomnivåer i prosent. 0 = «Tilpass». */
const PREVIEW_ZOOMS = [0, 25, 50, 100, 200] as const;
const zoomLabel = (z: number) =>
  z === 0 ? tk("app-scene-editor-preview-window.zoom-label.message.b263ab1fdacc") : z === 100 ? "1:1 (100 %)" : `${z} %`;
const HEADER = 28;
const MARGIN = 8;
const MIN_W = 160;

type CommonProps = {
  state: ProjectState;
  composition: Composition;
  frame: number;
  imageUrls: Readonly<Record<string, string>>;
  onClose: () => void;
  /**
   * Versjonen som brukes i filmen (DEC-0085): når scenen vises som AI-video eller film og brukeren har valgt
   * det, spilles den i stedet for 2D-scenen. Lenke til filen og tiden i filen.
   */
  film?: { readonly url: string; readonly seconds: number; readonly playing: boolean } | null;
};

/** Film i forhåndsvisningen, fulgt av avspillingshodet (stum: scenens lyd spilles av sceneeditoren). */
function PreviewVideo({
  film,
  cssWidth,
  cssHeight,
}: {
  film: NonNullable<CommonProps["film"]>;
  cssWidth: number;
  cssHeight: number;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (!film.playing) {
      if (!v.paused) v.pause();
      if (Math.abs(v.currentTime - film.seconds) > 0.02) v.currentTime = film.seconds;
      return;
    }
    // Under avspilling: følg bare med når den har kommet for langt fra hodet
    if (Math.abs(v.currentTime - film.seconds) > 0.25) v.currentTime = film.seconds;
    if (v.paused) void v.play().catch(() => null);
  }, [film.seconds, film.playing, film.url]);
  return (
    <video
      ref={ref}
      src={film.url}
      muted
      playsInline
      preload="auto"
      aria-label={tk("app-scene-editor-preview-window.preview-video.aria-label.7f2058913b85")}
      style={{ width: cssWidth, height: cssHeight, display: "block", flex: "none" }}
      className="bg-media object-contain"
    />
  );
}

/** Tegner bildet i gitt CSS-størrelse. `win` er vinduet lerretet står i (pikseltetthet). */
function PreviewCanvas({
  state,
  composition,
  frame,
  imageUrls,
  cssWidth,
  cssHeight,
  win,
}: Omit<CommonProps, "onClose"> & { cssWidth: number; cssHeight: number; win: Window | null }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [tick, setTick] = useState(0);
  // Bildene dette lerretet bruker, holdes i bruk til det lukkes (bufferen deles med andre lerreter)
  const consumer = useRef<object>({});

  useEffect(() => {
    // Felles bildebuffer: vinduet åpnes og lukkes ofte (automatisk ved avspilling) uten å laste bildene på nytt
    const off = onImageLoad(() => setTick((t) => t + 1));
    sharedCache.ensure(imageUrls, consumer.current);
    return off;
  }, [imageUrls]);
  useEffect(() => {
    const c = consumer.current;
    return () => sharedCache.release(c);
  }, []);

  const fontsVersion = useTextFonts(textSpecsOf(state, composition.id)).version;
  const out = useMemo(
    () => renderFrame(state, composition.id, frame, { view: "camera" }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, composition.id, frame, fontsVersion],
  );

  useEffect(() => {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx || cssWidth <= 0 || cssHeight <= 0) return;
    const dpr = (win ?? window).devicePixelRatio || 1;
    const w = Math.max(1, Math.round(cssWidth * dpr));
    const h = Math.max(1, Math.round(cssHeight * dpr));
    if (c.width !== w) c.width = w;
    if (c.height !== h) c.height = h;
    const k = w / composition.width;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.clip();
    drawFrame(ctx, out, {
      view: [k, 0, 0, k, 0, 0],
      images: sharedCache.images,
      placeholders: false,
    });
    ctx.restore();
  }, [out, cssWidth, cssHeight, composition.width, tick, win]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={tk("app-scene-editor-preview-window.preview-canvas.aria-label.82d95ee66dc3")}
      style={{ width: cssWidth, height: cssHeight, display: "block", flex: "none" }}
      className="bg-media"
    />
  );
}

function ZoomSelect({
  zoom,
  fitPercent,
  onZoom,
}: {
  zoom: number;
  fitPercent: number;
  onZoom: (z: number) => void;
}) {
  return (
    <select
      value={zoom}
      onChange={(e) => onZoom(Number(e.target.value))}
      aria-label={tk("app-scene-editor-preview-window.zoom-select.aria-label.522401c84413")}
      title={tk("app-scene-editor-preview-window.zoom-select.title.f1f393dc12f8")}
      className="h-5 rounded-sm border border-border-control bg-surface-3 px-1 text-[11px] text-text-secondary"
    >
      {PREVIEW_ZOOMS.map((z) => (
        <option key={z} value={z}>
          {z === 0 ? tk("app-scene-editor-preview-window.zoom-select.option.5c78357a1919", { fitPercent: String(fitPercent) }) : zoomLabel(z)}
        </option>
      ))}
    </select>
  );
}

const iconButton = "rounded-sm p-0.5 text-text-tertiary hover:text-text-primary";

/* ------------------------------------------------------------------------------------------------ */
/* Flytende vindu over arbeidsflaten                                                                 */
/* ------------------------------------------------------------------------------------------------ */

type Corner = "nw" | "ne" | "sw" | "se";

const cornerName = (c: Corner) =>
  c === "nw"
    ? tk("app-scene-editor-preview-window.corner-name.message.1f2049cd14a8")
    : c === "ne"
      ? tk("app-scene-editor-preview-window.corner-name.message.06dfe2ac283c")
      : c === "sw"
        ? tk("app-scene-editor-preview-window.corner-name.message.6b2e126cd8ff")
        : tk("app-scene-editor-preview-window.corner-name.message.edd8479ff87f");

export function PreviewWindow({
  onPopOut,
  note,
  ...p
}: CommonProps & {
  /** Flytt forhåndsvisningen til et eget nettleservindu (f.eks. på en annen skjerm). */
  onPopOut: () => void;
  /** Kort beskjed i vinduet, f.eks. når nettleseren stoppet det egne vinduet. */
  note?: string | null;
}) {
  const { composition } = p;
  const aspect = composition.height / composition.width;
  // Usynlig markør i arbeidsflaten: gir standardplassen (nede til høyre på lerretet)
  const markerRef = useRef<HTMLSpanElement | null>(null);
  const [area, setArea] = useState<{ w: number; h: number } | null>(null);
  const [stage, setStage] = useState<{ right: number; bottom: number } | null>(null);
  const [storedW, setStoredW] = usePaneSize("scene-editor-preview", 360, MIN_W, 8000, {
    viewportShare: 1,
  });
  // Plassering i nettleservinduet (DEC-0042): vinduet kan flyttes fritt over hele programmet
  const [storedX, setX] = useStoredNumber("scene-editor-preview-left");
  const [storedY, setY] = useStoredNumber("scene-editor-preview-top");
  const [storedZoom, setZoom] = useStoredNumber("scene-editor-preview-zoom");
  const zoom = PREVIEW_ZOOMS.includes((storedZoom ?? 0) as never) ? (storedZoom ?? 0) : 0;

  // Vinduet holdes innenfor nettleservinduet; arbeidsflaten gir bare standardplassen
  useLayoutEffect(() => {
    const marker = markerRef.current;
    const measure = () => {
      setArea({ w: window.innerWidth, h: window.innerHeight });
      const r = marker?.getBoundingClientRect();
      if (r) setStage({ right: r.right, bottom: r.bottom });
    };
    measure();
    window.addEventListener("resize", measure);
    const ro = marker ? new ResizeObserver(measure) : null;
    if (marker) ro?.observe(marker);
    return () => {
      window.removeEventListener("resize", measure);
      ro?.disconnect();
    };
  }, []);

  const maxW = area
    ? Math.max(MIN_W, Math.min(area.w - 2 * MARGIN, (area.h - 2 * MARGIN - HEADER) / aspect))
    : storedW;
  const w = Math.round(Math.min(storedW, maxW));
  // Rammen tar 1 px på hver side
  const inner = w - 2;
  const bodyH = Math.round(inner * aspect);
  const totalH = bodyH + HEADER + 2;
  const clampX = (x: number) => (area ? Math.max(0, Math.min(area.w - w, x)) : x);
  const clampY = (y: number) => (area ? Math.max(0, Math.min(area.h - totalH, y)) : y);
  // Standardplass: nede til høyre, over verktøylinjen på lerretet
  const x = clampX(storedX ?? (stage ? stage.right - w - 12 : area ? area.w - w - 12 : 0));
  const y = clampY(
    storedY ?? (stage ? stage.bottom - totalH - 52 : area ? area.h - totalH - 52 : 0),
  );

  const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  const canvasW = zoom === 0 ? inner : Math.round((composition.width * zoom) / 100 / dpr);
  const canvasH = zoom === 0 ? bodyH : Math.round((composition.height * zoom) / 100 / dpr);
  const fitPercent = Math.round(((inner * dpr) / composition.width) * 100);

  function pickZoom(z: number) {
    setZoom(z);
    // Et fast nivå gjør vinduet akkurat stort nok til bildet (så langt det er plass)
    if (z > 0) setStoredW(Math.round((composition.width * z) / 100 / dpr) + 2);
  }

  // Flytting med tittellinjen
  const move = useRef<{ px: number; py: number; x: number; y: number } | null>(null);
  // Størrelse fra hjørnene (sideforholdet følger bildet)
  const resize = useRef<{ px: number; py: number; w: number; x: number; y: number } | null>(null);
  const [corner, setCorner] = useState<Corner | null>(null);

  function resizeBy(c: Corner, dw: number, from: { w: number; x: number; y: number }) {
    const nw = Math.max(MIN_W, Math.min(maxW, from.w + dw));
    const real = nw - from.w;
    const dh = real * aspect;
    setStoredW(nw);
    setZoom(0); // dra i hjørnet = bildet følger vinduet
    // Plassen holdes innenfor nettleservinduet (ellers vokser vinduet feil vei ved kanten)
    const nh = Math.round((nw - 2) * aspect) + HEADER + 2;
    const cx = (v: number) => (area ? Math.max(0, Math.min(area.w - nw, v)) : v);
    const cy = (v: number) => (area ? Math.max(0, Math.min(area.h - nh, v)) : v);
    setX(Math.round(cx(c === "nw" || c === "sw" ? from.x - real : from.x)));
    setY(Math.round(cy(c === "nw" || c === "ne" ? from.y - dh : from.y)));
  }

  const win = (
    <div
      role="region"
      aria-label={tk("app-scene-editor-preview-window.win.aria-label.462a30da593a")}
      style={{ left: x, top: y, width: w, visibility: area ? "visible" : "hidden" }}
      className="fixed z-40 flex flex-col rounded-md border border-border bg-surface-1 shadow-[var(--shadow-float)]"
    >
      <div
        className="flex shrink-0 cursor-move touch-none select-none items-center gap-1.5 border-b border-border px-2"
        style={{ height: HEADER }}
        title={tk("app-scene-editor-preview-window.win.title.6464c4e67a3e")}
        tabIndex={0}
        aria-label={tk("app-scene-editor-preview-window.win.aria-label.31a9f7e687be")}
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest("button,select")) return;
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          move.current = { px: e.clientX, py: e.clientY, x, y };
        }}
        onPointerMove={(e) => {
          const m = move.current;
          if (!m) return;
          setX(Math.round(clampX(m.x + e.clientX - m.px)));
          setY(Math.round(clampY(m.y + e.clientY - m.py)));
        }}
        onPointerUp={() => (move.current = null)}
        onPointerCancel={() => (move.current = null)}
        onLostPointerCapture={() => (move.current = null)}
        onDoubleClick={(e) => {
          if ((e.target as HTMLElement).closest("button,select")) return;
          // Dobbeltklikk: tilbake til standardplassen
          setX(null);
          setY(null);
        }}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          const step = e.shiftKey ? 40 : 10;
          const d = {
            ArrowLeft: [-step, 0],
            ArrowRight: [step, 0],
            ArrowUp: [0, -step],
            ArrowDown: [0, step],
          }[e.key];
          if (!d) return;
          e.preventDefault();
          e.stopPropagation();
          setX(Math.round(clampX(x + d[0]!)));
          setY(Math.round(clampY(y + d[1]!)));
        }}
      >
        <span className="truncate text-chrome-label font-medium uppercase tracking-[0.04em] text-text-tertiary">
          {tk("app-scene-editor-preview-window.win.span.0efae5805c77")}
        </span>
        {note ? (
          <span role="status" className="truncate text-[11px] text-text-secondary" title={note}>
            {note}
          </span>
        ) : null}
        <span className="ml-auto" />
        <ZoomSelect zoom={zoom} fitPercent={fitPercent} onZoom={pickZoom} />
        <button
          type="button"
          onClick={onPopOut}
          className={iconButton}
          aria-label={tk("app-scene-editor-preview-window.win.aria-label.c94bd4c89ace")}
          title={tk("app-scene-editor-preview-window.win.title.12c055c689c8")}
        >
          <ExternalLink className="size-3.5" aria-hidden />
        </button>
        <button
          type="button"
          onClick={p.onClose}
          className={iconButton}
          aria-label={tk("app-scene-editor-preview-window.win.aria-label.4ae640cd97bf")}
          title={tk("app-scene-editor-preview-window.win.title.4ae640cd97bf")}
        >
          <X className="size-3.5" aria-hidden />
        </button>
      </div>
      <div className="overflow-auto rounded-b-md bg-media" style={{ width: inner, height: bodyH }}>
        {/* Faste zoomnivåer som er større enn vinduet: rull for å se resten */}
        {p.film ? (
          <PreviewVideo film={p.film} cssWidth={canvasW} cssHeight={canvasH} />
        ) : (
          <PreviewCanvas {...p} cssWidth={canvasW} cssHeight={canvasH} win={null} />
        )}
      </div>
      {(["nw", "ne", "sw", "se"] as const).map((c) => (
        <div
          key={c}
          role="separator"
          aria-label={`${tk("app-scene-editor-preview-window.win.aria-label.d16c3ea009ad")} ${cornerName(c)})`}
          aria-valuenow={w}
          aria-valuemin={MIN_W}
          aria-valuemax={Math.round(maxW)}
          tabIndex={0}
          title={tk("app-scene-editor-preview-window.win.title.009cbe4bb447")}
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            e.currentTarget.setPointerCapture(e.pointerId);
            resize.current = { px: e.clientX, py: e.clientY, w, x, y };
            setCorner(c);
          }}
          onPointerMove={(e) => {
            const r = resize.current;
            if (!r) return;
            const sx = c === "ne" || c === "se" ? 1 : -1;
            const sy = c === "sw" || c === "se" ? 1 : -1;
            const byX = sx * (e.clientX - r.px);
            const byY = (sy * (e.clientY - r.py)) / aspect;
            resizeBy(c, Math.abs(byX) > Math.abs(byY) ? byX : byY, r);
          }}
          onPointerUp={() => {
            resize.current = null;
            setCorner(null);
          }}
          onPointerCancel={() => {
            resize.current = null;
            setCorner(null);
          }}
          onLostPointerCapture={() => {
            resize.current = null;
            setCorner(null);
          }}
          onDoubleClick={() => {
            setStoredW(null);
            setZoom(0);
          }}
          onKeyDown={(e) => {
            const step = e.shiftKey ? 40 : 10;
            const grow = e.key === "ArrowUp" || e.key === "ArrowRight" || e.key === "+";
            const shrink = e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "-";
            if (!grow && !shrink) return;
            e.preventDefault();
            e.stopPropagation();
            resizeBy(c, grow ? step : -step, { w, x, y });
          }}
          className={
            "absolute z-10 size-3 touch-none outline-none " +
            (c === "nw"
              ? "-left-1.5 -top-1.5 cursor-nwse-resize"
              : c === "ne"
                ? "-right-1.5 -top-1.5 cursor-nesw-resize"
                : c === "sw"
                  ? "-bottom-1.5 -left-1.5 cursor-nesw-resize"
                  : "-bottom-1.5 -right-1.5 cursor-nwse-resize") +
            (corner === c
              ? " rounded-full bg-accent-brand/70"
              : " rounded-full hover:bg-accent-brand/40 focus-visible:bg-accent-brand/40")
          }
        />
      ))}
    </div>
  );
  return (
    <>
      <span ref={markerRef} aria-hidden className="pointer-events-none absolute inset-0" />
      {typeof document === "undefined" ? null : createPortal(win, document.body)}
    </>
  );
}

/* ------------------------------------------------------------------------------------------------ */
/* Eget nettleservindu (kan legges på en annen skjerm)                                                */
/* ------------------------------------------------------------------------------------------------ */

const POPUP_NAME = "animatic-studio-preview";
const K = {
  left: "scene-editor-popup-left",
  top: "scene-editor-popup-top",
  width: "scene-editor-popup-width",
  height: "scene-editor-popup-height",
  zoom: "scene-editor-popup-zoom",
};

/** Ett eget vindu om gangen, gjenbrukt når forhåndsvisningen lukkes og åpnes raskt igjen. */
let popup: Window | null = null;
let container: HTMLDivElement | null = null;
let closeTimer: ReturnType<typeof setTimeout> | null = null;
let closingByUs = false;

function saveGeometry(w: Window) {
  try {
    if (w.closed) return;
    storedNumber.set(K.left, w.screenX);
    storedNumber.set(K.top, w.screenY);
    storedNumber.set(K.width, w.innerWidth);
    storedNumber.set(K.height, w.innerHeight);
  } catch {
    // vinduet er i ferd med å lukkes
  }
}

function copyStyles(to: Document) {
  to.title = tk("app-scene-editor-preview-window.copy-styles.message.96877f1c395d");
  to.documentElement.className = document.documentElement.className;
  for (const a of Array.from(document.documentElement.attributes))
    if (a.name.startsWith("data-") || a.name === "style")
      to.documentElement.setAttribute(a.name, a.value);
  // Kopier reglene direkte (ingen ny nedlasting); stilark fra andre domener (skrifter) lenkes med full adresse
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const style = to.createElement("style");
      const base = sheet.href ?? document.baseURI;
      // Relative adresser (skrifter, bilder) må gjøres fulle: det nye vinduet har ingen egen adresse
      style.textContent = Array.from(sheet.cssRules, (r) => r.cssText)
        .join("\n")
        .replace(/url\((["']?)([^"')]+)\1\)/g, (m, q: string, u: string) =>
          /^(data:|blob:|[a-z]+:\/\/)/i.test(u) ? m : `url(${q}${new URL(u, base).href}${q})`,
        );
      to.head.appendChild(style);
    } catch {
      if (sheet.href) {
        const link = to.createElement("link");
        link.rel = "stylesheet";
        link.href = sheet.href;
        to.head.appendChild(link);
      }
    }
  }
  to.body.style.margin = "0";
  to.body.style.background = "#000";
  to.body.style.overflow = "hidden";
}

/**
 * Åpner (eller gjenbruker) det egne vinduet på plassen og i størrelsen det hadde sist. Returnerer null hvis
 * nettleseren stoppet det (sprettoppvinduer sperret, eller ingen brukerhandling rett før).
 */
function openPopup(defaultW: number, defaultH: number): Window | null {
  if (closeTimer) {
    clearTimeout(closeTimer);
    closeTimer = null;
  }
  if (popup && !popup.closed && container) return popup;
  const left = storedNumber.get(K.left);
  const top = storedNumber.get(K.top);
  const width = storedNumber.get(K.width) ?? defaultW;
  const height = storedNumber.get(K.height) ?? defaultH;
  const features = [
    "popup=yes",
    `width=${Math.round(width)}`,
    `height=${Math.round(height)}`,
    ...(left !== null && top !== null
      ? [`left=${Math.round(left)}`, `top=${Math.round(top)}`]
      : []),
  ].join(",");
  const w = window.open("", POPUP_NAME, features);
  if (!w) return null;
  popup = w;
  closingByUs = false;
  const doc = w.document;
  // Et vindu med samme navn kan finnes fra før (f.eks. etter at siden ble lastet på nytt): start rent
  doc.body.replaceChildren();
  doc.head.replaceChildren();
  copyStyles(doc);
  container = doc.createElement("div");
  container.style.cssText = "position:fixed;inset:0;display:flex;flex-direction:column";
  doc.body.appendChild(container);
  // Annen skjerm: nettleseren kan ha lagt vinduet på denne skjermen; prøv å flytte det dit det var
  if (
    left !== null &&
    top !== null &&
    (Math.abs(w.screenX - left) > 20 || Math.abs(w.screenY - top) > 20)
  ) {
    const place = () => {
      try {
        w.moveTo(left, top);
      } catch {
        // ikke tillatt – vinduet blir der nettleseren la det
      }
    };
    const details = (window as unknown as { getScreenDetails?: () => Promise<unknown> })
      .getScreenDetails;
    if (details) details.call(window).then(place, place);
    else place();
  }
  return w;
}

function scheduleClose() {
  const w = popup;
  if (!w) return;
  saveGeometry(w);
  // Litt forsinket: forhåndsvisningen lukkes og åpnes ofte rett etter hverandre (avspilling, omtegning)
  if (closeTimer) clearTimeout(closeTimer);
  closeTimer = setTimeout(() => {
    closeTimer = null;
    if (popup === w && !w.closed) {
      closingByUs = true;
      saveGeometry(w);
      w.close();
    }
    popup = null;
    container = null;
  }, 150);
}

if (typeof window !== "undefined")
  window.addEventListener("pagehide", () => {
    if (popup && !popup.closed) {
      closingByUs = true;
      saveGeometry(popup);
      popup.close();
    }
  });

export function PopoutPreview({
  onDock,
  onBlocked,
  onTogglePlay,
  ...p
}: CommonProps & {
  /** Tilbake til det flytende vinduet i redigeringsvinduet. */
  onDock: () => void;
  /** Nettleseren stoppet det egne vinduet. */
  onBlocked: () => void;
  /** Mellomrom i det egne vinduet starter/stopper avspillingen. */
  onTogglePlay: () => void;
}) {
  const { composition } = p;
  const [win, setWin] = useState<Window | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [storedZoom, setZoom] = useStoredNumber(K.zoom);
  const zoom = PREVIEW_ZOOMS.includes((storedZoom ?? 0) as never) ? (storedZoom ?? 0) : 0;
  const latest = useRef({ onClose: p.onClose, onTogglePlay, onBlocked });
  latest.current = { onClose: p.onClose, onTogglePlay, onBlocked };
  const resizingByUs = useRef(0);

  useEffect(() => {
    const w = openPopup(640, Math.round(640 * (composition.height / composition.width)) + HEADER);
    if (!w) {
      latest.current.onBlocked();
      return;
    }
    setWin(w);
    const measure = () => setSize({ w: w.innerWidth, h: w.innerHeight });
    measure();
    const onResize = () => {
      measure();
      saveGeometry(w);
      // Brukeren dro i vinduskanten: bildet følger vinduet
      if (Date.now() - resizingByUs.current > 600) setZoom(0);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== " " || (e.target as HTMLElement | null)?.closest?.("select,button,input"))
        return;
      e.preventDefault();
      latest.current.onTogglePlay();
    };
    const onHide = () => {
      if (!closingByUs) {
        saveGeometry(w);
        popup = null;
        container = null;
        latest.current.onClose();
      }
    };
    // Flytting gir ingen hendelse: lagre plassen jevnlig, så den huskes også om vinduet lukkes brått
    const poll = setInterval(() => {
      if (w.closed) {
        clearInterval(poll);
        if (!closingByUs) onHide();
      } else saveGeometry(w);
    }, 1000);
    w.addEventListener("resize", onResize);
    w.addEventListener("keydown", onKey);
    w.addEventListener("pagehide", onHide);
    return () => {
      clearInterval(poll);
      try {
        w.removeEventListener("resize", onResize);
        w.removeEventListener("keydown", onKey);
        w.removeEventListener("pagehide", onHide);
      } catch {
        // allerede lukket
      }
      scheduleClose();
    };
    // Vinduet åpnes én gang per visning; formatendringer tegnes bare om
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!win || !container) return null;
  const dpr = win.devicePixelRatio || 1;
  const bodyW = size.w;
  const bodyH = Math.max(0, size.h - HEADER);
  const fit = Math.min(bodyW / composition.width, bodyH / composition.height);
  const fitPercent = Math.round(fit * dpr * 100);
  const cssScale = zoom === 0 ? fit : zoom / 100 / dpr;
  const canvasW = Math.round(composition.width * cssScale);
  const canvasH = Math.round(composition.height * cssScale);

  function pickZoom(z: number) {
    setZoom(z);
    if (z === 0 || !win) return;
    // Gjør vinduet akkurat stort nok til bildet på dette nivået (så langt skjermen rekker)
    const s = z / 100 / dpr;
    const chromeW = win.outerWidth - win.innerWidth;
    const chromeH = win.outerHeight - win.innerHeight;
    resizingByUs.current = Date.now();
    try {
      win.resizeTo(
        Math.min(win.screen.availWidth, Math.round(composition.width * s) + chromeW),
        Math.min(win.screen.availHeight, Math.round(composition.height * s) + HEADER + chromeH),
      );
    } catch {
      // ikke tillatt – rull i stedet
    }
  }

  return createPortal(
    <div className="flex h-full flex-col bg-media text-text-primary">
      <div
        className="flex shrink-0 items-center gap-1.5 border-b border-border bg-surface-1 px-2"
        style={{ height: HEADER }}
      >
        <span className="truncate text-chrome-label font-medium uppercase tracking-[0.04em] text-text-tertiary">
          {tk("app-scene-editor-preview-window.popout-preview.span.289608475142")}
        </span>
        <span className="truncate text-[11px] text-text-tertiary">
          {composition.width} × {composition.height}
        </span>
        <span className="ml-auto" />
        <ZoomSelect zoom={zoom} fitPercent={fitPercent} onZoom={pickZoom} />
        <button
          type="button"
          onClick={onDock}
          className={iconButton}
          aria-label={tk("app-scene-editor-preview-window.popout-preview.aria-label.9bdb232a8642")}
          title={tk("app-scene-editor-preview-window.popout-preview.title.5b8f494c4e10")}
        >
          <PanelBottomClose className="size-3.5" aria-hidden />
        </button>
        <button
          type="button"
          onClick={p.onClose}
          className={iconButton}
          aria-label={tk("app-scene-editor-preview-window.popout-preview.aria-label.d8771782f7c7")}
          title={tk("app-scene-editor-preview-window.popout-preview.title.d8771782f7c7")}
        >
          <X className="size-3.5" aria-hidden />
        </button>
      </div>
      <div
        className={
          "min-h-0 flex-1 overflow-auto " + (zoom === 0 ? "flex items-center justify-center" : "")
        }
      >
        <div style={zoom === 0 ? undefined : { margin: "0 auto", width: canvasW }}>
          {p.film ? (
            <PreviewVideo film={p.film} cssWidth={canvasW} cssHeight={canvasH} />
          ) : (
            <PreviewCanvas {...p} cssWidth={canvasW} cssHeight={canvasH} win={win} />
          )}
        </div>
      </div>
    </div>,
    container,
  );
}

/**
 * Det egne vinduet brukt av andre forhåndsvisninger (monteringen, DEC-0051): samme vindu, plass og
 * størrelse som sceneeditorens, så det kan stå på en annen skjerm for begge.
 */
export const previewPopup = {
  open: (defaultW: number, defaultH: number) => openPopup(defaultW, defaultH),
  container: (): HTMLDivElement | null => container,
  close: () => scheduleClose(),
  save: (w: Window) => saveGeometry(w),
  closingByUs: () => closingByUs,
  /** Brukeren lukket vinduet selv. */
  forget: () => {
    popup = null;
    container = null;
  },
  header: HEADER,
  iconButton,
};
