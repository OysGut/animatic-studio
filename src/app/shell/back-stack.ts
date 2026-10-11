/** Historikken for «Tilbake til …» (DEC-0063): rene funksjoner, testet i tests/unit/back-stack.test.ts. */

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
  if (path === "/" || path === "") return "Prosjekter";
  if (path.startsWith("/invitasjon")) return "Invitasjon";
  const m = /^\/prosjekt\/[^/]+(?:\/([^/]+))?/.exec(path);
  if (!m) return "Forrige side";
  return (
    {
      manus: "Manus",
      bibliotek: "Ressursbibliotek",
      scene: "Sceneeditor",
      montering: "Montering",
      utgivelse: "Utgivelse",
    }[m[1] ?? ""] ?? "Prosjektoversikt"
  );
}
