/**
 * Tidsredigering av pauser (fase 2, bolk E, DEC-0096, REQ-0705–0708): en egen modus der ordene vises med
 * avstand som tilsvarer tiden mellom dem. Brukeren drar et mellomrom (eller et ord) for å gjøre pausen lengre
 * eller kortere, eller markerer flere ord og trekker dem fra hverandre (tiden fordeles likt). Hver pause har
 * tallfelt og valg av fyll. Bare lydens timing endres – manusteksten røres aldri (REQ-0707), og vanlig
 * markering av ord endrer aldri timingen (§33).
 */
import { useMemo, useRef, useState } from "react";
import { newId, pauseFor, setPause, setPauseFill, spreadPause, wordSpansInComposition, type AlignmentSource, type AudioComposition, type LineToken, type PauseFill, type WordAlignment } from "@/core";
import { Button } from "@/components/ui/button";
import { t } from "@/core/i18n/keyed";

const segId = () => newId<"audio_segment">();
/** Millisekunder per skjermpunkt når et mellomrom eller ord dras. */
const MS_PER_PX = 5;
const gapWidth = (ms: number) => Math.max(4, Math.min(220, ms / MS_PER_PX));

type Change = { readonly token: LineToken; readonly oldIndex: number | null };

function fillKey(f: PauseFill): string {
  return f.kind === "asset" ? `asset:${f.versionId}` : f.kind;
}
function fillFromKey(k: string): PauseFill {
  if (k.startsWith("asset:")) return { kind: "asset", versionId: k.slice(6) };
  if (k === "silence" || k === "manual") return { kind: k };
  return { kind: "room" };
}

