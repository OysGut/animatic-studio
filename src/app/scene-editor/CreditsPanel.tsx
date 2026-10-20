/**
 * Rulletekstpanelet (MTS MT7, §16–26): fanene «Design» (presentasjonsform, hastighet, retning og tid) og
 * «Medvirkende» (deltakerregisteret, virtualisert så 2000 deltakere ikke gjør panelet tregt). Deltakerne er
 * adskilt fra malen; rekkefølge og skjuling endrer aldri malen. Alt skrives med kommandoer (angre/gjør om).
 */
import { useMemo, useRef, useState } from "react";
import { CREDIT_PARTICIPANTS_MAX, CREDIT_PRESENTATIONS, compareKeys, creditSequenceOf, keyBetween, newId, type Command, type CreditParticipant, type CreditPresentation, type CreditSequence, type ProjectState } from "@/core";
import { PanelHeader } from "@/app/shell/workspace-chrome";
import { Button } from "@/components/ui/button";
import { GlobalLibraryDialog } from "@/app/global/GlobalLibraryDialog";
import type { Commands } from "@/app/project/use-commands";
import { t, tLocalized } from "@/core/i18n/keyed";

const input =
  "h-7 w-full rounded-sm border border-border-control bg-surface-3 px-1.5 text-[12px] text-text-primary";
const select =
  "h-7 rounded-sm border border-border-control bg-surface-3 px-1 text-[12px] text-text-primary";

