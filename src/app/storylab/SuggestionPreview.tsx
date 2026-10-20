/** SL6: production/variant placement and field-by-field explicit transfer preview. */
import { useEffect, useState } from "react";
import { L, activeProfileOf, blocksOfVariant, emptyStoryProfile, formatHeading, mainProduction, mergeProfile, orderedOccurrences, suggestionProfilePatch, suggestionText, suggestionToCommands, wordDiff, type ProjectState, type StoryProfile, type SuggestionTarget, type TransferSuggestion } from "@/core";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ToolbarButton } from "@/app/shell/workspace-chrome";
import { fieldDefs, fieldId, fieldText, getField, sectionLabel, setField } from "./profile-fields";
import { names } from "./storylab-data";
import { ForkNotice } from "@/app/script/Inspector";
import type { Commands } from "@/app/project/use-commands";
import { t } from "@/core/i18n/keyed";

export function SuggestionPreview({ state, suggestion, onClose, onConfirm, busy, cmds }: {
  state: ProjectState; suggestion: TransferSuggestion; onClose: () => void;
  onConfirm: (suggestion: TransferSuggestion, target: SuggestionTarget) => Promise<void>; busy: boolean; cmds: Commands;
}) {
  const main = mainProduction(state);
  const scenes = main ? orderedOccurrences(state, main.id).filter((o) => o.active) : [];
  const originalBlock = typeof suggestion.payload["blockId"] === "string" ? state.blocks[suggestion.payload["blockId"]] : undefined;
  const [variantId, setVariant] = useState(() => originalBlock?.variantId ?? scenes.find((o) => o.sceneId === suggestion.payload["sceneId"])?.variantId ?? scenes[0]?.variantId ?? "");
  const [afterBlockId, setAfter] = useState<string | null>(null);
  const [assetId, setAsset] = useState(() => String(suggestion.payload["assetId"] ?? suggestion.payload["speakerAssetId"] ?? suggestion.payload["speaker"] ?? ""));
  const assets = Object.values(state.assets).filter((a) => !a.removed && (a.kind === "character" || a.kind === "animal"));
  const profileMode = suggestion.kind === "profile_change";
  const current = activeProfileOf(state, assetId)?.profile ?? emptyStoryProfile();
  const patch = suggestionProfilePatch(suggestion.payload);
  const proposed = patch ? mergeProfile(current, patch) : current;
  const fields = fieldDefs().filter((d) => getField(patch ?? {}, d) !== undefined && JSON.stringify(getField(proposed, d)) !== JSON.stringify(getField(current, d)));
  const [selected, setSelected] = useState<string[]>(fields.map(fieldId));
  useEffect(() => { setSelected(fields.map(fieldId)); }, [assetId, suggestion.id]);
  let profile: StoryProfile = current;
  for (const d of fields) if (selected.includes(fieldId(d))) profile = setField(profile, d, getField(proposed, d));
  const picked: TransferSuggestion = profileMode ? { ...suggestion, payload: { ...suggestion.payload, profile } } : suggestion;
  const target: SuggestionTarget = profileMode ? { assetId } : { productionId: main?.id ?? "", variantId, afterBlockId };
  const plan = suggestionToCommands(state, picked, target);
  const blocks = blocksOfVariant(state, variantId);
  const occurrence = scenes.find((o) => o.variantId === variantId);
  const insertion = suggestion.kind === "scene_draft" || (suggestion.kind === "line" && !suggestion.payload["blockId"]);
  const control = "w-full rounded-sm border border-border-control bg-surface-3 p-2 text-sm";
  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}><DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto" data-testid="storylab-suggestion-preview"><DialogHeader><DialogTitle>{t("app-storylab-suggestion-preview.suggestion-preview.dialog-title.f1fa3956460e")}</DialogTitle></DialogHeader>
    <p className="break-all text-xs text-text-secondary">{t("app-storylab-suggestion-preview.suggestion-preview.p.7100f83a43f1", { value1: String(main?.name ?? "–"), value2: String(profileMode ? "–" : variantId) })}</p>
    {!profileMode && main && occurrence ? <ForkNotice state={state} productionId={main.id} occurrenceId={occurrence.id} run={cmds.run} /> : null}
    {profileMode ? <><label className="text-sm">{t("app-storylab-suggestion-preview.suggestion-preview.label.8eb0fa06d48b")}<select aria-label={t("app-storylab-suggestion-preview.suggestion-preview.aria-label.8eb0fa06d48b")} className={control} value={assetId} onChange={(e) => setAsset(e.target.value)}><option value="">{t("app-storylab-suggestion-preview.suggestion-preview.option.04d6a973f0e5")}</option>{assets.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
      {!patch ? <p role="alert" className="text-status-danger">{t("app-storylab-suggestion-preview.suggestion-preview.p.2e2222061ccf")}</p> : null}
      {fields.map((d) => <label key={fieldId(d)} className="flex gap-2 border-b border-border py-2 text-sm" data-field={fieldId(d)}><input type="checkbox" checked={selected.includes(fieldId(d))} onChange={(e) => setSelected((old) => e.target.checked ? [...old, fieldId(d)] : old.filter((id) => id !== fieldId(d)))} /><span><strong>{sectionLabel(d.section)} · {d.label}</strong><span className="block text-text-tertiary">{t("app-storylab-suggestion-preview.suggestion-preview.span.1e4f8cec4a31")}: {fieldText(getField(current, d), d, names(state))}</span><span className="block">{t("app-storylab-suggestion-preview.suggestion-preview.span.6420991aea23")}: {fieldText(getField(proposed, d), d, names(state))}</span></span></label>)}
    </> : <>
      <div className="space-y-3" data-testid="storylab-placement"><label className="block text-sm">{t("app-storylab-suggestion-preview.suggestion-preview.label.371904e59f22")}<select aria-label={t("app-storylab-suggestion-preview.suggestion-preview.aria-label.371904e59f22")} className={control} value={variantId} disabled={!!originalBlock} onChange={(e) => { setVariant(e.target.value); setAfter(null); }}>{scenes.map((o) => { const v = state.variants[o.variantId]; return <option key={o.id} value={o.variantId}>{v ? formatHeading(v.heading) : o.sceneId}</option>; })}</select></label>
      {insertion ? <><label className="block text-sm">{t("app-storylab-suggestion-preview.suggestion-preview.label.c1c7daf90d18")}<select aria-label={t("app-storylab-suggestion-preview.suggestion-preview.aria-label.fbd04bcff035")} className={control} value={afterBlockId ?? ""} onChange={(e) => setAfter(e.target.value || null)}><option value="">{t("app-storylab-suggestion-preview.suggestion-preview.option.73cc228e049b")}</option>{blocks.map((b) => <option key={b.id} value={b.id}>{t("app-storylab-suggestion-preview.suggestion-preview.option.1c2a1b885740", { text: String(b.text) })}</option>)}</select></label><div className="max-h-48 overflow-y-auto font-script text-sm">{blocks.map((b) => <ToolbarButton key={b.id} className="block h-auto w-full whitespace-pre-wrap text-left" active={afterBlockId === b.id} onClick={() => setAfter(b.id)}>{b.text}</ToolbarButton>)}</div></> : null}</div>
      {originalBlock ? <div className="space-y-2 font-script text-sm"><p className="text-text-tertiary">{originalBlock.text}</p><p>{suggestionText(suggestion)}</p><p data-testid="storylab-word-diff">{wordDiff(originalBlock.text, suggestionText(suggestion)).map((part, i) => part.op === "removed" ? <del key={i} className="bg-status-danger/15 text-status-danger">{part.text}</del> : part.op === "added" ? <ins key={i} className="bg-status-success/15 text-status-success">{part.text}</ins> : <span key={i}>{part.text}</span>)}</p></div> : <p className="whitespace-pre-wrap text-sm">{plan.ok ? plan.commands.map((c) => c.type === "InsertBlock" ? c.block.text : c.type === "AddAnnotations" ? c.annotations.map((a) => a.text).join("\n") : "").join("\n") : suggestionText(suggestion)}</p>}
    </>}
    {!plan.ok ? <p role="alert" className="text-sm text-status-danger">{plan.message}</p> : null}
    <div className="flex justify-end gap-2"><ToolbarButton disabled={busy} onClick={onClose}>{t("app-storylab-suggestion-preview.suggestion-preview.toolbar-button.cd4ce3ae256b")}</ToolbarButton><ToolbarButton variant="primary" data-testid="storylab-suggestion-confirm" disabled={busy || !plan.ok || (profileMode && (!patch || selected.length === 0))} onClick={() => void onConfirm(picked, target)}>{t("app-storylab-suggestion-preview.suggestion-preview.toolbar-button.3029bcbec23f")}</ToolbarButton></div>
  </DialogContent></Dialog>;
}