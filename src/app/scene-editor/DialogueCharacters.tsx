import { useState } from "react";
import { L, dialogueCharacterSuggestions, dialogueSpeaker, newId, type ProjectState } from "@/core";
import type { Commands } from "@/app/project/use-commands";
import { Button } from "@/components/ui/button";

export function DialogueCharacters({ state, occurrenceId, cmds }: { state: ProjectState; occurrenceId: string; cmds: Commands }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const suggestions = dialogueCharacterSuggestions(state, occurrenceId);
  if (!suggestions.length) return null;
  return <div className="border-t border-border pt-2">
    <Button data-testid="dialogue-link-open" size="sm" variant="secondary" onClick={() => setOpen(!open)}>{L("Koble replikker til karakterer", "Link lines to characters")}</Button>
    {open ? <div data-testid="dialogue-link-list" className="mt-2 flex flex-col gap-2">
      {suggestions.map(({ clip, asset }) => <label key={clip.id} className="flex items-center gap-2 text-xs text-text-secondary"><input type="checkbox" data-testid="dialogue-link-check" checked={selected.has(clip.id)} onChange={e => setSelected(prev => { const next = new Set(prev); if (e.target.checked) next.add(clip.id); else next.delete(clip.id); return next; })} />{dialogueSpeaker(state, occurrenceId, clip.blockId)} → {asset.name}: {state.blocks[clip.blockId ?? ""]?.text}</label>)}
      <Button data-testid="dialogue-link-confirm" size="sm" disabled={!selected.size} onClick={async () => {
        const group = newId<"command">();
        for (const { clipIds, asset } of suggestions.filter(s => selected.has(s.clip.id))) {
          const r = await cmds.runAndWait({ type: "SetDialogueCharacter", clipIds, characterAssetId: asset.id }, L("Bekreftet karakterkobling", "Confirmed character link"), group);
          if (r.error) { setError(r.error); return; }
        }
        setOpen(false); setSelected(new Set());
      }}>{L("Bekreft koblinger", "Confirm links")}</Button>
    </div> : null}
    {error ? <p role="alert" className="text-xs text-status-danger">{error}</p> : null}
  </div>;
}