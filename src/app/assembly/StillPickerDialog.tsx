/**
 * Stillbilde i scenen (DEC-0072, REQ-0214/0418): et bilde fra ressursbiblioteket vises i en valgt tid, som hele
 * scenen eller som en ny del etter de andre. Bildet kopieres ikke; versjonen peker på bildefilen i biblioteket.
 * Lengden kan endres etterpå i «Klipp». Alt kan angres som ett steg.
 */
import { ImageIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { locale, STILL_MAX_MS, STILL_MIN_MS, newId, stillCandidates, stillCommands, type Command, type FilmClip, type ProjectState } from "@/core";
import { useImageUrls } from "@/app/library/asset-images";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { t } from "@/core/i18n/keyed";

export function StillPickerDialog({
  open,
  onOpenChange,
  state,
  clip,
  run,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: ProjectState;
  clip: FilmClip;
  run: (command: Command, label: string, group?: string) => string | null;
}) {
  const list = useMemo(() => stillCandidates(state), [state]);
  const urls = useImageUrls(open ? list.map((x) => x.version.mediaPath) : []);
  const [picked, setPicked] = useState<string | null>(null);
  const [seconds, setSeconds] = useState("3");
  const [mode, setMode] = useState<"replace" | "append">(clip.edited ? "append" : "replace");
  const [err, setErr] = useState<string | null>(null);
  const choice = list.find((x) => x.version.id === picked) ?? null;
  const ms = Math.round(Number(seconds.replace(",", ".")) * 1000);
  const msOk = Number.isFinite(ms) && ms >= STILL_MIN_MS && ms <= STILL_MAX_MS;

  function use() {
    if (!choice) return;
    const cmds = stillCommands(
      clip,
      {
        takeId: newId(),
        mediaRef: choice.version.mediaPath,
        ms,
        mode,
        fps: state.project.fps,
      },
      () => newId(),
    );
    if (!cmds) {
      setErr(t("app-assembly-still-picker-dialog.use.set-err.d6d1647a3a4a"));
      return;
    }
    const group = newId();
    const label = t("app-assembly-still-picker-dialog.label.message.9781cfe4b26a", { name: String(choice.asset.name) });
    for (const c of cmds) {
      const e = run(c as never, label, group);
      if (e) {
        setErr(e);
        return;
      }
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("app-assembly-still-picker-dialog.still-picker-dialog.dialog-title.28558823f25b")}</DialogTitle>
          <DialogDescription>
            {t("app-assembly-still-picker-dialog.still-picker-dialog.dialog-description.9f4d3f5ee91f")}
          </DialogDescription>
        </DialogHeader>
        {list.length === 0 ? (
          <p className="text-[13px] text-text-secondary">
            {t("app-assembly-still-picker-dialog.still-picker-dialog.p.1fdddb5367ae")}
          </p>
        ) : (
          <ul
            aria-label={t("app-assembly-still-picker-dialog.still-picker-dialog.aria-label.c4b236bfb135")}
            className="grid max-h-[50vh] grid-cols-4 gap-2 overflow-y-auto"
          >
            {list.map((x) => (
              <li key={x.version.id}>
                <button
                  type="button"
                  onClick={() => setPicked(x.version.id)}
                  aria-pressed={picked === x.version.id}
                  className={
                    "flex w-full flex-col gap-1 rounded-sm border p-1 text-left text-[11px] " +
                    (picked === x.version.id
                      ? "border-accent-brand bg-accent-selection/40"
                      : "border-border bg-surface-2 hover:bg-surface-3")
                  }
                >
                  {urls.data?.[x.version.mediaPath] ? (
                    <img
                      src={urls.data[x.version.mediaPath]}
                      alt=""
                      className="aspect-video w-full bg-media object-contain"
                    />
                  ) : (
                    <span className="flex aspect-video w-full items-center justify-center bg-surface-3">
                      <ImageIcon className="size-5 text-text-tertiary" aria-hidden />
                    </span>
                  )}
                  <span className="truncate text-text-primary">{x.asset.name}</span>
                  <span className="truncate text-text-tertiary">
                    {x.variant.name} · v{x.version.number}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-center gap-3 text-xs text-text-secondary">
          <label className="flex items-center gap-1.5">
            {t("app-assembly-still-picker-dialog.still-picker-dialog.label.b9ffbc090132")}
            <input
              type="text"
              inputMode="decimal"
              aria-label={t("app-assembly-still-picker-dialog.still-picker-dialog.aria-label.91d513018426")}
              value={seconds}
              onChange={(e) => setSeconds(e.target.value)}
              className="h-7 w-16 rounded-sm border border-border-control bg-surface-3 px-1.5 text-right text-xs text-text-primary"
            />
            s
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="still-mode"
              checked={mode === "replace"}
              onChange={() => setMode("replace")}
            />
            {t("app-assembly-still-picker-dialog.still-picker-dialog.label.dc7a50469a15")}
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="still-mode"
              checked={mode === "append"}
              onChange={() => setMode("append")}
            />
            {t("app-assembly-still-picker-dialog.still-picker-dialog.label.1235bc0e83a2")}
          </label>
          {!msOk ? (
            <span className="text-status-danger">
              {t("app-assembly-still-picker-dialog.still-picker-dialog.span.31617481fb17")} {(STILL_MIN_MS / 1000).toLocaleString(locale())} s{" "}
              {t("app-assembly-still-picker-dialog.still-picker-dialog.span.1f9e9b8828c2")} {STILL_MAX_MS / 60000} min
            </span>
          ) : null}
        </div>
        {err ? (
          <p role="alert" className="text-xs text-status-danger">
            {err}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("app-assembly-still-picker-dialog.still-picker-dialog.button.bd66ef2bbdde")}
          </Button>
          <Button onClick={use} disabled={!choice || !msOk}>
            {t("app-assembly-still-picker-dialog.still-picker-dialog.button.b8acc1584ae5")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
