/** Browser-local export queue, shared by film and alpha; tasks outlive their dialogs. */
import type { QualityProfileSnapshot } from "@/core";

export interface ExportTask {
  id: string;
  name: string;
  status: "queued" | "running" | "done" | "failed" | "cancelled";
  done: number;
  total: number;
  error?: string;
  profile?: QualityProfileSnapshot | null;
}
type Work = (signal: AbortSignal, progress: (done: number, total: number) => void) => Promise<void>;
export class ExportQueue {
  private tasks: readonly ExportTask[] = [];
  private listeners = new Set<() => void>();
  private pending: { id: string; work: Work; controller: AbortController }[] = [];
  private controllers = new Map<string, AbortController>();
  private running = false;
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  snapshot = () => this.tasks;
  private update(id: string, patch: Partial<ExportTask>) {
    this.tasks = this.tasks.map(t => t.id === id ? { ...t, ...patch } : t);
    this.listeners.forEach(fn => fn());
  }
  enqueue(name: string, work: Work, profile?: QualityProfileSnapshot | null) {
    const id = crypto.randomUUID(), controller = new AbortController();
    this.tasks = [...this.tasks, { id, name, profile, status: "queued", done: 0, total: 1 }];
    this.controllers.set(id, controller);
    this.pending.push({ id, work, controller });
    this.listeners.forEach(fn => fn());
    void this.pump();
    return id;
  }
  cancel(id: string) { this.controllers.get(id)?.abort(); this.update(id, { status: "cancelled" }); }
  dismiss(id: string) {
    const task = this.tasks.find(t => t.id === id);
    if (!task || task.status === "running" || task.status === "queued") return;
    this.tasks = this.tasks.filter(t => t.id !== id); this.listeners.forEach(fn => fn());
  }
  private async pump() {
    if (this.running) return;
    this.running = true;
    try {
      for (let item = this.pending.shift(); item; item = this.pending.shift()) {
        const { id, work, controller } = item;
        if (controller.signal.aborted) { this.controllers.delete(id); continue; }
        this.update(id, { status: "running" });
        try {
          await work(controller.signal, (done, total) => this.update(id, { done, total }));
          this.update(id, { status: controller.signal.aborted ? "cancelled" : "done" });
        } catch (e) {
          this.update(id, { status: controller.signal.aborted ? "cancelled" : "failed", error: (e as Error).message });
        } finally { this.controllers.delete(id); }
      }
    } finally { this.running = false; }
  }
}
export const exportQueue = new ExportQueue();