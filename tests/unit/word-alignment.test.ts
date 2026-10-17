/**
 * Fase 2, bolk D (DEC-0095, REQ-0698–0704): ord-til-lyd. Tjenestens ord pares med manusets ord (også når
 * tjenesten mangler eller har ekstra ord), markering av ett eller flere ord gir riktig tidsrom, retting for
 * hånd, endret og ny tekst oppdages, forslag til plassering, tid gjennom en komposisjon, status for tekst mot
 * lyd, og kjernens kontroll av koblingen.
 */
import { describe, expect, it, vi } from "vitest";
import {
  alignmentError,
  alignmentFromProvider,
  applyCommand,
  compositionFromTake,
  compositionToSource,
  insertTake,
  lineAudioStatus,
  manualAlignment,
  rangeForWords,
  setWordTiming,
  sourceToComposition,
  suggestPlacement,
  textChanges,
  tokenizeLine,
  wordUncertain,
  type Command,
  type ProjectState,
} from "@/core";
import { envelope } from "../helpers/fixtures";
import { fixture } from "../visual/fixture-state";

const AT = "2026-10-17T10:00:00Z";
const TEXT = "Jeg tror det er noen der ute.";
// Slik tjenesten svarer (sekunder); «det» mangler, og et ekstra ord er med
const FOUND = [
  { text: "Jeg", start: 0.1, end: 0.3, loss: 0.2 },
  { text: "tror", start: 0.32, end: 0.6, loss: 0.3 },
  { text: "eh", start: 0.6, end: 0.7, loss: 2.0 },
  { text: "er", start: 0.8, end: 0.9, loss: 0.2 },
  { text: "noen", start: 0.95, end: 1.3, loss: 0.1 },
  { text: "der", start: 1.35, end: 1.5, loss: 0.2 },
  { text: "ute.", start: 1.55, end: 1.9, loss: 0.3 },
];

describe("ord-til-lyd", () => {
  it("manusets ord pares med tjenestens; ord som mangler, blir usikre", () => {
    expect(tokenizeLine(TEXT).map((t) => t.norm)).toEqual([
      "jeg",
      "tror",
      "det",
      "er",
      "noen",
      "der",
      "ute",
    ]);
    const a = alignmentFromProvider(
      "b",
      TEXT,
      FOUND,
      "elevenlabs",
      "elevenlabs/forced-alignment",
      0.3,
      AT,
    );
    expect(a.words.map((w) => w.text)).toEqual(TEXT.split(" "));
    expect(a.words[0]).toMatchObject({ startMs: 100, endMs: 300 });
    expect(a.words[2]).toMatchObject({ text: "det", startMs: null });
    expect(wordUncertain(a.words[2]!)).toBe(true);
    expect(wordUncertain(a.words[4]!)).toBe(false);
    expect(alignmentError(a)).toBeNull();
  });

  it("T1/T2: ett ord gir sitt tidsrom, flere ord gir det samlede", () => {
    const a = alignmentFromProvider("b", TEXT, FOUND, "elevenlabs", "m", null, AT);
    expect(rangeForWords(a, 4, 4)).toEqual({ startMs: 950, endMs: 1300 });
    expect(rangeForWords(a, 4, 6)).toEqual({ startMs: 950, endMs: 1900 });
    expect(rangeForWords(a, 2, 2)).toBeNull();
  });

  it("manuell kobling virker uten analyse (REQ-0698)", () => {
    const m = manualAlignment("b", TEXT, AT);
    expect(m.words.every((w) => w.startMs === null)).toBe(true);
    const r = setWordTiming(m, 2, 700, 780);
    expect(r.words[2]).toMatchObject({ startMs: 700, endMs: 780, manual: true });
    expect(wordUncertain(r.words[2]!)).toBe(false);
    expect(alignmentError(r)).toBeNull();
    expect(alignmentError({ ...r, words: r.words.slice(1) })).not.toBeNull();
  });

  it("T4–T6: ny og endret tekst oppdages, og det nye opptaket får forslag til plassering", () => {
    const a = alignmentFromProvider("b", TEXT, FOUND, "elevenlabs", "m", null, AT);
    const added = `${TEXT} Vi må gå og se.`;
    const ch = textChanges(a.text, added);
    expect(ch.filter((c) => c.change === "new").map((c) => c.token.text)).toEqual([
      "Vi",
      "må",
      "gå",
      "og",
      "se.",
    ]);
    expect(suggestPlacement(a, added, { from: 7, to: 11 })).toEqual({ mode: "after" });
    // «noen» byttet med «noe»: forslaget er tidsrommet mellom nabordene
    const changed = "Jeg tror det er noe der ute.";
    expect(
      textChanges(a.text, changed)
        .filter((c) => c.change === "new")
        .map((c) => c.token.text),
    ).toEqual(["noe"]);
    expect(suggestPlacement(a, changed, { from: 4, to: 4 })).toEqual({
      mode: "range",
      startMs: 900,
      endMs: 1350,
    });
    expect(suggestPlacement(a, `Hei! ${TEXT}`, { from: 0, to: 0 })).toEqual({ mode: "before" });
  });

  it("tider i et opptak følger med gjennom en komposisjon", () => {
    const A = { versionId: "00000000-0000-7000-8000-00000000a001", durationMs: 4000 };
    const B = { versionId: "00000000-0000-7000-8000-00000000b001", durationMs: 1000 };
    let n = 0;
    const id = () => `00000000-0000-7000-8000-${String(++n).padStart(12, "0")}`;
    const c = insertTake(compositionFromTake(A, id), B, "before", id);
    expect(sourceToComposition(c, A.versionId, 950)).toBe(1950);
    expect(compositionToSource(c, 1950)).toEqual({ versionId: A.versionId, ms: 950 });
    expect(compositionToSource(c, 500)).toEqual({ versionId: B.versionId, ms: 500 });
  });
});

