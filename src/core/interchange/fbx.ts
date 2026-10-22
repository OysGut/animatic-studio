/**
 * PTG3 (B-102 §4, PTG-B5): FBX ASCII 7.4 for Dragonframe (Arc). Merkes «eksperimentell» til formatet
 * er prøvd på en ekte rigg (spesifikasjonen §10). Eksportøren regner ingenting ut selv – alle tall
 * kommer fra CameraTrack i InterchangeDoc:
 * - tid i den gamle FBX-tidsenheten KTime (46 186 158 000 per sekund), på opptakstidslinjen;
 * - FilmWidth/FilmHeight i tommer og FocalLength i mm, fra riggens sensor og objektiv;
 * - verden i centimeter (UnitScaleFactor 1): kameraet på (panX, høyde, −panY) mm/10, med PreRotation
 *   −90° om X slik at det ser rett ned på bordet, og rull om Z;
 * - platene som null-objekter på sin høyde over bordet (3D-tolkningen).
 * Ren TypeScript uten nettleser-API.
 */
import type { Rational } from "../time";
import { framesToSeconds } from "../time";
import type { Shot } from "./types";

/** FBX sin gamle tidsenhet: KTime-tiks per sekund. */
export const FBX_KTIME_PER_SECOND = 46186158000;

/** Opptaksbilde → KTime (avrundet til nærmeste tiks; samme grenseregel som øvrig tid i modellen). */
export function fbxKTime(frame: number, fps: Rational): number {
  return Math.round(framesToSeconds(frame, fps) * FBX_KTIME_PER_SECOND);
}

const MM_TO_INCH = 1 / 25.4;
const num = (v: number): string => String(Math.round(v * 1e6) / 1e6);
/** FBX-verdier er ren ASCII; navn renskes slik at et skuddnavn aldri kan bryte strukturen. */
const safe = (name: string): string => name.replace(/[^A-Za-z0-9_.-]/g, "_");

function curve(id: number, times: readonly number[], values: readonly number[]): string {
  const kt = times.join(",");
  const kv = values.map(num).join(",");
  const n = times.length;
  return `    AnimationCurve: ${id}, "AnimCurve::", "" {
        Default: 0
        KeyVer: 4008
        KeyTime: *${n} {
            a: ${kt}
        }
        KeyValueFloat: *${n} {
            a: ${kv}
        }
        KeyAttrFlags: *${n} {
            a: ${new Array(n).fill(24840).join(",")}
        }
        KeyAttrDataFloat: *${n} {
            a: ${new Array(n).fill("0,0,0,0").join(",")}
        }
        KeyAttrRefCount: *${n} {
            a: ${new Array(n).fill(1).join(",")}
        }
    }`;
}

function curveNode(id: number, prop: string, x: number, y: number, z: number): string {
  return `    AnimationCurveNode: ${id}, "AnimCurveNode::${prop}", "" {
        Properties70:  {
            P: "d|X", "Number", "", "A",${num(x)}
            P: "d|Y", "Number", "", "A",${num(y)}
            P: "d|Z", "Number", "", "A",${num(z)}
        }
    }`;
}

/**
 * FBX for ett skudd. Returnerer null når skuddet ikke har kamera (uten rigg) – pakken forklarer da
 * i LESMEG hvorfor filen mangler.
 */
