/** Deterministic, local PTG4 pronunciation and timing. Lexicons are original-source compact subsets. */
import nb from "./nb-uttale.json";
import en from "./cmudict.json";
import { secondsToFrames, type Rational } from "../time";
import type { MouthShape, MouthSpan, MouthSystem } from "./mouth-types";

export const NOFABET_MOUTHS: Readonly<Record<string, MouthShape>> = {
  P:"A", B:"A", M:"A", F:"G", V:"G", L:"H", RL:"H", AA:"D", AH:"D", AE:"C", AEH:"C", AEJ:"C",
  EE:"C", EH:"C", AX:"C", II:"B", IH:"B", OO:"F", OH:"F", OA:"E", OAH:"E", UU:"F", UH:"F", YY:"F", YH:"F", OE:"E", OEH:"E",
  T:"B", D:"B", K:"B", G:"B", N:"B", NX:"B", RN:"B", RNX:"B", RD:"B", RT:"B", RS:"B", S:"B", SJ:"B", H:"B", J:"B", NG:"B", KJ:"B", R:"B",
};
export const ARPABET_MOUTHS: Readonly<Record<string, MouthShape>> = {
  ...NOFABET_MOUTHS, AE:"D", AY:"D", AW:"D", AO:"E", OW:"E", OY:"E", EY:"C", ER:"C", UH:"F", UW:"F", W:"F", Y:"B", IY:"B", CH:"B", DH:"B", JH:"B", SH:"B", TH:"B", Z:"B", ZH:"B", HH:"B",
};
const blair: Readonly<Record<string, MouthShape>> = { A:"MBP", B:"etc", C:"E", D:"AI", E:"O", F:"U", G:"FV", H:"L", X:"rest" };
export function phonemeMouth(phoneme: string, language: string, system: MouthSystem): MouthShape {
  const p = phoneme.replace(/[0-9]/g, "");
  const shape = (language.startsWith("en") ? ARPABET_MOUTHS : NOFABET_MOUTHS)[p] ?? "B";
  return system === "rhubarb" ? shape : blair[shape] ?? "etc";
}
const fallbackNb: Readonly<Record<string,string>> = { a:"AH", b:"B", c:"K", d:"D", e:"EH", f:"F", g:"G", h:"H", i:"IH", j:"J", k:"K", l:"L", m:"M", n:"N", o:"OAH", p:"P", q:"K", r:"R", s:"S", t:"T", u:"UH", v:"V", w:"V", x:"K S", y:"YY", z:"S", æ:"AE", ø:"OE", å:"OA" };
const fallbackEn: Readonly<Record<string,string>> = { ...fallbackNb, a:"AE", e:"EH", i:"IH", j:"JH", o:"AO", u:"AH", w:"W", y:"Y", z:"Z" };
export function pronunciation(word: string, language: string): { phones: readonly string[]; dictionary: boolean } {
  const clean = word.toLocaleLowerCase().replace(/[^a-zæøå'-]/g, "");
  const english = language.startsWith("en");
  const dictionary: Readonly<Record<string,string>> = english ? en : nb;
  const found = dictionary[clean];
  if (found) return { phones: found.split(" "), dictionary: true };
  const digraphs: Readonly<Record<string,string>> = english ? { sh:"SH", ch:"CH", th:"TH", ng:"NG", oo:"UW", ee:"IY", ph:"F" } : { sj:"SJ", sk:"SJ", kj:"KJ", ng:"NG", ei:"AEJ", au:"AEJ" };
  const phones: string[] = [];
  for (let i=0; i<clean.length; i++) {
    const pair = digraphs[clean.slice(i,i+2)];
    if (pair) { phones.push(pair); i++; } else phones.push(...((english ? fallbackEn : fallbackNb)[clean[i] ?? ""] ?? "").split(" ").filter(Boolean));
  }
  return { phones, dictionary:false };
}
export interface MouthWord { readonly text: string; readonly startMs: number | null; readonly endMs: number | null }
/** Round absolute boundaries first, then difference; on twos snap to exposure boundaries. */
export function mouthBoundary(ms: number, fps: Rational, step: number): number {
  const grid = Math.max(1, Math.round(step));
  return Math.round(secondsToFrames(ms / 1000, fps) / grid) * grid;
}
export function draftMouthSpans(words: readonly MouthWord[], language: string, system: MouthSystem, fps: Rational, step=1): MouthSpan[] {
  const grid=Math.max(1,Math.round(step)), spans: MouthSpan[]=[];
  for (const word of words) {
    if (word.startMs === null || word.endMs === null || !Number.isFinite(word.startMs) || !Number.isFinite(word.endMs)) continue;
    const start=Math.max(spans.at(-1)?.endFrame ?? 0,mouthBoundary(word.startMs,fps,grid)), end=mouthBoundary(word.endMs,fps,grid);
    if (end<=start) continue;
    const shapes=pronunciation(word.text,language).phones.map(p=>phonemeMouth(p,language,system));
    if (!shapes.length) continue;
    const count=Math.min(shapes.length,Math.floor((end-start)/grid));
    for(let i=0;i<count;i++) {
      const a=start+Math.round((end-start)*i/count/grid)*grid, b=start+Math.round((end-start)*(i+1)/count/grid)*grid;
      const shape=shapes[Math.min(shapes.length-1,Math.floor(i*shapes.length/count))] ?? "X";
      const last=spans.at(-1);
      if(last && last.shape===shape && last.endFrame===a) spans[spans.length-1]={...last,endFrame:b};
      else spans.push({startFrame:a,endFrame:b,shape});
    }
  }
  return spans;
}
export function moveMouthBoundary(spans: readonly MouthSpan[], index: number, frame: number): MouthSpan[] {
  const previous=spans[index-1], next=spans[index];
  if (!previous || !next || previous.endFrame !== next.startFrame || !Number.isInteger(frame) || frame<=previous.startFrame || frame>=next.endFrame) return [...spans];
  return spans.map((s,i)=>i===index-1?{...s,endFrame:frame}:i===index?{...s,startFrame:frame}:s);
}
export function splitMouthSpan(spans: readonly MouthSpan[], index: number, frame: number): MouthSpan[] {
  const s=spans[index];
  if (!s || !Number.isInteger(frame) || frame<=s.startFrame || frame>=s.endFrame) return [...spans];
  return [...spans.slice(0,index),{...s,endFrame:frame},{...s,startFrame:frame},...spans.slice(index+1)];
}
export function mergeMouthSpans(spans: readonly MouthSpan[], index: number): MouthSpan[] {
  const a=spans[index],b=spans[index+1];
  if(!a || !b || a.endFrame!==b.startFrame) return [...spans];
  return [...spans.slice(0,index),{...a,endFrame:b.endFrame},...spans.slice(index+2)];
}