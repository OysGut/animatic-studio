import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { example } from "../fixtures/ptg6/generate";
import { editorialClip, editorialEdl, editorialFiles, editorialFrames, editorialOtio, editorialShots, editorialXml } from "@/core/interchange/editorial";
import { filmClips } from "@/core/assembly/film";

describe("PTG6 klippefiler", () => {
  for (const [label, fps, twos, length] of [["24", 24, false, 43], ["25", 25, false, 45], ["30", 30, false, 54], ["twos", 24, true, 43]] as const) {
    it(`${label}: gyldne tidskoder, lengder og filer`, () => {
      const { doc } = example(fps, twos);
      expect(doc.lengthFrames).toBe(length);
      expect(doc.shots.reduce((n, s) => n + s.lengthFrames, 0)).toBe(length);
      for (const file of editorialFiles(doc)) expect(new TextDecoder().decode(file.data)).toBe(readFileSync(`tests/fixtures/ptg6/${label}.${file.path.split(".").pop()}`, "utf8"));
      const otio = JSON.parse(editorialOtio(doc));
      expect(otio.OTIO_SCHEMA).toBe("Timeline.1"); expect(otio.tracks.OTIO_SCHEMA).toBe("Stack.1");
      const [video, audio] = otio.tracks.children;
      expect(video.kind).toBe("Video"); expect(audio.kind).toBe("Audio");
      for (const track of [video, audio]) {
        const clips = track.children.filter((c: { OTIO_SCHEMA: string }) => c.OTIO_SCHEMA === "Clip.2");
        expect(clips.reduce((n: number, c: { source_range: { duration: { value: number } } }) => n + c.source_range.duration.value, 0)).toBe(length);
        clips.forEach((c: typeof video.children[number], i: number) => {
          expect(c.name).toBe(doc.shots[i]?.name);
          expect(c.source_range.duration.rate).toBe(fps);
          expect(c.active_media_reference_key).toBe("DEFAULT_MEDIA");
          expect(c.media_references.DEFAULT_MEDIA.OTIO_SCHEMA).toBe("ExternalReference.1");
          expect(c.media_references.DEFAULT_MEDIA.target_url).not.toMatch(/^\/|https?:/);
          expect(c.source_range.start_time.value).toBe(doc.shots[i]?.handleIn);
        });
      }
      const transition = video.children[1];
      expect(transition.OTIO_SCHEMA).toBe("Transition.1");
      expect(transition.in_offset.value + transition.out_offset.value).toBe(doc.shots[1]?.transition.lengthFrames);
    });
  }
  it("24 fps: fem bilders overgang har klipp 22, håndtak 3/2 og NDF slutt 01:19", () => {
    const { doc } = example();
    expect(doc.shots.map(s => [s.startFrame, s.lengthFrames, s.handleIn, s.handleOut])).toEqual([[0, 22, 0, 2], [22, 21, 3, 0]]);
    expect(doc.shots[1]?.timecodeOut).toBe("00:00:01:19");
  });
  it("CMX 3600 har faste kolonner, unike reelnavn på åtte tegn og dissolve-par", () => {
    const { doc } = example(); const text = editorialEdl(doc);
    const events = text.split(/\r?\n/).filter(l => /^\d/.test(l));
    expect(events).toHaveLength(3);
    for (const line of events) {
      expect(line).toMatch(/^\d{3}  [A-Z0-9 ]{8} V     (C {8}|D \d{3} {4})(\d{2}:\d{2}:\d{2}:\d{2} ){3}\d{2}:\d{2}:\d{2}:\d{2}$/);
      expect(line.slice(29, 40)).toMatch(/^\d{2}:\d{2}:\d{2}:\d{2}$/);
    }
    expect(events[2]?.slice(20, 25)).toBe("D 005");
    const shots = editorialShots(doc);
    expect(shots.map(s => s.reel)).toEqual(["PTG6TEST", "PTG6TES1"]);
    expect(editorialShots(doc)).toEqual(shots);
    for (const s of shots) expect(text).toContain(`* FROM CLIP NAME: ${s.shot.name}`);
  });
  it("XML er gyldig xmeml v5 med to spor, relative filer og klipp som summerer til filmen", () => {
    const { doc } = example(25);
    const parsed = new DOMParser().parseFromString(editorialXml(doc), "application/xml");
    expect(parsed.querySelector("parsererror")).toBeNull();
    expect(parsed.documentElement.tagName).toBe("xmeml"); expect(parsed.documentElement.getAttribute("version")).toBe("5");
    expect(parsed.querySelector("sequence > name")?.textContent).toBe("PTG6 & test");
    expect(parsed.querySelector("sequence > duration")?.textContent).toBe("45");
    expect(parsed.querySelector("sequence > rate > timebase")?.textContent).toBe("25");
    expect(parsed.querySelector("sequence > rate > ntsc")?.textContent).toBe("FALSE");
    expect(parsed.querySelectorAll("sequence > media > video > track")).toHaveLength(1);
    expect(parsed.querySelectorAll("sequence > media > audio > track")).toHaveLength(1);
    const video = [...parsed.querySelectorAll("video > track > clipitem")];
    expect(video.reduce((n, c) => n + Number(c.querySelector("end")?.textContent) - Number(c.querySelector("start")?.textContent), 0)).toBe(45);
    expect(parsed.querySelectorAll("transitionitem")).toHaveLength(1);
    expect([...parsed.querySelectorAll("pathurl")].every(p => !p.textContent?.startsWith("/"))).toBe(true);
  });
  it("NTSC-rate beskrives som timebase 30 / ntsc TRUE uten drop-frame", () => {
    const { doc } = example();
    const text = editorialXml({ ...doc, fps: { num: 30000, den: 1001 } });
    expect(text).toContain("<timebase>30</timebase><ntsc>TRUE</ntsc>"); expect(text).toContain("<displayformat>NDF</displayformat>");
  });
  it("referansebilder på toere gjentas, men videoen har alle bilder og ingen bakt overgang", () => {
    const { doc, state, mainId } = example(24, true);
    const clips = filmClips(state, mainId);
    const shot = doc.shots[1]; if (!shot) throw new Error("fixture");
    const frames = editorialFrames(doc, shot);
    expect(frames).toHaveLength(24); expect(frames[4]).toBe(frames[3]);
    const isolated = editorialClip(clips, shot);
    expect(isolated).toHaveLength(1); expect(isolated[0]?.transition.kind).toBe("cut"); expect(isolated[0]?.overlapFrames).toBe(0);
    expect(clips[1]?.transition.kind).toBe("dissolve");
  });
  it("aktiv take beholdes i isolert klipp, øvrige skudd beholder animatic", () => {
    const { doc, state, mainId } = example(); const clips = filmClips(state, mainId);
    const a = clips[0], b = clips[1], shot = doc.shots[0]; if (!a || !b || !shot) throw new Error("fixture");
    const take = { id: "synthetic", mediaRef: "take.mp4" } as unknown as NonNullable<typeof a.take>;
    const active = { ...a, source: "film" as const, take, parts: a.parts.map(p => ({ ...p, source: "take" as const, take })) };
    expect(editorialClip([active, b], shot)[0]?.parts[0]?.take?.mediaRef).toBe("take.mp4");
    const other = doc.shots[1]; if (!other) throw new Error("fixture");
    expect(editorialClip([active, b], other)[0]?.take).toBeNull();
  });
});