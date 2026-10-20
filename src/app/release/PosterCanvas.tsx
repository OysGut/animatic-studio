/**
 * Forhåndsvisning og direkte redigering av plakaten (DEC-0061, REQ-0398/0399): SVG fra samme tegneliste som
 * PNG og trykk-PDF. Klikk velger et element, dra flytter det. Hjørnene endrer størrelsen og håndtaket over
 * elementet roterer det, også når elementet er rotert (KI-132): Shift beholder forholdet ved størrelse og gir
 * trinn på 15° ved rotasjon. Hvert dra er ett steg som kan angres; Esc avbryter draget. Piltaster flytter
 * valgt element 1 mm (med Shift 10 mm). Tekst som ikke får plass, markeres.
 */
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { CSS_FONT, PT_TO_MM, renderPoster, type Poster, type PosterElement, type ProjectState, type RenderOp } from "@/core";
import { elementIdOfOp, isLocked } from "./poster-edit";
import {
  changedFields,
  cornerCursor,
  dragGeometry,
  type Corner,
  type DragMode,
} from "./poster-handles";
import { t } from "@/core/i18n/keyed";

interface Drag {
  readonly id: string;
  /** Flytt, størrelse fra et hjørne eller rotasjon. */
  readonly mode: DragMode;
  readonly startX: number;
  readonly startY: number;
  readonly orig: PosterElement;
  readonly x: number;
  readonly y: number;
  readonly shift: boolean;
  readonly moved: boolean;
  readonly pointerId: number;
}

const CORNERS: readonly Corner[] = ["nw", "ne", "sw", "se"];

function textStyle(o: Extract<RenderOp, { op: "text" }>) {
  const bold = o.font === "sansBold" || o.font === "serifBold";
  return {
    fontFamily: CSS_FONT[o.font],
    fontWeight: bold ? 700 : 400,
    fontStyle: o.font === "serifItalic" ? "italic" : "normal",
  } as const;
}

const rot = (o: { x: number; y: number; w: number; h: number; rotation: number }) =>
  o.rotation ? `rotate(${o.rotation} ${o.x + o.w / 2} ${o.y + o.h / 2})` : undefined;

