/**
 * Tilbakeføring fra spinoff til hovedfilm (M7 del 4, DEC-0060, mandat kap. 25, REQ-0373–0383, REQ-0500).
 * Brukeren ser hovedfilmens og spinoffens versjon side om side, endring for endring (manus, bilde, kamera,
 * lyd, timing, ferdig film), og velger selv hva som overføres. Ingenting skjer før «Overfør» trykkes, alt
 * kan angres i ett steg, og godkjent materiale i hovedfilmen byttes bare ut etter en egen bekreftelse.
 */
import { AlertTriangle, ArrowRight, Check, Info } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  KEEP_ALL,
  applyCommand,
  comparePromotion,
  choiceSize,
  defaultChoice,
  formatHeading,
  mainProduction,
  newId,
  newMainVariantCommands,
  orderedOccurrences,
  promotionCandidates,
  promotionCommands,
  scriptOnlyChoice,
  transferSceneCommands,
  blocksOfVariant,
  type Command,
  type LineDiff,
  type PromotionChoice,
  type PromotionComparison,
  type ProjectState,
  L,
  locale,
  localized,
} from "@/core";
import type { Commands } from "@/app/project/use-commands";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { t, tLocalized } from "@/core/i18n/keyed";

const legend = "text-[11px] font-medium uppercase tracking-[0.04em] text-text-tertiary";
const control =
  "h-7 max-w-[300px] rounded-sm border border-border-control bg-surface-3 px-1.5 text-xs text-text-primary";
const sec = (frames: number | null, fps: number) =>
  frames === null ? "–" : `${(Math.round((frames / fps) * 10) / 10).toLocaleString(locale())} s`;

const LINE_LABEL: Record<LineDiff["status"], string> = tLocalized({ changed: "app-projects-promotion-dialog.line-label.changed.3a4f47e50aa9", added: "app-projects-promotion-dialog.line-label.added.5e0f1f0f90b7", removed: "app-projects-promotion-dialog.line-label.removed.de2335fbb7d7", conflict: "app-projects-promotion-dialog.line-label.conflict.e5d59030f073", main_newer: "app-projects-promotion-dialog.line-label.main-newer.ba3bde32f60b", same: "app-projects-promotion-dialog.line-label.same.dcc7969186d9" });

/** Prøver kommandoene på en kopi og kjører dem så som én angregruppe. Feilmelding eller null. */
function runPlan(
  state: ProjectState,
  cmds: Commands,
  commands: readonly Command[],
  label: string,
): string | null {
  let probe = state;
  for (const c of commands) {
    const r = applyCommand(probe, {
      id: newId<"command">(),
      actor: "00000000-0000-7000-8000-000000000000" as never,
      at: new Date().toISOString(),
      command: c,
    });
    if (!r.ok) return r.error.message;
    probe = r.state;
  }
  const group = newId();
  for (const c of commands) {
    const e = cmds.run(c, label, group);
    if (e) return e;
  }
  return null;
}

