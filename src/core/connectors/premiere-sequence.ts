/**
 * C-3 Premiere Pro: ren sekvensmodell uten prosjektstatus, så både appen og UXP-panelet (plugins/premiere)
 * bruker samme kode. Lager OTIO og FCP7 XML med markører og leser dem tilbake.
 *
 * Kobling skjer bare på våre ID-er i markørene (eller i panelbildets filnavn, som også er panel-ID-en), aldri
 * på navn eller rekkefølge. Markørformat: «ptg:panel:<id>@<revisjon>», «ptg:shot:<forekomst-ID>», «ptg:scene:<scene-ID>».
 * Klipp uten vår ID i Premiere (andre klipp, tomrom) flytter tiden, men blir aldri til forslag.
 */
import { canonicalJson, validateManifest, type ConnectorManifest, type ManifestItem, type Rational } from "./manifest";
import { Sha256, toHex } from "./sha256";

export const PREMIERE_CLIENT_ID = "ptg.premiere";
export const PREMIERE_ADAPTER = { id: "adobe-premiere-uxp", version: "1" } as const;
/** Takhøyde per retur (ikke global). */
export const PREMIERE_MAX_PANELS = 5000;

export type PremiereTransitionKind = "cut" | "dissolve" | "dip" | "dipWhite" | "wipe";
export interface PremierePanelClip {
  readonly panelId: string;
  readonly revision: number;
  readonly occurrenceId: string;
  readonly sceneId: string;
  readonly label: string;
  readonly sceneLabel: string;
  readonly startFrame: number;
  readonly durationFrames: number;
  /** Relativ sti til panelbildet i pakken: panels/<panelId>.png. */
  readonly image: string;
  readonly transition: { readonly kind: PremiereTransitionKind; readonly frames: number; readonly direction?: string } | null;
}
export type PremiereAudioTrack = "dialogue" | "music" | "effects";
export interface PremiereAudioClip {
  readonly id: string;
  readonly track: PremiereAudioTrack;
  readonly name: string;
  readonly path: string;
  readonly startFrame: number;
  readonly lengthFrames: number;
  readonly sourceInFrames: number;
  readonly gainDb: number;
}
export interface PremiereSequence {
  readonly name: string;
  readonly projectId: string;
  readonly productionId: string;
  readonly fps: Rational;
  readonly width: number;
  readonly height: number;
  readonly lengthFrames: number;
  readonly panels: readonly PremierePanelClip[];
  readonly audio: readonly PremiereAudioClip[];
}

const ID = /^[A-Za-z0-9_-]{1,64}$/;
export const panelRef = (id: string, revision: number) => `ptg:panel:${id}@${revision}`;
export const shotRef = (occurrenceId: string) => `ptg:shot:${occurrenceId}`;
export const sceneRef = (sceneId: string) => `ptg:scene:${sceneId}`;
export function parseRef(text: unknown): { kind: "panel"; id: string; revision: number } | { kind: "shot" | "scene"; id: string } | null {
  if (typeof text !== "string") return null;
  const m = /ptg:(panel|shot|scene):([A-Za-z0-9_-]{1,64})(?:@(\d{1,9}))?/.exec(text);
  if (!m) return null;
  if (m[1] === "panel") return m[3] === undefined ? null : { kind: "panel", id: m[2]!, revision: Number(m[3]) };
  return { kind: m[1] as "shot" | "scene", id: m[2]! };
}
/** Panel-ID fra bildets filnavn (panels/<id>.png), som reserve når Premiere har mistet klippmarkøren. */
export function panelIdFromPath(path: unknown): string | null {
  if (typeof path !== "string") return null;
  const m = /(?:^|[\\/])([A-Za-z0-9_-]{8,64})\.png$/i.exec(decodeURIComponent(path.replace(/^file:\/\/(localhost)?/, "")));
  return m ? m[1]! : null;
}

const fpsNum = (r: Rational) => r.num / r.den;
const TRACK_NAME: Record<PremiereAudioTrack, string> = { dialogue: "Dialogue", music: "Music", effects: "Effects" };
const TRACKS: readonly PremiereAudioTrack[] = ["dialogue", "music", "effects"];

