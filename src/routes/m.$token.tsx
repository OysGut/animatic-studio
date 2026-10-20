import { createFileRoute } from "@tanstack/react-router";
import { L } from "@/core";
import { MobilePage } from "@/app/mobile/MobilePage";
import { useLanguage } from "@/app/i18n/language";
import { t } from "@/core/i18n/keyed";

/**
 * Mobilsiden for QR-koder og delte lenker (fase 2, DEC-0090). Ingen innlogging: tokenet i adressen gir bare
 * rett til å laste opp i sin kontekst.
 */
export const Route = createFileRoute("/m/$token")({
  head: () => ({ meta: [
    { title: t("routes-m-token.title.title.5c1d0ff564a2") },
    { name: "description", content: t("routes-m-token.content.content.e9b3848a0c50") },
    { property: "og:title", content: t("routes-m-token.content.content.0b31cbc4811d") }, // i18n-ignore: metakode
    { property: "og:description", content: t("routes-m-token.content.content.e9b3848a0c50.2") }, // i18n-ignore: metakode
    { property: "og:type", content: "website" }, // i18n-ignore: metakode
    { name: "twitter:card", content: "summary" }, // i18n-ignore: metakode
    { name: "robots", content: "noindex, nofollow" }, // i18n-ignore: metakode
    { name: "referrer", content: "no-referrer" }, // i18n-ignore: metakode
  ] }),
  component: MobileRoute,
});

function MobileRoute() {
  useLanguage(); // ML2a: tegnes på nytt ved språkbytte uten remontering
  const { token } = Route.useParams();
  return <MobilePage token={token} />;
}
