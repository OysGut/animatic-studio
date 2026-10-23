/**
 * ML3 (B-049): legg til, gi nytt navn til og fjern språkversjoner. Manusets eget språk er kilden (G-1). Å fjerne en
 * språkversjon sletter ingen oversettelser, og alt kan angres. Språk som bare finnes i eldre oversettelser,
 * vises og kan registreres; kollisjoner («en-us» / «en-US») vises og slås aldri sammen automatisk.
 */
import { ResizableDialogContent } from "@/app/shared/ResizableDialogContent";
import { useMemo, useState } from "react";
import {
  canonicalLanguageTag,
  languageLabel,
  languageTagError,
  normalizeLanguageTag,
  sourceLanguageOf,
  languageTagCollisions,
  newId,
  scriptLanguageOptions,
  translationStatus,
  type LanguageVersion,
  type ProjectState,
} from "@/core";
import { LanguageTagInput } from "@/app/shared/LanguageTagInput";
import type { Commands } from "@/app/project/use-commands";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { t } from "@/core/i18n/keyed";

export function LanguageVersionsDialog({
  open,
  onOpenChange,
  state,
  productionId,
  cmds,
  editable,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: ProjectState;
  productionId: string;
  cmds: Commands;
  editable: boolean;
}) {
  const [language, setLanguage] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  // G-1b: bytte av kildespråk krever bekreftelse; konflikter med eksisterende mål forklares
  const [sourceDraft, setSourceDraft] = useState<string | null>(null);
  const source = sourceLanguageOf(state);
  const sourceConflicts = useMemo(() => {
    if (sourceDraft === null) return 0;
    const tag = sourceDraft.trim();
    if (!tag || languageTagError(tag)) return 0;
    const low = normalizeLanguageTag(tag).toLowerCase();
    if (low === source.toLowerCase()) return 0;
    let n = 0;
    for (const v of Object.values(state.languageVersions ?? {})) if (!v.removed && v.language.toLowerCase() === low) n++;
    for (const v of Object.values(state.translations ?? {})) if (!v.removed && v.language.toLowerCase() === low) n++;
    for (const v of Object.values(state.translationLines ?? {})) if (!v.removed && v.language.toLowerCase() === low) n++;
    for (const v of Object.values(state.translationLineLinks ?? {})) if (!v.removed && v.language.toLowerCase() === low) n++;
    return n;
  }, [sourceDraft, source, state]);
  const [names, setNames] = useState<Record<string, string>>({});
  const options = useMemo(() => scriptLanguageOptions(state), [state]);
  const all = Object.values(state.languageVersions ?? {});
  const live = all.filter((v) => !v.removed).sort((a, b) => a.name.localeCompare(b.name));
  const removed = all.filter((v) => v.removed).sort((a, b) => a.name.localeCompare(b.name));
  const derived = options.filter((o) => o.derived);
  const collisions = useMemo(() => languageTagCollisions(options.map((o) => o.language)), [options]);

  const run = (command: Parameters<Commands["run"]>[0], label: string) => {
    const e = cmds.run(command, label);
    setError(e);
    return !e;
  };
  const add = (tag: string, label: string) => {
    const canonical = canonicalLanguageTag(tag) ?? tag.trim();
    const n = label.trim() || languageLabel(canonical);
    if (run({ type: "AddLanguageVersion", versionId: newId(), language: canonical, name: n }, t("ml3-language-versions.undo.add", { name: n }))) {
      setLanguage("");
      setName("");
    }
  };
  const status = (v: LanguageVersion) => {
    const s = translationStatus(state, productionId, v.language);
    return t("ml3-language-versions.label.status", { translated: String(s.translated), lines: String(s.lines), review: String(s.review), uncertain: String(s.uncertain) });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <ResizableDialogContent uiId="V-117" sizeKey="language-versions" data-testid="language-versions-dialog" className="max-h-[90vh] max-w-[640px] overflow-y-auto border-border bg-surface-2">
        <DialogHeader>
          <DialogTitle>{t("ml3-language-versions.dialog.title")}</DialogTitle>
          <DialogDescription>{t("ml3-language-versions.dialog.description", { language: languageLabel(sourceLanguageOf(state)) })}</DialogDescription>
        </DialogHeader>

        <section className="space-y-2" data-testid="source-language-section">
          <h3 className="text-xs font-medium text-text-secondary">{t("g1-source-language.field.label")}</h3>
          <p className="text-xs text-text-primary" data-testid="source-language-current">
            {t("g1-source-language.current", { language: `${languageLabel(source)}` })}
          </p>
          {editable && sourceDraft === null ? (
            <Button size="sm" variant="outline" data-testid="source-language-change-open" onClick={() => setSourceDraft(source)}>
              {t("g1-source-language.change.button")}
            </Button>
          ) : null}
          {sourceDraft !== null ? (
            <form
              className="flex flex-col gap-2 rounded-sm border border-status-caution p-2"
              onSubmit={(e) => {
                e.preventDefault();
                const tag = canonicalLanguageTag(sourceDraft.trim());
                if (!tag || sourceConflicts > 0) return;
                if (run({ type: "SetDialogueLanguage", target: "project", targetId: state.project.id, language: tag }, t("g1-source-language.change.undo", { language: languageLabel(tag) })))
                  setSourceDraft(null);
              }}
            >
              <p role="alert" className="text-xs text-status-caution" data-testid="source-language-warning">
                {t("g1-source-language.change.warning")}
              </p>
              <LanguageTagInput
                value={sourceDraft}
                onChange={setSourceDraft}
                label={t("g1-source-language.change.new-label")}
                testId="source-language-input"
              />
              {sourceConflicts > 0 ? (
                <p role="alert" className="text-xs text-status-danger" data-testid="source-language-conflict">
                  {t("g1-source-language.change.conflict", { language: normalizeLanguageTag(sourceDraft.trim()), count: String(sourceConflicts) })}
                </p>
              ) : null}
              <div className="flex gap-2">
                <Button
                  type="submit"
                  size="sm"
                  data-testid="source-language-change-confirm"
                  disabled={Boolean(languageTagError(sourceDraft.trim())) || sourceConflicts > 0 || normalizeLanguageTag(sourceDraft.trim()).toLowerCase() === source.toLowerCase()}
                >
                  {t("g1-source-language.change.confirm")}
                </Button>
                <Button type="button" size="sm" variant="ghost" data-testid="source-language-change-cancel" onClick={() => setSourceDraft(null)}>
                  {t("g1-source-language.change.cancel")}
                </Button>
              </div>
            </form>
          ) : null}
        </section>

        <section className="space-y-2">
          <h3 className="text-xs font-medium text-text-secondary">{t("ml3-language-versions.label.registered")}</h3>
          {live.length === 0 ? <p className="text-xs text-text-tertiary">{t("ml3-language-versions.empty")}</p> : null}
          {live.map((v) => (
            <div key={v.id} data-testid={`language-version-${v.language}`} className="flex flex-wrap items-center gap-2 rounded-sm border border-border p-2">
              <Input
                aria-label={t("ml3-language-versions.field.name")}
                data-testid={`language-version-name-${v.language}`}
                className="h-7 min-w-0 flex-1"
                value={names[v.id] ?? v.name}
                disabled={!editable}
                onChange={(e) => setNames({ ...names, [v.id]: e.target.value })}
              />
              <code className="text-xs text-text-tertiary">{v.language}</code>
              <Button
                size="sm"
                variant="outline"
                data-testid={`language-version-rename-${v.language}`}
                disabled={!editable || (names[v.id] ?? v.name).trim() === v.name}
                onClick={() => run({ type: "UpdateLanguageVersion", versionId: v.id, name: names[v.id] ?? v.name }, t("ml3-language-versions.undo.rename", { name: v.name }))}
              >
                {t("ml3-language-versions.button.rename")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                data-testid={`language-version-remove-${v.language}`}
                disabled={!editable}
                onClick={() => run({ type: "SetLanguageVersionRemoved", versionId: v.id, removed: true }, t("ml3-language-versions.undo.remove", { name: v.name }))}
              >
                {t("ml3-language-versions.button.remove")}
              </Button>
              <p className="w-full text-[11px] text-text-tertiary">{status(v)}</p>
            </div>
          ))}
        </section>

        {derived.length ? (
          <section className="space-y-2">
            <h3 className="text-xs font-medium text-text-secondary">{t("ml3-language-versions.label.derived")}</h3>
            {derived.map((o) => (
              <div key={o.key} className="flex items-center gap-2 text-xs text-text-primary">
                <span className="flex-1">{languageLabel(o.language)}</span>
                <Button size="sm" variant="outline" data-testid={`language-version-register-${o.language}`} disabled={!editable} onClick={() => add(o.language, "")}>
                  {t("ml3-language-versions.button.register")}
                </Button>
              </div>
            ))}
          </section>
        ) : null}

        {collisions.map((c) => (
          <p key={c.key} role="note" data-testid="language-version-collision" className="text-xs text-status-caution">
            {t("ml3-language-versions.label.collision", { tags: c.tags.join(", ") })}
          </p>
        ))}

        {editable ? (
          <form
            className="flex flex-wrap items-end gap-2 border-t border-border pt-3"
            onSubmit={(e) => {
              e.preventDefault();
              add(language, name);
            }}
          >
            <label className="flex flex-col gap-1 text-xs text-text-secondary">
              {t("ml3-language-versions.field.language")}
              <Input data-testid="language-version-new-language" className="h-7 w-36" value={language} placeholder={t("ml3-language-versions.field.language-hint")} onChange={(e) => setLanguage(e.target.value)} />
            </label>
            <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-text-secondary">
              {t("ml3-language-versions.field.name")}
              <Input data-testid="language-version-new-name" className="h-7" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <Button type="submit" size="sm" data-testid="language-version-add" disabled={!language.trim()}>
              {t("ml3-language-versions.button.add")}
            </Button>
          </form>
        ) : null}

        {removed.length ? (
          <section className="space-y-1">
            <h3 className="text-xs font-medium text-text-secondary">{t("ml3-language-versions.label.removed")}</h3>
            {removed.map((v) => (
              <div key={v.id} className="flex items-center gap-2 text-xs text-text-tertiary">
                <span className="flex-1">{v.name} ({v.language})</span>
                <Button size="sm" variant="ghost" data-testid={`language-version-restore-${v.language}`} disabled={!editable} onClick={() => run({ type: "SetLanguageVersionRemoved", versionId: v.id, removed: false }, t("ml3-language-versions.undo.restore", { name: v.name }))}>
                  {t("ml3-language-versions.button.restore")}
                </Button>
              </div>
            ))}
          </section>
        ) : null}

        {error ? <p role="alert" data-testid="language-version-error" className="text-xs text-status-danger">{error}</p> : null}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("ml3-language-versions.button.close")}
          </Button>
        </DialogFooter>
      </ResizableDialogContent>
    </Dialog>
  );
}
