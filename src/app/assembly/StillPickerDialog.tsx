/**
 * Stillbilde i scenen (DEC-0072, REQ-0214/0418): et bilde fra ressursbiblioteket vises i en valgt tid, som hele
 * scenen eller som en ny del etter de andre. Bildet kopieres ikke; versjonen peker på bildefilen i biblioteket.
 * Lengden kan endres etterpå i «Klipp». Alt kan angres som ett steg.
 */
import { ImageIcon } from "lucide-react";
import { useMemo, useState } from "react";
import {
  STILL_MAX_MS,
  STILL_MIN_MS,
  newId,
  stillCandidates,
  stillCommands,
  type Command,
  type FilmClip,
  type ProjectState,
} from "@/core";
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
      setErr("Ugyldig lengde.");
      return;
    }
    const group = newId();
    const label = `Stillbilde «${choice.asset.name}» i scenen`;
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
          <DialogTitle>Stillbilde i scenen</DialogTitle>
          <DialogDescription>
            Velg et bilde fra ressursbiblioteket og hvor lenge det skal vises. Bildet vises uendret
            i visningen og i eksporten; lengden kan endres etterpå under «Klipp».
          </DialogDescription>
        </DialogHeader>
        {list.length === 0 ? (
          <p className="text-[13px] text-text-secondary">
            Biblioteket har ingen bilder ennå. Last opp et bilde i ressursbiblioteket først.
          </p>
        ) : (
          <ul
            aria-label="Bilder i biblioteket"
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
                      className="aspect-video w-full bg-black object-contain"
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
            Varighet
            <input
              type="text"
              inputMode="decimal"
              aria-label="Varighet i sekunder"
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
            Hele scenen
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="still-mode"
              checked={mode === "append"}
              onChange={() => setMode("append")}
            />
            Ny del etter de andre
          </label>
          {!msOk ? (
            <span className="text-status-danger">
              Mellom {(STILL_MIN_MS / 1000).toLocaleString("nb-NO")} s og {STILL_MAX_MS / 60000} min
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
            Avbryt
          </Button>
          <Button onClick={use} disabled={!choice || !msOk}>
            Bruk stillbildet
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
