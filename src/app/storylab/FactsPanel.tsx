/**
 * Story Lab (SL2): fakta og hemmeligheter – tekst, type, når det skjer og hvem som vet det fra hvilken scene.
 * Lagres med AddStoryFact / UpdateStoryFact / RemoveStoryFact (med angring).
 */
import { SceneSelect, mainOccurrenceOfScene } from "@/app/shell/SceneSelect";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { factError, newId, type ProjectState, type StoryFact, type StoryFactFields } from "@/core";
import type { Commands } from "@/app/project/use-commands";
import { PanelHeader, ToolbarButton, IconButton } from "@/app/shell/workspace-chrome";
import { Textarea } from "@/components/ui/textarea";
import { sceneLabel, scenesByStoryTime, storyCharacters } from "./storylab-data";
import { t } from "@/core/i18n/keyed";

const control =
  "h-8 rounded-sm border border-border-control bg-surface-3 px-2 text-[13px] text-text-primary";

const emptyFact = (): StoryFactFields => ({ text: "", kind: "fact", atSceneId: null, knownBy: [] });

export function FactsPanel({ state, cmds, editable }: { state: ProjectState; cmds: Commands; editable: boolean }) {
  const facts = Object.values(state.storyFacts).filter((f) => !f.removed);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="min-h-0 flex-1 overflow-y-auto" data-testid="storylab-facts">
      <PanelHeader
        title={t("app-storylab-facts-panel.facts-panel.title.aad3e36edbda")}
        count={facts.length}
        actions={
          editable ? (
            <IconButton
              onClick={() => setAdding(true)}
              label={t("app-storylab-facts-panel.facts-panel.label.7a17ca464c32")}
              title={t("app-storylab-facts-panel.facts-panel.title.7a17ca464c32")}
              data-testid="storylab-fact-add"
            >
              <Plus />
            </IconButton>
          ) : null
        }
      />
      {adding ? (
        <FactForm
          state={state}
          initial={emptyFact()}
          onCancel={() => setAdding(false)}
          onSave={(fields) => {
            const e = cmds.run({ type: "AddStoryFact", factId: newId<"story_fact">(), fields }, t("app-storylab-facts-panel.e.cmds-run.1bae1d9a4707"));
            setErr(e);
            if (!e) setAdding(false);
          }}
        />
      ) : null}
      {err ? (
        <p role="alert" className="px-3 py-1 text-[12px] text-status-danger">
          {err}
        </p>
      ) : null}
      <ul className="divide-y divide-border">
        {facts.length === 0 && !adding ? (
          <li className="px-3 py-2 text-[13px] text-text-tertiary">{t("app-storylab-facts-panel.facts-panel.li.d888710fc12f")}</li>
        ) : null}
        {facts.map((f) =>
          editing === f.id ? (
            <li key={f.id}>
              <FactForm
                state={state}
                initial={{ text: f.text, kind: f.kind, atSceneId: f.atSceneId, knownBy: f.knownBy }}
                onCancel={() => setEditing(null)}
                onSave={(fields) => {
                  const e = cmds.run({ type: "UpdateStoryFact", factId: f.id, fields }, t("app-storylab-facts-panel.e.cmds-run.56d793695e92"));
                  setErr(e);
                  if (!e) setEditing(null);
                }}
              />
            </li>
          ) : (
            <FactRow
              key={f.id}
              state={state}
              fact={f}
              editable={editable}
              onEdit={() => setEditing(f.id)}
              onRemove={() => setErr(cmds.run({ type: "RemoveStoryFact", factId: f.id, removed: true }, t("app-storylab-facts-panel.facts-panel.cmds-run.0127681ec81d")))}
            />
          ),
        )}
      </ul>
    </div>
  );
}

function FactRow({
  state,
  fact,
  editable,
  onEdit,
  onRemove,
}: {
  state: ProjectState;
  fact: StoryFact;
  editable: boolean;
  onEdit: () => void;
  onRemove: () => void;
}) {
  return (
    <li className="px-3 py-2 text-[13px]" data-testid="storylab-fact" data-kind={fact.kind}>
      <div className="flex items-start gap-2">
        <span
          className={
            "mt-0.5 shrink-0 rounded-sm px-1 text-[11px] uppercase " +
            (fact.kind === "secret" ? "bg-status-warning/15 text-status-warning" : "bg-surface-3 text-text-tertiary")
          }
        >
          {fact.kind === "secret" ? t("app-storylab-facts-panel.fact-row.span.c5d3eb2490f3") : t("app-storylab-facts-panel.fact-row.span.209aba8e7ce4")}
        </span>
        <span className="min-w-0 flex-1 text-text-primary">{fact.text}</span>
        {editable ? (
          <>
            <button type="button" onClick={onEdit} aria-label={t("app-storylab-facts-panel.fact-row.aria-label.44924fccc0c0")} className="rounded-sm p-1 text-text-tertiary hover:bg-surface-3 hover:text-text-primary">
              <Pencil className="size-3.5" aria-hidden />
            </button>
            <button type="button" onClick={onRemove} aria-label={t("app-storylab-facts-panel.fact-row.aria-label.15cad6df9fdd")} className="rounded-sm p-1 text-text-tertiary hover:bg-surface-3 hover:text-text-primary">
              <Trash2 className="size-3.5" aria-hidden />
            </button>
          </>
        ) : null}
      </div>
      <p className="mt-1 text-[11px] text-text-tertiary">
        {t("app-storylab-facts-panel.fact-row.p.68ddbf4e1e56")}: {sceneLabel(state, fact.atSceneId)}
      </p>
      <p className="text-[11px] text-text-tertiary">
        {t("app-storylab-facts-panel.fact-row.p.785c83e50d06")}:{" "}
        {fact.knownBy.length
          ? fact.knownBy
              .map((k) => `${state.assets[k.assetId]?.name ?? "?"}${k.fromSceneId ? ` (${t("app-storylab-facts-panel.fact-row.fact-known-by-map.34d823fecbff")} ${sceneLabel(state, k.fromSceneId)})` : ""}`)
              .join(", ")
          : t("app-storylab-facts-panel.fact-row.p.13c5f1b53943")}
      </p>
    </li>
  );
}

