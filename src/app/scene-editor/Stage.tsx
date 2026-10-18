/**
 * Scenen i sceneeditoren (M3 del 2, mandat kap. 11): et Canvas 2D som viser 2D-scenen med zoom og panorering,
 * markerer valgt lag og lar deg flytte, skalere og rotere det direkte. Under en dra-operasjon vises et
 * lokalt utkast; bare ved slipp kjøres én kommando (ett angresteg). Rektangel- og ellipsemasken til valgt lag
 * kan også flyttes og endres i størrelse her (DEC-0072). Bare på klienten (nettleser-API-er i effekter).
 */
import { ZoomIn, ZoomOut } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  applyMatrix,
  cameraAt,
  groupMatrixAt,
  groupOf,
  pathPointAt,
  pathProgress,
  pathSegments,
  translatePath,
  type Matrix,
  type MotionPath,
  dragMaskRect,
  fieldsWithMaskAt,
  fieldsWithTransformAt,
  isMaskProperty,
  layerFieldsOf,
  maskAt,
  type MaskRect,
  shotAt,
  toggleCurve,
  transformAt,
  withShot,
  type CameraShot,
  type CompositionLayer,
  hitTest,
  invert,
  itemCorners,
  maskOutline,
  multiply,
  renderFrame,
  rotate,
  translate,
  type Command,
  type Composition,
  type DrawItem,
  type Frame,
  type LayerId,
  type LayerTransform,
  type ProjectState,
  defaultLayerFields,
  newId,
  sceneContinuityVariant,
  stretchedTransform,
  L,
} from "@/core";
import { ASSET_DRAG_TYPE } from "./SceneAssetsPanel";
import { removeLayer } from "./layer-actions";
import { ImageCache, drawFrame } from "@/engine/compositor/canvas";
import { Button } from "@/components/ui/button";
import {
  cursorFor,
  dragCameraShot,
  dragLabel,
  drawCameraOverlay,
  pickCamera,
  updateCameraCommand,
  type CameraTarget,
} from "./camera-overlay";

