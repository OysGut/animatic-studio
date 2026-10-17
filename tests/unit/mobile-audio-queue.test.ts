/**
 * Bolk B (REQ-0687/0689): lydopptak på mobilen sendes aldri av seg selv. Bare de valgte sendes; et feilet
 * opptak kan sendes på nytt uten nytt opptak, og et lokalt opptak kan forkastes.
 */
import { describe, expect, it } from "vitest";
import { UploadQueue, Uploader } from "@/app/mobile/upload-queue";

function setup(failFirst = false) {
  const q = new UploadQueue("tok");
  const sent: string[] = [];
  let fails = failFirst ? 1 : 0;
  const up = new Uploader(q, {
    ticket: () => Promise.resolve({ ok: true, message: "", path: "p", uploadToken: "u" }),
    put: () => Promise.resolve(null),
    confirm: (it) => {
      if (fails > 0) {
        fails--;
        return Promise.resolve({ ok: false, message: "Feil på serveren" });
      }
      sent.push(it.name);
      return Promise.resolve({ ok: true, message: "" });
    },
  });
  return { q, up, sent };
}
const tick = () => new Promise((r) => setTimeout(r, 0));
const blob = () => new Blob([new Uint8Array(10)], { type: "audio/webm" });

describe("lydopptak på mobilen", () => {
  it("lokale takes sendes ikke før de velges, og bare de valgte sendes", async () => {
    const { q, up, sent } = setup();
    const a = q.add(blob(), "take-01.webm", { local: true, durationMs: 12_000 });
    const b = q.add(blob(), "take-02.webm", { local: true, durationMs: 14_000 });
    up.pump();
    await tick();
    expect(sent).toEqual([]);
    expect(q.local()).toBe(2);
    q.send([a.id]);
    up.pump();
    for (let i = 0; i < 5; i++) await tick();
    expect(sent).toEqual(["take-01.webm"]);
    expect(q.list().find((x) => x.id === b.id)?.status).toBe("local");
    q.send([b.id]);
    up.pump();
    for (let i = 0; i < 5; i++) await tick();
    expect(sent).toEqual(["take-01.webm", "take-02.webm"]);
  });

  it("et feilet opptak sendes på nytt uten nytt opptak; et lokalt kan forkastes", async () => {
    const { q, up, sent } = setup(true);
    const a = q.add(blob(), "take-01.webm", { local: true });
    const b = q.add(blob(), "take-02.webm", { local: true });
    q.send([a.id]);
    up.pump();
    for (let i = 0; i < 5; i++) await tick();
    expect(q.list().find((x) => x.id === a.id)?.status).toBe("failed");
    q.send([a.id]);
    up.pump();
    for (let i = 0; i < 5; i++) await tick();
    expect(sent).toEqual(["take-01.webm"]);
    q.remove(b.id);
    expect(q.list().map((x) => x.id)).toEqual([a.id]);
    // Et sendt opptak kan ikke forkastes
    q.remove(a.id);
    expect(q.list()).toHaveLength(1);
  });

  it("opplasting virker etter stop() og start() (effekten monteres på nytt, KI-249)", async () => {
    const { q, up, sent } = setup();
    const a = q.add(blob(), "Take 01.webm", { local: true });
    q.send([a.id]);
    up.stop();
    up.pump();
    for (let i = 0; i < 5; i++) await tick();
    // Stoppet instans sender ingenting: opptaket blir værende i køen
    expect(sent).toEqual([]);
    expect(q.list().find((x) => x.id === a.id)?.status).toBe("queued");
    up.start();
    q.send([a.id]);
    up.pump();
    for (let i = 0; i < 5; i++) await tick();
    expect(sent).toEqual(["Take 01.webm"]);
    expect(q.list().find((x) => x.id === a.id)?.status).toBe("sent");
  });
});