export function PosterCanvas({
  state,
  poster,
  lang,
  urls,
  selectedId,
  onSelect,
  editable,
  onCommit,
  highlight,
}: {
  state: ProjectState;
  poster: Poster;
  lang: "nb" | "en";
  urls: Readonly<Record<string, string>>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  editable: boolean;
  /** Elementet er flyttet eller endret i størrelse. */
  onCommit: (id: string, patch: Partial<PosterElement>, label: string, group?: string) => void;
  /** Elementer som kontrollen peker på. */
  highlight: readonly string[];
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const uid = useId().replace(/:/g, "");
  const [drag, setDrag] = useState<Drag | null>(null);
  const W = poster.widthMm;
  const H = poster.heightMm;

  // Under dragging tegnes plakaten med elementet flyttet
  const shown = useMemo<Poster>(() => {
    if (!drag || !drag.moved) return poster;
    const patch = dragGeometry(
      drag.mode,
      drag.orig,
      { x: drag.startX, y: drag.startY },
      { x: drag.x, y: drag.y },
      drag.shift,
    );
    return {
      ...poster,
      document: {
        ...poster.document,
        elements: poster.document.elements.map((e) => (e.id === drag.id ? { ...e, ...patch } : e)),
      },
    };
  }, [poster, drag]);
  const ops = useMemo(() => renderPoster(state, shown, lang), [state, shown, lang]);
  const byId = useMemo(
    () => new Map(shown.document.elements.map((e) => [e.id, e])),
    [shown.document.elements],
  );
  const selected = selectedId ? byId.get(selectedId) : undefined;

  const toMm = (e: { clientX: number; clientY: number }) => {
    const svg = svgRef.current;
    const m = svg?.getScreenCTM();
    if (!svg || !m) return { x: 0, y: 0 };
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  };

  const startDrag = (e: ReactPointerEvent, id: string, mode: Drag["mode"]) => {
    const el = poster.document.elements.find((x) => x.id === id);
    if (!el) return;
    e.stopPropagation();
    onSelect(id);
    if (!editable || isLocked(el)) return;
    // Fanges på hele tegningen: elementet under musen kan byttes ut mens det dras
    svgRef.current?.setPointerCapture?.(e.pointerId);
    const p = toMm(e);
    setDrag({
      id,
      mode,
      startX: p.x,
      startY: p.y,
      // Eldre plakater kan mangle rotasjon
      orig: { ...el, rotation: el.rotation ?? 0 },
      x: p.x,
      y: p.y,
      shift: e.shiftKey,
      moved: false,
      pointerId: e.pointerId,
    });
  };

  const onMove = (e: ReactPointerEvent) => {
    if (!drag) return;
    const p = toMm(e);
    const moved = drag.moved || Math.hypot(p.x - drag.startX, p.y - drag.startY) > W / 400;
    setDrag({ ...drag, x: p.x, y: p.y, shift: e.shiftKey, moved });
  };

  const endDrag = () => {
    if (!drag) return;
    if (drag.moved) {
      const geo = dragGeometry(
        drag.mode,
        drag.orig,
        { x: drag.startX, y: drag.startY },
        { x: drag.x, y: drag.y },
        drag.shift,
      );
      const patch = changedFields(drag.orig, geo);
      // Ett dra er ett steg som kan angres (samme som flytting)
      if (Object.keys(patch).length > 0)
        onCommit(
          drag.id,
          patch,
          drag.mode === "move"
            ? t("app-release-poster-canvas.end-drag.on-commit.8cccd431d926")
            : drag.mode === "rotate"
              ? t("app-release-poster-canvas.end-drag.on-commit.00f5884f9520")
              : t("app-release-poster-canvas.end-drag.on-commit.40400006785f"),
        );
    }
    setDrag(null);
  };

  // Esc avbryter draget (elementet går tilbake), Shift kan trykkes og slippes underveis
  const dragging = drag !== null;
  useEffect(() => {
    if (!dragging) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setDrag((d) => {
          if (d) svgRef.current?.releasePointerCapture?.(d.pointerId);
          return null;
        });
      } else if (e.key === "Shift")
        setDrag((d) => (d && d.shift !== (e.type === "keydown") ? { ...d, shift: !d.shift } : d));
    };
    window.addEventListener("keydown", key, true);
    window.addEventListener("keyup", key, true);
    return () => {
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("keyup", key, true);
    };
  }, [dragging]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onSelect(null);
    if (!selected || !editable || isLocked(selected)) return;
    const step = e.shiftKey ? 10 : 1;
    const d =
      e.key === "ArrowLeft"
        ? [-step, 0]
        : e.key === "ArrowRight"
          ? [step, 0]
          : e.key === "ArrowUp"
            ? [0, -step]
            : e.key === "ArrowDown"
              ? [0, step]
              : null;
    if (!d) return;
    e.preventDefault();
    // Flere trykk etter hverandre angres som ett steg
    onCommit(
      selected.id,
      { x: selected.x + d[0]!, y: selected.y + d[1]! },
      t("app-release-poster-canvas.on-key.on-commit.07742901f562"),
      `nudge:${poster.id}:${selected.id}`,
    );
  };

  const hl = new Set(highlight);
  const handle = W / 90;
  const outline = W / 600;
  // Tomme tekstfelt tegnes ikke; de vises som en stiplet ramme så de kan velges
  const empty = shown.document.elements.filter(
    (e) => e.visible && e.kind === "text" && !ops.some((o) => o.id === e.id),
  );

  return (
    <svg
      ref={svgRef}
      role="application"
      aria-label={t("app-release-poster-canvas.poster-canvas.aria-label.01176a13ea38", { name: String(poster.name) })}
      tabIndex={0}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid meet"
      className="h-full w-full touch-none select-none outline-none focus-visible:outline-2 focus-visible:outline-focus-ring"
      onPointerMove={onMove}
      onPointerUp={endDrag}
      onPointerCancel={() => setDrag(null)}
      onPointerDown={() => onSelect(null)}
      onKeyDown={onKey}
    >
      <defs>
        <filter id="poster-shadow" x="-5%" y="-5%" width="110%" height="110%">
          <feDropShadow dx="0" dy={W / 400} stdDeviation={W / 300} floodOpacity="0.35" />
        </filter>
      </defs>
      <rect x={0} y={0} width={W} height={H} fill="#ffffff" filter="url(#poster-shadow)" />
      {ops.map((o, i) => {
        const id = elementIdOfOp(o.id);
        const down = (e: ReactPointerEvent) => startDrag(e, id, "move");
        const cursor = editable && byId.get(id) && !isLocked(byId.get(id)!) ? "move" : "default";
        if (o.op === "rect")
          return (
            <rect
              key={`${o.id}:${i}`}
              x={o.x}
              y={o.y}
              width={o.w}
              height={o.h}
              rx={o.radius}
              fill={o.fill ?? "none"}
              stroke={o.stroke ?? "none"}
              strokeWidth={o.strokeWidth}
              opacity={o.opacity}
              transform={rot(o)}
              onPointerDown={down}
              style={{ cursor }}
            />
          );
        if (o.op === "line")
          return (
            <g key={`${o.id}:${i}`} onPointerDown={down}>
              <line
                x1={o.x1}
                y1={o.y1}
                x2={o.x2}
                y2={o.y2}
                stroke={o.stroke}
                strokeWidth={o.strokeWidth}
                strokeLinecap="round"
                strokeDasharray={
                  o.dashed ? `${o.strokeWidth * 3} ${o.strokeWidth * 2.5}` : undefined
                }
                opacity={o.opacity}
              />
              {/* Bredere usynlig linje, lettere å treffe */}
              <line
                x1={o.x1}
                y1={o.y1}
                x2={o.x2}
                y2={o.y2}
                stroke="transparent"
                strokeWidth={W / 120}
              />
            </g>
          );
        if (o.op === "image") {
          const url = urls[o.mediaPath];
          return (
            <g
              key={`${o.id}:${i}`}
              transform={rot(o)}
              opacity={o.opacity}
              onPointerDown={down}
              style={{ cursor }}
            >
              {o.clip ? (
                <clipPath id={`pc-${uid}-${i}`}>
                  <rect x={o.x} y={o.y} width={o.w} height={o.h} />
                </clipPath>
              ) : null}
              {/* Usynlig flate så hele rammen kan velges */}
              <rect x={o.x} y={o.y} width={o.w} height={o.h} fill="transparent" />
              {url ? (
                <image
                  href={url}
                  x={o.ix}
                  y={o.iy}
                  width={o.iw}
                  height={o.ih}
                  preserveAspectRatio="none"
                  clipPath={o.clip ? `url(#pc-${uid}-${i})` : undefined}
                />
              ) : null}
            </g>
          );
        }
        const sizeMm = o.size * PT_TO_MM;
        return (
          <g
            key={`${o.id}:${i}`}
            transform={rot(o)}
            opacity={o.opacity}
            onPointerDown={down}
            style={{ cursor }}
          >
            <rect x={o.x} y={o.y} width={o.w} height={o.h} fill="transparent" />
            <text
              fill={o.color}
              fontSize={sizeMm}
              letterSpacing={o.tracking ? (o.tracking / 1000) * sizeMm : undefined}
              style={{ ...textStyle(o), whiteSpace: "pre" }}
            >
              {o.lines.map((l, j) => (
                <tspan key={j} x={l.x} y={l.y}>
                  {l.text}
                </tspan>
              ))}
            </text>
            {o.overflow ? (
              <rect
                x={o.x}
                y={o.y}
                width={o.w}
                height={o.h}
                fill="none"
                stroke="#e5484d"
                strokeWidth={outline}
                strokeDasharray={`${outline * 4} ${outline * 3}`}
              >
                <title>{t("app-release-poster-canvas.poster-canvas.title.1f5e3badbf23")}</title>
              </rect>
            ) : null}
          </g>
        );
      })}
      {editable
        ? empty.map((e) => (
            <rect
              key={`empty:${e.id}`}
              x={e.x}
              y={e.y}
              width={e.w}
              height={e.h}
              fill="transparent"
              stroke="#8a8f98"
              strokeWidth={outline}
              strokeDasharray={`${outline * 4} ${outline * 3}`}
              onPointerDown={(ev) => startDrag(ev, e.id, "move")}
              style={{ cursor: "move" }}
            >
              <title>{t("app-release-poster-canvas.poster-canvas.title.9f1a8c9f0f53")}</title>
            </rect>
          ))
        : null}
      {[...hl].map((id) => {
        const e = byId.get(id);
        if (!e || e.kind === "relation") return null;
        return (
          <rect
            key={`hl:${id}`}
            x={e.x}
            y={e.y}
            width={e.w}
            height={e.h}
            fill="none"
            stroke="#f5a524"
            strokeWidth={outline * 1.5}
            pointerEvents="none"
          />
        );
      })}
      {selected && selected.kind !== "relation" ? (
        <g pointerEvents="none" transform={rot(selected)}>
          <rect
            x={selected.x}
            y={selected.y}
            width={selected.w}
            height={selected.h}
            fill="none"
            stroke="#4c8dff"
            strokeWidth={outline * 1.5}
            strokeDasharray={`${outline * 5} ${outline * 3}`}
          />
        </g>
      ) : null}
      {selected && editable && selected.kind !== "relation" && !isLocked(selected) ? (
        // Håndtakene tegnes i elementets lokale koordinater, så de følger rotasjonen
        <g transform={rot(selected)}>
          {selected.kind !== "line" ? (
            <>
              <line
                x1={selected.x + selected.w / 2}
                y1={selected.y}
                x2={selected.x + selected.w / 2}
                y2={selected.y - handle * 2.2}
                stroke="#4c8dff"
                strokeWidth={outline * 1.5}
                pointerEvents="none"
              />
              <circle
                aria-label={t("app-release-poster-canvas.poster-canvas.aria-label.9c3e64951ba2")}
                cx={selected.x + selected.w / 2}
                cy={selected.y - handle * 2.6}
                r={handle * 0.6}
                fill="#ffffff"
                stroke="#4c8dff"
                strokeWidth={outline * 1.5}
                style={{ cursor: "grab" }}
                onPointerDown={(e) => startDrag(e, selected.id, "rotate")}
              >
                <title>{t("app-release-poster-canvas.poster-canvas.title.9c3e64951ba2")}</title>
              </circle>
            </>
          ) : null}
          {/* Streker har ingen størrelseshåndtak (de flyttes og endres i feltene) */}
          {(selected.kind === "line" ? [] : CORNERS).map((c) => (
            <rect
              key={c}
              aria-label={t("app-release-poster-canvas.poster-canvas.aria-label.47e78ff53838")}
              x={selected.x + (c === "ne" || c === "se" ? selected.w : 0) - handle / 2}
              y={selected.y + (c === "sw" || c === "se" ? selected.h : 0) - handle / 2}
              width={handle}
              height={handle}
              fill="#4c8dff"
              stroke="#ffffff"
              strokeWidth={outline}
              style={{ cursor: cornerCursor(c, selected.rotation) }}
              onPointerDown={(e) => startDrag(e, selected.id, c)}
            >
              <title>
                {t("app-release-poster-canvas.poster-canvas.title.47e78ff53838")}
              </title>
            </rect>
          ))}
        </g>
      ) : null}
    </svg>
  );
}
