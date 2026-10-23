import { Link } from "@tanstack/react-router";
import { useLayoutEffect, useRef, useState } from "react";
import { useLanguage } from "@/app/i18n/language";
import {
  Camera,
  Clapperboard,
  Drama,
  FileText,
  Film,
  Layers,
  Library,
  PanelLeftClose,
  PanelLeftOpen,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";

import { useStoredFlag } from "./pane-size";
import { t, tLocalized } from "@/core/i18n/keyed";

/** Arbeidsflatene (INFORMATION_ARCHITECTURE.md). Flatene som ikke er bygget ennå vises deaktivert med milepæl. */
const LATER: { label: string; icon: ReactNode; milestone: string }[] = [];

/** Navn på arbeidsflatene (slås opp i render, så de følger språkvalget). */
const NAV_LABEL = tLocalized({ overview: "app-shell-project-nav.nav-label.overview.89940b851876", script: "app-shell-project-nav.nav-label.script.d8ab2fbdbb74", storylab: "app-shell-project-nav.nav-label.storylab.77e0aa3bb71c", library: "app-shell-project-nav.nav-label.library.04e76b60e919", scene: "app-shell-project-nav.nav-label.scene.e526371b5224", rig: "app-shell-project-nav.nav-label.rig", assembly: "app-shell-project-nav.nav-label.assembly.00bfb8ce638c", release: "app-shell-project-nav.nav-label.release.4e44a938bd23" });

const LINKS = [
  {
    to: "/prosjekt/$projectId",
    labelKey: "overview",
    icon: <Users aria-hidden />,
    exact: true,
  },
  {
    to: "/prosjekt/$projectId/manus",
    labelKey: "script",
    icon: <FileText aria-hidden />,
    exact: false,
  },
  {
    to: "/prosjekt/$projectId/storylab",
    labelKey: "storylab",
    icon: <Drama aria-hidden />,
    exact: false,
  },
  {
    to: "/prosjekt/$projectId/bibliotek",
    labelKey: "library",
    icon: <Library aria-hidden />,
    exact: false,
  },
  {
    to: "/prosjekt/$projectId/scene",
    labelKey: "scene",
    icon: <Layers aria-hidden />,
    exact: false,
  },
  {
    to: "/prosjekt/$projectId/rigg",
    labelKey: "rig",
    icon: <Camera aria-hidden />,
    exact: false,
  },
  {
    to: "/prosjekt/$projectId/montering",
    labelKey: "assembly",
    icon: <Film aria-hidden />,
    exact: false,
  },
  {
    to: "/prosjekt/$projectId/utgivelse",
    labelKey: "release",
    icon: <Clapperboard aria-hidden />,
    exact: false,
  },
] as const;

const item =
  "relative flex h-9 shrink-0 items-center gap-2 whitespace-nowrap px-3 text-[13px] text-text-secondary hover:text-text-primary [&_svg]:size-4 [&_svg]:shrink-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring";
/** Aktiv fane: 2 px strek nederst i merkefargen, som faneskillet i Premiere. Ingen fylt bakgrunn. */
const active =
  "font-medium text-text-primary after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-accent-brand";

/** Fanerad med arbeidsflatene øverst (U4). Kan slås sammen til bare ikoner (DEC-0040); valget huskes. */
export function ProjectNav({ projectId }: { projectId: string }) {
  const [stored, setCollapsed] = useStoredFlag("project-nav-collapsed", false);
  // N9: får ikke etikettene plass (f.eks. lange språk), vises bare ikoner med verktøytips.
  // Bredden med etiketter huskes, så visningen går tilbake når det blir plass igjen.
  const navRef = useRef<HTMLElement>(null);
  const fullWidth = useRef(0);
  const [tooNarrow, setTooNarrow] = useState(false);
  const collapsed = stored || tooNarrow;
  // Språkbytte endrer bare innholdet, ikke radens bredde: mål på nytt med etiketter.
  const lang = useLanguage();
  const [measuredLang, setMeasuredLang] = useState(lang);
  if (measuredLang !== lang) {
    setMeasuredLang(lang);
    setTooNarrow(false);
  }
  useLayoutEffect(() => {
    const el = navRef.current;
    if (!el || stored) return;
    const measure = () => {
      if (!tooNarrow) {
        if (el.scrollWidth > el.clientWidth + 1) {
          fullWidth.current = el.scrollWidth;
          setTooNarrow(true);
        }
      } else if (el.clientWidth >= fullWidth.current && fullWidth.current > 0) {
        setTooNarrow(false);
      }
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [stored, tooNarrow, lang]);
  return (
    <nav
      ref={navRef}
      data-compact={tooNarrow && !stored ? "auto" : undefined}
      aria-label={t("id3.nav.workspaces")}
      className="flex h-9 shrink-0 items-stretch overflow-x-auto overflow-y-hidden border-b border-border bg-surface-1"
    >
      {LINKS.map((l) => {
        const label = NAV_LABEL[l.labelKey];
        return (
          <Link
            key={l.to}
            to={l.to}
            params={{ projectId }}
            activeOptions={{ exact: l.exact }}
            className={item + (collapsed ? " px-2.5" : "")}
            activeProps={{ className: active, "aria-current": "page" }}
            title={collapsed ? label : undefined}
            aria-label={collapsed ? label : undefined}
          >
            {l.icon}
            {collapsed ? null : <span>{label}</span>}
          </Link>
        );
      })}
      {LATER.map((w) => (
        <span
          key={w.label}
          aria-disabled
          aria-label={
            collapsed
              ? t("app-shell-project-nav.project-nav.aria-label.401e138c59d2", { label: String(w.label), milestone: String(w.milestone) })
              : undefined
          }
          title={t("app-shell-project-nav.project-nav.title.401e138c59d2", { label: String(w.label), milestone: String(w.milestone) })}
          className={
            "flex h-9 shrink-0 cursor-not-allowed items-center gap-2 whitespace-nowrap px-3 text-[13px] text-text-disabled [&_svg]:size-4 [&_svg]:shrink-0" +
            (collapsed ? " px-2.5" : "")
          }
        >
          {w.icon}
          {collapsed ? null : (
            <>
              <span>{w.label}</span>
              <span className="font-mono text-[11px] text-text-disabled">{w.milestone}</span>
            </>
          )}
        </span>
      ))}
      <button
        type="button"
        onClick={() => setCollapsed(!stored)}
        className={item + " ml-auto px-2.5"}
        aria-label={stored ? t("app-shell-project-nav.project-nav.aria-label.426f16733981") : t("app-shell-project-nav.project-nav.aria-label.8e84932634d1")}
        aria-expanded={!stored}
        title={
          stored
            ? t("app-shell-project-nav.project-nav.title.426f16733981")
            : t("app-shell-project-nav.project-nav.title.ec28e1bce3aa")
        }
      >
        {stored ? <PanelLeftOpen aria-hidden /> : <PanelLeftClose aria-hidden />}
      </button>
    </nav>
  );
}
