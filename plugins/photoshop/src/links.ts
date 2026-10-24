/**
 * Kobling mellom et åpent Photoshop-dokument og ressursversjonen det ble åpnet fra (revisjonsgrunnlaget).
 * Lagres som vanlig JSON i pluginens datamappe (ingen hemmeligheter), nøklet på filnavnet pluginen ga
 * dokumentet, så koblingen overlever omstart av Photoshop.
 */
import type { UxpModule } from "./host";

export interface DocLink {
  readonly projectId: string; readonly assetId: string; readonly variantId: string;
  readonly baseVersionId: string; readonly baseNumber: number; readonly assetName: string;
  readonly fileName: string; readonly openedAt: string;
}
const FILE = "links.json";
const MAX_LINKS = 200;

/** Filnavnet dokumentet får ved åpning: lesbart navn + kort versjons-ID, så det er unikt og gjenkjennelig. */
export function linkFileName(assetName: string, versionNumber: number, versionId: string, ext: "psd" | "png"): string {
  const base = assetName.normalize("NFC").replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "_").trim().slice(0, 60) || "asset";
  return `${base}-v${versionNumber}-${versionId.replace(/-/g, "").slice(0, 8)}.${ext}`;
}

export function linkKey(docName: string): string { return docName.replace(/\.(psd|png)$/i, "").toLowerCase(); }

export function rememberLink(all: Record<string, DocLink>, link: DocLink): Record<string, DocLink> {
  const next = { ...all, [linkKey(link.fileName)]: link };
  const keys = Object.keys(next).sort((a, b) => next[a]!.openedAt.localeCompare(next[b]!.openedAt));
  while (keys.length > MAX_LINKS) delete next[keys.shift()!];
  return next;
}

export async function loadLinks(uxp: UxpModule): Promise<Record<string, DocLink>> {
  try {
    const f = await (await uxp.storage.localFileSystem.getDataFolder()).getEntry(FILE);
    const v = JSON.parse(String(await f.read({ format: uxp.storage.formats.utf8 })));
    return v && typeof v === "object" ? v as Record<string, DocLink> : {};
  } catch { return {}; }
}
export async function saveLinks(uxp: UxpModule, links: Record<string, DocLink>): Promise<void> {
  const f = await (await uxp.storage.localFileSystem.getDataFolder()).createFile(FILE, { overwrite: true });
  await f.write(JSON.stringify(links), { format: uxp.storage.formats.utf8 });
}
