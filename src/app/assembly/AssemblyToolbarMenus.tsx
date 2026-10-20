/**
 * Menyene i monteringens verktøylinje (UX-gjennomgang DEC-0076 funn 5, DEC-0078/KI-183): visningsvalgene er
 * samlet i «Visning» (samme mønster som manusets verktøylinje), og sjeldnere handlinger i «Mer». Slik får de
 * viktigste handlingene beholde teksten sin uten at verktøylinjen blir en rad med ikoner.
 */
import {
  Binary,
  Blend,
  Captions,
  ChevronDown,
  Contrast,
  Ellipsis,
  ExternalLink,
  Film,
  Languages,
  ListOrdered,
  SlidersHorizontal,
  Type,
} from "lucide-react";
import type { ReactNode } from "react";
import { ToolbarButton } from "@/app/shell/workspace-chrome";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { L } from "@/core";
import { t } from "@/core/i18n/keyed";

function ViewToggle({
  checked,
  onChange,
  disabled,
  icon,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (on: boolean) => void;
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  hint: string;
}) {
  return (
    <label
      className={
        "flex items-start gap-2 rounded-sm px-1 py-1 text-xs " +
        (disabled ? "cursor-not-allowed text-text-disabled" : "text-text-secondary")
      }
      title={hint}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-3.5 accent-[var(--accent-brand)]"
      />
      <span className="flex flex-col gap-0.5">
        <span className="flex items-center gap-1.5 text-text-primary">
          {icon}
          {label}
        </span>
        <span className="text-[11px] text-text-tertiary">{hint}</span>
      </span>
    </label>
  );
}

/** «Visning ▾»: svart-hvitt, teknisk visning og eget vindu. Endrer aldri filmen. */
export function AssemblyViewMenu({
  monochrome,
  onMonochrome,
  technical,
  onTechnical,
  popout,
  onPopout,
  hasClips,
}: {
  monochrome: boolean;
  onMonochrome: (on: boolean) => void;
  technical: boolean;
  onTechnical: (on: boolean) => void;
  popout: boolean;
  onPopout: (on: boolean) => void;
  hasClips: boolean;
}) {
  const changed = monochrome || technical || popout;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <ToolbarButton
          className="shrink-0"
          title={t("app-assembly-assembly-toolbar-menus.assembly-view-menu.title.395f0d2fd144")}
        >
          <SlidersHorizontal className="size-3.5" aria-hidden />
          {t("app-assembly-assembly-toolbar-menus.assembly-view-menu.toolbar-button.69d57e54d93f")}
          {changed ? (
            <>
              <span className="size-1.5 rounded-full bg-accent-brand" aria-hidden />
              <span className="sr-only">{t("app-assembly-assembly-toolbar-menus.assembly-view-menu.span.b51ea08ac7fd")}</span>
            </>
          ) : null}
          <ChevronDown className="size-3" aria-hidden />
        </ToolbarButton>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-72 flex-col gap-1 p-2">
        <ViewToggle
          checked={monochrome}
          onChange={onMonochrome}
          icon={<Contrast className="size-3.5" aria-hidden />}
          label={t("app-assembly-assembly-toolbar-menus.assembly-view-menu.label.01c8a4adb4ee")}
          hint={t("app-assembly-assembly-toolbar-menus.assembly-view-menu.hint.c8799e1a1b38")}
        />
        <ViewToggle
          checked={technical}
          onChange={onTechnical}
          icon={<Binary className="size-3.5" aria-hidden />}
          label={t("app-assembly-assembly-toolbar-menus.assembly-view-menu.label.1875f107bdf2")}
          hint={t("app-assembly-assembly-toolbar-menus.assembly-view-menu.hint.7ef8ca936164")}
        />
        <ViewToggle
          checked={popout}
          onChange={onPopout}
          disabled={!hasClips}
          icon={<ExternalLink className="size-3.5" aria-hidden />}
          label={t("app-assembly-assembly-toolbar-menus.assembly-view-menu.label.379433325ec3")}
          hint={t("app-assembly-assembly-toolbar-menus.assembly-view-menu.hint.4073080dcf51")}
        />
      </PopoverContent>
    </Popover>
  );
}

