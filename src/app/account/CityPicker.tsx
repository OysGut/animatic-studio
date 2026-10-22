/**
 * B-117: valgfri by på kontoen – de største byene i valgt land (GeoNames cities15000, CC BY 4.0).
 * Byene lastes først når feltet vises.
 */
import { useEffect, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { collation } from "@/core";
import { citiesOf, loadCities, type CityData } from "@/core/geo";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { t } from "@/core/i18n/keyed";

export function CityPicker({
  country,
  value,
  onChange,
  id,
  testId = "city-picker",
}: {
  country: string | null;
  value: number | null;
  onChange: (city: number | null) => void;
  id?: string;
  testId?: string;
}) {
  const [data, setData] = useState<CityData | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let alive = true;
    void loadCities().then((d) => alive && setData(d));
    return () => { alive = false; };
  }, []);
  const options = data ? [...citiesOf(data, country)].sort((a, b) => a[1].localeCompare(b[1], collation())) : [];
  const current = value ? options.find((c) => c[0] === value) : undefined;
  return (
    <div className="flex items-center gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            id={id}
            role="combobox"
            aria-expanded={open}
            disabled={!country || !options.length}
            data-testid={testId}
            data-value={value ?? ""}
            className="flex h-8 w-full items-center justify-between gap-2 rounded-sm border border-border-control bg-surface-3 px-2 text-left text-[13px] text-text-primary hover:bg-surface-2 disabled:opacity-50"
          >
            <span className={current ? "truncate" : "truncate text-text-tertiary"}>
              {current ? current[1] : t("b117.city.choose")}
            </span>
            <ChevronDown className="size-3.5 shrink-0 text-text-tertiary" aria-hidden />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-[240px] p-0">
          <Command
            filter={(v, s) => (v.toLocaleLowerCase(collation()).includes(s.toLocaleLowerCase(collation())) ? 1 : 0)}
          >
            <CommandInput placeholder={t("b117.city.search")} data-testid={`${testId}-search`} />
            <CommandList className="max-h-[280px]">
              <CommandEmpty>{t("b117.city.none")}</CommandEmpty>
              {options.map((c) => (
                <CommandItem
                  key={c[0]}
                  value={`${c[1]} ${c[0]}`}
                  data-testid={`${testId}-option-${c[0]}`}
                  onSelect={() => {
                    onChange(c[0]);
                    setOpen(false);
                  }}
                >
                  <span className="flex-1 truncate">{c[1]}</span>
                  {c[0] === value ? <Check className="size-3.5 text-accent-brand" aria-hidden /> : null}
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {value ? (
        <button
          type="button"
          onClick={() => onChange(null)}
          data-testid={`${testId}-clear`}
          title={t("b117.city.clear")}
          aria-label={t("b117.city.clear")}
          className="flex size-8 shrink-0 items-center justify-center rounded-sm text-text-tertiary hover:bg-surface-3 hover:text-text-primary"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
