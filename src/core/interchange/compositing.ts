/** PTG7: pure Nuke/Fusion serialization. World coordinates are millimetres, Y up, camera looking -Z. */
import { transformAt } from '../composition/render';
import type { CameraFrameSample, InterchangeDoc, LayerTrack, Shot } from './types';

const n = (value: number): string => String(Math.round(value * 1e8) / 1e8);
// Braces, Tcl substitution and Lua escape sequences in user names never enter node syntax.
const quote = (value: string): string => JSON.stringify(value).replace(/\$/g, '\\$').replace(/\[/g, '\\[').replace(/\]/g, '\\]');
const luaQuote = JSON.stringify;

export interface CompositingCameraSample {
  readonly frame: number;
  readonly x: number; readonly y: number; readonly z: number;
  readonly roll: number; readonly horizontalFov: number; readonly verticalFov: number;
  readonly focalMm: number;
}

/** Hold each exposure on twos; no interpolated movement on the intervening frame. */
function cameraFrame(shot: Shot, frame: number): CameraFrameSample | undefined {
  const frames = shot.camera?.frames;
  if (!frames?.length) return undefined;
  let sample = frames[0];
  for (const next of frames) { if (next.frame > frame) break; sample = next; }
  return sample;
}

export function compositingCamera(shot: Shot): CompositingCameraSample[] {
  const camera = shot.camera;
  if (!camera) return [];
  const reference = camera.plates.find(p => p.id === camera.referencePlateId);
  if (!reference) return [];
  return Array.from({ length: shot.lengthFrames }, (_, frame) => {
    const sample = cameraFrame(shot, frame);
    if (!sample) throw new Error('PTG7 camera track has no samples');
    const distance = sample.cameraHeightMm - reference.heightMm;
    const horizontalFov = 2 * Math.atan(sample.fieldWidthMm / (2 * distance)) * 180 / Math.PI;
    return { frame, x: sample.panXMm, y: -sample.panYMm, z: sample.cameraHeightMm,
      roll: -sample.rollDeg, horizontalFov,
      verticalFov: 2 * Math.atan(sample.fieldHeightMm / (2 * distance)) * 180 / Math.PI,
      focalMm: camera.sensorWidthMm * distance / sample.fieldWidthMm };
  });
}

export function compositingLayers(doc: InterchangeDoc, shot: Shot) {
  const cam = shot.camera;
  const ref = cam?.plates.find(p => p.id === cam.referencePlateId);
  return shot.layers.filter(l => l.source.visible && l.source.kind !== 'group' && l.fileId)
    .sort((a, b) => {
      const az = cam?.plates.find(p => p.id === a.source.rigPlateId)?.heightMm ?? ref?.heightMm ?? 0;
      const bz = cam?.plates.find(p => p.id === b.source.rigPlateId)?.heightMm ?? ref?.heightMm ?? 0;
      return az - bz || a.source.orderKey.localeCompare(b.source.orderKey);
    }).map((layer, index) => {
      const plate = cam?.plates.find(p => p.id === layer.source.rigPlateId) ?? ref;
      const ratio = cam && ref && plate ? plate.distanceMm / ref.distanceMm : 1;
      const mmPerPx = cam ? ratio / cam.pxPerMm : 1;
      const frames = Array.from({ length: shot.lengthFrames }, (_, frame) => {
        const held = Math.floor(frame / doc.exposureStep) * doc.exposureStep;
        const source = { ...layer.source, keyframes: layer.keyframes, swaps: [], path: layer.path };
        const tr = transformAt(source, held);
        return { frame, x: (tr.x - doc.frameSize.width / 2) * mmPerPx,
          y: -(tr.y - doc.frameSize.height / 2) * mmPerPx, z: plate?.heightMm ?? 0,
          width: layer.source.width * tr.scaleX * mmPerPx,
          height: layer.source.height * tr.scaleY * mmPerPx,
          rotation: -tr.rotation, opacity: layer.activeRange && (frame < layer.activeRange.startFrame || frame >= layer.activeRange.endFrame) ? 0 : tr.opacity,
          scaleX: tr.scaleX, scaleY: tr.scaleY };
      });
      return { layer, name: `Plate_${index + 1}`, mmPerPx, frames };
    });
}

const curve = <T extends { frame: number }>(frames: readonly T[], value: (sample: T) => number): string =>
  `{curve ${frames.map(f => `x${f.frame} ${n(value(f))}`).join(' ')}}`;

