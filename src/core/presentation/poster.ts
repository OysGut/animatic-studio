/**
 * Plakater og karakterkart (M8 del 1, DEC-0061, mandat kap. 26, REQ-0384–0399, REQ-0403/0404, REQ-0501/0502).
 *
 * En plakat er en strukturert modell (REQ-0398/0399): tekst, bilder, flater og relasjonslinjer som egne
 * elementer med mål i millimeter. Førsteutkastet (REQ-0396) bygges fra prosjektet: hovedkarakterer etter
 * replikker og scener, steder og objekter etter bruk, godkjente relasjoner, komposisjon og fargepalett.
 * Innholdsvalgene (REQ-0390) styrer hvilke elementer som lages; endres valgene, lages programmets elementer
 * på nytt mens det brukeren har endret selv, står (REQ-0391). Lesbarheten kontrolleres (REQ-0392).
 *
 * `renderPoster` gir en tegneliste (rektangler, streker, bilder og tekstlinjer) som brukes likt av
 * forhåndsvisningen, PNG-eksporten og trykk-PDF-en.
 */
import type {
  Asset,
  AssetVersion,
  LocalizedText,
  Poster,
  PosterDocument,
  PosterElement,
  PosterKind,
  PosterOptions,
  ProjectState,
} from "../model";
import { allAssetUsage, assetNames, coverVersion, nameKey, versionsOf } from "../library";
import { blocksOfVariant, orderedOccurrences } from "../views";
import { characterName } from "../screenplay/filter";
import { filmClips, filmDurationFrames } from "../assembly/film";
import { framesToSeconds } from "../time";
import {
  PT_TO_MM,
  fitTextSize,
  fontKey,
  textWidthPt,
  wrapPosterText,
  type PosterFontKey,
} from "./metrics";
import { RELATION_COLOR, RELATION_DASHED, approvedRelations, relationName } from "./relations";

// ---------- Standarder ----------

/** Plakatformatet mandatet krever (REQ-0386): 70 × 100 cm stående. */
export const POSTER_FORMATS: readonly { id: string; name: string; w: number; h: number }[] = [
  { id: "70x100", name: "70 × 100 cm (stående)", w: 700, h: 1000 },
  { id: "50x70", name: "50 × 70 cm (stående)", w: 500, h: 700 },
  { id: "a1", name: "A1 (59,4 × 84,1 cm)", w: 594, h: 841 },
  { id: "a3", name: "A3 (29,7 × 42 cm)", w: 297, h: 420 },
];

export const POSTER_KIND_LABEL: Record<PosterKind, string> = {
  pitch: "Kinopitch-plakat",
  character_map: "Karakter- og universkart",
};

/** Innholdsvalgene med norske navn, i mandatets rekkefølge (REQ-0390). */
export const POSTER_OPTION_LABEL: readonly [keyof PosterOptions, string][] = [
  ["imagesAndNamesOnly", "Bare bilder og navn"],
  ["shortDescriptions", "Korte karakterbeskrivelser"],
  ["longDescriptions", "Utfyllende karakterbeskrivelser"],
  ["relationLines", "Relasjonslinjer"],
  ["namedRelations", "Navngitte relasjoner"],
  ["relationTexts", "Forklarende relasjonstekster"],
  ["objectImages", "Objektbilder"],
  ["objectDescriptions", "Objektbeskrivelser"],
  ["placeImages", "Stedsbilder"],
  ["placeDescriptions", "Stedsbeskrivelser"],
  ["logline", "Logline"],
  ["genreMood", "Sjanger og stemning"],
  ["projectData", "Andre prosjektdata (format, lengde, produksjon)"],
];

export function defaultOptions(kind: PosterKind): PosterOptions {
  return kind === "pitch"
    ? {
        imagesAndNamesOnly: true,
        shortDescriptions: false,
        longDescriptions: false,
        relationLines: false,
        namedRelations: false,
        relationTexts: false,
        objectImages: true,
        objectDescriptions: false,
        placeImages: true,
        placeDescriptions: false,
        logline: true,
        genreMood: true,
        projectData: true,
      }
    : {
        imagesAndNamesOnly: false,
        shortDescriptions: true,
        longDescriptions: false,
        relationLines: true,
        namedRelations: true,
        relationTexts: false,
        objectImages: true,
        objectDescriptions: true,
        placeImages: true,
        placeDescriptions: true,
        logline: true,
        genreMood: true,
        projectData: false,
      };
}

export interface Palette {
  readonly name: string;
  readonly background: string;
  readonly text: string;
  readonly accent: string;
  readonly muted: string;
}

/** Visuelle stiler (fargepaletter) for plakaten (REQ-0396: «hvilken visuell stil»). */
export const PALETTES: readonly Palette[] = [
  {
    name: "Vinternatt",
    background: "#0d1b2a",
    text: "#f4efe6",
    accent: "#d9a441",
    muted: "#9fb3c8",
  },
  { name: "Kino", background: "#141414", text: "#f2ede4", accent: "#c8a24a", muted: "#a39e93" },
  { name: "Skog", background: "#13261d", text: "#eef2e8", accent: "#d4a85a", muted: "#9db3a2" },
  { name: "Papir", background: "#f4efe6", text: "#1b1b1b", accent: "#8a3b12", muted: "#6b6257" },
];

const empty: LocalizedText = { nb: "", en: "" };

// ---------- Analyse og førsteutkast (REQ-0396) ----------

export interface PosterAnalysis {
  /** Karakterer etter betydning (replikker og scener). */
  readonly characters: readonly {
    readonly asset: Asset;
    readonly lines: number;
    readonly scenes: number;
  }[];
  readonly places: readonly { readonly asset: Asset; readonly scenes: number }[];
  readonly objects: readonly { readonly asset: Asset; readonly scenes: number }[];
  /** Godkjente relasjoner mellom de foreslåtte karakterene. */
  readonly relations: number;
  readonly suggestedKind: PosterKind;
  readonly palette: Palette;
  readonly title: string;
  readonly minutes: number;
}

