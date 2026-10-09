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
import { ExternalLink, PanelBottomClose, X } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { renderFrame, type Composition, type ProjectState } from "@/core";
import { ImageCache, drawFrame } from "@/engine/compositor/canvas";
import { storedNumber, usePaneSize, useStoredNumber } from "@/app/shell/pane-size";

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
const zoomLabel = (z: number) => (z === 0 ? "Tilpass" : z === 100 ? "1:1 (100 %)" : `${z} %`);
const HEADER = 28;
const MARGIN = 8;
const MIN_W = 160;

type CommonProps = {
  state: ProjectState;
  composition: Composition;
  frame: number;
  imageUrls: Readonly<Record<string, string>>;
  onClose: () => void;
};

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

  useEffect(() => {
    // Felles bildebuffer: vinduet åpnes og lukkes ofte (automatisk ved avspilling) uten å laste bildene på nytt
    const off = onImageLoad(() => setTick((t) => t + 1));
    sharedCache.ensure(imageUrls);
    return off;
  }, [imageUrls]);

  const out = useMemo(
    () => renderFrame(state, composition.id, frame, { view: "camera" }),
    [state, composition.id, frame],
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
      aria-label="Bildet slik det blir i filmen"
      style={{ width: cssWidth, height: cssHeight, display: "block", flex: "none" }}
      className="bg-black"
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
      aria-label="Zoom i forhåndsvisningen"
      title="Zoom: «Tilpass» følger vinduets størrelse, 1:1 viser ett bildepunkt per skjermpunkt"
      className="h-5 rounded-sm border border-border-control bg-surface-3 px-1 text-[11px] text-text-secondary"
    >
      {PREVIEW_ZOOMS.map((z) => (
        <option key={z} value={z}>
          {z === 0 ? `Tilpass (${fitPercent} %)` : zoomLabel(z)}
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
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [area, setArea] = useState<{ w: number; h: number } | null>(null);
  const [storedW, setStoredW] = usePaneSize("scene-editor-preview", 360, MIN_W, 8000, {
    viewportShare: 1,
  });
  const [storedX, setX] = useStoredNumber("scene-editor-preview-x");
  const [storedY, setY] = useStoredNumber("scene-editor-preview-y");
  const [storedZoom, setZoom] = useStoredNumber("scene-editor-preview-zoom");
  const zoom = PREVIEW_ZOOMS.includes((storedZoom ?? 0) as never) ? (storedZoom ?? 0) : 0;

  // Mål flaten vinduet kan bevege seg på (arbeidsflaten), så det alltid holdes innenfor
  useLayoutEffect(() => {
    const parent = rootRef.current?.parentElement;
    if (!parent) return;
    const measure = () => setArea({ w: parent.clientWidth, h: parent.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(parent);
    return () => ro.disconnect();
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
  const x = clampX(storedX ?? (area ? area.w - w - 12 : 0));
  const y = clampY(storedY ?? (area ? area.h - totalH - 52 : 0));

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
    if (c === "nw" || c === "sw") setX(Math.round(from.x - real));
    else setX(Math.round(from.x));
    if (c === "nw" || c === "ne") setY(Math.round(from.y - dh));
    else setY(Math.round(from.y));
  }

  return (
    <div
      ref={rootRef}
      role="region"
      aria-label="Forhåndsvisning av ferdig utsnitt"
      style={{ left: x, top: y, width: w, visibility: area ? "visible" : "hidden" }}
      className="absolute z-30 flex flex-col rounded-md border border-border bg-surface-1 shadow-[var(--shadow-float)]"
    >
      <div
        className="flex shrink-0 cursor-move touch-none select-none items-center gap-1.5 border-b border-border px-2"
        style={{ height: HEADER }}
        title="Dra for å flytte forhåndsvisningen"
        tabIndex={0}
        aria-label="Flytt forhåndsvisningen (piltaster)"
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
        <span className="truncate text-[11px] font-medium uppercase tracking-[0.04em] text-text-tertiary">
          Ferdig utsnitt
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
          aria-label="Åpne i eget vindu"
          title="Åpne i eget vindu (kan flyttes til en annen skjerm)"
        >
          <ExternalLink className="size-3.5" aria-hidden />
        </button>
        <button
          type="button"
          onClick={p.onClose}
          className={iconButton}
          aria-label="Lukk forhåndsvisningen"
          title="Lukk forhåndsvisningen"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      </div>
      <div className="overflow-auto rounded-b-md bg-black" style={{ width: inner, height: bodyH }}>
        {/* Faste zoomnivåer som er større enn vinduet: rull for å se resten */}
        <PreviewCanvas {...p} cssWidth={canvasW} cssHeight={canvasH} win={null} />
      </div>
      {(["nw", "ne", "sw", "se"] as const).map((c) => (
        <div
          key={c}
          role="separator"
          aria-label={`Endre størrelse på forhåndsvisningen (hjørne ${c === "nw" ? "oppe til venstre" : c === "ne" ? "oppe til høyre" : c === "sw" ? "nede til venstre" : "nede til høyre"})`}
          aria-valuenow={w}
          aria-valuemin={MIN_W}
          aria-valuemax={Math.round(maxW)}
          tabIndex={0}
          title="Dra for å endre størrelse, dobbeltklikk for standard"
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
  to.title = "Forhåndsvisning – Animatic Studio";
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
    <div className="flex h-full flex-col bg-black text-text-primary">
      <div
        className="flex shrink-0 items-center gap-1.5 border-b border-border bg-surface-1 px-2"
        style={{ height: HEADER }}
      >
        <span className="truncate text-[11px] font-medium uppercase tracking-[0.04em] text-text-tertiary">
          Ferdig utsnitt
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
          aria-label="Tilbake til redigeringsvinduet"
          title="Legg forhåndsvisningen tilbake i redigeringsvinduet"
        >
          <PanelBottomClose className="size-3.5" aria-hidden />
        </button>
        <button
          type="button"
          onClick={p.onClose}
          className={iconButton}
          aria-label="Lukk forhåndsvisningen"
          title="Lukk forhåndsvisningen"
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
          <PreviewCanvas {...p} cssWidth={canvasW} cssHeight={canvasH} win={win} />
        </div>
      </div>
    </div>,
    container,
  );
}