/** Nuke leser PNG-sekvenser med %05d-mønster; Fusion Loader tar første bilde og finner resten selv. */
function mediaPath(doc: InterchangeDoc, layer: LayerTrack, tool: 'nuke' | 'fusion' = 'fusion'): string {
  const ref = doc.references.find(r => r.id === layer.fileId);
  const path = ref?.sequence && tool === 'nuke' ? ref.sequence.pattern : ref?.path;
  return path ? `../${path}` : '';
}

export function nukeScript(doc: InterchangeDoc, shot: Shot): string {
  // i18n-ignore: Nuke file syntax, not interface copy ("last" is a knob identifier).
  const out = ['version 13.0 v1', `Root {\n first_frame 0\n last_frame ${Math.max(0, shot.lengthFrames - 1)}\n fps ${n(doc.fps.num / doc.fps.den)}\n format "${doc.frameSize.width} ${doc.frameSize.height} 0 0 ${doc.frameSize.width} ${doc.frameSize.height} 1 PTG"\n}`];
  const layers = compositingLayers(doc, shot);
  for (const [i, item] of layers.entries()) {
    const f = item.frames;
    // i18n-ignore: Nuke Read node syntax; last/label are file-format identifiers.
    out.push(`Read {\n file ${quote(mediaPath(doc, item.layer, 'nuke'))}\n first 0\n last ${Math.max(0, shot.lengthFrames - 1)}\n name Read_${i + 1}\n label ${quote(item.layer.source.name)}\n}`, `set read_${i} [stack 0]`);
    out.push(`Multiply {\n value ${curve(f, s => s.opacity)}\n name Opacity_${i + 1}\n}`);
    if (shot.camera) {
      out.push(`Card2 {\n inputs 1\n translate {${curve(f, s => s.x)} ${curve(f, s => s.y)} ${curve(f, s => s.z)}}\n rotate {0 0 ${curve(f, s => s.rotation)}}\n scaling {${curve(f, s => s.width / 2)} ${curve(f, s => s.height / 2)} 1}\n image_aspect false\n name ${item.name}\n}`);
    } else {
      out.push(`Transform {\n translate {${curve(f, s => s.x)} ${curve(f, s => s.y)}}\n rotate ${curve(f, s => s.rotation)}\n scale {${curve(f, s => s.scaleX)} ${curve(f, s => s.scaleY)}}\n center {${n(item.layer.source.width / 2)} ${n(item.layer.source.height / 2)}}\n name ${item.name}\n}`);
    }
    out.push(`set plate_${i} [stack 0]`);
  }
  if (shot.camera) {
    const samples = compositingCamera(shot);
    out.push('push 0', `Camera2 {\n inputs 0\n translate {${curve(samples, s => s.x)} ${curve(samples, s => s.y)} ${curve(samples, s => s.z)}}\n rotate {0 0 ${curve(samples, s => s.roll)}}\n focal ${curve(samples, s => s.focalMm)}\n haperture ${n(shot.camera.sensorWidthMm)}\n vaperture ${n(shot.camera.sensorWidthMm * doc.frameSize.height / doc.frameSize.width)}\n name Camera\n}`, 'set camera [stack 0]');
    out.push('push 0', ...layers.map((_, i) => `push $plate_${i}`), `Scene {\n inputs ${layers.length}\n name Scene\n}`, 'set scene [stack 0]', 'push 0', 'push $camera', 'push $scene', 'push 0', 'ScanlineRender {\n inputs 3\n name Render\n}');
  } else if (layers.length) {
    out.push('push $plate_0');
    for (let i = 1; i < layers.length; i++) out.push(`push $plate_${i}`, `Merge2 {\n inputs 2\n operation over\n name Merge_${i}\n}`);
  }
  return out.join('\n') + '\n';
}

function fusionCurve<T extends { frame: number }>(name: string, frames: readonly T[], get: (s: T) => number): string {
  return `${name} = BezierSpline { KeyFrames = { ${frames.map(f => `[${f.frame}] = { ${n(get(f))}, Flags = { Linear = true } }`).join(', ')} } }`;
}

