import { createFileRoute } from "@tanstack/react-router";
import { L } from "@/core";
import { MobilePage } from "@/app/mobile/MobilePage";

/**
 * Mobilsiden for QR-koder og delte lenker (fase 2, DEC-0090). Ingen innlogging: tokenet i adressen gir bare
 * rett til å laste opp i sin kontekst.
 */
export const Route = createFileRoute("/m/$token")({
  head: () => ({ meta: [
    { title: L("Last opp – Animatic Studio", "Upload – Animatic Studio") },
    { name: "description", content: L("Last opp materiale til et prosjekt i Animatic Studio.", "Upload material to an Animatic Studio project.") },
    { property: "og:title", content: L("Last opp – Animatic Studio", "Upload – Animatic Studio") }, // i18n-ignore: metakode
    { property: "og:description", content: L("Last opp materiale til et prosjekt i Animatic Studio.", "Upload material to an Animatic Studio project.") }, // i18n-ignore: metakode
    { property: "og:type", content: "website" }, // i18n-ignore: metakode
    { name: "twitter:card", content: "summary" }, // i18n-ignore: metakode
    { name: "robots", content: "noindex, nofollow" }, // i18n-ignore: metakode
    { name: "referrer", content: "no-referrer" }, // i18n-ignore: metakode
  ] }),
  component: MobileRoute,
});

function MobileRoute() {
  const { token } = Route.useParams();
  return <MobilePage token={token} />;
}
