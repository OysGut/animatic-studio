import { createFileRoute } from "@tanstack/react-router";
import { L } from "@/core/i18n";
import { FilmPlayerPage } from "@/app/share/FilmPlayerPage";
import { useLanguage } from "@/app/i18n/language";

/**
 * Offentlig visningsside for en delt filmversjon (GP5). Ingen innlogging; nøkkelen gir bare filmen.
 * noindex, ingen henvisning (referrer) og ingen tredjepartsskript.
 */
export const Route = createFileRoute("/se/$token")({
  head: () => ({ meta: [
    { title: L("Film – Animatic Studio", "Film – Animatic Studio") },
    { name: "description", content: L("Se en film som er delt fra Animatic Studio.", "Watch a film shared from Animatic Studio.") },
    { property: "og:title", content: L("Film – Animatic Studio", "Film – Animatic Studio") }, // i18n-ignore: metakode
    { property: "og:description", content: L("Se en film som er delt fra Animatic Studio.", "Watch a film shared from Animatic Studio.") }, // i18n-ignore: metakode
    { property: "og:type", content: "video.other" }, // i18n-ignore: metakode
    { name: "twitter:card", content: "summary" }, // i18n-ignore: metakode
    { name: "robots", content: "noindex, nofollow" }, // i18n-ignore: metakode
    { name: "referrer", content: "no-referrer" }, // i18n-ignore: metakode
  ] }),
  component: FilmRoute,
});

function FilmRoute() {
  useLanguage(); // ML2a: tegnes på nytt ved språkbytte uten remontering
  const { token } = Route.useParams();
  return <FilmPlayerPage token={token} />;
}