export function buildShotFbx(shot: Shot, fps: Rational): string | null {
  const cam = shot.camera;
  if (!cam) return null;
  const name = safe(shot.name);
  const camModel = 2000000001;
  const camAttr = 1000000001;
  const times = cam.frames.map(f => fbxKTime(f.frame, fps));
  const tx = cam.frames.map(f => f.panXMm / 10);
  const ty = cam.frames.map(f => f.cameraHeightMm / 10);
  const tz = cam.frames.map(f => -f.panYMm / 10);
  const rz = cam.frames.map(f => f.rollDeg);
  const zero = cam.frames.map(() => 0);
  const stop = times.length ? times[times.length - 1]! : 0;

  const plateModels: string[] = [];
  const connections: string[] = [
    `    C: "OO",${camAttr},${camModel}`,
    `    C: "OO",${camModel},0`,
  ];
  cam.plates.forEach((p, i) => {
    const id = 2000000100 + i;
    plateModels.push(`    Model: ${id}, "Model::${name}_${safe(p.name)}", "Null" {
        Version: 232
        Properties70:  {
            P: "Lcl Translation", "Lcl Translation", "", "A",0,${num(p.heightMm / 10)},0
        }
        Shading: T
        Culling: "CullingOff"
    }`);
    connections.push(`    C: "OO",${id},0`);
  });

  const nodeT = 3000000001;
  const nodeR = 3000000002;
  const curves = [
    { id: 4000000001, node: nodeT, ch: "d|X", c: curve(4000000001, times, tx) },
    { id: 4000000002, node: nodeT, ch: "d|Y", c: curve(4000000002, times, ty) },
    { id: 4000000003, node: nodeT, ch: "d|Z", c: curve(4000000003, times, tz) },
    { id: 4000000004, node: nodeR, ch: "d|X", c: curve(4000000004, times, zero) },
    { id: 4000000005, node: nodeR, ch: "d|Y", c: curve(4000000005, times, zero) },
    { id: 4000000006, node: nodeR, ch: "d|Z", c: curve(4000000006, times, rz) },
  ];
  connections.push(
    `    C: "OP",${nodeT},${camModel}, "Lcl Translation"`,
    `    C: "OP",${nodeR},${camModel}, "Lcl Rotation"`,
    ...curves.map(k => `    C: "OP",${k.id},${k.node}, "${k.ch}"`),
    `    C: "OO",${nodeT},5000000002`,
    `    C: "OO",${nodeR},5000000002`,
    `    C: "OO",5000000002,5000000001`,
  );

  return [
    "; FBX 7.4.0 project file",
    "; From Pen to Glass (PTG3, eksperimentell): " + shot.name,
    "; Units: cm. Time: KTime (46186158000/s). The camera looks down (PreRotation -90 about X), roll about Z.",
    "",
    "FBXHeaderExtension:  {",
    "    FBXHeaderVersion: 1003",
    "    FBXVersion: 7400",
    '    Creator: "From Pen to Glass"',
    "}",
    "GlobalSettings:  {",
    "    Version: 1000",
    "    Properties70:  {",
    '        P: "UpAxis", "int", "Integer", "",1',
    '        P: "UpAxisSign", "int", "Integer", "",1',
    '        P: "FrontAxis", "int", "Integer", "",2',
    '        P: "FrontAxisSign", "int", "Integer", "",1',
    '        P: "CoordAxis", "int", "Integer", "",0',
    '        P: "CoordAxisSign", "int", "Integer", "",1',
    '        P: "UnitScaleFactor", "double", "Number", "",1',
    '        P: "OriginalUnitScaleFactor", "double", "Number", "",1',
    '        P: "TimeMode", "enum", "", "",30',
    `        P: "CustomFrameRate", "double", "Number", "",${num(fps.num / fps.den)}`,
    '        P: "TimeSpanStart", "KTime", "Time", "",0',
    `        P: "TimeSpanStop", "KTime", "Time", "",${stop}`,
    "    }",
    "}",
    "Definitions:  {",
    "    Version: 100",
    `    Count: ${2 + cam.plates.length}`,
    '    ObjectType: "Model" {',
    `        Count: ${1 + cam.plates.length}`,
    "    }",
    '    ObjectType: "NodeAttribute" {',
    "        Count: 1",
    "    }",
    "}",
    "Objects:  {",
    `    NodeAttribute: ${camAttr}, "NodeAttribute::${name}_CAM", "Camera" {`,
    '        TypeFlags: "Camera"',
    "        Properties70:  {",
    `            P: "FilmWidth", "double", "Number", "",${num(cam.sensorWidthMm * MM_TO_INCH)}`,
    `            P: "FilmHeight", "double", "Number", "",${num(cam.sensorHeightMm * MM_TO_INCH)}`,
    `            P: "FocalLength", "double", "Number", "",${num(cam.focalLengthMm)}`,
    '            P: "FieldOfViewMode", "enum", "", "",0',
    "        }",
    "    }",
    `    Model: ${camModel}, "Model::${name}_CAM", "Camera" {`,
    "        Version: 232",
    "        Properties70:  {",
    '            P: "Lcl Translation", "Lcl Translation", "", "A",0,0,0',
    '            P: "Lcl Rotation", "Lcl Rotation", "", "A",0,0,0',
    '            P: "PreRotation", "Vector3D", "Vector", "",-90,0,0',
    "        }",
    "        Shading: T",
    '        Culling: "CullingOff"',
    "    }",
    ...plateModels,
    '    AnimationStack: 5000000001, "AnimStack::' + name + '", "" {',
    "        Properties70:  {",
    '            P: "LocalStart", "KTime", "Time", "",0',
    `            P: "LocalStop", "KTime", "Time", "",${stop}`,
    "        }",
    "    }",
    '    AnimationLayer: 5000000002, "AnimLayer::BaseLayer", "" {',
    "    }",
    curveNode(nodeT, "Lcl Translation", tx[0] ?? 0, ty[0] ?? 0, tz[0] ?? 0),
    curveNode(nodeR, "Lcl Rotation", 0, 0, rz[0] ?? 0),
    ...curves.map(k => k.c),
    "}",
    "Connections:  {",
    ...connections,
    "}",
    "",
  ].join("\n");
}
