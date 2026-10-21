/**
 * Rigg & 2D-utskrift (B-087/DEC-0100, runde 1, REQ-0879–0888): vertikal multiplanrigg med kamerahus,
 * objektiv og N glassplater. All intern geometri regnes i millimeter; inches er bare visning.
 *
 * Størrelsesmatematikken (B-090):
 * - avstanden d til en plate er kamerahøyden minus platehøyden;
 * - forstørrelsen er m = f / (d − f), og synsfeltet på platen er sensorstørrelsen delt på m;
 * - fysisk figurstørrelse = figurens andel av komposisjonen × synsfeltet (transform og keyframes på
 *   valgt frame teller med, og i modusen «fast kamera» bakes den digitale kamerazoomen inn);
 * - en gyldig kalibrering overstyrer teorien; endres kameraverdiene den gjelder, merkes den ugyldig
 *   (den slettes ikke), og beregningen bruker teorien igjen.
 */
import { isUuid, type Id, type SceneId } from "../ids";
import type { Entity, ProjectState } from "../model";
import type { Composition, CompositionLayer } from "../model";
import { cameraAt, transformAt } from "../composition/render";
import { t } from "../i18n/keyed";

/** Multiplanrigg (runde 1, migrasjon 0071). Maler i prosjektet. */
export type RigTemplateId = Id<"rig_template">;
/** Riggen per scene, eller prosjektets standardrigg (sceneId = null). */
export type RigSetupId = Id<"rig_setup">;

/** Kameramodus (B-090 pkt 3): bare digital zoom endrer figurstørrelsen. */
export type MultiplaneCameraMode = "fixed" | "moving";

export interface RigCameraSpec {
  /** Sensorbredde og -høyde i mm. */
  readonly sensorWidthMm: number;
  readonly sensorHeightMm: number;
  /** Brennvidde i mm. */
  readonly focalLengthMm: number;
  /** Kamerahøyde over bordet i mm. */
  readonly cameraHeightMm: number;
  readonly mode: MultiplaneCameraMode;
}

export interface RigPlate {
  /** Permanent ID (REQ-0037): platen identifiseres aldri med nummer eller posisjon. */
  readonly id: string;
  readonly name: string;
  /** Høyde over bordet i mm (bordplaten er 0). */
  readonly heightMm: number;
  /** Glasstykkelse i mm, eller null. */
  readonly glassThicknessMm: number | null;
}

/**
 * Kalibreringen gjelder kamerahus, objektiv, brennvidde og plateavstand (B-090 pkt 5) og lagres sammen
 * med verdiene. Endres noen av dem, merkes kalibreringen ugyldig – den slettes ikke.
 */
export interface RigCalibration {
  readonly cameraHeightMm: number;
  readonly focalLengthMm: number;
  readonly sensorWidthMm: number;
  readonly sensorHeightMm: number;
  /** Platen målingen ble gjort på. */
  readonly referencePlateId: string;
  /** Målte skjermpiksler per mm på referanseplaten. */
  readonly pxPerMm: number;
  readonly calibratedAt: string;
  /** false: kameraverdiene er endret etter målingen; beregningen bruker teorien. */
  readonly valid: boolean;
}

export interface MultiplaneRigSpec {
  readonly format: "1";
  readonly camera: RigCameraSpec;
  /** Platene, bakerst (lavest) først. Minst én. */
  readonly plates: readonly RigPlate[];
  readonly calibration: RigCalibration | null;
}

/** En riggmal i prosjektet. Malen endres aldri stilltiende – bare «Lagre som mal»/«Oppdater malen». */
export interface RigTemplate extends Entity<RigTemplateId> {
  readonly name: string;
  readonly spec: MultiplaneRigSpec;
  readonly removed: boolean;
}

/**
 * En rigg i bruk: prosjektets standardrigg (sceneId = null) eller riggen i én scene. Begge er kopier
 * med individuelle justeringer (B-090 pkt 4); templateId viser opphavet, uten kobling videre.
 */
export interface RigSetup extends Entity<RigSetupId> {
  readonly sceneId: SceneId | null;
  readonly templateId: RigTemplateId | null;
  readonly name: string;
  readonly spec: MultiplaneRigSpec;
  readonly removed: boolean;
}

/** Standardriggen i et nytt prosjekt eller en ny mal: et vanlig oppsett med bordplate og to glassplater. */
export function defaultRigSpec(): MultiplaneRigSpec {
  return {
    format: "1",
    camera: {
      sensorWidthMm: 36,
      sensorHeightMm: 24,
      focalLengthMm: 50,
      cameraHeightMm: 900,
      mode: "fixed",
    },
    plates: [
      { id: "00000000-0000-4000-8000-000000000001", name: "Bord", heightMm: 0, glassThicknessMm: null },
      { id: "00000000-0000-4000-8000-000000000002", name: "Plate 1", heightMm: 100, glassThicknessMm: 4 },
      { id: "00000000-0000-4000-8000-000000000003", name: "Plate 2", heightMm: 200, glassThicknessMm: 4 },
    ],
    calibration: null,
  };
}

