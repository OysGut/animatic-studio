/**
 * R2: regler for opprydding av foreldreløse AI-filer (valg C, Øystein 21.10.2026). Ren TypeScript.
 * En fil kan ryddes bare når alt dette gjelder:
 *  - den ligger i prosjektets egen mappe for AI-genererte filer (`<prosjekt>/generated/`), aldri opplastede,
 *    midlertidige eller globale filer;
 *  - ingen rad peker på den: materialrader (også fjernede versjoner i «Slettede objekter»), jobber, kvitteringer
 *    og angrehistorikken (`change_log`, kommando og invers). Peker en rad på en fil i samme mappe, beskyttes hele
 *    mappen (siste bilde, miniatyrer o.l. ved siden av);
 *  - ingen jobb eller massejobb er i gang (da returneres ingenting);
 *  - filen er eldre enn 24 timer.
 */
export const ORPHAN_MIN_AGE_MS = 24 * 3_600_000;
export const ORPHAN_MAX_LIST = 200;

/** Mappen for AI-genererte filer i prosjektet (lagringssti, ikke brukervendt tekst). */
export function generatedFolder(projectId: string): string {
  return `${projectId}/generated`;
}

function folderOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i < 0 ? "" : path.slice(0, i);
}

/** Alle prosjektstier som nevnes i en verdi (også inni lengre tekst, som URL-er og JSON). */
export function collectProjectPaths(projectId: string, value: unknown, into: Set<string>, depth = 0): void {
  if (depth > 40 || value == null) return;
  if (typeof value === "string") {
    if (!value.includes(projectId)) return;
    const re = new RegExp(`${projectId.replace(/[-]/g, "\\-")}/[^\\s"'?#<>\\\\]+`, "gi");
    for (const m of value.matchAll(re)) {
      let p = m[0];
      try { p = decodeURIComponent(p); } catch { /* behold rå sti */ }
      into.add(p);
    }
    return;
  }
  if (Array.isArray(value)) { for (const v of value) collectProjectPaths(projectId, v, into, depth + 1); return; }
  if (typeof value === "object") for (const v of Object.values(value as Record<string, unknown>)) collectProjectPaths(projectId, v, into, depth + 1);
}

/** Beskyttede mapper: mappen til hver fil som nevnes. */
export function protectedFolders(paths: Iterable<string>): Set<string> {
  const out = new Set<string>();
  for (const p of paths) out.add(folderOf(p));
  return out;
}

export interface OrphanFile {
  readonly path: string;
  readonly bytes: number;
  readonly createdAt: string;
  readonly mimeType: string | null;
}

/** Kan filen ryddes? */
export function isOrphanAiFile(
  projectId: string,
  file: { readonly path: string; readonly createdAt: string | null },
  protectedPaths: ReadonlySet<string>,
  folders: ReadonlySet<string>,
  now: number,
): boolean {
  const { path, createdAt } = file;
  if (!createdAt || !Number.isFinite(Date.parse(createdAt))) return false;
  if (!path.startsWith(`${generatedFolder(projectId)}/`) || path.includes("..") || path.includes("//")) return false;
  if (now - Date.parse(createdAt) < ORPHAN_MIN_AGE_MS) return false;
  if (protectedPaths.has(path)) return false;
  for (let f = folderOf(path); f.length > generatedFolder(projectId).length; f = folderOf(f)) if (folders.has(f)) return false;
  return true;
}

/**
 * Statusene der jobber og massejobber er avsluttet. Alt annet (i kø, kjører, pause, «klar» som venter på å
 * bli lagt inn) sperrer hele oppryddingen. «lost» er en jobb serveren har gitt opp (regnes som feilet).
 */
export const FINISHED_JOB_STATUSES: ReadonlySet<string> = new Set(["done", "failed", "lost", "skipped", "undone"]);

/** Totalt antall byte. */
export function orphanBytes(files: readonly { readonly bytes: number }[]): number {
  return files.reduce((n, f) => n + (Number.isFinite(f.bytes) && f.bytes > 0 ? f.bytes : 0), 0);
}