/** «Mer ▾»: handlinger som brukes sjeldnere enn lyd og eksport. */
export function AssemblyMoreMenu({
  editable,
  hasClips,
  onStandardTransition,
  onLongFilm,
  onBatchVideo,
  onLanguage,
  onSubtitles,
}: {
  editable: boolean;
  hasClips: boolean;
  onStandardTransition: () => void;
  onLongFilm: () => void;
  onBatchVideo: () => void;
  onLanguage: () => void;
  onSubtitles: () => void;
}) {
  const item = "flex items-start gap-2 text-xs";
  const hint = "block text-[11px] text-text-tertiary";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <ToolbarButton
          className="shrink-0"
          title={t("app-assembly-assembly-toolbar-menus.assembly-more-menu.title.f9678342eb3f")}
        >
          <Ellipsis className="size-3.5" aria-hidden />
          {t("app-assembly-assembly-toolbar-menus.assembly-more-menu.toolbar-button.9500f81ed2f1")}
          <ChevronDown className="size-3" aria-hidden />
        </ToolbarButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuItem className={item} onSelect={onStandardTransition}>
          <Blend className="mt-0.5" aria-hidden />
          <span>
            {t("app-assembly-assembly-toolbar-menus.assembly-more-menu.span.ab09f51a7299")}
            <span className={hint}>
              {t("app-assembly-assembly-toolbar-menus.assembly-more-menu.span.858915123c30")}
            </span>
          </span>
        </DropdownMenuItem>
        {editable ? (
          <>
            <DropdownMenuItem className={item} disabled={!hasClips} onSelect={onLongFilm}>
              <Film className="mt-0.5" aria-hidden />
              <span>
                {t("app-assembly-assembly-toolbar-menus.assembly-more-menu.span.b31fa66aac0d")}
                <span className={hint}>
                  {t("app-assembly-assembly-toolbar-menus.assembly-more-menu.span.a00cb1223443")}
                </span>
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem className={item} disabled={!hasClips} onSelect={onBatchVideo}>
              <ListOrdered className="mt-0.5" aria-hidden />
              <span>
                {t("app-assembly-assembly-toolbar-menus.assembly-more-menu.span.d6d5b8aa43a6")}
                <span className={hint}>
                  {t("app-assembly-assembly-toolbar-menus.assembly-more-menu.span.83312a07b4b1")}
                </span>
              </span>
            </DropdownMenuItem>
          </>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem className={item} disabled={!hasClips} onSelect={onLanguage}>
          <Languages className="mt-0.5" aria-hidden />
          <span>
            {t("app-assembly-assembly-toolbar-menus.assembly-more-menu.span.76e679caba93")}
            <span className={hint}>
              {t("app-assembly-assembly-toolbar-menus.assembly-more-menu.span.991717bc5d88")}
            </span>
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem className={item} disabled={!hasClips} onSelect={onSubtitles}>
          <Captions className="mt-0.5" aria-hidden />
          <span>
            {t("app-assembly-assembly-toolbar-menus.assembly-more-menu.span.73cb3f01c570")}
            <span className={hint}>
              {t("app-assembly-assembly-toolbar-menus.assembly-more-menu.span.c4a4525c233b")}
            </span>
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** «Tekst ▾» (MTS MT6/MT7): ny filmtittel, tekstscene eller rulletekst i filmstrukturen. */
export function AssemblyTextMenu({
  onCreate,
}: {
  onCreate: (kind: "title" | "text" | "credits") => void;
}) {
  const item = "flex items-start gap-2 text-xs";
  const hint = "block text-[11px] text-text-tertiary";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <ToolbarButton
          className="shrink-0"
          data-testid="mts-assembly-text-menu"
          title={t("app-assembly-assembly-toolbar-menus.assembly-text-menu.title.63be1f7caa03")}
        >
          <Type className="size-3.5" aria-hidden />
          {t("app-assembly-assembly-toolbar-menus.assembly-text-menu.toolbar-button.ddcebaf15757")}
          <ChevronDown className="size-3" aria-hidden />
        </ToolbarButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-80">
        <DropdownMenuItem className={item} data-testid="mts-new-title" onSelect={() => onCreate("title")}>
          <Type className="mt-0.5" aria-hidden />
          <span>
            {t("app-assembly-assembly-toolbar-menus.assembly-text-menu.span.b427447d511c")}
            <span className={hint}>
              {t("app-assembly-assembly-toolbar-menus.assembly-text-menu.span.2dcfdcfa50e3")}
            </span>
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem className={item} data-testid="mts-new-text" onSelect={() => onCreate("text")}>
          <Type className="mt-0.5" aria-hidden />
          <span>
            {t("app-assembly-assembly-toolbar-menus.assembly-text-menu.span.3ac0157a7fde")}
            <span className={hint}>
              {t("app-assembly-assembly-toolbar-menus.assembly-text-menu.span.1af01e8ee77b")}
            </span>
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem className={item} data-testid="mts-new-credits" onSelect={() => onCreate("credits")}>
          <ListOrdered className="mt-0.5" aria-hidden />
          <span>
            {t("app-assembly-assembly-toolbar-menus.assembly-text-menu.span.5c715309aeaa")}
            <span className={hint}>
              {t("app-assembly-assembly-toolbar-menus.assembly-text-menu.span.6159c48c3561")}
            </span>
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
