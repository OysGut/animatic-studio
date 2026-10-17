/**
 * Opplastingskøen på mobilen (fase 2, bolk A, DEC-0090, REQ-0673/0680): hver fil får en ID på telefonen og legges
 * i IndexedDB, så den overlever brutt nett og at siden lastes på nytt. Filene sendes én og én (to samtidig) og
 * bekreftes av serveren; samme ID sendt på nytt gir aldri en ny fil.
 */
import { L, newId } from "@/core";

/**
 * «local»: et lydopptak som bare ligger på telefonen til brukeren velger å sende det (bolk B, REQ-0687) – lyd
 * lastes aldri opp av seg selv når opptaket stopper.
 */
export type QueueStatus = "local" | "queued" | "uploading" | "sent" | "failed";

export interface QueueItem {
  readonly id: string;
  /** Tokenet for økten filen hører til (en telefon kan ha flere økter). */
  readonly session: string;
  readonly name: string;
  readonly mime: string;
  readonly size: number;
  readonly blob: Blob;
  readonly status: QueueStatus;
  readonly error?: string;
  readonly addedAt: number;
  /** Lengden på et lydopptak (ms). */
  readonly durationMs?: number;
  /** Ren romlyd (REQ-0690). */
  readonly roomTone?: boolean;
}

const DB_NAME = "animatic-mobilimport"; // i18n-ignore
const STORE = "files";

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE))
          req.result.createObjectStore(STORE, { keyPath: "id" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/** Køen i minnet, speilet i IndexedDB når nettleseren tillater det. */
export class UploadQueue {
  private items = new Map<string, QueueItem>();
  private db: IDBDatabase | null = null;
  private listeners = new Set<() => void>();
  /** Lagres køen varig på telefonen? (Nei i noen private vinduer.) */
  persistent = false;

  constructor(private readonly session: string) {}

  async load(): Promise<void> {
    this.db = await openDb();
    this.persistent = !!this.db;
    if (!this.db) return;
    const all = await new Promise<QueueItem[]>((resolve) => {
      const tx = this.db!.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve((req.result ?? []) as QueueItem[]);
      req.onerror = () => resolve([]);
    });
    for (const it of all)
      if (it.session === this.session)
        // En opplasting som ble avbrutt da siden ble lukket, prøves på nytt
        this.items.set(it.id, it.status === "uploading" ? { ...it, status: "queued" } : it);
    this.emit();
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Samme liste til neste endring (stabil for useSyncExternalStore). */
  private snapshot: QueueItem[] = [];

  private emit() {
    this.snapshot = [...this.items.values()].sort((a, b) => a.addedAt - b.addedAt);
    for (const fn of this.listeners) fn();
  }

  list(): QueueItem[] {
    return this.snapshot;
  }

  private save(it: QueueItem) {
    this.items.set(it.id, it);
    this.emit();
    if (!this.db) return;
    try {
      this.db.transaction(STORE, "readwrite").objectStore(STORE).put(it);
    } catch {
      /* fullt eller ikke tilgjengelig: køen gjelder bare denne visningen */
    }
  }

  add(
    blob: Blob,
    name: string,
    opts: { local?: boolean; durationMs?: number; roomTone?: boolean } = {},
  ): QueueItem {
    const it: QueueItem = {
      id: newId<"mobile_file">(),
      session: this.session,
      name: name.slice(0, 255),
      mime: blob.type,
      size: blob.size,
      blob,
      status: opts.local ? "local" : "queued",
      addedAt: Date.now(),
      ...(opts.durationMs !== undefined ? { durationMs: opts.durationMs } : {}),
      ...(opts.roomTone ? { roomTone: true } : {}),
    };
    this.save(it);
    return it;
  }

  /** Send de valgte lokale opptakene (eller prøv feilede på nytt). */
  send(ids: readonly string[]) {
    for (const id of ids) {
      const it = this.items.get(id);
      if (it && (it.status === "local" || it.status === "failed"))
        this.update(id, { status: "queued" });
    }
  }

  /** Forkast et lokalt opptak (bare før det er sendt). */
  remove(id: string) {
    const it = this.items.get(id);
    if (!it || it.status !== "local") return;
    this.items.delete(id);
    this.emit();
    this.forgetBlob(id);
  }

  /** Lokale opptak som ikke er sendt. */
  local(): number {
    return this.list().filter((x) => x.status === "local").length;
  }

  update(id: string, patch: Partial<Pick<QueueItem, "status" | "error">>) {
    const it = this.items.get(id);
    if (!it) return;
    const next: QueueItem = { ...it, ...patch };
    if (patch.status && patch.status !== "failed") delete (next as { error?: string }).error;
    this.save(next);
  }

  /** Sendte filer fjernes fra lageret på telefonen (de vises fortsatt i listen denne økten). */
  forgetBlob(id: string) {
    if (!this.db) return;
    try {
      this.db.transaction(STORE, "readwrite").objectStore(STORE).delete(id);
    } catch {
      /* ingenting å rydde */
    }
  }

  unsent(): number {
    return this.list().filter((x) => x.status !== "sent").length;
  }
}

export interface UploadApi {
  ticket(
    it: QueueItem,
  ): Promise<{ ok: boolean; message: string; path?: string; uploadToken?: string; done?: boolean }>;
  put(path: string, uploadToken: string, it: QueueItem): Promise<string | null>;
  confirm(it: QueueItem): Promise<{ ok: boolean; message: string }>;
}

/**
 * Sender det som står i kø, to om gangen. Feil merkes på filen (kan prøves igjen); nettfeil prøves igjen
 * automatisk når telefonen er på nett igjen.
 */
export class Uploader {
  private running = 0;
  private stopped = false;
  private tries = new Map<string, number>();
  constructor(
    private readonly queue: UploadQueue,
    private readonly api: UploadApi,
    private readonly concurrency = 2,
  ) {}

  stop() {
    this.stopped = true;
  }

  pump() {
    if (this.stopped) return;
    const next = this.queue.list().filter((x) => x.status === "queued");
    while (this.running < this.concurrency && next.length) {
      const it = next.shift()!;
      this.running++;
      this.queue.update(it.id, { status: "uploading" });
      void this.send(it).finally(() => {
        this.running--;
        this.pump();
      });
    }
  }

  private async send(it: QueueItem) {
    try {
      const t = await this.api.ticket(it);
      if (!t.ok) return this.queue.update(it.id, { status: "failed", error: t.message });
      if (!t.done) {
        const e = await this.api.put(t.path!, t.uploadToken!, it);
        if (e) return this.queue.update(it.id, { status: "failed", error: e });
      }
      const c = await this.api.confirm(it);
      if (!c.ok) return this.queue.update(it.id, { status: "failed", error: c.message });
      this.queue.update(it.id, { status: "sent" });
      this.queue.forgetBlob(it.id);
    } catch {
      // Nettfeil: tilbake i køen og prøves igjen (etter fem forsøk på rad: merket som feilet)
      const n = (this.tries.get(it.id) ?? 0) + 1;
      this.tries.set(it.id, n);
      if (n >= 5) {
        this.tries.delete(it.id);
        return this.queue.update(it.id, {
          status: "failed",
          error: L("Ingen forbindelse. Prøv igjen.", "No connection. Try again."),
        });
      }
      this.queue.update(it.id, { status: "queued" });
      await new Promise((r) => setTimeout(r, 2000 * n));
    }
  }

  retry(id: string) {
    this.tries.delete(id);
    this.queue.update(id, { status: "queued" });
    this.pump();
  }
}
