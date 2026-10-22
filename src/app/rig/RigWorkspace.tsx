import { InspectionWindow } from "./InspectionWindow";
import { SceneSelect } from "@/app/shell/SceneSelect";
import { ContourPreview } from "./ContourPreview";
import { CutoutDialog } from "@/app/library/CutoutDialog";
import { layerVersion, type CompositionLayer } from "@/core";
/**
 * Arbeidsflaten «Rigg» (B-087/DEC-0100, runde 1): multiplanriggen i sidesnitt med kamera, objektiv og
 * plater i målestokk, kalibrering med gyldighetsstatus, kameramodus, maler i prosjektet og publisering
 * til gruppens globale bibliotek. 3D-print er en deaktivert plassholder (runde 5). All lagring går
 * gjennom kommandoene (angre/gjør om); publisering er en virkning utenfor prosjektet og kan ikke angres.
 */
import { useEffect, useMemo, useState } from "react";
import { Globe, Printer, Save } from "lucide-react";

import {
  calibrationStatus,
  defaultRig,
  defaultRigSpec,
  fieldOfViewMm,
  magnification,
  multiplaneRigSpecError,
  newId,
  plateDistanceMm,
  plateParallax,
  sceneNumberOf,
  type MultiplaneCameraMode,
  type MultiplaneRigSpec,
  type ProjectState,
  type RigPlate,
  type RigSetup,
} from "@/core";
import { t } from "@/core/i18n/keyed";
import { useLanguage } from "@/app/i18n/language";
import { canEdit, useMembers, useProjectState } from "@/app/project/use-project";
import { useCommands } from "@/app/project/use-commands";
import { getProjectWorkspace, publishGlobalRigTemplate } from "@/adapters/browser/global-library";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatLength, parseLength, useRigUnits, type RigUnit } from "./units";

const fieldLabel = "text-xs text-text-secondary";
const numberInput = "h-8 bg-surface-3";

/** Tallfelt i brukerens enhet. Lagrer mm ved blur/Enter; verdien nullstilles når oppsettet endres utenfra. */
function LengthField({
  id,
  label,
  mm,
  unit,
  disabled,
  onCommit,
}: {
  id: string;
  label: string;
  mm: number;
  unit: RigUnit;
  disabled?: boolean;
  onCommit: (mm: number) => void;
}) {
  const shown = unit === "in" ? (mm / 25.4).toFixed(2) : String(Math.round(mm * 10) / 10);
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className={fieldLabel}>
        {label} ({unit === "in" ? t("app-rig.unit-in") : t("app-rig.unit-mm")})
      </Label>
      <Input
        id={id}
        key={`${id}-${shown}`}
        defaultValue={shown}
        inputMode="decimal"
        disabled={disabled}
        className={numberInput}
        onBlur={(e) => {
          const parsed = parseLength(e.target.value, unit);
          if (parsed !== null && parsed !== mm) onCommit(parsed);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
      />
    </div>
  );
}

/** Sidesnittet: kamera øverst, plater som linjer i målestokk, linsekjegle ned til referanseplaten. */
function RigSideView({ spec, unit }: { spec: MultiplaneRigSpec; unit: RigUnit }) {
  const W = 340;
  const H = 380;
  const pad = 34;
  const cam = spec.camera;
  const scale = (H - pad * 2) / Math.max(cam.cameraHeightMm, 1);
  const y = (heightMm: number) => H - pad - heightMm * scale;
  const ref = spec.plates[0]!;
  const dRef = cam.cameraHeightMm - ref.heightMm;
  const m = magnification(cam.focalLengthMm, dRef);
  const fovW = fieldOfViewMm(cam.sensorWidthMm, m);
  const coneHalf = Math.min((fovW / 2) * scale * 0.6, W / 2 - 20);
  const cx = W / 2 + 20;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full max-w-[360px]"
      role="img"
      data-testid="rig-side-view"
      aria-label={t("app-rig.side-view-aria")}
    >
      {/* bordet */}
      <line x1={16} y1={y(0)} x2={W - 8} y2={y(0)} className="stroke-text-tertiary" strokeWidth={2} />
      {/* kamerahuset */}
      <rect x={cx - 16} y={y(cam.cameraHeightMm) - 18} width={32} height={18} className="fill-surface-3 stroke-text-secondary" />
      {/* objektivet */}
      <rect x={cx - 6} y={y(cam.cameraHeightMm)} width={12} height={Math.max(cam.focalLengthMm * scale * 0.4, 4)} className="fill-surface-2 stroke-text-secondary" />
      {/* linsekjeglen til referanseplaten */}
      <polygon
        points={`${cx},${y(cam.cameraHeightMm)} ${cx - coneHalf},${y(ref.heightMm)} ${cx + coneHalf},${y(ref.heightMm)}`}
        className="fill-accent-brand/10 stroke-accent-brand"
        strokeDasharray="3 3"
      />
      {/* platene */}
      {spec.plates.map((p) => (
        <g key={p.id}>
          <line x1={24} y1={y(p.heightMm)} x2={W - 16} y2={y(p.heightMm)} className="stroke-text-secondary" strokeWidth={p.glassThicknessMm ? Math.max(p.glassThicknessMm * scale, 1.5) : 1.5} />
          <text x={4} y={y(p.heightMm) - 3} className="fill-text-secondary" fontSize={10}>
            {p.name}
          </text>
          <text x={W - 8} y={y(p.heightMm) - 3} textAnchor="end" className="fill-text-tertiary" fontSize={9}>
            {t("app-rig.distance-label", { distance: formatLength(plateDistanceMm(spec, p.id) ?? 0, unit) })}
          </text>
        </g>
      ))}
      {/* kamerahøyden */}
      <text x={4} y={y(cam.cameraHeightMm) - 22} className="fill-text-tertiary" fontSize={9}>
        {formatLength(cam.cameraHeightMm, unit)} · f {formatLength(cam.focalLengthMm, unit)}
      </text>
    </svg>
  );
}

