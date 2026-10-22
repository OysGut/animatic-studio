/**
 * B-118 (Øystein 22.10): felles scenemerke – farget firkant + statusikon + navn – brukt overalt der scener
 * listes, så venstrejusteringen alltid er lik. Scener uten farge/status får en tom plass av samme bredde.
 * «Vis status» og «Vis farger» er visningsvalg per bruker (ui_prefs); av = ingenting vises, data beholdes.
 */
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Eye, Flag, Hammer, PenTool, RotateCcw, Brush, type LucideIcon } from "lucide-react";
import type { SceneColor, SceneOccurrence, WorkStatus } from "@/core";
import { t } from "@/core/i18n/keyed";
import { useUiPref } from "@/app/account/ui-prefs";
import { fetchSceneMarkChanges, type SceneMarkChange } from "@/adapters/browser/last-changed";
import { useProfiles } from "@/app/project/use-project";
import { useTimeFormat } from "@/app/i18n/time-format";

/** Tailwind-klasser per palettnøkkel (designtokens --scene-*). Skrevet ut, så de genereres. */
export const SCENE_COLOR_BG: Record<SceneColor, string> = {
  red: "bg-scene-red",
  orange: "bg-scene-orange",
  yellow: "bg-scene-yellow",
  green: "bg-scene-green",
  teal: "bg-scene-teal",
  blue: "bg-scene-blue",
  indigo: "bg-scene-indigo",
  purple: "bg-scene-purple",
  pink: "bg-scene-pink",
  gray: "bg-scene-gray",
};

export const WORK_STATUS_ICON: Record<WorkStatus, LucideIcon> = {
  setup: Hammer,
  animating: PenTool,
  review: Eye,
  retake: RotateCcw,
  approved: CheckCircle2,
  post: Brush,
  done: Flag,
};

export function workStatusLabel(s: WorkStatus): string {
  switch (s) {
    case "setup": return t("b118.status.setup");
    case "animating": return t("b118.status.animating");
    case "review": return t("b118.status.review");
    case "retake": return t("b118.status.retake");
    case "approved": return t("b118.status.approved");
    case "post": return t("b118.status.post");
    case "done": return t("b118.status.done");
  }
}

export function sceneColorLabel(c: SceneColor): string {
  switch (c) {
    case "red": return t("b118.color.red");
    case "orange": return t("b118.color.orange");
    case "yellow": return t("b118.color.yellow");
    case "green": return t("b118.color.green");
    case "teal": return t("b118.color.teal");
    case "blue": return t("b118.color.blue");
    case "indigo": return t("b118.color.indigo");
    case "purple": return t("b118.color.purple");
    case "pink": return t("b118.color.pink");
    case "gray": return t("b118.color.gray");
  }
}

const isBool = (v: unknown): v is boolean => typeof v === "boolean";
export const SHOW_STATUS_PREF = "scenes.showStatus"; // i18n-ignore: nøkkel i ui_prefs
export const SHOW_COLORS_PREF = "scenes.showColors"; // i18n-ignore: nøkkel i ui_prefs

export function useSceneMarkPrefs() {
  const [showStatus, setShowStatus] = useUiPref<boolean>(SHOW_STATUS_PREF, true, isBool);
  const [showColors, setShowColors] = useUiPref<boolean>(SHOW_COLORS_PREF, true, isBool);
  return { showStatus, setShowStatus, showColors, setShowColors };
}

/** Siste endring av status og farge per forekomst (én spørring per prosjekt, delt av alle merker). */
export function useSceneMarkChanges(projectId: string, enabled = true) {
  return useQuery({
    queryKey: ["scene-mark-changes", projectId],
    queryFn: () => fetchSceneMarkChanges(projectId),
    enabled: enabled && !!projectId,
    staleTime: 30_000,
  });
}

/** «Endret av … tidspunkt» for verktøytipset. */
export function useMarkChangeText() {
  const time = useTimeFormat();
  return (label: string, change: SceneMarkChange | undefined, names: Record<string, { display_name: string }> | undefined) => {
    if (!change) return label;
    const name = names?.[change.actor]?.display_name;
    return name
      ? t("b118.tip-by", { label, time: time.exact(change.at), name })
      : t("b118.tip", { label, time: time.exact(change.at) });
  };
}

/** Farget firkant (eller tom plass med samme bredde). */
export function SceneColorSquare({ color }: { color: SceneColor | undefined }) {
  return (
    <span
      data-testid="scene-mark-square"
      data-color={color ?? ""}
      className={"inline-block size-2.5 shrink-0 rounded-[2px] " + (color ? SCENE_COLOR_BG[color] : "")}
      title={color ? sceneColorLabel(color) : undefined}
      aria-hidden
    />
  );
}

/** Statusikon (eller tom plass med samme bredde). */
export function WorkStatusIcon({ status, title }: { status: WorkStatus | undefined; title?: string }) {
  if (!status) return <span data-testid="scene-mark-status" data-status="" className="inline-block size-3 shrink-0" aria-hidden />;
  const Icon = WORK_STATUS_ICON[status];
  const label = title ?? workStatusLabel(status);
  return (
    <span data-testid="scene-mark-status" data-status={status} className="inline-flex size-3 shrink-0 text-text-tertiary" title={label}>
      <Icon className="size-3" aria-label={label} />
    </span>
  );
}

/**
 * Scenemerket: [firkant][ikon] navn. Når «Vis farger»/«Vis status» er av, utelates plassen for alle scener,
 * så navnene fortsatt står likt.
 */
export function SceneMark({
  occurrence,
  children,
  className,
}: {
  occurrence: Pick<SceneOccurrence, "id" | "color" | "workStatus"> | undefined;
  children: ReactNode;
  className?: string;
}) {
  const { showStatus, showColors } = useSceneMarkPrefs();
  return (
    <span data-testid="scene-mark" className={"inline-flex min-w-0 items-center gap-1.5 " + (className ?? "")}>
      {showColors ? <SceneColorSquare color={occurrence?.color} /> : null}
      {showStatus ? <WorkStatusIcon status={occurrence?.workStatus} /> : null}
      <span data-testid="scene-mark-name" className="min-w-0 truncate">{children}</span>
    </span>
  );
}

/** 2 px fargestripe helt øverst i scenen (sceneeditor og scenekort). Forelderen må være `relative`. */
export function SceneColorStripe({ color }: { color: SceneColor | undefined }) {
  const { showColors } = useSceneMarkPrefs();
  if (!showColors || !color) return null;
  return (
    <span
      data-testid="scene-color-stripe"
      data-color={color}
      className={"pointer-events-none absolute inset-x-0 top-0 z-10 h-[2px] " + SCENE_COLOR_BG[color]}
      aria-hidden
    />
  );
}

export { useProfiles };
