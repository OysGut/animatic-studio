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

const legend = "text-[11px] font-medium uppercase tracking-[0.04em] text-text-tertiary";
const control =
  "h-7 max-w-[300px] rounded-sm border border-border-control bg-surface-3 px-1.5 text-xs text-text-primary";
const sec = (frames: number | null, fps: number) =>
  frames === null ? "–" : `${(Math.round((frames / fps) * 10) / 10).toLocaleString("nb-NO")} s`;

const LINE_LABEL: Record<LineDiff["status"], string> = {
  changed: "Endret",
  added: "Ny linje",
  removed: "Fjernet",
  conflict: "Endret i begge",
  main_newer: "Nyere i hovedfilmen",
  same: "",
};

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
  const name = state.productions[productionId]?.name ?? "spinoffen";
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
    if (!plan.commands.length) return setErr("Ingenting er valgt.");
    const e = runPlan(state, cmds, plan.commands, `Tilbakefør fra ${name}`);
    if (e) setErr(e);
    else finish(`${n} ${n === 1 ? "endring er" : "endringer er"} ført over til hovedfilmen.`);
  }

  function newVersion() {
    if (!cand) return;
    const plan = newMainVariantCommands(state, cand.occurrenceId);
    if (plan.blocked) return setErr(plan.blocked);
    const e = runPlan(state, cmds, plan.commands, `Ny hovedfilmversjon fra ${name}`);
    if (e) setErr(e);
    else
      finish(
        "Hovedfilmen bruker nå en egen kopi av spinoffens versjon. Den gamle versjonen er tatt vare på.",
      );
  }

  function transferScene() {
    if (!cand) return;
    const plan = transferSceneCommands(state, cand.occurrenceId, {
      withAudio,
      afterMainOccurrenceId: after || null,
    });
    if (plan.blocked) return setErr(plan.blocked);
    const e = runPlan(state, cmds, plan.commands, `Overfør scene fra ${name}`);
    if (e) setErr(e);
    else finish("Scenen er lagt inn i hovedfilmen med egen kopi. Spinoffens versjon er uendret.");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-[1040px] overflow-y-auto border-border bg-surface-2">
        <DialogHeader>
          <DialogTitle>Tilbakefør fra «{name}» til hovedfilmen</DialogTitle>
          <DialogDescription>
            Scenene spinoffen har endret eller skrevet selv. Velg hva som skal føres over –
            ingenting skjer før du trykker «Overfør», og alt kan angres. Gamle versjoner tas vare
            på.
          </DialogDescription>
        </DialogHeader>
        {candidates.length === 0 ? (
          <p className="text-[13px] text-text-tertiary">
            Spinoffen har ingen egne versjoner eller nye scener ennå. Når du endrer en gjenbrukt
            scene i spinoffen, får den sin egen versjon som kan føres tilbake her.
          </p>
        ) : (
          <div className="grid grid-cols-[230px_1fr] gap-4">
            <ul aria-label="Scener" className="flex flex-col gap-1">
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
                        ? "Egen versjon i spinoffen"
                        : "Ny scene – bare i spinoffen"}
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
            Behold alt uendret
          </Button>
          {editable && cand && !cand.mainOccurrenceId ? (
            <Button onClick={transferScene}>
              <ArrowRight />
              Overfør scenen til hovedfilmen
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
                Hele spinoff-versjonen som ny versjon i hovedfilmen
              </label>
              {confirmNew ? (
                <Button variant="secondary" onClick={newVersion}>
                  Lag ny hovedfilmversjon
                </Button>
              ) : (
                <>
                  <Button variant="secondary" onClick={() => setChoice(scriptOnlyChoice(cmp))}>
                    Bare manus
                  </Button>
                  <Button onClick={transferChosen} disabled={n === 0}>
                    <ArrowRight />
                    Overfør valgte ({n})
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
            aria-label={`Overfør ${title.toLowerCase()}`}
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
          <span className={legend}>Hovedfilmen (original)</span>
          <p className="mt-1 truncate font-script text-text-primary">{cmp.heading.main}</p>
        </div>
        <div className="rounded-sm border border-accent-brand/50 bg-surface-1 p-2">
          <span className={legend}>Spinoff-versjonen</span>
          <p className="mt-1 truncate font-script text-text-primary">{cmp.heading.spin}</p>
        </div>
      </div>
      {nothing ? (
        <p className="text-text-tertiary">
          Ingen forskjeller igjen – spinoffens versjon er lik hovedfilmens.
        </p>
      ) : null}

      {lines.length || cmp.heading.changed ? (
        <Section title="Manus">
          {cmp.heading.changed ? (
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={choice.heading}
                onChange={(e) => set({ heading: e.target.checked })}
                className="mt-0.5 size-3.5 accent-[var(--accent-brand)]"
              />
              <span>
                Scenehode: <s className="text-text-tertiary">{cmp.heading.main}</s> →{" "}
                {cmp.heading.spin}
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
                      aria-label={`Overfør linjen ${l.spin?.text ?? l.main?.text ?? ""}`}
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
                          Linjen er også endret i hovedfilmen. Hovedfilmens tekst erstattes hvis du
                          krysser av.
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
        <Section title="Bilde (2D-scenen)">
          {!cmp.visual.mainComposition ? (
            <p className="text-text-tertiary">
              Hovedfilmen har ingen 2D-scene her. Velger du et lag, kopieres hele 2D-scenen.
            </p>
          ) : null}
          <ul className="flex flex-col gap-1">
            {layers.map((d) => (
              <li key={d.key}>
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    aria-label={`Overfør laget ${d.spin?.name ?? d.main?.name ?? ""}`}
                    checked={choice.layers.includes(d.key)}
                    onChange={() => set({ layers: toggle(choice.layers, d.key) })}
                    className="mt-0.5 size-3.5 accent-[var(--accent-brand)]"
                  />
                  <span>
                    {d.spin?.name || d.main?.name || "Lag"}{" "}
                    <span className="text-text-tertiary">
                      {d.status === "added"
                        ? "– nytt lag"
                        : d.status === "removed"
                          ? "– fjernet i spinoffen"
                          : `– endret: ${d.what.join(", ")}`}
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
              Bakgrunnsfarge
            </label>
          ) : null}
        </Section>
      ) : null}

      {cmp.camera.changed ? (
        <Section title="Kamera" checked={choice.camera} onChange={(on) => set({ camera: on })}>
          <p className="text-text-secondary">
            {cmp.camera.main} kamerautsnitt i hovedfilmen, {cmp.camera.spin} i spinoffen (med
            endringer).
          </p>
        </Section>
      ) : null}

      {audio.length ? (
        <Section title="Lyd" checked={choice.audio} onChange={(on) => set({ audio: on })}>
          <ul className="flex flex-col gap-0.5 text-text-secondary">
            {audio.map((a, i) => (
              <li key={i}>
                {a.status === "added" ? "Ny: " : a.status === "removed" ? "Fjernet: " : "Endret: "}
                {(a.spin ?? a.main)!.name || "lyd"}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {cmp.timing.changed ? (
        <Section title="Timing" checked={choice.timing} onChange={(on) => set({ timing: on })}>
          <p className="text-text-secondary">
            Lengde på 2D-scenen: {sec(cmp.timing.mainFrames, fps)} →{" "}
            {sec(cmp.timing.spinFrames, fps)}
            {cmp.timing.links ? ` · ${cmp.timing.links} tidskoblinger er ulike` : ""}
          </p>
        </Section>
      ) : null}

      {cmp.film.changed ? (
        <Section
          title="Ferdig film og klipping"
          checked={choice.film}
          onChange={(on) => set({ film: on, confirmApproved: on ? choice.confirmApproved : false })}
        >
          <p className="text-text-secondary">
            Hovedfilmen: {cmp.film.mainTake?.media?.fileName ?? "animatic"} · Spinoffen:{" "}
            {cmp.film.spinTake?.media?.fileName ?? "animatic"} (med spinoffens klipping)
          </p>
          {cmp.film.mainApproved ? (
            <div className="flex flex-col gap-1 rounded-sm border border-status-moved/50 bg-status-uncertain-bg p-2">
              <span className="flex items-center gap-1.5 text-text-primary">
                <AlertTriangle className="size-3.5 text-status-moved" aria-hidden />
                Hovedfilmen bruker en godkjent versjon av scenen.
              </span>
              <label className="flex items-center gap-2 text-text-primary">
                <input
                  type="checkbox"
                  checked={choice.confirmApproved}
                  disabled={!choice.film}
                  onChange={(e) => set({ confirmApproved: e.target.checked })}
                  className="size-3.5 accent-[var(--accent-brand)]"
                />
                Ja, bytt ut den godkjente versjonen (den tas vare på og kan velges igjen)
              </label>
            </div>
          ) : null}
        </Section>
      ) : null}
      <p className="flex items-start gap-1.5 text-[11px] text-text-tertiary">
        <Info className="mt-px size-3 shrink-0" aria-hidden />
        Endringene lagres med historikk i hovedfilmen. Materiale laget fra det gamle manuset flagges
        som avvik, så du kan velge å godkjenne eller oppdatere det.
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
        Scenen finnes bare i spinoffen. Den kan legges inn i hovedfilmen som en egen kopi (manus,
        historikk, oversettelser og 2D-scene). Spinoffens versjon endres ikke.
      </p>
      <div className="max-h-[240px] overflow-y-auto rounded-sm border border-border bg-surface-1 p-2 font-script">
        {blocks.slice(0, 30).map((b) => (
          <p key={b.id} className={b.kind === "character" ? "mt-1 text-center" : "mt-1"}>
            {b.text}
          </p>
        ))}
      </div>
      <label className="flex items-center gap-2 text-text-secondary">
        Plassering i hovedfilmen
        <select
          aria-label="Plassering i hovedfilmen"
          value={after}
          onChange={(e) => onAfter(e.target.value)}
          className={control}
        >
          <option value="">Først i filmen</option>
          {mainOccs.map((m) => (
            <option key={m.id} value={m.id}>
              Etter {m.label}
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
        Ta med lyd og tidskoblinger
      </label>
    </div>
  );
}
