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
import { L, newId, type ProjectState } from "@/core";
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

export const GLOBAL_ANIMATION_SCHEMA = 57;

const KEY_LABEL: Record<InheritedKey, () => string> = {
  blinkEnabled: () => L("Automatisk blinking", "Automatic blinking"),
  leftEyePatternId: () => L("Mønster venstre øye", "Left eye pattern"),
  rightEyePatternId: () => L("Mønster høyre øye", "Right eye pattern"),
  overlayPatternIds: () => L("Tics og overlegg", "Tics and overlays"),
  breath: () => L("Pust", "Breathing"),
};

const EXPORT_KEYS: { key: keyof Omit<ExportFlags, "mode">; label: () => string }[] = [
  { key: "mouth", label: () => L("Munnformer", "Mouth shapes") },
  { key: "blink", label: () => L("Blink", "Blinks") },
  { key: "overlay", label: () => L("Overlegg", "Overlays") },
  { key: "masks", label: () => L("Masker", "Masks") },
  { key: "adjust", label: () => L("Justeringer", "Adjustments") },
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
    const failure = run(c, L("Lagre karakterens standardatferd", "Save the character's default behavior"));
    setError(failure);
    if (!failure) setAdoptVersion(id);
  };

  const adopt = (scope: "here" | "all") => {
    if (!rig || !adoptVersion) return;
    const c = planAdopt(state, rig.id, adoptVersion, scope, use.id);
    setAdoptVersion(null);
    if (!c) return;
    setError(run(c, scope === "all" ? L("Oppdater alle scener", "Update all scenes") : L("Bruk ny versjon bare her", "Use the new version here only")));
  };

  const publish = async () => {
    if (!version || !bundle) return;
    const r = toGlobalRig(state, version.id, bundle);
    if (!r.ok) { setError(r.error); return; }
    try {
      await publishGlobalAnimation(r.value.variantId, r.value.rig, r.value.patterns, "");
      void qc.invalidateQueries({ queryKey: specsKey });
      setStatus(L("Oppsettet er publisert som ny låst versjon i det globale biblioteket.", "The setup was published as a new locked version in the global library."));
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
    const failure = await runGroup(plan.value.commands, L(`Ta inn global versjon ${spec.number}`, `Take in global version ${spec.number}`));
    setError(failure);
    if (!failure) setAdoptVersion(plan.value.versionId);
  };

  const compared = compare && version ? state.animationRigVersions[compare] : undefined;
  const diffs = compared && version ? compareRigSpecs(compared.spec, version.spec) : [];

  return <>
    <IconButton data-testid="ca7-character-open" label={L("Karakter: atferd, versjoner og eksport", "Character: behavior, versions and export")} onClick={() => setOpen(true)}><UserRound /></IconButton>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-lg" data-testid="ca7-character-dialog">
        <DialogHeader>
          <DialogTitle>{asset?.name ?? L("Karakter", "Character")}</DialogTitle>
          <DialogDescription>
            {L(`Oppsett versjon ${version?.number ?? "–"} i denne scenen.`, `Setup version ${version?.number ?? "–"} in this scene.`)}
            {version?.spec.origin ? ` ${L(`Fra global versjon ${version.spec.origin.globalNumber} (låst).`, `From global version ${version.spec.origin.globalNumber} (locked).`)}` : ""}
          </DialogDescription>
        </DialogHeader>

        <section aria-label={L("Karakteratferd", "Character behavior")} className="space-y-1">
          <h3 className="text-[11px] uppercase tracking-wider text-text-tertiary">{L("Karakteratferd", "Character behavior")}</h3>
          {INHERITED_KEYS.map((k) => {
            const overridden = eff.overridden.includes(k);
            const value = eff.behavior[k];
            return <div key={k} data-testid={`ca7-behavior-${k}`} data-source={overridden ? "local" : eff.inherited.includes(k) ? "character" : "default"} className="flex items-center gap-2 text-xs">
              <span className="w-36 text-text-secondary">{KEY_LABEL[k]()}</span>
              <span className="flex-1 truncate text-text-primary">{describe(state, k, value)}</span>
              {overridden
                ? <span className="rounded-sm border border-accent-brand px-1 text-[11px] text-accent-brand">{L("Lokal overstyring", "Local override")}</span>
                : <span className="text-[11px] text-text-tertiary">{eff.inherited.includes(k) ? L("Arvet fra karakteren", "Inherited from the character") : L("Standard", "Default")}</span>}
              {overridden ? <IconButton data-testid={`ca7-clear-${k}`} label={L("Bruk karakterens standard", "Use the character's default")} disabled={!editable}
                onClick={() => save(clearOverride(use, k), L("Fjern lokal overstyring", "Remove local override"))}><RotateCcw /></IconButton> : null}
            </div>;
          })}
          <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
            <label className="flex items-center gap-1 text-text-secondary">
              <input type="checkbox" data-testid="ca7-breath" checked={eff.behavior.breath?.enabled ?? false} disabled={!editable}
                onChange={(e) => setLocal("breath", { periodMs: eff.behavior.breath?.periodMs ?? 4000, amount: eff.behavior.breath?.amount ?? 0.01, enabled: e.target.checked }, L("Endre pust", "Change breathing"))} />
              {L("Pust i denne scenen", "Breathing in this scene")}
            </label>
            <Button size="sm" variant="outline" data-testid="ca7-save-default" disabled={!editable || !rig} onClick={saveAsDefault}>
              {L("Lagre som karakterens standard", "Save as the character's default")}
            </Button>
          </div>
        </section>

        <section aria-label={L("Bruk i andre scener", "Use in other scenes")} className="space-y-1">
          <h3 data-testid="ca7-other-count" className="text-[11px] uppercase tracking-wider text-text-tertiary">
            {L(`Brukes i ${others.length} ${others.length === 1 ? "annen scene" : "andre scener"}`, `Used in ${others.length} other ${others.length === 1 ? "scene" : "scenes"}`)}
          </h3>
          <ul className="max-h-32 space-y-0.5 overflow-auto">
            {others.map((u) => <li key={u.use.id} className="flex items-center gap-2 text-xs text-text-secondary">
              <span className="flex-1 truncate">{u.label}</span>
              <span className="text-[11px] text-text-tertiary">{L(`versjon ${u.versionNumber}`, `version ${u.versionNumber}`)}</span>
              <IconButton data-testid={`ca7-jump-${u.occurrenceId}`} label={L("Gå til scenen", "Go to the scene")} onClick={() => { setOpen(false); onJump(u.occurrenceId); }}><ArrowRight /></IconButton>
            </li>)}
          </ul>
        </section>

        <section aria-label={L("Eksportvalg", "Export options")} className="space-y-1">
          <h3 className="text-[11px] uppercase tracking-wider text-text-tertiary">{L("Eksportvalg for laget", "Export options for the layer")}</h3>
          <div className="flex flex-wrap gap-3 text-xs text-text-secondary">
            {EXPORT_KEYS.map(({ key, label }) => <label key={key} className="flex items-center gap-1">
              <input type="checkbox" data-testid={`ca8-export-${key}`} checked={flags[key]} disabled={!editable}
                onChange={(e) => save({ ...local, export: { ...flags, [key]: e.target.checked } }, L("Endre eksportvalg", "Change export options"))} />
              {label()}
            </label>)}
          </div>
          <label className="flex items-center gap-2 text-xs text-text-secondary">
            {L("Karakterdelene", "The character parts")}
            <select data-testid="ca8-export-mode" value={flags.mode} disabled={!editable}
              onChange={(e) => save({ ...local, export: { ...flags, mode: e.target.value as ExportFlags["mode"] } }, L("Endre eksportvalg", "Change export options"))}
              className="h-7 rounded-sm border border-border-control bg-surface-3 text-xs text-text-primary">
              <option value="burned">{L("Brennes inn i bildet", "Burned into the image")}</option>
              <option value="separate">{L("Eget lag (egen fil)", "Separate layer (own file)")}</option>
            </select>
          </label>
          <p className="text-[11px] text-text-tertiary">{L("Valgene gjelder både forhåndsvisningen og eksporten. Ingenting slettes.", "The choices apply to both preview and export. Nothing is deleted.")}</p>
        </section>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" data-testid="ca7-history-open" disabled={!rig} onClick={() => setHistoryOpen(true)}><History />{L("Versjonshistorikk", "Version history")}</Button>
          {globalReady && ws.rights.publish && bundle ? <Button size="sm" variant="outline" data-testid="ca7-publish" disabled={!editable} onClick={() => void publish()}><Globe />{L("Publiser til globalt bibliotek", "Publish to global library")}</Button> : null}
          {globalReady && !bundle && bundles.isSuccess ? <span className="text-[11px] text-text-tertiary">{L("Lagre ressursen i det globale biblioteket for å dele oppsettet.", "Save the asset in the global library to share the setup.")}</span> : null}
          {update ? <Button size="sm" data-testid="ca7-global-update" disabled={!editable} onClick={() => setConfirmUpdate(update)}>{L(`Ny global versjon ${update.number} …`, `New global version ${update.number} …`)}</Button> : null}
        </div>
        <div aria-live="polite" className="min-h-4 text-[11px]">
          {error ? <p role="alert" className="text-status-danger">{error}</p> : status ? <p role="status" className="text-text-secondary">{status}</p> : null}
        </div>
      </DialogContent>
    </Dialog>

    <Dialog open={!!adoptVersion} onOpenChange={(o) => { if (!o) setAdoptVersion(null); }}>
      <DialogContent data-testid="ca7-adopt-dialog">
        <DialogHeader>
          <DialogTitle>{L("Hvor skal den nye versjonen brukes?", "Where should the new version be used?")}</DialogTitle>
          <DialogDescription>
            {L(`Oppsettet brukes i ${others.length} ${others.length === 1 ? "annen scene" : "andre scener"}. Ingenting oppdateres automatisk.`, `The setup is used in ${others.length} other ${others.length === 1 ? "scene" : "scenes"}. Nothing updates automatically.`)}
          </DialogDescription>
        </DialogHeader>
        <ul className="max-h-40 space-y-0.5 overflow-auto text-xs text-text-secondary">
          {others.map((u) => <li key={u.use.id} className="flex items-center gap-2"><span className="flex-1 truncate">{u.label}</span>
            <IconButton label={L("Gå til scenen", "Go to the scene")} onClick={() => { setAdoptVersion(null); setOpen(false); onJump(u.occurrenceId); }}><ArrowRight /></IconButton></li>)}
        </ul>
        <div className="flex justify-end gap-2">
          <Button variant="outline" data-testid="ca7-adopt-later" onClick={() => setAdoptVersion(null)}>{L("Ikke nå", "Not now")}</Button>
          <Button variant="outline" data-testid="ca7-adopt-here" onClick={() => adopt("here")}>{L("Bare her", "Here only")}</Button>
          <Button data-testid="ca7-adopt-all" onClick={() => adopt("all")}>{L("Oppdater alle", "Update all")}</Button>
        </div>
      </DialogContent>
    </Dialog>

    <Dialog open={!!confirmUpdate} onOpenChange={(o) => { if (!o) setConfirmUpdate(null); }}>
      <DialogContent data-testid="ca7-update-confirm">
        <DialogHeader>
          <DialogTitle>{L("Ta inn ny global versjon?", "Take in the new global version?")}</DialogTitle>
          <DialogDescription>{L("Oppsettet kopieres inn som en ny versjon i prosjektet. Scenene beholder versjonen sin til du velger noe annet.", "The setup is copied in as a new version in the project. The scenes keep their version until you choose otherwise.")}</DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setConfirmUpdate(null)}>{L("Avbryt", "Cancel")}</Button>
          <Button data-testid="ca7-update-yes" onClick={() => confirmUpdate && void takeUpdate(confirmUpdate)}>{L("Ta inn", "Take in")}</Button>
        </div>
      </DialogContent>
    </Dialog>

    <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
      <DialogContent data-testid="ca7-history-dialog">
        <DialogHeader>
          <DialogTitle>{L("Versjonshistorikk for oppsettet", "Version history for the setup")}</DialogTitle>
          <DialogDescription>{L("Velg en versjon for å sammenligne med denne scenens versjon. Gjenoppretting lager en ny versjon; ingenting slettes.", "Choose a version to compare with this scene's version. Restoring makes a new version; nothing is deleted.")}</DialogDescription>
        </DialogHeader>
        <ul className="max-h-48 space-y-0.5 overflow-auto text-xs">
          {history.map((v) => <li key={v.id} className="flex items-center gap-2">
            <button type="button" data-testid={`ca7-history-${v.number}`} aria-pressed={compare === v.id} onClick={() => setCompare(v.id)}
              className={"flex-1 rounded-sm px-1 text-left hover:bg-surface-3 focus-visible:ring-2 focus-visible:ring-focus-ring " + (compare === v.id ? "bg-surface-3 text-text-primary" : "text-text-secondary")}>
              {L(`Versjon ${v.number}`, `Version ${v.number}`)}{v.id === use.rigVersionId ? ` · ${L("denne scenen", "this scene")}` : ""}{rig?.currentVersionId === v.id ? ` · ${L("nyeste", "latest")}` : ""}{v.spec.origin ? ` · ${L(`global ${v.spec.origin.globalNumber}`, `global ${v.spec.origin.globalNumber}`)}` : ""}
            </button>
            <IconButton data-testid={`ca7-restore-${v.number}`} label={L("Gjenopprett som ny versjon", "Restore as a new version")} disabled={!editable || rig?.currentVersionId === v.id}
              onClick={() => {
                const id = newId();
                const c = restoreRigVersion(state, v.id, id);
                if (!c) return;
                const failure = run(c, L(`Gjenopprett versjon ${v.number}`, `Restore version ${v.number}`));
                setError(failure);
                if (!failure) { setHistoryOpen(false); setAdoptVersion(id); }
              }}><RotateCcw /></IconButton>
          </li>)}
        </ul>
        {compared ? <div data-testid="ca7-compare" className="space-y-0.5 text-xs text-text-secondary">
          {diffs.length ? diffs.map((d, i) => <p key={i}>{diffLabel(d.kind)} {d.key}: {d.change === "added" ? L("lagt til", "added") : d.change === "removed" ? L("fjernet", "removed") : L("endret", "changed")}</p>)
            : <p>{L("Ingen forskjeller.", "No differences.")}</p>}
        </div> : null}
      </DialogContent>
    </Dialog>
  </>;
}

function diffLabel(kind: string): string {
  return kind === "anchor" ? L("Ankerpunkt", "Anchor") : kind === "part" ? L("Del", "Part") : kind === "behavior" ? L("Atferd", "Behavior") : L("Opprinnelse", "Origin");
}

function describe(state: ProjectState, key: InheritedKey, value: unknown): string {
  if (value === undefined) return "—";
  if (key === "blinkEnabled") return value === false ? L("Av", "Off") : L("På", "On");
  if (key === "breath") {
    const b = value as CharacterBehavior["breath"];
    return b?.enabled ? L(`På · ${Math.round((b.periodMs / 1000) * 10) / 10} s`, `On · ${Math.round((b.periodMs / 1000) * 10) / 10} s`) : L("Av", "Off");
  }
  if (key === "overlayPatternIds") return ((value as string[]) ?? []).map((id) => state.animationPatterns[id]?.name ?? "?").join(", ") || "—";
  return value ? (state.animationPatterns[value as string]?.name ?? "?") : L("Standardblinking", "Default blinking");
}
