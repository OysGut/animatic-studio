/**
 * Objektets tidslinje i Asset Studio (AS2): lagets aktive tidsområde (A3) med endene som kan dras, og
 * bildesegmentene (A1) som kan flyttes, trimmes, fjernes og erstattes. Alt er ett lag med samme identitet;
 * segmentene er bildeskiftene. Endringer går til utkastet først når et drag slippes. Scenens lengde og andre
 * lag eller dialog flyttes aldri.
 */
import { useRef, useState, type ReactNode } from "react";
import {
  L,
  imageSegmentsOf,
  insertImageSegment,
  moveImageSegment,
  trimImageSegment,
  type LayerFields,
  type ProjectState,
} from "@/core";
import { STUDIO_VERSION_DRAG_TYPE, type StripImage } from "./VariantStrip";

type Drag = (
  | { kind: "range-start" | "range-end"; frame: number }
  | { kind: "move"; index: number; frame: number }
  | { kind: "trim"; index: number; frame: number }
) & { moved?: boolean };

export function ObjectTimeline({
  state,
  fields,
  durationFrames,
  frame,
  editable,
  selected,
  onSelect,
  onSeek,
  onChange,
  children,
}: {
  state: ProjectState;
  fields: LayerFields;
  durationFrames: number;
  frame: number;
  editable: boolean;
  selected: number | null;
  onSelect: (index: number | null) => void;
  onSeek: (frame: number) => void;
  onChange: (fields: LayerFields, label: string) => void;
  children?: ReactNode;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dur = Math.max(1, durationFrames);
  const pct = (f: number) => `${(Math.min(dur, Math.max(0, f)) / dur) * 100}%`;
  const frameAt = (clientX: number) => {
    const r = trackRef.current?.getBoundingClientRect();
    if (!r || r.width <= 0) return 0;
    return Math.min(dur - 1, Math.max(0, Math.round(((clientX - r.left) / r.width) * dur)));
  };

  // Det som vises (med et pågående drag)
  let shown = fields;
  if (drag?.kind === "move" && drag.moved)
    shown = moveImageSegment(fields, drag.index, drag.frame, dur);
  if (drag?.kind === "trim" && drag.moved) shown = trimImageSegment(fields, drag.index, drag.frame);
  const range = fields.activeRange ?? { from: 0, to: dur - 1 };
  const shownRange =
    drag?.kind === "range-start"
      ? { from: Math.min(drag.frame, range.to), to: range.to }
      : drag?.kind === "range-end"
        ? { from: range.from, to: Math.max(drag.frame, range.from) }
        : range;
  const segments = imageSegmentsOf(shown, dur);

  function startDrag(e: React.PointerEvent, d: Drag) {
    if (!editable) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag(d);
  }
  function moveDrag(e: React.PointerEvent) {
    if (!drag) return;
    const f = frameAt(e.clientX);
    if (f !== drag.frame || drag.moved) setDrag({ ...drag, frame: f, moved: true });
  }
  function endDrag() {
    if (!drag) return;
    const d = drag;
    setDrag(null);
    if (!d.moved) return;
    if (d.kind === "range-start" || d.kind === "range-end") {
      const next =
        d.kind === "range-start"
          ? { from: Math.min(d.frame, range.to), to: range.to }
          : { from: range.from, to: Math.max(d.frame, range.from) };
      if (next.from === range.from && next.to === range.to) return;
      onChange(
        { ...fields, activeRange: next.from === 0 && next.to >= dur - 1 ? null : next },
        L("Endre objektets tidsområde", "Change the object's time range"),
      );
    } else if (d.kind === "move") {
      onChange(moveImageSegment(fields, d.index, d.frame, dur), L("Flytt bildesegment", "Move image segment"));
    } else if (d.kind === "trim") {
      onChange(trimImageSegment(fields, d.index, d.frame), L("Trim bildesegment", "Trim image segment"));
    }
  }

  function onDrop(e: React.DragEvent) {
    const raw = e.dataTransfer.getData(STUDIO_VERSION_DRAG_TYPE);
    if (!raw || !editable) return;
    e.preventDefault();
    const img = JSON.parse(raw) as StripImage;
    onChange(
      insertImageSegment(fields, frameAt(e.clientX), img),
      L("Nytt bildesegment", "New image segment"),
    );
  }

  const handle =
    "absolute top-0 z-10 h-full w-2 -translate-x-1/2 cursor-ew-resize rounded-sm bg-accent-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <div className="flex flex-col gap-1 px-3 py-2" data-testid="asset-studio-timeline">
      <div ref={trackRef} className="relative flex flex-col gap-1">
        {/* Linjal: klikk flytter avspillingshodet */}
        <div
          className="relative h-4 cursor-pointer rounded-sm bg-surface-3"
          onPointerDown={(e) => onSeek(frameAt(e.clientX))}
          aria-label={L("Tidslinjal", "Time ruler")}
        />
        {/* Aktivt tidsområde */}
        <div className="relative h-5 rounded-sm bg-surface-2" data-testid="asset-studio-range">
          <div
            className="absolute top-0 h-full rounded-sm bg-accent-brand/30"
            style={{ left: pct(shownRange.from), width: pct(shownRange.to - shownRange.from + 1) }}
          />
          <button
            type="button"
            className={handle}
            style={{ left: pct(shownRange.from) }}
            data-testid="asset-studio-range-start"
            aria-label={L("Start på objektets tidsområde", "Start of the object's time range")}
            title={L("Dra for å endre når objektet vises", "Drag to change when the object is shown")}
            disabled={!editable}
            onPointerDown={(e) => startDrag(e, { kind: "range-start", frame: shownRange.from })}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
          />
          <button
            type="button"
            className={handle}
            style={{ left: pct(shownRange.to + 1) }}
            data-testid="asset-studio-range-end"
            aria-label={L("Slutt på objektets tidsområde", "End of the object's time range")}
            title={L("Dra for å endre når objektet forsvinner", "Drag to change when the object disappears")}
            disabled={!editable}
            onPointerDown={(e) => startDrag(e, { kind: "range-end", frame: shownRange.to })}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
          />
        </div>
        {/* Bildesegmenter */}
        <div
          className="relative h-10 rounded-sm bg-surface-2"
          data-testid="asset-studio-segments"
          onDragOver={(e) => {
            if (editable && e.dataTransfer.types.includes(STUDIO_VERSION_DRAG_TYPE)) {
              e.preventDefault();
              e.dataTransfer.dropEffect = "copy";
            }
          }}
          onDrop={onDrop}
        >
          {segments.map((seg) => {
            const asset = seg.image ? state.assets[seg.image.assetId] : undefined;
            const ver = seg.image?.versionId ? state.assetVersions[seg.image.versionId] : undefined;
            const isSel = selected === seg.index;
            return (
              <div
                key={seg.index}
                role="button"
                tabIndex={0}
                data-testid="asset-studio-segment"
                data-index={seg.index}
                data-start={seg.start}
                data-end={seg.end}
                aria-pressed={isSel}
                onClick={() => onSelect(isSel ? null : seg.index)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(isSel ? null : seg.index);
                  }
                }}
                onPointerDown={(e) =>
                  seg.index > 0 ? startDrag(e, { kind: "move", index: seg.index, frame: seg.start }) : undefined
                }
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                className={
                  "absolute top-0 flex h-full items-center overflow-hidden border-l border-border px-1 text-[11px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
                  (isSel ? "bg-accent-selection text-text-primary" : "bg-surface-3 text-text-secondary") +
                  (seg.index > 0 && editable ? " cursor-grab" : "")
                }
                style={{ left: pct(seg.start), width: pct(seg.end - seg.start) }}
                title={L(
                  "Klikk for å velge. Dra for å flytte starten. Dra i høyre kant for å trimme.",
                  "Click to select. Drag to move the start. Drag the right edge to trim.",
                )}
              >
                {seg.transition ? (
                  <span
                    aria-hidden
                    className="absolute left-0 top-0 h-full bg-accent-brand/25"
                    style={{ width: `${(seg.transition.frames / Math.max(1, seg.end - seg.start)) * 100}%` }}
                  />
                ) : null}
                <span className="relative truncate">
                  {asset?.name ?? L("Fargeflate", "Colour fill")}
                  {ver ? ` v${ver.number}` : ""}
                </span>
                {seg.end < dur && editable ? (
                  <span
                    role="separator"
                    aria-label={L("Trim slutten av segmentet", "Trim the end of the segment")}
                    data-testid="asset-studio-segment-trim"
                    className="absolute right-0 top-0 h-full w-1.5 cursor-ew-resize bg-border"
                    onPointerDown={(e) => startDrag(e, { kind: "trim", index: seg.index, frame: seg.end })}
                    onPointerMove={moveDrag}
                    onPointerUp={endDrag}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
        {children}
        {/* Avspillingshodet */}
        <div
          aria-hidden
          className="pointer-events-none absolute top-0 h-full w-px bg-accent-brand"
          style={{ left: pct(frame) }}
          data-testid="asset-studio-playhead"
        />
      </div>
    </div>
  );
}