export function PromotionDialog({
  state,
  cmds,
  productionId,
  initialOccurrenceId = null,
  editable,
  open,
  onOpenChange,
}: {
  state: ProjectState;
  cmds: Commands;
  /** Den avledede produksjonen (spinoffen). */
  productionId: string;
  initialOccurrenceId?: string | null;
  editable: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const candidates = useMemo(
    () => (open ? promotionCandidates(state, productionId) : []),
    [open, state, productionId],
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [choice, setChoice] = useState<PromotionChoice>(KEEP_ALL);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [confirmNew, setConfirmNew] = useState(false);
  const [withAudio, setWithAudio] = useState(true);
  const [after, setAfter] = useState<string>("");
  const fps = state.project.fps.num / state.project.fps.den;
  const name = state.productions[productionId]?.name ?? t("app-projects-promotion-dialog.name.message.cc876cf60166");
  const main = mainProduction(state);

  // Valgt scene ved åpning
  useEffect(() => {
    if (!open) return;
    setErr(null);
    setDone(null);
    setSelected(
      initialOccurrenceId && candidates.some((c) => c.occurrenceId === initialOccurrenceId)
        ? initialOccurrenceId
        : (candidates[0]?.occurrenceId ?? null),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialOccurrenceId]);

  const cand = candidates.find((c) => c.occurrenceId === selected) ?? null;
  const cmp = useMemo(
    () => (open && cand?.mainOccurrenceId ? comparePromotion(state, cand.occurrenceId) : null),
    [open, state, cand?.occurrenceId, cand?.mainOccurrenceId],
  );
  // Standardvalg når en ny scene velges
  useEffect(() => {
    setChoice(cmp ? defaultChoice(cmp) : KEEP_ALL);
    setConfirmNew(false);
  }, [cmp]);
  // Plassen for en ny scene: etter forrige scene i spinoffen som finnes i hovedfilmen
  const mainOccs = useMemo(() => (main ? orderedOccurrences(state, main.id) : []), [state, main]);
  useEffect(() => {
    if (!cand || cand.mainOccurrenceId || !main) return;
    const spin = orderedOccurrences(state, productionId);
    const i = spin.findIndex((o) => o.id === cand.occurrenceId);
    let a: string | null = null;
    for (let j = i - 1; j >= 0 && !a; j--)
      a = mainOccs.find((m) => m.sceneId === spin[j]!.sceneId)?.id ?? null;
    setAfter(a ?? (i === 0 ? "" : (mainOccs[mainOccs.length - 1]?.id ?? "")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cand?.occurrenceId]);

  const set = (patch: Partial<PromotionChoice>) => setChoice((c) => ({ ...c, ...patch }));
  const toggle = (list: readonly string[], key: string) =>
    list.includes(key) ? list.filter((x) => x !== key) : [...list, key];
  const n = cmp ? choiceSize(cmp, choice) : 0;

  function finish(message: string) {
    setDone(message);
    setErr(null);
  }

  function transferChosen() {
    if (!cand) return;
    const plan = promotionCommands(state, cand.occurrenceId, choice);
    if (plan.blocked) return setErr(plan.blocked);
    if (!plan.commands.length) return setErr(t("app-projects-promotion-dialog.transfer-chosen.set-err.b92b63a2e8f7"));
    const e = runPlan(
      state,
      cmds,
      plan.commands,
      t("app-projects-promotion-dialog.e.run-plan.85c29795bb98", { name: String(name) }),
    );
    if (e) setErr(e);
    else
      finish(
        t("app-projects-promotion-dialog.changes-carried-over", { count: n }),
      );
  }

  function newVersion() {
    if (!cand) return;
    const plan = newMainVariantCommands(state, cand.occurrenceId);
    if (plan.blocked) return setErr(plan.blocked);
    const e = runPlan(
      state,
      cmds,
      plan.commands,
      t("app-projects-promotion-dialog.e.run-plan.8affef3035ab", { name: String(name) }),
    );
    if (e) setErr(e);
    else
      finish(
        t("app-projects-promotion-dialog.new-version.finish.f19a616606c5"),
      );
  }

  function transferScene() {
    if (!cand) return;
    const plan = transferSceneCommands(state, cand.occurrenceId, {
      withAudio,
      afterMainOccurrenceId: after || null,
    });
    if (plan.blocked) return setErr(plan.blocked);
    const e = runPlan(
      state,
      cmds,
      plan.commands,
      t("app-projects-promotion-dialog.e.run-plan.d2791bd75831", { name: String(name) }),
    );
    if (e) setErr(e);
    else
      finish(
        t("app-projects-promotion-dialog.transfer-scene.finish.56741ccc97f8"),
      );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-[1040px] overflow-y-auto border-border bg-surface-2">
        <DialogHeader>
          <DialogTitle>
            {t("app-projects-promotion-dialog.promotion-dialog.dialog-title.62677a2313dc", { name: String(name) })}
          </DialogTitle>
          <DialogDescription>
            {t("app-projects-promotion-dialog.promotion-dialog.dialog-description.ed5d572466ab")}
          </DialogDescription>
        </DialogHeader>
        {candidates.length === 0 ? (
          <p className="text-[13px] text-text-tertiary">
            {t("app-projects-promotion-dialog.promotion-dialog.p.d1798aee36c7")}
          </p>
        ) : (
          <div className="grid grid-cols-[230px_1fr] gap-4">
            <ul aria-label={t("app-projects-promotion-dialog.promotion-dialog.aria-label.d8820e5131ae")} className="flex flex-col gap-1">
              {candidates.map((c) => (
                <li key={c.occurrenceId}>
                  <button
                    type="button"
                    onClick={() => setSelected(c.occurrenceId)}
                    aria-current={c.occurrenceId === selected}
                    className={
                      "w-full rounded-sm border px-2 py-1.5 text-left text-xs " +
                      (c.occurrenceId === selected
                        ? "border-accent-brand bg-accent-selection/40 text-text-primary"
                        : "border-border bg-surface-1 text-text-secondary hover:bg-surface-3")
                    }
                  >
                    <span className="block truncate">
                      {c.number ? `${c.number}. ` : ""}
                      {c.heading}
                    </span>
                    <span className="text-[11px] text-text-tertiary">
                      {c.mainOccurrenceId
                        ? t("app-projects-promotion-dialog.promotion-dialog.span.16a81f538148")
                        : t("app-projects-promotion-dialog.promotion-dialog.span.b0a6ba67196d")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex min-w-0 flex-col gap-3">
              {done ? (
                <p
                  role="status"
                  className="flex items-center gap-1.5 rounded-sm border border-status-success/40 bg-surface-1 p-2 text-xs text-text-primary"
                >
                  <Check className="size-3.5 text-status-success" aria-hidden />
                  {done}
                </p>
              ) : null}
              {cand && !cand.mainOccurrenceId ? (
                <NewScene
                  state={state}
                  occurrenceId={cand.occurrenceId}
                  mainOccs={mainOccs.map((m) => ({
                    id: m.id,
                    label: `${m.productionNumber ? `${m.productionNumber}. ` : ""}${formatHeading(state.variants[m.variantId]!.heading)}`,
                  }))}
                  after={after}
                  onAfter={setAfter}
                  withAudio={withAudio}
                  onWithAudio={setWithAudio}
                />
              ) : cmp ? (
                <Compare cmp={cmp} choice={choice} set={set} toggle={toggle} fps={fps} />
              ) : null}
              {err ? (
                <p role="alert" className="text-xs text-status-danger">
                  {err}
                </p>
              ) : null}
            </div>
          </div>
        )}
        <DialogFooter className="flex-wrap gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("app-projects-promotion-dialog.promotion-dialog.button.907a0100b618")}
          </Button>
          {editable && cand && !cand.mainOccurrenceId ? (
            <Button onClick={transferScene}>
              <ArrowRight />
              {t("app-projects-promotion-dialog.promotion-dialog.button.2fc6e9330fd2")}
            </Button>
          ) : null}
          {editable && cmp ? (
            <>
              <label className="mr-auto flex items-center gap-1.5 text-xs text-text-secondary">
                <input
                  type="checkbox"
                  checked={confirmNew}
                  onChange={(e) => setConfirmNew(e.target.checked)}
                  className="size-3.5 accent-[var(--accent-brand)]"
                />
                {t("app-projects-promotion-dialog.promotion-dialog.label.fc958f3dfc53")}
              </label>
              {confirmNew ? (
                <Button variant="secondary" onClick={newVersion}>
                  {t("app-projects-promotion-dialog.promotion-dialog.button.7fca6a523481")}
                </Button>
              ) : (
                <>
                  <Button variant="secondary" onClick={() => setChoice(scriptOnlyChoice(cmp))}>
                    {t("app-projects-promotion-dialog.promotion-dialog.button.36fa69ec1375")}
                  </Button>
                  <Button onClick={transferChosen} disabled={n === 0}>
                    <ArrowRight />
                    {t("app-projects-promotion-dialog.promotion-dialog.button.267f7e080ae2")} ({n})
                  </Button>
                </>
              )}
            </>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Section({
  title,
  checked,
  onChange,
  disabled = false,
  children,
}: {
  title: string;
  checked?: boolean;
  onChange?: (on: boolean) => void;
  disabled?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <section aria-label={title} className="flex flex-col gap-1.5 border-t border-border pt-2">
      <h3 className="flex items-center gap-2">
        {onChange ? (
          <input
            type="checkbox"
            aria-label={t("app-projects-promotion-dialog.section.aria-label.db4187bd74a0", { value1: String(title.toLowerCase()) })}
            checked={!!checked}
            disabled={disabled}
            onChange={(e) => onChange(e.target.checked)}
            className="size-3.5 accent-[var(--accent-brand)]"
          />
        ) : null}
        <span className={legend}>{title}</span>
      </h3>
      {children}
    </section>
  );
}

function Compare({
  cmp,
  choice,
  set,
  toggle,
  fps,
}: {
  cmp: PromotionComparison;
  choice: PromotionChoice;
  set: (p: Partial<PromotionChoice>) => void;
  toggle: (list: readonly string[], key: string) => string[];
  fps: number;
}) {
  const lines = cmp.lines.filter((l) => l.status !== "same");
  const layers = cmp.visual.layers.filter((l) => l.status !== "same");
  const audio = cmp.audio.filter((a) => a.status !== "same");
  const nothing =
    !lines.length &&
    !cmp.heading.changed &&
    !layers.length &&
    !cmp.camera.changed &&
    !cmp.visual.background &&
    !audio.length &&
    !cmp.timing.changed &&
    !cmp.film.changed;
  return (
    <div className="flex flex-col gap-2 text-xs">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-sm border border-border bg-surface-1 p-2">
          <span className={legend}>{t("app-projects-promotion-dialog.compare.span.de9c53a9806b")}</span>
          <p className="mt-1 truncate font-script text-text-primary">{cmp.heading.main}</p>
        </div>
        <div className="rounded-sm border border-accent-brand/50 bg-surface-1 p-2">
          <span className={legend}>{t("app-projects-promotion-dialog.compare.span.878139a86430")}</span>
          <p className="mt-1 truncate font-script text-text-primary">{cmp.heading.spin}</p>
        </div>
      </div>
      {nothing ? (
        <p className="text-text-tertiary">
          {t("app-projects-promotion-dialog.compare.p.a5e5fdb270d3")}
        </p>
      ) : null}

      {lines.length || cmp.heading.changed ? (
        <Section title={t("app-projects-promotion-dialog.compare.title.0c592e97f9c2")}>
          {cmp.heading.changed ? (
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={choice.heading}
                onChange={(e) => set({ heading: e.target.checked })}
                className="mt-0.5 size-3.5 accent-[var(--accent-brand)]"
              />
              <span>
                {t("app-projects-promotion-dialog.compare.span.9bae87671b44")}{" "}
                <s className="text-text-tertiary">{cmp.heading.main}</s> → {cmp.heading.spin}
              </span>
            </label>
          ) : null}
          <ul className="flex flex-col gap-1">
            {lines.map((l) => {
              const selectable = l.status !== "main_newer";
              return (
                <li key={l.key}>
                  <label className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      aria-label={t("app-projects-promotion-dialog.compare.aria-label.bcabacb600fb", { value1: String(l.spin?.text ?? l.main?.text ?? "") })}
                      disabled={!selectable}
                      checked={choice.lines.includes(l.key)}
                      onChange={() => set({ lines: toggle(choice.lines, l.key) })}
                      className="mt-0.5 size-3.5 accent-[var(--accent-brand)] disabled:opacity-40"
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className={
                          "mr-1.5 rounded-sm px-1 text-[11px] uppercase " +
                          (l.status === "conflict"
                            ? "bg-status-uncertain-bg text-status-uncertain"
                            : l.status === "main_newer"
                              ? "bg-surface-3 text-text-tertiary"
                              : "bg-accent-selection/50 text-text-primary")
                        }
                      >
                        {LINE_LABEL[l.status]}
                      </span>
                      {l.status === "added" ? (
                        <span className="font-script">{l.spin?.text}</span>
                      ) : l.status === "removed" ? (
                        <s className="font-script text-text-tertiary">{l.main?.text}</s>
                      ) : (
                        <>
                          <s className="font-script text-text-tertiary">{l.main?.text}</s>{" "}
                          <span className="font-script">→ {l.spin?.text}</span>
                        </>
                      )}
                      {l.status === "conflict" ? (
                        <span className="block text-[11px] text-status-uncertain">
                          {t("app-projects-promotion-dialog.compare.span.1a03cc658d45")}
                        </span>
                      ) : null}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </Section>
      ) : null}

      {layers.length || cmp.visual.background ? (
        <Section title={t("app-projects-promotion-dialog.compare.title.b9a1253d8f24")}>
          {!cmp.visual.mainComposition ? (
            <p className="text-text-tertiary">
              {t("app-projects-promotion-dialog.compare.p.a8edd073b27c")}
            </p>
          ) : null}
          <ul className="flex flex-col gap-1">
            {layers.map((d) => (
              <li key={d.key}>
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    aria-label={t("app-projects-promotion-dialog.compare.aria-label.ae3e0749d03e", { value1: String(d.spin?.name ?? d.main?.name ?? "") })}
                    checked={choice.layers.includes(d.key)}
                    onChange={() => set({ layers: toggle(choice.layers, d.key) })}
                    className="mt-0.5 size-3.5 accent-[var(--accent-brand)]"
                  />
                  <span>
                    {d.spin?.name || d.main?.name || t("app-projects-promotion-dialog.compare.span.cdff22eef7af")}{" "}
                    <span className="text-text-tertiary">
                      {d.status === "added"
                        ? t("app-projects-promotion-dialog.compare.span.dda1bf8bb55f")
                        : d.status === "removed"
                          ? t("app-projects-promotion-dialog.compare.span.4272f77508d9")
                          : t("app-projects-promotion-dialog.compare.span.fbda5e3f8bda", { value1: String(d.what.join(", ")) })}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {cmp.visual.background ? (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={choice.background}
                onChange={(e) => set({ background: e.target.checked })}
                className="size-3.5 accent-[var(--accent-brand)]"
              />
              {t("app-projects-promotion-dialog.compare.label.2c38c01459ec")}
            </label>
          ) : null}
        </Section>
      ) : null}

      {cmp.camera.changed ? (
        <Section
          title={t("app-projects-promotion-dialog.compare.title.447b692dff0e")}
          checked={choice.camera}
          onChange={(on) => set({ camera: on })}
        >
          <p className="text-text-secondary">
            {t("app-projects-promotion-dialog.compare.p.c6cd03766050", { main: String(cmp.camera.main), spin: String(cmp.camera.spin) })}
          </p>
        </Section>
      ) : null}

      {audio.length ? (
        <Section
          title={t("app-projects-promotion-dialog.compare.title.9b137853ddf2")}
          checked={choice.audio}
          onChange={(on) => set({ audio: on })}
        >
          <ul className="flex flex-col gap-0.5 text-text-secondary">
            {audio.map((a, i) => (
              <li key={i}>
                {a.status === "added"
                  ? t("app-projects-promotion-dialog.compare.li.d0c2e319b569")
                  : a.status === "removed"
                    ? t("app-projects-promotion-dialog.compare.li.70ba04bf85c1")
                    : t("app-projects-promotion-dialog.compare.li.5ea72ee445e1")}
                {(a.spin ?? a.main)!.name || t("app-projects-promotion-dialog.compare.li.ea78e0b6c171")}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {cmp.timing.changed ? (
        <Section title="Timing" checked={choice.timing} onChange={(on) => set({ timing: on })}>
          <p className="text-text-secondary">
            {t("app-projects-promotion-dialog.compare.p.8b2163a2bbfe")} {sec(cmp.timing.mainFrames, fps)}{" "}
            → {sec(cmp.timing.spinFrames, fps)}
            {cmp.timing.links
              ? t("app-projects-promotion-dialog.compare.p.c3926eed6570", { links: String(cmp.timing.links) })
              : ""}
          </p>
        </Section>
      ) : null}

      {cmp.film.changed ? (
        <Section
          title={t("app-projects-promotion-dialog.compare.title.d6d40f18ab16")}
          checked={choice.film}
          onChange={(on) => set({ film: on, confirmApproved: on ? choice.confirmApproved : false })}
        >
          <p className="text-text-secondary">
            {t("app-projects-promotion-dialog.compare.p.7a881726f052")} {cmp.film.mainTake?.media?.fileName ?? "animatic"} ·{" "}
            {t("app-projects-promotion-dialog.compare.p.ff98ba6917f2")} {cmp.film.spinTake?.media?.fileName ?? "animatic"}{" "}
            {t("app-projects-promotion-dialog.compare.p.d6492cdcb352")}
          </p>
          {cmp.film.mainApproved ? (
            <div className="flex flex-col gap-1 rounded-sm border border-status-moved/50 bg-status-uncertain-bg p-2">
              <span className="flex items-center gap-1.5 text-text-primary">
                <AlertTriangle className="size-3.5 text-status-moved" aria-hidden />
                {t("app-projects-promotion-dialog.compare.span.c07b553b10e9")}
              </span>
              <label className="flex items-center gap-2 text-text-primary">
                <input
                  type="checkbox"
                  checked={choice.confirmApproved}
                  disabled={!choice.film}
                  onChange={(e) => set({ confirmApproved: e.target.checked })}
                  className="size-3.5 accent-[var(--accent-brand)]"
                />
                {t("app-projects-promotion-dialog.compare.label.865403af773a")}
              </label>
            </div>
          ) : null}
        </Section>
      ) : null}
      <p className="flex items-start gap-1.5 text-[11px] text-text-tertiary">
        <Info className="mt-px size-3 shrink-0" aria-hidden />
        {t("app-projects-promotion-dialog.compare.p.e098ea2eba1c")}
      </p>
    </div>
  );
}

function NewScene({
  state,
  occurrenceId,
  mainOccs,
  after,
  onAfter,
  withAudio,
  onWithAudio,
}: {
  state: ProjectState;
  occurrenceId: string;
  mainOccs: readonly { id: string; label: string }[];
  after: string;
  onAfter: (id: string) => void;
  withAudio: boolean;
  onWithAudio: (on: boolean) => void;
}) {
  const o = state.occurrences[occurrenceId]!;
  const blocks = blocksOfVariant(state, o.variantId).filter((b) => b.kind !== "heading");
  return (
    <div className="flex flex-col gap-2 text-xs">
      <p className="text-text-secondary">
        {t("app-projects-promotion-dialog.new-scene.p.69a6173e278b")}
      </p>
      <div className="max-h-[240px] overflow-y-auto rounded-sm border border-border bg-surface-1 p-2 font-script">
        {blocks.slice(0, 30).map((b) => (
          <p key={b.id} className={b.kind === "character" ? "mt-1 text-center" : "mt-1"}>
            {b.text}
          </p>
        ))}
      </div>
      <label className="flex items-center gap-2 text-text-secondary">
        {t("app-projects-promotion-dialog.new-scene.label.7abbeeba7e06")}
        <select
          aria-label={t("app-projects-promotion-dialog.new-scene.aria-label.7abbeeba7e06")}
          value={after}
          onChange={(e) => onAfter(e.target.value)}
          className={control}
        >
          <option value="">{t("app-projects-promotion-dialog.new-scene.option.faff99bf2566")}</option>
          {mainOccs.map((m) => (
            <option key={m.id} value={m.id}>
              {t("app-projects-promotion-dialog.new-scene.option.c962a0f3c610", { label: String(m.label) })}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2 text-text-secondary">
        <input
          type="checkbox"
          checked={withAudio}
          onChange={(e) => onWithAudio(e.target.checked)}
          className="size-3.5 accent-[var(--accent-brand)]"
        />
        {t("app-projects-promotion-dialog.new-scene.label.06b01496b3be")}
      </label>
    </div>
  );
}
