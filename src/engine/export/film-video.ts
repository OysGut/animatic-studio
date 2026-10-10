/**
 * Bilder fra importert film til eksporten (DEC-0047): filene leses med mediabunny (WebCodecs) og dekodes i
 * rekkefølge, så hvert bilde bare dekodes én gang. Bare på klienten.
 */
import { frameMix, sourceAt, type FilmClip, type ProjectState, type Take } from "@/core";
import type { ImageSource } from "../compositor/canvas";

type Mb = typeof import("mediabunny");
type Wrapped = { canvas: HTMLCanvasElement | OffscreenCanvas; timestamp: number; duration: number };

class TakeReader {
  private it: AsyncGenerator<Wrapped, void, unknown> | null = null;
  private current: Wrapped | null = null;
  private next: Wrapped | null = null;
  private last = -1;
  constructor(
    private readonly sink: { canvases(start?: number): AsyncGenerator<Wrapped, void, unknown> },
  ) {}

  async at(t: number): Promise<Wrapped | null> {
    // Bakover, eller et langt hopp fram (ny del lenger ut i filen): start lesingen på nytt der
    if (!this.it || t < this.last || t > this.last + 2) {
      await this.it?.return();
      this.it = this.sink.canvases(t);
      this.current = (await this.it.next()).value ?? null;
      this.next = (await this.it.next()).value ?? null;
    }
    while (this.next && this.next.timestamp <= t + 1e-6) {
      this.current = this.next;
      this.next = (await this.it.next()).value ?? null;
    }
    this.last = t;
    return this.current;
  }

  async close() {
    await this.it?.return();
  }
}

export class FilmVideoFrames {
  private readonly readers = new Map<string, TakeReader | null>();
  private readonly frame = new Map<string, ImageSource>();
  private readonly slots: (OffscreenCanvas | undefined)[] = [];
  private readonly inputs: { dispose?: () => void }[] = [];
  constructor(
    private readonly mb: Mb,
    /** Mediesti → signert lenke. */
    private readonly urls: Readonly<Record<string, string>>,
  ) {}

  private async reader(take: Take): Promise<TakeReader | null> {
    // Én leser per fil: flere versjoner kan dele samme fil (lang film fordelt på scener)
    const key = take.mediaRef ?? take.id;
    if (this.readers.has(key)) return this.readers.get(key)!;
    let r: TakeReader | null = null;
    const url = take.mediaRef ? this.urls[take.mediaRef] : undefined;
    if (url) {
      try {
        const input = new this.mb.Input({
          source: new this.mb.UrlSource(url),
          formats: this.mb.ALL_FORMATS,
        });
        this.inputs.push(input as unknown as { dispose?: () => void });
        const track = await input.getPrimaryVideoTrack();
        if (track && (await track.canDecode())) {
          const sink = new this.mb.CanvasSink(track, { poolSize: 3 });
          r = new TakeReader(sink as never);
        }
      } catch {
        r = null;
      }
    }
    this.readers.set(key, r);
    return r;
  }

  /** Henter bildene som trengs for bildet `frame` i filmen (før det tegnes). */
  async prepare(state: ProjectState, clips: readonly FilmClip[], frame: number): Promise<void> {
    this.frame.clear();
    const m = frameMix(clips, frame);
    if (!m) return;
    for (const cf of [m.a, m.b]) {
      if (!cf) continue;
      const src = sourceAt(cf.clip, cf.localFrame, state.project.fps);
      if (src.kind !== "take") continue;
      const r = await this.reader(src.take);
      const w = await r?.at(src.seconds);
      if (w) {
        // Kopier bildet: to klipp fra samme fil (overgang) deler leser og bildebuffer
        const slot = (this.slots[cf === m.a ? 0 : 1] ??= new OffscreenCanvas(1, 1));
        if (slot.width !== w.canvas.width) slot.width = w.canvas.width;
        if (slot.height !== w.canvas.height) slot.height = w.canvas.height;
        const g = slot.getContext("2d");
        g?.clearRect(0, 0, slot.width, slot.height);
        g?.drawImage(w.canvas as CanvasImageSource, 0, 0);
        this.frame.set(src.take.id, slot as unknown as ImageSource);
      }
    }
  }

  /** Til drawFilmFrame: bildet som ble hentet for denne versjonen. */
  readonly provider = (take: Take): ImageSource | null => this.frame.get(take.id) ?? null;

  /** Takes som ikke kunne leses (vises som svart i eksporten). */
  failed(): string[] {
    return [...this.readers.entries()].filter(([, r]) => r === null).map(([id]) => id);
  }

  async close(): Promise<void> {
    for (const r of this.readers.values()) await r?.close();
    for (const i of this.inputs) i.dispose?.();
  }
}
