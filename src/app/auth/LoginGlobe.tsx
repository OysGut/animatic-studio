/**
 * B-117: wireframe-globus som bakgrunn på innloggingssiden. Fullskjerms canvas bak innloggingen;
 * bare øvre venstre kvadrant av globusen synes. Kystlinjer (Natural Earth 50m, offentlig eiendom) og
 * punktene lastes først her, så resten av appen påvirkes ikke.
 */
import { useEffect, useRef } from "react";
import {
  dotStyle,
  dragBy,
  edgeFade,
  globeLayout,
  initialView,
  pointSeed,
  project,
  pulseLevel,
  pulseParams,
  pulsePhase,
  release,
  stepView,
  type PulseParams,
} from "@/core/globe";
import { fetchGlobePoints } from "@/adapters/browser/account";

interface Dot {
  readonly lat: number;
  readonly lon: number;
  readonly active: boolean;
  readonly pulse: PulseParams;
}

// i18n-ignore-file: bare farger og tegning, ingen tekst
const RIM = "rgba(160,170,190,0.07)";
const GRID = "rgba(160,170,190,0.08)";
const COAST = "rgba(190,198,214,0.13)";

export function LoginGlobe() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let land: number[][] = [];
    let scale = 10;
    let dots: Dot[] = [];
    let alive = true;
    let raf = 0;
    let dirty = true;
    const view = initialView(performance.now());
    const t0 = performance.now();
    let last = t0;
    let W = 0, H = 0;

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      dirty = true;
    };
    resize();
    window.addEventListener("resize", resize);

    void import("./globe-land.json").then((m) => {
      if (!alive) return;
      const d = m.default as unknown as { scale: number; rings: number[][] };
      scale = d.scale;
      land = d.rings;
      dirty = true;
    });
    void fetchGlobePoints().then((pts) => {
      if (!alive) return;
      dots = pts.map((p, i) => ({ ...p, pulse: pulseParams(pointSeed(p.lat, p.lon, i), p.active) }));
      dirty = true;
    });

    const path = (pts: Iterable<[number, number]>) => {
      const l = globeLayout(W, H);
      let open = false;
      ctx.beginPath();
      for (const [lat, lon] of pts) {
        const p = project(lat, lon, view.yaw, view.pitch);
        if (p.z <= 0) { open = false; continue; }
        const sx = l.CX + l.R * p.x, sy = l.CY - l.R * p.y;
        if (open) ctx.lineTo(sx, sy);
        else ctx.moveTo(sx, sy);
        open = true;
      }
      ctx.stroke();
    };

    function* parallel(lat: number): Generator<[number, number]> { for (let lon = -180; lon <= 180; lon += 3) yield [lat, lon]; }
    function* meridian(lon: number): Generator<[number, number]> { for (let lat = -90; lat <= 90; lat += 3) yield [lat, lon]; }
    function* ring(r: number[]): Generator<[number, number]> { for (let i = 0; i + 1 < r.length; i += 2) yield [r[i + 1]! / scale, r[i]! / scale]; }

    const draw = (t: number) => {
      const l = globeLayout(W, H);
      ctx.globalCompositeOperation = "source-over";
      ctx.clearRect(0, 0, W, H);
      ctx.lineWidth = 1;
      ctx.strokeStyle = RIM;
      ctx.beginPath();
      ctx.arc(l.CX, l.CY, l.R, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.strokeStyle = GRID;
      for (let lat = -75; lat <= 75; lat += 15) path(parallel(lat));
      for (let lon = -180; lon < 180; lon += 15) path(meridian(lon));
      ctx.strokeStyle = COAST;
      for (const r of land) path(ring(r));
      ctx.globalCompositeOperation = "lighter";
      for (const d of dots) {
        const p = project(d.lat, d.lon, view.yaw, view.pitch);
        if (p.z <= 0) continue;
        const sx = l.CX + l.R * p.x, sy = l.CY - l.R * p.y;
        if (sx < -30 || sy < -30 || sx > W + 30 || sy > H + 30) continue;
        const k = reduced ? 0.5 : pulseLevel(pulsePhase(t, d.pulse));
        const s = dotStyle(d.active, k, edgeFade(p.z));
        const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, s.glowRadius);
        g.addColorStop(0, `rgba(255,138,61,${s.glowAlpha})`);
        g.addColorStop(1, "rgba(255,138,61,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(sx, sy, s.glowRadius, 0, 2 * Math.PI);
        ctx.fill();
        ctx.fillStyle = `rgba(255,196,150,${s.coreAlpha})`;
        ctx.beginPath();
        ctx.arc(sx, sy, s.coreRadius, 0, 2 * Math.PI);
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
    };

    const frame = (now: number) => {
      raf = 0;
      if (!alive || document.hidden) return;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const before = view.yaw + view.pitch * 7;
      stepView(view, now, dt, !reduced);
      const moving = Math.abs(view.yaw + view.pitch * 7 - before) > 1e-7 || view.dragging;
      if (!reduced || moving || dirty) {
        draw((now - t0) / 1000);
        dirty = false;
      }
      raf = requestAnimationFrame(frame);
    };
    const start = () => { if (!raf && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(frame); } };
    const onVis = () => { if (document.hidden) { cancelAnimationFrame(raf); raf = 0; } else start(); };
    document.addEventListener("visibilitychange", onVis);
    start();

    let px = 0, py = 0, lastMove = 0;
    const down = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      view.dragging = true;
      view.vYaw = 0; view.vPitch = 0;
      px = e.clientX; py = e.clientY; lastMove = performance.now();
      view.lastTouch = lastMove;
      canvas.style.cursor = "grabbing";
    };
    const move = (e: PointerEvent) => {
      if (!view.dragging) return;
      const now = performance.now();
      dragBy(view, e.clientX - px, e.clientY - py, globeLayout(W, H).R, now);
      px = e.clientX; py = e.clientY; lastMove = now;
    };
    const up = (e: PointerEvent) => {
      if (!view.dragging) return;
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      release(view, lastMove, performance.now());
      canvas.style.cursor = "grab";
    };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVis);
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden
      data-testid="login-globe"
      className="fixed inset-0 -z-10 h-full w-full"
      style={{ touchAction: "none", cursor: "grab" }}
    />
  );
}

