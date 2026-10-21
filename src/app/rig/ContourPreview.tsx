import { useEffect, useMemo, useState } from 'react';
import { layerVersion, physicalLayerSizeMm, type ProjectState, type CompositionLayer, type MultiplaneRigSpec } from '@/core';
import type { ContourResult } from '@/core/print/contour';
import { t } from '@/core/i18n/keyed';
import { useLanguage } from '@/app/i18n/language';
import { useImageUrls } from '@/app/library/asset-images';
import { ContourClient } from './contour-client';
import { formatLength, useRigUnits } from './units';
import type { ContourSource } from '@/core/print/contour';

/** Eksplisitte nøkkelunioner (i18n-kontrollen tillater ikke dynamiske nøkler). */
const SOURCE_KEY: Record<ContourSource, string> = {
  mask: 'app-rig.contour.source-mask',
  alpha: 'app-rig.contour.source-alpha',
  suggestion: 'app-rig.contour.source-suggestion',
  rectangle: 'app-rig.contour.source-rectangle',
  none: 'app-rig.contour.source-none',
};
const MODE_KEY = {
  full: 'app-rig.contour.mode-full',
  line: 'app-rig.contour.mode-line',
  outline: 'app-rig.contour.mode-outline',
} as const;

export function ContourPreview({ state, layer, spec, frame = 0, compact = false }: {
  state: ProjectState; layer: CompositionLayer; spec: MultiplaneRigSpec; frame?: number; compact?: boolean;
}) {
  useLanguage();
  const [unit] = useRigUnits();
  const [mode, setMode] = useState('line');
  const [suggestionEnabled, setSuggestion] = useState(true);
  const [cutHoles, setHoles] = useState(true);
  const [strokeWidthMm, setStroke] = useState(.1);
  const [result, setResult] = useState<ContourResult | null>(null);
  const [failed, setFailed] = useState(false);
  const client = useMemo(() => new ContourClient(), []);
  const version = layerVersion(state, layer, frame);
  const images = useImageUrls(version ? [version.mediaPath] : []);
  const url = version && images.data?.[version.mediaPath];
  const composition = state.compositions[layer.compositionId];
  const size = composition && physicalLayerSizeMm(spec, layer, composition, frame);
  const signature = JSON.stringify({ layer, layers: Object.values(state.layers).filter(l => l.compositionId === layer.compositionId), frame, suggestionEnabled, cutHoles, strokeWidthMm, size, version: version?.id });
  useEffect(() => {
    let active = true;
    const abort = new AbortController();
    setResult(null); setFailed(false);
    if (!url || !size || !version) {
      setFailed(!version || images.isError || (!images.isLoading && !url) || !size);
      return () => { active = false; client.cancel(); };
    }
    void (async () => {
      const response = await fetch(url, { signal: abort.signal });
      if (!response.ok) throw new Error('Image failed');
      const bitmap = await createImageBitmap(await response.blob());
      let rgba: ArrayBuffer;
      const { width, height } = bitmap;
      try {
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) throw new Error('Canvas unavailable');
        ctx.drawImage(bitmap, 0, 0);
        rgba = ctx.getImageData(0, 0, width, height).data.buffer as ArrayBuffer;
      } finally { bitmap.close(); }
      if (!active) return;
      const next = await client.compute(signature, { rgba, width, height, layer, frame,
        layers: Object.values(state.layers).filter(l => l.compositionId === layer.compositionId).map(layer => ({ layer })),
        suggestionEnabled, cutHoles, strokeWidthMm, mmPerPixel: size.widthMm / width });
      if (active) setResult(next);
    })().catch(() => { if (active) setFailed(true); });
    return () => { active = false; abort.abort(); client.cancel(); };
  }, [url, signature, images.isError, images.isLoading, client]);
  const points = result?.paths.flatMap(p => p.points) ?? [];
  const minX = points.length ? Math.min(...points.map(p => p.x)) : 0;
  const minY = points.length ? Math.min(...points.map(p => p.y)) : 0;
  const padding = Math.max(strokeWidthMm, .5);
  const d = result?.paths.map(p => p.points.map((q, i) => `${i ? 'L' : 'M'}${q.x},${q.y}`).join(' ') + ' Z').join(' ');
  return <div data-testid="rig-contour-preview" className="space-y-2 text-xs text-text-primary">
    <p data-testid="rig-contour-source" className="text-text-secondary">{result ? t(SOURCE_KEY[result.source]) : t(failed ? 'app-rig.contour.failed' : 'app-rig.contour.computing')}</p>
    {result && <><svg role="img" aria-label={t('app-rig.contour.preview-aria')} className={compact ? 'h-28 w-full' : 'h-56 w-full'} viewBox={`${minX-padding} ${minY-padding} ${Math.max(result.widthMm, 1)+2*padding} ${Math.max(result.heightMm, 1)+2*padding}`}>
      <path d={d} fillRule="evenodd" className={`${mode === 'outline' ? 'fill-none' : 'fill-text-tertiary'} ${mode === 'full' ? 'stroke-none' : 'stroke-text-secondary'}`} strokeWidth={strokeWidthMm} />
    </svg><p data-testid="rig-contour-size">{formatLength(result.widthMm, unit)} × {formatLength(result.heightMm, unit)}</p></>}
    <select data-testid="rig-contour-mode" aria-label={t('app-rig.contour.preview-aria')} value={mode} onChange={e => setMode(e.target.value)} className="rounded border border-border bg-surface-2 p-1">
      {(['full', 'line', 'outline'] as const).map(m => <option key={m} value={m}>{t(MODE_KEY[m])}</option>)}
    </select>
    <label className="flex items-center gap-2"><input data-testid="rig-contour-suggestion" type="checkbox" checked={suggestionEnabled} onChange={e => setSuggestion(e.target.checked)} />{t('app-rig.contour.suggestion-toggle')}</label>
    <label className="flex items-center gap-2"><input data-testid="rig-contour-holes" type="checkbox" checked={cutHoles} onChange={e => setHoles(e.target.checked)} />{t('app-rig.contour.cut-holes')}</label>
    <label className="flex items-center gap-2">{t('app-rig.contour.stroke-width')}<input data-testid="rig-contour-stroke" type="number" min={.05} max={.3} step={.01} value={strokeWidthMm} onChange={e => { const n = Number(e.target.value); if (Number.isFinite(n)) setStroke(Math.max(.05, Math.min(.3, n))); }} className="w-20 rounded border border-border bg-surface-2 p-1" /></label>
  </div>;
}
