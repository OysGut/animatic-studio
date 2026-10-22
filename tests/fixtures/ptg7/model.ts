import type { CompositionLayer } from '../../../src/core/model';
import type { InterchangeDoc, Shot } from '../../../src/core/interchange/types';

const layer = (id: string, plate: string, x: number): CompositionLayer => ({
  id, compositionId: 'c', revision: 1, kind: 'image', name: id, orderKey: id, assetId: null,
  assetVariantId: null, versionId: null, fill: null, width: 100, height: 60, parallax: 1,
  rigPlateId: plate, transform: { x, y: 300, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 },
  keyframes: [], swaps: [], path: null, anchor: null, groupId: null, visible: true, locked: false, removed: false,
} as unknown as CompositionLayer);

export const shot: Shot = {
  id: 's', sceneId: 'sc', sceneNumber: '1', shotNumber: 1, version: 3, name: 'TEST_SC001_SH001_v003',
  startFrame: 0, lengthFrames: 4, timecodeIn: '00:00:00:00', timecodeOut: '00:00:00:04',
  handleIn: 0, handleOut: 0, frameIn: 0, frameOut: 4, transition: { type: 'cut', lengthFrames: 0, overlap: false },
  sourceStartFrame: 0, sourceLengthFrames: 4, compositionId: 'c', thumbnail: { path: '', sourceFrame: 0 },
  description: '', characters: [], sets: [], props: [], status: 'planned', audio: [], dialogue: [], words: [],
  layers: ['front', 'back'].map((id, index) => ({ id, source: layer(id, index === 0 ? 'p1' : 'p0', 500),
    fileId: id, keyframes: [], swaps: [], activeRange: null, path: null })),
  camera: { mode: 'moving', rigName: 'Test', sensorWidthMm: 36, sensorHeightMm: 21.6,
    focalLengthMm: 50, cameraHeightMm: 900, referencePlateId: 'p0', pxPerMm: 2, calibrated: true,
    plates: [{ id: 'p0', name: 'Table', heightMm: 0, distanceMm: 900, parallax: 1 },
      { id: 'p1', name: 'Front', heightMm: 100, distanceMm: 800, parallax: 1.125 }],
    frames: [0, 1, 2, 3].map(frame => ({ frame, fieldWidthMm: 500 - frame * 20,
      fieldHeightMm: (500 - frame * 20) * 0.6, panXMm: frame * 10, panYMm: frame * -5,
      rollDeg: frame * 2, cameraHeightMm: 900 - frame * 50, zoom: 500 / (500 - frame * 20) })) },
};
export const doc: InterchangeDoc = {
  project: { id: 'p', name: 'Test', code: 'TEST' }, production: { id: 'prod', name: 'Main' },
  language: { dialogue: 'nb', subtitles: null }, fps: { num: 24, den: 1 }, captureFps: { num: 24, den: 1 },
  sourceFps: { num: 24, den: 1 }, exposureStep: 1, frameSize: { width: 1000, height: 600 },
  lengthFrames: 4, shots: [shot], namingVersion: '1',
  references: ['front', 'back'].map(id => ({ id, path: `media/${id}.png`, mediaPath: `source/${id}.png`, mimeType: 'image/png', byteSize: 1 })),
};