/** Markørene for ett panel: panelet selv, og skudd/scene på første panel i skuddet. */
function markersFor(p: PremierePanelClip, firstInShot: boolean): { name: string; comment: string }[] {
  const out = [{ name: p.label, comment: panelRef(p.panelId, p.revision) }];
  if (firstInShot) out.push({ name: p.sceneLabel, comment: shotRef(p.occurrenceId) }, { name: p.sceneLabel, comment: sceneRef(p.sceneId) });
  return out;
}
const firstFlags = (panels: readonly PremierePanelClip[]) => panels.map((p, i) => i === 0 || panels[i - 1]!.occurrenceId !== p.occurrenceId);

// ---------- OTIO ----------
export function premiereOtio(seq: PremiereSequence): string {
  const rate = fpsNum(seq.fps);
  const rt = (value: number) => ({ OTIO_SCHEMA: "RationalTime.1", value, rate });
  const range = (start: number, duration: number) => ({ OTIO_SCHEMA: "TimeRange.1", start_time: rt(start), duration: rt(duration) });
  const firsts = firstFlags(seq.panels);
  const video: unknown[] = [];
  seq.panels.forEach((p, i) => {
    if (i > 0 && p.transition && p.transition.kind !== "cut" && p.transition.frames > 0) {
      const half = Math.floor(p.transition.frames / 2);
      video.push({ OTIO_SCHEMA: "Transition.1", name: p.transition.kind, transition_type: "SMPTE_Dissolve", in_offset: rt(half), out_offset: rt(p.transition.frames - half), metadata: { ptg: { type: p.transition.kind, direction: p.transition.direction ?? null } } });
    }
    video.push({
      OTIO_SCHEMA: "Clip.2", name: p.label, source_range: range(0, p.durationFrames), enabled: true, effects: [],
      media_references: { DEFAULT_MEDIA: { OTIO_SCHEMA: "ExternalReference.1", target_url: p.image, available_range: range(0, p.durationFrames), metadata: {} } },
      active_media_reference_key: "DEFAULT_MEDIA",
      markers: markersFor(p, firsts[i]!).map(m => ({ OTIO_SCHEMA: "Marker.2", name: m.name, comment: m.comment, color: m.comment.startsWith("ptg:panel") ? "GREEN" : "RED", marked_range: range(0, 1), metadata: {} })),
      metadata: { ptg: { panelId: p.panelId, revision: p.revision, occurrenceId: p.occurrenceId, sceneId: p.sceneId } },
    });
  });
  const audioTrack = (track: PremiereAudioTrack) => {
    const children: unknown[] = [];
    let cursor = 0;
    for (const a of seq.audio.filter(x => x.track === track).sort((x, y) => x.startFrame - y.startFrame)) {
      if (a.startFrame < cursor) continue; // overlapp på samme spor: OTIO-spor er sekvensielle; resten ligger i XML
      if (a.startFrame > cursor) children.push({ OTIO_SCHEMA: "Gap.1", name: "", source_range: range(0, a.startFrame - cursor), effects: [], markers: [], metadata: {} });
      children.push({ OTIO_SCHEMA: "Clip.2", name: a.name, source_range: range(a.sourceInFrames, a.lengthFrames), enabled: true, effects: [], markers: [],
        media_references: { DEFAULT_MEDIA: { OTIO_SCHEMA: "ExternalReference.1", target_url: a.path, available_range: null, metadata: {} } }, active_media_reference_key: "DEFAULT_MEDIA",
        metadata: { ptg: { audioClipId: a.id, gainDb: a.gainDb } } });
      cursor = a.startFrame + a.lengthFrames;
    }
    return { OTIO_SCHEMA: "Track.1", name: TRACK_NAME[track], kind: "Audio", children, source_range: null, effects: [], markers: [], metadata: {} };
  };
  return JSON.stringify({
    OTIO_SCHEMA: "Timeline.1", name: seq.name, global_start_time: rt(0),
    metadata: { ptg: { projectId: seq.projectId, productionId: seq.productionId, adapter: PREMIERE_ADAPTER.id } },
    tracks: { OTIO_SCHEMA: "Stack.1", name: seq.name, source_range: null, effects: [], markers: [], metadata: {},
      children: [{ OTIO_SCHEMA: "Track.1", name: "Storyboard", kind: "Video", children: video, source_range: null, effects: [], markers: [], metadata: {} }, ...TRACKS.map(audioTrack)] },
  }, null, 2) + "\n";
}

