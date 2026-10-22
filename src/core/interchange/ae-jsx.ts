/**
 * PTG3 (B-102 §4, PTG-F1): After Effects-pakken bygges som et ExtendScript (ES3) `bygg.jsx` som
 * gjenskaper filmen: én komposisjon per skudd og en hovedkomposisjon, lag med transformasjoner og
 * nøkkelbilder, myking KeyframeEase(0, influence × 100), baner som romlige tangenter fra samme
 * spline som transformAt, bildeskifter som sekvens i en underkomposisjon, grupper som null-foreldre,
 * masker som Shape, lyd med volumpunkter, og kamera enten som AE-kamera (3D, plater på z,
 * zoom = bredde × f / filmbredde) eller som 2D-parallakse med null-lag. Overganger mellom scener
 * er utenfor. Eksportøren regner ikke ut tid, kamera eller navn selv – alt leses fra InterchangeDoc.
 * Ren TypeScript uten nettleser-API; den genererte koden er ES3 (ingen let/const/pilfunksjoner).
 */
import { pathPointAt, pathProgress } from "../composition/render";
import type { InterchangeDoc, LayerTrack, Shot } from "./types";
import { TITLE_CARD_SECONDS } from "./titlecard";

export type AeCameraMode = "ae" | "parallax";

/**
 * PTG3b (B-115): tittelkort på TITLE_CARD_SECONDS foran hvert skudd. Kortet er en egen komposisjon
 * `<skudd>_TITLE`; `<skudd>_RENDER` legger kortet før skuddkomposisjonen (start-tidskode −1 s), så
 * skuddkomposisjonen selv er uendret: bilde 0 og tidskode som i skuddlisten og FBX-filen.
 * Tekstene kommer ferdig oversatt fra eksportøren; `qrPath` er QR-bildets relative sti i pakken.
 */
export interface AeTitleCards {
  readonly filmTitle: string;
  readonly explain: string;
  readonly footer: string;
  readonly sceneLine: (shot: Shot) => string;
  readonly qrPath: (shot: Shot) => string;
}

/** Appens farger (mørk bakgrunn, lys tekst, turkis aksent), i AE sitt 0–1-format. */
const CARD_BG = [0.102, 0.106, 0.118];
const CARD_FG = [0.906, 0.91, 0.922];
const CARD_ACCENT = [0.38, 0.718, 0.788];
const CARD_MUTED = [0.6, 0.61, 0.64];

type Kf = LayerTrack["keyframes"][number];
const fpsFloat = (doc: InterchangeDoc): number => doc.fps.num / doc.fps.den;
const sec = (doc: InterchangeDoc, frame: number): number => frame * doc.fps.den / doc.fps.num;
/** Scriptstrenger er JSON-kodede; skudd- og lagnavn kan aldri bryte ES3-syntaksen. */
const js = JSON.stringify;
const r6 = (v: number): number => Math.round(v * 1e6) / 1e6;

/** Standard influence i AE for navngitt myking (§4: navngitt easing blir standard influence). */
const STD = 100 / 3;

interface Key3 { readonly t: number; readonly inn: number; readonly ut: number; readonly hold: boolean }

/** Mykingen for en egenskapsgruppe: easeOut/easeIn (0–1) × 100, ellers navngitt easing; «hold» er egen. */
function easeAt(keys: readonly Kf[], frame: number, previous: Kf | null): Key3 {
  const here = keys.find(k => k.frame === frame) ?? previous;
  const easing = here?.easing ?? "linear";
  const ut = here?.easeOut !== undefined ? here.easeOut * 100
    : easing === "ease-out" || easing === "ease-in-out" ? STD : 0;
  const inn = previous?.easeIn !== undefined ? previous.easeIn * 100
    : previous && (previous.easing === "ease-in" || previous.easing === "ease-in-out") ? STD : 0;
  return { t: frame, inn: r6(inn), ut: r6(ut), hold: easing === "hold" };
}

