// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { compositingCamera, compositingLayers, nukeScript, fusionComp } from '@/core/interchange/compositing';
import { doc, shot } from '../fixtures/ptg7/model';

/** Parse delimiters while honoring strings, escapes and comments, rather than counting characters. */
function balanced(source: string): boolean {
  const stack: string[] = []; let quoted = false; let escaped = false; let comment = false;
  for (const ch of source) {
    if (comment) { if (ch === '\n') comment = false; continue; }
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === '"') { quoted = !quoted; continue; }
    if (quoted) continue;
    if (ch === '#') { comment = true; continue; }
    if ('{[('.includes(ch)) stack.push(ch);
    else if ('}])'.includes(ch) && stack.pop() !== ({ '}': '{', ']': '[', ')': '(' }[ch])) return false;
  }
  return !quoted && stack.length === 0;
}

function nukeValues(text: string, knob: string): number[][] {
  const line = text.split('\n').find(l => l.trim().startsWith(`${knob} `)) ?? '';
  return [...line.matchAll(/\{curve ([^}]+)\}/g)].map(m => [...(m[1] ?? '').matchAll(/x\d+ (-?[\d.]+)/g)].map(v => Number(v[1])));
}
function fusionValues(text: string, spline: string): number[] {
  const line = text.split('\n').find(l => l.startsWith(`${spline} = BezierSpline`)) ?? '';
  return [...line.matchAll(/\[\d+\] = \{ (-?[\d.]+)/g)].map(v => Number(v[1]));
}

describe('PTG7 compositing', () => {
  it('exports back-to-front physical plates and relative media paths', () => {
    const layers = compositingLayers(doc, shot);
    expect(layers.map(l => l.layer.id)).toEqual(['back', 'front']);
    expect(layers.map(l => l.frames[0]?.z)).toEqual([0, 100]);
    const nk = nukeScript(doc, shot), comp = fusionComp(doc, shot);
    expect(nk.match(/Card2 \{/g)).toHaveLength(2);
    expect(comp.match(/= ImagePlane3D \{/g)).toHaveLength(2);
    expect(nk).toContain('ScanlineRender'); expect(comp).toContain('Renderer3D');
    expect(nk).toContain('../media/back.png'); expect(comp).toContain('../media/front.png');
    expect(comp).not.toMatch(/^\w+\.[\w.]+ =/m);
  });
  for (const mode of ['moving', 'fixed'] as const) it(`${mode}: serialized camera position and FOV match model per frame within 0.1 mm / 0.01 degree`, () => {
    const camera = shot.camera;
    if (!camera) throw new Error('fixture');
    const s = { ...shot, camera: { ...camera, mode, frames: camera.frames.map(f => ({ ...f, cameraHeightMm: mode === 'fixed' ? 900 : f.cameraHeightMm })) } };
    const samples = compositingCamera(s), nk = nukeScript(doc, s), comp = fusionComp(doc, s);
    const cameraBlock = nk.slice(nk.indexOf('Camera2 {'));
    const positions = nukeValues(cameraBlock, 'translate'), focal = nukeValues(cameraBlock, 'focal')[0] ?? [];
    const fx = fusionValues(comp, 'Camera_Transform3DOp_Translate_X');
    const fy = fusionValues(comp, 'Camera_Transform3DOp_Translate_Y');
    const fz = fusionValues(comp, 'Camera_Transform3DOp_Translate_Z');
    const fov = fusionValues(comp, 'Camera_AoV');
    expect(samples).toHaveLength(4);
    samples.forEach((sample, i) => {
      const source = s.camera.frames[i]; if (!source) throw new Error('frame');
      const expected = [source.panXMm, -source.panYMm, source.cameraHeightMm];
      [fx, fy, fz].forEach((values, axis) => expect(Math.abs((values[i] ?? Infinity) - (expected[axis] ?? 0))).toBeLessThan(0.1));
      positions.forEach((values, axis) => expect(Math.abs((values[i] ?? Infinity) - (expected[axis] ?? 0))).toBeLessThan(0.1));
      expect(positions).toHaveLength(3);
      const expectedFov = 2 * Math.atan(source.fieldWidthMm / (2 * source.cameraHeightMm)) * 180 / Math.PI;
      expect(Math.abs((fov[i] ?? Infinity) - expectedFov)).toBeLessThan(0.01);
      const nukeFov = 2 * Math.atan(camera.sensorWidthMm / (2 * (focal[i] ?? 0))) * 180 / Math.PI;
      expect(Math.abs(nukeFov - expectedFov)).toBeLessThan(0.01);
    });
  });
  it('holds twos without inventing camera movement', () => {
    const cam = shot.camera; if (!cam) throw new Error('fixture');
    const frames = compositingCamera({ ...shot, camera: { ...cam, frames: cam.frames.filter(f => f.frame % 2 === 0) } });
    expect(frames.map(f => f.x)).toEqual([0, 0, 20, 20]);
  });
  it('uses Transform and compositing instead of 3D for a shot without rig', () => {
    const s = { ...shot, camera: null };
    const nk = nukeScript(doc, s), comp = fusionComp(doc, s);
    expect(nk.match(/Transform \{/g)).toHaveLength(2); expect(comp.match(/= Transform \{/g)).toHaveLength(2);
    expect(nk).not.toContain('Camera2'); expect(comp).not.toContain('Camera3D');
    expect(nk).toContain('Merge2'); expect(comp).toContain('Merge_1 = Merge');
  });
  it('matches golden files and parses balanced Tcl/Lua blocks', () => {
    for (const [ext, value] of [['nk', nukeScript(doc, shot)], ['comp', fusionComp(doc, shot)]] as const) {
      expect(value).toBe(readFileSync(new URL(`../fixtures/ptg7/TEST_SC001_SH001_v003.${ext}`, import.meta.url), 'utf8'));
      expect(balanced(value)).toBe(true);
      expect(balanced(value + '}')).toBe(false);
    }
  });
});