const PRESENTATION_LABEL: Record<CreditPresentation, string> = tLocalized({ roll: "app-scene-editor-credits-panel.presentation-roll", one_at_a_time: "app-scene-editor-credits-panel.presentation-one-at-a-time", positions: "app-scene-editor-credits-panel.presentation-positions" });

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
      t("app-scene-editor-credits-panel.set.run.8a500abc7f91"),
    );
  return (
    <div className="flex flex-col gap-2 p-2" data-testid="mts-credits-design">
      <label className="flex flex-col gap-0.5 text-[11px] text-text-tertiary">
        {t("app-scene-editor-credits-panel.design-tab.label.6d8c5561a420")}
        <select
          className={select}
          data-testid="mts-credits-presentation"
          disabled={!editable}
          value={seq.presentation}
          onChange={(e) => set({ presentation: e.target.value as CreditPresentation })}
        >
          {CREDIT_PRESENTATIONS.map((p) => (
            <option key={p} value={p}>
              {PRESENTATION_LABEL[p]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-0.5 text-[11px] text-text-tertiary">
        {t("app-scene-editor-credits-panel.design-tab.label.4827019f5efb")}
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
        {t("app-scene-editor-credits-panel.design-tab.label.23f186cbeeb8")}
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
        {t("app-scene-editor-credits-panel.design-tab.label.57560f878f68")}
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
        {t("app-scene-editor-credits-panel.design-tab.label.6c64f1b2c085")}
        <select
          className={select}
          data-testid="mts-credits-direction"
          disabled={!editable}
          value={seq.direction}
          onChange={(e) => set({ direction: e.target.value as "up" | "down" })}
        >
          <option value="up">{t("app-scene-editor-credits-panel.design-tab.option.834a47afa340")}</option>
          <option value="down">{t("app-scene-editor-credits-panel.design-tab.option.f65e8f256b8a")}</option>
        </select>
      </label>
    </div>
  );
}

function ParticipantsTab({
  state,
  editable,
  run,
  cmds,
}: {
  state: ProjectState;
  editable: boolean;
  run: (command: Command, label: string) => string | null;
  cmds?: Commands | undefined;
}) {
  const [logoFor, setLogoFor] = useState<string | null>(null);
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
      t("app-scene-editor-credits-panel.add.run.65a3f1d55f47"),
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
      t("app-scene-editor-credits-panel.update.run.84d6f02e42a3"),
    );
  const remove = (p: CreditParticipant) =>
    run({ type: "RemoveCreditParticipant", participantId: p.id }, t("app-scene-editor-credits-panel.remove.run.d2e55c53b751"));
  // Rekkefølgen endres med nye orderKey-er; malen røres aldri (H)
  const move = (p: CreditParticipant, delta: -1 | 1) => {
    const i = participants.findIndex((x) => x.id === p.id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= participants.length) return;
    const before = participants[j - 1]?.orderKey ?? null;
    const after = participants[j + 1]?.orderKey ?? null;
    run(
      { type: "UpdateCreditParticipant", participantId: p.id, fields: { orderKey: keyBetween(before, after) } },
      t("app-scene-editor-credits-panel.move.run.0d70130edd7f"),
    );
  };

  // Virtualisering (§63): bare radene i bildet tegnes
  const start = Math.max(0, Math.floor(scroll / ROW_H) - 4);
  const end = Math.min(participants.length, Math.ceil((scroll + VIEW_H) / ROW_H) + 4);
  const shown = participants.slice(start, end);

  return (
    <div className="flex min-h-0 flex-col gap-1 p-2" data-testid="mts-credits-participants">
      <p className="text-[11px] text-text-tertiary">
        {t("app-scene-editor-credits-panel.participants-tab.p.57fd2ea31c46", { length: String(participants.length), CREDIT_PARTICIPANTS_MAX: String(CREDIT_PARTICIPANTS_MAX) })}
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
                placeholder={t("app-scene-editor-credits-panel.participants-tab.placeholder.a95636c57b87")}
                aria-label={t("app-scene-editor-credits-panel.participants-tab.aria-label.a95636c57b87")}
                data-testid="mts-credit-name"
                disabled={!editable}
                defaultValue={p.fields["navn"] ?? ""}
                onBlur={(e) => e.target.value !== (p.fields["navn"] ?? "") && update(p, { navn: e.target.value })}
              />
              <input
                className={input}
                style={{ flex: 1 }}
                placeholder={t("app-scene-editor-credits-panel.participants-tab.placeholder.371c1cdfc2bf")}
                aria-label={t("app-scene-editor-credits-panel.participants-tab.aria-label.371c1cdfc2bf")}
                data-testid="mts-credit-role"
                disabled={!editable}
                defaultValue={p.fields["rolle"] ?? ""}
                onBlur={(e) => e.target.value !== (p.fields["rolle"] ?? "") && update(p, { rolle: e.target.value })}
              />
              <Button
                size="sm"
                variant="ghost"
                data-testid="mts-credit-up"
                aria-label={t("app-scene-editor-credits-panel.participants-tab.aria-label.8d24bb37a6c2")}
                disabled={!editable}
                onClick={() => move(p, -1)}
              >
                ↑
              </Button>
              <Button
                size="sm"
                variant="ghost"
                data-testid="mts-credit-down"
                aria-label={t("app-scene-editor-credits-panel.participants-tab.aria-label.2d01c53271b2")}
                disabled={!editable}
                onClick={() => move(p, 1)}
              >
                ↓
              </Button>
              <label className="flex items-center gap-0.5 text-[11px] text-text-tertiary" title={t("app-scene-editor-credits-panel.participants-tab.title.fba86a683254")}>
                <input
                  type="checkbox"
                  data-testid="mts-credit-hidden"
                  disabled={!editable}
                  checked={p.hidden}
                  onChange={(e) => update(p, { hidden: e.target.checked })}
                />
                {t("app-scene-editor-credits-panel.participants-tab.label.9c1727a9c327")}
              </label>
              {editable && cmds ? (
                <Button
                  size="sm"
                  variant="ghost"
                  data-testid="mts-credit-logo"
                  title={t("app-scene-editor-credits-panel.participants-tab.title.8e4becbab568")}
                  onClick={() => setLogoFor(p.id)}
                >
                  {p.logoAssetId ? t("app-scene-editor-credits-panel.participants-tab.button.e74409e6814a") : t("app-scene-editor-credits-panel.participants-tab.button.589666392ba2")}
                </Button>
              ) : null}
              {editable ? (
                <Button size="sm" variant="ghost" data-testid="mts-credit-remove" onClick={() => remove(p)}>
                  {t("app-scene-editor-credits-panel.participants-tab.button.ac8d5fd92bed")}
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
          {t("app-scene-editor-credits-panel.participants-tab.button.fdfbed2b8e7d")}
        </Button>
      ) : null}
      {cmds ? (
        <GlobalLibraryDialog
          open={logoFor !== null}
          onOpenChange={(open) => !open && setLogoFor(null)}
          state={state}
          cmds={cmds}
          editable={editable}
          fixedKind="logo"
          onUsed={(assetId) => {
            if (!logoFor) return;
            const fresh = cmds.current() ?? state;
            const variant = Object.values(fresh.assetVariants).find((v) => v.assetId === assetId && !v.archived);
            const version = variant
              ? Object.values(fresh.assetVersions).filter((v) => v.variantId === variant.id && !v.removed).sort((a, b) => b.number - a.number)[0]
              : undefined;
            run(
              {
                type: "UpdateCreditParticipant",
                participantId: logoFor as never,
                fields: { logoAssetId: assetId as never, logoVersionId: (version?.id ?? null) as never },
              },
              t("app-scene-editor-credits-panel.participants-tab.run.42bea290e501"),
            );
            setLogoFor(null);
          }}
        />
      ) : null}
    </div>
  );
}

export function CreditsPanel({
  state,
  occurrenceId,
  editable,
  run,
  cmds,
}: {
  state: ProjectState;
  occurrenceId: string;
  editable: boolean;
  run: (command: Command, label: string) => string | null;
  cmds?: Commands | undefined;
}) {
  const [tab, setTab] = useState<"design" | "participants">("participants");
  const seq = creditSequenceOf(state, occurrenceId);
  return (
    <section className="flex min-h-0 flex-col" data-testid="mts-credits-panel">
      <PanelHeader title={t("app-scene-editor-credits-panel.credits-panel.title.08f1748714f1")} />
      <div role="tablist" className="flex gap-1 border-b border-border px-2">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "design"}
          data-testid="mts-credits-tab-design"
          className={`px-2 py-1 text-[12px] ${tab === "design" ? "border-b-2 border-accent-brand text-text-primary" : "text-text-tertiary"}`}
          onClick={() => setTab("design")}
        >
          {t("app-scene-editor-credits-panel.credits-panel.button.aabc36b5a4bb")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "participants"}
          data-testid="mts-credits-tab-participants"
          className={`px-2 py-1 text-[12px] ${tab === "participants" ? "border-b-2 border-accent-brand text-text-primary" : "text-text-tertiary"}`}
          onClick={() => setTab("participants")}
        >
          {t("app-scene-editor-credits-panel.credits-panel.button.9dd6d709a240")}
        </button>
      </div>
      {tab === "design" ? (
        seq ? (
          <DesignTab seq={seq} editable={editable} run={run} occurrenceId={occurrenceId} />
        ) : (
          <p className="p-2 text-xs text-text-tertiary">
            {t("app-scene-editor-credits-panel.credits-panel.p.2c236b6f5efc")}
          </p>
        )
      ) : (
        <ParticipantsTab state={state} editable={editable} run={run} cmds={cmds} />
      )}
    </section>
  );
}
