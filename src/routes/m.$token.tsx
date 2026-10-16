import { createFileRoute } from "@tanstack/react-router";
import { L } from "@/core";
import { MobilePage } from "@/app/mobile/MobilePage";

/**
 * Mobilsiden for QR-koder og delte lenker (fase 2, DEC-0090). Ingen innlogging: tokenet i adressen gir bare
 * rett til å laste opp i sin kontekst.
 */
export const Route = createFileRoute("/m/$token")({
  head: () => ({
    meta: [
      { title: L("Last opp – Animatic Studio", "Upload – Animatic Studio") },
      { name: "robots", content: "noindex, nofollow" }, // i18n-ignore: metakode
      { name: "referrer", content: "no-referrer" }, // i18n-ignore: metakode
    ],
  }),
  component: MobileRoute,
});

function MobileRoute() {
  const { token } = Route.useParams();
  return <MobilePage token={token} />;
}
