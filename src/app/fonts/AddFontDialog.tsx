/**
 * B-098: dialogen «Legg til font». Søk i Google Fonts-katalogen, filtre for kategori og skriftsystem,
 * forhåndsvisning med egen prøvetekst, valg av vekter og stiler, og lisensen. Alt går via serveren;
 * nettleseren henter aldri noe fra Google. Lenken åpner fonts.google.com i en ny fane.
 */
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ExternalLink } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import {
  CATALOG_CATEGORIES,
  CATALOG_SUBSETS,
  FONT_MAX_VARIANTS,
  filterCatalog,
  licenseNeedsNotice,
  type CatalogFont,
  type CatalogVariant,
  type FontCategory,
} from "@/core";
import { t } from "@/core/i18n/keyed";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  googleFontPackage,
  googleFontPreview,
  listGoogleFonts,
  type PackagedFontFile,
} from "@/adapters/fonts/google-fonts.functions";

const inputClass =
  "h-8 rounded-md border border-border bg-surface-1 px-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-ring";

function categoryLabel(c: FontCategory): string {
  switch (c) {
    case "serif":
      return t("b098.category.serif");
    case "sans":
      return t("b098.category.sans");
    case "display":
      return t("b098.category.display");
    case "handwriting":
      return t("b098.category.handwriting");
    default:
      return t("b098.category.mono");
  }
}
const variantLabel = (v: CatalogVariant) =>
  v.italic ? t("b098.variant.italic", { weight: String(v.weight) }) : t("b098.variant.regular", { weight: String(v.weight) });
const vkey = (v: CatalogVariant) => `${v.weight}${v.italic ? "i" : ""}`;

