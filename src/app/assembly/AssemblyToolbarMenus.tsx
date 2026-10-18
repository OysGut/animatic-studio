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
          title={L(
            "Svart-hvitt, teknisk visning og eget vindu",
            "Black and white, technical view and own window",
          )}
        >
          <SlidersHorizontal className="size-3.5" aria-hidden />
          {L("Visning", "View")}
          {changed ? (
            <>
              <span className="size-1.5 rounded-full bg-accent-brand" aria-hidden />
              <span className="sr-only">{L("(endret)", "(changed)")}</span>
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
          label={L("Svart-hvitt", "Black and white")}
          hint={L(
            "Hele filmen i svart-hvitt (foreslås også i eksporten). Enkeltscener settes i panelet.",
            "The whole film in black and white (also suggested in the export). Single scenes are set in the panel.",
          )}
        />
        <ViewToggle
          checked={technical}
          onChange={onTechnical}
          icon={<Binary className="size-3.5" aria-hidden />}
          label={L("Teknisk visning", "Technical view")}
          hint={L(
            "Tidskoder, bildenummer og filinformasjon for scenen og delene.",
            "Timecodes, frame numbers and file information for the scene and its parts.",
          )}
        />
        <ViewToggle
          checked={popout}
          onChange={onPopout}
          disabled={!hasClips}
          icon={<ExternalLink className="size-3.5" aria-hidden />}
          label={L("Eget vindu", "Own window")}
          hint={L(
            "Filmen i et eget vindu, f.eks. på en annen skjerm.",
            "The film in its own window, e.g. on another screen.",
          )}
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
          title={L(
            "Standardovergang, lang film, video for flere scener, språkversjon og undertekster",
            "Standard transition, long film, video for several scenes, language version and subtitles",
          )}
        >
          <Ellipsis className="size-3.5" aria-hidden />
          {L("Mer", "More")}
          <ChevronDown className="size-3" aria-hidden />
        </ToolbarButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuItem className={item} onSelect={onStandardTransition}>
          <Blend className="mt-0.5" aria-hidden />
          <span>
            {L("Standardovergang …", "Standard transition …")}
            <span className={hint}>
              {L(
                "Overgangen alle scener får når de ikke har sin egen",
                "The transition every scene gets when it has none of its own",
              )}
            </span>
          </span>
        </DropdownMenuItem>
        {editable ? (
          <>
            <DropdownMenuItem className={item} disabled={!hasClips} onSelect={onLongFilm}>
              <Film className="mt-0.5" aria-hidden />
              <span>
                {L("Importer lang film …", "Import long film …")}
                <span className={hint}>
                  {L(
                    "Én filmfil som dekker flere scener: last opp én gang og del den på scenene",
                    "One film file covering several scenes: upload it once and split it across the scenes",
                  )}
                </span>
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem className={item} disabled={!hasClips} onSelect={onBatchVideo}>
              <ListOrdered className="mt-0.5" aria-hidden />
              <span>
                {L("Video for flere scener …", "Video for several scenes …")}
                <span className={hint}>
                  {L(
                    "AI-video for flere scener på én gang (legges i kø, kostnaden vises først)",
                    "AI video for several scenes at once (queued, the cost is shown first)",
                  )}
                </span>
              </span>
            </DropdownMenuItem>
          </>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem className={item} disabled={!hasClips} onSelect={onLanguage}>
          <Languages className="mt-0.5" aria-hidden />
          <span>
            {L("Språkversjon …", "Language version …")}
            <span className={hint}>
              {L(
                "Engelsk versjon: oversettelse, dialoglyd, timing og leppesynk scene for scene",
                "English version: translation, dialogue audio, timing and lip sync scene by scene",
              )}
            </span>
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem className={item} disabled={!hasClips} onSelect={onSubtitles}>
          <Captions className="mt-0.5" aria-hidden />
          <span>
            {L("Undertekster …", "Subtitles …")}
            <span className={hint}>
              {L(
                "Undertekster (.srt eller .vtt) på norsk eller engelsk",
                "Subtitles (.srt or .vtt) in Norwegian or English",
              )}
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
          title={L(
            "Filmtittel, tekstscene eller rulletekst – egne deler av filmen, aldri manusscener",
            "Film title, text scene or credits – separate parts of the film, never script scenes",
          )}
        >
          <Type className="size-3.5" aria-hidden />
          {L("Tekst", "Text")}
          <ChevronDown className="size-3" aria-hidden />
        </ToolbarButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-80">
        <DropdownMenuItem className={item} data-testid="mts-new-title" onSelect={() => onCreate("title")}>
          <Type className="mt-0.5" aria-hidden />
          <span>
            {L("Ny filmtittel", "New film title")}
            <span className={hint}>
              {L(
                "Tittelen med sider, bokstavanimasjon, logoer og eget lydspor",
                "The title with pages, letter animation, logos and its own soundtrack",
              )}
            </span>
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem className={item} data-testid="mts-new-text" onSelect={() => onCreate("text")}>
          <Type className="mt-0.5" aria-hidden />
          <span>
            {L("Ny tekstscene", "New text scene")}
            <span className={hint}>
              {L(
                "En tekstscene mellom scenene, uten bilde av teksten",
                "A text scene between the scenes, without a picture of the text",
              )}
            </span>
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem className={item} data-testid="mts-new-credits" onSelect={() => onCreate("credits")}>
          <ListOrdered className="mt-0.5" aria-hidden />
          <span>
            {L("Ny rulletekst", "New credits")}
            <span className={hint}>
              {L(
                "Rulletekst med eget deltakerregister, presentasjonsform og lydspor",
                "Credits with their own list of participants, presentation and soundtrack",
              )}
            </span>
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
