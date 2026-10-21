import { createFileRoute } from "@tanstack/react-router";
import { FilmPlayerPage } from "@/app/share/FilmPlayerPage";
import { LanguageSwitch, useLanguage } from "@/app/i18n/language";
import { t } from "@/core/i18n/keyed";

/**
 * Offentlig visningsside for en delt filmversjon (GP5). Ingen innlogging; nøkkelen gir bare filmen.
 * noindex, ingen henvisning (referrer) og ingen tredjepartsskript.
 */
export const Route = createFileRoute("/se/$token")({
  head: () => ({ meta: [
    { title: t("routes-se-token.title.title.daa9a7b91a74") },
    { name: "description", content: t("routes-se-token.content.content.0c933cbe6ab9") },
    { property: "og:title", content: t("routes-se-token.content.content.450bbeb07eba") }, // i18n-ignore: metakode
    { property: "og:description", content: t("routes-se-token.content.content.0c933cbe6ab9.2") }, // i18n-ignore: metakode
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
  return <><div className="flex justify-end bg-bg-app p-2"><LanguageSwitch compact /></div><FilmPlayerPage token={token} /></>;
}
