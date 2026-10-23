// i18n-ignore-file – lagnavn og ressursnavn er innhold i eksempelprosjektet, ikke grensesnittekst
/**
 * G-9: eksempelprosjektet som en ren liste med vanlige kommandoer (samme vei som alt annet: runCommand →
 * apply_changes). Ingen rader i migrasjoner, ingen betalte kall: bilder er vektorformer (rektangel/ellipse)
 * laget her i koden, bundet til ressursene som plassholdere.
 *
 * Rekkefølge: manus (ImportScreenplay) → ressurser → språkversjoner med oversettelser → én montering per scene
 * (bakgrunn, sted, karakterer) der scene 1 har et animert lag med bevegelsesbane (dragen).
 */
import type { Command, LayerFields, NewBlock, ImportedScene } from "../commands/types";
import type { Id, ProductionId } from "../ids";
import { newId as defaultNewId } from "../ids";
import { keysEvenly } from "../order-key";
import type { Rational } from "../time";
import { DEMO_CHARACTERS, DEMO_LANGUAGES, DEMO_PLACES, DEMO_SCENES, DEMO_TITLE, type DemoLanguage } from "./story";

/** Grensesnittspråket hvis eksempelet finnes på det, ellers engelsk. */
export function pickDemoLanguage(uiLocale: string | null | undefined): DemoLanguage {
  const base = String(uiLocale ?? "").trim().toLowerCase().split(/[-_]/)[0] ?? "";
  const mapped = base === "no" ? "nb" : base;
  return (DEMO_LANGUAGES as readonly string[]).includes(mapped) ? (mapped as DemoLanguage) : "en";
}

export function demoProjectName(lang: DemoLanguage): string {
  return DEMO_TITLE[lang];
}

export interface DemoPlanOptions {
  readonly productionId: ProductionId;
  readonly language: DemoLanguage;
  readonly fps: Rational;
  readonly width: number;
  readonly height: number;
  readonly newId?: <K extends string>() => Id<K>;
}

const LANGUAGE_NAME: Readonly<Record<DemoLanguage, string>> = {
  en: "English",
  ja: "日本語",
  es: "Español",
  nb: "Norsk bokmål",
};

const TRANSFORM = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 };

function shapeLayer(
  kind: LayerFields["kind"],
  name: string,
  assetId: string | null,
  fill: string,
  w: number,
  h: number,
  x: number,
  y: number,
  shape: "rect" | "ellipse",
  parallax: number,
): LayerFields {
  return {
    kind,
    name,
    assetId: assetId as never,
    assetVariantId: null,
    versionId: null,
    fill: assetId ? null : fill,
    width: Math.round(w),
    height: Math.round(h),
    parallax,
    transform: { ...TRANSFORM, x: Math.round(x), y: Math.round(y) },
    keyframes: [],
    visible: true,
    locked: false,
    groupId: null,
    swaps: [],
    path: null,
    anchor: null,
    // Former er bare for fargeflater; ressurslag uten bilde vises som plassholder i ressursens farge
    ...(assetId ? {} : { shape: { type: shape, radius: shape === "rect" ? 12 : 0, stroke: null } }),
  };
}

