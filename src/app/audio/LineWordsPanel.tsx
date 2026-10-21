/**
 * Replikken som aktiv del av lydredigeringen (fase 2, bolk D, DEC-0095, REQ-0698–0704): ordene vises som
 * knapper. Klikk markerer lyden for ordet, Shift-klikk utvider til flere ord; markeringen blir området i
 * lydeditoren (avspilling med eller uten kontekst, erstatning, opptak). Ord uten sikker kobling vises tydelig,
 * og nye ord som ikke har lyd, får et forslag til plassering. Ord-til-lyd kan lages med en tjeneste (betalt,
 * med kostnadsgodkjenning; valget huskes) eller for hånd.
 *
 * Bolk E (DEC-0096): bryteren «Tidsredigering» bytter til en egen modus der pausene mellom ordene kan endres
 * (`PauseTimingPanel`). Vanlig markering av ord endrer aldri timingen (§33).
 */
import { Clock, Loader2, Wand2 } from "lucide-react";
import { useMemo, useState } from "react";
import { compositionToSource, estimateCostUsd, formatUsd, manualAlignment, rangeForWords, setWordTiming, sourceToComposition, suggestPlacement, textChanges, alignmentFromProvider, wordUncertain, wordSpansInComposition, type AlignmentSource, type AudioComposition, type ProjectState, type WordAlignment } from "@/core";
import type { Commands } from "@/app/project/use-commands";
import { useUiPref } from "@/app/account/ui-prefs";
import { alignAudio } from "@/adapters/ai/alignment.functions";
import { Button } from "@/components/ui/button";
import { PauseTimingPanel } from "./PauseTimingPanel";
import { t } from "@/core/i18n/keyed";

export type AlignmentService = "elevenlabs" | "manual";
const isService = (v: unknown): v is AlignmentService => v === "elevenlabs" || v === "manual";

