/** Byggets versjon (Øystein 23.10): commit og tidspunkt settes ved byggetid, ellers «dev». */
const env = import.meta.env as Record<string, string | undefined>;
export const BUILD_SHA: string = env["VITE_BUILD_SHA"] || "dev";
export const BUILD_TIME: string = env["VITE_BUILD_TIME"] || "dev";
/** Kort commit (7 tegn) til ID-merket. */
export const BUILD_SHA_SHORT: string = BUILD_SHA === "dev" ? "dev" : BUILD_SHA.slice(0, 7);
