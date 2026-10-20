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
import { PanelHeader, Toolbar, ToolbarButton, IconButton } from "@/app/shell/workspace-chrome";
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
import { t as tk } from "@/core/i18n/keyed";

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
      tk("app-storylab-character-workspace.e.cmds-run.4e9d9abe57b4", { name: String(asset.name) }),
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
              ? tk("app-storylab-character-workspace.character-workspace.span.8f9b3903a3c4")
              : pending
                ? tk("app-storylab-character-workspace.character-workspace.span.ab9fed06d72e")
                : err
                  ? err
                  : draft
                    ? tk("app-storylab-character-workspace.character-workspace.span.4b264c65ac75")
                    : ""}
          </span>
        }
      >
        <ToolbarButton onClick={onTalk} disabled={!editable} data-testid="storylab-talk">
          <MessageSquare />
          {tk("app-storylab-character-workspace.character-workspace.toolbar-button.84ae6f9c1029", { name: String(asset.name) })}
        </ToolbarButton>
        {editable ? (
          <ToolbarButton onClick={() => setGenOpen(true)} data-testid="storylab-generate">
            <AiGlyph />
            {tk("app-storylab-character-workspace.character-workspace.toolbar-button.3ddc3c238116")}
          </ToolbarButton>
        ) : null}
        {editable && active ? (
          <ToolbarButton
            onClick={() =>
              setErr(
                cmds.run(
                  { type: "RemoveStoryProfile", profileId: active.id, removed: true },
                  tk("app-storylab-character-workspace.character-workspace.cmds-run.4a6f5e89223c", { name: String(asset.name) }),
                ),
              )
            }
          >
            <Trash2 />
            {tk("app-storylab-character-workspace.character-workspace.toolbar-button.f8e5374e5ec2")}
          </ToolbarButton>
        ) : null}
      </Toolbar>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {!draft || !active ? (
          <div className="space-y-3 p-6 text-[13px] text-text-secondary">
            {removed ? (
              <>
                <p>{tk("app-storylab-character-workspace.character-workspace.p.9711edf20e27")}</p>
                {editable ? (
                  <ToolbarButton
                    onClick={() =>
                      setErr(
                        cmds.run(
                          { type: "RemoveStoryProfile", profileId: removed.id, removed: false },
                          tk("app-storylab-character-workspace.character-workspace.cmds-run.0987cdaca7ba"),
                        ),
                      )
                    }
                  >
                    <Undo2 />
                    {tk("app-storylab-character-workspace.character-workspace.toolbar-button.0987cdaca7ba")}
                  </ToolbarButton>
                ) : null}
              </>
            ) : (
              <>
                <p>{tk("app-storylab-character-workspace.character-workspace.p.c3e5f02a0f35", { name: String(asset.name) })}</p>
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
                    {tk("app-storylab-character-workspace.character-workspace.toolbar-button.5ed1a21a85a3")}
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
                      ? tk("app-storylab-character-workspace.label.label.715cf003ff70", { value1: String(sectionLabel(sec)) })
                      : tk("app-storylab-character-workspace.label.label.74bc66d36bba", { value1: String(sectionLabel(sec)) }),
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
        title={tk("app-storylab-character-workspace.arc-section.title.b8dda9f7085d")}
        count={stages.length}
        collapse={{
          open,
          onToggle: () => setOpen(!open),
          label: open ? tk("app-storylab-character-workspace.label.label.892a50b17ca2") : tk("app-storylab-character-workspace.label.label.3f6e9968474f"),
        }}
        actions={
          editable && free ? (
            <IconButton
              data-testid="storylab-stage-add"
              label={tk("app-storylab-character-workspace.arc-section.label.e4fa46f524b3")}
              title={tk("app-storylab-character-workspace.arc-section.title.e4fa46f524b3")}
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
                    tk("app-storylab-character-workspace.arc-section.cmds-run.cbffd3d2de88"),
                  ),
                )
              }
            >
              <Plus />
            </IconButton>
          ) : null
        }
      />
      {open ? (
        <div className="space-y-3 p-4">
          {stages.length === 0 ? (
            <p className="text-[13px] text-text-tertiary">
              {tk("app-storylab-character-workspace.arc-section.p.1a8352a1b17e")}
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
          {tk("app-storylab-character-workspace.stage-editor.label.a159496ebbd1")}{" "}
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
            aria-label={tk("app-storylab-character-workspace.stage-editor.aria-label.9940c56fcaf3")}
            onChange={(e) => {
              const d = defs.find((x) => fieldId(x) === e.target.value);
              if (d) setPatch(setPatchField(patch, d, getField(base, d) ?? emptyValue(d) ?? ""));
            }}
            className="h-7 rounded-sm border border-border-control bg-surface-3 px-2 text-[13px] text-text-primary"
          >
            <option value="">{tk("app-storylab-character-workspace.stage-editor.option.9fdfc39efa16")}</option>
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
                    tk("app-storylab-character-workspace.stage-editor.cmds-run.b39b3591dd73"),
                  ),
                )
              }
            >
              {tk("app-storylab-character-workspace.stage-editor.toolbar-button.a0a0e1681fd1")}
            </ToolbarButton>
          ) : null}
          {editable ? (
            <IconButton
              label={tk("app-storylab-character-workspace.stage-editor.label.ae52fad4a998")}
              title={tk("app-storylab-character-workspace.stage-editor.title.ae52fad4a998")}
              onClick={() =>
                onError(cmds.run({ type: "RemoveStoryProfileStage", stageId: stage.id, removed: true }, tk("app-storylab-character-workspace.stage-editor.cmds-run.6b781661047c")))
              }
            >
              <Trash2 />
            </IconButton>
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
                {tk("app-storylab-character-workspace.stage-editor.button.1993f484d5d4")}
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
