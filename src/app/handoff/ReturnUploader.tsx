/**
 * C-1 return page body (token or signed in). Works on iPad (Procreate: Share → Files → browser), phone and
 * desktop: one file picker, SHA-256 in the browser, 4 MiB chunks, then the server checks checksum, type and
 * content, recognizes the hand-off (marker or link, never the file name) and creates a candidate version.
 */
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { INTAKE_EXTENSIONS, sha256Hex } from "@/core/connectors";
import { findMarker } from "@/core/handoff";
import { returnBegin, returnBeginSignedIn, returnChunk, returnChunkSignedIn, returnFinish, returnFinishSignedIn } from "@/adapters/handoff/handoff.functions";
import { t } from "@/core/i18n/keyed";

const CHUNK = 4 * 1024 * 1024;
const ACCEPT = INTAKE_EXTENSIONS.map((e) => "." + e).join(",");
function b64(b: Uint8Array): string { let s = ""; for (let i = 0; i < b.length; i += 32768) s += String.fromCharCode(...b.subarray(i, i + 32768)); return btoa(s); }
function idemKey(): string { return Array.from(crypto.getRandomValues(new Uint8Array(18)), (x) => x.toString(16).padStart(2, "0")).join(""); }

export function errorText(message: string): string {
  const code = /\[([a-z_]+)\]/.exec(message)?.[1];
  switch (code) {
    case "extension": case "content": return t("c1.return.err-type");
    case "checksum": return t("c1.return.err-checksum");
    case "filename_only": return t("c1.return.err-filename");
    case "unknown": case "mismatch": return t("c1.return.err-unknown");
    case "unavailable": return t("c1.return.err-unavailable");
    case "rate": return t("c1.return.err-rate");
    case "size": case "quota": return t("c1.return.err-size");
    case "format": return t("c1.return.err-format");
    default: return t("c1.error");
  }
}

export function ReturnUploader({ token }: { token: string | null }) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const beginT = useServerFn(returnBegin), chunkT = useServerFn(returnChunk), finishT = useServerFn(returnFinish);
  const beginS = useServerFn(returnBeginSignedIn), chunkS = useServerFn(returnChunkSignedIn), finishS = useServerFn(returnFinishSignedIn);

  async function upload(file: File) {
    setBusy(true); setMsg(null); setProgress(0);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const sha256 = sha256Hex(bytes);
      const handoffId = token ? null : findMarker(bytes);
      if (!token && !handoffId) { setMsg({ ok: false, text: t("c1.return.err-filename") }); return; }
      const meta = { fileName: file.name.replace(/[\\/]/g, "_").slice(0, 255) || "file", byteSize: bytes.length, sha256, idempotencyKey: idemKey() };
      const { transferId } = token ? await beginT({ data: { token, ...meta } }) : await beginS({ data: { handoffId: handoffId!, ...meta } });
      const n = Math.max(1, Math.ceil(bytes.length / CHUNK));
      for (let i = 0; i < n; i++) {
        const data = b64(bytes.subarray(i * CHUNK, Math.min(bytes.length, (i + 1) * CHUNK)));
        if (token) await chunkT({ data: { token, transferId, index: i, data } }); else await chunkS({ data: { handoffId: handoffId!, transferId, index: i, data } });
        setProgress(Math.round(((i + 1) / n) * 100));
      }
      const r = token ? await finishT({ data: { token, transferId } }) : await finishS({ data: { handoffId: handoffId!, transferId } });
      setMsg({ ok: true, text: r.conflict ? t("c1.return.done-conflict") : t("c1.return.done") });
    } catch (e) { setMsg({ ok: false, text: errorText((e as Error).message) }); } finally { setBusy(false); }
  }

  return (
    <div className="space-y-3" data-testid="return-uploader">
      <label className="block">
        <span className="mb-1 block text-sm font-medium">{t("c1.return.pick")}</span>
        <input type="file" accept={ACCEPT} disabled={busy} data-testid="return-file" className="block w-full text-sm" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ""; }} />
      </label>
      <p className="text-xs text-muted-foreground">{t("c1.return.types", { types: INTAKE_EXTENSIONS.join(", ") })}</p>
      {busy ? <p role="status" className="text-sm">{t("c1.return.progress", { percent: progress })}</p> : null}
      {msg ? <p role={msg.ok ? "status" : "alert"} data-testid={msg.ok ? "return-ok" : "return-error"} className={`text-sm ${msg.ok ? "text-accent-brand" : "text-destructive"}`}>{msg.text}</p> : null}
      <p className="text-xs text-muted-foreground">{t("c1.return.boundary")}</p>
      <Button type="button" variant="ghost" size="sm" className="hidden">{""}</Button>
    </div>
  );
}
