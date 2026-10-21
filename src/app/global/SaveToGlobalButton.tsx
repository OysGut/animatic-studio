/**
 * «Lagre i globalt bibliotek» (GP2, §6, G2): eksplisitt handling på én prosjektressurs. Metadata, varianter og
 * versjoner kopieres til prosjektets arbeidsgruppe. Prosjektressursen endres ikke.
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Globe } from "lucide-react";
import { tm, type Asset } from "@/core";
import { saveAssetToGlobal } from "@/adapters/global/global-library.functions";
import { Button } from "@/components/ui/button";
import { globalBundlesKey, useProjectWorkspace } from "./use-global";
import { t } from "@/core/i18n/keyed";

export function SaveToGlobalButton({ projectId, asset }: { projectId: string; asset: Asset }) {
  const ws = useProjectWorkspace(projectId);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (!ws.ready || !ws.workspaceId || !ws.rights.publish || asset.globalAssetId) return null;
  return (
    <span className="flex items-center gap-2">
      <Button
        size="sm"
        variant="ghost"
        disabled={busy}
        data-testid="save-to-global"
        title={t("app-global-save-to-global-button.save-to-global-button.title.07ff4fc8f41c", { value1: String(ws.workspaceName ?? "") })}
        onClick={() => {
          setBusy(true);
          setMsg(null);
          void saveAssetToGlobal({ data: { projectId, assetId: asset.id, workspaceId: ws.workspaceId! } })
            .then((r) => {
              void qc.invalidateQueries({ queryKey: globalBundlesKey(ws.workspaceId) });
              setMsg({
                ok: true,
                text: t("app-global-save-to-global-button.saved-global", { count: r.versions }),
              });
            })
            .catch((e: unknown) => setMsg({ ok: false, text: tm((e as Error).message) }))
            .finally(() => setBusy(false));
        }}
      >
        <Globe />
        {t("app-global-save-to-global-button.save-to-global-button.button.dbeb4d2ecc86")}
      </Button>
      {msg ? (
        <span role={msg.ok ? "status" : "alert"} className={`text-xs ${msg.ok ? "text-text-secondary" : "text-status-danger"}`}>
          {msg.text}
        </span>
      ) : null}
    </span>
  );
}
