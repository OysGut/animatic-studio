/**
 * Stier i lagringen, atskilt per kategori (KI-178, REQ-0415, Mars 15.10.2026: «Bra valg, vi skiller»).
 * Nye filer legges i en egen mappe per kategori rett under prosjektmappen:
 *   <prosjekt>/source/<ressurs>/<versjon>/<fil>      opplastede bilder og lyd (kildemedier)
 *   <prosjekt>/source/films/<take>/<fil>             importert film
 *   <prosjekt>/generated/<ressurs>/<versjon>/<fil>   bilder, lyd og tale laget med AI
 *   <prosjekt>/generated/films/<take>/<fil>          AI-video
 *   <prosjekt>/temp/ai-source/<bunt>/<fil>           2D-scenen lagt klar for AI-video (midlertidig)
 * Eldre filer (uten kategorimappe) flyttes ikke – lenkene til dem ville da brutt – og leses som før.
 * Prosjekt-ID-en er alltid første del av stien (tilgangsreglene i lagringen bygger på den).
 */

export type StoredCategory = "source" | "generated" | "temp";

/** Mappenavnene i lagringen (ikke brukervendt tekst). */
export const STORAGE_FOLDER: Readonly<Record<StoredCategory, string>> = {
  source: "source",
  generated: "generated",
  temp: "temp",
};

const ID = "[0-9a-f-]{36}";

export function assetFilePath(
  projectId: string,
  category: "source" | "generated",
  assetId: string,
  versionId: string,
  fileName: string,
): string {
  return `${projectId}/${STORAGE_FOLDER[category]}/${assetId}/${versionId}/${fileName}`;
}

export function filmFilePath(
  projectId: string,
  category: "source" | "generated",
  takeId: string,
  fileName: string,
): string {
  return `${projectId}/${STORAGE_FOLDER[category]}/films/${takeId}/${fileName}`;
}

/** Kategorimappen i stien, eller null for eldre filer uten kategori. */
export function storedCategoryOf(path: string): StoredCategory | null {
  const seg = path.split("/")[1];
  return seg === "source" || seg === "generated" || seg === "temp" ? seg : null;
}

/** Stien uten kategorimappen (samme form som eldre stier), så tolkningen under virker for begge. */
function plain(path: string): string {
  const parts = path.split("/");
  return storedCategoryOf(path) ? [parts[0], ...parts.slice(2)].join("/") : path;
}

/** Versjons-ID-en i en ressursfil (`<prosjekt>[/<kategori>]/<ressurs>/<versjon>/fil`), eller null. */
export function assetVersionIdOfPath(path: string): string | null {
  const id = plain(path).split("/")[2] ?? "";
  return new RegExp(`^${ID}$`, "i").test(id) ? id : null;
}

/** Take-ID-en i en filmfil (`<prosjekt>[/<kategori>]/films/<take>/fil`), eller null. */
export function takeIdOfFilmPath(path: string): string | null {
  const [, folder, id] = plain(path).split("/");
  return folder === "films" && id && new RegExp(`^${ID}$`, "i").test(id) ? id : null;
}

/** Stien til siste bilde ved siden av en filmfil (samme mappe), eller null. */
export function lastFrameOfFilmPath(path: string): string | null {
  const m = new RegExp(`^(${ID})/((?:source|generated)/)?films/(${ID})/[^/]+$`, "i").exec(path);
  // i18n-ignore: lagringssti
  return m ? `${m[1]}/${m[2] ?? ""}films/${m[3]}/last-frame.png` : null;
}

/** Take-ID-en hvis stien er et «siste bilde» i prosjektet, ellers null. */
export function takeIdOfLastFrame(projectId: string, path: string): string | null {
  const m = new RegExp(
    `^(${ID})/(?:(?:source|generated)/)?films/(${ID})/last-frame\\.png$`,
    "i",
  ).exec(path);
  return m && m[1] === projectId ? m[2]! : null;
}
