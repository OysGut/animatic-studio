/**
 * B-097: kundeoversikt for administrator – antall brukere per land. Bare aggregert: ingen navn eller e-post.
 */
import { useQuery } from "@tanstack/react-query";
import { countryName } from "@/core";
import { fetchCountryCounts } from "@/adapters/browser/account";
import { useLanguage } from "@/app/i18n/language";
import { t } from "@/core/i18n/keyed";

export function CountryStats() {
  const language = useLanguage();
  const q = useQuery({ queryKey: ["admin-country-counts"], queryFn: fetchCountryCounts, staleTime: 60_000 });
  const rows = q.data ?? null;
  const total = rows?.reduce((n, r) => n + r.users, 0) ?? 0;
  return (
    <section className="flex flex-col gap-2 rounded-md border border-border bg-surface-1 p-4" data-testid="admin-country-stats">
      <h2 className="text-sm font-semibold text-text-primary">{t("b097.admin.title")}</h2>
      <p className="text-xs text-text-tertiary">{t("b097.admin.note")}</p>
      {rows === null ? (
        <p className="text-xs text-text-tertiary">{q.isLoading ? t("b097.admin.loading") : t("b097.admin.unavailable")}</p>
      ) : (
        <table className="w-full max-w-[420px] text-[13px]">
          <thead>
            <tr className="text-left text-xs text-text-tertiary">
              <th className="py-1 font-normal">{t("b097.country.label")}</th>
              <th className="py-1 text-right font-normal">{t("b097.admin.users")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.country ?? "none"} className="border-t border-border" data-testid="admin-country-row" data-country={r.country ?? ""}>
                <td className="py-1 text-text-primary">{r.country ? countryName(r.country, language) : t("b097.admin.no-country")}</td>
                <td className="py-1 text-right tabular-nums text-text-primary">{r.users}</td>
              </tr>
            ))}
            <tr className="border-t border-border font-medium">
              <td className="py-1 text-text-secondary">{t("b097.admin.total")}</td>
              <td className="py-1 text-right tabular-nums text-text-primary">{total}</td>
            </tr>
          </tbody>
        </table>
      )}
    </section>
  );
}
