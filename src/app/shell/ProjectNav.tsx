import { Link } from "@tanstack/react-router";
import { Clapperboard, FileText, Film, Layers, Library, Users } from "lucide-react";
import type { ReactNode } from "react";
import { PaneResizer, usePaneSize } from "./pane-size";

/** Arbeidsflatene (INFORMATION_ARCHITECTURE.md). Flatene som ikke er bygget ennå vises deaktivert med milepæl. */
const LATER: { label: string; icon: ReactNode; milestone: string }[] = [
  { label: "Montering", icon: <Film />, milestone: "M4" },
  { label: "Utgivelse", icon: <Clapperboard />, milestone: "M8" },
];

const item =
  "flex h-8 items-center gap-2 rounded-sm px-2 text-[13px] text-text-secondary hover:bg-surface-3 hover:text-text-primary [&_svg]:size-4 focus-visible:outline-2 focus-visible:outline-focus-ring";
const active = "bg-accent-selection font-medium text-text-primary";

export function ProjectNav({ projectId }: { projectId: string }) {
  const [width, setWidth] = usePaneSize("project-nav", 184, 140, 320);
  return (
    <nav
      aria-label="Arbeidsflater"
      style={{ width }}
      className="relative flex shrink-0 flex-col gap-0.5 border-r border-border bg-surface-1 p-2"
    >
      <PaneResizer
        edge="right"
        size={width}
        onSize={setWidth}
        min={140}
        max={320}
        label="Bredde på menyen"
      />
      <Link
        to="/prosjekt/$projectId"
        params={{ projectId }}
        activeOptions={{ exact: true }}
        className={item}
        activeProps={{ className: active, "aria-current": "page" }}
      >
        <Users aria-hidden />
        Prosjektoversikt
      </Link>
      <Link
        to="/prosjekt/$projectId/manus"
        params={{ projectId }}
        className={item}
        activeProps={{ className: active, "aria-current": "page" }}
      >
        <FileText aria-hidden />
        Manus
      </Link>
      <Link
        to="/prosjekt/$projectId/bibliotek"
        params={{ projectId }}
        className={item}
        activeProps={{ className: active, "aria-current": "page" }}
      >
        <Library aria-hidden />
        Ressursbibliotek
      </Link>
      <Link
        to="/prosjekt/$projectId/scene"
        params={{ projectId }}
        className={item}
        activeProps={{ className: active, "aria-current": "page" }}
      >
        <Layers aria-hidden />
        Sceneeditor
      </Link>
      {LATER.map((w) => (
        <span
          key={w.label}
          aria-disabled
          title={`Kommer i ${w.milestone}`}
          className="flex h-8 cursor-not-allowed items-center gap-2 px-2 text-[13px] text-text-disabled [&_svg]:size-4"
        >
          {w.icon}
          {w.label}
          <span className="ml-auto font-mono text-[11px] text-text-disabled">{w.milestone}</span>
        </span>
      ))}
    </nav>
  );
}
