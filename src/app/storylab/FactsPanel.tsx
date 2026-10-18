/**
 * Story Lab (SL2): fakta og hemmeligheter – tekst, type, når det skjer og hvem som vet det fra hvilken scene.
 * Lagres med AddStoryFact / UpdateStoryFact / RemoveStoryFact (med angring).
 */
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { L, factError, newId, type ProjectState, type StoryFact, type StoryFactFields } from "@/core";
import type { Commands } from "@/app/project/use-commands";
import { PanelHeader, ToolbarButton } from "@/app/shell/workspace-chrome";
import { Textarea } from "@/components/ui/textarea";
import { sceneLabel, scenesByStoryTime, storyCharacters } from "./storylab-data";

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
        title={L("Fakta og hemmeligheter", "Facts and secrets")}
        count={facts.length}
        actions={
          editable ? (
            <ToolbarButton
              variant="icon"
              onClick={() => setAdding(true)}
              aria-label={L("Nytt faktum", "New fact")}
              title={L("Nytt faktum", "New fact")}
              data-testid="storylab-fact-add"
            >
              <Plus />
            </ToolbarButton>
          ) : null
        }
      />
      {adding ? (
        <FactForm
          state={state}
          initial={emptyFact()}
          onCancel={() => setAdding(false)}
          onSave={(fields) => {
            const e = cmds.run({ type: "AddStoryFact", factId: newId<"story_fact">(), fields }, L("Nytt faktum", "New fact"));
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
          <li className="px-3 py-2 text-[13px] text-text-tertiary">{L("Ingen fakta ennå.", "No facts yet.")}</li>
        ) : null}
        {facts.map((f) =>
          editing === f.id ? (
            <li key={f.id}>
              <FactForm
                state={state}
                initial={{ text: f.text, kind: f.kind, atSceneId: f.atSceneId, knownBy: f.knownBy }}
                onCancel={() => setEditing(null)}
                onSave={(fields) => {
                  const e = cmds.run({ type: "UpdateStoryFact", factId: f.id, fields }, L("Endre faktum", "Change fact"));
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
              onRemove={() => setErr(cmds.run({ type: "RemoveStoryFact", factId: f.id, removed: true }, L("Fjern faktum", "Remove fact")))}
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
          {fact.kind === "secret" ? L("Hemmelighet", "Secret") : L("Faktum", "Fact")}
        </span>
        <span className="min-w-0 flex-1 text-text-primary">{fact.text}</span>
        {editable ? (
          <>
            <button type="button" onClick={onEdit} aria-label={L("Endre", "Edit")} className="rounded-sm p-1 text-text-tertiary hover:bg-surface-3 hover:text-text-primary">
              <Pencil className="size-3.5" aria-hidden />
            </button>
            <button type="button" onClick={onRemove} aria-label={L("Fjern", "Remove")} className="rounded-sm p-1 text-text-tertiary hover:bg-surface-3 hover:text-text-primary">
              <Trash2 className="size-3.5" aria-hidden />
            </button>
          </>
        ) : null}
      </div>
      <p className="mt-1 text-[11px] text-text-tertiary">
        {L("Skjer", "Happens")}: {sceneLabel(state, fact.atSceneId)}
      </p>
      <p className="text-[11px] text-text-tertiary">
        {L("Vet det", "Known by")}:{" "}
        {fact.knownBy.length
          ? fact.knownBy
              .map((k) => `${state.assets[k.assetId]?.name ?? "?"}${k.fromSceneId ? ` (${L("fra", "from")} ${sceneLabel(state, k.fromSceneId)})` : ""}`)
              .join(", ")
          : L("bare regissøren", "only the director")}
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
    <select value={value ?? ""} aria-label={label} onChange={(e) => onChange(e.target.value || null)} className={control + " min-w-0 flex-1"}>
      <option value="">{L("Uten tidspunkt", "No point in time")}</option>
      {scenes.map((s) => (
        <option key={s.sceneId} value={s.sceneId}>
          {s.label}
        </option>
      ))}
    </select>
  );
  return (
    <div className="space-y-2 border-b border-border bg-surface-2 p-3 text-[13px]" data-testid="storylab-fact-form">
      <Textarea
        value={f.text}
        rows={2}
        placeholder={L("Hva er sant i fortellingen?", "What is true in the story?")}
        aria-label={L("Tekst", "Text")}
        onChange={(e) => setF({ ...f, text: e.target.value })}
      />
      <div className="flex gap-2">
        <select value={f.kind} aria-label={L("Type", "Kind")} onChange={(e) => setF({ ...f, kind: e.target.value as StoryFactFields["kind"] })} className={control}>
          <option value="fact">{L("Faktum", "Fact")}</option>
          <option value="secret">{L("Hemmelighet", "Secret")}</option>
        </select>
        {sceneSelect(f.atSceneId, (v) => setF({ ...f, atSceneId: v as never }), L("Skjer i scene", "Happens in scene"))}
      </div>
      <p className="text-[12px] text-text-secondary">{L("Hvem vet det, fra hvilken scene", "Who knows it, from which scene")}</p>
      {f.knownBy.map((k, i) => (
        <div key={i} className="flex gap-1" data-testid="storylab-fact-knower">
          <select
            value={k.assetId}
            aria-label={L("Karakter", "Character")}
            onChange={(e) => setF({ ...f, knownBy: f.knownBy.map((x, j) => (j === i ? { ...x, assetId: e.target.value as never } : x)) })}
            className={control + " w-32 shrink-0"}
          >
            {chars.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {sceneSelect(k.fromSceneId, (v) => setF({ ...f, knownBy: f.knownBy.map((x, j) => (j === i ? { ...x, fromSceneId: v as never } : x)) }), L("Vet det fra scene", "Knows it from scene"))}
          <button
            type="button"
            onClick={() => setF({ ...f, knownBy: f.knownBy.filter((_, j) => j !== i) })}
            aria-label={L("Fjern", "Remove")}
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
          {L("Legg til en som vet det", "Add someone who knows")}
        </button>
      ) : null}
      {err ? (
        <p role="alert" className="text-[12px] text-status-danger">
          {err}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <ToolbarButton onClick={onCancel}>{L("Avbryt", "Cancel")}</ToolbarButton>
        <ToolbarButton variant="primary" disabled={!f.text.trim() || !!err} onClick={() => onSave(f)} data-testid="storylab-fact-save">
          {L("Lagre", "Save")}
        </ToolbarButton>
      </div>
    </div>
  );
}
