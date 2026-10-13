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
} from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
        <Button
          size="sm"
          variant="ghost"
          className="h-7 shrink-0 gap-1 whitespace-nowrap px-2 text-xs"
          title="Svart-hvitt, teknisk visning og eget vindu"
        >
          <SlidersHorizontal className="size-3.5" aria-hidden />
          Visning
          {changed ? (
            <>
              <span className="size-1.5 rounded-full bg-accent-brand" aria-hidden />
              <span className="sr-only">(endret)</span>
            </>
          ) : null}
          <ChevronDown className="size-3" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-72 flex-col gap-1 p-2">
        <ViewToggle
          checked={monochrome}
          onChange={onMonochrome}
          icon={<Contrast className="size-3.5" aria-hidden />}
          label="Svart-hvitt"
          hint="Hele filmen i svart-hvitt (foreslås også i eksporten). Enkeltscener settes i panelet."
        />
        <ViewToggle
          checked={technical}
          onChange={onTechnical}
          icon={<Binary className="size-3.5" aria-hidden />}
          label="Teknisk visning"
          hint="Tidskoder, bildenummer og filinformasjon for scenen og delene."
        />
        <ViewToggle
          checked={popout}
          onChange={onPopout}
          disabled={!hasClips}
          icon={<ExternalLink className="size-3.5" aria-hidden />}
          label="Eget vindu"
          hint="Filmen i et eget vindu, f.eks. på en annen skjerm."
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
        <Button
          size="sm"
          variant="ghost"
          className="h-7 shrink-0 gap-1 whitespace-nowrap px-2 text-xs"
          title="Standardovergang, lang film, video for flere scener, språkversjon og undertekster"
        >
          <Ellipsis className="size-3.5" aria-hidden />
          Mer
          <ChevronDown className="size-3" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuItem className={item} onSelect={onStandardTransition}>
          <Blend className="mt-0.5" aria-hidden />
          <span>
            Standardovergang …
            <span className={hint}>Overgangen alle scener får når de ikke har sin egen</span>
          </span>
        </DropdownMenuItem>
        {editable ? (
          <>
            <DropdownMenuItem className={item} disabled={!hasClips} onSelect={onLongFilm}>
              <Film className="mt-0.5" aria-hidden />
              <span>
                Importer lang film …
                <span className={hint}>
                  Én filmfil som dekker flere scener: last opp én gang og del den på scenene
                </span>
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem className={item} disabled={!hasClips} onSelect={onBatchVideo}>
              <ListOrdered className="mt-0.5" aria-hidden />
              <span>
                Video for flere scener …
                <span className={hint}>
                  AI-video for flere scener på én gang (legges i kø, kostnaden vises først)
                </span>
              </span>
            </DropdownMenuItem>
          </>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem className={item} disabled={!hasClips} onSelect={onLanguage}>
          <Languages className="mt-0.5" aria-hidden />
          <span>
            Språkversjon …
            <span className={hint}>
              Engelsk versjon: oversettelse, dialoglyd, timing og leppesynk scene for scene
            </span>
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem className={item} disabled={!hasClips} onSelect={onSubtitles}>
          <Captions className="mt-0.5" aria-hidden />
          <span>
            Undertekster …
            <span className={hint}>Undertekster (.srt eller .vtt) på norsk eller engelsk</span>
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
