// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ExportQueue } from "@/app/assembly/export-queue";
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
describe("Shared browser export queue", () => {
  it("runs serially, keeps progress, and survives the submitting view", async () => {
    const queue = new ExportQueue(), order: string[] = [];
    let release: (() => void) | undefined;
    queue.enqueue("film", async (_signal, progress) => { order.push("film"); progress(2,4); await new Promise<void>(resolve => { release=resolve; }); });
    queue.enqueue("alpha", async () => { order.push("alpha"); });
    expect(queue.snapshot().map(t=>t.status)).toEqual(["running","queued"]);
    expect(queue.snapshot()[0]?.done).toBe(2);
    release?.(); await tick();
    expect(order).toEqual(["film","alpha"]);
    expect(queue.snapshot().map(t=>t.status)).toEqual(["done","done"]);
  });
  it("never starts a cancelled waiting export", async () => {
    const queue = new ExportQueue(); let release:(()=>void)|undefined, started=false;
    queue.enqueue("first", async()=>new Promise<void>(resolve=>{release=resolve;}));
    const id=queue.enqueue("cancelled",async()=>{started=true;}); queue.cancel(id); release?.(); await tick();
    expect(started).toBe(false); expect(queue.snapshot()[1]?.status).toBe("cancelled");
  });
  it("cancellation remains terminal even when a running encoder resolves", async () => {
    const queue=new ExportQueue(); let release:(()=>void)|undefined;
    const id=queue.enqueue("alpha",async()=>new Promise<void>(resolve=>{release=resolve;})); queue.cancel(id); release?.(); await tick();
    expect(queue.snapshot()[0]?.status).toBe("cancelled");
  });
  it("one failed encoder does not block the next export", async () => {
    const queue=new ExportQueue(); queue.enqueue("bad",async()=>{throw new Error("encoder failed");}); queue.enqueue("good",async()=>{}); await tick();
    expect(queue.snapshot().map(t=>t.status)).toEqual(["failed","done"]);
  });
});