describe("i prosjektet", () => {
  function line(s: ProjectState) {
    const clip = Object.values(s.audioClips).find(
      (a) => !a.removed && a.kind === "dialogue" && a.blockId && !a.language,
    )!;
    return { clip, block: s.blocks[clip.blockId!]! };
  }
  it("koblingen lagres på opptaket, kan angres, og status følger teksten (REQ-0703)", () => {
    let s: ProjectState = fixture.state;
    const run = (c: Command) => {
      const r = applyCommand(s, envelope(c));
      if (!r.ok) throw new Error(r.error.message);
      s = r.state;
      return r;
    };
    const { clip, block } = line(s);
    const v = Object.values(s.assetVersions).find(
      (x) => s.assetVariants[x.variantId]!.assetId === clip.assetId,
    )!;
    expect(lineAudioStatus(s, clip.occurrenceId, block.id)).not.toBe("no_audio");
    const al = manualAlignment(block.id, block.text, AT);
    const r = run({ type: "SetVersionAlignment", versionId: v.id, alignment: al });
    expect(s.assetVersions[v.id]!.alignment).toEqual(al);
    // Endret tekst etter analysen: «endret tekst med gammel lyd»
    run({
      type: "EditBlockText",
      productionId: Object.values(s.productions).find((p) => p.kind === "main")!.id as never,
      blockId: block.id as never,
      text: `${block.text} Vi må gå og se.`,
    });
    expect(lineAudioStatus(s, clip.occurrenceId, block.id)).toBe("changed_text");
    // Angre koblingen
    const u = applyCommand(s, envelope(r.inverse as Command));
    expect(u.ok && u.state.assetVersions[v.id]!.alignment).toBeUndefined();
    // En replikk uten lyd
    const silent = Object.values(s.blocks).find(
      (b) => b.kind === "dialogue" && !Object.values(s.audioClips).some((a) => a.blockId === b.id),
    )!;
    const occ = Object.values(s.occurrences).find((o) => o.variantId === silent.variantId)!;
    expect(lineAudioStatus(s, occ.id, silent.id)).toBe("no_audio");
  });

  it("bare lydopptak kan ha kobling, og koblingen må gjelde en replikk som finnes", () => {
    const s = fixture.state;
    const img = Object.values(s.assetVersions).find((x) => x.mimeType.startsWith("image/"))!;
    const r = applyCommand(
      s,
      envelope({
        type: "SetVersionAlignment",
        versionId: img.id,
        alignment: manualAlignment(Object.keys(s.blocks)[0]!, "x", AT),
      }),
    );
    expect(r.ok).toBe(false);
    const { clip } = line(s);
    const v = Object.values(s.assetVersions).find(
      (x) => s.assetVariants[x.variantId]!.assetId === clip.assetId,
    )!;
    const r2 = applyCommand(
      s,
      envelope({
        type: "SetVersionAlignment",
        versionId: v.id,
        alignment: manualAlignment("00000000-0000-7000-8000-0000000fffff", "x", AT),
      }),
    );
    expect(r2.ok).toBe(false);
  });
});

describe("ElevenLabs-adapteren", () => {
  it("sender opptak og tekst som skjema og leser ord, tider og usikkerhet", async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const form = init.body as FormData;
      expect(form.get("text")).toBe(TEXT);
      expect((init.headers as Record<string, string>)["xi-api-key"]).toBe("k");
      return new Response(
        JSON.stringify({ words: [...FOUND, { text: " ", start: "x" }], loss: 0.4 }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const { ADAPTERS } = await import("@/adapters/ai/providers.server");
    const out = await ADAPTERS.elevenlabs.align({
      key: "k",
      audio: new Blob(["x"]),
      fileName: "a.wav",
      text: TEXT,
    });
    expect(fetchMock.mock.calls[0]![0]).toBe("https://api.elevenlabs.io/v1/forced-alignment");
    expect(out.words).toHaveLength(FOUND.length);
    expect(out.loss).toBe(0.4);
    vi.unstubAllGlobals();
  });
});
