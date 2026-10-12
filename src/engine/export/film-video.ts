/**
 * Bilder fra importert film til eksporten (DEC-0047): filene leses med mediabunny (WebCodecs) og dekodes i
 * rekkefølge, så hvert bilde bare dekodes én gang. Bare på klienten.
 */
import {
  frameMix,
  partBlendAt,
  sourceAt,
  type FilmClip,
  type ProjectState,
  type SourceFrame,
  type Take,
} from "@/core";
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

  private async reader(take: Take, slot: number): Promise<TakeReader | null> {
    // Én leser per fil og plass i overgangen: flere versjoner kan dele samme fil (lang film fordelt på
    // scener), og i en overgang mellom to slike scener leses filen to steder samtidig (DEC-0051)
    const key = `${take.mediaRef ?? take.id}#${slot}`;
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

  private readonly stills = new Map<string, Promise<ImageBitmap | null>>();
  private readonly failedStills = new Set<string>();

  private still(take: Take): Promise<ImageBitmap | null> {
    const path = take.mediaRef ?? "";
    let p = this.stills.get(path);
    if (!p) {
      const url = this.urls[path];
      p = url
        ? fetch(url)
            .then((r) => (r.ok ? r.blob() : null))
            .then((b) => (b ? createImageBitmap(b) : null))
            .catch(() => null)
        : Promise.resolve(null);
      void p.then((bmp) => {
        if (!bmp) this.failedStills.add(path);
      });
      this.stills.set(path, p);
    }
    return p;
  }

  /** Henter bildene som trengs for bildet `frame` i filmen (før det tegnes). */
  async prepare(state: ProjectState, clips: readonly FilmClip[], frame: number): Promise<void> {
    this.frame.clear();
    const m = frameMix(clips, frame);
    if (!m) return;
    const fps = state.project.fps;
    for (const cf of [m.a, m.b]) {
      if (!cf) continue;
      const base = cf === m.a ? 0 : 1;
      // Delen som vises, og en myk overgang mellom deler i scenen (DEC-0071) på plass 2/3
      const blend = partBlendAt(cf.clip, cf.localFrame, fps);
      const wanted: [SourceFrame, number][] = [[sourceAt(cf.clip, cf.localFrame, fps), base]];
      if (blend) wanted.push([blend.source, base + 2]);
      for (const [src, slotNo] of wanted) {
        if (src.kind !== "take") continue;
        if (src.take.kind === "still") {
          // Stillbilde (DEC-0072): lest én gang og brukt på alle bildene
          const bmp = await this.still(src.take);
          if (bmp) this.frame.set(`${src.take.id}#${slotNo}`, bmp as unknown as ImageSource);
          continue;
        }
        const r = await this.reader(src.take, slotNo);
        const w = await r?.at(src.seconds);
        if (w) {
          // Kopier bildet: to klipp fra samme fil (overgang) deler leser og bildebuffer
          const slot = (this.slots[slotNo] ??= new OffscreenCanvas(1, 1));
          if (slot.width !== w.canvas.width) slot.width = w.canvas.width;
          if (slot.height !== w.canvas.height) slot.height = w.canvas.height;
          const g = slot.getContext("2d");
          g?.clearRect(0, 0, slot.width, slot.height);
          g?.drawImage(w.canvas as CanvasImageSource, 0, 0);
          this.frame.set(`${src.take.id}#${slotNo}`, slot as unknown as ImageSource);
        }
      }
    }
  }

  /** Til drawFilmFrame: bildet som ble hentet for denne versjonen på denne plassen. */
  readonly provider = (
    take: Take,
    _seconds?: number,
    _held?: boolean,
    slot = 0,
  ): ImageSource | null =>
    this.frame.get(`${take.id}#${slot}`) ??
    // Plass 2–3 er et holdt bilde i en myk overgang: mangler det, tones ingenting inn (aldri bildet over seg selv)
    (slot >= 2 ? null : (this.frame.get(`${take.id}#0`) ?? null));

  /** Takes som ikke kunne leses (vises som svart i eksporten). */
  failed(): string[] {
    return [
      ...new Set([
        ...[...this.readers.entries()].filter(([, r]) => r === null).map(([k]) => k.split("#")[0]!),
        ...this.failedStills,
      ]),
    ];
  }

  async close(): Promise<void> {
    for (const p of this.stills.values()) (await p)?.close();
    for (const r of this.readers.values()) await r?.close();
    for (const i of this.inputs) i.dispose?.();
  }
}
