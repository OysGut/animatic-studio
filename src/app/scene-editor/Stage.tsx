/**
 * Scenen i sceneeditoren (M3 del 2, mandat kap. 11): et Canvas 2D som viser 2D-scenen med zoom og panorering,
 * markerer valgt lag og lar deg flytte, skalere og rotere det direkte. Under en dra-operasjon vises et
 * lokalt utkast; bare ved slipp kjøres én kommando (ett angresteg). Bare på klienten (nettleser-API-er i effekter).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  applyMatrix,
  layerFieldsOf,
  type CompositionLayer,
  hitTest,
  invert,
  itemCorners,
  multiply,
  renderFrame,
  rotate,
  translate,
  type Command,
  type Composition,
  type DrawItem,
  type Frame,
  type LayerFields,
  type LayerId,
  type LayerTransform,
  type ProjectState,
} from "@/core";
import { ImageCache, drawFrame } from "@/engine/compositor/canvas";
import { Button } from "@/components/ui/button";

interface StageProps {
  state: ProjectState;
  composition: Composition;
  editable: boolean;
  selectedLayerId: string | null;
  onSelect: (id: string | null) => void;
  run: (command: Command, label: string) => string | null;
  imageUrls: Readonly<Record<string, string>>;
}

interface Size {
  w: number;
  h: number;
  dpr: number;
}
/** Scene → skjerm (CSS-piksler): skjerm = scene · zoom + pan. */
interface View {
  zoom: number;
  x: number;
  y: number;
}
interface Pt {
  x: number;
  y: number;
}
type DragKind = "move" | "scale" | "rotate" | "pan";
interface Drag {
  kind: DragKind;
  pointerId: number;
  layerId: string;
  label: string;
  startScreen: Pt;
  startScene: Pt;
  start: LayerTransform;
  startView: View;
  /** Lagets bredde og høyde i lagets egne enheter. */
  size: Pt;
  moved: boolean;
  latest: LayerTransform;
  cursor: string;
}
interface Colors {
  border: string;
  accent: string;
}

const PADDING = 32;
const MIN_ZOOM = 0.02;
const MAX_ZOOM = 32;
const HANDLE = 8;
const ROTATE_OFFSET = 24;
const FALLBACK: Colors = { border: "#3a3d45", accent: "#4f8cff" };

// ---------- Hjelpere ----------

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round = (v: number, step: number) => Math.round(v / step) * step;
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

function fitView(size: Size, comp: Pick<Composition, "width" | "height">): View {
  if (size.w <= 0 || size.h <= 0 || comp.width <= 0 || comp.height <= 0)
    return { zoom: 1, x: 0, y: 0 };
  const zoom = clamp(
    Math.min((size.w - 2 * PADDING) / comp.width, (size.h - 2 * PADDING) / comp.height),
    MIN_ZOOM,
    MAX_ZOOM,
  );
  return { zoom, x: (size.w - comp.width * zoom) / 2, y: (size.h - comp.height * zoom) / 2 };
}

/** Ny visning med `zoom`, slik at scenepunktet under skjermpunktet `at` blir stående. */
function zoomAround(v: View, at: Pt, zoom: number): View {
  const z = clamp(zoom, MIN_ZOOM, MAX_ZOOM);
  const k = z / v.zoom;
  return { zoom: z, x: at.x - (at.x - v.x) * k, y: at.y - (at.y - v.y) * k };
}

const toScene = (v: View, p: Pt): Pt => ({ x: (p.x - v.x) / v.zoom, y: (p.y - v.y) / v.zoom });
const toScreen = (v: View, p: Pt): Pt => ({ x: p.x * v.zoom + v.x, y: p.y * v.zoom + v.y });

function isTextTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName);
}

function fieldsOf(l: CompositionLayer, transform: LayerTransform): LayerFields {
  return { ...layerFieldsOf(l), transform };
}

