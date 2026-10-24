/**
 * C-2: de delene av Photoshop- og UXP-API-ene pluginen bruker, som smale typer. I Photoshop kommer de fra
 * `require("photoshop")` og `require("uxp")` (main.ts); i testene fra en falsk modul. Ingen andre filer
 * kaller Adobe-API-er direkte, så alt kan prøves uten Photoshop.
 * Kilder: developer.adobe.com/photoshop/uxp/2022/ps_reference/ (app, core.executeAsModal, action.batchPlay,
 * Document.saveAs.psd) og developer.adobe.com/photoshop/uxp/2022/uxp-api/reference-js/Modules/uxp/ (storage, shell).
 */
export interface UxpFile { name: string; nativePath?: string; read(o: { format: unknown }): Promise<ArrayBuffer | string>; write(d: ArrayBuffer | string, o: { format: unknown }): Promise<unknown> }
export interface UxpFolder { createFile(name: string, o: { overwrite: boolean }): Promise<UxpFile>; getEntry(name: string): Promise<UxpFile> }
export interface PsDocument {
  id: number; name: string; width: number; height: number; resolution: number; mode?: string;
  saveAs: { psd(file: UxpFile, options: { embedColorProfile: boolean; alphaChannels: boolean; layers: boolean; maximizeCompatibility?: boolean }, asCopy: boolean): Promise<void> };
}
export interface PhotoshopModule {
  app: { activeDocument: PsDocument | null; open(file: UxpFile): Promise<PsDocument> };
  core: { executeAsModal<T>(fn: (ctx: unknown) => Promise<T>, o: { commandName: string }): Promise<T> };
  action: { batchPlay(desc: object[], o: object): Promise<Record<string, unknown>[]> };
}
export interface UxpModule {
  storage: {
    localFileSystem: { getTemporaryFolder(): Promise<UxpFolder>; getDataFolder(): Promise<UxpFolder> };
    formats: { binary: unknown; utf8: unknown };
    secureStorage: { getItem(k: string): Promise<Uint8Array | null | undefined>; setItem(k: string, v: Uint8Array | string): Promise<void>; removeItem(k: string): Promise<void> };
  };
  shell: { openExternal(url: string, message?: string): Promise<unknown> };
}
export interface Host { ps: PhotoshopModule; uxp: UxpModule; fetch: typeof fetch; random(n: number): Uint8Array; language: string }
