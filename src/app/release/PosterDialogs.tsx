/**
 * Ny plakat (førsteutkast fra prosjektet, REQ-0396) og eksport til trykk-PDF eller PNG (REQ-0397,
 * REQ-0403/0404, DEC-0061).
 */
import { useMemo, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import {
  POSTER_FORMATS,
  POSTER_KIND_LABEL,
  newId,
  posterAnalysis,
  posterDraft,
  posterFileName,
  renderPoster,
  type Poster,
  type PosterKind,
  type ProjectState,
} from "@/core";
import type { Commands } from "@/app/project/use-commands";
import { signedUrls } from "@/app/library/asset-images";
import { prepareDownload, type ReadyFile } from "@/app/download";
import { deflateZlib, posterPdf } from "@/engine/export/poster-pdf";
import {
  bitmapToPdfImage,
  fetchBitmap,
  maxPxPerMm,
  posterPng,
} from "@/engine/export/poster-canvas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const control =
  "h-8 w-full rounded-sm border border-border-control bg-surface-3 px-2 text-[13px] text-text-primary";

export function NewPosterDialog({
  state,
  cmds,
  productionId,
  open,
  onOpenChange,
  onCreated,
}: {
  state: ProjectState;
  cmds: Commands;
  productionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (posterId: string) => void;
}) {
  const analysis = useMemo(
    () => (open ? posterAnalysis(state, productionId) : null),
    [state, productionId, open],
  );
  const [kind, setKind] = useState<PosterKind | null>(null);
  const [format, setFormat] = useState(POSTER_FORMATS[0]!.id);
  const [language, setLanguage] = useState<"nb" | "en">("nb");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const k = kind ?? analysis?.suggestedKind ?? "pitch";
  const prod = state.productions[productionId];
  const defaultName = `${POSTER_KIND_LABEL[k]}${prod && prod.kind !== "main" ? ` – ${prod.name}` : ""}`;

  function create() {
    const f = POSTER_FORMATS.find((x) => x.id === format) ?? POSTER_FORMATS[0]!;
    const posterId = newId<"poster">();
    const err = cmds.run(
      {
        type: "CreatePoster",
        posterId,
        fields: {
          productionId: productionId as never,
          name: name.trim() || defaultName,
          kind: k,
          language,
          widthMm: f.w,
          heightMm: f.h,
          document: posterDraft(state, productionId, k, f.w, f.h),
        },
      },
      `Ny plakat «${name.trim() || defaultName}»`,
    );
    setError(err);
    if (!err) {
      onCreated(posterId);
      onOpenChange(false);
      setName("");
      setKind(null);
    }
  }

  const list = (xs: readonly { asset: { name: string } }[], n: number) =>
    xs.length
      ? xs
          .slice(0, n)
          .map((x) => x.asset.name)
          .join(", ")
      : "ingen";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Ny plakat</DialogTitle>
          <DialogDescription>
            Programmet lager et førsteutkast fra prosjektet: de viktigste karakterene, steder og
            objekter, godkjente relasjoner og en stil. Alt kan endres etterpå.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            create();
          }}
        >
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1 text-xs text-text-secondary">Type</legend>
            {(["pitch", "character_map"] as const).map((x) => (
              <label key={x} className="flex items-start gap-2 text-[13px] text-text-primary">
                <input
                  type="radio"
                  name="poster-kind"
                  checked={k === x}
                  onChange={() => setKind(x)}
                  className="mt-0.5 accent-[var(--accent-brand)]"
                />
                <span>
                  {POSTER_KIND_LABEL[x]}
                  {analysis?.suggestedKind === x ? (
                    <span className="ml-1.5 text-xs text-text-tertiary">(foreslått)</span>
                  ) : null}
                  <span className="block text-xs text-text-tertiary">
                    {x === "pitch"
                      ? "Kinoplakat med få karakterer, stemning og tittel."
                      : "Oversikt over karakterene, relasjonene, stedene og objektene."}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-xs text-text-secondary">
              Format
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value)}
                className={control}
              >
                {POSTER_FORMATS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-text-secondary">
              Språk
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as "nb" | "en")}
                className={control}
              >
                <option value="nb">Norsk</option>
                <option value="en">Engelsk</option>
              </select>
            </label>
          </div>
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            Navn
            <Input
              value={name}
              placeholder={defaultName}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          {analysis ? (
            <div className="rounded-sm border border-border bg-surface-2 px-3 py-2 text-xs text-text-secondary">
              <p>
                <span className="text-text-primary">Karakterer:</span>{" "}
                {list(analysis.characters, k === "pitch" ? 3 : 8)}
              </p>
              <p>
                <span className="text-text-primary">Steder:</span>{" "}
                {list(analysis.places, k === "pitch" ? 1 : 4)}
              </p>
              <p>
                <span className="text-text-primary">Objekter:</span>{" "}
                {list(analysis.objects, k === "pitch" ? 3 : 6)}
              </p>
              <p>
                <span className="text-text-primary">Relasjoner:</span> {analysis.relations}{" "}
                godkjente · <span className="text-text-primary">Stil:</span> {analysis.palette.name}
              </p>
            </div>
          ) : null}
          {error ? (
            <p role="alert" className="text-xs text-status-danger">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Avbryt
            </Button>
            <Button type="submit">Lag utkast</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ExportPosterDialog({
  state,
  poster,
  open,
  onOpenChange,
}: {
  state: ProjectState;
  poster: Poster;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [kind, setKind] = useState<"pdf" | "png">("pdf");
  const [lang, setLang] = useState<"nb" | "en">(poster.language);
  const [bleed, setBleed] = useState(true);
  const [marks, setMarks] = useState(true);
  const [ppi, setPpi] = useState(150);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState<ReadyFile | null>(null);
  const [missing, setMissing] = useState(0);
  const realPpi = Math.round(maxPxPerMm(poster.widthMm, poster.heightMm, ppi) * 25.4);

  async function run() {
    setBusy(true);
    setError(null);
    setReady(null);
    try {
      const ops = renderPoster(state, poster, lang);
      const paths = [...new Set(ops.flatMap((o) => (o.op === "image" ? [o.mediaPath] : [])))];
      const urls = paths.length ? await signedUrls(paths, 60 * 60) : {};
      const p = { ...poster, language: lang };
      let missing = 0;
      if (kind === "pdf") {
        const bytes = await posterPdf(
          ops,
          {
            widthMm: poster.widthMm,
            heightMm: poster.heightMm,
            bleedMm: bleed ? 3 : 0,
            cropMarks: marks,
            title: poster.name,
          },
          async (path, w, h) => {
            const url = urls[path];
            if (!url) {
              missing++;
              return null;
            }
            try {
              const bmp = await fetchBitmap(url, w, h);
              const img = bitmapToPdfImage(bmp);
              bmp.close();
              return img;
            } catch {
              missing++;
              return null;
            }
          },
          deflateZlib,
        );
        setReady(prepareDownload(bytes, posterFileName(p, "pdf"), "application/pdf"));
        setMissing(missing);
      } else {
        const png = await posterPng(ops, poster.widthMm, poster.heightMm, ppi, urls);
        const bytes = new Uint8Array(await png.blob.arrayBuffer());
        setReady(prepareDownload(bytes, posterFileName(p, "png"), "image/png"));
        setMissing(png.missing);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setReady(null);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Eksporter «{poster.name}»</DialogTitle>
          <DialogDescription>
            {(poster.widthMm / 10).toLocaleString("nb")} ×{" "}
            {(poster.heightMm / 10).toLocaleString("nb")} cm. Trykk-PDF-en har ekte tekst og bildene
            i trykkoppløsning.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <fieldset className="flex gap-4">
            <legend className="sr-only">Filtype</legend>
            {(["pdf", "png"] as const).map((x) => (
              <label key={x} className="flex items-center gap-1.5 text-[13px] text-text-primary">
                <input
                  type="radio"
                  name="poster-export"
                  checked={kind === x}
                  onChange={() => setKind(x)}
                  className="accent-[var(--accent-brand)]"
                />
                {x === "pdf" ? "Trykk-PDF" : "PNG-bilde"}
              </label>
            ))}
          </fieldset>
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            Språk
            <select
              value={lang}
              onChange={(e) => setLang(e.target.value as "nb" | "en")}
              className={control}
            >
              <option value="nb">Norsk</option>
              <option value="en">Engelsk</option>
            </select>
          </label>
          {kind === "pdf" ? (
            <div className="flex flex-col gap-1.5">
              <label className="flex items-center gap-2 text-[13px] text-text-primary">
                <input
                  type="checkbox"
                  checked={bleed}
                  onChange={(e) => setBleed(e.target.checked)}
                  className="size-3.5 accent-[var(--accent-brand)]"
                />
                Utfallende kant (3 mm)
              </label>
              <label className="flex items-center gap-2 text-[13px] text-text-primary">
                <input
                  type="checkbox"
                  checked={marks}
                  onChange={(e) => setMarks(e.target.checked)}
                  className="size-3.5 accent-[var(--accent-brand)]"
                />
                Skjæremerker
              </label>
            </div>
          ) : (
            <label className="flex flex-col gap-1 text-xs text-text-secondary">
              Oppløsning
              <select
                value={ppi}
                onChange={(e) => setPpi(Number(e.target.value))}
                className={control}
              >
                <option value={72}>72 ppi (skjerm)</option>
                <option value={150}>150 ppi</option>
                <option value={300}>300 ppi</option>
              </select>
              {realPpi < ppi ? (
                <span className="text-[11px] text-text-tertiary">
                  Nettleseren kan lage bilder på høyst ca. 16 megapiksler; dette formatet blir{" "}
                  {realPpi} ppi. Bruk trykk-PDF-en til trykk.
                </span>
              ) : null}
            </label>
          )}
          {error ? (
            <p role="alert" className="text-xs text-status-danger">
              {error}
            </p>
          ) : null}
          {ready ? (
            <p className="text-xs text-text-secondary" role="status">
              Filen er laget.{" "}
              {missing > 0
                ? `${missing === 1 ? "Ett bilde" : `${missing} bilder`} kunne ikke hentes og er vist som tom ramme. `
                : ""}
              <a href={ready.url} download={ready.name} className="text-accent-brand underline">
                Last ned {ready.name}
              </a>
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Lukk
          </Button>
          <Button onClick={run} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Download />}
            {busy ? "Lager filen …" : "Lag filen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
