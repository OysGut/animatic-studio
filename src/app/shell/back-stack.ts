/** Historikken for «Tilbake til …» (DEC-0063): rene funksjoner, testet i tests/unit/back-stack.test.ts. */
import { L } from "@/core";

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
  if (path === "/" || path === "") return L("Prosjekter", "Projects");
  if (path.startsWith("/invitasjon")) return L("Invitasjon", "Invitation");
  const m = /^\/prosjekt\/[^/]+(?:\/([^/]+))?/.exec(path);
  if (!m) return L("Forrige side", "Previous page");
  return (
    {
      manus: L("Manus", "Script"),
      bibliotek: L("Ressursbibliotek", "Asset library"),
      scene: L("Sceneeditor", "Scene editor"),
      montering: L("Montering", "Assembly"),
      utgivelse: L("Utgivelse", "Release"),
    }[m[1] ?? ""] ?? L("Prosjektoversikt", "Project overview")
  );
}
