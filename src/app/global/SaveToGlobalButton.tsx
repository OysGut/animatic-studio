/**
 * «Lagre i globalt bibliotek» (GP2, §6, G2): eksplisitt handling på én prosjektressurs. Metadata, varianter og
 * versjoner kopieres til prosjektets arbeidsgruppe. Prosjektressursen endres ikke.
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Globe } from "lucide-react";
import { L, tm, type Asset } from "@/core";
import { saveAssetToGlobal } from "@/adapters/global/global-library.functions";
import { Button } from "@/components/ui/button";
import { globalBundlesKey, useProjectWorkspace } from "./use-global";

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
        title={L(
          `Kopier ressursen med varianter og bilder til det globale biblioteket i «${ws.workspaceName ?? ""}». Prosjektet endres ikke.`,
          `Copy the asset with variants and images to the global library in “${ws.workspaceName ?? ""}”. The project does not change.`,
        )}
        onClick={() => {
          setBusy(true);
          setMsg(null);
          void saveAssetToGlobal({ data: { projectId, assetId: asset.id, workspaceId: ws.workspaceId! } })
            .then((r) => {
              void qc.invalidateQueries({ queryKey: globalBundlesKey(ws.workspaceId) });
              setMsg({
                ok: true,
                text: L(
                  `Lagret i det globale biblioteket (${r.versions} ${r.versions === 1 ? "fil" : "filer"}).`,
                  `Saved in the global library (${r.versions} ${r.versions === 1 ? "file" : "files"}).`,
                ),
              });
            })
            .catch((e: unknown) => setMsg({ ok: false, text: tm((e as Error).message) }))
            .finally(() => setBusy(false));
        }}
      >
        <Globe />
        {L("Lagre i globalt bibliotek", "Save to global library")}
      </Button>
      {msg ? (
        <span role={msg.ok ? "status" : "alert"} className={`text-xs ${msg.ok ? "text-text-secondary" : "text-status-danger"}`}>
          {msg.text}
        </span>
      ) : null}
    </span>
  );
}
