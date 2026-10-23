/**
 * G-6 del 2: «Publiser karakterknippe» og «Hent oppdatering» for en prosjektkarakter som er koblet til
 * arbeidsgruppens bibliotek (asset.globalAssetId). Innhenting viser planen felt for felt (planCharacterPull)
 * og tas bare i bruk etter bekreftelse, som én angrebar gruppe. Lokale overstyringer vises som «beholdes».
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Upload } from "lucide-react";
import { tm, type Asset, type ProjectState } from "@/core";
import {
  characterBundleFromAsset,
  localCharacterState,
  planCharacterPull,
  planCharacterPullCommands,
  pullPlanHasChanges,
  type CharacterPullPlan,
  type PullAction,
} from "@/core/global/character-bundle";
import { characterBundle, publishCharacterBundle } from "@/adapters/browser/global-library";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Commands } from "@/app/project/use-commands";
import { useProjectWorkspace } from "./use-global";
import { t } from "@/core/i18n/keyed";

const bundleKey = (globalAssetId: string) => ["global-character-bundle", globalAssetId] as const;

export function CharacterBundleControls({
  projectId,
  state,
  asset,
  cmds,
}: {
  projectId: string;
  state: ProjectState;
  asset: Asset;
  cmds: Commands;
}) {
  const ws = useProjectWorkspace(projectId);
  const qc = useQueryClient();
  const gid = asset.globalAssetId ?? null;
  const isCharacter = asset.kind === "character" || asset.kind === "animal";
  const latest = useQuery({
    queryKey: bundleKey(gid ?? ""),
    queryFn: () => characterBundle(gid!),
    enabled: !!gid && isCharacter && ws.ready && !!ws.workspaceId,
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [plan, setPlan] = useState<CharacterPullPlan | null>(null);
  if (!gid || !isCharacter || !ws.ready || !ws.workspaceId) return null;
  const newer = latest.data && latest.data.number > (asset.globalBundleNumber ?? 0) ? latest.data : null;

  async function publish() {
    const bundle = characterBundleFromAsset(state, asset.id);
    if (!bundle) return;
    setBusy(true);
    setMsg(null);
    try {
      const number = await publishCharacterBundle(gid!, bundle, "");
      await qc.invalidateQueries({ queryKey: bundleKey(gid!) });
      setMsg({ ok: true, text: t("g6-bundle.published", { number }) });
    } catch (e) {
      setMsg({ ok: false, text: tm((e as Error).message) });
    } finally {
      setBusy(false);
    }
  }

  async function preparePull() {
    if (!newer) return;
    setBusy(true);
    setMsg(null);
    try {
      const local = localCharacterState(state, asset.id);
      const pulled = asset.globalBundleNumber ? await characterBundle(gid!, asset.globalBundleNumber) : null;
      if (local) setPlan(planCharacterPull(local, pulled, newer));
    } catch (e) {
      setMsg({ ok: false, text: tm((e as Error).message) });
    } finally {
      setBusy(false);
    }
  }

  async function confirmPull() {
    if (!plan) return;
    setBusy(true);
    const group = `g6-pull:${asset.id}:${plan.bundleNumber}`;
    let error: string | null = null;
    for (const c of planCharacterPullCommands(state, asset.id, plan)) {
      const r = await cmds.runAndWait(c, t("g6-bundle.pull-label", { name: asset.name }), group);
      if (r.error) {
        error = r.error;
        break;
      }
    }
    setBusy(false);
    setPlan(null);
    setMsg(error ? { ok: false, text: error } : { ok: true, text: t("g6-bundle.pulled", { number: plan.bundleNumber }) });
  }

  return (
    <span className="flex flex-wrap items-center gap-2" data-testid="character-bundle-controls">
      {ws.rights.publish ? (
        <Button size="sm" variant="ghost" disabled={busy} data-testid="publish-character-bundle" onClick={() => void publish()}>
          <Upload />
          {t("g6-bundle.publish")}
        </Button>
      ) : null}
      {newer ? (
        <Button size="sm" variant="ghost" disabled={busy} data-testid="pull-character-bundle" onClick={() => void preparePull()}>
          <Download />
          {t("g6-bundle.pull", { number: newer.number })}
        </Button>
      ) : null}
      {msg ? (
        <span role={msg.ok ? "status" : "alert"} className={`text-xs ${msg.ok ? "text-text-secondary" : "text-status-danger"}`}>
          {msg.text}
        </span>
      ) : null}
      <Dialog open={plan !== null} onOpenChange={(o) => !o && setPlan(null)}>
        <DialogContent uiId="V-163" className="max-w-[520px] bg-surface-2">
          <DialogHeader>
            <DialogTitle>{t("g6-bundle.plan-title", { name: asset.name, number: plan?.bundleNumber ?? 0 })}</DialogTitle>
            <DialogDescription>{t("g6-bundle.plan-note")}</DialogDescription>
          </DialogHeader>
          {plan ? <PlanList plan={plan} /> : null}
          <DialogFooter>
            <Button variant="secondary" onClick={() => setPlan(null)}>
              {t("g6-bundle.cancel")}
            </Button>
            <Button disabled={busy || !plan || !pullPlanHasChanges(plan)} data-testid="confirm-character-pull" onClick={() => void confirmPull()}>
              {t("g6-bundle.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </span>
  );
}

function PlanList({ plan }: { plan: CharacterPullPlan }) {
  const row = (label: string, action: PullAction) => (
    <li key={label} className="flex justify-between gap-3 text-[13px]">
      <span className="text-text-primary">{label}</span>
      <span className={action === "apply" ? "text-text-primary" : "text-text-tertiary"}>
        {action === "apply" ? t("g6-bundle.apply") : t("g6-bundle.keep")}
      </span>
    </li>
  );
  return (
    <ul className="flex flex-col gap-1" data-testid="character-pull-plan">
      {row(t("g6-bundle.field.voice"), plan.voice.action)}
      <li className="flex justify-between gap-3 text-[13px]">
        <span className="text-text-primary">{t("g6-bundle.field.briefs")}</span>
        <span className="text-text-secondary">{t("g6-bundle.briefs-added", { count: plan.briefVersionsToAppend.length })}</span>
      </li>
      {row(t("g6-bundle.field.active-brief"), plan.activeBriefId.action)}
      {plan.mouthSets.map((m) => row(t("g6-bundle.field.mouth", { system: m.system }), m.set.action))}
      {row(t("g6-bundle.field.rig"), plan.rigSetup.action)}
      {!pullPlanHasChanges(plan) ? <li className="text-xs text-text-tertiary">{t("g6-bundle.nothing")}</li> : null}
    </ul>
  );
}