function roundTransform(t: LayerTransform): LayerTransform {
  let rot = round(t.rotation, 0.1) % 360;
  if (rot > 180) rot -= 360;
  if (rot <= -180) rot += 360;
  return {
    ...t,
    x: Math.round(t.x * 10) / 10,
    y: Math.round(t.y * 10) / 10,
    scaleX: Math.round(t.scaleX * 1000) / 1000,
    scaleY: Math.round(t.scaleY * 1000) / 1000,
    rotation: Math.round(rot * 10) / 10,
  };
}

/** Hjørnenes posisjon i skjermkoordinater og midtpunktet, pluss rotasjonshåndtaket. */
function handlesOf(item: DrawItem, v: View) {
  const corners = itemCorners(item).map((p) => toScreen(v, p));
  const [c0, c1, c2] = corners as [Pt, Pt, Pt];
  const center = { x: (c0.x + c2.x) / 2, y: (c0.y + c2.y) / 2 };
  const top = { x: (c0.x + c1.x) / 2, y: (c0.y + c1.y) / 2 };
  const len = dist(top, center) || 1;
  const rotateAt = {
    x: top.x + ((top.x - center.x) / len) * ROTATE_OFFSET,
    y: top.y + ((top.y - center.y) / len) * ROTATE_OFFSET,
  };
  return { corners, center, top, rotateAt };
}

function resizeCursor(center: Pt, corner: Pt): string {
  const a = (((Math.atan2(corner.y - center.y, corner.x - center.x) * 180) / Math.PI) % 180) + 180;
  const d = a % 180;
  if (d >= 22.5 && d < 67.5) return "nwse-resize";
  if (d >= 67.5 && d < 112.5) return "ns-resize";
  if (d >= 112.5 && d < 157.5) return "nesw-resize";
  return "ew-resize";
}

/** Utkast til ny transformasjon ut fra pekerens posisjon i scenen. */
function draftFor(d: Drag, scene: Pt, shift: boolean): LayerTransform {
  const s = d.start;
  const centre = { x: s.x, y: s.y };
  if (d.kind === "move")
    return { ...s, x: s.x + scene.x - d.startScene.x, y: s.y + scene.y - d.startScene.y };
  if (d.kind === "rotate") {
    const a0 = Math.atan2(d.startScene.y - centre.y, d.startScene.x - centre.x);
    const a1 = Math.atan2(scene.y - centre.y, scene.x - centre.x);
    let rot = s.rotation + ((a1 - a0) * 180) / Math.PI;
    if (shift) rot = Math.round(rot / 15) * 15;
    return { ...s, rotation: rot };
  }
  const keep = (v: number, f: number) => (v < 0 ? -1 : 1) * Math.max(0.001, Math.abs(v * f));
  if (!shift) {
    const d0 = dist(d.startScene, centre);
    const f = d0 > 1e-6 ? dist(scene, centre) / d0 : 1;
    return { ...s, scaleX: keep(s.scaleX, f), scaleY: keep(s.scaleY, f) };
  }
  // Fri skalering langs lagets egne akser
  const inv = invert(multiply(translate(s.x, s.y), rotate(s.rotation)));
  if (!inv) return s;
  const p0 = applyMatrix(inv, d.startScene.x, d.startScene.y);
  const p1 = applyMatrix(inv, scene.x, scene.y);
  const fx = Math.abs(p0.x) > 1e-6 ? p1.x / p0.x : 1;
  const fy = Math.abs(p0.y) > 1e-6 ? p1.y / p0.y : 1;
  return { ...s, scaleX: keep(s.scaleX, fx), scaleY: keep(s.scaleY, fy) };
}

// ---------- Tegning ----------

