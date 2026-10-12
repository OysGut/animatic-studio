/**
 * AI-video for scenen (DEC-0069, REQ-0180, REQ-0243–0267): velg leverandør og modell blant dem prosjektets
 * eiere har koblet til, startbilde og format; generer ett eller alle segmentene (med bekreftelse og
 * anslått kostnad). Videoene lages hos leverandøren, følges opp og legges inn som nye versjoner av scenen
 * mens dialogen er åpen (ellers fra AI-jobbene på prosjektoversikten). «Sett sammen scenen» lager scenen av
 * de ferdige segmentene etter hverandre – 2D-scenen endres aldri, og alt kan angres.
 */
import { CheckCircle2, Clapperboard, Loader2, TriangleAlert } from "lucide-react";
import { AiGlyph } from "@/app/design/icons/AiGlyph";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  adaptPromptForModel,
  assembleSegments,
  assemblyUsesChosen,
  chainStartPath,
  costBreakdown,
  estimateCostUsd,
  type FilmClip,
  formatUsd,
  latestVideoFor,
  newId,
  type ProductionSegment,
  type ProjectState,
  providerModel,
  providersFor,
  type SegmentPlan,
  videoAttempts,
  videoDurationFor,
  videoStartImages,
} from "@/core";
import { startVideoGeneration } from "@/adapters/ai/video.functions";
import type { Commands } from "@/app/project/use-commands";
import { aiJobsKey, useAiJobs } from "@/app/ai/use-ai-jobs";
import { useProjectProviders } from "@/app/ai/use-project-providers";
import { EffortPicker } from "@/app/ai/EffortPicker";
import { useImageUrls } from "@/app/library/asset-images";
import { useSchemaAtLeast } from "@/app/shell/use-schema";
import { CompareTakesDialog } from "./CompareTakesDialog";
import { SentPrompts } from "@/app/ai/SentPrompts";
import { claimVideo } from "@/app/ai/video-jobs";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { CostLines } from "@/app/ai/CostLines";

const ctl =
  "h-7 min-w-0 rounded-sm border border-border-control bg-surface-3 px-1.5 text-xs text-text-primary disabled:opacity-50";