/** Verdien av en egenskap på et bilde: nøkkelbildet selv, ellers lineært mellom naboene (tilnærming). */
function valueOf(keys: readonly Kf[], frame: number, base: number): number {
  const sorted = [...keys].sort((a, b) => a.frame - b.frame);
  let prev: Kf | null = null; let next: Kf | null = null;
  for (const k of sorted) {
    if (k.frame === frame) return k.value;
    if (k.frame < frame && (!prev || k.frame > prev.frame)) prev = k;
    if (k.frame > frame && (!next || k.frame < next.frame)) next = k;
  }
  if (prev && next) return prev.value + (next.value - prev.value) * ((frame - prev.frame) / (next.frame - prev.frame));
  return prev?.value ?? next?.value ?? base;
}

interface Sampled { readonly times: number[]; readonly values: number[][]; readonly ease: readonly Key3[] }

/** Samler nøkkelbilder for en AE-egenskap (én eller to animerte verdier deler tidspunkter). */
function sampleProps(layer: LayerTrack, props: readonly string[], base: readonly number[]): Sampled | null {
  const keys = layer.keyframes.filter(k => props.includes(k.property));
  if (keys.length === 0) return null;
  const frames = [...new Set(keys.map(k => k.frame))].sort((a, b) => a - b);
  const ease: Key3[] = [];
  let previous: Kf | null = null;
  for (const f of frames) {
    ease.push(easeAt(keys, f, previous));
    previous = keys.filter(k => k.frame === f).pop() ?? previous;
  }
  const values = frames.map(f => props.map((p, i) => r6(valueOf(keys.filter(k => k.property === p), f, base[i] ?? 0))));
  return { times: frames.map(f => r6(f)), values, ease };
}

/** ES3-hjelperkall som setter nøkkelbilder med myking (KeyframeEase influence × 100) og «hold». */
function emitKeys(out: string[], doc: InterchangeDoc, target: string, s: Sampled, map: (v: number[]) => number | number[]): void {
  const tider = s.times.map(f => r6(sec(doc, f)));
  const verdier = s.values.map(v => map(v));
  out.push(`ptgNokkler(${target}, ${js(tider)}, ${js(verdier)}, ${js(s.ease.map(e => e.inn))}, ${js(s.ease.map(e => e.ut))}, ${js(s.ease.map(e => e.hold))});`);
}

/** Banens posisjoner og romlige tangenter, fra samme spline som transformAt (pathPointAt/pathProgress). */
function pathSamples(layer: LayerTrack, doc: InterchangeDoc): { times: number[]; values: number[][]; inn: number[][]; ut: number[][] } | null {
  const path = layer.path;
  if (!path) return null;
  const span = Math.max(1, path.endFrame - path.startFrame);
  const n = Math.min(span + 1, 33);
  const frames = Array.from({ length: n }, (_, i) => path.startFrame + (span * i) / (n - 1));
  const at = (f: number) => pathPointAt(path, pathProgress(path, f));
  const d = span / (n - 1) / 2 || 0.5;
  return {
    times: frames.map(f => r6(sec(doc, f))),
    values: frames.map(f => { const p = at(f); return [r6(p.x), r6(p.y)]; }),
    inn: frames.map(f => { const a = at(Math.max(path.startFrame, f - d)); const b = at(Math.min(path.endFrame, f + d)); return [r6((a.x - b.x) / 3), r6((a.y - b.y) / 3)]; }),
    ut: frames.map(f => { const a = at(Math.max(path.startFrame, f - d)); const b = at(Math.min(path.endFrame, f + d)); return [r6((b.x - a.x) / 3), (b.y - a.y) / 3].map(r6); }),
  };
}

const color = (hex: string): number[] => {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(hex);
  return m ? [1, 2, 3].map(i => parseInt(m[i]!, 16) / 255) : [0.5, 0.5, 0.5];
};

interface LayerCtx { readonly zPx: number; readonly threeD: boolean; readonly scale: number }

