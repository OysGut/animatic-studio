/**
 * C-3: de delene av Premiere Pro- og UXP-API-ene panelet bruker, som smale typer. I Premiere kommer de fra
 * `require("premierepro")` og `require("uxp")` (main.ts); i testene fra en falsk modul. Bare premiere-host.ts
 * kaller Premiere-API-et, så alt annet kan prøves uten Premiere.
 * Kilder: developer.adobe.com/premiere-pro/uxp/ppro_reference/ (Project.getActiveProject, importFiles,
 * getActiveSequence, getVideoTrack, getTrackItems, ClipProjectItem.cast, getMediaFilePath, Markers.getMarkers,
 * TickTime) og developer.adobe.com/premiere-pro/uxp/uxp-api/ (storage, shell, secureStorage).
 */
export interface TickTime { readonly ticks: string | number; readonly seconds?: number }
export interface PproMarker { getName(): string; getComments(): string }
export interface PproMarkers { getMarkers(): PproMarker[] }
export interface PproProjectItem { readonly name?: string }
export interface PproClipProjectItem extends PproProjectItem { getMediaFilePath(): Promise<string> | string }
export interface PproTrackItem {
  getStartTime(): Promise<TickTime> | TickTime;
  getEndTime(): Promise<TickTime> | TickTime;
  getProjectItem(): Promise<PproProjectItem> | PproProjectItem;
}
export interface PproTrack { getTrackItems(type: number, includeEmpty: boolean): PproTrackItem[] | Promise<PproTrackItem[]> }
export interface PproSequence {
  readonly name: string;
  getVideoTrack(index: number): Promise<PproTrack | null> | PproTrack | null;
  getTimebase?(): Promise<string | number> | string | number;
}
export interface PproProject {
  importFiles(paths: string[], suppressUI: boolean, targetBin?: unknown, asNumberedStills?: boolean): Promise<boolean> | boolean;
  getActiveSequence(): Promise<PproSequence | null> | PproSequence | null;
}
export interface PremiereProModule {
  Project: { getActiveProject(): Promise<PproProject | null> | PproProject | null };
  ClipProjectItem: { cast(item: PproProjectItem): PproClipProjectItem | null };
  Markers: { getMarkers(item: PproProjectItem): Promise<PproMarkers> | PproMarkers };
  Constants: { TrackItemType: { CLIP: number } };
}
export interface UxpFile { name: string; nativePath: string; read(o: { format: unknown }): Promise<ArrayBuffer | string>; write(d: ArrayBuffer | string, o: { format: unknown }): Promise<unknown> }
export interface UxpFolder { nativePath?: string; createFile(name: string, o: { overwrite: boolean }): Promise<UxpFile>; getEntry(name: string): Promise<UxpFile> }
export interface UxpModule {
  storage: {
    localFileSystem: { getFolder(): Promise<UxpFolder | null>; getDataFolder(): Promise<UxpFolder> };
    formats: { binary: unknown; utf8: unknown };
    secureStorage: { getItem(k: string): Promise<Uint8Array | null | undefined>; setItem(k: string, v: Uint8Array | string): Promise<void>; removeItem(k: string): Promise<void> };
  };
  shell: { openExternal(url: string, message?: string): Promise<unknown> };
}
export interface Host { ppro: PremiereProModule; uxp: UxpModule; fetch: typeof fetch; random(n: number): Uint8Array; language: string; hostVersion: string }
