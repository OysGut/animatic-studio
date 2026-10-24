/**
 * C-7: vertslaget Illustrator-panelet trenger, delt i to smale grensesnitt:
 * - `Host` (filer, nettleser, språk): gjenbrukt fra Audition-panelet (CEP); i UXP byttes bare denne delen.
 * - `IllustratorHost`: de fem dokumentoperasjonene. I CEP går de via ExtendScript (jsx/host.jsx, cep-ai.ts);
 *   når Adobe åpner UXP for Illustrator skrives én ny fil som implementerer samme grensesnitt.
 * Kontrolleren kjenner bare disse grensesnittene, så all logikk kan prøves uten Illustrator.
 */
export type { Host, CSInterfaceLike, CepFsLike } from "../../audition/src/host";

export interface DocInfo { readonly name: string; readonly width: number; readonly height: number; readonly layers: number }
export interface IllustratorHost {
  /** Åpner SVG-en som nytt dokument og setter rasteroppløsning (ppi) til ressursens. */
  openSvg(path: string, dpi: number): Promise<boolean>;
  /** Lagrer det aktive dokumentet som .ai (PDF-kompatibel), der det er mulig. */
  saveAi(path: string): Promise<boolean>;
  /** Leser/skriver koblingen i dokumentets XMP (navnerom ILLUSTRATOR_XMP_NS, egenskap «link»). */
  readLink(): Promise<string | null>;
  writeLink(linkJson: string): Promise<boolean>;
  /** Eksporterer aktivt artboard som PNG med alfa i nøyaktig width × height piksler. */
  exportPng(path: string, width: number, height: number): Promise<boolean>;
  docInfo(): Promise<DocInfo | null>;
}