function emitLayer(out: string[], doc: InterchangeDoc, shot: Shot, layer: LayerTrack, i: number, refs: ReadonlyMap<string, string>, ctx: LayerCtx, mode: AeCameraMode): void {
  const src = layer.source;
  const navn = `${shot.name}_${src.name}`.slice(0, 120);
  const v = `L${i}`;
  const len = r6(sec(doc, shot.lengthFrames));
  const base = src.transform;
  // Bildeskifter: sekvens i en underkomposisjon (ett bilde per skifte, krysstoning som opacity-ramp)
  if (src.kind !== "group" && layer.swaps.length > 0) {
    out.push(`var skift${i} = app.project.items.addComp(${js(navn + "_skifter")}, ${doc.frameSize.width}, ${doc.frameSize.height}, 1, ${len}, ${r6(fpsFloat(doc))});`);
    const frames = [0, ...layer.swaps.map(w => w.frame)];
    const files = [layer.fileId, ...layer.swaps.map(w => w.fileId)];
    const ends = [...layer.swaps.map(w => w.frame), shot.lengthFrames];
    frames.forEach((f, k) => {
      const ref = files[k] ? refs.get(files[k]!) : null;
      if (!ref) { out.push(`// missing media for swap ${k} in ${js(navn)}`); return; }
      out.push(`var e${i}_${k} = skift${i}.layers.add(media[${js(ref)}]);`);
      out.push(`e${i}_${k}.startTime = ${r6(sec(doc, f))}; e${i}_${k}.inPoint = ${r6(sec(doc, f))}; e${i}_${k}.outPoint = ${r6(sec(doc, ends[k] ?? shot.lengthFrames))};`);
      const tr = layer.swaps[k - 1]?.transition;
      if (tr && tr.frames > 0) {
        out.push(`e${i}_${k}.property("Opacity").setValueAtTime(${r6(sec(doc, f))}, 0);`);
        out.push(`e${i}_${k}.property("Opacity").setValueAtTime(${r6(sec(doc, f + tr.frames))}, 100);`);
      }
    });
    out.push(`var ${v} = comp.layers.add(skift${i});`);
  } else if (src.kind === "group") {
    out.push(`var ${v} = comp.layers.addNull();`); // grupper er null-foreldre
  } else if (layer.fileId && refs.get(layer.fileId)) {
    out.push(`var ${v} = comp.layers.add(media[${js(refs.get(layer.fileId)!)}]);`);
  } else if (src.fill) {
    out.push(`var ${v} = comp.layers.addSolid(${js(color(src.fill))}, ${js(navn)}, ${Math.max(1, Math.round(src.width))}, ${Math.max(1, Math.round(src.height))}, 1, ${len});`);
  } else {
    out.push(`// skipped ${js(navn)}: no file (text and unfinished layers are not recreated)`);
    return;
  }
  out.push(`${v}.name = ${js(navn)};`);
  if (layer.activeRange) {
    out.push(`${v}.inPoint = ${r6(sec(doc, layer.activeRange.startFrame))}; ${v}.outPoint = ${r6(sec(doc, layer.activeRange.endFrame))};`);
  } else if (src.kind !== "group") {
    out.push(`${v}.inPoint = 0; ${v}.outPoint = ${len};`);
  }
  // Transformasjoner: posisjon fra bane (romlige tangenter) eller x/y-nøkler; skala, rotasjon, dekning
  const path = pathSamples(layer, doc);
  const zSuffix = ctx.threeD ? `, ${r6(ctx.zPx)}` : "";
  if (path) {
    const values = path.values.map(p => ctx.threeD ? [...p, r6(ctx.zPx)] : p);
    out.push(`ptgBane(${v}.property("Position"), ${js(path.times)}, ${js(values)}, ${js(path.inn)}, ${js(path.ut)});`);
  } else {
    const pos = sampleProps(layer, ["x", "y"], [base.x, base.y]);
    if (pos) {
      emitKeys(out, doc, `${v}.property("Position")`, pos, p => ctx.threeD ? [p[0]!, p[1]!, r6(ctx.zPx)] : [p[0]!, p[1]!]);
    } else {
      out.push(`${v}.property("Position").setValue([${r6(base.x)}, ${r6(base.y)}${zSuffix}]);`);
    }
  }
  const scale = sampleProps(layer, ["scaleX", "scaleY"], [base.scaleX, base.scaleY]);
  if (scale) emitKeys(out, doc, `${v}.property("Scale")`, scale, p => [r6(p[0]! * 100), r6(p[1]! * 100)]);
  else out.push(`${v}.property("Scale").setValue([${r6(base.scaleX * 100)}, ${r6(base.scaleY * 100)}]);`);
  const rotProp = ctx.threeD ? "Z Rotation" : "Rotation";
  const rot = sampleProps(layer, ["rotation"], [base.rotation]);
  if (rot) emitKeys(out, doc, `${v}.property(${js(rotProp)})`, rot, p => p[0]!);
  else out.push(`${v}.property(${js(rotProp)}).setValue(${r6(base.rotation)});`);
  const opa = sampleProps(layer, ["opacity"], [base.opacity]);
  if (opa) emitKeys(out, doc, `${v}.property("Opacity")`, opa, p => r6(p[0]! * 100));
  else out.push(`${v}.property("Opacity").setValue(${r6(base.opacity * 100)});`);
  if (ctx.threeD) out.push(`${v}.threeDLayer = true;`);
  // Grupper: null-foreldre med anker; barna peker på foreldren
  if (src.kind === "group" && src.anchor) {
    out.push(`${v}.property("Anchor Point").setValue([${r6(src.anchor.x - base.x)}, ${r6(src.anchor.y - base.y)}${ctx.threeD ? ", 0" : ""}]);`);
  }
  if (src.groupId) {
    const parent = shot.layers.findIndex(l => l.id === src.groupId);
    if (parent >= 0) out.push(`${v}.parent = L${parent};`);
  }
  // Masker som Shape (rektangel/ellipse; klippelag bruker det refererte laget som alfa-matte)
  const mask = src.mask;
  if (mask && mask.kind !== "layer") {
    const mk = (p: string) => layer.keyframes.filter(k => k.property === p);
    const lastFrame = layer.keyframes.filter(k => k.property.startsWith("mask")).map(k => k.frame);
    const f = lastFrame.length ? Math.max(...lastFrame) : -1;
    const val = (p: string, b: number) => r6(valueOf(mk(p), f, b));
    const shapeProp = mask.kind === "ellipse" ? "ADBE Vector Shape - Ellipse" : "ADBE Vector Shape - Rect";
    const sizeProp = mask.kind === "ellipse" ? "ADBE Vector Ellipse Size" : "ADBE Vector Rect Size";
    const posProp = mask.kind === "ellipse" ? "ADBE Vector Ellipse Position" : "ADBE Vector Rect Position";
    out.push(`var msk${i} = comp.layers.addShape(); msk${i}.name = ${js(navn + "_maske")};`);
    out.push(`var mg${i} = msk${i}.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group");`);
    out.push(`var mv${i} = mg${i}.property("ADBE Vectors Group");`);
    out.push(`var mf${i} = mv${i}.addProperty(${js(shapeProp)});`);
    out.push(`mf${i}.property(${js(sizeProp)}).setValue([${val("maskWidth", mask.width)}, ${val("maskHeight", mask.height)}]);`);
    out.push(`mf${i}.property(${js(posProp)}).setValue([${val("maskX", mask.x) + val("maskWidth", mask.width) / 2}, ${val("maskY", mask.y) + val("maskHeight", mask.height) / 2}]);`);
    out.push(`var mfill${i} = mv${i}.addProperty("ADBE Vector Graphic - Fill");`);
    out.push(`mfill${i}.property("ADBE Vector Fill Color").setValue([1, 1, 1, 1]);`);
    out.push(`msk${i}.moveBefore(${v});`);
    out.push(`${v}.trackMatteType = TrackMatteType.${mask.invert ? "ALPHA_INVERTED" : "ALPHA"};`);
  } else if (mask && mask.kind === "layer") {
    const holder = shot.layers.findIndex(l => l.id === mask.layerId);
    if (holder >= 0) out.push(`${v}.trackMatteType = TrackMatteType.${mask.invert ? "ALPHA_INVERTED" : "ALPHA"}; // matte: L${holder}`);
  }
  // 2D-parallakse: null-lag som fører kameraets bevegelse skalert med platenes parallakse
  if (mode === "parallax" && shot.camera) {
    const cam = shot.camera;
    const par = src.rigPlateId ? (cam.plates.find(p => p.id === src.rigPlateId)?.parallax ?? src.parallax) : src.parallax;
    const cx = doc.frameSize.width / 2; const cy = doc.frameSize.height / 2;
    const times = cam.frames.map(f => r6(sec(doc, f.frame)));
    const zeros = times.map(() => 0); const falses = times.map(() => false);
    const pos = cam.frames.map(f => [r6(cx - f.panXMm * cam.pxPerMm * par * ctx.scale), r6(cy - f.panYMm * cam.pxPerMm * par * ctx.scale)]);
    const sc = cam.frames.map(f => { const s = r6((1 + (f.zoom - 1) * par) * 100); return [s, s]; });
    const ro = cam.frames.map(f => r6(-f.rollDeg));
    out.push(`var par${i} = comp.layers.addNull(); par${i}.name = ${js("PAR_" + navn)};`);
    out.push(`ptgNokkler(par${i}.property("Position"), ${js(times)}, ${js(pos)}, ${js(zeros)}, ${js(zeros)}, ${js(falses)});`);
    out.push(`ptgNokkler(par${i}.property("Scale"), ${js(times)}, ${js(sc)}, ${js(zeros)}, ${js(zeros)}, ${js(falses)});`);
    out.push(`ptgNokkler(par${i}.property("Rotation"), ${js(times)}, ${js(ro)}, ${js(zeros)}, ${js(zeros)}, ${js(falses)});`);
    out.push(`${v}.parent = par${i};`);
  }
}

