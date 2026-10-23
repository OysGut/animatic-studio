/**
 * B-097: søkbart landvalg (ISO 3166-1 alpha-2). Navnene kommer fra Intl.DisplayNames på språket i
 * grensesnittet og sorteres etter det språket.
 */
import { useMemo, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { COUNTRY_CODES, collation, countryName } from "@/core";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useLanguage } from "@/app/i18n/language";
import { t } from "@/core/i18n/keyed";

export function CountryPicker({
  value,
  onChange,
  id,
  invalid,
  testId = "country-picker",
}: {
  value: string | null;
  onChange: (code: string) => void;
  id?: string;
  invalid?: boolean;
  testId?: string;
}) {
  const language = useLanguage();
  const [open, setOpen] = useState(false);
  const options = useMemo(
    () =>
      COUNTRY_CODES.map((code) => ({ code, name: countryName(code, language) })).sort((a, b) =>
        a.name.localeCompare(b.name, collation()),
      ),
    [language],
  );
  const current = value ? options.find((o) => o.code === value) : undefined;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid || undefined}
          data-testid={testId}
          data-value={value ?? ""}
          className={
            "flex h-8 w-full items-center justify-between gap-2 rounded-sm border bg-surface-3 px-2 text-left text-[13px] text-text-primary hover:bg-surface-2 " +
            (invalid ? "border-status-danger" : "border-border-control")
          }
        >
          <span className={current ? "truncate" : "truncate text-text-tertiary"}>
            {current ? current.name : t("b097.country.choose")}
          </span>
          <ChevronDown className="size-3.5 shrink-0 text-text-tertiary" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent uiId="V-024" align="start" className="w-[var(--radix-popover-trigger-width)] min-w-[260px] p-0">
        <Command
          filter={(itemValue, search) =>
            itemValue.toLocaleLowerCase(collation()).includes(search.toLocaleLowerCase(collation())) ? 1 : 0
          }
        >
          <CommandInput placeholder={t("b097.country.search")} data-testid={`${testId}-search`} />
          <CommandList className="max-h-[280px]">
            <CommandEmpty>{t("b097.country.none")}</CommandEmpty>
            {options.map((o) => (
              <CommandItem
                key={o.code}
                value={`${o.name} ${o.code}`}
                data-testid={`${testId}-option-${o.code}`}
                onSelect={() => {
                  onChange(o.code);
                  setOpen(false);
                }}
              >
                <span className="flex-1 truncate">{o.name}</span>
                <span className="font-mono text-[11px] text-text-tertiary">{o.code}</span>
                {o.code === value ? <Check className="size-3.5 text-accent-brand" aria-hidden /> : null}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
