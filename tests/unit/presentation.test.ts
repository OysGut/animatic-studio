// @vitest-environment node
/**
 * Plakater, karakterkart og relasjoner (M8 del 1, DEC-0061, REQ-0384–0399, REQ-0403/0404, REQ-0501/0502).
 */
import { describe, expect, it } from "vitest";
import {
  applyCommand,
  diffStates,
  emptyProjectState,
  fitTextSize,
  layoutPoster,
  mainProduction,
  minReadablePt,
  posterAssetRefs,
  posterChecks,
  posterDocumentError,
  posterDraft,
  relationSuggestions,
  renderPoster,
  stateFromRows,
  textWidthPt,
  winAnsiCode,
  wrapPosterText,
  type Poster,
  type PosterDocument,
  type PosterElement,
  type ProjectState,
} from "@/core";
import { envelope, mustApply, tid } from "../helpers/fixtures";
import { fixture } from "../visual/fixture-state";

const s0 = fixture.state;
const main = mainProduction(s0)!;
const maja = Object.values(s0.assets).find((a) => a.name === "Maja")!;
const anne = Object.values(s0.assets).find((a) => a.name === "Bestemor Anne")!;

function withRelation(s: ProjectState, status: "approved" | "dismissed" = "approved") {
  const relationId = tid<"asset_relation">();
  const next = mustApply(s, {
    type: "AddRelations",
    items: [
      {
        relationId,
        fields: {
          fromAssetId: maja.id,
          toAssetId: anne.id,
          kind: "family",
          label: "Barnebarn og bestemor",
          description: "Bestemor passer på Maja i jula.",
          status,
        },
      },
    ],
  });
  return { s: next, relationId };
}

const asPoster = (doc: PosterDocument, kind: Poster["kind"], lang: "nb" | "en" = "nb"): Poster =>
  ({
    id: tid<"poster">(),
    revision: 1,
    productionId: main.id,
    name: "Test",
    kind,
    language: lang,
    widthMm: 700,
    heightMm: 1000,
    document: doc,
    removed: false,
  }) as Poster;

describe("skriftmål", () => {
  it("bredder fra standardskriftene og ombrekking", () => {
    // Helvetica: «A» er 667/1000
    expect(textWidthPt("A", "sans", 10)).toBeCloseTo(6.67, 2);
    expect(textWidthPt("AA", "sans", 10, 100)).toBeGreaterThan(textWidthPt("AA", "sans", 10));
    expect(winAnsiCode("ø")).toBe(0xf8);
    expect(winAnsiCode("—")).toBe(0x97);
    const lines = wrapPosterText(
      "Maja og bestemor går ut i snøen for å finne nissen",
      "serif",
      24,
      60,
    );
    expect(lines.length).toBeGreaterThan(1);
    for (const l of lines)
      expect(textWidthPt(l, "serif", 24) * (25.4 / 72)).toBeLessThanOrEqual(60.5);
    // Tilpasset størrelse holder seg innenfor grensene
    const size = fitTextSize("JULA PÅ DOVRE", "serifBold", 300, 40, 20, 200, 1, 0);
    expect(size).toBeGreaterThanOrEqual(20);
    expect(size).toBeLessThanOrEqual(200);
  });
});