export function RigWorkspace({ projectId, userId }: { projectId: string; userId: string }) {
  useLanguage();
  const query = useProjectState(projectId);
  const members = useMembers(projectId);
  const role = members.data?.find((m) => m.user_id === userId)?.role;
  const editable = canEdit(role);
  const cmds = useCommands(projectId, userId, editable);
  if (query.isLoading) return <p className="p-6 text-[13px] text-text-tertiary">{t("app-rig.loading")}</p>;
  if (query.isError || !query.data)
    return (
      <div role="alert" className="p-6 text-[13px] text-status-danger">
        {t("app-rig.load-error")}
      </div>
    );
  return <Rig state={query.data} projectId={projectId} editable={editable} cmds={cmds} />;
}

function Rig({
  state,
  projectId,
  editable,
  cmds,
}: {
  state: ProjectState;
  projectId: string;
  editable: boolean;
  cmds: ReturnType<typeof useCommands>;
}) {
  const [unit, setUnit] = useRigUnits();
  const [contourLayerId, setContourLayerId] = useState("");
  const [inspectOpen, setInspectOpen] = useState(false);
  const [cutoutOpen, setCutoutOpen] = useState(false);
  const [sceneId, setSceneId] = useState<string>(""); // "" = prosjektets standardrigg
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    void getProjectWorkspace(projectId).then(setWorkspaceId, () => setWorkspaceId(null));
  }, [projectId]);

  // Scenene i hovedproduksjonen, i visningsrekkefølge (scenenummer er visning, aldri identitet)
  const sceneOptions = useMemo(() => {
    const main = Object.values(state.productions).find((p) => p.kind === "main");
    const seen = new Set<string>();
    return Object.values(state.occurrences)
      .filter((o) => o.active && o.productionId === main?.id)
      .sort((a, b) => a.orderKey.localeCompare(b.orderKey))
      .filter((o) => (seen.has(o.sceneId) ? false : (seen.add(o.sceneId), true)))
      .map((o) => ({ sceneId: o.sceneId, number: sceneNumberOf(state, o) ?? "–", occurrence: o }));
  }, [state]);

  const current: RigSetup | null =
    sceneId === ""
      ? defaultRig(state)
      : (Object.values(state.rigSetups).find((r) => !r.removed && r.sceneId === sceneId) ?? null);

  // Redigeringskopi av oppsettet; nullstilles når valget eller den lagrede riggen endres
  const [spec, setSpec] = useState<MultiplaneRigSpec>(() => structuredClone(current?.spec ?? defaultRigSpec()));
  const baseKey = `${sceneId}:${current?.id ?? "new"}:${current?.revision ?? 0}`;
  const [loadedKey, setLoadedKey] = useState(baseKey);
  if (loadedKey !== baseKey) {
    setLoadedKey(baseKey);
    setSpec(structuredClone(current?.spec ?? defaultRigSpec()));
  }

  const templates = useMemo(
    () => Object.values(state.rigTemplates).filter((x) => !x.removed).sort((a, b) => a.name.localeCompare(b.name)),
    [state.rigTemplates],
  );
  const calStatus = calibrationStatus(spec);
  const specError = multiplaneRigSpecError(spec);

  const patch = (next: Partial<MultiplaneRigSpec>) => setSpec((s) => ({ ...s, ...next }));
  const patchCamera = (next: Partial<MultiplaneRigSpec["camera"]>) =>
    setSpec((s) => ({ ...s, camera: { ...s.camera, ...next } }));
  const patchPlate = (id: string, next: Partial<RigPlate>) =>
    setSpec((s) => ({ ...s, plates: s.plates.map((p) => (p.id === id ? { ...p, ...next } : p)) }));

  const plateUsed = (plateId: string) => Object.values(state.layers).some((l) => !l.removed && l.rigPlateId === plateId);

  function save() {
    setError(null);
    setNotice(null);
    const name = current?.name ?? t("app-rig.default-rig");
    if (sceneId === "") {
      const cmd = current
        ? { type: "UpdateRigSetup" as const, setupId: current.id, spec }
        : { type: "AddRigSetup" as const, setupId: newId(), sceneId: null, templateId: null, name, spec };
      setError(cmds.run(cmd, t("app-rig.save-rig-label")));
    } else {
      setError(
        cmds.run(
          {
            type: "ApplySceneRig",
            setupId: newId(),
            defaultSetupId: newId(),
            sceneId,
            name,
            spec,
          },
          t("app-rig.save-rig-label"),
        ),
      );
    }
  }

  function saveAsTemplate() {
    const name = templateName.trim();
    if (!name) return;
    setError(cmds.run({ type: "AddRigTemplate", templateId: newId(), name, spec }, t("app-rig.save-as-template")));
    if (!error) setTemplateName("");
  }

  async function publish(id: string, name: string, templateSpec: MultiplaneRigSpec) {
    if (!workspaceId) return;
    setPublishing(true);
    setNotice(null);
    try {
      await publishGlobalRigTemplate(workspaceId, name, templateSpec, "");
      setNotice(t("app-rig.publish-done"));
    } catch {
      setError(t("app-rig.publish-error"));
    } finally {
      setPublishing(false);
    }
  }

  const contourLayers = Object.values(state.layers).filter(l => !l.removed && l.kind !== "group" && layerVersion(state, l) && state.variants[state.compositions[l.compositionId]?.variantId ?? ""]?.sceneId === (sceneId || sceneOptions[0]?.sceneId));
  const contourLayer = contourLayers.find(l => l.id === contourLayerId) ?? contourLayers[0];
  const contourVersion = contourLayer ? layerVersion(state, contourLayer) : null;
  const contourAsset = contourLayer?.assetId ? state.assets[contourLayer.assetId] : null;

  const inputCls = "h-8 bg-surface-3";
  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto">
      <div className="flex flex-wrap items-center gap-3 border-b border-border bg-surface-1 px-4 py-2">
        <h1 className="text-sm font-semibold text-text-primary">{t("app-shell-project-nav.nav-label.rig")}</h1>
        <Label htmlFor="rig-scene" className={fieldLabel}>
          {t("app-rig.scene-label")}
        </Label>
        <SceneSelect
          id="rig-scene"
          testId="rig-scene"
          ariaLabel={t("app-rig.scene-label")}
          value={sceneId}
          onChange={setSceneId}
          emptyLabel={t("app-rig.default-rig")}
          options={sceneOptions.map((o) => ({ value: o.sceneId, label: t("app-rig.scene-option", { number: o.number }), occurrence: o.occurrence }))}
          className="w-56"
        />
        <span className="ml-auto flex items-center gap-2">
          <Label htmlFor="rig-units" className={fieldLabel}>
            {t("app-rig.units-label")}
          </Label>
          <select
            id="rig-units"
            value={unit}
            onChange={(e) => setUnit(e.target.value === "in" ? "in" : "mm")}
            className="h-8 rounded-sm border border-border bg-surface-3 px-2 text-[13px] text-text-primary"
          >
            <option value="mm">{t("app-rig.unit-mm")}</option>
            <option value="in">{t("app-rig.unit-in")}</option>
          </select>
        </span>
      </div>

      <div className="grid gap-6 p-4 lg:grid-cols-[minmax(300px,380px)_1fr]">
        <section className="space-y-3">
          <RigSideView spec={spec} unit={unit} />
          {/* 3D-print: deaktivert plassholder (runde 5) */}
          <div className="border border-border bg-surface-1 p-3" data-testid="rig-print-placeholder">
            <h2 className="flex items-center gap-2 text-[13px] font-medium text-text-primary">
              <Printer className="size-4" aria-hidden /> {t("app-rig.print-heading")}
            </h2>
            <Button disabled className="mt-2" aria-disabled>
              {t("app-rig.print-coming")}
            </Button>
          </div>
          <section data-testid="rig-contour" className="space-y-3 border border-border bg-surface-1 p-3">
            <h2 className="text-sm font-semibold">{t("app-rig.contour.heading")}</h2>
            <select aria-label={t("app-rig.contour.heading")} value={contourLayer?.id ?? ""} onChange={e => { setContourLayerId(e.target.value); setCutoutOpen(false); }} className="w-full rounded border border-border bg-surface-2 p-1 text-text-primary">
              {contourLayers.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            {contourLayer ? <ContourPreview state={state} layer={contourLayer} spec={spec} /> : <p className="text-xs text-text-secondary">{t("app-rig.contour.failed")}</p>}
            <Button data-testid="inspect-open-rig" disabled={!contourLayer} onClick={() => setInspectOpen(true)}>{t("app-inspect.open")}</Button>
            {inspectOpen && contourLayer && <InspectionWindow state={state} layer={contourLayer} spec={spec} editable={editable} onClose={() => setInspectOpen(false)} onSave={cmds.run} />}
            <Button data-testid="rig-contour-edit" variant="secondary" size="sm" disabled={!editable || !contourVersion || !contourAsset} onClick={() => setCutoutOpen(true)}>{t("app-rig.contour.edit")}</Button>
            {contourAsset && contourVersion && <CutoutDialog open={cutoutOpen} onOpenChange={setCutoutOpen} projectId={projectId} asset={contourAsset} version={contourVersion} cmds={cmds} onSaved={(versionId, variantId) => {
              if (!contourLayer) return;
              cmds.run({ type: "UpdateLayers", layers: [{ layerId: contourLayer.id, fields: { ...contourLayer, versionId, assetVariantId: variantId } as CompositionLayer }] }, t("app-rig.contour.edit"));
            }} />}
          </section>
        </section>

        <section className="space-y-5">
          <fieldset className="grid max-w-xl grid-cols-2 gap-3" disabled={!editable} data-testid="rig-camera">
            <legend className="text-[13px] font-medium text-text-primary">{t("app-rig.camera-heading")}</legend>
            <LengthField id="rig-sensor-w" label={t("app-rig.sensor-width")} mm={spec.camera.sensorWidthMm} unit={unit} onCommit={(v) => patchCamera({ sensorWidthMm: v })} />
            <LengthField id="rig-sensor-h" label={t("app-rig.sensor-height")} mm={spec.camera.sensorHeightMm} unit={unit} onCommit={(v) => patchCamera({ sensorHeightMm: v })} />
            <LengthField id="rig-focal" label={t("app-rig.focal-length")} mm={spec.camera.focalLengthMm} unit={unit} onCommit={(v) => patchCamera({ focalLengthMm: v })} />
            <LengthField id="rig-height" label={t("app-rig.camera-height")} mm={spec.camera.cameraHeightMm} unit={unit} onCommit={(v) => patchCamera({ cameraHeightMm: v })} />
            <div className="space-y-1">
              <Label htmlFor="rig-mode" className={fieldLabel}>
                {t("app-rig.camera-mode")}
              </Label>
              <select
                id="rig-mode"
                value={spec.camera.mode}
                onChange={(e) => patchCamera({ mode: e.target.value as MultiplaneCameraMode })}
                className="h-8 w-full rounded-sm border border-border bg-surface-3 px-2 text-[13px] text-text-primary"
              >
                <option value="fixed">{t("app-rig.mode-fixed")}</option>
                <option value="moving">{t("app-rig.mode-moving")}</option>
              </select>
            </div>
          </fieldset>

          <fieldset className="max-w-xl space-y-2" disabled={!editable} data-testid="rig-plates">
            <legend className="text-[13px] font-medium text-text-primary">{t("app-rig.plates-heading")}</legend>
            {spec.plates.map((p) => (
              <div key={p.id} className="flex flex-wrap items-end gap-2">
                <div className="space-y-1">
                  <Label className={fieldLabel}>{t("app-rig.plate-name")}</Label>
                  <Input
                    key={`pn-${p.id}-${p.name}`}
                    defaultValue={p.name}
                    className={inputCls + " w-32"}
                    onBlur={(e) => {
                      const name = e.target.value.trim();
                      if (name && name !== p.name) patchPlate(p.id, { name });
                    }}
                  />
                </div>
                <LengthField id={`ph-${p.id}`} label={t("app-rig.plate-height")} mm={p.heightMm} unit={unit} onCommit={(v) => patchPlate(p.id, { heightMm: v })} />
                <LengthField id={`pg-${p.id}`} label={t("app-rig.glass-thickness")} mm={p.glassThicknessMm ?? 0} unit={unit} onCommit={(v) => patchPlate(p.id, { glassThicknessMm: v > 0 ? v : null })} />
                <span className="pb-2 text-xs text-text-tertiary">
                  {t("app-rig.field-of-view", {
                    size: formatLength(
                      fieldOfViewMm(spec.camera.sensorWidthMm, magnification(spec.camera.focalLengthMm, plateDistanceMm(spec, p.id) ?? 1)),
                      unit,
                    ),
                  })}{" "}
                  · ×{Math.round((plateParallax(spec, p.id) ?? 1) * 100) / 100}
                </span>
                {spec.plates.length > 1 ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={plateUsed(p.id)}
                    title={plateUsed(p.id) ? t("app-rig.plate-in-use") : t("app-rig.remove-plate")}
                    onClick={() => {
                      if (plateUsed(p.id)) {
                        setError(t("app-rig.plate-in-use"));
                        return;
                      }
                      patch({ plates: spec.plates.filter((x) => x.id !== p.id) });
                    }}
                  >
                    {t("app-rig.remove-plate")}
                  </Button>
                ) : null}
              </div>
            ))}
            <Button
              variant="secondary"
              size="sm"
              disabled={spec.plates.length >= 12}
              onClick={() =>
                patch({
                  plates: [
                    ...spec.plates,
                    {
                      id: newId(),
                      name: t("app-rig.new-plate-name", { number: spec.plates.length + 1 }),
                      heightMm: Math.min((spec.plates[spec.plates.length - 1]?.heightMm ?? 0) + 100, spec.camera.cameraHeightMm - spec.camera.focalLengthMm - 1),
                      glassThicknessMm: 4,
                    },
                  ],
                })
              }
            >
              {t("app-rig.add-plate")}
            </Button>
          </fieldset>

          <fieldset className="max-w-xl space-y-2" disabled={!editable} data-testid="rig-calibration">
            <legend className="text-[13px] font-medium text-text-primary">{t("app-rig.calibration-heading")}</legend>
            <p className="text-xs text-text-secondary" role="status" data-testid="rig-calibration-status">
              {calStatus === "none"
                ? t("app-rig.calibration-none")
                : calStatus === "valid"
                  ? t("app-rig.calibration-valid", { date: spec.calibration?.calibratedAt.slice(0, 10) ?? "" })
                  : t("app-rig.calibration-invalid")}
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <Label htmlFor="rig-cal-px" className={fieldLabel}>
                  {t("app-rig.calibration-px-per-mm")}
                </Label>
                <Input id="rig-cal-px" key={`cal-${spec.calibration?.pxPerMm ?? ""}`} defaultValue={spec.calibration?.pxPerMm ?? ""} inputMode="decimal" className={inputCls + " w-28"} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="rig-cal-plate" className={fieldLabel}>
                  {t("app-rig.calibration-reference-plate")}
                </Label>
                <select
                  id="rig-cal-plate"
                  defaultValue={spec.calibration?.referencePlateId ?? spec.plates[0]?.id}
                  className="h-8 rounded-sm border border-border bg-surface-3 px-2 text-[13px] text-text-primary"
                >
                  {spec.plates.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  const px = Number((document.getElementById("rig-cal-px") as HTMLInputElement | null)?.value.replace(",", "."));
                  const plate = (document.getElementById("rig-cal-plate") as HTMLSelectElement | null)?.value;
                  if (!Number.isFinite(px) || px <= 0 || !plate) return;
                  patch({
                    calibration: {
                      cameraHeightMm: spec.camera.cameraHeightMm,
                      focalLengthMm: spec.camera.focalLengthMm,
                      sensorWidthMm: spec.camera.sensorWidthMm,
                      sensorHeightMm: spec.camera.sensorHeightMm,
                      referencePlateId: plate,
                      pxPerMm: px,
                      calibratedAt: new Date().toISOString(),
                      valid: true,
                    },
                  });
                }}
              >
                {t("app-rig.calibrate-button")}
              </Button>
            </div>
          </fieldset>

          <fieldset className="max-w-xl space-y-2" disabled={!editable} data-testid="rig-templates">
            <legend className="text-[13px] font-medium text-text-primary">{t("app-rig.templates-heading")}</legend>
            {templates.length === 0 ? <p className="text-xs text-text-tertiary">{t("app-rig.no-templates")}</p> : null}
            {templates.map((tmpl) => (
              <div key={tmpl.id} className="flex flex-wrap items-center gap-2">
                <span className="min-w-32 text-[13px] text-text-primary">{tmpl.name}</span>
                <Button variant="ghost" size="sm" onClick={() => setSpec(structuredClone(tmpl.spec))}>
                  {t("app-rig.apply-template")}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setError(cmds.run({ type: "UpdateRigTemplate", templateId: tmpl.id, spec }, t("app-rig.update-template")))}
                >
                  {t("app-rig.update-template")}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!workspaceId || publishing}
                  onClick={() => void publish(tmpl.id, tmpl.name, tmpl.spec)}
                >
                  <Globe className="size-3.5" aria-hidden /> {t("app-rig.publish-global")}
                </Button>
              </div>
            ))}
            <div className="flex items-center gap-2 pt-1">
              <Input
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder={t("app-rig.template-name-placeholder")}
                className={inputCls + " w-48"}
              />
              <Button variant="secondary" size="sm" disabled={!templateName.trim()} onClick={saveAsTemplate}>
                {t("app-rig.save-as-template")}
              </Button>
            </div>
          </fieldset>

          {specError ? (
            <p role="alert" className="text-xs text-status-danger">
              {specError}
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="text-xs text-status-danger">
              {error}
            </p>
          ) : null}
          {notice ? (
            <p role="status" className="text-xs text-status-success">
              {notice}
            </p>
          ) : null}
          <div>
            <Button disabled={!editable || specError !== null} onClick={save}>
              <Save className="size-4" aria-hidden /> {t("app-rig.save-rig")}
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
