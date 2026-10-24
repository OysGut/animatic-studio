/**
 * Alt som endrer Photoshop går gjennom `core.executeAsModal` (påkrevd for endringer siden PS 23), og
 * dokumentinfo leses med `action.batchPlay` «get» uten dialoger. PSD lagres med lag, alfakanaler og
 * innebygd fargeprofil; oppløsningen følger dokumentet uendret.
 */
import type { Host, PsDocument, UxpFile } from "./host";

export interface DocInfo { readonly width: number; readonly height: number; readonly resolution: number; readonly colorProfile: string | null; readonly mode: string | null; readonly layerCount: number | null }

export async function openBytes(host: Host, fileName: string, bytes: Uint8Array, commandName: string): Promise<PsDocument> {
  const tmp = await host.uxp.storage.localFileSystem.getTemporaryFolder();
  const file = await tmp.createFile(fileName, { overwrite: true });
  await file.write(bytes.slice().buffer, { format: host.uxp.storage.formats.binary });
  return host.ps.core.executeAsModal(() => host.ps.app.open(file), { commandName });
}

export async function describe(host: Host, doc: PsDocument): Promise<DocInfo> {
  const [r] = await host.ps.action.batchPlay([
    { _obj: "get", _target: [{ _ref: "document", _id: doc.id }], _options: { dialogOptions: "dontDisplay" } },
  ], { synchronousExecution: false, modalBehavior: "execute" });
  const num = (v: unknown) => typeof v === "number" ? v : v && typeof v === "object" && typeof (v as { _value?: unknown })._value === "number" ? (v as { _value: number })._value : null;
  const str = (v: unknown) => typeof v === "string" ? v : v && typeof v === "object" && typeof (v as { _value?: unknown })._value === "string" ? (v as { _value: string })._value : null;
  return {
    width: num(r?.["width"]) ?? doc.width,
    height: num(r?.["height"]) ?? doc.height,
    resolution: num(r?.["resolution"]) ?? doc.resolution,
    colorProfile: str(r?.["profile"]),
    mode: str(r?.["mode"]) ?? doc.mode ?? null,
    layerCount: num(r?.["numberOfLayers"]),
  };
}

/** Lagrer en kopi som PSD (dokumentet beholder sin egen sti) og returnerer bytene. */
export async function savePsdCopy(host: Host, doc: PsDocument, fileName: string, commandName: string): Promise<Uint8Array> {
  const tmp = await host.uxp.storage.localFileSystem.getTemporaryFolder();
  const file: UxpFile = await tmp.createFile(fileName, { overwrite: true });
  await host.ps.core.executeAsModal(() => doc.saveAs.psd(file, { embedColorProfile: true, alphaChannels: true, layers: true, maximizeCompatibility: true }, true), { commandName });
  const data = await file.read({ format: host.uxp.storage.formats.binary });
  if (typeof data === "string") throw new Error("binary");
  return new Uint8Array(data);
}

/** Flat PNG-kopi med gjennomsiktighet (reserve når prosjektet ikke kan lagre PSD som versjon). */
export async function savePngCopy(host: Host, doc: PsDocument, fileName: string, commandName: string): Promise<Uint8Array> {
  const tmp = await host.uxp.storage.localFileSystem.getTemporaryFolder();
  const file: UxpFile = await tmp.createFile(fileName, { overwrite: true });
  await host.ps.core.executeAsModal(() => doc.saveAs.png(file, { compression: 6, interlaced: false }, true), { commandName });
  const data = await file.read({ format: host.uxp.storage.formats.binary });
  if (typeof data === "string") throw new Error("binary");
  return new Uint8Array(data);
}