function emitShot(out: string[], doc: InterchangeDoc, shot: Shot, refs: ReadonlyMap<string, string>, mode: AeCameraMode): void {
  const len = r6(sec(doc, shot.lengthFrames));
  out.push(`var comp = app.project.items.addComp(${js(shot.name)}, ${doc.frameSize.width}, ${doc.frameSize.height}, 1, ${len}, ${r6(fpsFloat(doc))});`);
  out.push(`comp.parentFolder = rot;`);
  const cam = shot.camera;
  const compPxW = cam ? cam.pxPerMm * cam.frames[0]!.fieldWidthMm * cam.frames[0]!.zoom : doc.frameSize.width;
  const scale = cam ? doc.frameSize.width / compPxW : 1;
  const refH = cam ? (cam.plates.find(p => p.id === cam.referencePlateId)?.heightMm ?? 0) : 0;
  const zOf = (plateId: string | null | undefined): number => {
    if (!cam || !plateId) return 0;
    const p = cam.plates.find(x => x.id === plateId);
    return p ? (cam.cameraHeightMm - refH - p.distanceMm) * cam.pxPerMm * scale : 0;
  };
  // Lagenes rekkefølge: lavest nøkkel tegnes først (bakerst) og legges inn først, slik at AE sin topp stemmer
  const ordered = [...shot.layers].sort((a, b) => a.source.orderKey < b.source.orderKey ? -1 : 1);
  ordered.forEach((layer) => {
    const i = shot.layers.indexOf(layer);
    emitLayer(out, doc, shot, layer, i, refs, { zPx: zOf(layer.source.rigPlateId), threeD: mode === "ae" && !!cam, scale }, mode);
  });
  // Lyd med volumpunkter (nivå i dB, som i AE)
  shot.audio.forEach((a, i) => {
    const ref = a.fileId ? refs.get(a.fileId) : null;
    if (!ref) { out.push(`// audio ${js(a.source.name)} has no file`); return; }
    out.push(`var aud${i} = comp.layers.add(media[${js(ref)}]); aud${i}.name = ${js(shot.name + "_" + a.source.name)};`);
    out.push(`aud${i}.startTime = ${r6(sec(doc, a.startFrame))};`);
    const keys = a.volumeKeys.length > 0 ? a.volumeKeys : [{ frame: 0, db: 0 }];
    out.push(`ptgNokkler(aud${i}.property("Audio Levels"), ${js(keys.map(k => r6(sec(doc, a.startFrame + k.frame))))}, ${js(keys.map(k => [r6(k.db + a.gain), r6(k.db + a.gain)]))}, ${js(keys.map(() => 0))}, ${js(keys.map(() => 0))}, ${js(keys.map(() => false))});`);
  });
  // Kamera: AE-kamera (3D, plater på z, zoom = bredde × f / filmbredde) eller 2D-parallakse (null-lag over)
  if (mode === "ae" && cam) {
    const zoomPx = r6(doc.frameSize.width * cam.focalLengthMm / cam.sensorWidthMm);
    out.push(`var kam = comp.layers.addCamera(${js(shot.name + "_KAM")}, [${r6(doc.frameSize.width / 2)}, ${r6(doc.frameSize.height / 2)}]);`);
    cam.plates.forEach((p, i) => {
      out.push(`var plate${i} = comp.layers.addNull(); plate${i}.threeDLayer = true; plate${i}.name = ${js(shot.name + "_" + p.name)};`);
      out.push(`plate${i}.property("Position").setValue([${r6(doc.frameSize.width / 2)}, ${r6(doc.frameSize.height / 2)}, ${r6(zOf(p.id))}]);`);
    });
    const times = cam.frames.map(f => r6(sec(doc, f.frame)));
    const zeros = times.map(() => 0); const falses = times.map(() => false);
    const cx = doc.frameSize.width / 2; const cy = doc.frameSize.height / 2;
    const pos = cam.frames.map(f => [r6(cx - f.panXMm * cam.pxPerMm * scale), r6(cy - f.panYMm * cam.pxPerMm * scale),
      r6(-(f.cameraHeightMm - refH) * cam.pxPerMm * scale)]);
    out.push(`kam.property("Point of Interest").setValue([${r6(cx)}, ${r6(cy)}, 0]);`);
    out.push(`ptgNokkler(kam.property("Position"), ${js(times)}, ${js(pos)}, ${js(zeros)}, ${js(zeros)}, ${js(falses)});`);
    out.push(`ptgNokkler(kam.property("Z Rotation"), ${js(times)}, ${js(cam.frames.map(f => r6(-f.rollDeg)))}, ${js(zeros)}, ${js(zeros)}, ${js(falses)});`);
    if (cam.mode === "fixed") {
      // «Fast kamera»: høyden står fast, og zoomen ligger i feltet (linsezoom × digital zoom)
      out.push(`ptgNokkler(kam.property("Zoom"), ${js(times)}, ${js(cam.frames.map(f => r6(zoomPx * f.zoom)))}, ${js(zeros)}, ${js(zeros)}, ${js(falses)});`);
    } else {
      out.push(`kam.property("Zoom").setValue(${zoomPx});`);
    }
  } else if (mode === "ae" && !cam) {
    out.push(`// shot has no rig - camera omitted (see LESMEG.txt)`);
  }
  out.push(`var hovedLag = hoved.layers.add(comp); hovedLag.startTime = ${r6(sec(doc, shot.startFrame))};`);
}

