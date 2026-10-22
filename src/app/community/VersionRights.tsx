/** B-114 C0: visning av rettighetene på en ressursversjon. Bare synlig når community.sharing er på for brukeren. */
import type { AssetRights } from "@/core/community";
import { t } from "@/core/i18n/keyed";
import { useFeature } from "./use-feature";

export function VersionRights({ rights }: { rights: AssetRights | undefined }) {
  const sharing = useFeature("community.sharing");
  if (!sharing) return null;
  if (!rights) return <p className="text-[11px] text-text-tertiary" data-testid="version-rights-none">{t("b114.rights.none")}</p>;
  const yes = (v: boolean | undefined) => (v ? t("b114.rights.yes") : t("b114.rights.no"));
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-1 text-[11px] text-text-secondary" data-testid="version-rights">
      {rights.license ? (<><dt>{t("b114.rights.license")}</dt><dd className="truncate">{rights.license}</dd></>) : null}
      {rights.source ? (<><dt>{t("b114.rights.source")}</dt><dd className="truncate">{rights.source}</dd></>) : null}
      {rights.attribution ? (<><dt>{t("b114.rights.attribution")}</dt><dd className="truncate">{rights.attribution}</dd></>) : null}
      <dt>{t("b114.rights.shareable")}</dt><dd>{yes(rights.shareable)}</dd>
      <dt>{t("b114.rights.adaptable")}</dt><dd>{yes(rights.adaptable)}</dd>
    </dl>
  );
}