function drawOverlay(
  ctx: CanvasRenderingContext2D,
  item: DrawItem,
  v: View,
  colors: Colors,
  handles: boolean,
) {
  const h = handlesOf(item, v);
  ctx.save();
  ctx.strokeStyle = colors.accent;
  ctx.fillStyle = colors.accent;
  ctx.lineWidth = 1;
  ctx.setLineDash(item.locked ? [4, 3] : []);
  ctx.beginPath();
  h.corners.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.closePath();
  ctx.stroke();
  ctx.setLineDash([]);
  if (handles) {
    ctx.beginPath();
    ctx.moveTo(h.top.x, h.top.y);
    ctx.lineTo(h.rotateAt.x, h.rotateAt.y);
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    for (const c of h.corners) {
      ctx.fillRect(c.x - HANDLE / 2, c.y - HANDLE / 2, HANDLE, HANDLE);
      ctx.strokeRect(c.x - HANDLE / 2 + 0.5, c.y - HANDLE / 2 + 0.5, HANDLE - 1, HANDLE - 1);
    }
    ctx.beginPath();
    ctx.arc(h.rotateAt.x, h.rotateAt.y, HANDLE / 2 + 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

// ---------- Komponenten ----------

export function Stage({
  state,
  composition,
  editable,
  selectedLayerId,
  onSelect,
  run,
  imageUrls,
}: StageProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cacheRef = useRef<ImageCache | null>(null);
  const colorsRef = useRef<Colors>(FALLBACK);
  const dragRef = useRef<Drag | null>(null);
  const spaceRef = useRef(false);
  const sizeRef = useRef<Size>({ w: 0, h: 0, dpr: 1 });
  const userViewRef = useRef<View | null>(null);

  const [size, setSize] = useState<Size>({ w: 0, h: 0, dpr: 1 });
  const [userView, setUserView] = useState<View | null>(null);
  const [draft, setDraft] = useState<{ layerId: string; transform: LayerTransform } | null>(null);
  const [imageTick, setImageTick] = useState(0);
  const [cursor, setCursor] = useState("default");
  const [panning, setPanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const view = userView ?? fitView(size, composition);
  const viewRef = useRef(view);
  const compRef = useRef(composition);
  useEffect(() => {
    viewRef.current = view;
    compRef.current = composition;
  });

  const commitView = useCallback((v: View | null) => {
    userViewRef.current = v;
    setUserView(v);
  }, []);
  const currentView = useCallback(
    () => userViewRef.current ?? fitView(sizeRef.current, compRef.current),
    [],
  );

  // Ny scene: tilpass på nytt
  useEffect(() => {
    commitView(null);
  }, [composition.id, commitView]);

  // Mål området
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      const next = { w: r.width, h: r.height, dpr: window.devicePixelRatio || 1 };
      sizeRef.current = next;
      setSize(next);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    const cs = getComputedStyle(el);
    colorsRef.current = {
      border: cs.getPropertyValue("--border-strong").trim() || FALLBACK.border,
      accent: cs.getPropertyValue("--accent-brand").trim() || FALLBACK.accent,
    };
    return () => ro.disconnect();
  }, []);

  // Bilder
  useEffect(() => {
    cacheRef.current ??= new ImageCache(() => setImageTick((t) => t + 1));
    cacheRef.current.ensure(imageUrls);
  }, [imageUrls]);

  // Utkastet gjelder bare mens laget finnes og ikke er låst
  const stateWithDraft = useMemo(() => {
    const layer = draft ? state.layers[draft.layerId] : undefined;
    if (!draft || !layer) return state;
    return {
      ...state,
      layers: {
        ...state.layers,
        [draft.layerId]: { ...layer, transform: draft.transform, keyframes: [] },
      },
    };
  }, [state, draft]);
  const frame = useMemo(
    () => renderFrame(stateWithDraft, composition.id, 0, { view: "scene", includeHidden: true }),
    [stateWithDraft, composition],
  );
  const selectedItem = selectedLayerId
    ? frame.items.find((i) => i.layerId === selectedLayerId)
    : undefined;
  const canEditSelected = editable && !!selectedItem && !selectedItem.locked;

  // Tegn (begrenset til én gang per bilde)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.w <= 0 || size.h <= 0) return;
    const id = requestAnimationFrame(() => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const { dpr } = size;
      const pw = Math.round(size.w * dpr);
      const ph = Math.round(size.h * dpr);
      if (canvas.width !== pw || canvas.height !== ph) {
        canvas.width = pw;
        canvas.height = ph;
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, pw, ph);
      const images = cacheRef.current?.images ?? new Map();
      drawFrame(ctx, frame, {
        view: [dpr * view.zoom, 0, 0, dpr * view.zoom, dpr * view.x, dpr * view.y],
        images,
      });
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const colors = colorsRef.current;
      ctx.strokeStyle = colors.border;
      ctx.lineWidth = 1;
      ctx.strokeRect(
        Math.round(view.x) - 0.5,
        Math.round(view.y) - 0.5,
        Math.round(frame.width * view.zoom) + 1,
        Math.round(frame.height * view.zoom) + 1,
      );
      if (selectedItem) drawOverlay(ctx, selectedItem, view, colors, canEditSelected);
    });
    return () => cancelAnimationFrame(id);
  }, [frame, view, size, selectedItem, canEditSelected, imageTick]);

  // Rullehjul: ⌘/Ctrl zoomer rundt pekeren, ellers panorerer
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const v = currentView();
      if (e.ctrlKey || e.metaKey) {
        const r = el.getBoundingClientRect();
        const at = { x: e.clientX - r.left, y: e.clientY - r.top };
        commitView(zoomAround(v, at, v.zoom * Math.exp(-e.deltaY * 0.002)));
      } else {
        commitView({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY });
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [commitView, currentView]);

  // ---------- Pekerhåndtering ----------

  function screenPoint(e: React.PointerEvent): Pt {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  /** Hva ligger under pekeren? Håndtak i valgt lag går foran selve lagene. */
  function pick(p: Pt) {
    if (canEditSelected && selectedItem) {
      const h = handlesOf(selectedItem, view);
      if (dist(p, h.rotateAt) <= HANDLE + 2) return { kind: "rotate" as const, cursor: "grab" };
      const i = h.corners.findIndex((c) => dist(p, c) <= HANDLE);
      if (i >= 0)
        return { kind: "scale" as const, cursor: resizeCursor(h.center, h.corners[i] as Pt) };
    }
    const s = toScene(view, p);
    const hit = hitTest(frame, s.x, s.y);
    return hit ? { kind: "layer" as const, hit, cursor: editable ? "move" : "default" } : null;
  }

  function startDrag(e: React.PointerEvent, kind: DragKind, layerId: string, p: Pt) {
    const layer = state.layers[layerId];
    const item = frame.items.find((i) => i.layerId === layerId);
    if (!layer || !item) return;
    const labels = { move: "Flytt lag", scale: "Skaler lag", rotate: "Roter lag", pan: "" };
    dragRef.current = {
      kind,
      pointerId: e.pointerId,
      layerId,
      label: labels[kind],
      startScreen: p,
      startScene: toScene(view, p),
      start: layer.transform,
      startView: view,
      size: { x: item.width, y: item.height },
      moved: false,
      latest: layer.transform,
      cursor: kind === "scale" ? cursor : kind === "rotate" ? "grabbing" : "move",
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    wrapRef.current?.focus();
    if (dragRef.current) return;
    const p = screenPoint(e);
    if (e.button === 1 || (e.button === 0 && spaceRef.current)) {
      e.preventDefault();
      dragRef.current = {
        kind: "pan",
        pointerId: e.pointerId,
        layerId: "",
        label: "",
        startScreen: p,
        startScene: p,
        start: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 },
        startView: view,
        size: { x: 0, y: 0 },
        moved: false,
        latest: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 },
        cursor: "grabbing",
      };
      e.currentTarget.setPointerCapture(e.pointerId);
      setPanning(true);
      return;
    }
    if (e.button !== 0) return;
    setError(null);
    const target = pick(p);
    if (target?.kind === "rotate" || target?.kind === "scale") {
      if (selectedLayerId) startDrag(e, target.kind, selectedLayerId, p);
      return;
    }
    if (target?.kind === "layer") {
      onSelect(target.hit.layerId);
      if (editable) startDrag(e, "move", target.hit.layerId, p);
    } else {
      onSelect(null);
    }
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const p = screenPoint(e);
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) {
      const next = spaceRef.current ? "grab" : (pick(p)?.cursor ?? "default");
      if (next !== cursor) setCursor(next);
      return;
    }
    if (d.kind === "pan") {
      commitView({
        ...d.startView,
        x: d.startView.x + p.x - d.startScreen.x,
        y: d.startView.y + p.y - d.startScreen.y,
      });
      return;
    }
    if (!d.moved && dist(p, d.startScreen) < 2) return;
    d.moved = true;
    d.latest = roundTransform(draftFor(d, toScene(d.startView, p), e.shiftKey));
    setDraft({ layerId: d.layerId, transform: d.latest });
  }

  function endDrag(commit: boolean) {
    const d = dragRef.current;
    dragRef.current = null;
    setDraft(null);
    setPanning(false);
    if (!d || d.kind === "pan" || !commit || !d.moved) return;
    const layer = state.layers[d.layerId];
    if (!layer) return;
    submit(layer, d.latest, d.label);
  }

  function submit(
    layer: NonNullable<ProjectState["layers"][string]>,
    t: LayerTransform,
    label: string,
  ) {
    const err = run(
      {
        type: "UpdateLayers",
        layers: [{ layerId: layer.id, fields: fieldsOf(layer, t) }],
      },
      label,
    );
    setError(err);
  }

  function onPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    if (dragRef.current?.pointerId === e.pointerId) endDrag(true);
  }

  // ---------- Tastatur ----------

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (isTextTarget(e.target)) return;
    if (e.key === " " && e.target === e.currentTarget) {
      e.preventDefault();
      if (!spaceRef.current) {
        spaceRef.current = true;
        setCursor("grab");
      }
      return;
    }
    if (e.key === "Escape" && dragRef.current) {
      e.preventDefault();
      endDrag(false);
      return;
    }
    // Piltaster og sletting bare når selve scenen har fokus (ikke knappene i hjørnet)
    if (e.target !== e.currentTarget && e.target !== canvasRef.current) return;
    if (dragRef.current || !editable || !selectedLayerId) return;
    const layer = state.layers[selectedLayerId];
    if (!layer || layer.locked) return;
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      setError(
        run(
          { type: "SetLayersRemoved", layerIds: [layer.id as LayerId], removed: true },
          "Slett lag",
        ),
      );
      return;
    }
    const step = e.shiftKey ? 10 : 1;
    const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
    const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
    if (!dx && !dy) return;
    e.preventDefault();
    const t = layer.transform;
    submit(layer, roundTransform({ ...t, x: t.x + dx, y: t.y + dy }), "Flytt lag");
  }

  function onKeyUp(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === " " && spaceRef.current) {
      spaceRef.current = false;
      setCursor("default");
    }
  }

  function zoomTo100() {
    const v = currentView();
    commitView(zoomAround(v, { x: size.w / 2, y: size.h / 2 }, 1));
  }

  const label = `2D-scene: ${composition.name.trim() || "Uten navn"}, ${frame.items.length} lag`;
  const shownCursor = panning ? "grabbing" : cursor;

  return (
    <div
      ref={wrapRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onBlur={() => {
        spaceRef.current = false;
      }}
      className="relative min-h-0 flex-1 overflow-hidden bg-surface-0 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring"
    >
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={label}
        className="absolute inset-0 h-full w-full touch-none"
        style={{ cursor: shownCursor }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => endDrag(false)}
      />
      <div className="absolute bottom-3 right-3 flex flex-col items-end gap-1">
        {error ? (
          <p role="alert" className="rounded-sm bg-surface-2 px-2 py-1 text-xs text-status-danger">
            {error}
          </p>
        ) : null}
        <div className="flex items-center gap-1 rounded-md border border-border bg-surface-2 px-1 py-0.5">
          <span className="min-w-10 px-1 text-right text-xs tabular-nums text-text-secondary">
            {Math.round(view.zoom * 100)} %
          </span>
          <Button size="sm" variant="ghost" onClick={() => commitView(null)}>
            Tilpass
          </Button>
          <Button size="sm" variant="ghost" onClick={zoomTo100}>
            100 %
          </Button>
        </div>
      </div>
    </div>
  );
}