/** Analyserer produksjonen: hvem, hvor og hva plakaten bør vise, komposisjon og stil (REQ-0396). */
export function posterAnalysis(s: ProjectState, productionId: string): PosterAnalysis {
  const usage = allAssetUsage(s, productionId);
  const occs = orderedOccurrences(s, productionId).filter((o) => o.active);
  // Replikker per karakternavn
  const lines = new Map<string, number>();
  for (const o of occs) {
    let speaker = "";
    for (const b of blocksOfVariant(s, o.variantId)) {
      if (b.kind === "character") speaker = characterName(b.text);
      else if (b.kind === "dialogue" && speaker) lines.set(speaker, (lines.get(speaker) ?? 0) + 1);
    }
  }
  const scenes = (a: Asset) => (usage.get(a.id) ?? []).filter((u) => u.active).length;
  const live = Object.values(s.assets).filter((a) => !a.archived);
  const characters = live
    .filter((a) => a.kind === "character" || a.kind === "animal")
    .map((asset) => ({
      asset,
      lines: assetNames(asset).reduce((n, name) => n + (lines.get(nameKey(name)) ?? 0), 0),
      scenes: scenes(asset),
    }))
    .filter((x) => x.lines + x.scenes > 0)
    .sort(
      (a, b) =>
        b.lines + 2 * b.scenes - (a.lines + 2 * a.scenes) ||
        a.asset.name.localeCompare(b.asset.name, "nb"),
    );
  const places = live
    .filter((a) => a.kind === "location" || a.kind === "environment")
    .map((asset) => ({ asset, scenes: scenes(asset) }))
    .filter((x) => x.scenes > 0)
    .sort((a, b) => b.scenes - a.scenes || a.asset.name.localeCompare(b.asset.name, "nb"));
  const objects = live
    .filter((a) => a.kind === "object")
    .map((asset) => ({ asset, scenes: scenes(asset) }))
    .filter((x) => x.scenes > 0)
    .sort((a, b) => b.scenes - a.scenes || a.asset.name.localeCompare(b.asset.name, "nb"));
  const top = new Set(characters.slice(0, 12).map((c) => c.asset.id as string));
  const relations = approvedRelations(s).filter(
    (r) => top.has(r.fromAssetId) && top.has(r.toAssetId),
  ).length;
  // Stil: vinter og jul gir vinternatt, skog gir skog, ellers kino
  const text = occs
    .map((o) => {
      const v = s.variants[o.variantId];
      return v ? `${v.heading.location} ${v.heading.time}` : "";
    })
    .join(" ")
    .toLowerCase();
  const all = `${s.project.name} ${text}`.toLowerCase();
  const palette = /jul|snø|vinter|natt|kveld|frost/.test(all)
    ? PALETTES[0]!
    : /skog|fjell|mark/.test(all)
      ? PALETTES[2]!
      : PALETTES[1]!;
  const p = s.productions[productionId];
  const minutes = Math.round(
    framesToSeconds(filmDurationFrames(filmClips(s, productionId)), s.project.fps) / 60,
  );
  return {
    characters,
    places,
    objects,
    relations,
    suggestedKind: characters.length > 4 || relations > 0 ? "character_map" : "pitch",
    palette,
    title: p && p.kind !== "main" ? p.name : s.project.name,
    minutes,
  };
}

/** Et nytt plakatdokument med førsteutkast (REQ-0396, REQ-0388/0389). */
export function posterDraft(
  s: ProjectState,
  productionId: string,
  kind: PosterKind,
  widthMm = 700,
  heightMm = 1000,
): PosterDocument {
  const a = posterAnalysis(s, productionId);
  const p = s.productions[productionId];
  const genre: LocalizedText =
    p && p.kind !== "main"
      ? { nb: "Animasjonsfilm", en: "Animated film" }
      : { nb: "Animert familiefilm", en: "Animated family film" };
  const doc: PosterDocument = {
    version: 1,
    options: defaultOptions(kind),
    title: { nb: a.title, en: "" },
    logline: { ...empty },
    genre,
    tagline: { ...empty },
    palette: a.palette,
    characters: a.characters.slice(0, kind === "pitch" ? 3 : 8).map((c) => c.asset.id),
    places: a.places.slice(0, kind === "pitch" ? 1 : 4).map((c) => c.asset.id),
    objects: a.objects.slice(0, kind === "pitch" ? 3 : 6).map((c) => c.asset.id),
    elements: [],
  };
  return layoutPoster(s, { kind, widthMm, heightMm, document: doc, productionId });
}

// ---------- Komposisjon (REQ-0391) ----------

type Draft = Omit<PosterElement, "auto" | "rotation" | "visible"> &
  Partial<Pick<PosterElement, "rotation" | "visible">>;

