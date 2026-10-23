/**
 * En liten falsk Supabase-klient for serverlogikk: from().select().eq().neq().gte().in()
 * .is().limit().maybeSingle(), telling med { count: "exact", head: true }, update(patch) (endrer radene
 * filtrene treffer; .select() etterpå gir de endrede radene) og storage.from().upload()/remove().
 */
type Row = Record<string, unknown>;

export function fakeDb(tables: Record<string, Row[]>, files: readonly string[] = []) {
  const uploads: { bucket: string; path: string; size: number }[] = [];
  const removed: string[] = [];
  return {
    uploads,
    removed,
    storage: {
      from(bucket: string) {
        return {
          upload(path: string, blob: Blob) {
            uploads.push({ bucket, path, size: blob.size });
            return Promise.resolve({ data: { path }, error: null });
          },
          createSignedUrl(path: string) {
            const ok = files.includes(path) || uploads.some((u) => u.path === path);
            return Promise.resolve(
              ok
                ? { data: { signedUrl: `https://signed/${path}` }, error: null }
                : { data: null, error: { message: "Object not found" } },
            );
          },
          remove(paths: string[]) {
            removed.push(...paths);
            return Promise.resolve({ data: null, error: null });
          },
        };
      },
    },
    /**
     * Falske RPC-er (G-3 del 2): periodestartene svarer med UTC-månedsstarten, slik databasen gjør for
     * prosjekter og brukere uten egen tidssone. Tester som vil ha en annen tidssone, overstyrer `rpc`.
     */
    rpc(name: string, args: Record<string, unknown>) {
      const now = new Date();
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      if (name === "project_period_start" || name === "user_period_start") {
        return Promise.resolve({ data: start.toISOString(), error: null });
      }
      if (name === "user_period_start_date") {
        return Promise.resolve({ data: start.toISOString().slice(0, 10), error: null });
      }
      return Promise.resolve({ data: null, error: { message: `Ukjent rpc i fakeDb: ${name} (${JSON.stringify(args)})` } });
    },
    from(table: string) {
      const filters: ((r: Row) => boolean)[] = [];
      let head = false;
      let patch: Row | null = null;
      let applied: Row[] | null = null;
      const apply = () => {
        if (patch && applied === null) {
          applied = q.rows();
          for (const r of applied) Object.assign(r, patch);
        }
        return applied ?? [];
      };
      const q = {
        update(p: Row) {
          patch = p;
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
        or(expression: string) {
          if (expression === "params->>kind.is.null,params->>kind.neq.dialogue_batch") filters.push(r => (r["params"] as Row | undefined)?.["kind"] !== "dialogue_batch");
          else throw new Error(`Unsupported fake filter: ${expression}`);
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
        order() {
          return q;
        },
        limit() {
          return q;
        },
        rows() {
          return (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
        },
        maybeSingle() {
          return Promise.resolve({ data: q.rows()[0] ?? null, error: null });
        },
        then(ok: (v: { data: Row[] | null; count: number; error: null }) => unknown) {
          const rows = patch ? apply() : q.rows();
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
