/**
 * Sammenlign to bildeversjoner side ved side (mandat 19.7, REQ-0258, REQ-0285, REQ-0318, DEC-0070): for
 * kandidater fra AI eller tidligere og nye versjoner. «Godkjenn» velger versjonen uten å slette den andre.
 */
import { Check } from "lucide-react";
import { L, locale, type AssetVersion } from "@/core";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function ImageCompareDialog({
  open,
  onOpenChange,
  title,
  versions,
  urls,
  approvedId,
  editable,
  onApprove,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  versions: readonly AssetVersion[];
  urls: Readonly<Record<string, string>>;
  approvedId: string | null;
  editable: boolean;
  onApprove: (v: AssetVersion) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl">
        <DialogHeader>
          <DialogTitle>
            {L("Sammenlign", "Compare")} – {title}
          </DialogTitle>
          <DialogDescription>
            {L(
              "Versjonene vises i samme størrelse. Godkjenn den du vil bruke; den andre beholdes.",
              "The versions are shown at the same size. Approve the one you want to use; the other is kept.",
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          {versions.map((v) => (
            <figure key={v.id} className="flex flex-col gap-1.5">
              <div className="flex h-[60vh] items-center justify-center bg-surface-3 [background-image:repeating-conic-gradient(var(--color-surface-2)_0_25%,transparent_0_50%)] [background-size:16px_16px]">
                {urls[v.mediaPath] ? (
                  <img
                    src={urls[v.mediaPath]}
                    alt={L(`Versjon ${v.number}`, `Version ${v.number}`)}
                    className="max-h-full max-w-full object-contain"
                  />
                ) : null}
              </div>
              <figcaption className="flex items-center justify-between gap-2 text-xs text-text-secondary">
                <span className="min-w-0 truncate" title={v.note || undefined}>
                  <span className="font-mono text-text-primary">v{v.number}</span>
                  {v.width && v.height ? ` · ${v.width}×${v.height}` : ""} ·{" "}
                  {new Date(v.createdAt).toLocaleString(locale())}
                  {v.note ? ` · ${v.note}` : ""}
                </span>
                {approvedId === v.id ? (
                  <span className="flex shrink-0 items-center gap-0.5 font-medium text-status-success">
                    <Check className="size-3.5" aria-hidden /> {L("Godkjent", "Approved")}
                  </span>
                ) : editable ? (
                  <Button size="sm" variant="secondary" onClick={() => onApprove(v)}>
                    {L("Godkjenn", "Approve")} v{v.number}
                  </Button>
                ) : null}
              </figcaption>
            </figure>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
