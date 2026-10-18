/** SL4: ny gruppeøkt med profiløyeblikksbilder og en lagret, tilfeldig seed. */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { L, profileAt, type EngineMode, type ProjectState } from "@/core";
import { createStorySession, type JsonValue } from "@/adapters/storylab/sessions.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { ToolbarButton, PanelHeader } from "@/app/shell/workspace-chrome";
import { AssetSymbolIcon } from "@/app/library/AssetSymbolIcon";
import { scenesByStoryTime, storyCharacters } from "./storylab-data";

export function NewGroupDialog({ state, projectId, initialSceneId, onClose, onCreated }: {
  state: ProjectState; projectId: string; initialSceneId: string | null;
  onClose: () => void; onCreated: (id: string) => void;
}) {
  const characters = storyCharacters(state);
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
      const r = await create({ data: { projectId, kind: "group", title: L("Gruppesamtale", "Group conversation"),
        context: { participants, sceneId, situation, mode, seed, profiles: profiles as unknown as JsonValue } } });
      if (!r.ok) { setError(r.message); return; }
      qc.setQueryData(["story-session", projectId, r.session.id], r);
      await qc.invalidateQueries({ queryKey: ["story-sessions", projectId] });
      onCreated(r.session.id);
    } catch {
      setError(L("Økten kunne ikke opprettes. Prøv igjen.", "The session could not be created. Try again."));
    } finally { setBusy(false); }
  };
  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
    <DialogContent className="max-w-lg max-h-[85dvh] overflow-y-auto" data-testid="storylab-group-dialog">
      <DialogHeader><DialogTitle>{L("Gruppesamtale", "Group conversation")}</DialogTitle></DialogHeader>
      <PanelHeader title={L("Deltakere", "Participants")} count={`${participants.length}/6`} />
      <div className="space-y-1">
        {characters.map((a) => <label key={a.id} className="flex items-center gap-2 text-sm">
          <Checkbox checked={participants.includes(a.id)} disabled={busy || (!participants.includes(a.id) && participants.length >= 6)}
            data-testid="storylab-participant" data-asset-id={a.id} aria-label={a.name}
            onCheckedChange={(checked) => setParticipants((p) => checked ? [...p, a.id] : p.filter((id) => id !== a.id))} />
          <AssetSymbolIcon state={state} assetId={a.id} className="size-6" />{a.name}
        </label>)}
      </div>
      {!valid ? <p className="text-xs text-text-tertiary">{L("Velg mellom 2 og 6 deltakere.", "Choose between 2 and 6 participants.")}</p> : null}
      <label className="space-y-1 text-sm">{L("Tidspunkt i fortellingen", "Point in the story")}
        <select className="h-8 w-full" data-testid="storylab-group-time" value={sceneId ?? ""} disabled={busy} onChange={(e) => setSceneId(e.target.value || null)}>
          <option value="">{L("Uten tidspunkt", "No point in time")}</option>
          {scenesByStoryTime(state).map((s) => <option key={s.sceneId} value={s.sceneId}>{s.label}</option>)}
        </select>
      </label>
      <label className="space-y-1 text-sm">{L("Situasjon", "Situation")}
        <Textarea value={situation} disabled={busy} onChange={(e) => setSituation(e.target.value)} data-testid="storylab-situation" />
      </label>
      <div role="radiogroup" aria-label={L("Modus", "Mode")} className="flex flex-wrap gap-1">
        {(["qa", "improv"] as const).map((m) => <ToolbarButton key={m} role="radio" aria-checked={m === mode} active={m === mode} disabled={busy}
          data-testid={`storylab-group-mode-${m}`} onClick={() => setMode(m)}>{m === "qa" ? L("Spørsmål og svar", "Questions and answers") : L("Fri improvisasjon", "Free improvisation")}</ToolbarButton>)}
      </div>
      {error ? <p role="alert" className="text-sm text-status-danger">{error}</p> : null}
      <div className="flex justify-end gap-1">
        <ToolbarButton disabled={busy} onClick={onClose}>{L("Avbryt", "Cancel")}</ToolbarButton>
        <ToolbarButton variant="primary" disabled={!valid || busy} onClick={() => void submit()} data-testid="storylab-session-create">{L("Start samtalen", "Start the conversation")}</ToolbarButton>
      </div>
    </DialogContent>
  </Dialog>;
}