const num = (v: unknown, min: number, max: number): boolean =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;

/** Validering før lagring. Returnerer en feilmelding, eller null når oppsettet er gyldig. */
export function multiplaneRigSpecError(spec: MultiplaneRigSpec): string | null {
  if (!spec || typeof spec !== "object" || spec.format !== "1")
    return t("core-rig-multiplane.spec-error.format");
  const c = spec.camera;
  if (!c || typeof c !== "object")
    return t("core-rig-multiplane.spec-error.camera");
  if (!num(c.sensorWidthMm, 1, 1000) || !num(c.sensorHeightMm, 1, 1000))
    return t("core-rig-multiplane.spec-error.sensor");
  if (!num(c.focalLengthMm, 1, 2000)) return t("core-rig-multiplane.spec-error.focal");
  if (!num(c.cameraHeightMm, 50, 10000)) return t("core-rig-multiplane.spec-error.height");
  if (c.mode !== "fixed" && c.mode !== "moving") return t("core-rig-multiplane.spec-error.mode");
  if (c.cameraHeightMm <= c.focalLengthMm) return t("core-rig-multiplane.spec-error.distance");
  if (!Array.isArray(spec.plates) || spec.plates.length < 1 || spec.plates.length > 12)
    return t("core-rig-multiplane.spec-error.plates");
  const ids = new Set<string>();
  for (const p of spec.plates) {
    if (!p || typeof p !== "object" || !isUuid(p.id) || ids.has(p.id))
      return t("core-rig-multiplane.spec-error.plate-id");
    ids.add(p.id);
    if (typeof p.name !== "string" || p.name.trim().length < 1 || p.name.length > 40)
      return t("core-rig-multiplane.spec-error.plate-name");
    // Platen må ligge langt nok under kameraet til at linsen kan fokusere (d > f)
    if (!num(p.heightMm, 0, c.cameraHeightMm - c.focalLengthMm - 1))
      return t("core-rig-multiplane.spec-error.plate-height");
    if (p.glassThicknessMm !== null && !num(p.glassThicknessMm, 0.1, 50))
      return t("core-rig-multiplane.spec-error.glass");
  }
  const cal = spec.calibration;
  if (cal !== null) {
    if (!cal || typeof cal !== "object" || !ids.has(cal.referencePlateId))
      return t("core-rig-multiplane.spec-error.calibration");
    if (
      !num(cal.cameraHeightMm, 50, 10000) ||
      !num(cal.focalLengthMm, 1, 2000) ||
      !num(cal.sensorWidthMm, 1, 1000) ||
      !num(cal.sensorHeightMm, 1, 1000) ||
      !num(cal.pxPerMm, 0.01, 1000) ||
      typeof cal.valid !== "boolean" ||
      typeof cal.calibratedAt !== "string"
    )
      return t("core-rig-multiplane.spec-error.calibration");
  }
  return null;
}

/** Er kalibreringen gyldig for kameraverdiene i oppsettet nå (B-090 pkt 5)? */
export function calibrationValid(spec: MultiplaneRigSpec): boolean {
  const cal = spec.calibration;
  if (!cal || !cal.valid) return false;
  const c = spec.camera;
  return (
    cal.cameraHeightMm === c.cameraHeightMm &&
    cal.focalLengthMm === c.focalLengthMm &&
    cal.sensorWidthMm === c.sensorWidthMm &&
    cal.sensorHeightMm === c.sensorHeightMm &&
    spec.plates.some((p) => p.id === cal.referencePlateId)
  );
}

export type CalibrationStatus = "none" | "valid" | "invalid";

export function calibrationStatus(spec: MultiplaneRigSpec): CalibrationStatus {
  if (!spec.calibration) return "none";
  return calibrationValid(spec) ? "valid" : "invalid";
}

/**
 * Merker kalibreringen ugyldig når kameraverdiene den gjelder, er endret (B-090 pkt 5). Brukes når et
 * oppsett lagres: kalibreringen beholdes, men regnes ikke lenger som gyldig.
 */
export function withCalibrationChecked(spec: MultiplaneRigSpec): MultiplaneRigSpec {
  if (!spec.calibration) return spec;
  const still =
    spec.calibration.valid === false || calibrationValid({ ...spec, calibration: { ...spec.calibration, valid: true } });
  if (still && spec.calibration.valid) return spec;
  if (spec.calibration.valid && !still) return { ...spec, calibration: { ...spec.calibration, valid: false } };
  // Verdiene er gjenopprettet: brukeren har stilt kameraet tilbake, og kalibreringen gjelder igjen
  if (!spec.calibration.valid && still) return { ...spec, calibration: { ...spec.calibration, valid: true } };
  return spec;
}

export function plateOf(spec: MultiplaneRigSpec, plateId: string): RigPlate | undefined {
  return spec.plates.find((p) => p.id === plateId);
}

