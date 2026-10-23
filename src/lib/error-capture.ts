// Captures the original Error out-of-band so server.ts can recover the stack
// when h3 has already swallowed the throw into a generic 500 Response.

let lastCapturedError: { error: unknown; at: number } | undefined;
const TTL_MS = 5_000;

function record(error: unknown) {
  lastCapturedError = { error, at: Date.now() };
}

// h3's HTTPError serializes to {"status":500,"unhandled":true,"message":"HTTPError"} —
// no stack, no cause — so a plain console.error(error) reaches the log pipeline with
// the failure detail stripped. Expand Error-like args into a string that keeps the
// message, stack, and the full cause chain.
const CAUSE_DEPTH_LIMIT = 5;
const DESCRIPTION_LENGTH_LIMIT = 8_000;

// G-8: hemmeligheter skal aldri nå loggene. Bearer-/JWT-tokens, Supabase- og leverandørnøkler og
// nøkkel-/token-parametere i adresser maskeres før noe skrives.
const SECRET_PATTERNS: readonly [RegExp, string][] = [
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, "$1 [skjult]"],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, "[skjult-jwt]"],
  [/\b(sb_secret_|sb_publishable_|sk-ant-|sk-proj-|sk-|xi-|AIza|ghp_|github_pat_|whsec_|rk_live_|sk_live_|sk_test_)[A-Za-z0-9_-]{8,}/g, "$1[skjult]"],
  [/([?&#](?:key|api_key|apikey|token|access_token|refresh_token|secret|signature|sig|code)=)[^&#\s"']+/gi, "$1[skjult]"],
  [/("(?:password|secret|token|access_token|refresh_token|api_key|apiKey|apikey|authorization|ciphertext)"\s*:\s*")[^"]*"/gi, '$1[skjult]"'],
];

export function redactSecrets(text: string): string {
  let out = text;
  for (const [re, rep] of SECRET_PATTERNS) out = out.replace(re, rep);
  return out;
}

export function describeError(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < CAUSE_DEPTH_LIMIT && current != null; depth++) {
    if (!(current instanceof Error)) {
      parts.push(typeof current === "string" ? current : safeStringify(current));
      break;
    }
    const label = depth === 0 ? "" : "caused by: ";
    const status = describeStatus(current);
    parts.push(`${label}${current.stack ?? `${current.name}: ${current.message}`}${status}`);
    current = current.cause;
  }
  return redactSecrets(parts.join("\n")).slice(0, DESCRIPTION_LENGTH_LIMIT);
}

function describeStatus(error: Error): string {
  const { status, statusCode } = error as { status?: unknown; statusCode?: unknown };
  const value = status ?? statusCode;
  return typeof value === "number" ? ` (status ${value})` : "";
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function isErrorLike(value: unknown): value is Error {
  return value instanceof Error;
}

// Wrap console.error so errors logged by any layer — including h3's internal
// unhandled-error logging, which this file cannot hook directly — are both
// recorded for consumeLastCapturedError and expanded before serialization.
let initialized = false;

export function initializeErrorCapture(): void {
  if (initialized) return;
  initialized = true;
  const originalConsoleError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    const expanded = args.map((arg) => {
      if (typeof arg === "string") return redactSecrets(arg);
      if (!isErrorLike(arg)) return arg;
      record(arg);
      return describeError(arg);
    });
    originalConsoleError(...expanded);
  };

  if (typeof globalThis.addEventListener === "function") {
    globalThis.addEventListener("error", (event) => record((event as ErrorEvent).error ?? event));
    globalThis.addEventListener("unhandledrejection", (event) =>
      record((event as PromiseRejectionEvent).reason),
    );
  }
}

export function consumeLastCapturedError(): unknown {
  if (!lastCapturedError) return undefined;
  if (Date.now() - lastCapturedError.at > TTL_MS) {
    lastCapturedError = undefined;
    return undefined;
  }
  const { error } = lastCapturedError;
  lastCapturedError = undefined;
  return error;
}
