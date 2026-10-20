/** Historikken for «Tilbake til …» (DEC-0063): rene funksjoner, testet i tests/unit/back-stack.test.ts. */

import { t } from "@/core/i18n/keyed";

export interface Entry {
  readonly path: string;
  /** Hele adressen med valg (søkeparametre), slik flaten sist ble vist. */
  readonly href: string;
}

const MAX = 50;

/** Registrerer at brukeren er på `href` (ren funksjon over stakken; eksportert for test). */
export function recordVisit(
  list: readonly Entry[],
  path: string,
  href: string,
  back: boolean,
): Entry[] {
  const top = list.at(-1);
  if (top?.path === path)
    return top.href === href ? [...list] : [...list.slice(0, -1), { path, href }];
  // Tilbake (med knappen eller nettleserens tilbake-knapp) til forrige flate: fjern den vi forlot
  if (back || list.at(-2)?.path === path) return [...list.slice(0, -2), { path, href }];
  return [...list, { path, href }].slice(-MAX);
}

/** Navnet på flaten adressen viser. */
export function pageLabel(path: string): string {
  if (path === "/" || path === "") return t("app-shell-back-stack.page-label.message.3fa7f2028d6f");
  if (path.startsWith("/invitasjon")) return t("app-shell-back-stack.page-label.message.4470a8757b28");
  const m = /^\/prosjekt\/[^/]+(?:\/([^/]+))?/.exec(path);
  if (!m) return t("app-shell-back-stack.page-label.message.98aff45e9461");
  return (
    {
      manus: t("app-shell-back-stack.manus.manus.b8d7632aa7f9"),
      bibliotek: t("app-shell-back-stack.bibliotek.bibliotek.e95e5b235aea"),
      scene: t("app-shell-back-stack.scene.scene.e7e46819bc4f"),
      montering: t("app-shell-back-stack.montering.montering.467da07f9011"),
      utgivelse: t("app-shell-back-stack.utgivelse.utgivelse.286bd54a6b6e"),
    }[m[1] ?? ""] ?? t("app-shell-back-stack.page-label.message.27767f2f11ed")
  );
}
