/** Diff på ordnivå (T2): gammel og ny tekst side om side. Ren LCS over ord og mellomrom. */
export interface DiffSegment {
  readonly op: "same" | "del" | "add";
  readonly text: string;
}

const MAX_CELLS = 400_000;

function push(out: DiffSegment[], op: DiffSegment["op"], text: string) {
  if (!text) return;
  const last = out[out.length - 1];
  if (last && last.op === op) out[out.length - 1] = { op, text: last.text + text };
  else out.push({ op, text });
}

export function wordDiff(a: string, b: string): DiffSegment[] {
  if (a === b) return a ? [{ op: "same", text: a }] : [];
  const x = a.split(/(\s+)/).filter((t) => t !== "");
  const y = b.split(/(\s+)/).filter((t) => t !== "");
  const out: DiffSegment[] = [];
  if (x.length * y.length > MAX_CELLS) {
    push(out, "del", a);
    push(out, "add", b);
    return out;
  }
  const n = x.length;
  const m = y.length;
  const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i]![j] = x[i] === y[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (x[i] === y[j]) {
      push(out, "same", x[i]!);
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) push(out, "del", x[i++]!);
    else push(out, "add", y[j++]!);
  }
  while (i < n) push(out, "del", x[i++]!);
  while (j < m) push(out, "add", y[j++]!);
  return out;
}