describe("relasjoner (REQ-0393–0395)", () => {
  it("foreslår familie fra manuset og foreslår ikke kjente par igjen", () => {
    const sug = relationSuggestions(s0, main.id);
    const pair = sug.find(
      (r) => [r.fromAssetId, r.toAssetId].sort().join() === [maja.id, anne.id].sort().join(),
    );
    expect(pair?.kind).toBe("family");
    expect(pair!.together).toBeGreaterThanOrEqual(2);
    // Godkjent eller avvist: ikke foreslått igjen
    for (const status of ["approved", "dismissed"] as const) {
      const { s } = withRelation(s0, status);
      expect(
        relationSuggestions(s, main.id).some(
          (r) => r.fromAssetId === pair!.fromAssetId && r.toAssetId === pair!.toAssetId,
        ),
      ).toBe(false);
    }
  });

  it("kommandoene kontrollerer verdiene, og angring fjerner relasjonen", () => {
    const bad = applyCommand(
      s0,
      envelope({
        type: "AddRelations",
        items: [
          {
            relationId: tid<"asset_relation">(),
            fields: {
              fromAssetId: maja.id,
              toAssetId: maja.id,
              kind: "family",
              label: "",
              description: "",
              status: "approved",
            },
          },
        ],
      }),
    );
    expect(bad.ok).toBe(false);
    const r = applyCommand(
      s0,
      envelope({
        type: "AddRelations",
        items: [
          {
            relationId: tid<"asset_relation">(),
            fields: {
              fromAssetId: maja.id,
              toAssetId: anne.id,
              kind: "care",
              label: " ",
              description: "",
              status: "approved",
            },
          },
        ],
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const back = mustApply(r.state, r.inverse);
    expect(Object.values(back.assetRelations).every((x) => x.removed)).toBe(true);
  });
});

describe("førsteutkast og komposisjon (REQ-0388–0391, REQ-0396)", () => {
  it("kinopitch: tittel, hovedkarakterene og ingen relasjonslinjer", () => {
    const doc = posterDraft(s0, main.id, "pitch");
    expect(posterDocumentError(doc)).toBe(null);
    const ids = doc.elements.map((e) => e.id);
    expect(ids).toContain("title");
    expect(ids).toContain(`char:${maja.id}:img`);
    expect(ids).toContain(`char:${anne.id}:img`);
    expect(doc.elements.some((e) => e.kind === "relation")).toBe(false);
    expect(doc.elements.every((e) => e.auto && e.visible)).toBe(true);
    expect(doc.title.nb).toBe(s0.project.name);
  });

  it("karakterkart: godkjente relasjoner blir linjer mellom portrettene, bak dem", () => {
    const { s, relationId } = withRelation(s0);
    const doc = posterDraft(s, main.id, "character_map");
    const rel = doc.elements.find((e) => e.relationId === relationId)!;
    expect(rel.kind).toBe("relation");
    expect(rel.fromElementId).toBe(`char:${maja.id}:img`);
    expect(rel.toElementId).toBe(`char:${anne.id}:img`);
    expect(rel.text?.nb).toContain("Barnebarn og bestemor");
    const idx = (id: string) => doc.elements.findIndex((e) => e.id === id);
    expect(idx(rel.id)).toBeLessThan(idx(`char:${maja.id}:img`));
    // Uten navngitte relasjoner: bare linjen
    const plain = layoutPoster(s, {
      kind: "character_map",
      widthMm: 700,
      heightMm: 1000,
      productionId: main.id,
      document: {
        ...doc,
        options: { ...doc.options, namedRelations: false, relationTexts: false },
      },
    });
    expect(plain.elements.find((e) => e.id === rel.id)!.text?.nb).toBe("");
  });

  it("nye innholdsvalg lager programmets elementer på nytt, men brukerens endringer står", () => {
    const doc = posterDraft(s0, main.id, "character_map");
    const desc = `char:${maja.id}:desc`;
    const custom: PosterElement = {
      id: "custom:1",
      kind: "text",
      role: "custom",
      x: 10,
      y: 10,
      w: 100,
      h: 20,
      rotation: 0,
      visible: true,
      auto: false,
      text: { nb: "Premiere desember", en: "Premiere in December" },
      size: 30,
    };
    const edited: PosterDocument = {
      ...doc,
      elements: [
        ...doc.elements.map((e) =>
          e.id === "title"
            ? { ...e, auto: false, y: e.y + 50, text: { nb: "EGEN TITTEL", en: "" } }
            : e.id === desc
              ? { ...e, auto: false, text: { nb: "Egen tekst om Maja", en: "" } }
              : e,
        ),
        custom,
      ],
    };
    const re = layoutPoster(s0, {
      kind: "character_map",
      widthMm: 700,
      heightMm: 1000,
      productionId: main.id,
      document: {
        ...edited,
        options: { ...edited.options, imagesAndNamesOnly: true, logline: false },
      },
    });
    const title = re.elements.find((e) => e.id === "title")!;
    expect(title.text?.nb).toBe("EGEN TITTEL");
    expect(title.y).toBe(doc.elements.find((e) => e.id === "title")!.y + 50);
    // Den endrede beskrivelsen er slått av: skjult, ikke slettet
    const d = re.elements.find((e) => e.id === desc)!;
    expect(d.visible).toBe(false);
    expect(d.text?.nb).toBe("Egen tekst om Maja");
    // Programmets beskrivelse av Bestemor Anne er borte, og loglinen likeså
    expect(re.elements.some((e) => e.id === `char:${anne.id}:desc`)).toBe(false);
    expect(re.elements.some((e) => e.id === "logline")).toBe(false);
    // Eget element står
    expect(re.elements.find((e) => e.id === "custom:1")).toEqual(custom);
    // Slått på igjen: beskrivelsen vises
    const on = layoutPoster(s0, {
      kind: "character_map",
      widthMm: 700,
      heightMm: 1000,
      productionId: main.id,
      document: { ...re, options: { ...re.options, imagesAndNamesOnly: false } },
    });
    expect(on.elements.find((e) => e.id === desc)!.text?.nb).toBe("Egen tekst om Maja");
  });

  it("tilpasser seg andre formater (A3 og 50 × 70)", () => {
    for (const [w, h] of [
      [297, 420],
      [500, 700],
    ] as const) {
      const doc = posterDraft(s0, main.id, "character_map", w, h);
      for (const e of doc.elements)
        if (e.kind !== "relation") {
          expect(e.x).toBeGreaterThanOrEqual(-0.01);
          expect(e.x + e.w).toBeLessThanOrEqual(w + 0.01);
          expect(e.y + e.h).toBeLessThanOrEqual(h + 0.01);
        }
    }
  });
});

describe("tegneliste og kontroll (REQ-0392, REQ-0397)", () => {
  it("tekst på engelsk faller tilbake til norsk og meldes", () => {
    const doc = posterDraft(s0, main.id, "pitch");
    const p = asPoster(
      {
        ...doc,
        elements: doc.elements.map((e) =>
          e.id === "title" ? { ...e, text: { nb: "Jula på Dovre", en: "" } } : e,
        ),
      },
      "pitch",
      "en",
    );
    const op = renderPoster(s0, p).find((o) => o.id === "title");
    expect(op?.op).toBe("text");
    if (op?.op !== "text") return;
    expect(op.lines.map((l) => l.text).join(" ")).toContain("JULA PÅ DOVRE");
    expect(
      posterChecks(s0, p).some((c) => c.level === "info" && c.elementIds?.includes("title")),
    ).toBe(true);
    const en = asPoster(
      {
        ...doc,
        elements: doc.elements.map((e) =>
          e.id === "title" ? { ...e, text: { nb: "Jula på Dovre", en: "Christmas at Dovre" } } : e,
        ),
      },
      "pitch",
      "en",
    );
    const op2 = renderPoster(s0, en).find((o) => o.id === "title");
    expect(op2?.op === "text" && op2.lines.map((l) => l.text).join(" ")).toContain("CHRISTMAS");
  });

  it("for liten eller for lang tekst gir advarsel med forslag", () => {
    const doc = posterDraft(s0, main.id, "character_map");
    const long = "Maja er en nysgjerrig jente som elsker snø. ".repeat(40);
    const p = asPoster(
      {
        ...doc,
        options: { ...doc.options, longDescriptions: true, shortDescriptions: false },
        elements: doc.elements.map((e) =>
          e.id === `char:${maja.id}:desc`
            ? { ...e, auto: false, size: 8, text: { nb: long, en: "" } }
            : e,
        ),
      },
      "character_map",
    );
    const warn = posterChecks(s0, p).find(
      (c) => c.level === "warn" && c.text.startsWith("Redusert"),
    );
    expect(warn).toBeTruthy();
    expect(warn!.text).toContain("korte beskrivelser");
    expect(warn!.elementIds).toContain(`char:${maja.id}:desc`);
    expect(minReadablePt(700)).toBe(12);
    expect(minReadablePt(297)).toBeCloseTo(6, 1);
  });

  it("bilder plasseres med «dekk» og «tilpass», og et bilde uten fil blir en tom ramme", () => {
    const version = Object.values(s0.assetVersions).find((v) => v.width && v.height)!;
    const variant = s0.assetVariants[version.variantId]!;
    const el = (fit: "cover" | "contain"): PosterElement => ({
      id: `img:${fit}`,
      kind: "image",
      role: "custom",
      x: 0,
      y: 0,
      w: 100,
      h: 100,
      rotation: 0,
      visible: true,
      auto: false,
      assetId: variant.assetId,
      assetVariantId: null,
      versionId: version.id,
      fit,
    });
    const doc = posterDraft(s0, main.id, "pitch");
    const ops = renderPoster(
      s0,
      asPoster({ ...doc, elements: [el("cover"), el("contain")] }, "pitch"),
    );
    const ar = version.width! / version.height!;
    const [cover, contain] = ops;
    expect(cover?.op).toBe("image");
    if (cover?.op !== "image" || contain?.op !== "image") return;
    expect(cover.clip).toBe(true);
    expect(Math.min(cover.iw, cover.ih)).toBeCloseTo(100);
    expect(Math.max(contain.iw, contain.ih)).toBeCloseTo(100);
    expect(cover.iw / cover.ih).toBeCloseTo(ar);
    expect(cover.mediaPath).toBe(version.mediaPath);
    const none = renderPoster(
      s0,
      asPoster(
        {
          ...doc,
          elements: [
            {
              ...el("cover"),
              assetId: Object.values(s0.assets).find((a) => a.name === "Stua")!.id,
              versionId: null,
            },
          ],
        },
        "pitch",
      ),
    );
    expect(none[0]?.op).toBe("rect");
  });
});

describe("plakatkommandoer", () => {
  it("opprett, endre, fjern og angre; rundtur gjennom databaseradene", () => {
    const { s, relationId } = withRelation(s0);
    const posterId = tid<"poster">();
    const doc = posterDraft(s, main.id, "character_map");
    const fields = {
      productionId: main.id,
      name: "Karakterkart",
      kind: "character_map" as const,
      language: "nb" as const,
      widthMm: 700,
      heightMm: 1000,
      document: doc,
    };
    const r = applyCommand(s, envelope({ type: "CreatePoster", posterId, fields }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(posterAssetRefs(r.state.posters[posterId]!.document).relations.has(relationId)).toBe(
      true,
    );
    const s2 = mustApply(r.state, {
      type: "UpdatePoster",
      posterId,
      fields: { ...fields, name: "Nytt navn", language: "en" },
    });
    expect(s2.posters[posterId]!.name).toBe("Nytt navn");
    // Ugyldig dokument avvises
    expect(
      applyCommand(
        s2,
        envelope({
          type: "UpdatePoster",
          posterId,
          fields: { ...fields, document: { ...doc, palette: { ...doc.palette, text: "rød" } } },
        }),
      ).ok,
    ).toBe(false);
    expect(
      applyCommand(
        s2,
        envelope({ type: "UpdatePoster", posterId, fields: { ...fields, widthMm: 10 } }),
      ).ok,
    ).toBe(false);
    // Rundtur
    const cs = diffStates(emptyProjectState(s2.project), s2);
    const rows = Object.fromEntries(Object.entries(cs.inserts)) as Record<string, unknown[]>;
    const back = stateFromRows({
      project: fixture.project,
      ...rows,
      script_block_revisions: cs.blockRevisions,
    } as never);
    expect(back.posters[posterId]).toEqual(s2.posters[posterId]);
    expect(back.assetRelations[relationId]).toEqual(s2.assetRelations[relationId]);
    // Fjern og angre
    const s3 = mustApply(s2, { type: "SetPosterRemoved", posterId, removed: true });
    expect(s3.posters[posterId]!.removed).toBe(true);
    // Angre opprettelsen
    const u = applyCommand(r.state, envelope(r.inverse));
    expect(u.ok && u.state.posters[posterId]).toBe(undefined);
  });

  it("en ressurs i en relasjon eller på en plakat kan ikke fjernes ved angring", () => {
    const assetId = tid<"asset">();
    const s1 = mustApply(s0, {
      type: "CreateAssets",
      assets: [
        {
          assetId,
          fields: {
            kind: "character",
            name: "Nissen",
            names: [],
            description: "",
            category: "",
            tags: [],
          },
        },
      ],
    } as never);
    const s2 = mustApply(s1, {
      type: "AddRelations",
      items: [
        {
          relationId: tid<"asset_relation">(),
          fields: {
            fromAssetId: assetId,
            toAssetId: maja.id,
            kind: "hidden",
            label: "",
            description: "",
            status: "approved",
          },
        },
      ],
    });
    const r = applyCommand(
      s2,
      envelope({ type: "UndoCreateAssets", assetIds: [assetId] } as never),
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.message).toContain("relasjon");
  });
});

describe("trykk-PDF (REQ-0397)", () => {
  it("gir en gyldig PDF med ekte tekst, utfallende kant, skjæremerker og bilder", async () => {
    const { posterPdf, deflateZlib, pdfString } = await import("@/engine/export/poster-pdf");
    const { bleedOps } = await import("@/core");
    const doc = posterDraft(s0, main.id, "pitch");
    const p = asPoster(
      {
        ...doc,
        elements: doc.elements.map((e) =>
          e.id === "title" ? { ...e, text: { nb: "Jula på Dovre (2026)", en: "" } } : e,
        ),
      },
      "pitch",
    );
    const ops = renderPoster(s0, p);
    const loads: string[] = [];
    const bytes = await posterPdf(
      ops,
      { widthMm: 700, heightMm: 1000, bleedMm: 3, cropMarks: true, title: "Jula på Dovre" },
      async (path, w, h) => {
        loads.push(path);
        const width = Math.max(1, Math.min(w, 4));
        const height = Math.max(1, Math.min(h, 4));
        return {
          width,
          height,
          rgb: new Uint8Array(width * height * 3).fill(200),
          alpha: new Uint8Array(width * height).fill(128),
        };
      },
      deflateZlib,
    );
    const text = new TextDecoder("latin1").decode(bytes);
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text).toContain("/TrimBox");
    expect(text).toContain("/BleedBox");
    expect(text).toContain("/SMask");
    // Kryssreferansene peker på objektene
    const start = Number(/startxref\n(\d+)/.exec(text)![1]);
    expect(text.slice(start, start + 4)).toBe("xref");
    const offsets = [...text.slice(start).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) =>
      Number(m[1]),
    );
    offsets.forEach((o, i) => expect(text.slice(o, o + 12)).toMatch(new RegExp(`^${i + 1} 0 obj`)));
    // pdf.js leser filen: én side i riktig størrelse, og teksten kan hentes ut
    const pdfjs = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as typeof import("pdfjs-dist");
    const pdf = await pdfjs.getDocument({ data: bytes.slice(), useSystemFonts: false }).promise;
    expect(pdf.numPages).toBe(1);
    const page = await pdf.getPage(1);
    const [x0, y0, x1, y1] = page.view;
    expect(((x1! - x0!) * 25.4) / 72).toBeCloseTo(700 + 2 * 13, 0);
    expect(((y1! - y0!) * 25.4) / 72).toBeCloseTo(1000 + 2 * 13, 0);
    const content = await page.getTextContent();
    const all = content.items.map((i) => ("str" in i ? i.str : "")).join("");
    expect(all).toContain("JULA PÅ DOVRE");
    expect(all).toContain("(2026)");
    // Spesialtegn
    expect(pdfString("(ø)\\")).toBe("(\\(\\370\\)\\\\)");
    // Utfallende kant: bakgrunnen går 3 mm utenfor
    const bg = bleedOps(ops, 700, 1000, 3).find((o) => o.id === "bg");
    expect(bg?.op === "rect" && [bg.x, bg.y, bg.w, bg.h]).toEqual([-3, -3, 706, 1006]);
  });
});

describe("rettelser etter gjennomgang (DEC-0061)", () => {
  it("eget element står over bakgrunnen også når elementet foran forsvinner", () => {
    const doc = posterDraft(s0, main.id, "pitch");
    const custom: PosterElement = {
      id: "custom:z",
      kind: "text",
      role: "custom",
      x: 10,
      y: 10,
      w: 100,
      h: 20,
      rotation: 0,
      visible: true,
      auto: false,
      text: { nb: "Egen", en: "" },
    };
    const withCustom = { ...doc, elements: [...doc.elements, custom] };
    const re = layoutPoster(s0, {
      kind: "pitch",
      widthMm: 700,
      heightMm: 1000,
      productionId: main.id,
      document: {
        ...withCustom,
        options: {
          ...withCustom.options,
          projectData: false,
          objectImages: false,
          objectDescriptions: false,
        },
      },
    });
    const ids = re.elements.map((e) => e.id);
    expect(ids.indexOf("custom:z")).toBeGreaterThan(ids.indexOf("bg"));
  });

  it("et flyttet element følger fortsatt innholdet, og «flytt bak» står ved ny komposisjon", () => {
    const doc = posterDraft(s0, main.id, "pitch");
    const moved = {
      ...doc,
      elements: doc.elements.map((e) =>
        e.id === "title" ? { ...e, auto: false, y: e.y + 40, overrides: ["y"] } : e,
      ),
    };
    const re = layoutPoster(s0, {
      kind: "pitch",
      widthMm: 700,
      heightMm: 1000,
      productionId: main.id,
      document: { ...moved, title: { nb: "Ny tittel", en: "New title" } },
    });
    const t = re.elements.find((e) => e.id === "title")!;
    expect(t.text?.nb).toBe("Ny tittel");
    expect(t.y).toBe(doc.elements.find((e) => e.id === "title")!.y + 40);
    // Bak: rett over bakgrunnen, også etter ny komposisjon
    const bgAt = doc.elements.findIndex((e) => e.id === "bg");
    const name = doc.elements.find((e) => e.id === "names")!;
    const back = {
      ...doc,
      elements: [
        ...doc.elements.slice(0, bgAt + 1),
        { ...name, auto: false, overrides: ["z"] },
        ...doc.elements.slice(bgAt + 1).filter((e) => e.id !== "names"),
      ],
    };
    const re2 = layoutPoster(s0, {
      kind: "pitch",
      widthMm: 700,
      heightMm: 1000,
      productionId: main.id,
      document: { ...back, options: { ...back.options, logline: false } },
    });
    expect(re2.elements.findIndex((e) => e.id === "names")).toBe(
      re2.elements.findIndex((e) => e.id === "bg") + 1,
    );
  });

  it("lange ord brytes raskt", () => {
    const t0 = performance.now();
    const lines = wrapPosterText("x".repeat(4000), "serif", 12, 20);
    // Full suite shares CPU with other workers. One second tolerates scheduling noise,
    // but still rejects the former multi-second/quadratic long-word regression.
    expect(performance.now() - t0).toBeLessThan(1000);
    expect(lines.join("")).toBe("x".repeat(4000));
  });

  it("angret relasjon slettes, så ressursen kan angres; samme relasjon to ganger avvises", () => {
    const assetId = tid<"asset">();
    const s1 = mustApply(s0, {
      type: "CreateAssets",
      assets: [
        {
          assetId,
          fields: {
            kind: "character",
            name: "Nissen",
            names: [],
            description: "",
            category: "",
            tags: [],
          },
        },
      ],
    } as never);
    const fields = {
      fromAssetId: assetId,
      toAssetId: maja.id,
      kind: "hidden" as const,
      label: "",
      description: "",
      status: "approved" as const,
    };
    const r = applyCommand(
      s1,
      envelope({ type: "AddRelations", items: [{ relationId: tid<"asset_relation">(), fields }] }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Samme par og type igjen (andre veien): avvist
    expect(
      applyCommand(
        r.state,
        envelope({
          type: "AddRelations",
          items: [
            {
              relationId: tid<"asset_relation">(),
              fields: { ...fields, fromAssetId: maja.id, toAssetId: assetId },
            },
          ],
        }),
      ).ok,
    ).toBe(false);
    const undone = mustApply(r.state, r.inverse);
    expect(Object.keys(undone.assetRelations)).toHaveLength(0);
    expect(
      applyCommand(undone, envelope({ type: "UndoCreateAssets", assetIds: [assetId] } as never)).ok,
    ).toBe(true);
  });

  it("en fjernet relasjon tegnes ikke; ugyldige felt avvises; produksjon med plakat kan ikke angres", () => {
    const { s, relationId } = withRelation(s0);
    const doc = posterDraft(s, main.id, "character_map");
    const off = mustApply(s, {
      type: "SetRelationsRemoved",
      relationIds: [relationId],
      removed: true,
    });
    const p = asPoster(doc, "character_map");
    expect(renderPoster(s, p).some((o) => o.id === `rel:${relationId}`)).toBe(true);
    expect(renderPoster(off, p).some((o) => o.id === `rel:${relationId}`)).toBe(false);
    const bad = (patch: Record<string, unknown>) =>
      posterDocumentError({
        ...doc,
        elements: doc.elements.map((e, i) => (i === 1 ? ({ ...e, ...patch } as PosterElement) : e)),
      });
    expect(bad({ role: { x: 1 } })).not.toBe(null);
    expect(bad({ tracking: "mye" })).not.toBe(null);
    expect(bad({ lineHeight: 99 })).not.toBe(null);
    expect(bad({ hemmelig: 1 })).not.toBe(null);
    expect(bad({ overrides: ["x", "z"] })).toBe(null);
  });
});