export function LineWordsPanel({
  projectId,
  state,
  cmds,
  blockId,
  baseVersionId,
  initial,
  comp,
  range,
  onRange,
  onPlay,
  onSuggest,
  onWords,
  contextMs,
  onContextMs,
  onTimingEdit,
  roomFiles,
}: {
  projectId: string;
  state: ProjectState;
  cmds: Commands;
  blockId: string;
  /** Opptaket (eller komposisjonen) editoren startet fra – koblingen lagres på det. */
  baseVersionId: string;
  /** Komposisjonen editoren startet med (tider i koblingen gjelder den). */
  initial: AudioComposition;
  /** Komposisjonen nå (tider vises i den). */
  comp: AudioComposition;
  range: { from: number; to: number } | null;
  onRange: (r: { from: number; to: number } | null) => void;
  onPlay: (fromMs: number, toMs: number) => void;
  /** Forslag til plassering av et nytt opptak for nye ord (REQ-0704). */
  onSuggest: (
    s: { mode: "after" | "before" } | { mode: "range"; startMs: number; endMs: number },
  ) => void;
  /** De markerte ordene (plass i teksten), for å fremheve dem over opptaksknappene. */
  onWords: (w: { start: number; end: number } | null) => void;
  /** Lyd før og etter ved avspilling med kontekst (ms), også ved automatisk avspilling. */
  contextMs: number;
  onContextMs: (ms: number) => void;
  /** En fullført pauseendring (bolk E): editoren fyller romlyd og legger den i angre-listen. */
  onTimingEdit: (next: AudioComposition, al: WordAlignment, src: AlignmentSource) => string[];
  /** Romlydfilene i prosjektet (valget «Romlydfil» for en pause). */
  roomFiles: readonly { versionId: string; label: string }[];
}) {
  const block = state.blocks[blockId];
  const base = state.assetVersions[baseVersionId];
  const al: WordAlignment | null =
    base?.alignment && base.alignment.blockId === blockId ? base.alignment : null;
  const text = block?.text ?? "";
  const changes = useMemo(() => textChanges(al?.text ?? text, text), [al?.text, text]);
  const [service, setService] = useUiPref<AlignmentService>(
    "audio.alignmentService",
    "elevenlabs",
    isService,
  );
  const [sel, setSel] = useState<{ from: number; to: number } | null>(null);
  const [timing, setTiming] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const cost =
    base?.durationMs != null
      ? estimateCostUsd("elevenlabs", "forced-alignment", { seconds: base.durationMs / 1000 })
      : null;

  /** Tid i koblingen (det opptaket den gjelder) → tid i komposisjonen nå. */
  const toComp = (ms: number): number | null => {
    if (base?.composition) {
      const src = compositionToSource(initial, ms);
      return src ? sourceToComposition(comp, src.versionId, src.ms) : null;
    }
    return sourceToComposition(comp, baseVersionId, ms);
  };
  /** Tid i komposisjonen nå → tid i opptaket koblingen gjelder (for retting for hånd). */
  const fromComp = (ms: number): number | null => {
    const src = compositionToSource(comp, ms);
    if (!src) return null;
    if (base?.composition) {
      // Bare når delen kommer fra komposisjonen editoren startet med
      const back = sourceToComposition(initial, src.versionId, src.ms);
      return back;
    }
    return src.versionId === baseVersionId ? src.ms : null;
  };

  /** Ordene i den nye teksten som har lyd: tidsrommet i komposisjonen. */
  function compRange(from: number, to: number): { from: number; to: number } | null {
    if (!al) return null;
    let s = Number.POSITIVE_INFINITY;
    let e = Number.NEGATIVE_INFINITY;
    for (let k = Math.min(from, to); k <= Math.max(from, to); k++) {
      const o = changes[k]?.oldIndex;
      if (o === null || o === undefined) continue;
      const r = rangeForWords(al, o, o);
      if (!r) continue;
      const span = wordSpansInComposition(comp, al, base?.composition
        ? { kind: "composition", composition: initial } : { kind: "version", versionId: baseVersionId })[o];
      if (!span) continue;
      s = Math.min(s, span.startMs);
      e = Math.max(e, span.endMs);
    }
    return Number.isFinite(s) ? { from: Math.round(s), to: Math.round(e) } : null;
  }

  function pick(k: number, extend: boolean) {
    const next =
      extend && sel ? { from: Math.min(sel.from, k), to: Math.max(sel.to, k) } : { from: k, to: k };
    setSel(next);
    const t0 = changes[next.from]?.token;
    const t1 = changes[next.to]?.token;
    onWords(t0 && t1 ? { start: t0.start, end: t1.end } : null);
    const r = compRange(next.from, next.to);
    if (r) onRange(r);
  }

  const save = async (next: WordAlignment) => {
    const r = await cmds.runAndWait(
      { type: "SetVersionAlignment", versionId: baseVersionId as never, alignment: next },
      t("app-audio-line-words-panel.r.cmds-run-and-wait.cc1893d546cd"),
    );
    if (r.error) throw new Error(r.error);
  };

  async function analyse() {
    if (!base) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await alignAudio({
        data: {
          projectId,
          versionId: baseVersionId,
          blockId,
          provider: "elevenlabs",
          approved: true,
        },
      });
      if (!r.ok) throw new Error(r.message);
      const next = alignmentFromProvider(
        blockId,
        r.text,
        r.words,
        "elevenlabs",
        r.model,
        r.loss,
        new Date().toISOString(),
        // REQ-0037: uendrede ord beholder ID-en, så pauser følger ordet etter ny analyse
        al,
      );
      await save(next);
      const missing = next.words.filter(wordUncertain).length;
      setMsg(
        missing
          ? t("app-audio-line-words-panel.analyse.set-msg.a7054b796e4e", { missing: String(missing) })
          : t("app-audio-line-words-panel.analyse.set-msg.deb6a42aa826"),
      );
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  }

  /** Retting for hånd: det markerte området i lydeditoren blir tiden for det markerte ordet. */
  async function linkByHand() {
    if (!sel || sel.from !== sel.to || !range) return;
    const o = changes[sel.from]?.oldIndex;
    const a = fromComp(range.from);
    const b = fromComp(range.to);
    if (a === null || b === null) {
      setMsg(
        t("app-audio-line-words-panel.link-by-hand.set-msg.e1cc435540a9"),
      );
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      // Uten kobling (eller endret tekst): start med en manuell kobling for teksten slik den er nå
      let cur =
        al && o !== null && o !== undefined
          ? al
          : manualAlignment(blockId, text, new Date().toISOString(), al);
      const idx = cur === al ? (o as number) : sel.from;
      cur = setWordTiming(cur, idx, a, b);
      await save(cur);
      setMsg(t("app-audio-line-words-panel.link-by-hand.set-msg.2addd8ec03ae"));
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const selNew = sel ? changes.slice(sel.from, sel.to + 1).some((c) => c.change === "new") : false;
  const suggestion = al && sel && selNew ? suggestPlacement(al, text, sel) : null;

  if (!block) return null;
  return (
    <div className="mt-3 rounded-sm border border-border bg-surface-2 p-2" data-testid="line-words">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-semibold text-text-primary">
          {t("app-audio-line-words-panel.line-words-panel.span.bd5bcfad3afd")}
        </span>
        <label className="flex items-center gap-1 text-xs text-text-secondary">
          {t("app-audio-line-words-panel.line-words-panel.label.384a8c42fefd")}
          <select
            value={service}
            onChange={(e) => {
              setService(e.target.value as AlignmentService);
              setConfirm(false);
            }}
            className="h-7 rounded-sm border border-border-control bg-surface-3 px-1 text-xs text-text-primary"
            data-testid="line-words-service"
          >
            <option value="elevenlabs">ElevenLabs Forced Alignment</option>
            <option value="manual">{t("app-audio-line-words-panel.line-words-panel.option.59ed2cb46994")}</option>
          </select>
        </label>
        {service === "elevenlabs" ? (
          confirm ? (
            <>
              <span className="text-xs text-text-secondary" data-testid="line-words-cost">
                {t("app-audio-line-words-panel.estimated-cost", { cost: cost === null ? t("app-audio-line-words-panel.estimated-cost-unknown") : formatUsd(cost) })}
              </span>
              <Button
                size="sm"
                onClick={() => void analyse()}
                disabled={busy}
                data-testid="line-words-approve"
              >
                {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
                {t("app-audio-line-words-panel.line-words-panel.button.1883a7247e4f")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirm(false)} disabled={busy}>
                {t("app-audio-line-words-panel.line-words-panel.button.146090191852")}
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setConfirm(true)}
              data-testid="line-words-analyse"
            >
              <Wand2 className="size-3.5" aria-hidden />
              {al
                ? t("app-audio-line-words-panel.line-words-panel.button.0dc98fca1fd6")
                : t("app-audio-line-words-panel.line-words-panel.button.aa061aad4a30")}
            </Button>
          )
        ) : null}
        {al ? (
          <span className="text-[11px] text-text-tertiary">
            {al.provider === "manual" ? t("app-audio-line-words-panel.line-words-panel.span.ebecdd6d55b9") : al.model}
          </span>
        ) : null}
        <Button
          size="sm"
          variant={timing ? "default" : "secondary"}
          className="ml-auto"
          onClick={() => setTiming(!timing)}
          disabled={!al}
          aria-pressed={timing}
          title={
            al
              ? t("app-audio-line-words-panel.line-words-panel.title.8be51b45758c")
              : t("app-audio-line-words-panel.line-words-panel.title.42dbab6c1e50")
          }
          data-testid="line-words-timing"
        >
          <Clock className="size-3.5" aria-hidden />
          {t("app-audio-line-words-panel.line-words-panel.button.c488182470c8")}
        </Button>
      </div>

      {timing && al ? (
        <PauseTimingPanel
          al={al}
          src={
            base?.composition
              ? { kind: "composition", composition: initial }
              : { kind: "version", versionId: baseVersionId }
          }
          comp={comp}
          changes={changes}
          sel={sel}
          onPick={pick}
          onEdit={(next) =>
            onTimingEdit(
              next,
              al,
              base?.composition
                ? { kind: "composition", composition: initial }
                : { kind: "version", versionId: baseVersionId },
            )
          }
          roomFiles={roomFiles}
        />
      ) : (
        <>
          <p
            className="mt-2 flex flex-wrap gap-1 font-mono text-[13px] leading-7"
            data-testid="line-words-text"
          >
            {changes.map((c, k) => {
              const w = c.oldIndex !== null && al ? al.words[c.oldIndex] : undefined;
              const chosen = sel && k >= sel.from && k <= sel.to;
              const state2 =
                c.change === "new"
                  ? "new"
                  : !al
                    ? "none"
                    : w && !wordUncertain(w)
                      ? "ok"
                      : "uncertain";
              return (
                <button
                  key={k}
                  type="button"
                  onClick={(e) => pick(k, e.shiftKey)}
                  className={
                    "rounded-sm px-1 " +
                    (chosen
                      ? "bg-accent-warm/30 text-text-primary ring-1 ring-accent-warm "
                      : "hover:bg-surface-3 ") +
                    (state2 === "new"
                      ? "border border-dashed border-accent-warm text-accent-warm"
                      : state2 === "uncertain"
                        ? "text-text-secondary underline decoration-dotted decoration-status-uncertain underline-offset-4"
                        : "text-text-primary")
                  }
                  data-state={state2}
                  title={
                    state2 === "new"
                      ? t("app-audio-line-words-panel.line-words-panel.title.4784a26fd1c6")
                      : state2 === "uncertain"
                        ? t("app-audio-line-words-panel.line-words-panel.title.4ca2c6540f2f")
                        : state2 === "none"
                          ? t("app-audio-line-words-panel.line-words-panel.title.8fac353a81f2")
                          : undefined
                  }
                  data-testid="line-word"
                >
                  {c.token.text}
                  {state2 === "new" ? (
                    <span className="sr-only">{t("app-audio-line-words-panel.line-words-panel.span.4a036462612c")}</span>
                  ) : null}
                  {state2 === "uncertain" ? (
                    <sup aria-hidden className="ml-0.5 text-status-uncertain">
                      ≈
                    </sup>
                  ) : null}
                </button>
              );
            })}
          </p>
          <p className="text-[11px] text-text-tertiary">
            {t("app-audio-line-words-panel.line-words-panel.p.1f9452ab100c")}
          </p>
        </>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1 text-xs text-text-secondary">
          {t("app-audio-line-words-panel.line-words-panel.label.784e8c15406d")}
          <input
            type="range"
            min={0}
            max={2000}
            step={100}
            value={contextMs}
            onChange={(e) => onContextMs(Number(e.target.value))}
            aria-label={t("app-audio-line-words-panel.line-words-panel.aria-label.9c236bc4cb10")}
          />
          <span className="w-12 tabular-nums">{(contextMs / 1000).toFixed(1)} s</span>
        </label>
        <Button
          size="sm"
          variant="secondary"
          disabled={!range}
          onClick={() => range && onPlay(Math.max(0, range.from - contextMs), range.to + contextMs)}
          data-testid="line-words-play-context"
        >
          {t("app-audio-line-words-panel.line-words-panel.button.81c4f015b6e5")}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={!range}
          onClick={() => range && onPlay(range.from, range.to)}
        >
          {t("app-audio-line-words-panel.line-words-panel.button.a2baf7277d63")}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={!sel || sel.from !== sel.to || !range || busy}
          onClick={() => void linkByHand()}
          title={t("app-audio-line-words-panel.line-words-panel.title.0f4bb3eff7c0")}
          data-testid="line-words-link"
        >
          {t("app-audio-line-words-panel.line-words-panel.button.4f8268474bcb")}
        </Button>
        {suggestion ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              if (suggestion.mode === "range") {
                const a = toComp(suggestion.startMs);
                const b = toComp(suggestion.endMs);
                if (a !== null && b !== null) onSuggest({ mode: "range", startMs: a, endMs: b });
              } else onSuggest(suggestion);
            }}
            data-testid="line-words-suggest"
          >
            {suggestion.mode === "after"
              ? t("app-audio-line-words-panel.line-words-panel.button.6c5795dc8ce1")
              : suggestion.mode === "before"
                ? t("app-audio-line-words-panel.line-words-panel.button.1f85a4a8976e")
                : t("app-audio-line-words-panel.line-words-panel.button.efd54eda25fc")}
          </Button>
        ) : null}
      </div>
      {msg ? (
        <p className="mt-1 text-xs text-text-secondary" role="status" data-testid="line-words-msg">
          {msg}
        </p>
      ) : null}
    </div>
  );
}
