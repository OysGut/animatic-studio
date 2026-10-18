/**
 * Story Lab (SL2): karakterflaten – profilen felt for felt (lagres automatisk med SetStoryProfile),
 * karakterbuen (stadier fra en scene) og «Lag profil med AI …».
 */
import { MessageSquare, Plus, Trash2, Undo2 } from "lucide-react";
import { AiGlyph } from "@/app/design/icons/AiGlyph";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  L,
  activeProfileOf,
  emptyStoryProfile,
  newId,
  profileAt,
  profileError,
  profilePatchError,
  storyTimes,
  type Asset,
  type ProjectState,
  type StoryProfile,
  type StoryProfilePatch,
  type StoryProfileStage,
} from "@/core";
import type { Commands } from "@/app/project/use-commands";
import { PanelHeader, Toolbar, ToolbarButton } from "@/app/shell/workspace-chrome";
import { ProfileGenerateDialog } from "./ProfileGenerateDialog";
import {
  FieldEditor,
  SECTIONS,
  emptyValue,
  fieldDefs,
  fieldId,
  getField,
  sectionLabel,
  setField,
  setPatchField,
  type SectionKey,
} from "./profile-fields";
import { sceneLabel, scenesByStoryTime, storyCharacters } from "./storylab-data";

const SAVE_DELAY_MS = 700;

