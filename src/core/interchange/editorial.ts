/** PTG6: portable editorial policy and serializers. All ranges are exclusive, in doc.fps. */
import type { FilmClip } from "../assembly/film";
import { formatTimecode, fpsToNumber } from "../time";
import { referenceFrames } from "./dragonframe";
import type { InterchangeDoc, Shot } from "./types";

export interface EditorialShot {
  readonly shot: Shot;
  readonly reel: string;
  readonly video: string;
  readonly audio: string;
  readonly sourceIn: number;
  readonly sourceOut: number;
  readonly mediaFrames: number;
}

/** Names derive from PTG1; deterministic suffixes resolve collisions within this export. */
export function editorialShots(doc: InterchangeDoc): EditorialShot[] {
  const used = new Set<string>();
  return doc.shots.map(shot => {
    const base = shot.name.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8) || "SHOT";
    let reel = base;
    let n = 0;
    while (used.has(reel)) { const suffix = (++n).toString(36).toUpperCase(); reel = base.slice(0, 8 - suffix.length) + suffix; }
    used.add(reel);
    return { shot, reel, video: `${shot.name}/${shot.name}_ref.mp4`, audio: `${shot.name}/audio/${shot.name}_MIX.wav`,
      sourceIn: shot.handleIn, sourceOut: shot.handleIn + shot.lengthFrames, mediaFrames: shot.frameOut - shot.frameIn };
  });
}

/** Render each shot alone: do not bake a neighboring transition which the editor will recreate. */
export function editorialClip(clips: readonly FilmClip[], shot: Shot): FilmClip[] {
  const clip = clips.find(c => c.compositionId === shot.id || c.occurrenceId === shot.id);
  return clip ? [{ ...clip, transition: { kind: "cut", frames: 0, overlap: false }, overlapFrames: 0 }] : [];
}
export function editorialFrames(doc: InterchangeDoc, shot: Shot): number[] {
  return referenceFrames(doc, shot).map(f => Math.max(shot.sourceStartFrame, Math.min(shot.sourceStartFrame + shot.sourceLengthFrames - 1, f)));
}
export function editorialTransition(shot: Shot): { before: number; after: number } | null {
  return shot.transition.overlap && shot.transition.lengthFrames > 0
    ? { before: shot.handleIn, after: shot.transition.lengthFrames - shot.handleIn } : null;
}

export function editorialOtio(doc: InterchangeDoc): string {
  const rate = fpsToNumber(doc.fps);
  const rt = (value: number) => ({ OTIO_SCHEMA: "RationalTime.1", value, rate });
  const range = (start: number, duration: number) => ({ OTIO_SCHEMA: "TimeRange.1", start_time: rt(start), duration: rt(duration) });
  const shots = editorialShots(doc);
  const track = (audio: boolean) => {
    const children: unknown[] = [];
    shots.forEach((s, i) => {
      const transition = i > 0 && !audio ? editorialTransition(s.shot) : null;
      if (transition) children.push({ OTIO_SCHEMA: "Transition.1", name: s.shot.transition.type, transition_type: "SMPTE_Dissolve",
        in_offset: rt(transition.before), out_offset: rt(transition.after), metadata: { ptg: { type: s.shot.transition.type, direction: s.shot.transition.direction } } });
      children.push({ OTIO_SCHEMA: "Clip.2", name: s.shot.name, source_range: range(s.sourceIn, s.shot.lengthFrames),
        media_references: { DEFAULT_MEDIA: { OTIO_SCHEMA: "ExternalReference.1", target_url: audio ? s.audio : s.video, available_range: range(0, s.mediaFrames), metadata: {} } },
        active_media_reference_key: "DEFAULT_MEDIA", enabled: true,
        effects: [], markers: [], metadata: { ptg: { occurrenceId: s.shot.id, reel: s.reel, version: s.shot.version } } });
    });
    return { OTIO_SCHEMA: "Track.1", name: audio ? "MIX" : doc.production.name, kind: audio ? "Audio" : "Video", children, source_range: null, effects: [], markers: [], metadata: {} };
  };
  return JSON.stringify({ OTIO_SCHEMA: "Timeline.1", name: doc.project.name, global_start_time: rt(0), metadata: {},
    tracks: { OTIO_SCHEMA: "Stack.1", name: doc.production.name, children: [track(false), track(true)], source_range: null, effects: [], markers: [], metadata: {} } }, null, 2) + "\n";
}