export function PauseTimingPanel({
  al,
  src,
  comp,
  changes,
  sel,
  onPick,
  onEdit,
  roomFiles,
}: {
  al: WordAlignment;
  src: AlignmentSource;
  comp: AudioComposition;
  changes: readonly Change[];
  sel: { from: number; to: number } | null;
  onPick: (k: number, extend: boolean) => void;
  /** En fullført endring: fylles med romlyd og legges i angre-listen. Gir meldinger om pauser som ikke ble fylt. */
  onEdit: (next: AudioComposition) => string[];
  roomFiles: readonly { versionId: string; label: string }[];
}) {
  const spans = useMemo(() => wordSpansInComposition(comp, al, src), [comp, al, src]);
  const [gapSel, setGapSel] = useState<number | null>(null);
  const [live, setLive] = useState<{ kind: "gap" | "word"; k: number; ms: number } | null>(null);
  const [spreadMs, setSpreadMs] = useState("300");
  const [msgs, setMsgs] = useState<string[]>([]);
  const drag = useRef<{ kind: "gap" | "word"; k: number; x: number; moved: boolean } | null>(null);

  /** Mellomrommet før token k (alignment-indeks for ordet før), når begge ordene har tid. */
  const gapBefore = (k: number): { afterWord: number; ms: number } | null => {
    const o = changes[k]?.oldIndex;
    const p = changes[k - 1]?.oldIndex;
    if (o === null || o === undefined || p === null || p === undefined || p !== o - 1) return null;
    const a = spans[p];
    const b = spans[o];
    return a && b ? { afterWord: p, ms: Math.max(0, b.startMs - a.endMs) } : null;
  };

  function commit(next: AudioComposition | null, fail: string) {
    if (!next) {
      setMsgs([fail]);
      return;
    }
    setMsgs(onEdit(next));
  }

  const cannot = t("app-audio-pause-timing-panel.cannot.message.9589b92aeb10");

  function changeGap(afterWord: number, byMs: number) {
    const cur = pauseFor(comp, afterWord)?.deltaMs ?? 0;
    commit(setPause(comp, al, src, afterWord, cur + Math.round(byMs), segId), cannot);
  }

  /** Utvalget i ordkoblingens indekser (bare når begge endene har tid). */
  const selWords = (() => {
    if (!sel || sel.from === sel.to) return null;
    const a = changes[sel.from]?.oldIndex;
    const b = changes[sel.to]?.oldIndex;
    return a === null || a === undefined || b === null || b === undefined ? null : { a, b };
  })();

  function finishDrag(e: React.PointerEvent) {
    const d = drag.current;
    drag.current = null;
    setLive(null);
    if (!d) return;
    const ms = (e.clientX - d.x) * MS_PER_PX;
    if (!d.moved) {
      if (d.kind === "word") onPick(d.k, e.shiftKey);
      else {
        const g = gapBefore(d.k);
        if (g) setGapSel(g.afterWord);
      }
      return;
    }
    if (d.kind === "word" && selWords && sel && d.k >= sel.from && d.k <= sel.to) {
      // Flere ord trekkes fra hverandre: tiden fordeles likt på mellomrommene i utvalget (P3/P4)
      commit(spreadPause(comp, al, src, selWords.a, selWords.b, ms, segId), cannot);
      return;
    }
    const g = gapBefore(d.k);
    if (g) {
      setGapSel(g.afterWord);
      changeGap(g.afterWord, ms);
    } else setMsgs([cannot]);
  }

  const pointer = (kind: "gap" | "word", k: number) => ({
    onPointerDown: (e: React.PointerEvent) => {
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
      drag.current = { kind, k, x: e.clientX, moved: false };
    },
    onPointerMove: (e: React.PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      if (Math.abs(e.clientX - d.x) > 3) d.moved = true;
      if (d.moved) setLive({ kind, k, ms: (e.clientX - d.x) * MS_PER_PX });
    },
    onPointerUp: finishDrag,
    onPointerCancel: () => {
      drag.current = null;
      setLive(null);
    },
  });

  const selected = gapSel !== null ? pauseFor(comp, gapSel) : undefined;
  const selGap = (() => {
    if (gapSel === null) return null;
    const a = spans[gapSel];
    const b = spans[gapSel + 1];
    return a && b ? Math.max(0, b.startMs - a.endMs) : null;
  })();
  const word = (i: number) => al.words[i]?.text ?? "";

  return (
    <div data-testid="pause-timing">
      <p
        className="mt-2 flex flex-wrap items-center gap-y-1 font-mono text-[13px] leading-7"
        data-testid="pause-timing-words"
      >
        {changes.map((c, k) => {
          const g = k > 0 ? gapBefore(k) : null;
          const liveMs = live && live.k === k ? live.ms : 0;
          const chosen = sel && k >= sel.from && k <= sel.to;
          const isGapSel = g && gapSel === g.afterWord;
          return (
            <span key={k} className="inline-flex items-center">
              {g ? (
                <span
                  role="slider"
                  tabIndex={0}
                  aria-label={t("app-audio-pause-timing-panel.pause-timing-panel.aria-label.db6e8a38715a", { value1: String(word(g.afterWord)), value2: String(word(g.afterWord + 1)) })}
                  aria-valuemin={0}
                  aria-valuemax={60000}
                  aria-valuenow={Math.round(g.ms)}
                  aria-valuetext={`${Math.round(g.ms)} ms`}
                  title={t("app-audio-pause-timing-panel.pause-timing-panel.title.8225ef09ae3e", { value1: String(Math.round(g.ms)) })}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                      e.preventDefault();
                      setGapSel(g.afterWord);
                      changeGap(g.afterWord, e.key === "ArrowRight" ? 50 : -50);
                    }
                  }}
                  className={
                    "mx-0.5 inline-block h-5 cursor-ew-resize touch-none rounded-sm border " +
                    (isGapSel
                      ? "border-accent-warm bg-accent-warm/40"
                      : pauseFor(comp, g.afterWord)
                        ? "border-accent-warm/60 bg-accent-warm/15"
                        : "border-border bg-surface-3")
                  }
                  style={{
                    width: `${gapWidth(Math.max(0, g.ms + (live?.kind === "gap" ? liveMs : 0)))}px`,
                  }}
                  data-testid="pause-gap"
                  data-after-word={g.afterWord}
                  data-ms={Math.round(g.ms)}
                  {...pointer("gap", k)}
                />
              ) : k > 0 ? (
                <span className="inline-block w-1.5" aria-hidden />
              ) : null}
              <button
                type="button"
                className={
                  "touch-none rounded-sm px-1 " +
                  (chosen
                    ? "bg-accent-warm/30 text-text-primary ring-1 ring-accent-warm"
                    : c.oldIndex === null
                      ? "border border-dashed border-accent-warm text-accent-warm"
                      : "text-text-primary hover:bg-surface-3")
                }
                style={
                  live?.kind === "word" && live.k === k
                    ? { translate: `${liveMs / MS_PER_PX}px 0` }
                    : undefined
                }
                onClick={(e) => {
                  // Tastatur (Enter/mellomrom) markerer; pekeren håndteres i onPointerUp
                  if (e.detail === 0) onPick(k, e.shiftKey);
                }}
                data-testid="pause-word"
                {...pointer("word", k)}
              >
                {c.token.text}
              </button>
            </span>
          );
        })}
      </p>
      <p className="text-[11px] text-text-tertiary">
        {t("app-audio-pause-timing-panel.pause-timing-panel.p.8df9c0305989")}
      </p>

      <div className="mt-2 flex flex-wrap items-end gap-2 text-xs text-text-secondary">
        {gapSel !== null && selGap !== null ? (
          <div className="flex flex-wrap items-end gap-2" data-testid="pause-editor">
            <span className="self-center text-text-primary">
              {t("app-audio-pause-timing-panel.pause-timing-panel.span.f5c1fd1a04bd", { value1: String(word(gapSel)) })}
            </span>
            <MsField
              label={t("app-audio-pause-timing-panel.pause-timing-panel.label.b6fc0e1530f5")}
              value={Math.round(selGap)}
              onCommit={(v) => changeGap(gapSel, v - selGap)}
              testId="pause-ms"
            />
            <span className="self-center text-[11px] text-text-tertiary" data-testid="pause-delta">
              {t("app-audio-pause-timing-panel.pause-timing-panel.span.14e533343fa5", { value1: String((selected?.deltaMs ?? 0) >= 0 ? "+" : ""), value2: String(selected?.deltaMs ?? 0) })}
            </span>
            <label className="flex flex-col gap-0.5">
              {t("app-audio-pause-timing-panel.pause-timing-panel.label.b39369226c6b")}
              <select
                value={fillKey(selected?.fill ?? { kind: "room" })}
                onChange={(e) =>
                  setMsgs(onEdit(setPauseFill(comp, gapSel, fillFromKey(e.target.value), segId)))
                }
                className="h-7 rounded-sm border border-border-control bg-surface-3 px-1 text-xs text-text-primary"
                data-testid="pause-fill"
              >
                <option value="room">{t("app-audio-pause-timing-panel.pause-timing-panel.option.438d4aebe5b4")}</option>
                <option value="silence">{t("app-audio-pause-timing-panel.pause-timing-panel.option.7c2cc003b8e2")}</option>
                {roomFiles.map((f) => (
                  <option key={f.versionId} value={`asset:${f.versionId}`}>
                    {t("app-audio-pause-timing-panel.pause-timing-panel.option.58b073cc8d3e", { label: String(f.label) })}
                  </option>
                ))}
                <option value="manual">
                  {t("app-audio-pause-timing-panel.pause-timing-panel.option.abb7ff6cb187")}
                </option>
              </select>
            </label>
          </div>
        ) : (
          <span className="self-center text-[11px] text-text-tertiary">
            {t("app-audio-pause-timing-panel.pause-timing-panel.span.eb37fe41f318")}
          </span>
        )}
        {selWords ? (
          <div className="flex flex-wrap items-end gap-1" data-testid="pause-spread">
            <MsField
              label={t("app-audio-pause-timing-panel.pause-timing-panel.label.fdd0b935d3e0")}
              value={Number(spreadMs) || 0}
              onCommit={(v) => setSpreadMs(String(Math.round(v)))}
              testId="pause-spread-ms"
            />
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                commit(
                  spreadPause(comp, al, src, selWords.a, selWords.b, Number(spreadMs) || 0, segId),
                  cannot,
                )
              }
              data-testid="pause-spread-apply"
            >
              {t("app-audio-pause-timing-panel.pause-timing-panel.button.2fc049d61ba4")}
            </Button>
          </div>
        ) : null}
      </div>
      {msgs.length ? (
        <p className="mt-1 text-xs text-accent-warm" role="status" data-testid="pause-msg">
          {msgs.join(" ")}
        </p>
      ) : null}
    </div>
  );
}

function MsField({
  label,
  value,
  onCommit,
  testId,
}: {
  label: string;
  value: number;
  onCommit: (v: number) => void;
  testId?: string;
}) {
  const [text, setText] = useState(String(value));
  const [last, setLast] = useState(value);
  if (last !== value) {
    setLast(value);
    setText(String(value));
  }
  const commit = () => {
    const v = Number(text.replace(",", "."));
    if (Number.isFinite(v)) onCommit(v);
    else setText(String(value));
  };
  return (
    <label className="flex flex-col gap-0.5">
      {label}
      <input
        value={text}
        inputMode="numeric"
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && commit()}
        className="h-7 w-24 rounded-sm border border-border-control bg-surface-3 px-1.5 text-xs text-text-primary"
        data-testid={testId}
      />
    </label>
  );
}