export function AddFontDialog({
  open,
  onOpenChange,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Legger fonten til i prosjektet; gir feilmelding eller null. */
  onAdd: (font: CatalogFont, files: PackagedFontFile[], subsets: string[]) => Promise<string | null>;
}) {
  const list = useServerFn(listGoogleFonts);
  const preview = useServerFn(googleFontPreview);
  const fetchPackage = useServerFn(googleFontPackage);
  const [catalog, setCatalog] = useState<CatalogFont[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<FontCategory | "">("");
  const [subset, setSubset] = useState("");
  const [sample, setSample] = useState(() => t("b098.sample.default"));
  const [selected, setSelected] = useState<CatalogFont | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [previewFamily, setPreviewFamily] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || catalog) return;
    let live = true;
    list()
      .then((r) => {
        if (!live) return;
        if (r.ok) setCatalog(r.value);
        else setUnavailable(true);
      })
      .catch(() => live && setUnavailable(true));
    return () => {
      live = false;
    };
  }, [open, catalog, list]);

  const hits = useMemo(() => (catalog ? filterCatalog(catalog, { query, category, subset }, 60) : []), [catalog, query, category, subset]);

  // Forhåndsvisning: en liten fil med bare tegnene i prøveteksten, hentet via serveren
  const previewVariant = selected ? (selected.variants.find((v) => vkey(v) === [...chosen][0]) ?? selected.variants.find((v) => v.weight === 400 && !v.italic) ?? selected.variants[0]) : null;
  useEffect(() => {
    if (!selected || !previewVariant || typeof FontFace === "undefined") return;
    let live = true;
    setPreviewFamily(null);
    const timer = setTimeout(() => {
      preview({ data: { family: selected.family, variant: previewVariant, text: sample } })
        .then(async (r) => {
          if (!live || !r.ok) return;
          const bin = atob(r.value.base64);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          const fam = `PTG Preview ${selected.family}`; // i18n-ignore – CSS-familienavn
          const face = new FontFace(fam, bytes.buffer, { weight: String(previewVariant.weight), style: previewVariant.italic ? "italic" : "normal" });
          await face.load();
          document.fonts.add(face);
          if (live) setPreviewFamily(fam);
        })
        .catch(() => undefined);
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [selected, previewVariant?.weight, previewVariant?.italic, sample, preview]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (f: CatalogFont) => {
    setSelected(f);
    setError(null);
    const regular = f.variants.find((v) => v.weight === 400 && !v.italic) ?? f.variants[0]!;
    setChosen(new Set([vkey(regular)]));
  };

  const toggle = (v: CatalogVariant) =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(vkey(v))) next.delete(vkey(v));
      else if (next.size < FONT_MAX_VARIANTS) next.add(vkey(v));
      return next;
    });

  const add = async () => {
    if (!selected || chosen.size === 0) return;
    setBusy(true);
    setError(null);
    try {
      const variants = selected.variants.filter((v) => chosen.has(vkey(v)));
      const subsets = selected.subsets.filter((s) => s === "latin" || s === "latin-ext" || s === subset);
      const files = await fetchPackage({ data: { family: selected.family, variants, subsets } });
      if (!files.ok) {
        setError(t("b098.unavailable"));
        return;
      }
      const err = await onAdd(selected, files.value, subsets);
      if (err) setError(err);
      else onOpenChange(false);
    } catch {
      setError(t("b098.unavailable"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" data-testid="font-add-dialog">
        <DialogHeader>
          <DialogTitle>{t("b098.dialog.title")}</DialogTitle>
          <DialogDescription>{t("b098.dialog.description")}</DialogDescription>
        </DialogHeader>
        {unavailable ? (
          <p role="status" data-testid="font-catalog-unavailable" className="rounded-md bg-surface-2 p-3 text-sm text-text-secondary">
            {t("b098.unavailable")}
          </p>
        ) : (
          <div className="grid gap-3">
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex flex-1 flex-col gap-1 text-xs text-text-secondary">
                <span>{t("b098.search.label")}</span>
                <input
                  data-testid="font-search"
                  className={inputClass}
                  value={query}
                  placeholder={t("b098.search.placeholder")}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-text-secondary">
                <span>{t("b098.filter.category")}</span>
                <select data-testid="font-category" className={inputClass} value={category} onChange={(e) => setCategory(e.target.value as FontCategory | "")}>
                  <option value="">{t("b098.filter.all")}</option>
                  {CATALOG_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {categoryLabel(c)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-text-secondary">
                <span>{t("b098.filter.subset")}</span>
                <select data-testid="font-subset" className={inputClass} value={subset} onChange={(e) => setSubset(e.target.value)}>
                  <option value="">{t("b098.filter.all")}</option>
                  {CATALOG_SUBSETS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <a
              href="https://fonts.google.com/"
              target="_blank"
              rel="noopener noreferrer"
              data-testid="font-open-google"
              className="inline-flex w-fit items-center gap-1 text-xs text-accent underline"
            >
              <ExternalLink className="size-3" aria-hidden />
              {t("b098.open-google")}
            </a>
            <div className="grid gap-3 sm:grid-cols-[14rem_1fr]">
              <ul
                data-testid="font-results"
                aria-label={t("b098.results.label")}
                className="max-h-72 overflow-auto rounded-md border border-border"
              >
                {catalog === null ? (
                  <li className="p-2 text-xs text-text-tertiary">{t("b098.loading")}</li>
                ) : hits.length === 0 ? (
                  <li className="p-2 text-xs text-text-tertiary">{t("b098.results.none")}</li>
                ) : (
                  hits.map((f) => (
                    <li key={f.family}>
                      <button
                        type="button"
                        data-testid="font-result"
                        aria-pressed={selected?.family === f.family}
                        className={
                          "flex w-full items-center justify-between gap-2 px-2 py-1 text-left text-sm hover:bg-surface-2 " +
                          (selected?.family === f.family ? "bg-accent-selection" : "")
                        }
                        onClick={() => pick(f)}
                      >
                        <span>{f.family}</span>
                        <span className="text-xs text-text-tertiary">{categoryLabel(f.category)}</span>
                      </button>
                    </li>
                  ))
                )}
              </ul>
              <div className="grid content-start gap-2">
                <label className="flex flex-col gap-1 text-xs text-text-secondary">
                  <span>{t("b098.sample.label")}</span>
                  <input data-testid="font-sample" className={inputClass} value={sample} maxLength={200} onChange={(e) => setSample(e.target.value)} />
                </label>
                {selected ? (
                  <>
                    <p
                      data-testid="font-preview"
                      data-loaded={previewFamily ? "true" : "false"}
                      className="min-h-16 break-words rounded-md border border-border p-3 text-2xl text-text-primary"
                      style={{
                        fontFamily: previewFamily ? `"${previewFamily}", system-ui` : "system-ui",
                        fontWeight: previewVariant?.weight,
                        fontStyle: previewVariant?.italic ? "italic" : "normal",
                      }}
                    >
                      {sample}
                    </p>
                    <fieldset className="grid gap-1">
                      <legend className="text-xs text-text-secondary">{t("b098.variants.label", { max: String(FONT_MAX_VARIANTS) })}</legend>
                      <div className="flex flex-wrap gap-2">
                        {selected.variants.map((v) => (
                          <label key={vkey(v)} className="flex items-center gap-1 text-xs text-text-primary">
                            <input type="checkbox" data-testid={`font-variant-${vkey(v)}`} checked={chosen.has(vkey(v))} onChange={() => toggle(v)} />
                            {variantLabel(v)}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    <p data-testid="font-license" className="text-xs text-text-secondary">
                      {t("b098.license", { license: selected.license })}
                    </p>
                    {licenseNeedsNotice(selected.license) ? (
                      <p role="alert" data-testid="font-license-notice" className="flex items-start gap-1 text-xs text-status-discrepancy">
                        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                        {t("b098.license.notice")}
                      </p>
                    ) : null}
                  </>
                ) : (
                  <p className="text-xs text-text-tertiary">{t("b098.pick-hint")}</p>
                )}
              </div>
            </div>
          </div>
        )}
        {error ? (
          <p role="alert" data-testid="font-add-error" className="text-xs text-status-danger">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("b098.cancel")}
          </Button>
          <Button data-testid="font-add-confirm" disabled={!selected || chosen.size === 0 || busy || unavailable} onClick={() => void add()}>
            {busy ? t("b098.adding") : t("b098.add")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
