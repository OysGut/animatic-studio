/**
 * C-6: det Audition-panelet trenger fra omgivelsene, som smale typer. I Audition kommer det fra CEP
 * (CSInterface + window.cep.fs, se cep-host.ts) og ExtendScript (jsx/host.jsx); i testene fra en falsk modell.
 * Bare cep-host.ts kjenner CEP, så resten kan prøves uten Audition.
 */
export interface Host {
  fetch: typeof fetch;
  random(n: number): Uint8Array;
  language: string;
  hostVersion: string;
  /** Mappe der panelet kan lagre sin egen innloggingsfil (Auditions brukerdata for utvidelsen). */
  userDataDir: string;
  openUrl(url: string): void;
  pickFolder(title: string): Promise<string | null>;
  pickFiles(title: string): Promise<string[]>;
  readFile(path: string): Promise<Uint8Array>;
  writeFile(path: string, data: Uint8Array | string): Promise<void>;
  removeFile(path: string): Promise<void>;
  makeDir(path: string): Promise<void>;
  /** Kjører en funksjon i jsx/host.jsx og returnerer svaret som tekst. */
  evalScript(code: string): Promise<string>;
}

/** De delene av Adobes CSInterface.js og window.cep.fs panelet bruker. */
export interface CSInterfaceLike {
  evalScript(script: string, callback?: (result: string) => void): void;
  openURLInDefaultBrowser(url: string): void;
  getSystemPath(type: string): string;
  getHostEnvironment(): { appVersion: string; appUILocale: string };
}
export interface CepFsLike {
  readFile(path: string, encoding?: string): { err: number; data: string };
  writeFile(path: string, data: string, encoding?: string): { err: number };
  deleteFile(path: string): { err: number };
  makedir(path: string): { err: number };
  showOpenDialogEx(allowMultiple: boolean, chooseDirectory: boolean, title: string, initialPath?: string, fileTypes?: string[]): { err: number; data: string[] };
}