export function CharacterWorkspace({
  state,
  projectId,
  asset,
  cmds,
  editable,
  onTalk,
}: {
  state: ProjectState;
  projectId: string;
  asset: Asset;
  cmds: Commands;
  editable: boolean;
  onTalk: () => void;
}) {
  const active = activeProfileOf(state, asset.id);
  const removed = !active
    ? Object.values(state.storyProfiles).find((p) => p.assetId === asset.id && p.removed)
    : undefined;
  const [draft, setDraft] = useState<StoryProfile | null>(active?.profile ?? null);
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [genOpen, setGenOpen] = useState(false);
  const profileId = useRef<string>(active?.id ?? newId<"story_profile">());
  const saved = useRef<StoryProfile | null>(active?.profile ?? null);
  const [open, setOpen] = useState<Record<SectionKey, boolean>>({
    person: true,
    psychology: true,
    speech: true,
    dramatic: true,
    notes: true,
  });

  // Endringer utenfra (andre brukere, angre) tas inn når brukeren ikke har ulagrede endringer
  useEffect(() => {
    if (active) profileId.current = active.id;
    const incoming = active?.profile ?? null;
    if (!pending && incoming !== saved.current) {
      saved.current = incoming;
      setDraft(incoming);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.profile, active?.id]);

  const save = (p: StoryProfile) => {
    if (profileError(p)) return;
    saved.current = p;
    const e = cmds.run(
      { type: "SetStoryProfile", profileId: profileId.current as never, assetId: asset.id, profile: p },
      L(`Profil for ${asset.name}`, `Profile for ${asset.name}`),
      `storylab-profile-${asset.id}`,
    );
    setErr(e);
  };

  useEffect(() => {
    if (!pending || !draft) return;
    const t = setTimeout(() => {
      setPending(false);
      save(draft);
    }, SAVE_DELAY_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, pending]);

  const change = (p: StoryProfile) => {
    setDraft(p);
    setPending(true);
  };

  const defs = fieldDefs();
  const others = storyCharacters(state)
    .filter((c) => c.id !== asset.id)
    .map((c) => ({ id: c.id, name: c.name }));
  const invalid = draft ? profileError(draft) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Toolbar
        title={asset.name}
        status={
          <span className="text-xs text-text-tertiary" data-testid="storylab-profile-status" role="status">
            {invalid
              ? L("Ikke lagret: rett feilen i feltet", "Not saved: fix the error in the field")
              : pending
                ? L("Ulagrede endringer …", "Unsaved changes …")
                : err
                  ? err
                  : draft
                    ? L("Lagret", "Saved")
                    : ""}
          </span>
        }
      >
        <ToolbarButton onClick={onTalk} disabled={!editable} data-testid="storylab-talk">
          <MessageSquare />
          {L(`Snakk med ${asset.name}`, `Talk to ${asset.name}`)}
        </ToolbarButton>
        {editable ? (
          <ToolbarButton onClick={() => setGenOpen(true)} data-testid="storylab-generate">
            <AiGlyph />
            {L("Lag profil med AI …", "Create profile with AI …")}
          </ToolbarButton>
        ) : null}
        {editable && active ? (
          <ToolbarButton
            onClick={() =>
              setErr(
                cmds.run(
                  { type: "RemoveStoryProfile", profileId: active.id, removed: true },
                  L(`Fjern profilen til ${asset.name}`, `Remove the profile of ${asset.name}`),
                ),
              )
            }
          >
            <Trash2 />
            {L("Fjern profil", "Remove profile")}
          </ToolbarButton>
        ) : null}
      </Toolbar>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {!draft || !active ? (
          <div className="space-y-3 p-6 text-[13px] text-text-secondary">
            {removed ? (
              <>
                <p>{L("Profilen er fjernet. Stadier og fakta er beholdt.", "The profile has been removed. Stages and facts are kept.")}</p>
                {editable ? (
                  <ToolbarButton
                    onClick={() =>
                      setErr(
                        cmds.run(
                          { type: "RemoveStoryProfile", profileId: removed.id, removed: false },
                          L("Hent tilbake profilen", "Restore the profile"),
                        ),
                      )
                    }
                  >
                    <Undo2 />
                    {L("Hent tilbake profilen", "Restore the profile")}
                  </ToolbarButton>
                ) : null}
              </>
            ) : (
              <>
                <p>{L(`${asset.name} har ingen profil ennå.`, `${asset.name} has no profile yet.`)}</p>
                {editable ? (
                  <ToolbarButton
                    data-testid="storylab-create-profile"
                    onClick={() => {
                      const p = emptyStoryProfile();
                      setDraft(p);
                      save(p);
                    }}
                  >
                    <Plus />
                    {L("Lag tom profil", "Create empty profile")}
                  </ToolbarButton>
                ) : null}
              </>
            )}
          </div>
        ) : (
          <>
            {SECTIONS.map((sec) => (
              <section key={sec} data-testid="storylab-profile-section" data-section={sec}>
                <PanelHeader
                  title={sectionLabel(sec)}
                  collapse={{
                    open: open[sec],
                    onToggle: () => setOpen({ ...open, [sec]: !open[sec] }),
                    label: open[sec]
                      ? L(`Legg sammen ${sectionLabel(sec)}`, `Collapse ${sectionLabel(sec)}`)
                      : L(`Vis ${sectionLabel(sec)}`, `Show ${sectionLabel(sec)}`),
                  }}
                />
                {open[sec] ? (
                  <div className="grid gap-3 p-4 md:grid-cols-2">
                    {defs
                      .filter((d) => d.section === sec)
                      .map((d) => (
                        <div key={fieldId(d)} className={d.type === "text" || d.type === "list" || d.type === "beliefs" ? "md:col-span-2" : ""}>
                          <FieldEditor
                            def={d}
                            value={getField(draft, d)}
                            disabled={!editable}
                            others={others}
                            onChange={(v) => change(setField(draft, d, v))}
                          />
                        </div>
                      ))}
                  </div>
                ) : null}
              </section>
            ))}
            <ArcSection state={state} asset={asset} cmds={cmds} editable={editable} />
          </>
        )}
      </div>
      {genOpen ? (
        <ProfileGenerateDialog
          state={state}
          projectId={projectId}
          asset={asset}
          current={draft ?? emptyStoryProfile()}
          onClose={() => setGenOpen(false)}
          onApply={(p) => {
            setDraft(p);
            setPending(false);
            save(p);
            setGenOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

/** Karakterbuen: endringer i profilen fra en scene (fortellingstid). */
function ArcSection({
  state,
  asset,
  cmds,
  editable,
}: {
  state: ProjectState;
  asset: Asset;
  cmds: Commands;
  editable: boolean;
}) {
  const [open, setOpen] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const scenes = useMemo(() => scenesByStoryTime(state), [state]);
  const times = storyTimes(state);
  const stages = Object.values(state.storyProfileStages)
    .filter((g) => g.assetId === asset.id && !g.removed)
    .sort((a, b) => (times.get(a.fromSceneId) ?? 0) - (times.get(b.fromSceneId) ?? 0));
  const free = scenes.find((s) => !stages.some((g) => g.fromSceneId === s.sceneId));
  return (
    <section data-testid="storylab-arc">
      <PanelHeader
        title={L("Karakterbue", "Character arc")}
        count={stages.length}
        collapse={{
          open,
          onToggle: () => setOpen(!open),
          label: open ? L("Legg sammen karakterbuen", "Collapse the character arc") : L("Vis karakterbuen", "Show the character arc"),
        }}
        actions={
          editable && free ? (
            <ToolbarButton
              variant="icon"
              data-testid="storylab-stage-add"
              aria-label={L("Nytt stadium", "New stage")}
              title={L("Nytt stadium", "New stage")}
              onClick={() =>
                setErr(
                  cmds.run(
                    {
                      type: "AddStoryProfileStage",
                      stageId: newId<"story_profile_stage">(),
                      assetId: asset.id,
                      fromSceneId: free.sceneId as never,
                      patch: {},
                    },
                    L("Nytt stadium i karakterbuen", "New stage in the character arc"),
                  ),
                )
              }
            >
              <Plus />
            </ToolbarButton>
          ) : null
        }
      />
      {open ? (
        <div className="space-y-3 p-4">
          {stages.length === 0 ? (
            <p className="text-[13px] text-text-tertiary">
              {L(
                "Ingen stadier. Et stadium overstyrer felt i profilen fra en scene og utover i fortellingen.",
                "No stages. A stage overrides profile fields from a scene onwards in the story.",
              )}
            </p>
          ) : null}
          {stages.map((g) => (
            <StageEditor key={g.id} state={state} stage={g} scenes={scenes} cmds={cmds} editable={editable} onError={setErr} />
          ))}
          {err ? (
            <p role="alert" className="text-[12px] text-status-danger">
              {err}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function StageEditor({
  state,
  stage,
  scenes,
  cmds,
  editable,
  onError,
}: {
  state: ProjectState;
  stage: StoryProfileStage;
  scenes: readonly { sceneId: string; label: string }[];
  cmds: Commands;
  editable: boolean;
  onError: (e: string | null) => void;
}) {
  const [fromSceneId, setFrom] = useState<string>(stage.fromSceneId);
  const [patch, setPatch] = useState<StoryProfilePatch>(stage.patch);
  useEffect(() => {
    setFrom(stage.fromSceneId);
    setPatch(stage.patch);
  }, [stage.fromSceneId, stage.patch]);
  const defs = fieldDefs();
  const used = defs.filter((d) => getField(patch, d) !== undefined);
  const unused = defs.filter((d) => getField(patch, d) === undefined);
  const base = profileAt(state, stage.assetId, fromSceneId) ?? emptyStoryProfile();
  const changed = fromSceneId !== stage.fromSceneId || JSON.stringify(patch) !== JSON.stringify(stage.patch);
  const err = profilePatchError(patch);
  return (
    <div className="rounded-sm border border-border bg-surface-2 p-3" data-testid="storylab-stage">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-[12px] text-text-secondary">
          {L("Fra scene", "From scene")}{" "}
          <select
            value={fromSceneId}
            disabled={!editable}
            onChange={(e) => setFrom(e.target.value)}
            className="ml-1 h-7 rounded-sm border border-border-control bg-surface-3 px-2 text-[13px] text-text-primary"
          >
            {scenes.map((s) => (
              <option key={s.sceneId} value={s.sceneId}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        {editable ? (
          <select
            value=""
            aria-label={L("Overstyr et felt", "Override a field")}
            onChange={(e) => {
              const d = defs.find((x) => fieldId(x) === e.target.value);
              if (d) setPatch(setPatchField(patch, d, getField(base, d) ?? emptyValue(d) ?? ""));
            }}
            className="h-7 rounded-sm border border-border-control bg-surface-3 px-2 text-[13px] text-text-primary"
          >
            <option value="">{L("Overstyr et felt …", "Override a field …")}</option>
            {unused.map((d) => (
              <option key={fieldId(d)} value={fieldId(d)}>
                {sectionLabel(d.section)} · {d.label}
              </option>
            ))}
          </select>
        ) : null}
        <span className="ml-auto flex gap-1">
          {editable ? (
            <ToolbarButton
              variant="primary"
              disabled={!changed || !!err}
              onClick={() =>
                onError(
                  cmds.run(
                    { type: "UpdateStoryProfileStage", stageId: stage.id, fromSceneId: fromSceneId as never, patch },
                    L("Endre stadium", "Change stage"),
                  ),
                )
              }
            >
              {L("Lagre stadium", "Save stage")}
            </ToolbarButton>
          ) : null}
          {editable ? (
            <ToolbarButton
              variant="icon"
              aria-label={L("Fjern stadiet", "Remove the stage")}
              title={L("Fjern stadiet", "Remove the stage")}
              onClick={() =>
                onError(cmds.run({ type: "RemoveStoryProfileStage", stageId: stage.id, removed: true }, L("Fjern stadium", "Remove stage")))
              }
            >
              <Trash2 />
            </ToolbarButton>
          ) : null}
        </span>
      </div>
      <p className="mt-1 text-[11px] text-text-tertiary">{sceneLabel(state, fromSceneId)}</p>
      <div className="mt-2 space-y-3">
        {used.map((d) => (
          <div key={fieldId(d)} className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <FieldEditor
                def={{ ...d, label: `${sectionLabel(d.section)} · ${d.label}` }}
                value={getField(patch, d)}
                disabled={!editable}
                onChange={(v) => setPatch(setPatchField(patch, d, v ?? emptyValue(d) ?? ""))}
              />
            </div>
            {editable ? (
              <button
                type="button"
                onClick={() => setPatch(setPatchField(patch, d, undefined))}
                className="mt-5 rounded-sm px-1.5 text-[12px] text-text-tertiary hover:bg-surface-3 hover:text-text-primary"
              >
                {L("Ikke overstyr", "Don’t override")}
              </button>
            ) : null}
          </div>
        ))}
      </div>
      {err ? (
        <p role="alert" className="mt-2 text-[12px] text-status-danger">
          {err}
        </p>
      ) : null}
    </div>
  );
}
