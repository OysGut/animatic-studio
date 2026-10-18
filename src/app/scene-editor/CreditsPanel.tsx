/**
 * Rulletekstpanelet (MTS MT7, §16–26): fanene «Design» (presentasjonsform, hastighet, retning og tid) og
 * «Medvirkende» (deltakerregisteret, virtualisert så 2000 deltakere ikke gjør panelet tregt). Deltakerne er
 * adskilt fra malen; rekkefølge og skjuling endrer aldri malen. Alt skrives med kommandoer (angre/gjør om).
 */
import { useMemo, useRef, useState } from "react";
import {
  CREDIT_PARTICIPANTS_MAX,
  CREDIT_PRESENTATIONS,
  L,
  compareKeys,
  creditSequenceOf,
  keyBetween,
  newId,
  type Command,
  type CreditParticipant,
  type CreditPresentation,
  type CreditSequence,
  type ProjectState,
} from "@/core";
import { PanelHeader } from "@/app/shell/workspace-chrome";
import { Button } from "@/components/ui/button";

const input =
  "h-7 w-full rounded-sm border border-border-control bg-surface-3 px-1.5 text-[12px] text-text-primary";
const select =
  "h-7 rounded-sm border border-border-control bg-surface-3 px-1 text-[12px] text-text-primary";

const PRESENTATION_LABEL: Record<CreditPresentation, { nb: string; en: string }> = {
  roll: { nb: "Rullende", en: "Rolling" },
  one_at_a_time: { nb: "Én om gangen", en: "One at a time" },
  positions: { nb: "Plassert i bildet", en: "Positioned in the frame" }, // i18n-ignore – vises via L() under
};

const ROW_H = 34;
const VIEW_H = 320;