export function fusionComp(doc: InterchangeDoc, shot: Shot): string {
  const tools: string[] = [];
  const input = (name: string, field: string): string => `${field} = Input { SourceOp = "${name}_${field}", Source = "Value" }`;
  const animated = <T extends { frame: number }>(name: string, frames: readonly T[], values: Record<string, (s: T) => number>): string[] =>
    Object.entries(values).map(([field, get]) => { tools.push(fusionCurve(`${name}_${field}`, frames, get)); return input(name, field); });
  const layers = compositingLayers(doc, shot);
  for (const [i, item] of layers.entries()) {
    const name = item.name;
    tools.push(`Read_${i + 1} = Loader { Clips = { Clip { ID = "Clip1", Filename = ${luaQuote(mediaPath(doc, item.layer))}, StartFrame = 0, Length = ${shot.lengthFrames}, Loop = 1 } }, Inputs = { GlobalIn = Input { Value = 0 }, GlobalOut = Input { Value = ${shot.lengthFrames - 1} } } }`);
    const values = shot.camera ? animated(name, item.frames, {
      'Transform3DOp.Translate.X': s => s.x, 'Transform3DOp.Translate.Y': s => s.y, 'Transform3DOp.Translate.Z': s => s.z,
      'Transform3DOp.Rotate.Z': s => s.rotation, 'MtlStdInputs.Opacity': s => s.opacity, 'Transform3DOp.Scale.X': s => s.width, 'Transform3DOp.Scale.Y': s => s.height,
    }) : animated(name, item.frames, { Angle: s => s.rotation, Size: s => s.scaleX, Aspect: s => s.scaleY / (s.scaleX || 1) });
    // Fusion tool identifiers cannot contain dots; spline names are normalized after serialization.
    if (shot.camera) tools.push(`${name} = ImagePlane3D { Inputs = { ${values.join(', ')}, MaterialInput = Input { SourceOp = "Read_${i + 1}", Source = "Output" }, ["SurfacePlaneInputs.Width"] = Input { Value = 1 }, ["SurfacePlaneInputs.Height"] = Input { Value = 1 } } }`);
    else {
      const centerFields = animated(`${name}_Center`, item.frames, { X: s => 0.5 + s.x / doc.frameSize.width, Y: s => 0.5 + s.y / doc.frameSize.height });
      const blend = animated(name, item.frames, { Blend: s => s.opacity });
      tools.push(`${name}_Center = XYPath { Inputs = { ${centerFields.join(', ')} } }`, `${name} = Transform { Inputs = { ${[...values, ...blend].join(', ')}, Center = Input { SourceOp = "${name}_Center", Source = "Position" }, Input = Input { SourceOp = "Read_${i + 1}", Source = "Output" } } }`);
    }
  }
  if (shot.camera) {
    const fields = animated('Camera', compositingCamera(shot), {
      'Transform3DOp.Translate.X': s => s.x, 'Transform3DOp.Translate.Y': s => s.y, 'Transform3DOp.Translate.Z': s => s.z,
      'Transform3DOp.Rotate.Z': s => s.roll, AoV: s => s.horizontalFov,
    });
    tools.push(`Camera = Camera3D { Inputs = { ${fields.join(', ')}, ["AovType"] = Input { Value = 0 } } }`);
    tools.push(`Scene = Merge3D { Inputs = { ${[...layers.map(l => l.name), 'Camera'].map((name, i) => `SceneInput${i + 1} = Input { SourceOp = "${name}", Source = "Output" }`).join(', ')} } }`);
    tools.push(`Render = Renderer3D { Inputs = { SceneInput = Input { SourceOp = "Scene", Source = "Output" }, Width = Input { Value = ${doc.frameSize.width} }, Height = Input { Value = ${doc.frameSize.height} }, CameraSelector = Input { Value = "Camera" } } }`);
  } else for (let i = 1; i < layers.length; i++) {
    tools.push(`Merge_${i} = Merge { Inputs = { Background = Input { SourceOp = "${i === 1 ? 'Plate_1' : `Merge_${i - 1}`}", Source = "Output" }, Foreground = Input { SourceOp = "Plate_${i + 1}", Source = "Output" } } }`);
  }
  const body = tools.join(',\n').replace(/([A-Za-z_][A-Za-z_0-9]*)\.([A-Za-z_][A-Za-z_0-9.]*) = Input/g, (_, a: string, b: string) => `["${a}.${b}"] = Input`)
    .replace(/([A-Za-z_][A-Za-z_0-9.]*) = BezierSpline/g, (_, a: string) => `${a.replaceAll('.', '_')} = BezierSpline`)
    .replace(/SourceOp = "([^"]+)"/g, (_, value: string) => `SourceOp = "${value.replaceAll('.', '_')}"`);
  return `{ Tools = ordered() {\n${body}\n}, GlobalRange = { 0, ${Math.max(0, shot.lengthFrames - 1)} }, CurrentTime = 0, Prefs = { Comp = { FrameFormat = { Width = ${doc.frameSize.width}, Height = ${doc.frameSize.height}, Rate = ${n(doc.fps.num / doc.fps.den)} } } } }\n`;
}

export function compositingFiles(doc: InterchangeDoc): { path: string; data: string }[] {
  return doc.shots.flatMap(shot => [{ path: `${shot.name}/${shot.name}.nk`, data: nukeScript(doc, shot) },
    { path: `${shot.name}/${shot.name}.comp`, data: fusionComp(doc, shot) }]);
}