interface StageProps {
  state: ProjectState;
  composition: Composition;
  editable: boolean;
  selectedLayerId: string | null;
  onSelect: (id: string | null) => void;
  run: (command: Command, label: string, group?: string) => string | null;
  imageUrls: Readonly<Record<string, string>>;
  selectedShotId: string | null;
  onSelectShot: (id: string | null) => void;
  frame: number;
  playing: boolean;
  view: "scene" | "camera";
  onViewChange: (v: "scene" | "camera") => void;
  autoKey: boolean;
  /** Mellomrom uten å dra: spill av / pause. */
  onTogglePlay?: () => void;
  /** Dobbeltklikk på et lag: velg bilde for laget (DEC-0044). */
  onOpenLayerImage?: (layerId: string) => void;
  /** Alt + dobbeltklikk på et lag: åpne Asset Studio for laget (AS1). */
  onOpenAssetStudio?: (layerId: string) => void;
  /** Tegn en bevegelsesbane for valgt lag (DEC-0052): punktene i lagets koordinater. */
  drawPath?: boolean;
  onPathDrawn?: (points: { x: number; y: number }[]) => void;
  /** Esc mens du skal tegne en bane: avbryt. */
  onDrawCancel?: () => void;
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
type DragKind = "move" | "scale" | "stretch" | "rotate" | "pan";
interface Drag {
  kind: DragKind;
  pointerId: number;
  layerId: string;
  label: string;
  startScreen: Pt;
  startScene: Pt;
  start: LayerTransform;
  startView: View;
  /** Scene → lagets koordinater når laget ligger i en gruppe (DEC-0052). */
  toLocal: Matrix | null;
  /** Gruppens ankerpunkt (beholdes når gruppen flyttes). */
  anchor: Pt | null;
  /** Bevegelsesbanen når dra-operasjonen startet (flyttes med laget). */
  path: MotionPath | null;
  /** Lagets bredde og høyde i lagets egne enheter. */
  size: Pt;
  moved: boolean;
  latest: LayerTransform;
  cursor: string;
  /** Sidehåndtak (DEC-0080): aksen som skvises eller strekkes. */
  axis?: "x" | "y";
}
interface CamDrag {
  pointerId: number;
  shotId: string;
  target: CameraTarget;
  startScreen: Pt;
  startScene: Pt;
  startShot: CameraShot;
  startView: View;
  moved: boolean;
  latest: CameraShot;
}
/** Dra et punkt på bevegelsesbanen (DEC-0052). */
interface PathDrag {
  pointerId: number;
  layerId: string;
  index: number;
  start: MotionPath;
  toLocal: Matrix | null;
  startScreen: Pt;
  moved: boolean;
  latest: MotionPath;
}
/** Dra masken til valgt lag (DEC-0072): midtpunktet eller omrisset flytter, et hjørne endrer størrelsen. */
interface MaskDrag {
  pointerId: number;
  layerId: string;
  /** -1 = flytt; 0–3 = hjørne (øverst venstre, øverst høyre, nederst høyre, nederst venstre). */
  handle: number;
  /** Masken på bildet da dra-operasjonen startet (lagets egne piksler). */
  start: MaskRect;
  /** Scene → lagets egne piksler (0,0 = lagets øverste venstre hjørne). */
  toLayer: Matrix;
  startLayer: Pt;
  startScreen: Pt;
  moved: boolean;
  latest: MaskRect;
}
interface Colors {
  border: string;
  accent: string;
}

const PADDING = 32;
const MIN_ZOOM = 0.02;
const MAX_ZOOM = 32;
/** Faste zoomnivåer for knappene og nivåvelgeren (DEC-0079). */
export const ZOOM_LEVELS = [0.1, 0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.5, 2, 3, 4, 6, 8, 12, 16];
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

/** Komposisjonen med ett kamerautsnitt erstattet (for å regne ut kameraet med utkastet). */
const compWithCam = (c: Composition, shot: CameraShot): Composition => ({
  ...c,
  camera: withShot(c.camera, shot),
});

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
  // Håndtakene midt på sidene (DEC-0080): skvis eller strekk i én retning
  const mid = (a: Pt, b: Pt) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const [, , , c3] = corners as [Pt, Pt, Pt, Pt];
  const sides: { at: Pt; axis: "x" | "y" }[] = [
    { at: top, axis: "y" },
    { at: mid(c1, c2), axis: "x" },
    { at: mid(c2, c3), axis: "y" },
    { at: mid(c3, c0), axis: "x" },
  ];
  return { corners, center, top, rotateAt, sides };
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
function draftFor(d: Drag, scene: Pt, shift: boolean, alt = false): LayerTransform {
  const s = d.start;
  const centre = { x: s.x, y: s.y };
  if (d.kind === "stretch" && d.axis) {
    // Lagets eget, roterte koordinatsystem med origo i midten
    const inv = invert(multiply(translate(s.x, s.y), rotate(s.rotation)));
    if (!inv) return s;
    const p0 = applyMatrix(inv, d.startScene.x, d.startScene.y);
    const p1 = applyMatrix(inv, scene.x, scene.y);
    // Lag med bevegelsesbane: banen styrer posisjonen, så begge sider endres likt
    return stretchedTransform(s, d.size, d.axis, p0, p1, alt || !!d.path);
  }
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

/** Omrisset til et lag i valgt gruppe (lyser opp, uten håndtak). */
function drawMemberOutline(ctx: CanvasRenderingContext2D, item: DrawItem, v: View, colors: Colors) {
  const h = handlesOf(item, v);
  ctx.save();
  ctx.strokeStyle = colors.accent;
  ctx.fillStyle = colors.accent;
  ctx.globalAlpha = 0.18;
  ctx.beginPath();
  h.corners.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 0.9;
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.stroke();
  ctx.restore();
}

/** Omrisset av rektangel- eller ellipsemasken til valgt lag (REQ-0175), stiplet. */
function drawMaskOutline(ctx: CanvasRenderingContext2D, item: DrawItem, v: View, colors: Colors) {
  const pts = maskOutline(item)?.map((p) => toScreen(v, p));
  if (!pts?.length) return;
  ctx.save();
  ctx.strokeStyle = colors.accent;
  ctx.globalAlpha = 0.9;
  ctx.lineWidth = 1;
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

/**
 * Håndtakene til rektangel- eller ellipsemasken i et tegneelement (skjermkoordinater): hjørnene i rammen
 * rundt masken og midtpunktet. null for ingen maske eller maske av et annet lag.
 */
function maskHandlesOf(item: DrawItem, v: View): { corners: Pt[]; center: Pt } | null {
  const m = item.mask;
  if (!m || m.kind === "layer") return null;
  const at = (x: number, y: number) => toScreen(v, applyMatrix(item.matrix, x, y));
  return {
    corners: [
      at(m.x, m.y),
      at(m.x + m.width, m.y),
      at(m.x + m.width, m.y + m.height),
      at(m.x, m.y + m.height),
    ],
    center: at(m.x + m.width / 2, m.y + m.height / 2),
  };
}

/** Avstanden fra et punkt til et lukket omriss (skjermkoordinater). */
function distToOutline(p: Pt, pts: readonly Pt[]): number {
  let best = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / len2, 0, 1) : 0;
    best = Math.min(best, dist(p, { x: a.x + dx * t, y: a.y + dy * t }));
  }
  return best;
}

/** Ny maske ut fra pekeren (lagets egne piksler). Shift ved hjørne: behold forholdet mellom sidene. */
function maskDraftFor(d: MaskDrag, at: Pt, shift: boolean): MaskRect {
  return dragMaskRect(d.start, d.handle, at.x - d.startLayer.x, at.y - d.startLayer.y, shift);
}

/** Håndtakene til masken (fylt med aksentfarge, så de skiller seg fra lagets hvite håndtak). */
function drawMaskHandles(ctx: CanvasRenderingContext2D, item: DrawItem, v: View, colors: Colors) {
  const h = maskHandlesOf(item, v);
  if (!h) return;
  ctx.save();
  ctx.fillStyle = colors.accent;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1;
  const k = HANDLE - 2;
  for (const c of h.corners) {
    ctx.fillRect(c.x - k / 2, c.y - k / 2, k, k);
    ctx.strokeRect(c.x - k / 2 + 0.5, c.y - k / 2 + 0.5, k - 1, k - 1);
  }
  ctx.beginPath();
  ctx.arc(h.center.x, h.center.y, HANDLE / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(h.center.x - HANDLE, h.center.y);
  ctx.lineTo(h.center.x + HANDLE, h.center.y);
  ctx.moveTo(h.center.x, h.center.y - HANDLE);
  ctx.lineTo(h.center.x, h.center.y + HANDLE);
  ctx.strokeStyle = colors.accent;
  ctx.stroke();
  ctx.restore();
}

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
    // Sidehåndtak (DEC-0080): litt mindre enn hjørnene; vises bare når siden er lang nok
    const S = HANDLE - 2;
    if (dist(h.corners[0] as Pt, h.corners[2] as Pt) > HANDLE * 5)
      for (const sd of h.sides) {
        ctx.fillRect(sd.at.x - S / 2, sd.at.y - S / 2, S, S);
        ctx.strokeRect(sd.at.x - S / 2 + 0.5, sd.at.y - S / 2 + 0.5, S - 1, S - 1);
      }
    ctx.beginPath();
    ctx.arc(h.rotateAt.x, h.rotateAt.y, HANDLE / 2 + 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

/** Bevegelsesbanen i scenen: kurven, punktene og hvor laget er nå. */
function drawPathOverlay(
  ctx: CanvasRenderingContext2D,
  path: MotionPath,
  toScene: Matrix | null,
  v: View,
  colors: Colors,
  current: Pt | null,
) {
  const sc = (x: number, y: number) => toScreen(v, toScene ? applyMatrix(toScene, x, y) : { x, y });
  ctx.save();
  ctx.strokeStyle = colors.accent;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  let first = true;
  for (const g of pathSegments(path)) {
    for (let k = 0; k <= 16; k++) {
      const u = k / 16;
      const m = 1 - u;
      const x = m * m * m * g[0] + 3 * m * m * u * g[2] + 3 * m * u * u * g[4] + u * u * u * g[6];
      const y = m * m * m * g[1] + 3 * m * m * u * g[3] + 3 * m * u * u * g[5] + u * u * u * g[7];
      const q = sc(x, y);
      if (first) ctx.moveTo(q.x, q.y);
      else ctx.lineTo(q.x, q.y);
      first = false;
    }
  }
  ctx.stroke();
  ctx.setLineDash([]);
  path.points.forEach((p, i) => {
    const q = sc(p.x, p.y);
    ctx.fillStyle = i === 0 ? colors.accent : "#ffffff";
    ctx.beginPath();
    if (p.smooth) ctx.arc(q.x, q.y, 4, 0, Math.PI * 2);
    else ctx.rect(q.x - 3.5, q.y - 3.5, 7, 7);
    ctx.fill();
    ctx.stroke();
  });
  if (current) {
    const q = sc(current.x, current.y);
    ctx.fillStyle = colors.accent;
    ctx.beginPath();
    ctx.arc(q.x, q.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Streken mens en bane tegnes (skjermkoordinater). */
function drawStroke(ctx: CanvasRenderingContext2D, pts: readonly Pt[], colors: Colors) {
  if (pts.length < 2) return;
  ctx.save();
  ctx.strokeStyle = colors.accent;
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.stroke();
  ctx.restore();
}

const insideItem = (it: DrawItem, p: Pt) => {
  const inv = invert(it.matrix);
  if (!inv) return false;
  const q = applyMatrix(inv, p.x, p.y);
  return Math.abs(q.x) <= it.width / 2 && Math.abs(q.y) <= it.height / 2;
};

// ---------- Komponenten ----------

export function Stage({
  state,
  composition,
  editable,
  selectedLayerId,
  onSelect,
  run,
  imageUrls,
  selectedShotId,
  onSelectShot,
  frame: time,
  playing,
  view: mode,
  onViewChange,
  autoKey,
  onTogglePlay,
  onOpenLayerImage,
  onOpenAssetStudio,
  drawPath = false,
  onPathDrawn,
  onDrawCancel,
}: StageProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cacheRef = useRef<ImageCache | null>(null);
  const colorsRef = useRef<Colors>(FALLBACK);
  const dragRef = useRef<Drag | null>(null);
  const camDragRef = useRef<CamDrag | null>(null);
  const pathDragRef = useRef<PathDrag | null>(null);
  const maskDragRef = useRef<MaskDrag | null>(null);
  const drawRef = useRef<{ pointerId: number; scene: Pt[] } | null>(null);
  const spaceRef = useRef(false);
  /** Ble mellomrom brukt til å panorere? Ellers er et kort trykk spill/pause. */
  const spacePanned = useRef(false);
  const sizeRef = useRef<Size>({ w: 0, h: 0, dpr: 1 });
  const userViewRef = useRef<View | null>(null);

  const [size, setSize] = useState<Size>({ w: 0, h: 0, dpr: 1 });
  const [userView, setUserView] = useState<View | null>(null);
  const [draft, setDraft] = useState<{
    layerId: string;
    transform: LayerTransform;
    anchor: Pt | null;
    path: MotionPath | null;
  } | null>(null);
  const [pathDraft, setPathDraft] = useState<{ layerId: string; path: MotionPath } | null>(null);
  const [maskDraft, setMaskDraft] = useState<{ layerId: string; rect: MaskRect } | null>(null);
  const [stroke, setStroke] = useState<Pt[] | null>(null);
  const [camDraft, setCamDraft] = useState<CameraShot | null>(null);
  const [imageTick, setImageTick] = useState(0);
  const [cursor, setCursor] = useState("default");
  const [panning, setPanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cameraMode = mode === "camera";
  const view = cameraMode || !userView ? fitView(size, composition) : userView;
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
    if (maskDraft) {
      // Masken under dra: utkastet gjelder på alle bilder (nøkkelbildene for masken brukes ikke så lenge)
      const layer = state.layers[maskDraft.layerId];
      const m = layer?.mask;
      if (layer && m && m.kind !== "layer")
        return {
          ...state,
          layers: {
            ...state.layers,
            [layer.id]: {
              ...layer,
              mask: { ...m, ...maskDraft.rect },
              keyframes: layer.keyframes.filter((k) => !isMaskProperty(k.property)),
            },
          },
        };
    }
    if (pathDraft) {
      const layer = state.layers[pathDraft.layerId];
      if (layer)
        return {
          ...state,
          layers: { ...state.layers, [layer.id]: { ...layer, path: pathDraft.path } },
        };
    }
    const layer = draft ? state.layers[draft.layerId] : undefined;
    if (!draft || !layer) return state;
    return {
      ...state,
      layers: {
        ...state.layers,
        [draft.layerId]: {
          ...layer,
          transform: draft.transform,
          // Lagets egne nøkkelbilder brukes ikke under dra; maskens animasjon (DEC-0072) gjelder fortsatt
          keyframes: layer.keyframes.filter((k) => isMaskProperty(k.property)),
          anchor: draft.anchor,
          path: draft.path,
        },
      },
    };
  }, [state, draft, pathDraft, maskDraft]);
  const frame = useMemo(
    () =>
      cameraMode
        ? renderFrame(state, composition.id, time, { view: "camera" })
        : renderFrame(stateWithDraft, composition.id, time, { view: "scene", includeHidden: true }),
    [state, stateWithDraft, composition, time, cameraMode],
  );
  const canEdit = editable && !playing && !cameraMode;
  // Kamerautsnittet som vises: valgt, ellers det som gjelder på bildet (med utkast under dra)
  const overlayShot = useMemo<CameraShot | null>(() => {
    if (cameraMode) return null;
    const shots = composition.camera.shots;
    const base = selectedShotId
      ? (shots.find((s) => s.id === selectedShotId) ?? null)
      : shotAt(composition.camera, time);
    if (!base) return null;
    return camDraft && camDraft.id === base.id ? camDraft : base;
  }, [composition, selectedShotId, time, camDraft, cameraMode]);
  const shotSelected = !!overlayShot && overlayShot.id === selectedShotId;
  const currentCamera = useMemo(
    () => (overlayShot ? cameraAt(compWithCam(composition, overlayShot), time) : null),
    [composition, overlayShot, time],
  );
  const selectedItem =
    selectedLayerId && !cameraMode
      ? frame.items.find((i) => i.layerId === selectedLayerId)
      : undefined;
  const canEditSelected = canEdit && !!selectedItem && !selectedItem.locked;
  // Bevegelsesbanen til valgt lag (i gruppens koordinater når laget ligger i en gruppe)
  const pathLayer =
    selectedLayerId && !cameraMode ? (stateWithDraft.layers[selectedLayerId] ?? null) : null;
  const shownPath = pathLayer?.path ?? null;
  const pathGroup = pathLayer ? groupOf(stateWithDraft, pathLayer) : null;
  const pathToScene = pathGroup ? groupMatrixAt(pathGroup, time) : null;
  const pathNow = shownPath ? pathPointAt(shownPath, pathProgress(shownPath, time)) : null;
  /** Scene → koordinatene til laget (gjennom gruppen det ligger i). */
  const toLocalOf = (layerId: string): Matrix | null => {
    const l = state.layers[layerId];
    const g = l ? groupOf(state, l) : null;
    return g ? invert(groupMatrixAt(g, time)) : null;
  };

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
      ctx.save();
      // Kameravisningen viser bare det filmen viser: alt utenfor bildeformatet klippes bort
      if (cameraMode) {
        ctx.beginPath();
        ctx.rect(
          view.x * dpr,
          view.y * dpr,
          frame.width * view.zoom * dpr,
          frame.height * view.zoom * dpr,
        );
        ctx.clip();
      }
      drawFrame(ctx, frame, {
        view: [dpr * view.zoom, 0, 0, dpr * view.zoom, dpr * view.x, dpr * view.y],
        images,
        placeholders: !cameraMode, // «uten bilde»-merkingen er redigeringshjelp
      });
      ctx.restore();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const colors = colorsRef.current;
      if (!cameraMode) {
        // Rammen rundt bildeformatet er redigeringshjelp og vises ikke i kameravisningen
        ctx.strokeStyle = colors.border;
        ctx.lineWidth = 1;
        ctx.strokeRect(
          Math.round(view.x) - 0.5,
          Math.round(view.y) - 0.5,
          Math.round(frame.width * view.zoom) + 1,
          Math.round(frame.height * view.zoom) + 1,
        );
      }
      // Valgt gruppe: lagene i gruppen lyser opp
      if (selectedItem && state.layers[selectedItem.layerId]?.kind === "group")
        for (const it of frame.items)
          if (state.layers[it.layerId]?.groupId === selectedItem.layerId)
            drawMemberOutline(ctx, it, view, colors);
      if (selectedItem) drawOverlay(ctx, selectedItem, view, colors, canEditSelected && !drawPath);
      if (selectedItem) drawMaskOutline(ctx, selectedItem, view, colors);
      if (selectedItem && canEditSelected && !drawPath)
        drawMaskHandles(ctx, selectedItem, view, colors);
      if (shownPath && !drawPath)
        drawPathOverlay(ctx, shownPath, pathToScene, view, colors, pathNow);
      if (stroke) drawStroke(ctx, stroke, colors);
      if (overlayShot)
        drawCameraOverlay(ctx, overlayShot, composition, view, {
          selected: shotSelected,
          current: currentCamera,
        });
    });
    return () => cancelAnimationFrame(id);
  }, [
    frame,
    view,
    size,
    selectedItem,
    canEditSelected,
    imageTick,
    overlayShot,
    shotSelected,
    currentCamera,
    composition,
    cameraMode,
    shownPath,
    pathToScene,
    pathNow,
    stroke,
    drawPath,
    state.layers,
  ]);

  // Rullehjul: ⌘/Ctrl zoomer rundt pekeren, ellers panorerer
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (cameraMode) return;
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
  }, [commitView, currentView, cameraMode]);

  // ---------- Pekerhåndtering ----------

  function screenPoint(e: React.PointerEvent | React.MouseEvent): Pt {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  /** Kamerahåndtak under pekeren (bare redigerbar scenevisning). «inside» teller bare når ingen lag ligger under. */
  function pickShot(p: Pt): CameraTarget | null {
    if (!canEdit || !overlayShot) return null;
    const t = pickCamera(overlayShot, composition, view, p, shotSelected);
    if (t?.kind !== "inside") return t;
    const s = toScene(view, p);
    return hitTest(frame, s.x, s.y) ? null : t;
  }

  /** Hva ligger under pekeren? Kamerahåndtak i valgt utsnitt og håndtak i valgt lag går foran selve lagene. */
  /** Punkt på bevegelsesbanen til valgt lag under pekeren. */
  function pickPathPoint(p: Pt): number {
    if (!canEditSelected || !shownPath) return -1;
    return shownPath.points.findIndex((q) => {
      const sp = pathToScene ? applyMatrix(pathToScene, q.x, q.y) : q;
      return dist(p, toScreen(view, sp)) <= HANDLE;
    });
  }

  function pick(p: Pt) {
    if (cameraMode) return null;
    if (drawPath) return canEditSelected ? { kind: "draw" as const, cursor: "crosshair" } : null;
    const pi = pickPathPoint(p);
    if (pi >= 0) return { kind: "pathPoint" as const, index: pi, cursor: "move" };
    const cam = pickShot(p);
    if (cam && (shotSelected || cam.kind !== "path"))
      return { kind: "camera" as const, target: cam };
    if (canEditSelected && selectedItem) {
      const h = handlesOf(selectedItem, view);
      if (dist(p, h.rotateAt) <= HANDLE + 2) return { kind: "rotate" as const, cursor: "grab" };
      const i = h.corners.findIndex((c) => dist(p, c) <= HANDLE);
      if (i >= 0)
        return { kind: "scale" as const, cursor: resizeCursor(h.center, h.corners[i] as Pt) };
      const sd =
        dist(h.corners[0] as Pt, h.corners[2] as Pt) > HANDLE * 5
          ? h.sides.find((x) => dist(p, x.at) <= HANDLE)
          : undefined;
      if (sd)
        return {
          kind: "stretch" as const,
          axis: sd.axis,
          cursor: resizeCursor(h.center, sd.at),
        };
      // Masken (DEC-0072): hjørnene endrer størrelsen, midtpunktet og omrisset flytter den
      const mh = maskHandlesOf(selectedItem, view);
      if (mh) {
        const j = mh.corners.findIndex((c) => dist(p, c) <= HANDLE);
        if (j >= 0)
          return {
            kind: "mask" as const,
            handle: j,
            cursor: resizeCursor(mh.center, mh.corners[j] as Pt),
          };
        const outline = maskOutline(selectedItem)?.map((q) => toScreen(view, q)) ?? [];
        if (dist(p, mh.center) <= HANDLE + 2 || distToOutline(p, outline) <= 4)
          return { kind: "mask" as const, handle: -1, cursor: "move" };
      }
    }
    const s = toScene(view, p);
    const hit = hitTest(frame, s.x, s.y);
    // Valgt gruppe: dra i rammen eller i et lag i gruppen flytter hele gruppen (DEC-0052)
    if (
      selectedItem?.kind === "group" &&
      !selectedItem.locked &&
      insideItem(selectedItem, s) &&
      (!hit || state.layers[hit.layerId]?.groupId === selectedItem.layerId)
    )
      return {
        kind: "layer" as const,
        hit: selectedItem,
        cursor: canEditSelected ? "move" : "default",
      };
    if (hit) return { kind: "layer" as const, hit, cursor: canEdit ? "move" : "default" };
    return cam ? { kind: "camera" as const, target: cam } : null;
  }

  function startDrag(
    e: React.PointerEvent,
    kind: DragKind,
    layerId: string,
    p: Pt,
    axis?: "x" | "y",
  ) {
    const layer = state.layers[layerId];
    const item = frame.items.find((i) => i.layerId === layerId);
    if (!layer || !item) return;
    const labels =
      layer.kind === "group"
        ? {
            move: L("Flytt gruppe", "Move group"),
            scale: L("Skaler gruppe", "Scale group"),
            stretch: L("Skvis eller strekk gruppe", "Squash or stretch group"),
            rotate: L("Roter gruppe", "Rotate group"),
            pan: "",
          }
        : {
            move: L("Flytt lag", "Move layer"),
            scale: L("Skaler lag", "Scale layer"),
            stretch: L("Skvis eller strekk lag", "Squash or stretch layer"),
            rotate: L("Roter lag", "Rotate layer"),
            pan: "",
          };
    const start = transformAt(layer, time);
    const toLocal = toLocalOf(layerId);
    const sc = toScene(view, p);
    dragRef.current = {
      kind,
      pointerId: e.pointerId,
      layerId,
      label: labels[kind],
      startScreen: p,
      startScene: toLocal ? applyMatrix(toLocal, sc.x, sc.y) : sc,
      start,
      startView: view,
      toLocal,
      anchor:
        layer.kind === "group"
          ? (layer.anchor ?? { x: layer.transform.x, y: layer.transform.y })
          : null,
      path: layer.path,
      size: { x: item.width, y: item.height },
      moved: false,
      latest: start,
      cursor:
        kind === "scale" || kind === "stretch" ? cursor : kind === "rotate" ? "grabbing" : "move",
      ...(axis ? { axis } : {}),
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function startMaskDrag(e: React.PointerEvent, handle: number, p: Pt) {
    const layer = selectedLayerId ? state.layers[selectedLayerId] : undefined;
    const m = layer ? maskAt(layer, time) : null;
    if (!layer || !selectedItem || !m || m.kind === "layer") return;
    const inv = invert(selectedItem.matrix);
    if (!inv) return;
    // Tegneelementets 0,0 er midten av laget; maskens 0,0 er lagets øverste venstre hjørne
    const toLayer = multiply(translate(selectedItem.width / 2, selectedItem.height / 2), inv);
    const sc = toScene(view, p);
    const start = { x: m.x, y: m.y, width: m.width, height: m.height };
    maskDragRef.current = {
      pointerId: e.pointerId,
      layerId: layer.id,
      handle,
      start,
      toLayer,
      startLayer: applyMatrix(toLayer, sc.x, sc.y),
      startScreen: p,
      moved: false,
      latest: start,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function startCamDrag(e: React.PointerEvent, target: CameraTarget, p: Pt) {
    if (!overlayShot || target.kind === "path") return;
    camDragRef.current = {
      pointerId: e.pointerId,
      shotId: overlayShot.id,
      target,
      startScreen: p,
      startScene: toScene(view, p),
      startShot: overlayShot,
      startView: view,
      moved: false,
      latest: overlayShot,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    wrapRef.current?.focus();
    if (
      dragRef.current ||
      camDragRef.current ||
      pathDragRef.current ||
      maskDragRef.current ||
      drawRef.current
    ) {
      // En dragning som aldri ble avsluttet (pekeren forsvant): start på nytt i stedet for å henge
      if (!e.currentTarget.hasPointerCapture(e.pointerId)) endDrag(false);
      else return;
    }
    const p = screenPoint(e);
    if (!cameraMode && (e.button === 1 || (e.button === 0 && spaceRef.current))) {
      e.preventDefault();
      if (spaceRef.current) spacePanned.current = true;
      dragRef.current = {
        kind: "pan",
        pointerId: e.pointerId,
        layerId: "",
        label: "",
        startScreen: p,
        startScene: p,
        start: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 },
        startView: view,
        toLocal: null,
        anchor: null,
        path: null,
        size: { x: 0, y: 0 },
        moved: false,
        latest: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 },
        cursor: "grabbing",
      };
      e.currentTarget.setPointerCapture(e.pointerId);
      setPanning(true);
      return;
    }
    if (e.button !== 0 || cameraMode) return;
    setError(null);
    const target = pick(p);
    if (target?.kind === "camera") {
      onSelect(null);
      onSelectShot(overlayShot?.id ?? null);
      startCamDrag(e, target.target, p);
      return;
    }
    if (target?.kind === "draw") {
      drawRef.current = { pointerId: e.pointerId, scene: [toScene(view, p)] };
      setStroke([p]);
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }
    if (target?.kind === "pathPoint" && selectedLayerId && shownPath) {
      if (e.altKey) {
        // Alt-klikk fjerner punktet (banen må ha minst to)
        if (shownPath.points.length > 2)
          setError(
            commitPath(
              selectedLayerId,
              { ...shownPath, points: shownPath.points.filter((_, i) => i !== target.index) },
              L("Fjern punkt i banen", "Remove point from the path"),
            ),
          );
        return;
      }
      pathDragRef.current = {
        pointerId: e.pointerId,
        layerId: selectedLayerId,
        index: target.index,
        start: shownPath,
        toLocal: pathToScene ? invert(pathToScene) : null,
        startScreen: p,
        moved: false,
        latest: shownPath,
      };
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }
    if (target?.kind === "mask") {
      startMaskDrag(e, target.handle, p);
      return;
    }
    if (target?.kind === "rotate" || target?.kind === "scale") {
      if (selectedLayerId) startDrag(e, target.kind, selectedLayerId, p);
      return;
    }
    if (target?.kind === "stretch") {
      if (selectedLayerId) startDrag(e, "stretch", selectedLayerId, p, target.axis);
      return;
    }
    if (selectedShotId) onSelectShot(null);
    if (target?.kind === "layer") {
      if (target.hit.layerId !== selectedLayerId) onSelect(target.hit.layerId);
      if (canEdit && !target.hit.locked) startDrag(e, "move", target.hit.layerId, p);
    } else {
      onSelect(null);
    }
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const p = screenPoint(e);
    const dr = drawRef.current;
    if (dr && dr.pointerId === e.pointerId) {
      const last = dr.scene[dr.scene.length - 1]!;
      const sp = toScene(view, p);
      if (dist(toScreen(view, last), p) < 3) return;
      dr.scene.push(sp);
      setStroke(dr.scene.map((q) => toScreen(view, q)));
      return;
    }
    const md = maskDragRef.current;
    if (md && md.pointerId === e.pointerId) {
      if (!md.moved && dist(p, md.startScreen) < 2) return;
      md.moved = true;
      const sp = toScene(view, p);
      md.latest = maskDraftFor(md, applyMatrix(md.toLayer, sp.x, sp.y), e.shiftKey);
      setMaskDraft({ layerId: md.layerId, rect: md.latest });
      return;
    }
    const pd = pathDragRef.current;
    if (pd && pd.pointerId === e.pointerId) {
      if (!pd.moved && dist(p, pd.startScreen) < 2) return;
      pd.moved = true;
      const sp = toScene(view, p);
      const lp = pd.toLocal ? applyMatrix(pd.toLocal, sp.x, sp.y) : sp;
      pd.latest = {
        ...pd.start,
        points: pd.start.points.map((q, i) =>
          i === pd.index
            ? { ...q, x: Math.round(lp.x * 10) / 10, y: Math.round(lp.y * 10) / 10 }
            : q,
        ),
      };
      setPathDraft({ layerId: pd.layerId, path: pd.latest });
      return;
    }
    const cd = camDragRef.current;
    if (cd && cd.pointerId === e.pointerId) {
      if (!cd.moved && dist(p, cd.startScreen) < 2) return;
      cd.moved = true;
      cd.latest = dragCameraShot(
        cd.startShot,
        composition,
        cd.target,
        cd.startScene,
        toScene(cd.startView, p),
        e.shiftKey,
      );
      setCamDraft(cd.latest);
      return;
    }
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) {
      let next = "default";
      if (spaceRef.current && !cameraMode) next = "grab";
      else {
        const t = pick(p);
        next = (t?.kind === "camera" ? cursorFor(t.target) : t?.cursor) ?? "default";
      }
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
    const sp = toScene(d.startView, p);
    d.latest = roundTransform(
      draftFor(d, d.toLocal ? applyMatrix(d.toLocal, sp.x, sp.y) : sp, e.shiftKey, e.altKey),
    );
    setDraft({
      layerId: d.layerId,
      transform: d.latest,
      anchor: d.anchor,
      path: movedPath(d),
    });
  }

  /** Banen flyttes med laget når laget dras (DEC-0052). */
  function movedPath(d: Drag): MotionPath | null {
    if (!d.path || d.kind !== "move") return d.path;
    return translatePath(d.path, d.latest.x - d.start.x, d.latest.y - d.start.y);
  }

  function commitPath(layerId: string, path: MotionPath, label: string): string | null {
    const layer = state.layers[layerId];
    if (!layer) return null;
    return run(
      {
        type: "UpdateLayers",
        layers: [{ layerId: layer.id, fields: { ...layerFieldsOf(layer), path } }],
      },
      label,
    );
  }

  function endDrag(commit: boolean) {
    const dr = drawRef.current;
    if (dr) {
      drawRef.current = null;
      setStroke(null);
      const toLocal = selectedLayerId ? toLocalOf(selectedLayerId) : null;
      if (commit && dr.scene.length > 1)
        onPathDrawn?.(dr.scene.map((q) => (toLocal ? applyMatrix(toLocal, q.x, q.y) : q)));
      return;
    }
    const md = maskDragRef.current;
    if (md) {
      maskDragRef.current = null;
      setMaskDraft(null);
      const layer = state.layers[md.layerId];
      if (!commit || !md.moved || !layer) return;
      // Én kommando per dra; nøkkelbilde når masken er animert eller automatiske nøkkelbilder er på
      setError(
        run(
          {
            type: "UpdateLayers",
            layers: [
              {
                layerId: layer.id,
                fields: fieldsWithMaskAt(layer, layerFieldsOf(layer), time, md.latest, {
                  autoKey,
                }),
              },
            ],
          },
          md.handle < 0
            ? L("Flytt maske", "Move mask")
            : L("Endre størrelse på maske", "Resize mask"),
        ),
      );
      return;
    }
    const pd = pathDragRef.current;
    if (pd) {
      pathDragRef.current = null;
      setPathDraft(null);
      if (commit && pd.moved)
        setError(
          commitPath(pd.layerId, pd.latest, L("Flytt punkt i banen", "Move point in the path")),
        );
      return;
    }
    const cd = camDragRef.current;
    camDragRef.current = null;
    if (cd) {
      setCamDraft(null);
      if (commit && cd.moved) {
        setError(
          run(
            updateCameraCommand(composition, withShot(composition.camera, cd.latest)),
            dragLabel(cd.target),
          ),
        );
      }
      return;
    }
    const d = dragRef.current;
    dragRef.current = null;
    setDraft(null);
    setPanning(false);
    if (!d || d.kind === "pan" || !commit || !d.moved) return;
    const layer = state.layers[d.layerId];
    if (!layer) return;
    submit(layer, d.latest, d.label, d.kind === "move" ? movedPath(d) : undefined);
  }

  function submit(
    layer: NonNullable<ProjectState["layers"][string]>,
    t: LayerTransform,
    label: string,
    path?: MotionPath | null,
  ) {
    const base = layerFieldsOf(layer);
    // Gruppens ankerpunkt ligger fast når gruppen flyttes (ellers flytter lagene seg ikke)
    const anchor =
      layer.kind === "group"
        ? (layer.anchor ?? { x: layer.transform.x, y: layer.transform.y })
        : null;
    // Lag med bevegelsesbane: flytting flytter banen; posisjonen ellers følger banen
    const moved =
      layer.path && path !== undefined
        ? { ...base, path }
        : fieldsWithTransformAt(layer, base, time, t, { autoKey });
    const err = run(
      {
        type: "UpdateLayers",
        layers: [{ layerId: layer.id, fields: { ...moved, anchor } }],
      },
      label,
    );
    setError(err);
  }

  function onPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    if (
      dragRef.current?.pointerId === e.pointerId ||
      camDragRef.current?.pointerId === e.pointerId ||
      pathDragRef.current?.pointerId === e.pointerId ||
      maskDragRef.current?.pointerId === e.pointerId ||
      drawRef.current?.pointerId === e.pointerId
    )
      endDrag(true);
  }

  /** Dobbeltklikk på banen bytter mellom rett og kurvet (mandat 12.3). */
  function onDoubleClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const p = screenPoint(e);
    if (drawPath) return; // tegnemodus: dobbeltklikk åpner ikke bildevalget
    // Dobbeltklikk på et punkt i bevegelsesbanen: kurvet ↔ hjørne
    const pi = pickPathPoint(p);
    if (pi >= 0 && selectedLayerId && shownPath) {
      const q = shownPath.points[pi]!;
      setError(
        commitPath(
          selectedLayerId,
          {
            ...shownPath,
            points: shownPath.points.map((x, i) => (i === pi ? { ...x, smooth: !x.smooth } : x)),
          },
          q.smooth
            ? L("Hjørne i banen", "Corner in the path")
            : L("Kurve i banen", "Curve in the path"),
        ),
      );
      return;
    }
    const t = overlayShot ? pickShot(p) : null;
    if (!overlayShot || t?.kind !== "path") {
      // Dobbeltklikk på et lag: velg et annet bilde for det (DEC-0044); med Alt: Asset Studio (AS1)
      if (cameraMode) return;
      const studio = e.altKey && onOpenAssetStudio;
      if (!studio && !onOpenLayerImage) return;
      const sp = toScene(view, p);
      const hit = hitTest(frame, sp.x, sp.y, { includeLocked: true });
      if (hit) {
        onSelect(hit.layerId);
        if (studio) onOpenAssetStudio(hit.layerId);
        else onOpenLayerImage?.(hit.layerId);
      }
      return;
    }
    onSelect(null);
    onSelectShot(overlayShot.id);
    setError(
      run(
        updateCameraCommand(composition, withShot(composition.camera, toggleCurve(overlayShot))),
        overlayShot.curve
          ? L("Rett kamerabane", "Straight camera path")
          : L("Kurvet kamerabane", "Curved camera path"),
      ),
    );
  }

  // ---------- Tastatur ----------

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (isTextTarget(e.target)) return;
    if (cameraMode) return;
    if (e.key === " " && e.target === e.currentTarget) {
      e.preventDefault();
      if (!spaceRef.current) {
        spaceRef.current = true;
        spacePanned.current = false;
        setCursor("grab");
      }
      return;
    }
    if (e.key === "Escape" && drawPath && !drawRef.current) {
      e.preventDefault();
      onDrawCancel?.();
      return;
    }
    if (
      e.key === "Escape" &&
      (dragRef.current ||
        camDragRef.current ||
        pathDragRef.current ||
        maskDragRef.current ||
        drawRef.current)
    ) {
      e.preventDefault();
      endDrag(false);
      return;
    }
    // Piltaster og sletting bare når selve scenen har fokus (ikke knappene i hjørnet)
    if (e.target !== e.currentTarget && e.target !== canvasRef.current) return;
    if (
      dragRef.current ||
      camDragRef.current ||
      pathDragRef.current ||
      maskDragRef.current ||
      !canEdit ||
      !selectedLayerId
    )
      return;
    const layer = state.layers[selectedLayerId];
    if (!layer || layer.locked) return;
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      setError(removeLayer(run, state, layer, time, L("Slett lag", "Delete layer")));
      return;
    }
    const step = e.shiftKey ? 10 : 1;
    const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
    const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
    if (!dx && !dy) return;
    e.preventDefault();
    const t = transformAt(layer, time);
    submit(
      layer,
      roundTransform({ ...t, x: t.x + dx, y: t.y + dy }),
      L("Flytt lag", "Move layer"),
      layer.path ? translatePath(layer.path, dx, dy) : undefined,
    );
  }

  function onKeyUp(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === " " && spaceRef.current) {
      spaceRef.current = false;
      setCursor("default");
      if (!spacePanned.current) onTogglePlay?.();
    }
  }

  function zoomTo100() {
    const v = currentView();
    commitView(zoomAround(v, { x: size.w / 2, y: size.h / 2 }, 1));
  }
  /** Zoom til et nivå rundt midten av visningen (knappene, DEC-0079). */
  function zoomToLevel(z: number) {
    const v = currentView();
    commitView(zoomAround(v, { x: size.w / 2, y: size.h / 2 }, z));
  }
  /** Neste faste nivå inn eller ut fra dagens zoom. */
  function zoomStep(dir: 1 | -1) {
    const z = view.zoom;
    const next =
      dir > 0
        ? (ZOOM_LEVELS.find((l) => l > z * 1.001) ?? MAX_ZOOM)
        : ([...ZOOM_LEVELS].reverse().find((l) => l < z * 0.999) ?? MIN_ZOOM);
    zoomToLevel(next);
  }

  const label = L(
    `${cameraMode ? "Kameravisning" : "2D-scene"}: ${composition.name.trim() || "Uten navn"}, ${frame.items.length} lag`,
    `${cameraMode ? "Camera view" : "2D scene"}: ${composition.name.trim() || "Untitled"}, ${frame.items.length} layers`,
  );
  const shownCursor = panning ? "grabbing" : cursor;

  return (
    <div
      ref={wrapRef}
      data-stage
      tabIndex={0}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onBlur={() => {
        spaceRef.current = false;
      }}
      onDragOver={(e) => {
        if (!canEdit || cameraMode || !e.dataTransfer.types.includes(ASSET_DRAG_TYPE)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDrop={(e) => {
        const assetId = e.dataTransfer.getData(ASSET_DRAG_TYPE);
        if (!assetId || !canEdit || cameraMode) return;
        e.preventDefault();
        // Ressurs fra «I denne scenen»: nytt lag øverst (bakgrunn nederst), med midten der den slippes
        const r = e.currentTarget.getBoundingClientRect();
        const at = toScene(view, { x: e.clientX - r.left, y: e.clientY - r.top });
        const f = defaultLayerFields(state, composition, {
          assetId,
          assetVariantId: sceneContinuityVariant(state, assetId, composition.variantId),
        });
        const layerId = newId<"composition_layer">();
        const err = run(
          {
            type: "AddLayers",
            layers: [
              {
                layerId,
                compositionId: composition.id,
                fields: {
                  ...f,
                  // En bakgrunn dekker hele bildet (midtstilt); andre lag havner der de slippes
                  transform:
                    f.kind === "background"
                      ? f.transform
                      : { ...f.transform, x: Math.round(at.x), y: Math.round(at.y) },
                },
              },
            ],
          },
          L(`Nytt lag «${f.name}»`, `New layer “${f.name}”`),
        );
        setError(err);
        if (!err) onSelect(layerId);
      }}
      className="relative min-h-0 flex-1 overflow-hidden bg-surface-0 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring"
    >
      <canvas
        ref={canvasRef}
        data-testid="scene-stage"
        data-view-x={view.x}
        data-view-y={view.y}
        data-view-zoom={view.zoom}
        role="img"
        aria-label={label}
        className="absolute inset-0 h-full w-full touch-none"
        style={{ cursor: shownCursor }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => endDrag(false)}
        onDoubleClick={onDoubleClick}
      />
      <div
        role="group"
        aria-label={L("Visning", "View")}
        className="absolute left-3 top-3 flex items-center rounded-md border border-border bg-surface-2 p-0.5"
      >
        {(
          [
            [
              "scene",
              L("Scene", "Scene"),
              L("Hele scenen med redigeringshjelp", "Whole scene with editing help"),
            ],
            [
              "camera",
              L("Kamera", "Camera"),
              L("Kamera: det filmen viser", "Camera: what the film shows"),
            ],
          ] as const
        ).map(([id, text, title]) => (
          <Button
            key={id}
            size="sm"
            variant={mode === id ? "secondary" : "ghost"}
            aria-pressed={mode === id}
            title={
              id === "camera" ? L("Kamera: det filmen viser", "Camera: what the film shows") : title
            }
            onClick={() => onViewChange(id)}
          >
            {text}
          </Button>
        ))}
      </div>
      <div className="absolute bottom-3 right-3 flex flex-col items-end gap-1">
        {error ? (
          <p role="alert" className="rounded-sm bg-surface-2 px-2 py-1 text-xs text-status-danger">
            {error}
          </p>
        ) : null}
        <div
          className={`flex items-center gap-1 rounded-md border border-border bg-surface-2 px-1 py-0.5 ${cameraMode ? "hidden" : ""}`}
        >
          <Button
            size="sm"
            variant="ghost"
            onClick={() => zoomStep(-1)}
            aria-label={L("Zoom ut", "Zoom out")}
            title={L("Zoom ut (⌘/Ctrl + rullehjul)", "Zoom out (⌘/Ctrl + scroll wheel)")}
          >
            <ZoomOut />
          </Button>
          <select
            aria-label={L("Zoomnivå", "Zoom level")}
            value=""
            onChange={(e) => {
              if (e.target.value) zoomToLevel(Number(e.target.value));
            }}
            className="h-7 min-w-[64px] rounded-sm border border-border-control bg-surface-3 px-1 text-right text-xs tabular-nums text-text-secondary"
            title={L("Velg zoomnivå", "Choose zoom level")}
          >
            <option value="">{Math.round(view.zoom * 100)} %</option>
            {ZOOM_LEVELS.map((z) => (
              <option key={z} value={z}>
                {Math.round(z * 100)} %
              </option>
            ))}
          </select>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => zoomStep(1)}
            aria-label={L("Zoom inn", "Zoom in")}
            title={L("Zoom inn (⌘/Ctrl + rullehjul)", "Zoom in (⌘/Ctrl + scroll wheel)")}
          >
            <ZoomIn />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => commitView(null)}>
            {L("Tilpass", "Fit")}
          </Button>
          <Button size="sm" variant="ghost" onClick={zoomTo100}>
            100 %
          </Button>
        </div>
      </div>
    </div>
  );
}
