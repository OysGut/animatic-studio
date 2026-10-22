/** SL4: ny gruppeøkt med profiløyeblikksbilder og en lagret, tilfeldig seed. */
import { SceneSelect, mainOccurrenceOfScene } from "@/app/shell/SceneSelect";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { profileAt, type EngineMode, type ProjectState } from "@/core";
import { createStorySession, type JsonValue } from "@/adapters/storylab/sessions.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { ToolbarButton, PanelHeader } from "@/app/shell/workspace-chrome";
import { AssetThumb, useAssetCovers } from "@/app/library/AssetThumb";
import { scenesByStoryTime, storyCharacters } from "./storylab-data";
import { t } from "@/core/i18n/keyed";

export function NewGroupDialog({ state, projectId, initialSceneId, onClose, onCreated }: {
  state: ProjectState; projectId: string; initialSceneId: string | null;
  onClose: () => void; onCreated: (id: string) => void;
}) {
  const characters = storyCharacters(state);
  const covers = useAssetCovers(state, characters.map((c) => c.id));
  const [participants, setParticipants] = useState<string[]>([]);
  const [sceneId, setSceneId] = useState(initialSceneId);
  const [situation, setSituation] = useState("");
  const [mode, setMode] = useState<EngineMode>("qa");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const create = useServerFn(createStorySession);
  const qc = useQueryClient();
  const valid = participants.length >= 2 && participants.length <= 6;
  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const profiles = Object.fromEntries(participants.map((id) => [id, profileAt(state, id, sceneId as never)]));
      const seed = crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
      const r = await create({ data: { projectId, kind: "group", title: t("app-storylab-new-group-dialog.title.title.d630fae95431"),
        context: { participants, sceneId, situation, mode, seed, profiles: profiles as unknown as JsonValue } } });
      if (!r.ok) { setError(r.message); return; }
      qc.setQueryData(["story-session", projectId, r.session.id], r);
      await qc.invalidateQueries({ queryKey: ["story-sessions", projectId] });
      onCreated(r.session.id);
    } catch {
      setError(t("app-storylab-new-group-dialog.submit.set-error.6b539b130a11"));
    } finally { setBusy(false); }
  };
  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
    <DialogContent className="max-w-lg max-h-[85dvh] overflow-y-auto" data-testid="storylab-group-dialog">
      <DialogHeader><DialogTitle>{t("app-storylab-new-group-dialog.new-group-dialog.dialog-title.eb2b97496274")}</DialogTitle></DialogHeader>
      <PanelHeader title={t("app-storylab-new-group-dialog.new-group-dialog.title.00fea5de6318")} count={`${participants.length}/6`} />
      <div className="space-y-1">
        {characters.map((a) => <label key={a.id} className="flex items-center gap-2 text-sm">
          <Checkbox checked={participants.includes(a.id)} disabled={busy || (!participants.includes(a.id) && participants.length >= 6)}
            data-testid="storylab-participant" data-asset-id={a.id} aria-label={a.name}
            onCheckedChange={(checked) => setParticipants((p) => checked ? [...p, a.id] : p.filter((id) => id !== a.id))} />
          <AssetThumb state={state} assetId={a.id} url={covers[a.id]} size="sm" />{a.name}
        </label>)}
      </div>
      {!valid ? <p className="text-xs text-text-tertiary">{t("app-storylab-new-group-dialog.new-group-dialog.p.a52f5280d71b")}</p> : null}
      <label className="space-y-1 text-sm">{t("app-storylab-new-group-dialog.new-group-dialog.label.8945d234f786")}
        <SceneSelect className="h-8 w-full" testId="storylab-group-time" ariaLabel={t("app-storylab-new-group-dialog.new-group-dialog.label.8945d234f786")} value={sceneId ?? ""} disabled={busy} onChange={(v) => setSceneId(v || null)}
          emptyLabel={t("app-storylab-new-group-dialog.new-group-dialog.option.68793ca3a761")}
          options={scenesByStoryTime(state).map((s) => ({ value: s.sceneId, label: s.label, occurrence: mainOccurrenceOfScene(state, s.sceneId) }))} />
      </label>
      <label className="space-y-1 text-sm">{t("app-storylab-new-group-dialog.new-group-dialog.label.8652b857c08a")}
        <Textarea value={situation} disabled={busy} onChange={(e) => setSituation(e.target.value)} data-testid="storylab-situation" />
      </label>
      <div role="radiogroup" aria-label={t("app-storylab-new-group-dialog.new-group-dialog.aria-label.95ca6fd6ada6")} className="flex flex-wrap gap-1">
        {(["qa", "improv"] as const).map((m) => <ToolbarButton key={m} role="radio" aria-checked={m === mode} active={m === mode} disabled={busy}
          data-testid={`storylab-group-mode-${m}`} onClick={() => setMode(m)}>{m === "qa" ? t("app-storylab-new-group-dialog.new-group-dialog.toolbar-button.640761a740d0") : t("app-storylab-new-group-dialog.new-group-dialog.toolbar-button.dcbe38516142")}</ToolbarButton>)}
      </div>
      {error ? <p role="alert" className="text-sm text-status-danger">{error}</p> : null}
      <div className="flex justify-end gap-1">
        <ToolbarButton disabled={busy} onClick={onClose}>{t("app-storylab-new-group-dialog.new-group-dialog.toolbar-button.ea31644a77ac")}</ToolbarButton>
        <ToolbarButton variant="primary" disabled={!valid || busy} onClick={() => void submit()} data-testid="storylab-session-create">{t("app-storylab-new-group-dialog.new-group-dialog.toolbar-button.a48c6c0816af")}</ToolbarButton>
      </div>
    </DialogContent>
  </Dialog>;
}