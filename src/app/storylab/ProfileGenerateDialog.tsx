/**
 * Story Lab (SL2): «Lag profil med AI …». Viser kostnad og modell, krever bekreftelse, og viser en
 * forhåndsvisning felt for felt mot dagens profil. Ingenting lagres før brukeren velger det.
 */
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { profileError, profileFromJson, profileGeneratorPrompt, type Asset, type ProjectState, type StoryProfile } from "@/core";
import { generateText } from "@/adapters/ai/text.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ToolbarButton } from "@/app/shell/workspace-chrome";
import { fieldDefs, fieldId, fieldText, getField, sectionLabel, setField } from "./profile-fields";
import { characterLines, names, usd, useTextEstimate } from "./storylab-data";
import { t } from "@/core/i18n/keyed";

const OUT_TOKENS = 4000;

export function ProfileGenerateDialog({
  state,
  projectId,
  asset,
  current,
  onClose,
  onApply,
}: {
  state: ProjectState;
  projectId: string;
  asset: Asset;
  current: StoryProfile;
  onClose: () => void;
  onApply: (p: StoryProfile) => void;
}) {
  const [description, setDescription] = useState(asset.description);
  const [useLines, setUseLines] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<{ profile: StoryProfile; fallback: boolean } | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const gen = useServerFn(generateText);
  const lines = useLines ? characterLines(state, asset) : [];
  const prompt = profileGeneratorPrompt({ name: asset.name, description, lines, language: "nb" });
  const est = useTextEstimate("storylab_profile", prompt.system.length + prompt.user.length, OUT_TOKENS);
  const defs = fieldDefs().filter((d) => d.type !== "beliefs");
  const nameMap = names(state);
  const diff = result
    ? defs.filter((d) => JSON.stringify(getField(result.profile, d) ?? null) !== JSON.stringify(getField(current, d) ?? null))
    : [];

  const run = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await gen({
        data: {
          projectId,
          task: "storylab_profile",
          json: true,
          system: prompt.system,
          messages: [{ role: "user", content: prompt.user }],
          maxTokens: OUT_TOKENS,
        },
      });
      if (!r.ok) return setErr(r.message);
      const p = profileFromJson(r.text);
      if (!p || profileError(p))
        return setErr(t("app-storylab-profile-generate-dialog.run.set-err.19a7fb7aefc2"));
      setResult({ profile: p, fallback: r.usedFallback });
      setPicked(new Set(defs.filter((d) => JSON.stringify(getField(p, d) ?? null) !== JSON.stringify(getField(current, d) ?? null)).map(fieldId)));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const apply = (ids: ReadonlySet<string>) => {
    if (!result) return;
    let p = current;
    for (const d of defs) if (ids.has(fieldId(d))) p = setField(p, d, getField(result.profile, d));
    onApply(p);
  };

  return (
    <Dialog open onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto" data-testid="storylab-generate-dialog">
        <DialogHeader>
          <DialogTitle>{t("app-storylab-profile-generate-dialog.profile-generate-dialog.dialog-title.e1b083b1e142", { name: String(asset.name) })}</DialogTitle>
        </DialogHeader>
        {!result ? (
          <div className="space-y-3 text-[13px]">
            <label className="block space-y-1">
              <span className="text-text-secondary">{t("app-storylab-profile-generate-dialog.profile-generate-dialog.span.2dbf8a97656f")}</span>
              <Textarea value={description} rows={4} onChange={(e) => setDescription(e.target.value)} data-testid="storylab-generate-description" />
            </label>
            <label className="flex items-center gap-2 text-text-secondary">
              <input type="checkbox" checked={useLines} onChange={(e) => setUseLines(e.target.checked)} />
              {t("app-storylab-profile-generate-dialog.profile-generate-dialog.label.c806ceef36b3")}
              <span className="text-text-tertiary">({lines.length})</span>
            </label>
            <p className="text-text-secondary" data-testid="storylab-generate-cost">
              {est.loading
                ? t("app-storylab-profile-generate-dialog.profile-generate-dialog.p.235555e39a1d")
                : est.error
                  ? est.error
                  : t("app-storylab-profile-generate-dialog.profile-generate-dialog.p.57eda6a2a24c", { label: String(est.label), value2: String(usd(est.usd)) })}
            </p>
            {err ? (
              <p role="alert" className="text-status-danger">
                {err}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <ToolbarButton onClick={onClose}>{t("app-storylab-profile-generate-dialog.profile-generate-dialog.toolbar-button.d0b0d7869cfe")}</ToolbarButton>
              <ToolbarButton variant="primary" disabled={busy || !!est.error} onClick={run} data-testid="storylab-generate-run">
                {busy ? <Loader2 className="animate-spin" /> : null}
                {err ? t("app-storylab-profile-generate-dialog.profile-generate-dialog.toolbar-button.76624667f53e") : t("app-storylab-profile-generate-dialog.profile-generate-dialog.toolbar-button.6ef5205c3c64")}
              </ToolbarButton>
            </div>
          </div>
        ) : (
          <div className="space-y-3 text-[13px]" data-testid="storylab-generate-preview">
            {result.fallback ? (
              <p className="text-[12px] text-text-tertiary" data-testid="storylab-fallback-note">
                {t("app-storylab-profile-generate-dialog.profile-generate-dialog.p.da99a53ebce0")}
              </p>
            ) : null}
            {diff.length === 0 ? (
              <p className="text-text-tertiary">{t("app-storylab-profile-generate-dialog.profile-generate-dialog.p.cdbcddd92bee")}</p>
            ) : null}
            <ul className="space-y-2">
              {diff.map((d) => (
                <li key={fieldId(d)} className="rounded-sm border border-border p-2" data-testid="storylab-generate-field" data-field={fieldId(d)}>
                  <label className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={picked.has(fieldId(d))}
                      onChange={(e) => {
                        const n = new Set(picked);
                        if (e.target.checked) n.add(fieldId(d));
                        else n.delete(fieldId(d));
                        setPicked(n);
                      }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-text-primary">
                        {sectionLabel(d.section)} · {d.label}
                      </span>
                      <span className="block text-[12px] text-text-tertiary">
                        {t("app-storylab-profile-generate-dialog.profile-generate-dialog.span.f72125fb9cce")}: {fieldText(getField(current, d), d, nameMap)}
                      </span>
                      <span className="block text-[12px] text-text-secondary">
                        {t("app-storylab-profile-generate-dialog.profile-generate-dialog.span.272b10ae4f92")}: {fieldText(getField(result.profile, d), d, nameMap)}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap justify-end gap-2">
              <ToolbarButton onClick={onClose} data-testid="storylab-discard">
                {t("app-storylab-profile-generate-dialog.profile-generate-dialog.toolbar-button.96e30b9e19af")}
              </ToolbarButton>
              <ToolbarButton onClick={() => apply(picked)} disabled={!picked.size} data-testid="storylab-apply">
                {t("app-storylab-profile-generate-dialog.profile-generate-dialog.toolbar-button.d78e27530f35")}
              </ToolbarButton>
              <ToolbarButton variant="primary" onClick={() => apply(new Set(diff.map(fieldId)))} data-testid="storylab-apply-all">
                {t("app-storylab-profile-generate-dialog.profile-generate-dialog.toolbar-button.174fab255592")}
              </ToolbarButton>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