function emitTitleCard(out: string[], doc: InterchangeDoc, name: string, lenFrames: number, contentVar: string, tc: AeTitleCards, scene: string | null, qr: string | null): void {
  const w = doc.frameSize.width; const h = doc.frameSize.height; const f = r6(fpsFloat(doc));
  const card = TITLE_CARD_SECONDS;
  out.push(`var tk = app.project.items.addComp(${js(name + "_TITLE")}, ${w}, ${h}, 1, ${card}, ${f}); tk.parentFolder = rot;`);
  out.push(`tk.layers.addSolid(${js(CARD_BG)}, "BG", ${w}, ${h}, 1, ${card});`);
  out.push(`ptgTekst(tk, ${js(tc.filmTitle)}, ${r6(h * 0.06)}, [${r6(w / 2)}, ${r6(h * 0.13)}], ${js(CARD_FG)}, null);`);
  if (scene) out.push(`ptgTekst(tk, ${js(scene)}, ${r6(h * 0.038)}, [${r6(w / 2)}, ${r6(h * 0.2)}], ${js(CARD_ACCENT)}, null);`);
  if (qr) {
    out.push(`var qr = tk.layers.add(media[${js(qr)}]); qr.property("Position").setValue([${r6(w / 2)}, ${r6(h * 0.48)}]);`);
    out.push(`var qs = 100 * ${r6(h * 0.44)} / qr.source.height; qr.property("Scale").setValue([qs, qs]);`);
    out.push(`ptgTekst(tk, ${js(tc.explain)}, ${r6(h * 0.026)}, [${r6(w / 2)}, ${r6(h * 0.8)}], ${js(CARD_FG)}, [${r6(w * 0.7)}, ${r6(h * 0.1)}]);`);
  }
  out.push(`ptgTekst(tk, ${js(tc.footer)}, ${r6(h * 0.02)}, [${r6(w / 2)}, ${r6(h * 0.95)}], ${js(CARD_MUTED)}, null);`);
  out.push(`var rk = app.project.items.addComp(${js(name + "_RENDER")}, ${w}, ${h}, 1, ${r6(card + sec(doc, lenFrames))}, ${f}); rk.parentFolder = rot;`);
  out.push(`try { rk.displayStartTime = -${card}; } catch (e) {}`);
  out.push(`var rkBody = rk.layers.add(${contentVar}); rkBody.startTime = ${card};`);
  out.push(`var rkCard = rk.layers.add(tk); rkCard.startTime = 0;`);
}