/** Alle kommandoene, i rekkefølge. Rene data: kan testes uten nettverk. */
export function planDemoProject(o: DemoPlanOptions): Command[] {
  const mk = o.newId ?? (<K extends string>() => defaultNewId<K>());
  const L = o.language;
  const others = DEMO_LANGUAGES.filter((x) => x !== L);
  const fpsValue = o.fps.num / o.fps.den;
  const W = o.width;
  const H = o.height;

  // 1. Manuset
  const sceneKeys = keysEvenly(DEMO_SCENES.length);
  const imported: ImportedScene[] = DEMO_SCENES.map((sc, i) => {
    const keys = keysEvenly(sc.blocks.length);
    const blocks: NewBlock[] = sc.blocks.map((b, j) => ({
      blockId: mk<"script_block">(),
      kind: b.kind,
      text: b.text[L],
      orderKey: keys[j]!,
      sourceRef: null,
      uncertainty: null,
    }));
    return {
      sceneId: mk<"scene">(),
      variantId: mk<"scene_variant">(),
      occurrenceId: mk<"scene_occurrence">(),
      orderKey: sceneKeys[i]!,
      heading: { intExt: sc.intExt[L], location: sc.location[L], time: sc.time[L] },
      headingUncertainty: null,
      productionNumber: String(i + 1),
      blocks,
    };
  });
  const commands: Command[] = [{ type: "ImportScreenplay", productionId: o.productionId, scenes: imported }];

  // 2. Ressurser: karakterer og steder (navn på de andre språkene som språkspesifikke navn)
  const assetIds = {
    mira: mk<"asset">(),
    otto: mk<"asset">(),
    roof: mk<"asset">(),
    stairs: mk<"asset">(),
    workshop: mk<"asset">(),
  } as const;
  const names = (t: Readonly<Record<DemoLanguage, string>>) =>
    others.filter((x) => t[x] !== t[L]).map((x) => ({ name: t[x], kind: "language" as const, language: x }));
  commands.push({
    type: "CreateAssets",
    assets: [
      ...(["mira", "otto"] as const).map((k) => ({
        assetId: assetIds[k],
        fields: {
          kind: "character" as const,
          name: DEMO_CHARACTERS[k].name[L],
          names: names(DEMO_CHARACTERS[k].name),
          description: DEMO_CHARACTERS[k].description[L],
          category: "",
          tags: [],
        },
      })),
      ...(["roof", "stairs", "workshop"] as const).map((k) => ({
        assetId: assetIds[k],
        fields: {
          kind: "location" as const,
          name: DEMO_PLACES[k].name[L],
          names: names(DEMO_PLACES[k].name),
          description: DEMO_PLACES[k].description[L],
          category: "",
          tags: [],
        },
      })),
    ],
  });

  // 3. Språkversjoner med ferdige oversettelser av hver linje og hver sceneoverskrift
  for (const lang of others) {
    commands.push({ type: "AddLanguageVersion", versionId: mk(), language: lang, name: LANGUAGE_NAME[lang] });
    const items: Extract<Command, { type: "AddTranslations" }>["items"][number][] = [];
    DEMO_SCENES.forEach((sc, i) => {
      const im = imported[i]!;
      items.push({
        translationId: mk<"translation">(),
        fields: {
          blockId: null,
          variantId: im.variantId,
          language: lang,
          text: `${sc.intExt[lang]} ${sc.location[lang]} - ${sc.time[lang]}`,
          basedOnRev: 1,
          status: "approved",
        },
      });
      sc.blocks.forEach((b, j) =>
        items.push({
          translationId: mk<"translation">(),
          fields: { blockId: im.blocks[j]!.blockId, variantId: null, language: lang, text: b.text[lang], basedOnRev: 1, status: "approved" },
        }),
      );
    });
    commands.push({ type: "AddTranslations", items });
  }

  // 4. En enkel montering per scene; scene 1 får dragen med bevegelsesbane
  DEMO_SCENES.forEach((sc, i) => {
    const im = imported[i]!;
    const compositionId = mk<"composition">();
    const durationFrames = Math.round(sc.seconds * fpsValue);
    const place = DEMO_PLACES[sc.place];
    commands.push({
      type: "CreateComposition",
      compositionId,
      variantId: im.variantId,
      fields: { name: sc.location[L], width: W, height: H, durationFrames, background: place.sky },
    });
    const layers: LayerFields[] = [
      shapeLayer("background", place.name[L], assetIds[sc.place], place.ground, W, H, W / 2, H / 2, "rect", 1),
      shapeLayer("midground", "Ground", null, place.ground, W, H * 0.35, W / 2, H * 0.825, "rect", 1),
    ];
    sc.cast.forEach((c, n) => {
      const x = sc.cast.length === 1 ? W * 0.4 : W * (0.32 + n * 0.3);
      layers.push(
        shapeLayer("character", DEMO_CHARACTERS[c].name[L], assetIds[c], DEMO_CHARACTERS[c].color, H * 0.18, H * (c === "otto" ? 0.42 : 0.32), x, H * (c === "otto" ? 0.6 : 0.65), "ellipse", 1),
      );
    });
    if (i === 0) {
      const kite = shapeLayer("object", "Kite", null, "#d9534f", H * 0.09, H * 0.12, W * 0.45, H * 0.5, "rect", 1);
      const end = Math.max(2, durationFrames - 1);
      layers.push({
        ...kite,
        transform: { ...kite.transform, rotation: 45 },
        path: {
          points: [
            { x: Math.round(W * 0.45), y: Math.round(H * 0.5), smooth: true },
            { x: Math.round(W * 0.62), y: Math.round(H * 0.22), smooth: true },
            { x: Math.round(W * 0.78), y: Math.round(H * 0.35), smooth: true },
            { x: Math.round(W * 0.7), y: Math.round(H * 0.72), smooth: true },
          ],
          startFrame: 0,
          endFrame: end,
          easeOut: 0.3,
          easeIn: 0.6,
          tempo: [],
        },
      });
    }
    const order = keysEvenly(layers.length);
    commands.push({
      type: "AddLayers",
      layers: layers.map((fields, n) => ({ layerId: mk<"layer">(), compositionId, orderKey: order[n]!, fields })),
    });
  });

  return commands;
}