export function SceneVideoSection({
  state,
  productionId,
  clip,
  plan,
  stored,
  prompts,
  editable,
  cmds,
}: {
  state: ProjectState;
  productionId: string;
  clip: FilmClip;
  plan: readonly SegmentPlan[];
  /** Lagrede segmenter (samme rekkefølge som planen); tom = inndelingen er ikke lagret. */
  stored: readonly ProductionSegment[];
  /** Beskrivelsen som sendes for hvert segment. */
  prompts: readonly string[];
  editable: boolean;
  cmds: Commands;
}) {
  const projectId = state.project.id;
  const qc = useQueryClient();
  const available = useProjectProviders(projectId, editable);
  const options = providersFor("video", new Set(available.data?.providers ?? []));
  const [pick, setPick] = useState("");
  const flat = options.flatMap((o) => o.models.map((m) => ({ provider: o.provider, model: m })));
  const chosen = flat.find((x) => `${x.provider.id}|${x.model.id}` === pick) ?? flat[0] ?? null;
  const [aspect, setAspect] = useState<"16:9" | "9:16">(
    state.project.frameWidth >= state.project.frameHeight ? "16:9" : "9:16",
  );
  const starts = useMemo(
    () => videoStartImages(state, productionId, clip.occurrenceId),
    [state, productionId, clip.occurrenceId],
  );
  const [startId, setStartId] = useState<string>("");
  // Sammenheng (REQ-0263): hvert segment starter fra siste bilde i videoen til segmentet før
  const [chain, setChain] = useState(false);
  const chainPaths = useMemo(
    () =>
      chain
        ? stored
            .map((_, i) =>
              chainStartPath(
                state,
                clip.occurrenceId,
                stored.map((g) => g.id),
                i,
              ),
            )
            .filter((p): p is string => !!p)
        : [],
    [chain, stored, state, clip.occurrenceId],
  );
  const chainUrls = useImageUrls(chainPaths);
  // Kandidater (mandat 19.7): flere videoer per segment å velge mellom
  const [candidates, setCandidates] = useState(1);
  // Myk overgang (0,5 s) mellom segmentene når scenen settes sammen (DEC-0071)
  const [softChoice, setSoft] = useState(true);
  // Myke overganger krever migrasjon 0026; på eldre databaser settes scenen sammen med rene kutt
  const canSoft = useSchemaAtLeast(26);
  const soft = softChoice && canSoft;
  const [compare, setCompare] = useState<{ segmentId: string; title: string } | null>(null);
  const start =
    starts.find((v) => v.id === startId) ?? (startId === "none" ? null : (starts[0] ?? null));
  const needsStart = !!chosen?.model.requiresImage;
  const jobs = useAiJobs(projectId, editable);
  const list = useMemo(() => jobs.data?.jobs ?? [], [jobs.data]);
  // Oppfølging av jobbene skjer for hele prosjektet (AiJobsWatcher i prosjektets ramme)
  const sceneJobs = list.filter((j) => j.kind === "video" && j.occurrenceId === clip.occurrenceId);
  const [confirm, setConfirm] = useState<number[] | null>(null);
  const [busy, setBusy] = useState(false);
  // Hindrer dobbeltklikk før «busy» rekker å vises
  const inFlight = useRef(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  // Ferdige videoer for scenen legges inn som versjon mens dialogen er åpen
  const claimed = useRef(new Set<string>());
  useEffect(() => {
    if (!editable) return;
    const stored = new Set(Object.values(state.takes).map((t) => t.mediaRef));
    for (const j of sceneJobs) {
      if (
        j.status !== "done" ||
        !j.resultPath ||
        stored.has(j.resultPath) ||
        claimed.current.has(j.id)
      )
        continue;
      claimed.current.add(j.id);
      void claimVideo(state, cmds, j).then((e) => {
        if (e) setMsg({ kind: "error", text: e });
      });
    }
  }, [sceneJobs, state, cmds, editable]);

  const seconds = (i: number) => {
    const seg = plan[i];
    if (!seg || !chosen) return 0;
    return videoDurationFor((seg.endMs - seg.startMs) / 1000, chosen.model.durations ?? []);
  };
  const cost = (idx: readonly number[]) =>
    chosen
      ? candidates *
        idx.reduce(
          (t, i) =>
            t +
            (estimateCostUsd(chosen.provider.id, chosen.model.id, { seconds: seconds(i) }) ?? 0),
          0,
        )
      : 0;

  // Segmenter som allerede har en video under arbeid hoppes over (ingen dobbel betaling)
  const runningSeg = new Set(
    sceneJobs
      .filter((j) => j.status === "running" || j.status === "queued")
      .map((j) => j.segmentId),
  );
  const notRunning = (idx: readonly number[]) =>
    idx.filter((i) => stored[i] && !runningSeg.has(stored[i]!.id));

  /** Startbildet for segmentet: siste bilde fra forrige segment ved sammenheng, ellers det valgte. */
  const startFor = (i: number): string | null => {
    if (chain && i > 0) {
      const p = chainStartPath(
        state,
        clip.occurrenceId,
        stored.map((g) => g.id),
        i,
      );
      // Bare når bildet faktisk ble lagret
      return p && chainUrls.data?.[p] ? p : null;
    }
    return start ? start.mediaPath : null;
  };
  /** Kan segmentet lages nå? (Ved sammenheng må segmentet før ha video først.) */
  /** Segmentet før er under arbeid (i kø eller hos leverandøren): køen venter på det (DEC-0071). */
  const prevActive = (i: number) => i > 0 && !!stored[i - 1] && runningSeg.has(stored[i - 1]!.id);
  /** Venter på segmentet før: legges i kø og får siste bilde derfra når det er klart. */
  const waitsForPrev = (i: number, picked: readonly number[] = []) =>
    chain && i > 0 && !startFor(i) && (prevActive(i) || picked.includes(i - 1));
  /** Kan segmentet lages nå (direkte, eller i kø etter segmentet før ved sammenheng)? */
  const canStart = (i: number, picked: readonly number[] = []) =>
    waitsForPrev(i, picked) || (!(chain && i > 0 && !startFor(i)) && !(needsStart && !startFor(i)));

  /** Beskrivelsen slik den sendes til modellen (tilpasset lengde og muligheter, DEC-0070). */
  const sent = (i: number) =>
    chosen
      ? adaptPromptForModel(prompts[i] ?? "", chosen.model)
      : { text: prompts[i] ?? "", notes: [] as string[], originalLength: 0 };

  /** Segmentene «Generer alle» tar med: ved sammenheng også de som kan vente på segmentet før. */
  function chainPick(): number[] {
    const out: number[] = [];
    for (const i of notRunning(stored.map((_, k) => k))) if (canStart(i, out)) out.push(i);
    return out;
  }

  async function generate(all: readonly number[]) {
    if (!chosen || inFlight.current) return;
    const idx = notRunning(all);
    if (!idx.length) return;
    inFlight.current = true;
    setConfirm(null);
    setBusy(true);
    setMsg(null);
    const errors: string[] = [];
    let started = 0;
    for (const i of [...idx].sort((a, b) => a - b)) {
      const seg = stored[i];
      if (!seg) continue;
      const waits = waitsForPrev(i, idx);
      if (sent(i).blocked) {
        errors.push(`Segment ${i + 1}: replikkene er for lange for modellen – del segmentet`);
        continue;
      }
      try {
        for (let c = 0; c < candidates; c++) {
          const r = await startVideoGeneration({
            data: {
              projectId,
              occurrenceId: clip.occurrenceId,
              segmentId: seg.id,
              prompt: sent(i).text,
              provider: chosen.provider.id,
              model: chosen.model.id,
              seconds: seconds(i),
              aspect,
              startImagePath: waits ? null : startFor(i),
              candidates,
              approved: true,
              // Sammenheng i køen: venter på siste bilde fra segmentet før (DEC-0071)
              ...(waits ? { queue: true, chainAfter: stored[i - 1]!.id } : {}),
            },
          });
          if (r.ok) started++;
          else errors.push(`Segment ${i + 1}: ${r.message}`);
        }
      } catch (e) {
        errors.push(`Segment ${i + 1}: ${(e as Error).message}`);
      }
    }
    setBusy(false);
    inFlight.current = false;
    void qc.invalidateQueries({ queryKey: aiJobsKey(projectId) });
    setMsg(
      errors.length
        ? { kind: "error", text: errors.join(" · ") }
        : {
            kind: "ok",
            text: `${started} ${started === 1 ? "video er" : "videoer er"} startet hos ${chosen.provider.name}. De legges inn som nye versjoner når de er ferdige (vanligvis 1–6 minutter) – også om du lukker dialogen.`,
          },
    );
  }

  const ready = stored.length === plan.length && stored.length > 0;
  const segmentsWithVideo = stored.filter((g) => latestVideoFor(state, clip.occurrenceId, g.id));
  function assemble(fill: boolean) {
    const r = assembleSegments(
      state,
      clip.occurrenceId,
      stored.map((g, i) => ({ segmentId: g.id, startMs: plan[i]!.startMs, endMs: plan[i]!.endMs })),
      () => newId<"clip_part">(),
      { fill },
    );
    if (!r) {
      setMsg({
        kind: "error",
        text: fill
          ? "Scenen har ingen 2D-animatic å fylle med. Lag videoer for alle segmentene først."
          : "Alle segmentene må ha en ferdig video først.",
      });
      return;
    }
    // Myk overgang mellom segmentene (DEC-0071): bare der to videoer møtes
    const parts = r.parts.map((p, i) =>
      soft && i > 0 && p.source === "take" && r.parts[i - 1]!.source === "take"
        ? {
            ...p,
            transitionMs: Math.min(
              500,
              p.outMs - p.inMs,
              r.parts[i - 1]!.outMs - r.parts[i - 1]!.inMs,
            ),
          }
        : p,
    );
    const e = cmds.run(
      {
        type: "SetSceneEdit",
        occurrenceId: clip.occurrenceId as never,
        activeTakeId: null,
        parts,
      },
      fill ? "Sett sammen scenen av AI-video og 2D-animatic" : "Sett sammen scenen av AI-videoene",
    );
    const extra = [
      r.filledSegments ? `${r.filledSegments} segment(er) bruker 2D-animaticen` : "",
      r.paddedSegments ? `${r.paddedSegments} video(er) var kortere og ble fylt ut med 2D` : "",
    ].filter(Boolean);
    setMsg(
      e
        ? { kind: "error", text: e }
        : {
            kind: "ok",
            text: `Scenen er satt sammen${extra.length ? ` (${extra.join("; ")})` : ""}. Angre for å gå tilbake.`,
          },
    );
  }
  const outdatedAssembly = !assemblyUsesChosen(
    state,
    clip.occurrenceId,
    stored.map((g) => g.id),
  );

  if (!editable) return null;
  if (available.isLoading) return null;
  if (!flat.length)
    return (
      <p className="text-xs text-text-tertiary">
        Ingen videoleverandør er koblet til. Prosjektets eier kan koble til en under
        «AI-leverandører» på prosjektlisten (f.eks. Google Veo, Runway, OpenAI Sora eller
        fal.ai/Kling).
      </p>
    );

  return (
    <section
      aria-labelledby="video-title"
      className="flex flex-col gap-2 rounded-sm border border-border bg-surface-1 p-3"
    >
      <h3 id="video-title" className="flex items-center gap-1.5 text-[13px] font-medium">
        <Clapperboard className="size-4" aria-hidden /> Lag video med AI
      </h3>
      <EffortPicker
        capability="video"
        connected={new Set(available.data?.providers ?? [])}
        chosen={chosen}
        disabled={!!busy}
        onChoose={(c) => {
          setPick(`${c.provider.id}|${c.model.id}`);
        }}
      />
      <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
        <select
          aria-label="Videomodell"
          value={chosen ? `${chosen.provider.id}|${chosen.model.id}` : ""}
          onChange={(e) => setPick(e.target.value)}
          className={ctl}
          disabled={busy}
        >
          {flat.map((x) => (
            <option key={`${x.provider.id}|${x.model.id}`} value={`${x.provider.id}|${x.model.id}`}>
              {x.provider.name} – {x.model.label} (~{formatUsd(x.model.priceUsd)}/s)
            </option>
          ))}
        </select>
        <select
          aria-label="Format"
          value={aspect}
          onChange={(e) => setAspect(e.target.value as "16:9" | "9:16")}
          className={ctl}
          disabled={busy}
        >
          <option value="16:9">16:9 liggende</option>
          <option value="9:16">9:16 stående</option>
        </select>
        <select
          aria-label="Startbilde"
          value={start ? start.id : "none"}
          onChange={(e) => setStartId(e.target.value)}
          className={ctl + " max-w-64"}
          disabled={busy}
        >
          {needsStart ? null : <option value="none">Uten startbilde</option>}
          {starts.map((v) => {
            const va = state.assetVariants[v.variantId];
            const a = va ? state.assets[va.assetId] : undefined;
            return (
              <option key={v.id} value={v.id}>
                Startbilde: {a?.name ?? "bilde"} – {va?.name ?? ""} v{v.number}
              </option>
            );
          })}
        </select>
      </div>
      <label className="flex items-center gap-1.5 text-xs text-text-secondary">
        Kandidater per segment
        <select
          aria-label="Kandidater per segment"
          value={candidates}
          onChange={(e) => setCandidates(Number(e.target.value))}
          className={ctl}
          disabled={busy}
        >
          {[1, 2, 3, 4].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <span className="text-text-tertiary">
          {candidates > 1
            ? `– ${candidates} videoer per segment (koster ${candidates} ganger så mye); sammenlign og velg etterpå`
            : ""}
        </span>
      </label>
      {stored.length > 1 ? (
        <label className="flex items-center gap-1.5 text-xs text-text-secondary">
          <input
            type="checkbox"
            checked={chain}
            onChange={(e) => setChain(e.target.checked)}
            disabled={busy}
          />
          Sammenheng: start hvert segment fra siste bilde i videoen til segmentet før (de neste
          venter i køen til videoen før er ferdig og lagt inn)
        </label>
      ) : null}
      {needsStart && !start ? (
        <p className="flex items-center gap-1 text-xs text-status-uncertain">
          <TriangleAlert className="size-3.5" aria-hidden /> Denne modellen trenger et startbilde,
          og scenen har ingen bilder ennå.
        </p>
      ) : null}
      {!ready ? (
        <p className="text-xs text-text-tertiary">
          Lagre inndelingen først (over), så kan segmentene genereres.
        </p>
      ) : (
        <ol className="flex flex-col gap-1">
          {stored.map((g, i) => {
            const job = sceneJobs.find(
              (j) => j.segmentId === g.id && (j.status === "running" || j.status === "queued"),
            );
            const failed = sceneJobs.find((j) => j.segmentId === g.id && j.status === "failed");
            const has = latestVideoFor(state, clip.occurrenceId, g.id);
            return (
              <li
                key={g.id}
                className="flex flex-wrap items-center gap-2 text-xs text-text-secondary"
              >
                <span className="w-24 text-text-primary">Segment {i + 1}</span>
                <span className="tabular w-16">{seconds(i)} s</span>
                {job ? (
                  <span className="flex items-center gap-1">
                    <Loader2 className="size-3.5 animate-spin" aria-hidden />{" "}
                    {job.status === "queued" ? "I kø" : `Lages hos ${job.provider} …`}
                  </span>
                ) : has ? (
                  <span className="flex items-center gap-1 text-status-success">
                    <CheckCircle2 className="size-3.5" aria-hidden /> Video ferdig
                  </span>
                ) : failed ? (
                  <span className="line-clamp-1 text-status-danger" title={failed.error ?? ""}>
                    Feilet: {failed.error ?? "ukjent"}
                  </span>
                ) : (
                  <span className="text-text-tertiary">Ingen video</span>
                )}
                {videoAttempts(state, clip.occurrenceId, g.id).length > 0 ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setCompare({ segmentId: g.id, title: `segment ${i + 1}` })}
                  >
                    {videoAttempts(state, clip.occurrenceId, g.id).length > 1
                      ? "Sammenlign"
                      : "Kontroller"}{" "}
                    ({videoAttempts(state, clip.occurrenceId, g.id).length})
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto"
                  disabled={busy || !!job || !canStart(i)}
                  title={
                    !canStart(i) && chain && i > 0
                      ? "Venter på videoen til segmentet før (sammenheng)"
                      : undefined
                  }
                  onClick={() => setConfirm([i])}
                >
                  <AiGlyph /> {has ? "Lag ny" : "Generer"}
                </Button>
              </li>
            );
          })}
        </ol>
      )}
      {confirm ? (
        <div
          role="alertdialog"
          aria-label="Bekreft videogenerering"
          className="flex flex-col gap-2 rounded-sm border border-accent-warm/60 bg-surface-2 p-2"
        >
          <p className="text-xs text-text-primary">
            {confirm.length === 1 ? `Segment ${confirm[0]! + 1}` : `${confirm.length} segmenter`}{" "}
            med {chosen?.provider.name} – {chosen?.model.label}. Belastes leverandørkontoen til
            prosjektets eier, anslått {formatUsd(cost(confirm))} (et anslag). Vil du generere nå?
          </p>
          {chosen ? (
            <CostLines
              lines={costBreakdown(chosen.provider, chosen.model, {
                candidates,
                targets: confirm.length,
                targetsLabel: "segmenter",
                seconds: confirm.map(seconds),
                total: `ca. ${formatUsd(cost(confirm))}`,
              })}
            />
          ) : null}
          <SentPrompts items={confirm.map((i) => ({ label: `Segment ${i + 1}`, ...sent(i) }))} />
          <div className="flex gap-2">
            <Button size="sm" onClick={() => void generate(confirm)} disabled={busy}>
              <AiGlyph /> Ja, generer
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>
              Avbryt
            </Button>
          </div>
        </div>
      ) : ready ? (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={busy || !chainPick().length}
            onClick={() => setConfirm(chainPick())}
          >
            {busy ? <Loader2 className="animate-spin" /> : <AiGlyph />}
            {runningSeg.size ? "Generer resten" : "Generer alle segmentene"} (~
            {formatUsd(cost(chainPick()))})
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={segmentsWithVideo.length !== stored.length}
            title={
              segmentsWithVideo.length === stored.length
                ? "Bruk videoene etter hverandre som scenen (kan angres)"
                : "Alle segmentene må ha en ferdig video"
            }
            onClick={() => assemble(false)}
          >
            Sett sammen scenen av videoene ({segmentsWithVideo.length}/{stored.length})
          </Button>
          <label
            className="flex items-center gap-1.5 text-xs text-text-secondary"
            title={canSoft ? undefined : "Krever det nyeste databasetillegget (migrasjon 0026)"}
          >
            <input
              type="checkbox"
              checked={soft}
              disabled={!canSoft}
              onChange={(e) => setSoft(e.target.checked)}
            />
            Myk overgang mellom videoene (0,5 s)
          </label>
          {segmentsWithVideo.length > 0 ? (
            <Button
              size="sm"
              variant="ghost"
              title="Segmenter uten video (og resten av for korte videoer) får 2D-animaticen for samme tid"
              onClick={() => assemble(true)}
            >
              Sett sammen med 2D der video mangler
            </Button>
          ) : null}
        </div>
      ) : null}
      {outdatedAssembly ? (
        <p role="status" className="flex items-center gap-1 text-xs text-status-uncertain">
          <TriangleAlert className="size-3.5" aria-hidden /> Scenen bruker ikke de valgte videoene
          lenger (et segment har fått et nytt valg). Sett sammen på nytt for å bruke dem.
        </p>
      ) : null}
      {msg ? (
        <p
          role={msg.kind === "error" ? "alert" : "status"}
          className={
            "text-xs " + (msg.kind === "error" ? "text-status-danger" : "text-status-success")
          }
        >
          {msg.text}
        </p>
      ) : null}
      {chosen && providerModel(chosen.provider.id, chosen.model.id)?.durations ? (
        <p className="text-[11px] text-text-tertiary">
          {chosen.model.label} lager {chosen.model.durations!.join(", ")} sekunder; hvert segment
          får nærmeste lengde og klippes til segmentet når scenen settes sammen.
        </p>
      ) : null}
      <CompareTakesDialog
        open={compare !== null}
        onOpenChange={(o) => !o && setCompare(null)}
        state={state}
        occurrenceId={clip.occurrenceId}
        segmentId={compare?.segmentId ?? null}
        title={compare?.title ?? ""}
        jobs={list}
        editable={editable}
        cmds={cmds}
        productionId={productionId}
      />
    </section>
  );
}