/**
 * Hele bygg.jsx (ES3). `doc.references` gir fil-ID → relativ sti i pakken; bare media som brukes importeres.
 */
export function buildAeJsx(doc: InterchangeDoc, o: { readonly cameraMode: AeCameraMode; readonly titleCards?: AeTitleCards | null }): string {
  const refs = new Map(doc.references.map(r => [r.id, r.path]));
  const tc = o.titleCards ?? null;
  const used = new Set<string>();
  for (const s of doc.shots) {
    for (const l of s.layers) { if (l.fileId) used.add(l.fileId); for (const w of l.swaps) if (w.fileId) used.add(w.fileId); }
    for (const a of s.audio) if (a.fileId) used.add(a.fileId);
  }
  const out: string[] = [
    "// bygg.jsx - From Pen to Glass (PTG3). ES3/ExtendScript. Run in After Effects from the package folder.",
    "// Transitions between scenes are out of scope (PTG-F1). Text and unfinished layers are not recreated.",
    "function ptgNokkler(p, tider, verdier, inn, ut, hold) {",
    "  var i;",
    "  for (i = 0; i < tider.length; i++) p.setValueAtTime(tider[i], verdier[i]);",
    "  for (i = 1; i <= tider.length; i++) {",
    "    if (hold[i - 1]) p.setInterpolationTypeAtKey(i, KeyframeInterpolationType.LINEAR, KeyframeInterpolationType.HOLD);",
    "    else p.setTemporalEaseAtKey(i, [new KeyframeEase(0, inn[i - 1])], [new KeyframeEase(0, ut[i - 1])]);",
    "  }",
    "}",
    "function ptgBane(p, tider, verdier, innT, utT) {",
    "  var i;",
    "  for (i = 0; i < tider.length; i++) p.setValueAtTime(tider[i], verdier[i]);",
    "  for (i = 1; i <= tider.length; i++) p.setSpatialTangentsAtKey(i, innT[i - 1], utT[i - 1]);",
    "}",
    "function ptgTekst(c, s, size, pos, col, box) {",
    "  var l = box ? c.layers.addBoxText(box, s) : c.layers.addText(s);",
    "  var p = l.property(\"Source Text\"); var d = p.value;",
    "  d.fontSize = size; d.applyFill = true; d.fillColor = col; d.justification = ParagraphJustification.CENTER_JUSTIFY;",
    "  try { d.font = \"Inter-Regular\"; } catch (e) {}",
    "  p.setValue(d); l.property(\"Position\").setValue(pos); return l;",
    "}",
    "app.beginUndoGroup(\"From Pen to Glass\");",
    `var rot = app.project.items.addFolder(${js(doc.project.code)});`,
    "var media = {};",
    ...[...[...used].filter(id => refs.has(id)).map(id => refs.get(id)!), ...(tc ? doc.shots.map(s => tc.qrPath(s)) : [])].map(path => {
      const p = js(path);
      return `media[${p}] = app.project.importFile(new ImportOptions(new File(${p})));`;
    }),
    `var hoved = app.project.items.addComp(${js(doc.project.code + "_hoved")}, ${doc.frameSize.width}, ${doc.frameSize.height}, 1, ${r6(sec(doc, doc.lengthFrames))}, ${r6(fpsFloat(doc))});`,
    "hoved.parentFolder = rot;",
  ];
  for (const shot of doc.shots) {
    emitShot(out, doc, shot, refs, o.cameraMode);
    if (tc) emitTitleCard(out, doc, shot.name, shot.lengthFrames, "comp", tc, tc.sceneLine(shot), tc.qrPath(shot));
  }
  if (tc) emitTitleCard(out, doc, doc.project.code + "_hoved", doc.lengthFrames, "hoved", tc, null, null);
  out.push("app.endUndoGroup();");
  return out.join("\n") + "\n";
}