function firstSentence(text: string, max = 170): string {
  const t = text.trim();
  if (!t) return "";
  const m = t.match(/^(.+?[.!?])(\s|$)/u);
  const s = (m ? m[1]! : t).trim();
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

/** Navnet på ressursen på språket (alternativt navn med språk «en», ellers hovednavnet). */
export function assetDisplayName(a: Asset, lang: "nb" | "en"): string {
  if (lang === "en") {
    const en = a.names.find((n) => n.kind === "language" && n.language === "en");
    if (en) return en.name;
  }
  return a.name;
}

function describe(a: Asset, long: boolean): LocalizedText {
  const d = a.description.trim();
  return { nb: long ? d.slice(0, 700) : firstSentence(d), en: "" };
}

function names(a: Asset): LocalizedText {
  return { nb: assetDisplayName(a, "nb"), en: assetDisplayName(a, "en") };
}

/**
 * Lager (eller lager på nytt) programmets elementer ut fra innholdsvalgene og utvalget. Elementer brukeren
 * har endret (`auto: false`) og egne elementer står; et endret element hvis innhold er slått av, skjules.
 */
export function layoutPoster(
  s: ProjectState,
  p: {
    readonly kind: PosterKind;
    readonly widthMm: number;
    readonly heightMm: number;
    readonly document: PosterDocument;
    readonly productionId: string;
  },
): PosterDocument {
  const doc = p.document;
  const W = p.widthMm;
  const H = p.heightMm;
  const u = W / 700;
  const o = doc.options;
  const pal = doc.palette;
  const out: Draft[] = [];
  const asset = (id: string) => {
    const x = s.assets[id];
    return x && !x.archived ? x : null;
  };
  const chars = doc.characters.map(asset).filter((x): x is Asset => !!x);
  const places = doc.places.map(asset).filter((x): x is Asset => !!x);
  const objects = doc.objects.map(asset).filter((x): x is Asset => !!x);
  const descOn = !o.imagesAndNamesOnly && (o.shortDescriptions || o.longDescriptions);
  const long = o.longDescriptions;
  const text = (
    id: string,
    role: string,
    t: LocalizedText,
    box: { x: number; y: number; w: number; h: number },
    style: {
      font: "serif" | "sans";
      bold?: boolean;
      italic?: boolean;
      max: number;
      min: number;
      color: string;
      align?: "left" | "center" | "right";
      uppercase?: boolean;
      tracking?: number;
      lineHeight?: number;
      /** Rammen krympes til teksten (øverst i rammen i stedet for midt i). */
      top?: boolean;
    },
  ) => {
    // Størrelsen må passe for den lengste av norsk og engelsk
    const longest = t.en.length > t.nb.length ? t.en : t.nb;
    const sample = (style.uppercase ? longest.toUpperCase() : longest) || " ";
    const size = fitTextSize(
      sample,
      fontKey(style.font, style.bold, style.italic),
      box.w,
      box.h,
      style.min,
      style.max,
      style.lineHeight ?? 1.2,
      style.tracking ?? 0,
    );
    if (style.top) {
      const key = fontKey(style.font, style.bold, style.italic);
      const lh = size * (style.lineHeight ?? 1.2) * PT_TO_MM;
      const lines = Math.max(
        ...[t.nb, t.en].map(
          (x) => wrapPosterText(x || " ", key, size, box.w, style.tracking ?? 0).length,
        ),
      );
      box = { ...box, h: Math.min(box.h, lines * lh + lh * 0.3) };
    }
    out.push({
      id,
      kind: "text",
      role,
      ...box,
      text: t,
      font: style.font,
      bold: style.bold ?? false,
      italic: style.italic ?? false,
      size,
      color: style.color,
      align: style.align ?? "center",
      uppercase: style.uppercase ?? false,
      tracking: style.tracking ?? 0,
      lineHeight: style.lineHeight ?? 1.2,
    });
  };
  const image = (
    id: string,
    role: string,
    a: Asset,
    box: { x: number; y: number; w: number; h: number },
    fit: "cover" | "contain",
    opacity = 1,
  ) =>
    out.push({
      id,
      kind: "image",
      role,
      ...box,
      assetId: a.id,
      assetVariantId: null,
      versionId: null,
      fit,
      opacity,
    });
  const rect = (
    id: string,
    role: string,
    box: { x: number; y: number; w: number; h: number },
    fill: string,
    opacity = 1,
    stroke: string | null = null,
    radius = 0,
  ) =>
    out.push({
      id,
      kind: "rect",
      role,
      ...box,
      fill,
      stroke,
      strokeWidth: stroke ? 0.6 * u : 0,
      opacity,
      radius,
    });

  rect("bg", "background", { x: 0, y: 0, w: W, h: H }, pal.background);
  const projectLine = projectData(s, p.productionId);

  if (p.kind === "pitch") {
    // Bakteppe: det viktigste stedet, tonet ned mot tittelen
    if (o.placeImages && places[0]) {
      image(
        `place:${places[0].id}:img`,
        "place",
        places[0],
        { x: 0, y: 0, w: W, h: H * 0.66 },
        "cover",
        0.7,
      );
      for (let i = 0; i < 5; i++)
        rect(
          `fade:${i}`,
          "fade",
          { x: 0, y: H * (0.36 + i * 0.06), w: W, h: H * (0.64 - i * 0.06) },
          pal.background,
          0.22 + i * 0.12,
        );
    }
    if (o.placeDescriptions && places[0])
      text(
        `place:${places[0].id}:desc`,
        "place",
        describe(places[0], false),
        { x: W * 0.12, y: H * 0.03, w: W * 0.76, h: H * 0.05 },
        { font: "serif", italic: true, max: 20 * u, min: 12 * u, color: pal.muted },
      );
    // Hovedkarakterene: den viktigste størst i midten
    const heroes = chars.slice(0, 3);
    const slots =
      heroes.length === 1
        ? [{ x: W * 0.25, y: H * 0.12, w: W * 0.5, h: H * 0.52 }]
        : heroes.length === 2
          ? [
              { x: W * 0.1, y: H * 0.16, w: W * 0.42, h: H * 0.46 },
              { x: W * 0.48, y: H * 0.16, w: W * 0.42, h: H * 0.46 },
            ]
          : [
              { x: W * 0.29, y: H * 0.1, w: W * 0.42, h: H * 0.52 },
              { x: W * 0.04, y: H * 0.2, w: W * 0.34, h: H * 0.42 },
              { x: W * 0.62, y: H * 0.2, w: W * 0.34, h: H * 0.42 },
            ];
    // Sidekarakterene tegnes først (bak)
    const order = heroes
      .map((h, i) => ({ h, i }))
      .sort((a, b) => (a.i === 0 ? 1 : b.i === 0 ? -1 : a.i - b.i));
    for (const { h, i } of order) image(`char:${h.id}:img`, "character", h, slots[i]!, "contain");
    let y = H * 0.63;
    if (o.genreMood)
      text(
        "genre",
        "genre",
        doc.genre,
        { x: W * 0.1, y, w: W * 0.8, h: H * 0.025 },
        {
          font: "sans",
          max: 22 * u,
          min: 12 * u,
          color: pal.accent,
          uppercase: true,
          tracking: 300,
        },
      );
    y += H * 0.03;
    text(
      "title",
      "title",
      doc.title,
      { x: W * 0.06, y, w: W * 0.88, h: H * 0.12 },
      {
        font: "serif",
        bold: true,
        max: 170 * u,
        min: 48 * u,
        color: pal.text,
        uppercase: true,
        tracking: 40,
        lineHeight: 1.0,
      },
    );
    y += H * 0.13;
    if (doc.tagline.nb || doc.tagline.en)
      text(
        "tagline",
        "tagline",
        doc.tagline,
        { x: W * 0.15, y, w: W * 0.7, h: H * 0.025 },
        { font: "serif", italic: true, max: 24 * u, min: 12 * u, color: pal.muted },
      );
    if (doc.tagline.nb || doc.tagline.en) y += H * 0.03;
    text(
      "names",
      "names",
      {
        nb: heroes.map((h) => assetDisplayName(h, "nb").toUpperCase()).join("  ·  "),
        en: heroes.map((h) => assetDisplayName(h, "en").toUpperCase()).join("  ·  "),
      },
      { x: W * 0.08, y, w: W * 0.84, h: H * 0.025 },
      { font: "sans", bold: true, max: 20 * u, min: 11 * u, color: pal.muted, tracking: 200 },
    );
    y += H * 0.035;
    if (descOn) {
      const n = heroes.length || 1;
      heroes.forEach((h, i) =>
        text(
          `char:${h.id}:desc`,
          "character",
          describe(h, long),
          {
            x: W * 0.06 + (i * W * 0.88) / n,
            y,
            w: (W * 0.88) / n - W * 0.02,
            h: H * (long ? 0.08 : 0.045),
          },
          { font: "serif", max: 15 * u, min: 9 * u, color: pal.text },
        ),
      );
      y += H * (long ? 0.085 : 0.05);
    }
    // Loglinen får plassen ned til objektene (eller prosjektlinjen)
    const objTop =
      (o.objectImages || o.objectDescriptions) && objects.length > 0 ? H * 0.875 : H * 0.95;
    const loglineH = Math.min(H * 0.06, objTop - y - H * 0.005);
    if (o.logline && loglineH > H * 0.015)
      text(
        "logline",
        "logline",
        doc.logline,
        { x: W * 0.14, y, w: W * 0.72, h: loglineH },
        { font: "serif", italic: true, max: 30 * u, min: 14 * u, color: pal.text },
      );
    // Symbolske objekter nederst
    if (o.objectImages || o.objectDescriptions) {
      const objs = objects.slice(0, 3);
      const size = H * 0.055;
      const gap = W * 0.04;
      const total = objs.length * size + Math.max(0, objs.length - 1) * gap;
      objs.forEach((ob, i) => {
        const x = (W - total) / 2 + i * (size + gap);
        if (o.objectImages)
          image(`obj:${ob.id}:img`, "object", ob, { x, y: H * 0.875, w: size, h: size }, "contain");
        if (o.objectDescriptions)
          text(
            `obj:${ob.id}:name`,
            "object",
            names(ob),
            { x: x - gap / 2, y: H * 0.875 + size + H * 0.004, w: size + gap, h: H * 0.015 },
            {
              font: "sans",
              max: 11 * u,
              min: 8 * u,
              color: pal.muted,
              uppercase: true,
              tracking: 100,
            },
          );
      });
    }
    if (o.projectData)
      text(
        "project",
        "project",
        projectLine,
        { x: W * 0.06, y: H * 0.958, w: W * 0.88, h: H * 0.02 },
        { font: "sans", max: 13 * u, min: 9 * u, color: pal.muted, tracking: 150, uppercase: true },
      );
  } else {
    // ---------- Karakter- og universkart ----------
    let y = H * 0.035;
    text(
      "title",
      "title",
      doc.title,
      { x: W * 0.06, y, w: W * 0.88, h: H * 0.07 },
      {
        font: "serif",
        bold: true,
        max: 120 * u,
        min: 40 * u,
        color: pal.text,
        uppercase: true,
        tracking: 40,
        lineHeight: 1.0,
      },
    );
    y += H * 0.075;
    if (o.genreMood) {
      text(
        "genre",
        "genre",
        doc.genre,
        { x: W * 0.1, y, w: W * 0.8, h: H * 0.02 },
        {
          font: "sans",
          max: 18 * u,
          min: 10 * u,
          color: pal.accent,
          uppercase: true,
          tracking: 300,
        },
      );
      y += H * 0.025;
    }
    if (o.logline) {
      text(
        "logline",
        "logline",
        doc.logline,
        { x: W * 0.12, y, w: W * 0.76, h: H * 0.045 },
        { font: "serif", italic: true, max: 22 * u, min: 12 * u, color: pal.text },
      );
      y += H * 0.05;
    }
    const footer = o.projectData ? H * 0.035 : H * 0.015;
    const placeOn = (o.placeImages || o.placeDescriptions) && places.length > 0;
    const objOn = (o.objectImages || o.objectDescriptions) && objects.length > 0;
    const placeH = placeOn ? H * (o.placeImages ? 0.17 : 0.08) : 0;
    const objH = objOn ? H * (o.objectImages ? 0.12 : 0.06) : 0;
    const top = y + H * 0.01;
    const bandH = H - top - placeH - objH - footer - H * 0.01;
    // Karakterkortene
    const n = Math.max(1, chars.length);
    const cols = n <= 3 ? n : n <= 4 ? 2 : n <= 6 ? 3 : 4;
    const rows = Math.ceil(n / cols);
    const cellW = (W * 0.9) / cols;
    const cellH = bandH / rows;
    // Få karakterer: større tekst i kortene
    const big = cols <= 2 ? 1.6 : cols === 3 ? 1.3 : 1;
    const portrait = Math.min(cellW * 0.66, cellH * (descOn ? 0.52 : 0.72));
    const centers = new Map<string, string>();
    chars.forEach((c, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      // Siste rad sentreres
      const inRow = row === rows - 1 ? n - row * cols : cols;
      const x0 = W * 0.05 + (cols - inRow) * (cellW / 2) + col * cellW;
      const y0 = top + row * cellH;
      rect(
        `char:${c.id}:card`,
        "character",
        { x: x0 + cellW * 0.04, y: y0 + cellH * 0.02, w: cellW * 0.92, h: cellH * 0.96 },
        pal.text,
        0.05,
        null,
        2 * u,
      );
      const px = x0 + (cellW - portrait) / 2;
      const py = y0 + cellH * 0.05;
      image(
        `char:${c.id}:img`,
        "character",
        c,
        { x: px, y: py, w: portrait, h: portrait },
        "contain",
      );
      centers.set(c.id, `char:${c.id}:img`);
      const ny = py + portrait + cellH * 0.02;
      text(
        `char:${c.id}:name`,
        "character",
        names(c),
        { x: x0 + cellW * 0.08, y: ny, w: cellW * 0.84, h: cellH * 0.06 },
        {
          font: "sans",
          bold: true,
          max: 24 * u * big,
          min: 11 * u,
          color: pal.text,
          uppercase: true,
          tracking: 120,
        },
      );
      if (descOn) {
        const dy = ny + cellH * 0.07;
        text(
          `char:${c.id}:desc`,
          "character",
          describe(c, long),
          { x: x0 + cellW * 0.1, y: dy, w: cellW * 0.8, h: y0 + cellH * 0.95 - dy },
          {
            font: "serif",
            max: (long ? 15 : 17) * u * big,
            min: 9 * u,
            color: pal.text,
            lineHeight: 1.25,
            top: true,
          },
        );
      }
    });
    // Relasjonslinjer bak portrettene (rett etter kortene i rekkefølgen)
    if (o.relationLines) {
      const ids = new Set(chars.map((c) => c.id as string));
      const rels = approvedRelations(s).filter(
        (r) => ids.has(r.fromAssetId) && ids.has(r.toAssetId),
      );
      const firstPortrait = out.findIndex((e) => e.kind === "image" && e.role === "character");
      const lines: Draft[] = rels.map(
        (r) =>
          ({
            id: `rel:${r.id}`,
            kind: "relation",
            role: "relation",
            x: 0,
            y: 0,
            w: 0,
            h: 0,
            relationId: r.id,
            fromElementId: centers.get(r.fromAssetId)!,
            toElementId: centers.get(r.toAssetId)!,
            stroke: RELATION_COLOR[r.kind],
            strokeWidth: 1.4 * u,
            dashed: RELATION_DASHED[r.kind],
            text:
              o.namedRelations || o.relationTexts
                ? {
                    nb: [
                      o.namedRelations ? relationName(r, "nb") : "",
                      o.relationTexts ? r.description : "",
                    ]
                      .filter(Boolean)
                      .join("\n"),
                    en: [o.namedRelations ? relationName(r, "en") : "", ""]
                      .filter(Boolean)
                      .join("\n"),
                  }
                : { nb: "", en: "" },
            font: "sans",
            size: 14 * u,
            color: pal.text,
          }) as Draft,
      );
      out.splice(firstPortrait < 0 ? out.length : firstPortrait, 0, ...lines);
    }
    // Steder
    let by = top + bandH + H * 0.01;
    if (placeOn) {
      const list = places.slice(0, 4);
      const cw = (W * 0.9) / list.length;
      list.forEach((pl, i) => {
        const x = W * 0.05 + i * cw;
        const ih = o.placeImages ? placeH * 0.62 : 0;
        if (o.placeImages)
          image(
            `place:${pl.id}:img`,
            "place",
            pl,
            { x: x + cw * 0.04, y: by, w: cw * 0.92, h: ih },
            "cover",
          );
        text(
          `place:${pl.id}:name`,
          "place",
          names(pl),
          { x: x + cw * 0.04, y: by + ih + placeH * 0.03, w: cw * 0.92, h: placeH * 0.1 },
          {
            font: "sans",
            bold: true,
            max: 15 * u,
            min: 9 * u,
            color: pal.accent,
            uppercase: true,
            tracking: 120,
          },
        );
        if (o.placeDescriptions)
          text(
            `place:${pl.id}:desc`,
            "place",
            describe(pl, false),
            {
              x: x + cw * 0.04,
              y: by + ih + placeH * 0.14,
              w: cw * 0.92,
              h: placeH - ih - placeH * 0.16,
            },
            { font: "serif", max: 13 * u, min: 8 * u, color: pal.muted },
          );
      });
      by += placeH;
    }
    if (objOn) {
      const list = objects.slice(0, 6);
      const cw = (W * 0.9) / list.length;
      list.forEach((ob, i) => {
        const x = W * 0.05 + i * cw;
        const ih = o.objectImages ? Math.min(objH * 0.55, cw * 0.7) : 0;
        if (o.objectImages)
          image(
            `obj:${ob.id}:img`,
            "object",
            ob,
            { x: x + (cw - ih) / 2, y: by + objH * 0.04, w: ih, h: ih },
            "contain",
          );
        text(
          `obj:${ob.id}:name`,
          "object",
          names(ob),
          { x: x + cw * 0.05, y: by + objH * 0.06 + ih, w: cw * 0.9, h: objH * 0.1 },
          {
            font: "sans",
            bold: true,
            max: 13 * u,
            min: 8 * u,
            color: pal.text,
            uppercase: true,
            tracking: 100,
          },
        );
        if (o.objectDescriptions)
          text(
            `obj:${ob.id}:desc`,
            "object",
            describe(ob, false),
            { x: x + cw * 0.05, y: by + objH * 0.17 + ih, w: cw * 0.9, h: objH - ih - objH * 0.19 },
            { font: "serif", max: 12 * u, min: 8 * u, color: pal.muted },
          );
      });
      by += objH;
    }
    if (o.projectData)
      text(
        "project",
        "project",
        projectLine,
        { x: W * 0.06, y: H - footer + H * 0.008, w: W * 0.88, h: H * 0.018 },
        { font: "sans", max: 12 * u, min: 8 * u, color: pal.muted, uppercase: true, tracking: 150 },
      );
  }

  // Slå sammen med det som finnes: brukerens endringer og egne elementer står
  const made = new Map(out.map((e) => [e.id, e]));
  const old = new Map(doc.elements.map((e) => [e.id, e]));
  const merge = (e: Draft): PosterElement => {
    const gen = { rotation: 0, visible: true, ...e, auto: true } as PosterElement;
    const prev = old.get(e.id);
    if (!prev || prev.auto) return gen;
    // Eldre data uten liste over endrede felt: elementet står slik det var
    if (!prev.overrides) return prev;
    const o: Record<string, unknown> = { ...gen, auto: false, overrides: prev.overrides };
    const p = prev as unknown as Record<string, unknown>;
    for (const k of prev.overrides) {
      if (k === "z") continue;
      if (k in p) o[k] = p[k];
      else delete o[k];
    }
    return o as unknown as PosterElement;
  };
  const kept: PosterElement[] = out.map(merge);
  // Endrede elementer hvis innhold er slått av (eller som den andre plakattypen ikke har): står skjult og
  // kommer tilbake med brukerens endringer når innholdet slås på igjen. Har brukeren selv valgt «vis»,
  // glemmes bare det valget (programmets elementer vises uansett), så skjulingen her ikke blir brukerens.
  for (const e of doc.elements)
    if (!made.has(e.id) && e.role !== "custom" && !e.auto)
      kept.push(
        e.visible && e.overrides?.includes("visible")
          ? { ...e, visible: false, overrides: e.overrides.filter((k) => k !== "visible") }
          : { ...e, visible: false },
      );
  // Egne elementer og elementer brukeren har flyttet fram eller bak: samme plass i rekkefølgen som før,
  // rett etter det nærmeste elementet som lå foran og fortsatt finnes (ellers rett over bakgrunnen)
  const pinned = (e: PosterElement) =>
    e.role === "custom" || (!e.auto && !!e.overrides?.includes("z"));
  doc.elements.forEach((e, i) => {
    if (!pinned(e)) return;
    const own = kept.findIndex((k) => k.id === e.id);
    const item = own >= 0 ? kept.splice(own, 1)[0]! : e;
    let at = -1;
    for (let j = i - 1; j >= 0 && at < 0; j--)
      at = kept.findIndex((k) => k.id === doc.elements[j]!.id);
    if (at < 0) at = kept.findIndex((k) => k.role === "background");
    kept.splice(at + 1, 0, item);
  });
  return { ...doc, elements: kept };
}

/**
 * Dokumentet som grunnlag for ny komposisjon når plakattypen endres (pitch ↔ karakter- og universkart,
 * KI-133): innholdsvalgene blir typens standard, programmets urørte elementer lages på nytt, mens elementene
 * brukeren har endret (flyttet, endret størrelse, rotert, ny tekst, skjult …) står med samme nøkkel. Finnes
 * elementet i den nye typen, får det brukerens endringer der; finnes det ikke, står det skjult og kommer
 * tilbake med endringene om brukeren bytter tilbake. Egne elementer står som før.
 */
export function posterKindBase(doc: PosterDocument, kind: PosterKind): PosterDocument {
  return {
    ...doc,
    options: defaultOptions(kind),
    elements: doc.elements.filter((e) => e.role === "custom" || !e.auto),
  };
}

function projectData(s: ProjectState, productionId: string): LocalizedText {
  const p = s.productions[productionId];
  const min = Math.round(
    framesToSeconds(filmDurationFrames(filmClips(s, productionId)), s.project.fps) / 60,
  );
  const nb = [
    p && p.kind !== "main" ? p.name : "Animert spillefilm",
    min > 0 ? `ca. ${min} min` : "",
    `${s.project.frameWidth} × ${s.project.frameHeight}`,
  ].filter(Boolean);
  const en = [
    p && p.kind !== "main" ? p.name : "Animated feature",
    min > 0 ? `approx. ${min} min` : "",
    `${s.project.frameWidth} × ${s.project.frameHeight}`,
  ].filter(Boolean);
  return { nb: nb.join("  ·  "), en: en.join("  ·  ") };
}

// ---------- Tegneliste (forhåndsvisning, PNG og PDF) ----------

export type RenderOp =
  | {
      readonly op: "rect";
      readonly id: string;
      readonly x: number;
      readonly y: number;
      readonly w: number;
      readonly h: number;
      readonly fill: string | null;
      readonly stroke: string | null;
      readonly strokeWidth: number;
      readonly opacity: number;
      readonly radius: number;
      readonly rotation: number;
    }
  | {
      readonly op: "line";
      readonly id: string;
      readonly x1: number;
      readonly y1: number;
      readonly x2: number;
      readonly y2: number;
      readonly stroke: string;
      readonly strokeWidth: number;
      readonly dashed: boolean;
      readonly opacity: number;
    }
  | {
      readonly op: "image";
      readonly id: string;
      /** Rammen elementet har (mm). */
      readonly x: number;
      readonly y: number;
      readonly w: number;
      readonly h: number;
      /** Mediestien til bildet. */
      readonly mediaPath: string;
      /** Bildets plassering (mm) – større enn rammen ved «cover» (klippes), mindre ved «contain». */
      readonly ix: number;
      readonly iy: number;
      readonly iw: number;
      readonly ih: number;
      readonly clip: boolean;
      readonly opacity: number;
      readonly rotation: number;
    }
  | {
      readonly op: "text";
      readonly id: string;
      readonly x: number;
      readonly y: number;
      readonly w: number;
      readonly h: number;
      readonly font: PosterFontKey;
      readonly size: number;
      readonly color: string;
      readonly tracking: number;
      readonly opacity: number;
      readonly rotation: number;
      /** Linjene med venstre kant og grunnlinje (mm). */
      readonly lines: readonly { readonly text: string; readonly x: number; readonly y: number }[];
      /** Teksten får ikke plass i rammen. */
      readonly overflow: boolean;
    };

/** Bildet et bilde-element viser: låst versjon, variantens godkjente/nyeste, ellers ressursens forsidebilde. */
export function elementVersion(s: ProjectState, e: PosterElement): AssetVersion | null {
  if (!e.assetId) return null;
  if (e.versionId) return s.assetVersions[e.versionId] ?? null;
  if (e.assetVariantId) {
    const v = s.assetVariants[e.assetVariantId];
    if (v?.approvedVersionId) return s.assetVersions[v.approvedVersionId] ?? null;
    return versionsOf(s, e.assetVariantId)[0] ?? null;
  }
  return coverVersion(s, e.assetId);
}

/** Teksten på språket; mangler den, brukes norsk (og det telles som manglende oversettelse). */
export function elementText(
  e: PosterElement,
  lang: "nb" | "en",
): { text: string; fallback: boolean } {
  const t = e.text ?? empty;
  const v = lang === "en" ? t.en : t.nb;
  if (v.trim()) return { text: v, fallback: false };
  return { text: t.nb, fallback: lang === "en" && !!t.nb.trim() };
}

const center = (e: PosterElement) => ({ x: e.x + e.w / 2, y: e.y + e.h / 2 });

/** Tegnelisten for plakaten på språket (mm, origo øverst til venstre). */
export function renderPoster(s: ProjectState, poster: Poster, lang = poster.language): RenderOp[] {
  const doc = poster.document;
  const byId = new Map(doc.elements.map((e) => [e.id, e]));
  const ops: RenderOp[] = [];
  for (const e of doc.elements) {
    if (!e.visible) continue;
    const rotation = e.rotation ?? 0;
    const opacity = e.opacity ?? 1;
    if (e.kind === "rect") {
      ops.push({
        op: "rect",
        id: e.id,
        x: e.x,
        y: e.y,
        w: e.w,
        h: e.h,
        fill: e.fill ?? null,
        stroke: e.stroke ?? null,
        strokeWidth: e.strokeWidth ?? 0,
        opacity,
        radius: e.radius ?? 0,
        rotation,
      });
    } else if (e.kind === "line") {
      ops.push({
        op: "line",
        id: e.id,
        x1: e.x,
        y1: e.y,
        x2: e.x + e.w,
        y2: e.y + e.h,
        stroke: e.stroke ?? "#ffffff",
        strokeWidth: e.strokeWidth ?? 1,
        dashed: false,
        opacity,
      });
    } else if (e.kind === "relation") {
      const a = e.fromElementId ? byId.get(e.fromElementId) : undefined;
      const b = e.toElementId ? byId.get(e.toElementId) : undefined;
      if (!a || !b || !a.visible || !b.visible) continue;
      // Relasjonen som er fjernet eller avvist siden, tegnes ikke; programmets linje følger typen
      const rel = e.relationId ? s.assetRelations[e.relationId] : undefined;
      if (e.relationId && (!rel || rel.removed || rel.status !== "approved")) continue;
      const edited = new Set(e.overrides ?? []);
      const stroke =
        rel && (e.auto || (e.overrides && !edited.has("stroke")))
          ? RELATION_COLOR[rel.kind]
          : (e.stroke ?? "#ffffff");
      const dashed =
        rel && (e.auto || (e.overrides && !edited.has("dashed")))
          ? RELATION_DASHED[rel.kind]
          : e.dashed === true;
      const p1 = center(a);
      const p2 = center(b);
      ops.push({
        op: "line",
        id: e.id,
        x1: p1.x,
        y1: p1.y,
        x2: p2.x,
        y2: p2.y,
        stroke,
        strokeWidth: e.strokeWidth ?? 1,
        dashed,
        opacity,
      });
      const label = elementText(e, lang).text.trim();
      if (label) {
        const size = e.size ?? 12;
        const font = fontKey(e.font ?? "sans", e.bold, e.italic);
        const mx = (p1.x + p2.x) / 2;
        const my = (p1.y + p2.y) / 2;
        const w = Math.max(40, Math.min(120, Math.hypot(p2.x - p1.x, p2.y - p1.y) * 0.6));
        const lines = wrapPosterText(label, font, size, w);
        const lh = size * 1.2 * PT_TO_MM;
        const h = lines.length * lh;
        const pad = 1.5;
        ops.push({
          op: "rect",
          id: `${e.id}:bg`,
          x: mx - w / 2 - pad,
          y: my - h / 2 - pad,
          w: w + 2 * pad,
          h: h + 2 * pad,
          fill: doc.palette.background,
          stroke,
          strokeWidth: 0.4,
          opacity: 0.9,
          radius: 1.5,
          rotation: 0,
        });
        ops.push({
          op: "text",
          id: `${e.id}:label`,
          x: mx - w / 2,
          y: my - h / 2,
          w,
          h,
          font,
          size,
          color: e.color ?? doc.palette.text,
          tracking: 0,
          opacity: 1,
          rotation: 0,
          lines: lines.map((t, i) => ({
            text: t,
            x: mx - (textWidthPt(t, font, size) * PT_TO_MM) / 2,
            y: my - h / 2 + (i + 0.8) * lh,
          })),
          overflow: false,
        });
      }
    } else if (e.kind === "image") {
      const v = elementVersion(s, e);
      if (!v) {
        ops.push({
          op: "rect",
          id: e.id,
          x: e.x,
          y: e.y,
          w: e.w,
          h: e.h,
          fill: null,
          stroke: doc.palette.muted,
          strokeWidth: 0.5,
          opacity: 0.6,
          radius: 0,
          rotation,
        });
        continue;
      }
      const ar = v.width && v.height ? v.width / v.height : 1;
      const box = e.w / e.h;
      const cover = (e.fit ?? "cover") === "cover";
      let iw: number;
      let ih: number;
      if (cover === ar > box) {
        ih = e.h;
        iw = e.h * ar;
      } else {
        iw = e.w;
        ih = e.w / ar;
      }
      ops.push({
        op: "image",
        id: e.id,
        x: e.x,
        y: e.y,
        w: e.w,
        h: e.h,
        mediaPath: v.mediaPath,
        ix: e.x + (e.w - iw) / 2,
        iy: e.y + (e.h - ih) / 2,
        iw,
        ih,
        clip: cover,
        opacity,
        rotation,
      });
    } else if (e.kind === "text") {
      const { text: raw } = elementText(e, lang);
      const t = e.uppercase ? raw.toLocaleUpperCase(lang === "en" ? "en" : "nb") : raw;
      if (!t.trim()) continue;
      const font = fontKey(e.font ?? "serif", e.bold, e.italic);
      const size = e.size ?? 14;
      const tracking = e.tracking ?? 0;
      const lh = size * (e.lineHeight ?? 1.2) * PT_TO_MM;
      const lines = wrapPosterText(t, font, size, e.w, tracking);
      const total = lines.length * lh;
      // Teksten sentreres loddrett i rammen når den får plass
      const top = total <= e.h ? e.y + (e.h - total) / 2 : e.y;
      ops.push({
        op: "text",
        id: e.id,
        x: e.x,
        y: e.y,
        w: e.w,
        h: e.h,
        font,
        size,
        color: e.color ?? doc.palette.text,
        tracking,
        opacity,
        rotation,
        lines: lines.map((line, i) => {
          const lw = textWidthPt(line, font, size, tracking) * PT_TO_MM;
          const x =
            e.align === "left" ? e.x : e.align === "right" ? e.x + e.w - lw : e.x + (e.w - lw) / 2;
          return { text: line, x, y: top + i * lh + size * 0.8 * PT_TO_MM };
        }),
        overflow: total > e.h + 0.5,
      });
    }
  }
  return ops;
}

// ---------- Lesbarhet (REQ-0392) ----------

/** Navn på elementenes roller i redigeringen. */
export const ROLE_LABEL: Record<string, string> = {
  background: "Bakgrunn",
  fade: "Overgang",
  title: "Tittel",
  genre: "Sjanger og stemning",
  tagline: "Slagord",
  logline: "Logline",
  names: "Navnelinje",
  character: "Karakter",
  place: "Sted",
  object: "Objekt",
  relation: "Relasjon",
  project: "Prosjektdata",
  custom: "Eget element",
};

export interface PosterCheck {
  readonly level: "ok" | "warn" | "info";
  readonly text: string;
  readonly elementIds?: readonly string[];
}

/** Minste lesbare tekst på plakaten (pt), skalert etter bredden: 12 pt på 70 × 100 cm. */
export function minReadablePt(widthMm: number): number {
  return Math.max(6, 12 * (widthMm / 700));
}

/**
 * Kontroll av plakaten: for liten tekst, tekst som ikke får plass, manglende bilder og manglende engelsk
 * tekst – med forslag til en annen komposisjon (REQ-0392).
 */
export function posterChecks(
  s: ProjectState,
  poster: Poster,
  lang = poster.language,
): PosterCheck[] {
  const out: PosterCheck[] = [];
  const ops = renderPoster(s, poster, lang);
  const min = minReadablePt(poster.widthMm);
  const small = ops.filter(
    (o): o is Extract<RenderOp, { op: "text" }> => o.op === "text" && o.size < min,
  );
  const over = ops.filter(
    (o): o is Extract<RenderOp, { op: "text" }> => o.op === "text" && o.overflow,
  );
  if (small.length || over.length) {
    const o = poster.document.options;
    const tips: string[] = [];
    if (o.longDescriptions) tips.push("bruk korte beskrivelser i stedet for utfyllende");
    if (poster.document.characters.length > 6) tips.push("vis færre karakterer");
    if (
      poster.kind === "pitch" &&
      (o.shortDescriptions || o.longDescriptions || o.objectDescriptions)
    )
      tips.push("bytt til karakter- og universkart for mye tekst");
    if (o.placeDescriptions || o.objectDescriptions)
      tips.push("slå av beskrivelser av steder eller objekter");
    out.push({
      level: "warn",
      text: `Redusert lesbarhet: ${small.length ? `${small.length} tekster er mindre enn ${Math.round(min)} pt` : ""}${small.length && over.length ? " og " : ""}${over.length ? `${over.length} tekster får ikke plass` : ""}.${tips.length ? ` Forslag: ${tips.join("; ")}.` : ""}`,
      elementIds: [...new Set([...small, ...over].map((x) => x.id))],
    });
  } else out.push({ level: "ok", text: `All tekst er minst ${Math.round(min)} pt og får plass.` });
  const missing = poster.document.elements.filter(
    (e) => e.visible && e.kind === "image" && !elementVersion(s, e),
  );
  if (missing.length)
    out.push({
      level: "warn",
      text: `${missing.length} ${missing.length === 1 ? "bilde mangler" : "bilder mangler"} i biblioteket og vises som tom ramme.`,
      elementIds: missing.map((e) => e.id),
    });
  const empties = poster.document.elements.filter(
    (e) => e.visible && e.kind === "text" && !elementText(e, lang).text.trim(),
  );
  if (empties.length)
    out.push({
      level: "info",
      text: `${empties.length === 1 ? "Ett tekstfelt er tomt" : `${empties.length} tekstfelt er tomme`} (${[...new Set(empties.map((e) => ROLE_LABEL[e.role] ?? e.role))].join(", ")}) og vises ikke.`,
      elementIds: empties.map((e) => e.id),
    });
  if (lang === "en") {
    const untranslated = poster.document.elements.filter(
      (e) =>
        e.visible && (e.kind === "text" || e.kind === "relation") && elementText(e, "en").fallback,
    );
    if (untranslated.length)
      out.push({
        level: "info",
        text: `${untranslated.length} ${untranslated.length === 1 ? "tekst mangler" : "tekster mangler"} engelsk versjon og vises på norsk.`,
        elementIds: untranslated.map((e) => e.id),
      });
  }
  return out;
}

// ---------- Utfallende kant (trykk-PDF) ----------

/**
 * Tegnelisten med utfallende kant: flater og bilder som går helt ut til kanten av plakaten, forlenges
 * `bleed` mm utenfor den, slik at det ikke blir hvite striper når trykkeriet skjærer (REQ-0397).
 * Bilder som dekker rammen («dekk»), skaleres så de fortsatt dekker den forlengede rammen.
 */
export function bleedOps(
  ops: readonly RenderOp[],
  widthMm: number,
  heightMm: number,
  bleed: number,
): RenderOp[] {
  if (bleed <= 0) return [...ops];
  const near = (a: number, b: number) => Math.abs(a - b) < 0.5;
  const grow = (o: { x: number; y: number; w: number; h: number; rotation: number }) => {
    if (o.rotation) return null;
    const l = near(o.x, 0) || o.x < 0 ? bleed : 0;
    const t = near(o.y, 0) || o.y < 0 ? bleed : 0;
    const r = near(o.x + o.w, widthMm) || o.x + o.w > widthMm ? bleed : 0;
    const b = near(o.y + o.h, heightMm) || o.y + o.h > heightMm ? bleed : 0;
    if (!l && !t && !r && !b) return null;
    return { x: o.x - l, y: o.y - t, w: o.w + l + r, h: o.h + t + b };
  };
  return ops.map((o) => {
    if (o.op === "rect") {
      const g = grow(o);
      return g ? { ...o, ...g, radius: 0 } : o;
    }
    if (o.op === "image" && o.clip) {
      const g = grow(o);
      if (!g) return o;
      const ar = o.iw / o.ih;
      let iw: number;
      let ih: number;
      if (ar > g.w / g.h) {
        ih = Math.max(g.h, o.ih);
        iw = ih * ar;
      } else {
        iw = Math.max(g.w, o.iw);
        ih = iw / ar;
      }
      // Bildets midtpunkt beholdes
      const cx = o.ix + o.iw / 2;
      const cy = o.iy + o.ih / 2;
      let ix = cx - iw / 2;
      let iy = cy - ih / 2;
      ix = Math.min(g.x, Math.max(g.x + g.w - iw, ix));
      iy = Math.min(g.y, Math.max(g.y + g.h - ih, iy));
      return { ...o, ...g, ix, iy, iw, ih };
    }
    return o;
  });
}

/** Filnavn for eksporten (bare ASCII). */
export function posterFileName(poster: Pick<Poster, "name" | "language">, ext: string): string {
  const base =
    poster.name
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[æÆ]/g, "ae")
      .replace(/[øØ]/g, "o")
      .replace(/[åÅ]/g, "a")
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "plakat";
  return `${base}-${poster.language}.${ext}`;
}
