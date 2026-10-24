/**
 * C-7: IllustratorHost over ExtendScript (CEP). Hvert kall er én funksjon i jsx/host.jsx med JSON-strenger som
 * argumenter (jsxArg), aldri rå sammenkjeding. Svarene er enkle tekster: «ok», «err:…» eller «navn|b|h|lag».
 */
import { jsxArg } from "../../audition/src/cep-host";
import type { DocInfo, IllustratorHost } from "./host";

export function cepIllustrator(evalScript: (code: string) => Promise<string>): IllustratorHost {
  const ok = async (code: string) => (await evalScript(code)) === "ok";
  return {
    openSvg: (path, dpi) => ok(`ptgOpenSvg(${jsxArg(path)},${Math.round(dpi)})`),
    saveAi: path => ok(`ptgSaveAi(${jsxArg(path)})`),
    async readLink() { const r = await evalScript("ptgReadLink()"); return r.startsWith("link:") ? r.slice(5) : null; },
    writeLink: json => ok(`ptgWriteLink(${jsxArg(json)})`),
    exportPng: (path, w, h) => ok(`ptgExportPng(${jsxArg(path)},${Math.round(w)},${Math.round(h)})`),
    async docInfo(): Promise<DocInfo | null> {
      const r = await evalScript("ptgDocInfo()");
      const m = /^doc:(.*)\|(\d+(?:\.\d+)?)\|(\d+(?:\.\d+)?)\|(\d+)$/.exec(r);
      return m ? { name: m[1]!, width: Math.round(Number(m[2])), height: Math.round(Number(m[3])), layers: Number(m[4]) } : null;
    },
  };
}
