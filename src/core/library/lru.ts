/** Bounded least-recently-used cache. No platform dependencies. */
export class LruCache<K, V> {
  private readonly values = new Map<K, V>();
  constructor(private readonly limit: number) {
    if (!Number.isInteger(limit) || limit < 1) throw new RangeError('Invalid cache limit');
  }
  get size() { return this.values.size; }
  get(key: K): V | undefined {
    const value = this.values.get(key);
    if (value !== undefined) { this.values.delete(key); this.values.set(key, value); }
    return value;
  }
  set(key: K, value: V): void {
    this.values.delete(key);
    this.values.set(key, value);
    while (this.values.size > this.limit) {
      const oldest = this.values.keys().next();
      if (oldest.done) break;
      this.values.delete(oldest.value);
    }
  }
}