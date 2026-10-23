/**
 * CA7 (§45–§53, §68–§70) og CA8 (§103–§106): karakterens oppsett for laget i denne scenen.
 * - Karakteratferd (blink, pust, tics) arves fra karakterens standard; lokale overstyringer vises tydelig.
 * - «Brukes i N andre scener» med liste og hopp; «bare her» / «oppdater alle» – ingenting oppdateres automatisk.
 * - Versjonshistorikk med sammenligning og «gjenopprett som ny versjon». Ingenting slettes.
 * - Globalt bibliotek: publiser som låst versjon, eller ta inn en nyere versjon etter bekreftelse.
 * - Eksportvalg per lag: hva som tas med, og innbrent eller eget lag.
 * All skriving går gjennom kommandoene.
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { UserRound, History, Globe, RotateCcw, ArrowRight } from "lucide-react";
import { newId, type ProjectState } from "@/core";
import type { Command } from "@/core/commands/types";
import type { AnimationUse, CharacterBehavior, ExportFlags } from "@/core/animation/rig";
import {
  INHERITED_KEYS,
  clearOverride,
  compareRigSpecs,
  effectiveBehavior,
  exportFlagsOf,
  otherUsages,
  planAdopt,
  restoreRigVersion,
  rigHistory,
  saveCharacterDefault,
  type InheritedKey,
} from "@/core/animation/character";
import { globalRigUpdate, planImportGlobalRig, toGlobalRig, type GlobalAnimationSpec } from "@/core/animation/global-rig";
import { listGlobalAnimationSpecs, publishGlobalAnimation } from "@/adapters/browser/global-library";
import { useGlobalBundles, useProjectWorkspace } from "@/app/global/use-global";
import { useSchemaAtLeast } from "@/app/shell/use-schema";
import { IconButton } from "@/app/shell/workspace-chrome";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { t } from "@/core/i18n/keyed";

export const GLOBAL_ANIMATION_SCHEMA = 57;

const KEY_LABEL: Record<InheritedKey, () => string> = {
  blinkEnabled: () => t("app-scene-editor-animation-character-panel.blink-enabled.blink-enabled.2daa85b654f6"),
  leftEyePatternId: () => t("app-scene-editor-animation-character-panel.left-eye-pattern-id.left-eye-pattern-id.edffcd47c69e"),
  rightEyePatternId: () => t("app-scene-editor-animation-character-panel.right-eye-pattern-id.right-eye-pattern-id.15dd3c5beb7c"),
  overlayPatternIds: () => t("app-scene-editor-animation-character-panel.overlay-pattern-ids.overlay-pattern-ids.4dea99ddcc0f"),
  breath: () => t("app-scene-editor-animation-character-panel.breath.breath.afaca1195431"),
};

const EXPORT_KEYS: { key: keyof Omit<ExportFlags, "mode">; label: () => string }[] = [
  { key: "mouth", label: () => t("app-scene-editor-animation-character-panel.label.label.a7805adf1fab") },
  { key: "blink", label: () => t("app-scene-editor-animation-character-panel.label.label.b5c5fb351242") },
  { key: "overlay", label: () => t("app-scene-editor-animation-character-panel.label.label.2e68fbe31ef8") },
  { key: "masks", label: () => t("app-scene-editor-animation-character-panel.label.label.0d7ccab6ea01") },
  { key: "adjust", label: () => t("app-scene-editor-animation-character-panel.label.label.c4c19160f6e3") },
];

export function CharacterPanel({ state, use, editable, run, runGroup, onJump }: {
  state: ProjectState;
  use: AnimationUse;
  editable: boolean;
  run: (c: Command, label: string) => string | null;
  runGroup: (commands: readonly Command[], label: string) => Promise<string | null>;
  onJump: (occurrenceId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [adoptVersion, setAdoptVersion] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [compare, setCompare] = useState<string | null>(null);
  const [confirmUpdate, setConfirmUpdate] = useState<GlobalAnimationSpec | null>(null);
  const version = state.animationRigVersions[use.rigVersionId];
  const rig = version ? state.animationRigs[version.rigId] : undefined;
  const asset = rig ? state.assets[state.assetVariants[rig.variantId]?.assetId ?? ""] : undefined;
  const eff = effectiveBehavior(state, use);
  const others = rig ? otherUsages(state, rig.id, use.id) : [];
  const flags = exportFlagsOf(use);
  const local = use.behavior ?? {};
  const history = rig ? rigHistory(state, rig.id) : [];

  // Globalt bibliotek (bare når prosjektet er koblet til en arbeidsgruppe og migrasjon 0057 er kjørt)
  const ws = useProjectWorkspace(state.project.id);
  const globalReady = useSchemaAtLeast(GLOBAL_ANIMATION_SCHEMA) && !!ws.workspaceId && ws.rights.use;
  const bundles = useGlobalBundles(ws.workspaceId, globalReady && open);
  const qc = useQueryClient();
  const specsKey = ["global-animation-specs", ws.workspaceId] as const;
  const specs = useQuery({ queryKey: specsKey, queryFn: () => listGlobalAnimationSpecs(ws.workspaceId!), enabled: globalReady && open });
  const bundle = useMemo(() => {
    if (!asset || !bundles.data) return null;
    if (asset.globalAssetId) return bundles.data.find((b) => b.asset.id === asset.globalAssetId) ?? null;
    const source = version ? state.assetVersions[version.sourceVersionId] : undefined;
    return bundles.data.find((b) => b.versions.some((g) => g.sha256 === source?.sha256)) ?? null;
  }, [asset, bundles.data, version, state.assetVersions]);
  const update = rig && specs.data ? globalRigUpdate(state, rig.id, specs.data) : null;

  const save = (behavior: AnimationUse["behavior"], label: string) => {
    setError(run({ type: "SetAnimationBehavior", useId: use.id, behavior: behavior ?? {} }, label));
  };
  const setLocal = (key: InheritedKey, value: unknown, label: string) => save({ ...local, [key]: value }, label);

  const saveAsDefault = () => {
    if (!rig) return;
    const behavior: CharacterBehavior = Object.fromEntries(
      INHERITED_KEYS.filter((k) => eff.behavior[k] !== undefined).map((k) => [k, eff.behavior[k]]),
    );
    const id = newId();
    const c = saveCharacterDefault(state, rig.id, id, behavior);
    if (!c) return;
    const failure = run(c, t("app-scene-editor-animation-character-panel.failure.run.a04da6a94024"));
    setError(failure);
    if (!failure) setAdoptVersion(id);
  };

  const adopt = (scope: "here" | "all") => {
    if (!rig || !adoptVersion) return;
    const c = planAdopt(state, rig.id, adoptVersion, scope, use.id);
    setAdoptVersion(null);
    if (!c) return;
    setError(run(c, scope === "all" ? t("app-scene-editor-animation-character-panel.adopt.run.9607c04518ae") : t("app-scene-editor-animation-character-panel.adopt.run.4af52f31a362")));
  };

  const publish = async () => {
    if (!version || !bundle) return;
    const r = toGlobalRig(state, version.id, bundle);
    if (!r.ok) { setError(r.error); return; }
    try {
      await publishGlobalAnimation(r.value.variantId, r.value.rig, r.value.patterns, "");
      void qc.invalidateQueries({ queryKey: specsKey });
      setStatus(t("app-scene-editor-animation-character-panel.publish.set-status.208e5f6005e8"));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const takeUpdate = async (spec: GlobalAnimationSpec) => {
    setConfirmUpdate(null);
    if (!bundle || !asset) return;
    const plan = planImportGlobalRig(state, spec, bundle, asset.id, {
      rigId: newId(),
      versionId: newId(),
      patternIds: Object.fromEntries(spec.patterns.map((p) => [p.key, newId()])),
    });
    if (!plan.ok) { setError(plan.error); return; }
    const failure = await runGroup(plan.value.commands, t("app-scene-editor-animation-character-panel.failure.run-group.197d816253f1", { number: String(spec.number) }));
    setError(failure);
    if (!failure) setAdoptVersion(plan.value.versionId);
  };

  const compared = compare && version ? state.animationRigVersions[compare] : undefined;
  const diffs = compared && version ? compareRigSpecs(compared.spec, version.spec) : [];

  return <>
    <IconButton data-testid="ca7-character-open" label={t("app-scene-editor-animation-character-panel.character-panel.label.eed8daa61f59")} onClick={() => setOpen(true)}><UserRound /></IconButton>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent uiId="V-108" className="max-w-lg" data-testid="ca7-character-dialog">
        <DialogHeader>
          <DialogTitle>{asset?.name ?? t("app-scene-editor-animation-character-panel.character-panel.dialog-title.d619c69eb483")}</DialogTitle>
          <DialogDescription>
            {t("app-scene-editor-animation-character-panel.character-panel.dialog-description.dddaca13d08a", { value1: String(version?.number ?? "–") })}
            {version?.spec.origin ? ` ${t("app-scene-editor-animation-character-panel.character-panel.dialog-description.2a94787ad27e", { globalNumber: String(version.spec.origin.globalNumber) })}` : ""}
          </DialogDescription>
        </DialogHeader>

        <section aria-label={t("app-scene-editor-animation-character-panel.character-panel.aria-label.3087059d25aa")} className="space-y-1">
          <h3 className="text-[11px] uppercase tracking-wider text-text-tertiary">{t("app-scene-editor-animation-character-panel.character-panel.h3.3087059d25aa")}</h3>
          {INHERITED_KEYS.map((k) => {
            const overridden = eff.overridden.includes(k);
            const value = eff.behavior[k];
            return <div key={k} data-testid={`ca7-behavior-${k}`} data-source={overridden ? "local" : eff.inherited.includes(k) ? "character" : "default"} className="flex items-center gap-2 text-xs">
              <span className="w-36 text-text-secondary">{KEY_LABEL[k]()}</span>
              <span className="flex-1 truncate text-text-primary">{describe(state, k, value)}</span>
              {overridden
                ? <span className="rounded-sm border border-accent-brand px-1 text-[11px] text-accent-brand">{t("app-scene-editor-animation-character-panel.character-panel.span.48c6b04d112d")}</span>
                : <span className="text-[11px] text-text-tertiary">{eff.inherited.includes(k) ? t("app-scene-editor-animation-character-panel.character-panel.span.21b1f9ae33c7") : t("app-scene-editor-animation-character-panel.character-panel.span.1b0a3286c59e")}</span>}
              {overridden ? <IconButton data-testid={`ca7-clear-${k}`} label={t("app-scene-editor-animation-character-panel.character-panel.label.71d5d7516922")} disabled={!editable}
                onClick={() => save(clearOverride(use, k), t("app-scene-editor-animation-character-panel.character-panel.save.2016c75a718e"))}><RotateCcw /></IconButton> : null}
            </div>;
          })}
          <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
            <label className="flex items-center gap-1 text-text-secondary">
              <input type="checkbox" data-testid="ca7-breath" checked={eff.behavior.breath?.enabled ?? false} disabled={!editable}
                onChange={(e) => setLocal("breath", { periodMs: eff.behavior.breath?.periodMs ?? 4000, amount: eff.behavior.breath?.amount ?? 0.01, enabled: e.target.checked }, t("app-scene-editor-animation-character-panel.character-panel.set-local.8dd95c28ebcf"))} />
              {t("app-scene-editor-animation-character-panel.character-panel.label.013cfcfa809e")}
            </label>
            <Button size="sm" variant="outline" data-testid="ca7-save-default" disabled={!editable || !rig} onClick={saveAsDefault}>
              {t("app-scene-editor-animation-character-panel.character-panel.button.0b08b2b6c780")}
            </Button>
          </div>
        </section>

        <section aria-label={t("app-scene-editor-animation-character-panel.character-panel.aria-label.dbf6354b6e68")} className="space-y-1">
          <h3 data-testid="ca7-other-count" className="text-[11px] uppercase tracking-wider text-text-tertiary">
            {t("app-scene-editor-animation-character-panel.used-in-others", { count: others.length })}
          </h3>
          <ul className="max-h-32 space-y-0.5 overflow-auto">
            {others.map((u) => <li key={u.use.id} className="flex items-center gap-2 text-xs text-text-secondary">
              <span className="flex-1 truncate">{u.label}</span>
              <span className="text-[11px] text-text-tertiary">{t("app-scene-editor-animation-character-panel.character-panel.span.a429648adb05", { versionNumber: String(u.versionNumber) })}</span>
              <IconButton data-testid={`ca7-jump-${u.occurrenceId}`} label={t("app-scene-editor-animation-character-panel.character-panel.label.0169ea9b5869")} onClick={() => { setOpen(false); onJump(u.occurrenceId); }}><ArrowRight /></IconButton>
            </li>)}
          </ul>
        </section>

        <section aria-label={t("app-scene-editor-animation-character-panel.character-panel.aria-label.58da4653133f")} className="space-y-1">
          <h3 className="text-[11px] uppercase tracking-wider text-text-tertiary">{t("app-scene-editor-animation-character-panel.character-panel.h3.3c97b1aae0f7")}</h3>
          <div className="flex flex-wrap gap-3 text-xs text-text-secondary">
            {EXPORT_KEYS.map(({ key, label }) => <label key={key} className="flex items-center gap-1">
              <input type="checkbox" data-testid={`ca8-export-${key}`} checked={flags[key]} disabled={!editable}
                onChange={(e) => save({ ...local, export: { ...flags, [key]: e.target.checked } }, t("app-scene-editor-animation-character-panel.character-panel.save.acd6654f99d8"))} />
              {label()}
            </label>)}
          </div>
          <label className="flex items-center gap-2 text-xs text-text-secondary">
            {t("app-scene-editor-animation-character-panel.character-panel.label.2c77808fe3e6")}
            <select data-testid="ca8-export-mode" value={flags.mode} disabled={!editable}
              onChange={(e) => save({ ...local, export: { ...flags, mode: e.target.value as ExportFlags["mode"] } }, t("app-scene-editor-animation-character-panel.character-panel.save.acd6654f99d8.2"))}
              className="h-7 rounded-sm border border-border-control bg-surface-3 text-xs text-text-primary">
              <option value="burned">{t("app-scene-editor-animation-character-panel.character-panel.option.fec8002fb7a6")}</option>
              <option value="separate">{t("app-scene-editor-animation-character-panel.character-panel.option.9f7a5ba338a1")}</option>
            </select>
          </label>
          <p className="text-[11px] text-text-tertiary">{t("app-scene-editor-animation-character-panel.character-panel.p.dfe90d0dca2f")}</p>
        </section>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" data-testid="ca7-history-open" disabled={!rig} onClick={() => setHistoryOpen(true)}><History />{t("app-scene-editor-animation-character-panel.character-panel.button.f929f2f891d0")}</Button>
          {globalReady && ws.rights.publish && bundle ? <Button size="sm" variant="outline" data-testid="ca7-publish" disabled={!editable} onClick={() => void publish()}><Globe />{t("app-scene-editor-animation-character-panel.character-panel.button.cc90619f06ca")}</Button> : null}
          {globalReady && !bundle && bundles.isSuccess ? <span className="text-[11px] text-text-tertiary">{t("app-scene-editor-animation-character-panel.character-panel.span.edbff7a24f83")}</span> : null}
          {update ? <Button size="sm" data-testid="ca7-global-update" disabled={!editable} onClick={() => setConfirmUpdate(update)}>{t("app-scene-editor-animation-character-panel.character-panel.button.77e8da658eee", { number: String(update.number) })}</Button> : null}
        </div>
        <div aria-live="polite" className="min-h-4 text-[11px]">
          {error ? <p role="alert" className="text-status-danger">{error}</p> : status ? <p role="status" className="text-text-secondary">{status}</p> : null}
        </div>
      </DialogContent>
    </Dialog>

    <Dialog open={!!adoptVersion} onOpenChange={(o) => { if (!o) setAdoptVersion(null); }}>
      <DialogContent uiId="V-107" data-testid="ca7-adopt-dialog">
        <DialogHeader>
          <DialogTitle>{t("app-scene-editor-animation-character-panel.character-panel.dialog-title.f020d273f6b1")}</DialogTitle>
          <DialogDescription>
            {t("app-scene-editor-animation-character-panel.setup-used-in-others", { count: others.length })}
          </DialogDescription>
        </DialogHeader>
        <ul className="max-h-40 space-y-0.5 overflow-auto text-xs text-text-secondary">
          {others.map((u) => <li key={u.use.id} className="flex items-center gap-2"><span className="flex-1 truncate">{u.label}</span>
            <IconButton label={t("app-scene-editor-animation-character-panel.character-panel.label.0169ea9b5869.2")} onClick={() => { setAdoptVersion(null); setOpen(false); onJump(u.occurrenceId); }}><ArrowRight /></IconButton></li>)}
        </ul>
        <div className="flex justify-end gap-2">
          <Button variant="outline" data-testid="ca7-adopt-later" onClick={() => setAdoptVersion(null)}>{t("app-scene-editor-animation-character-panel.character-panel.button.543cda926f1a")}</Button>
          <Button variant="outline" data-testid="ca7-adopt-here" onClick={() => adopt("here")}>{t("app-scene-editor-animation-character-panel.character-panel.button.3f9796ef4f62")}</Button>
          <Button data-testid="ca7-adopt-all" onClick={() => adopt("all")}>{t("app-scene-editor-animation-character-panel.character-panel.button.57b24856e414")}</Button>
        </div>
      </DialogContent>
    </Dialog>

    <Dialog open={!!confirmUpdate} onOpenChange={(o) => { if (!o) setConfirmUpdate(null); }}>
      <DialogContent uiId="V-106" data-testid="ca7-update-confirm">
        <DialogHeader>
          <DialogTitle>{t("app-scene-editor-animation-character-panel.character-panel.dialog-title.9fa1106cc41a")}</DialogTitle>
          <DialogDescription>{t("app-scene-editor-animation-character-panel.character-panel.dialog-description.0b9693e44150")}</DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setConfirmUpdate(null)}>{t("app-scene-editor-animation-character-panel.character-panel.button.6e8059581c24")}</Button>
          <Button data-testid="ca7-update-yes" onClick={() => confirmUpdate && void takeUpdate(confirmUpdate)}>{t("app-scene-editor-animation-character-panel.character-panel.button.6cff81c3f6cf")}</Button>
        </div>
      </DialogContent>
    </Dialog>

    <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
      <DialogContent uiId="V-105" data-testid="ca7-history-dialog">
        <DialogHeader>
          <DialogTitle>{t("app-scene-editor-animation-character-panel.character-panel.dialog-title.8b27d48fe667")}</DialogTitle>
          <DialogDescription>{t("app-scene-editor-animation-character-panel.character-panel.dialog-description.24a44448d966")}</DialogDescription>
        </DialogHeader>
        <ul className="max-h-48 space-y-0.5 overflow-auto text-xs">
          {history.map((v) => <li key={v.id} className="flex items-center gap-2">
            <button type="button" data-testid={`ca7-history-${v.number}`} aria-pressed={compare === v.id} onClick={() => setCompare(v.id)}
              className={"flex-1 rounded-sm px-1 text-left hover:bg-surface-3 focus-visible:ring-2 focus-visible:ring-focus-ring " + (compare === v.id ? "bg-surface-3 text-text-primary" : "text-text-secondary")}>
              {t("app-scene-editor-animation-character-panel.character-panel.button.af7e5e7ba0fc", { number: String(v.number) })}{v.id === use.rigVersionId ? ` · ${t("app-scene-editor-animation-character-panel.character-panel.button.885d825bf6c1")}` : ""}{rig?.currentVersionId === v.id ? ` · ${t("app-scene-editor-animation-character-panel.character-panel.button.06a1b3bc48cf")}` : ""}{v.spec.origin ? ` · ${t("app-scene-editor-animation-character-panel.character-panel.button.bac324e0ec79", { globalNumber: String(v.spec.origin.globalNumber) })}` : ""}
            </button>
            <IconButton data-testid={`ca7-restore-${v.number}`} label={t("app-scene-editor-animation-character-panel.character-panel.label.f1cc77051bb8")} disabled={!editable || rig?.currentVersionId === v.id}
              onClick={() => {
                const id = newId();
                const c = restoreRigVersion(state, v.id, id);
                if (!c) return;
                const failure = run(c, t("app-scene-editor-animation-character-panel.failure.run.1553266fb7d3", { number: String(v.number) }));
                setError(failure);
                if (!failure) { setHistoryOpen(false); setAdoptVersion(id); }
              }}><RotateCcw /></IconButton>
          </li>)}
        </ul>
        {compared ? <div data-testid="ca7-compare" className="space-y-0.5 text-xs text-text-secondary">
          {diffs.length ? diffs.map((d, i) => <p key={i}>{diffLabel(d.kind)} {d.key}: {d.change === "added" ? t("app-scene-editor-animation-character-panel.character-panel.p.3a76cedbb0fd") : d.change === "removed" ? t("app-scene-editor-animation-character-panel.character-panel.p.f1250b4a708b") : t("app-scene-editor-animation-character-panel.character-panel.p.5acf0b07bd70")}</p>)
            : <p>{t("app-scene-editor-animation-character-panel.character-panel.p.103a82e0bfd6")}</p>}
        </div> : null}
      </DialogContent>
    </Dialog>
  </>;
}

function diffLabel(kind: string): string {
  return kind === "anchor" ? t("app-scene-editor-animation-character-panel.diff-label.message.7f1caad8a9c5") : kind === "part" ? t("app-scene-editor-animation-character-panel.diff-label.message.ddaf131f8546") : kind === "behavior" ? t("app-scene-editor-animation-character-panel.diff-label.message.f66bcd3335b8") : t("app-scene-editor-animation-character-panel.diff-label.message.880787ef2b60");
}

function describe(state: ProjectState, key: InheritedKey, value: unknown): string {
  if (value === undefined) return "—";
  if (key === "blinkEnabled") return value === false ? t("app-scene-editor-animation-character-panel.describe.message.f792226caa2a") : t("app-scene-editor-animation-character-panel.describe.message.b75355c367f8");
  if (key === "breath") {
    const b = value as CharacterBehavior["breath"];
    return b?.enabled ? t("app-scene-editor-animation-character-panel.describe.message.284e550f484e", { value1: String(Math.round((b.periodMs / 1000) * 10) / 10) }) : t("app-scene-editor-animation-character-panel.describe.message.f792226caa2a.2");
  }
  if (key === "overlayPatternIds") return ((value as string[]) ?? []).map((id) => state.animationPatterns[id]?.name ?? "?").join(", ") || "—";
  return value ? (state.animationPatterns[value as string]?.name ?? "?") : t("app-scene-editor-animation-character-panel.describe.message.5bd479996600");
}
