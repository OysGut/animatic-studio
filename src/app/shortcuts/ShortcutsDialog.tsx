/**
 * «Hurtigtaster»: oversikt over tastene i arbeidsflatene (UX-prinsipp P7, DEC-0078). Åpnes fra knappen med
 * tastaturikonet i verktøylinjen (montering og sceneeditor) eller med «?». Arbeidsflaten man står i vises
 * først.
 */
import { Keyboard } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SHORTCUT_GROUPS, SHORTCUT_HELP_KEY, type ShortcutGroup } from "./shortcut-list";

export function ShortcutsDialog({
  open,
  onOpenChange,
  current,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Arbeidsflaten dialogen åpnes fra; den gruppen vises først. */
  current: ShortcutGroup["id"];
}) {
  const groups = [
    ...SHORTCUT_GROUPS.filter((g) => g.id === current),
    ...SHORTCUT_GROUPS.filter((g) => g.id !== current),
  ];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(86vh,760px)] max-w-[min(920px,calc(100vw-48px))] flex-col gap-3 border-border bg-surface-2">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="size-5" aria-hidden />
            Hurtigtaster
          </DialogTitle>
          <DialogDescription>
            Tastene virker når du ikke skriver i et tekstfelt. På Windows og Linux brukes Ctrl der
            Mac bruker ⌘. Trykk {SHORTCUT_HELP_KEY} for å åpne denne oversikten.
          </DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 grid-cols-1 gap-x-8 gap-y-4 overflow-y-auto pr-1 md:grid-cols-2">
          {groups.map((g) => (
            <section key={g.id} aria-labelledby={`hurtigtaster-${g.id}`}>
              <h3
                id={`hurtigtaster-${g.id}`}
                className="mb-1 text-[11px] font-medium uppercase tracking-[0.04em] text-text-tertiary"
              >
                {g.title}
                {g.id === current ? " (her)" : ""}
              </h3>
              <dl className="flex flex-col">
                {g.shortcuts.map((s, i) => (
                  <div
                    key={i}
                    className="flex items-baseline gap-3 border-b border-border py-1 last:border-b-0"
                  >
                    <dt className="flex w-36 shrink-0 flex-wrap items-center gap-1">
                      {s.keys.map((k, j) => (
                        <kbd
                          key={j}
                          className="rounded-[2px] border border-border-strong bg-surface-3 px-1.5 font-mono text-[11px] leading-5 text-text-primary"
                        >
                          {k}
                        </kbd>
                      ))}
                    </dt>
                    <dd className="min-w-0 flex-1 text-xs text-text-secondary">
                      {s.action}
                      {s.when ? <span className="text-text-tertiary"> – {s.when}</span> : null}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Knappen som åpner oversikten (ikon med aria-label og verktøytips med tasten). */
export function ShortcutsButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Hurtigtaster"
      title={`Hurtigtaster (${SHORTCUT_HELP_KEY})`}
      className="inline-flex size-7 shrink-0 items-center justify-center rounded-sm text-text-secondary hover:bg-surface-3 hover:text-text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      <Keyboard className="size-4" aria-hidden />
    </button>
  );
}