const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
export function editorialXml(doc: InterchangeDoc): string {
  const base = Math.round(fpsToNumber(doc.fps));
  const ntsc = doc.fps.num * 1001 === base * 1000 * doc.fps.den;
  const rate = `<rate><timebase>${base}</timebase><ntsc>${ntsc ? "TRUE" : "FALSE"}</ntsc></rate>`;
  const shots = editorialShots(doc);
  const track = (audio: boolean) => shots.map((s, i) => {
    const head = i > 0 && !audio ? editorialTransition(s.shot) : null;
    const next = shots[i + 1];
    const tail = next && !audio ? editorialTransition(next.shot) : null;
    const kind = audio ? "audio" : "video";
    const start = s.shot.startFrame, end = start + s.shot.lengthFrames;
    const effectId = s.shot.transition.type === "wipe" ? "Wipe" : s.shot.transition.type === "dip" ? "Dip to Color Dissolve" : s.shot.transition.type === "dipWhite" ? "Dip to Color Dissolve" : "Cross Dissolve";
    const parameter = s.shot.transition.type === "wipe" ? `<parameter><parameterid>ptg-direction</parameterid><value>${s.shot.transition.direction ?? "right"}</value></parameter>` : s.shot.transition.type === "dip" || s.shot.transition.type === "dipWhite" ? `<parameter><parameterid>color</parameterid><value><red>${s.shot.transition.type === "dipWhite" ? 255 : 0}</red><green>${s.shot.transition.type === "dipWhite" ? 255 : 0}</green><blue>${s.shot.transition.type === "dipWhite" ? 255 : 0}</blue><alpha>255</alpha></value></parameter>` : "";
    const trans = head ? `<transitionitem><start>${start - head.before}</start><end>${start + head.after}</end><alignment>center</alignment>${rate}<effect><name>${xml(s.shot.transition.type)}</name><effectid>${effectId}</effectid><effecttype>transition</effecttype><mediatype>video</mediatype>${parameter}</effect></transitionitem>` : "";
    const characteristics = audio ? "<samplecharacteristics><depth>24</depth><samplerate>48000</samplerate></samplecharacteristics><channelcount>2</channelcount>"
      : `<samplecharacteristics>${rate}<width>${doc.frameSize.width}</width><height>${doc.frameSize.height}</height><anamorphic>FALSE</anamorphic><pixelaspectratio>square</pixelaspectratio><fielddominance>none</fielddominance></samplecharacteristics>`;
    return `${trans}<clipitem id="${kind}-${i + 1}"><name>${xml(s.shot.name)}</name>${rate}<duration>${s.shot.lengthFrames}</duration><start>${start}</start><end>${end}</end><in>${s.sourceIn}</in><out>${s.sourceOut}</out><file id="file-${kind}-${i + 1}"><name>${xml(s.shot.name)}</name><pathurl>${xml(audio ? s.audio : s.video)}</pathurl>${rate}<duration>${s.mediaFrames}</duration><timecode>${rate}<string>00:00:00:00</string><frame>0</frame><displayformat>NDF</displayformat></timecode><media><${kind}>${characteristics}</${kind}></media></file><sourcetrack><mediatype>${kind}</mediatype><trackindex>1</trackindex></sourcetrack></clipitem>`;
  }).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<xmeml version="5"><sequence id="ptg-sequence"><name>${xml(doc.project.name)}</name><duration>${doc.lengthFrames}</duration>${rate}<timecode>${rate}<string>00:00:00:00</string><frame>0</frame><displayformat>NDF</displayformat></timecode><media><video><format><samplecharacteristics>${rate}<width>${doc.frameSize.width}</width><height>${doc.frameSize.height}</height></samplecharacteristics></format><track>${track(false)}</track></video><audio><numOutputChannels>2</numOutputChannels><track>${track(true)}</track></audio></media></sequence></xmeml>\n`;
}

/** CMX places dissolves at their start; centered cuts are shifted by the incoming handle. */
export function editorialEdl(doc: InterchangeDoc): string {
  const tc = (f: number) => formatTimecode(f, doc.fps);
  const line = (event: number, reel: string, dissolve: number, si: number, so: number, ri: number, ro: number, effect = "D") =>
    `${String(event).padStart(3, "0")}  ${reel.padEnd(8)} ${"V".padEnd(5)} ${dissolve ? `${effect} ${String(dissolve).padStart(3, "0")}    ` : "C        "}${tc(si)} ${tc(so)} ${tc(ri)} ${tc(ro)}`;
  const shots = editorialShots(doc);
  const lines = [`TITLE: ${doc.project.code}`, "FCM: NON-DROP FRAME", ""];
  shots.forEach((s, i) => {
    const head = i > 0 ? editorialTransition(s.shot) : null;
    const next = shots[i + 1];
    const tail = next ? editorialTransition(next.shot) : null;
    const end = s.shot.startFrame + s.shot.lengthFrames - (tail?.before ?? 0);
    if (head) {
      const prev = shots[i - 1];
      if (prev) {
        const cut = s.shot.startFrame - head.before;
        const source = prev.sourceOut - head.before;
        lines.push(line(i + 1, prev.reel, 0, source, source, cut, cut), `* FROM CLIP NAME: ${prev.shot.name}`);
      }
    }
    const wipe = s.shot.transition.type === "wipe" ? (s.shot.transition.direction === "up" || s.shot.transition.direction === "down" ? "W002" : "W001") : "D";
    lines.push(line(i + 1, s.reel, head ? head.before + head.after : 0, s.sourceIn - (head?.before ?? 0), s.sourceOut - (tail?.before ?? 0), s.shot.startFrame - (head?.before ?? 0), end, wipe),
      ...(head && s.shot.transition.type !== "dissolve" ? [`* PTG TRANSITION: ${s.shot.transition.type} ${s.shot.transition.direction ?? ""}`] : []),
      `* ${head ? "TO" : "FROM"} CLIP NAME: ${s.shot.name}`, ...(head ? [`* FROM CLIP NAME: ${s.shot.name}`] : []), `* FROM FILE: ${s.video}`, "");
  });
  return lines.join("\r\n");
}

export function editorialFiles(doc: InterchangeDoc): { path: string; data: Uint8Array }[] {
  const encode = (path: string, text: string) => ({ path, data: new TextEncoder().encode(text) });
  return [encode(`${doc.project.code}.otio`, editorialOtio(doc)), encode(`${doc.project.code}.xml`, editorialXml(doc)), encode(`${doc.project.code}.edl`, editorialEdl(doc))];
}