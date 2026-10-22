/**
 * PTG3 (B-102 §4): kamerasporet i InterchangeDoc, regnet ut fra scenens multiplanrigg (B-087/B-090).
 * Kameraet får aldri egne mål ved siden av riggens – alle tall her er avledet:
 * - synsfeltet på referanseplaten er sensor/m (W0), og digital zoom z gir synsfelt W0/z;
 * - modus «fysisk kamera» (moving): zoomen gir ny kamerahøyde etter linseformelen d = f(1 + 1/m);
 * - modus «fast kamera» (fixed): kamerahøyden står fast, og zoomen ligger i figurstørrelsen;
 * - panorering i scenepiksler blir mm gjennom pxPerMm på referanseplaten, og rotasjon blir rull;
 * - platene gir både 3D-tolkning (høyde og avstand i mm) og 2D-tolkning (parallakse dRef/d).
 * Ren TypeScript uten nettleser-API.
 */
import type { Composition } from "../model";
import { cameraAt } from "../composition/render";
import { framesToSeconds, secondsToFrames, type Rational } from "../time";
import {
  calibrationValid, fieldOfViewMm, magnification, plateOf, plateParallax,
  type MultiplaneRigSpec, type RigSetup,
} from "../rig/multiplane";
import type { CameraFrameSample, CameraPlate, CameraTrack } from "./types";

/** Tidsvinduet sporet regnes ut for: skuddets utsnitt av filmen, på opptakstidslinjen. */
export interface CameraTrackWindow {
  /** Skuddets start på opptakstidslinjen (avrundet grense, som i PTG1). */
  readonly startFrame: number;
  /** Skuddets lengde i bilder på opptakstidslinjen. */
  readonly lengthFrames: number;
  /** Eksponeringstrinn: 1 på ener, 2 på toere (tidslinjen er fortsatt 24 bilder/s). */
  readonly exposureStep: number;
  /** Opptakstidslinjens bildefrekvens. */
  readonly fps: Rational;
  /** Prosjektets bildefrekvens (komposisjonens og kameranøklene). */
  readonly sourceFps: Rational;
  /** Klippets start i filmen, i prosjektets bilder. */
  readonly sourceStartFrame: number;
}

/** Piksler per mm på referanseplaten: gyldig kalibrering overstyrer teorien (B-090 pkt 5). */
export function trackPxPerMm(spec: MultiplaneRigSpec, composition: Composition): { pxPerMm: number; referencePlateId: string; calibrated: boolean } {
  const cal = spec.calibration;
  if (calibrationValid(spec) && cal) return { pxPerMm: cal.pxPerMm, referencePlateId: cal.referencePlateId, calibrated: true };
  const ref = spec.plates[0]!;
  const d = spec.camera.cameraHeightMm - ref.heightMm;
  const pxPerMm = composition.width / fieldOfViewMm(spec.camera.sensorWidthMm, magnification(spec.camera.focalLengthMm, d));
  return { pxPerMm, referencePlateId: ref.id, calibrated: false };
}

/**
 * Kamerahøyden på et bilde (B-090 pkt 3). «Fysisk kamera»: zoomen z gir forstørrelsen m·z på
 * referanseplaten, og linseformelen gir den nye avstanden d = f(1 + 1/(m·z)). «Fast kamera»: høyden
 * er riggens, og z returneres som figurstørrelses-zoom.
 */
export function trackCameraHeightMm(spec: MultiplaneRigSpec, referencePlateId: string, zoom: number): number {
  const c = spec.camera;
  if (c.mode === "fixed") return c.cameraHeightMm;
  const ref = plateOf(spec, referencePlateId);
  if (!ref) return c.cameraHeightMm;
  const d = c.cameraHeightMm - ref.heightMm;
  const m = magnification(c.focalLengthMm, d) * Math.max(zoom, 1e-6);
  return ref.heightMm + c.focalLengthMm * (1 + 1 / m);
}

/**
 * Bygger kamerasporet for et skudd. Én prøve per eksponering: på toere ligger prøvene på annethvert
 * bilde av 24-bilderstidslinjen. Returnerer null når riggen ikke kan brukes (allerede sjekket av
 * byggeren, men dobbeltsjekket her slik at kameraet aldri får mål utenfor riggen).
 */
export function buildCameraTrack(rig: RigSetup, composition: Composition, w: CameraTrackWindow): CameraTrack | null {
  const spec = rig.spec;
  const c = spec.camera;
  const { pxPerMm, referencePlateId, calibrated } = trackPxPerMm(spec, composition);
  const ref = plateOf(spec, referencePlateId);
  if (!ref || !(pxPerMm > 0)) return null;
  const plates: CameraPlate[] = spec.plates.map(p => ({
    id: p.id, name: p.name, heightMm: p.heightMm,
    distanceMm: c.cameraHeightMm - p.heightMm,
    parallax: plateParallax(spec, p.id, referencePlateId) ?? 1,
  }));
  const frames: CameraFrameSample[] = [];
  for (let cf = 0; cf < w.lengthFrames; cf += Math.max(1, w.exposureStep)) {
    // Absolutt opptaksbilde → sekunder → prosjektets bilder → komposisjonsbilde (samme regel som PTG1).
    const sourceFilm = secondsToFrames(framesToSeconds(w.startFrame + cf, w.fps), w.sourceFps);
    const k = cameraAt(composition, sourceFilm - w.sourceStartFrame);
    const zoom = Math.max(k.zoom, 1e-6);
    frames.push({
      frame: cf,
      fieldWidthMm: composition.width / pxPerMm / zoom,
      fieldHeightMm: composition.height / pxPerMm / zoom,
      panXMm: (k.x - composition.width / 2) / pxPerMm,
      panYMm: (k.y - composition.height / 2) / pxPerMm,
      rollDeg: k.rotation,
      cameraHeightMm: trackCameraHeightMm(spec, referencePlateId, zoom),
      zoom,
    });
  }
  return {
    mode: c.mode, rigName: rig.name,
    sensorWidthMm: c.sensorWidthMm, sensorHeightMm: c.sensorHeightMm,
    focalLengthMm: c.focalLengthMm, cameraHeightMm: c.cameraHeightMm,
    referencePlateId, pxPerMm, calibrated, plates, frames,
  };
}
