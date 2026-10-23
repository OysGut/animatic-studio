import { jsPDF } from "jspdf";
import { bilingual, readmeLanguage } from "@/core/interchange/readme";
import type { ProjectState } from "@/core/model";
import type { InterchangeDoc } from "@/core/interchange";
import { mouthList, mouthListCsv, mouthJson, mohoDat, shotMouthTracks, type MouthListRow } from "@/core/interchange/mouth-export";
import { pdfScriptOf, pdfScriptsNeeded } from "@/core/interchange/dragonframe";
import { loadPdfFonts, type PdfFonts } from "./dragonframe";
import { writeZip, type ZipSink } from "./zip";
import { t } from "@/core/i18n/keyed";
import cmuLicense from "@/core/interchange/CMUDICT-LICENSE.txt?raw";

export const mouthListHeaders=()=>[t("ptg4.character"),t("ptg4.shape"),t("ptg4.variant"),t("ptg4.count"),t("ptg4.shots")];
export function mouthListPdf(rows: readonly MouthListRow[], title:string, fonts:PdfFonts):Uint8Array {
  const pdf=new jsPDF({unit:"mm",format:"a4",compress:true});
  for(const script of ["latin","jp","kr"] as const) { const data=fonts[script];if(data){pdf.addFileToVFS(`mouth-${script}.ttf`,data);pdf.addFont(`mouth-${script}.ttf`,`Mouth-${script}`,"normal");} }
  let y=16;
  const line=(text:string,size=9)=>{const script=pdfScriptOf(text);pdf.setFont(`Mouth-${fonts[script]?script:"latin"}`,"normal");pdf.setFontSize(size);const lines=pdf.splitTextToSize(text,180) as string[];for(const s of lines){if(y>280){pdf.addPage();y=16;}pdf.text(s,15,y);y+=5;}};
  line(title,13);line(mouthListHeaders().join(" · "));
  for(const r of rows)line(`${r.character} · ${r.shape} · ${r.variant} · ${r.count} · ${r.shots.join(", ")}`);
  return new Uint8Array(pdf.output("arraybuffer"));
}
export async function exportMouthPackage(state:ProjectState,doc:InterchangeDoc,sink:ZipSink,signal:AbortSignal):Promise<void> {
  const rows=mouthList(state,doc),headers=mouthListHeaders();
  const fonts=await loadPdfFonts(pdfScriptsNeeded([doc.project.name,...headers,...rows.flatMap(r=>[r.character,r.variant,...r.shots])]));
  async function* files(){
    yield{path:"CMUDICT-LICENSE.txt",data:new TextEncoder().encode(cmuLicense)};
    yield{path:"LESMEG.txt",data:new TextEncoder().encode(bilingual(t("ptg4.readme",{},readmeLanguage()),t("ptg4.readme",{},"en"),"\n\n")+"\n\nNB Uttale: https://www.nb.no/sprakbanken/ressurskatalog/oai-nb-no-sbr-79/ — CC0 1.0. CMUdict: https://github.com/cmusphinx/cmudict — BSD.\n")};
    yield{path:"mouth-list.csv",data:mouthListCsv(rows,headers)};
    yield{path:"mouth-list.pdf",data:mouthListPdf(rows,doc.project.name,fonts)};
    for(const shot of doc.shots){const tracks=shotMouthTracks(state,doc,shot);yield{path:`${shot.name}/${shot.name}_mouth.json`,data:new TextEncoder().encode(mouthJson(doc,shot,tracks))};for(const track of tracks)yield{path:`${shot.name}/${shot.name}_${track.characterId}.dat`,data:new TextEncoder().encode(mohoDat(track,shot.frameOut-shot.frameIn))};}
  }
  await writeZip(sink,[],{},{extra:files(),signal});
}