function DesignTab({
  seq,
  editable,
  run,
  occurrenceId,
}: {
  seq: CreditSequence;
  editable: boolean;
  run: (command: Command, label: string) => string | null;
  occurrenceId: string;
}) {
  const set = (patch: Partial<CreditSequence["presentation"] extends never ? never : {
    presentation: CreditPresentation;
    durationFrames: number;
    pauseFrames: number;
    speed: number;
    direction: "up" | "down";
  }>) =>
    run(
      {
        type: "SetCreditSequence",
        sequenceId: seq.id,
        occurrenceId: occurrenceId as never,
        fields: {
          presentation: seq.presentation,
          durationFrames: seq.durationFrames,
          pauseFrames: seq.pauseFrames,
          speed: seq.speed,
          direction: seq.direction,
          ...patch,
        },
      },
      L("Endre rulleteksten", "Change the credits"),
    );
  return (
    <div className="flex flex-col gap-2 p-2" data-testid="mts-credits-design">
      <label className="flex flex-col gap-0.5 text-[11px] text-text-tertiary">
        {L("Presentasjonsform", "Presentation")}
        <select
          className={select}
          data-testid="mts-credits-presentation"
          disabled={!editable}
          value={seq.presentation}
          onChange={(e) => set({ presentation: e.target.value as CreditPresentation })}
        >
          {CREDIT_PRESENTATIONS.map((p) => (
            <option key={p} value={p}>
              {L(PRESENTATION_LABEL[p].nb, PRESENTATION_LABEL[p].en)}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-0.5 text-[11px] text-text-tertiary">
        {L("Hastighet (linjer per sekund)", "Speed (lines per second)")}
        <input
          className={input}
          type="number"
          min={1}
          max={20}
          data-testid="mts-credits-speed"
          disabled={!editable}
          value={seq.speed}
          onChange={(e) => set({ speed: Number(e.target.value) || seq.speed })}
        />
      </label>
      <label className="flex flex-col gap-0.5 text-[11px] text-text-tertiary">
        {L("Varighet per deltaker (bilder)", "Duration per participant (frames)")}
        <input
          className={input}
          type="number"
          min={1}
          data-testid="mts-credits-duration"
          disabled={!editable}
          value={seq.durationFrames}
          onChange={(e) => set({ durationFrames: Number(e.target.value) || seq.durationFrames })}
        />
      </label>
      <label className="flex flex-col gap-0.5 text-[11px] text-text-tertiary">
        {L("Pause mellom deltakerne (bilder)", "Pause between participants (frames)")}
        <input
          className={input}
          type="number"
          min={0}
          data-testid="mts-credits-pause"
          disabled={!editable}
          value={seq.pauseFrames}
          onChange={(e) => set({ pauseFrames: Number(e.target.value) ?? seq.pauseFrames })}
        />
      </label>
      <label className="flex flex-col gap-0.5 text-[11px] text-text-tertiary">
        {L("Retning", "Direction")}
        <select
          className={select}
          data-testid="mts-credits-direction"
          disabled={!editable}
          value={seq.direction}
          onChange={(e) => set({ direction: e.target.value as "up" | "down" })}
        >
          <option value="up">{L("Oppover", "Up")}</option>
          <option value="down">{L("Nedover", "Down")}</option>
        </select>
      </label>
    </div>
  );
}

function ParticipantsTab({
  state,
  editable,
  run,
}: {
  state: ProjectState;
  editable: boolean;
  run: (command: Command, label: string) => string | null;
}) {
  const participants = useMemo(
    () =>
      Object.values(state.creditParticipants)
        .filter((p) => !p.removed)
        .sort((a, b) => compareKeys(a.orderKey, b.orderKey) || (a.id < b.id ? -1 : 1)),
    [state.creditParticipants],
  );
  const [scroll, setScroll] = useState(0);
  const viewRef = useRef<HTMLDivElement>(null);

  const add = () => {
    const last = participants[participants.length - 1];
    run(
      {
        type: "AddCreditParticipant",
        participantId: newId<"credit_participant">(),
        fields: {
          orderKey: keyBetween(last?.orderKey ?? null, null),
          groupKey: "",
          hidden: false,
          fields: { navn: "", rolle: "" },
        },
      },
      L("Ny deltaker", "New participant"),
    );
  };
  const update = (p: CreditParticipant, patch: { navn?: string; rolle?: string; hidden?: boolean }) =>
    run(
      {
        type: "UpdateCreditParticipant",
        participantId: p.id,
        fields: patch.hidden !== undefined
          ? { hidden: patch.hidden }
          : { fields: { ...p.fields, ...(patch.navn !== undefined ? { navn: patch.navn } : {}), ...(patch.rolle !== undefined ? { rolle: patch.rolle } : {}) } },
      },
      L("Endre deltakeren", "Change the participant"),
    );
  const remove = (p: CreditParticipant) =>
    run({ type: "RemoveCreditParticipant", participantId: p.id }, L("Fjern deltakeren", "Remove the participant"));
  // Rekkefølgen endres med nye orderKey-er; malen røres aldri (H)
  const move = (p: CreditParticipant, delta: -1 | 1) => {
    const i = participants.findIndex((x) => x.id === p.id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= participants.length) return;
    const before = participants[j - 1]?.orderKey ?? null;
    const after = participants[j + 1]?.orderKey ?? null;
    run(
      { type: "UpdateCreditParticipant", participantId: p.id, fields: { orderKey: keyBetween(before, after) } },
      L("Flytt deltakeren", "Move the participant"),
    );
  };

  // Virtualisering (§63): bare radene i bildet tegnes
  const start = Math.max(0, Math.floor(scroll / ROW_H) - 4);
  const end = Math.min(participants.length, Math.ceil((scroll + VIEW_H) / ROW_H) + 4);
  const shown = participants.slice(start, end);

  return (
    <div className="flex min-h-0 flex-col gap-1 p-2" data-testid="mts-credits-participants">
      <p className="text-[11px] text-text-tertiary">
        {L(
          `${participants.length} av høyst ${CREDIT_PARTICIPANTS_MAX} deltakere`,
          `${participants.length} of at most ${CREDIT_PARTICIPANTS_MAX} participants`,
        )}
      </p>
      <div
        ref={viewRef}
        className="overflow-y-auto"
        style={{ maxHeight: VIEW_H }}
        onScroll={(e) => setScroll((e.target as HTMLDivElement).scrollTop)}
        data-testid="mts-credits-list"
      >
        <div style={{ height: participants.length * ROW_H, position: "relative" }}>
          {shown.map((p, i) => (
            <div
              key={p.id}
              data-testid="mts-credit-row"
              data-participant-id={p.id}
              className="absolute left-0 right-0 flex items-center gap-1"
              style={{ top: (start + i) * ROW_H, height: ROW_H }}
            >
              <input
                className={input}
                style={{ flex: 1.4 }}
                placeholder={L("Navn", "Name")}
                aria-label={L("Navn", "Name")}
                data-testid="mts-credit-name"
                disabled={!editable}
                defaultValue={p.fields["navn"] ?? ""}
                onBlur={(e) => e.target.value !== (p.fields["navn"] ?? "") && update(p, { navn: e.target.value })}
              />
              <input
                className={input}
                style={{ flex: 1 }}
                placeholder={L("Rolle", "Role")}
                aria-label={L("Rolle", "Role")}
                data-testid="mts-credit-role"
                disabled={!editable}
                defaultValue={p.fields["rolle"] ?? ""}
                onBlur={(e) => e.target.value !== (p.fields["rolle"] ?? "") && update(p, { rolle: e.target.value })}
              />
              <Button
                size="sm"
                variant="ghost"
                data-testid="mts-credit-up"
                aria-label={L("Flytt opp", "Move up")}
                disabled={!editable}
                onClick={() => move(p, -1)}
              >
                ↑
              </Button>
              <Button
                size="sm"
                variant="ghost"
                data-testid="mts-credit-down"
                aria-label={L("Flytt ned", "Move down")}
                disabled={!editable}
                onClick={() => move(p, 1)}
              >
                ↓
              </Button>
              <label className="flex items-center gap-0.5 text-[11px] text-text-tertiary" title={L("Skjulte deltakere tegnes ikke", "Hidden participants are not drawn")}>
                <input
                  type="checkbox"
                  data-testid="mts-credit-hidden"
                  disabled={!editable}
                  checked={p.hidden}
                  onChange={(e) => update(p, { hidden: e.target.checked })}
                />
                {L("Skjul", "Hide")}
              </label>
              {editable ? (
                <Button size="sm" variant="ghost" data-testid="mts-credit-remove" onClick={() => remove(p)}>
                  {L("Fjern", "Remove")}
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      </div>
      {editable ? (
        <Button
          size="sm"
          variant="outline"
          data-testid="mts-credit-add"
          disabled={participants.length >= CREDIT_PARTICIPANTS_MAX}
          onClick={add}
        >
          {L("Ny deltaker", "New participant")}
        </Button>
      ) : null}
    </div>
  );
}

export function CreditsPanel({
  state,
  occurrenceId,
  editable,
  run,
}: {
  state: ProjectState;
  occurrenceId: string;
  editable: boolean;
  run: (command: Command, label: string) => string | null;
}) {
  const [tab, setTab] = useState<"design" | "participants">("participants");
  const seq = creditSequenceOf(state, occurrenceId);
  return (
    <section className="flex min-h-0 flex-col" data-testid="mts-credits-panel">
      <PanelHeader title={L("Rulletekst", "Credits")} />
      <div role="tablist" className="flex gap-1 border-b border-border px-2">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "design"}
          data-testid="mts-credits-tab-design"
          className={`px-2 py-1 text-[12px] ${tab === "design" ? "border-b-2 border-accent-brand text-text-primary" : "text-text-tertiary"}`}
          onClick={() => setTab("design")}
        >
          {L("Design", "Design")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "participants"}
          data-testid="mts-credits-tab-participants"
          className={`px-2 py-1 text-[12px] ${tab === "participants" ? "border-b-2 border-accent-brand text-text-primary" : "text-text-tertiary"}`}
          onClick={() => setTab("participants")}
        >
          {L("Medvirkende", "Participants")}
        </button>
      </div>
      {tab === "design" ? (
        seq ? (
          <DesignTab seq={seq} editable={editable} run={run} occurrenceId={occurrenceId} />
        ) : (
          <p className="p-2 text-xs text-text-tertiary">
            {L("Rulleteksten har ingen sekvens ennå.", "The credits have no sequence yet.")}
          </p>
        )
      ) : (
        <ParticipantsTab state={state} editable={editable} run={run} />
      )}
    </section>
  );
}
