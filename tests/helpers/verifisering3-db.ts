/**
 * Falsk Supabase-klient med skriving for verifiseringen i DEC-0075: from().select/insert/update/delete/
 * upsert med filtrene eq, neq, gte, lt, in, is, order og limit, telling med { count: "exact", head: true },
 * maybeSingle og storage (upload, download, createSignedUrl, remove). Radene ligger i `tables`, så testene kan
 * lese hva serverfunksjonene faktisk skrev.
 */
type Row = Record<string, unknown>;

export interface FakeDb {
  readonly tables: Record<string, Row[]>;
  readonly files: Set<string>;
  readonly uploads: { bucket: string; path: string; size: number; type: string }[];
  readonly removed: string[];
  from(table: string): any; // eslint-disable-line @typescript-eslint/no-explicit-any
  rpc(name: string, args?: Record<string, unknown>): Promise<{ data: unknown; error: { message: string } | null }>;
  storage: { from(bucket: string): any }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export function fakeWriteDb(tables: Record<string, Row[]>, files: readonly string[] = []): FakeDb {
  const fileSet = new Set(files);
  const uploads: FakeDb["uploads"] = [];
  const removed: string[] = [];
  const rowsOf = (t: string) => (tables[t] ??= []);
  return {
    tables,
    files: fileSet,
    uploads,
    removed,
    // Periodestartene svarer med UTC-månedsstarten, som databasen gjør uten egen tidssone (G-3 del 2)
    rpc(name: string) {
      const now = new Date();
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      if (name === "project_period_start" || name === "user_period_start")
        return Promise.resolve({ data: start.toISOString(), error: null });
      if (name === "user_period_start_date")
        return Promise.resolve({ data: start.toISOString().slice(0, 10), error: null });
      return Promise.resolve({ data: null, error: { message: `Ukjent rpc i fakeWriteDb: ${name}` } });
    },
    storage: {
      from(bucket: string) {
        return {
          upload(path: string, blob: Blob) {
            uploads.push({ bucket, path, size: blob.size, type: blob.type });
            fileSet.add(path);
            return Promise.resolve({ data: { path }, error: null });
          },
          download(path: string) {
            return Promise.resolve(
              fileSet.has(path)
                ? {
                    data: new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }),
                    error: null,
                  }
                : { data: null, error: { message: "Object not found" } },
            );
          },
          createSignedUrl(path: string) {
            return Promise.resolve(
              fileSet.has(path)
                ? { data: { signedUrl: `https://signert.test/${path}` }, error: null }
                : { data: null, error: { message: "Object not found" } },
            );
          },
          remove(paths: string[]) {
            removed.push(...paths);
            for (const p of paths) fileSet.delete(p);
            return Promise.resolve({ data: null, error: null });
          },
        };
      },
    },
    from(table: string) {
      const filters: ((r: Row) => boolean)[] = [];
      const orders: { key: string; asc: boolean }[] = [];
      let head = false;
      let max: number | null = null;
      let sliceFrom = 0;
      let sliceTo: number | null = null;
      let op: "select" | "update" | "delete" | "insert" = "select";
      let patch: Row | null = null;
      let inserted: Row[] = [];
      let done: Row[] | null = null;
      const matching = () => {
        const out = rowsOf(table).filter((r) => filters.every((f) => f(r)));
        for (const o of [...orders].reverse())
          out.sort((a, b) => {
            const x = a[o.key] as string | number;
            const y = b[o.key] as string | number;
            return (x < y ? -1 : x > y ? 1 : 0) * (o.asc ? 1 : -1);
          });
        const ranged = sliceTo === null ? out.slice(sliceFrom) : out.slice(sliceFrom, sliceTo);
        return max === null ? ranged : ranged.slice(0, max);
      };
      const run = (): Row[] => {
        if (done) return done;
        if (op === "update") {
          done = matching();
          for (const r of done) Object.assign(r, patch);
        } else if (op === "delete") {
          done = matching();
          tables[table] = rowsOf(table).filter((r) => !done!.includes(r));
        } else if (op === "insert") {
          done = inserted;
        } else done = matching();
        return done;
      };
      const q = {
        insert(row: Row | Row[]) {
          op = "insert";
          inserted = (Array.isArray(row) ? row : [row]).map((r) => ({
            created_at: new Date().toISOString(),
            ...r,
          }));
          rowsOf(table).push(...inserted);
          return q;
        },
        upsert(row: Row) {
          const t = rowsOf(table);
          const key = "user_id" in row ? "user_id" : "id";
          const old = t.find((r) => r[key] === row[key]);
          if (old) Object.assign(old, row);
          else t.push({ ...row });
          return Promise.resolve({ data: null, error: null });
        },
        update(p: Row) {
          op = "update";
          patch = p;
          return q;
        },
        delete() {
          op = "delete";
          return q;
        },
        select(_cols?: string, opts?: { count?: string; head?: boolean }) {
          head = !!opts?.head;
          return q;
        },
        eq(k: string, v: unknown) {
          filters.push((r) => r[k] === v);
          return q;
        },
        neq(k: string, v: unknown) {
          filters.push((r) => r[k] !== v);
          return q;
        },
        lt(k: string, v: string) {
          filters.push((r) => String(r[k] ?? "") < v);
          return q;
        },
        gte(k: string, v: string) {
          filters.push((r) => String(r[k] ?? "") >= v);
          return q;
        },
        in(k: string, vs: readonly unknown[]) {
          filters.push((r) => vs.includes(r[k]));
          return q;
        },
        is(k: string, v: unknown) {
          filters.push((r) => (r[k] ?? null) === v);
          return q;
        },
        order(key: string, o?: { ascending?: boolean }) {
          orders.push({ key, asc: o?.ascending !== false });
          return q;
        },
        range(from: number, to: number) {
          sliceFrom = from;
          sliceTo = to + 1;
          return q;
        },
        limit(n: number) {
          max = n;
          return q;
        },
        maybeSingle() {
          return Promise.resolve({ data: run()[0] ?? null, error: null });
        },
        single() {
          const r = run()[0];
          return Promise.resolve(
            r ? { data: r, error: null } : { data: null, error: { message: "Ingen rad" } },
          );
        },
        then(ok: (v: { data: Row[] | null; count: number; error: null }) => unknown) {
          const rows = run();
          return Promise.resolve({
            data: head ? null : rows,
            count: rows.length,
            error: null,
          }).then(ok);
        },
      };
      return q;
    },
  };
}

/**
 * Erstatter createServerFn: kjeden .middleware().validator().handler() gir en funksjon som kjører validering
 * og handler med en fast innlogget bruker – slik serveren gjør etter requireSupabaseAuth.
 */
export function serverFnStub() {
  return () => {
    let validate: (d: unknown) => unknown = (d) => d;
    const b = {
      middleware: () => b,
      validator: (v: (d: unknown) => unknown) => {
        validate = v;
        return b;
      },
      inputValidator: (v: (d: unknown) => unknown) => {
        validate = v;
        return b;
      },
      handler:
        (h: (a: { data: unknown; context: unknown }) => unknown) =>
        (a: { data: unknown; context: unknown }) =>
          Promise.resolve().then(() => h({ data: validate(a.data), context: a.context })),
    };
    return b;
  };
}
