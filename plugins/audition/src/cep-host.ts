/**
 * C-6: Host bygget på CEP. Filer leses og skrives som Base64 via window.cep.fs (CEP 11 og nyere), mapper og
 * filer velges med showOpenDialogEx, og jsx/host.jsx kalles med evalScript. Kilder: Adobe CEP Resources
 * (CEP 12 HTML Extension Cookbook, CSInterface.js) på github.com/Adobe-CEP/CEP-Resources.
 */
import type { CepFsLike, CSInterfaceLike, Host } from "./host";

export const SYSTEM_PATH_USER_DATA = "userData";
const B64 = "Base64";

export function toBase64(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}
export function fromBase64(s: string): Uint8Array {
  const bin = atob(s), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
/** Tekst som trygt kan stå i et ExtendScript-kall: JSON-streng, aldri rå sammenkjeding. */
export const jsxArg = (s: string) => JSON.stringify(s).replace(/\u2028|\u2029/g, " ");
const fileUrlToPath = (p: string) => (p.startsWith("file://") ? decodeURIComponent(p.replace(/^file:\/\//, "")) : p);

export function cepHost(csi: CSInterfaceLike, fs: CepFsLike, opts: { fetch: typeof fetch; random(n: number): Uint8Array }): Host {
  const env = csi.getHostEnvironment();
  const check = (r: { err: number }, what: string) => { if (r.err !== 0) throw new Error(`cep_fs_${what}_${r.err}`); };
  return {
    fetch: opts.fetch, random: opts.random, language: env.appUILocale, hostVersion: env.appVersion,
    userDataDir: `${fileUrlToPath(csi.getSystemPath(SYSTEM_PATH_USER_DATA))}/PenToGlass`,
    openUrl: url => csi.openURLInDefaultBrowser(url),
    async pickFolder(title) { const r = fs.showOpenDialogEx(false, true, title); return r.err === 0 && r.data[0] ? fileUrlToPath(r.data[0]) : null; },
    async pickFiles(title) { const r = fs.showOpenDialogEx(true, false, title, undefined, ["wav", "bwf"]); return r.err === 0 ? r.data.map(fileUrlToPath) : []; },
    async readFile(path) { const r = fs.readFile(path, B64); check(r, "read"); return fromBase64(r.data); },
    async writeFile(path, data) { check(typeof data === "string" ? fs.writeFile(path, data) : fs.writeFile(path, toBase64(data), B64), "write"); },
    async removeFile(path) { fs.deleteFile(path); },
    async makeDir(path) { fs.makedir(path); },
    evalScript: code => new Promise(resolve => csi.evalScript(code, r => resolve(String(r)))),
  };
}