/** Avstanden fra kameraet til platen i mm (alltid > brennvidden når oppsettet er gyldig). */
export function plateDistanceMm(spec: MultiplaneRigSpec, plateId: string): number | null {
  const plate = plateOf(spec, plateId);
  if (!plate) return null;
  return spec.camera.cameraHeightMm - plate.heightMm;
}

/** Forstørrelsen m = f / (d − f). */
export function magnification(focalLengthMm: number, distanceMm: number): number {
  return focalLengthMm / (distanceMm - focalLengthMm);
}

/** Synsfeltet på platen i mm: sensorstørrelsen delt på forstørrelsen. */
export function fieldOfViewMm(sensorMm: number, m: number): number {
  return sensorMm / m;
}

/**
 * Parallaksen ut fra fysisk avstand relativt til referanseplaten (runde 1, pkt 3): plater nærmere
 * kameraet enn referansen beveger seg mer (parallakse over 1), plater lenger unna mindre. Referansen
 * er den første platen (bordplaten) når ikke annet er valgt.
 */
export function plateParallax(spec: MultiplaneRigSpec, plateId: string, referencePlateId?: string): number | null {
  const ref = plateDistanceMm(spec, referencePlateId ?? spec.plates[0]!.id);
  const d = plateDistanceMm(spec, plateId);
  if (ref === null || d === null) return null;
  return ref / d;
}

/** Avviket mellom lagets parallakse og den beregnede for platen (0 = ingen avvik; null = ingen kobling). */
export function parallaxDeviation(spec: MultiplaneRigSpec, layer: CompositionLayer): number | null {
  if (!layer.rigPlateId) return null;
  const computed = plateParallax(spec, layer.rigPlateId);
  if (computed === null) return null;
  return layer.parallax - computed;
}

/** Synlig avviksmerke: lagets parallakse er overstyrt bort fra platenivået. */
export function hasParallaxOverride(spec: MultiplaneRigSpec, layer: CompositionLayer): boolean {
  const dev = parallaxDeviation(spec, layer);
  return dev !== null && Math.abs(dev) > 0.001;
}

export interface PhysicalSize {
  readonly widthMm: number;
  readonly heightMm: number;
}

/**
 * Figurens fysiske størrelse på platen på et gitt frame (B-090 pkt 3): lagets transform og keyframes
 * teller med, og i modusen «fast kamera» bakes den digitale kamerazoomen inn (bare zoom endrer
 * figurstørrelsen – panorering og rotasjon gjør ikke det). I modusen «kameraet beveger seg fysisk»
 * brukes scenens hvileposisjon (zoom 1). En gyldig kalibrering overstyrer teorien.
 */
export function physicalLayerSizeMm(
  spec: MultiplaneRigSpec,
  layer: CompositionLayer,
  composition: Composition,
  frame: number,
): PhysicalSize | null {
  if (!layer.rigPlateId) return null;
  const d = plateDistanceMm(spec, layer.rigPlateId);
  if (d === null) return null;
  const t = transformAt(layer, frame);
  const zoom = spec.camera.mode === "fixed" ? cameraAt(composition, frame).zoom : 1;
  const pxW = Math.abs(layer.width * t.scaleX) * zoom;
  const pxH = Math.abs(layer.height * t.scaleY) * zoom;
  const cal = spec.calibration;
  if (calibrationValid(spec) && cal) {
    // Kalibrert: målte piksler per mm på referanseplaten, skalert med avstandsforholdet
    const dRef = spec.camera.cameraHeightMm - plateOf(spec, cal.referencePlateId)!.heightMm;
    const pxPerMm = cal.pxPerMm * (dRef / d);
    return { widthMm: pxW / pxPerMm, heightMm: pxH / pxPerMm };
  }
  const m = magnification(spec.camera.focalLengthMm, d);
  return {
    widthMm: (pxW / composition.width) * fieldOfViewMm(spec.camera.sensorWidthMm, m),
    heightMm: (pxH / composition.height) * fieldOfViewMm(spec.camera.sensorHeightMm, m),
  };
}

/** Riggen som gjelder i en scene: scenens egen, ellers prosjektets standardrigg (B-090 pkt 4). */
export function resolveSceneRig(state: ProjectState, sceneId: string): RigSetup | null {
  const own = Object.values(state.rigSetups).find((r) => !r.removed && r.sceneId === sceneId);
  if (own) return own;
  return defaultRig(state);
}

/** Prosjektets standardrigg, eller null når prosjektet ikke har noen rigg ennå (oppfører seg som før). */
export function defaultRig(state: ProjectState): RigSetup | null {
  return Object.values(state.rigSetups).find((r) => !r.removed && r.sceneId === null) ?? null;
}

/** Riggen som gjelder for et lag (via komposisjonen og scenevarianten), eller null. */
export function rigForLayer(state: ProjectState, layer: CompositionLayer): RigSetup | null {
  const sceneId = state.variants[state.compositions[layer.compositionId]?.variantId ?? ""]?.sceneId;
  return sceneId ? resolveSceneRig(state, sceneId) : null;
}