// ---------- FCP7 XML (xmeml v5, importeres av Premiere) ----------
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
export function premiereXml(seq: PremiereSequence): string {
  const base = Math.round(fpsNum(seq.fps));
  const ntsc = seq.fps.num * 1001 === base * 1000 * seq.fps.den;
  const rate = `<rate><timebase>${base}</timebase><ntsc>${ntsc ? "TRUE" : "FALSE"}</ntsc></rate>`;
  const marker = (m: { name: string; comment: string }, at = 0) => `<marker><name>${esc(m.name)}</name><comment>${esc(m.comment)}</comment><in>${at}</in><out>-1</out></marker>`;
  const firsts = firstFlags(seq.panels);
  const video = seq.panels.map((p, i) => {
    const t = i > 0 && p.transition && p.transition.kind !== "cut" && p.transition.frames > 0 ? p.transition : null;
    const half = t ? Math.floor(t.frames / 2) : 0;
    const effect = t ? (t.kind === "wipe" ? "Wipe" : t.kind === "dissolve" ? "Cross Dissolve" : "Dip to Color Dissolve") : "";
    const trans = t ? `<transitionitem><start>${p.startFrame - half}</start><end>${p.startFrame - half + t.frames}</end><alignment>center</alignment>${rate}<effect><name>${esc(t.kind)}</name><effectid>${effect}</effectid><effecttype>transition</effecttype><mediatype>video</mediatype></effect></transitionitem>` : "";
    return `${trans}<clipitem id="panel-${i + 1}"><name>${esc(p.label)}</name>${rate}<duration>${p.durationFrames}</duration><start>${p.startFrame}</start><end>${p.startFrame + p.durationFrames}</end><in>0</in><out>${p.durationFrames}</out><file id="file-panel-${i + 1}"><name>${esc(p.panelId)}.png</name><pathurl>${esc(p.image)}</pathurl>${rate}<duration>${p.durationFrames}</duration><media><video><samplecharacteristics><width>${seq.width}</width><height>${seq.height}</height></samplecharacteristics></video></media></file>${markersFor(p, firsts[i]!).map(m => marker(m)).join("")}</clipitem>`;
  }).join("\n");
  const audio = TRACKS.map(track => `<track><name>${TRACK_NAME[track]}</name>${seq.audio.filter(a => a.track === track).map((a, i) =>
    `<clipitem id="${track}-${i + 1}"><name>${esc(a.name)}</name>${rate}<start>${a.startFrame}</start><end>${a.startFrame + a.lengthFrames}</end><in>${a.sourceInFrames}</in><out>${a.sourceInFrames + a.lengthFrames}</out><file id="file-${track}-${i + 1}"><name>${esc(a.name)}</name><pathurl>${esc(a.path)}</pathurl><media><audio><channelcount>2</channelcount></audio></media></file><sourcetrack><mediatype>audio</mediatype><trackindex>1</trackindex></sourcetrack><comments><mastercomment1>ptg:audio:${esc(a.id)}</mastercomment1></comments></clipitem>`).join("")}</track>`).join("\n");
  const seqMarkers = seq.panels.filter((_, i) => firsts[i]).map(p => marker({ name: p.sceneLabel, comment: sceneRef(p.sceneId) }, p.startFrame)).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE xmeml>\n<xmeml version="5"><sequence id="ptg-${esc(seq.productionId)}"><name>${esc(seq.name)}</name><duration>${seq.lengthFrames}</duration>${rate}<timecode>${rate}<string>00:00:00:00</string><frame>0</frame><displayformat>NDF</displayformat></timecode>${seqMarkers}<media><video><format><samplecharacteristics>${rate}<width>${seq.width}</width><height>${seq.height}</height></samplecharacteristics></format><track>${video}</track></video><audio><numOutputChannels>2</numOutputChannels>${audio}</audio></media></sequence></xmeml>\n`;
}

// ---------- Tilbake fra Premiere ----------
export interface PremiereCutItem { readonly panelId: string; readonly baseRevision: number | null; readonly startFrame: number; readonly durationFrames: number }
export interface PremiereCut { readonly items: readonly PremiereCutItem[]; readonly duplicates: number; readonly foreign: number }
/** Ett klipp slik verten (Premiere, OTIO eller XML) ser det: tid i bilder, markørtekster og mediesti. */
export interface HostClip { readonly startFrame: number; readonly endFrame: number; readonly markers: readonly string[]; readonly mediaPath?: string | null }

/** Fra klipp til rekkefølge og timing: kobling bare på ID (markør først, så bildets filnavn). */
export function cutFromClips(clips: readonly HostClip[]): PremiereCut {
  const items: PremiereCutItem[] = [];
  const seen = new Set<string>();
  let duplicates = 0, foreign = 0;
  for (const c of [...clips].sort((a, b) => a.startFrame - b.startFrame)) {
    const dur = Math.round(c.endFrame - c.startFrame);
    let ref: { id: string; revision: number | null } | null = null;
    for (const m of c.markers) { const r = parseRef(m); if (r && r.kind === "panel") { ref = { id: r.id, revision: r.revision }; break; } }
    if (!ref) { const id = panelIdFromPath(c.mediaPath); if (id) ref = { id, revision: null }; }
    if (!ref || !ID.test(ref.id) || dur < 1) { foreign++; continue; }
    if (seen.has(ref.id)) { duplicates++; continue; } // samme panel to ganger: første forekomst teller
    seen.add(ref.id);
    items.push({ panelId: ref.id, baseRevision: ref.revision, startFrame: Math.round(c.startFrame), durationFrames: dur });
  }
  return { items, duplicates, foreign };
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const num = (v: unknown) => (isObj(v) && typeof v["value"] === "number" ? v["value"] : 0);

/** Leser videosporet i en OTIO-tidslinje (første Video-spor). Overganger flytter ikke tiden (OTIO). */
export function readOtioClips(text: string): HostClip[] {
  const doc = JSON.parse(text) as unknown;
  const stack = isObj(doc) && isObj(doc["tracks"]) ? doc["tracks"] : null;
  const tracks = stack && Array.isArray(stack["children"]) ? stack["children"] : [];
  const track = tracks.find(t => isObj(t) && t["kind"] === "Video");
  if (!isObj(track) || !Array.isArray(track["children"])) return [];
  const out: HostClip[] = [];
  let cursor = 0;
  for (const c of track["children"]) {
    if (!isObj(c)) continue;
    const schema = String(c["OTIO_SCHEMA"] ?? "");
    if (schema.startsWith("Transition")) continue;
    const dur = isObj(c["source_range"]) ? num(c["source_range"]["duration"]) : 0;
    if (schema.startsWith("Clip")) {
      const markers = (Array.isArray(c["markers"]) ? c["markers"] : []).flatMap(m => (isObj(m) ? [String(m["comment"] ?? ""), String(m["name"] ?? "")] : []));
      const meta = isObj(c["metadata"]) && isObj(c["metadata"]["ptg"]) ? c["metadata"]["ptg"] : null;
      if (meta && typeof meta["panelId"] === "string" && Number.isInteger(meta["revision"])) markers.push(panelRef(meta["panelId"], meta["revision"] as number));
      const refs = isObj(c["media_references"]) ? Object.values(c["media_references"]) : [];
      const ref = refs.find(isObj);
      out.push({ startFrame: cursor, endFrame: cursor + dur, markers, mediaPath: ref && typeof ref["target_url"] === "string" ? ref["target_url"] : null });
    }
    cursor += dur;
  }
  return out;
}

const tag = (s: string, name: string) => { const m = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(s); return m ? m[1]! : null; };
const unesc = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
/** Leser første videospor i FCP7 XML. Premiere skriver start/end = -1 ved overganger; da regnes de fra naboene. */
export function readXmlClips(text: string): HostClip[] {
  const videoBlock = /<video>([\s\S]*?)<\/video>\s*<audio>/.exec(text)?.[1] ?? /<video>([\s\S]*)<\/video>/.exec(text)?.[1] ?? "";
  const trackBlock = /<track>([\s\S]*?)<\/track>/.exec(videoBlock)?.[1] ?? "";
  const out: HostClip[] = [];
  let prevEnd = 0;
  for (const m of trackBlock.matchAll(/<clipitem\b[^>]*>([\s\S]*?)<\/clipitem>/g)) {
    const body = m[1]!;
    const head = body.replace(/<file\b[\s\S]*?<\/file>/, "").replace(/<marker>[\s\S]*?<\/marker>/g, "");
    const inP = Number(tag(head, "in") ?? 0), outP = Number(tag(head, "out") ?? 0);
    let start = Number(tag(head, "start") ?? -1), end = Number(tag(head, "end") ?? -1);
    if (start < 0) start = prevEnd;
    if (end < 0) end = start + Math.max(0, outP - inP);
    const markers = [...body.matchAll(/<marker>([\s\S]*?)<\/marker>/g)].flatMap(x => [unesc(tag(x[1]!, "comment") ?? ""), unesc(tag(x[1]!, "name") ?? "")]);
    const path = tag(body, "pathurl");
    out.push({ startFrame: start, endFrame: end, markers, mediaPath: path ? unesc(path) : null });
    prevEnd = end;
  }
  return out;
}

/** Returmanifestet panelet sender: manifest v1 med én panelpost per koblet klipp. */
export function premiereReturnManifest(meta: { projectId: string; productionId: string; fps: Rational; sequenceName: string; nowIso: string; hostVersion: string }, cut: PremiereCut): ConnectorManifest {
  const items: ManifestItem[] = [{ kind: "project", id: meta.projectId }];
  cut.items.forEach((c, order) => items.push({
    kind: "panel", id: c.panelId, durationFrames: c.durationFrames,
    ...(c.baseRevision !== null ? { base: { entity: "panel" as const, id: c.panelId, revision: c.baseRevision } } : {}),
    premiere: { order, startFrame: c.startFrame },
  }));
  return {
    manifestVersion: 1, createdAt: meta.nowIso, projectId: meta.projectId, frameRate: { num: meta.fps.num, den: meta.fps.den }, sampleRate: 48000,
    sourceApp: { name: "Adobe Premiere Pro", version: meta.hostVersion.slice(0, 50) || "unknown" }, adapter: { ...PREMIERE_ADAPTER }, items,
    premiere: { productionId: meta.productionId, sequenceName: meta.sequenceName.slice(0, 200), duplicates: cut.duplicates, foreign: cut.foreign },
  };
}

export interface PremiereReturn { readonly projectId: string; readonly productionId: string; readonly fps: Rational; readonly items: readonly PremiereCutItem[]; readonly hash: string }
export type PremiereReturnResult = { ok: true; value: PremiereReturn } | { ok: false; reason: string };

/** Kontrollerer returmanifestet fra Premiere-panelet. */
export function readPremiereReturn(input: unknown, byteLength?: number): PremiereReturnResult {
  const v = validateManifest(input, byteLength);
  if (!v.ok) return { ok: false, reason: `manifest:${v.issues[0]?.path ?? "$"}:${v.issues[0]?.code ?? "type"}` };
  const m = v.manifest;
  if (m.adapter.id !== PREMIERE_ADAPTER.id) return { ok: false, reason: "adapter" };
  const top = isObj(m["premiere"]) ? m["premiere"] : {};
  const productionId = typeof top["productionId"] === "string" && ID.test(top["productionId"]) ? top["productionId"] : "";
  if (!productionId) return { ok: false, reason: "production" };
  const items: (PremiereCutItem & { order: number })[] = [];
  const seen = new Set<string>();
  for (const it of m.items) {
    if (it.kind !== "panel") continue;
    if (!ID.test(it.id) || seen.has(it.id)) return { ok: false, reason: "panel" };
    seen.add(it.id);
    const x = isObj(it["premiere"]) ? it["premiere"] : {};
    const order = x["order"], start = x["startFrame"], dur = it.durationFrames;
    if (!Number.isInteger(order) || (order as number) < 0 || (order as number) > 1e6) return { ok: false, reason: "order" };
    if (!Number.isInteger(start) || (start as number) < 0 || (start as number) > 1e8) return { ok: false, reason: "start" };
    if (!Number.isInteger(dur) || (dur as number) < 1 || (dur as number) > 1e7) return { ok: false, reason: "duration" };
    items.push({ panelId: it.id, baseRevision: it.base && it.base.entity === "panel" ? it.base.revision : null, startFrame: start as number, durationFrames: dur as number, order: order as number });
  }
  if (items.length === 0) return { ok: false, reason: "empty" };
  if (items.length > PREMIERE_MAX_PANELS) return { ok: false, reason: "too-many" };
  const hash = toHex(new Sha256().update(new TextEncoder().encode(canonicalJson(input))).digest());
  return { ok: true, value: { projectId: m.projectId, productionId, fps: { num: m.frameRate.num, den: m.frameRate.den }, items: items.sort((a, b) => a.order - b.order).map(({ order: _o, ...r }) => r), hash } };
}