function FactForm({
  state,
  initial,
  onSave,
  onCancel,
}: {
  state: ProjectState;
  initial: StoryFactFields;
  onSave: (f: StoryFactFields) => void;
  onCancel: () => void;
}) {
  const [f, setF] = useState<StoryFactFields>(initial);
  const scenes = useMemo(() => scenesByStoryTime(state), [state]);
  const chars = storyCharacters(state);
  const err = f.text.trim() ? factError(f) : null;
  const sceneSelect = (value: string | null, onChange: (v: string | null) => void, label: string) => (
    <SceneSelect value={value ?? ""} ariaLabel={label} onChange={(v) => onChange(v || null)} className={control + " min-w-0 flex-1"}
      emptyLabel={t("app-storylab-facts-panel.scene-select.option.f2ec70ebe653")}
      options={scenes.map((s) => ({ value: s.sceneId, label: s.label, occurrence: mainOccurrenceOfScene(state, s.sceneId) }))} />
  );
  return (
    <div className="space-y-2 border-b border-border bg-surface-2 p-3 text-[13px]" data-testid="storylab-fact-form">
      <Textarea
        value={f.text}
        rows={2}
        placeholder={t("app-storylab-facts-panel.fact-form.placeholder.320ba2c2d3b3")}
        aria-label={t("app-storylab-facts-panel.fact-form.aria-label.8478e3e26812")}
        onChange={(e) => setF({ ...f, text: e.target.value })}
      />
      <div className="flex gap-2">
        <select value={f.kind} aria-label={t("app-storylab-facts-panel.fact-form.aria-label.ce207d5ef32e")} onChange={(e) => setF({ ...f, kind: e.target.value as StoryFactFields["kind"] })} className={control}>
          <option value="fact">{t("app-storylab-facts-panel.fact-form.option.78e0b7ebf4a0")}</option>
          <option value="secret">{t("app-storylab-facts-panel.fact-form.option.1a967b304787")}</option>
        </select>
        {sceneSelect(f.atSceneId, (v) => setF({ ...f, atSceneId: v as never }), t("app-storylab-facts-panel.fact-form.scene-select.9ef18a508f12"))}
      </div>
      <p className="text-[12px] text-text-secondary">{t("app-storylab-facts-panel.fact-form.p.70023504f28e")}</p>
      {f.knownBy.map((k, i) => (
        <div key={i} className="flex gap-1" data-testid="storylab-fact-knower">
          <select
            value={k.assetId}
            aria-label={t("app-storylab-facts-panel.fact-form.aria-label.a0e7e0e1cadc")}
            onChange={(e) => setF({ ...f, knownBy: f.knownBy.map((x, j) => (j === i ? { ...x, assetId: e.target.value as never } : x)) })}
            className={control + " w-32 shrink-0"}
          >
            {chars.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {sceneSelect(k.fromSceneId, (v) => setF({ ...f, knownBy: f.knownBy.map((x, j) => (j === i ? { ...x, fromSceneId: v as never } : x)) }), t("app-storylab-facts-panel.fact-form.scene-select.cba69e381ea3"))}
          <button
            type="button"
            onClick={() => setF({ ...f, knownBy: f.knownBy.filter((_, j) => j !== i) })}
            aria-label={t("app-storylab-facts-panel.fact-form.aria-label.9f3bde5c9cbd")}
            className="rounded-sm px-1 text-text-tertiary hover:bg-surface-3 hover:text-text-primary"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        </div>
      ))}
      {chars.length ? (
        <button
          type="button"
          data-testid="storylab-fact-knower-add"
          onClick={() => {
            const free = chars.find((c) => !f.knownBy.some((k) => k.assetId === c.id));
            if (free) setF({ ...f, knownBy: [...f.knownBy, { assetId: free.id, fromSceneId: null }] });
          }}
          className="h-7 rounded-sm px-2 text-[12px] text-text-secondary hover:bg-surface-3 hover:text-text-primary"
        >
          {t("app-storylab-facts-panel.fact-form.button.a5ad7dfefc4d")}
        </button>
      ) : null}
      {err ? (
        <p role="alert" className="text-[12px] text-status-danger">
          {err}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <ToolbarButton onClick={onCancel}>{t("app-storylab-facts-panel.fact-form.toolbar-button.c1828dc1df96")}</ToolbarButton>
        <ToolbarButton variant="primary" disabled={!f.text.trim() || !!err} onClick={() => onSave(f)} data-testid="storylab-fact-save">
          {t("app-storylab-facts-panel.fact-form.toolbar-button.2b1eb07f4dc3")}
        </ToolbarButton>
      </div>
    </div>
  );
}
