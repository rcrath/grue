// In-memory log ring buffer (v0.2.1 workstream 3): backs Help > Show Log.
// Wraps console.log/warn/error (output still passes through unchanged) and
// captures uncaught errors + unhandled promise rejections so problems that
// happen off-screen still show up somewhere. installLogCapture() must run
// once, early, before anything interesting can log.

export type LogLevel = "log" | "warn" | "error";

export interface LogEntry {
  time: number; // Date.now()
  level: LogLevel;
  message: string;
}

const MAX_ENTRIES = 500;
const buffer: LogEntry[] = [];
const listeners = new Set<(entry: LogEntry) => void>();

function push(level: LogLevel, message: string): void {
  const entry: LogEntry = { time: Date.now(), level, message };
  buffer.push(entry);
  if (buffer.length > MAX_ENTRIES) buffer.shift();
  for (const l of listeners) l(entry);
}

function stringifyArg(v: unknown): string {
  if (typeof v === "string") return v;
  if (v instanceof Error) return v.stack || v.message;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function fmt(args: unknown[]): string {
  return args.map(stringifyArg).join(" ");
}

/** Explicit log entry, bypassing console (for callers that already know the level). */
export function log(level: LogLevel, message: string): void {
  push(level, message);
}

/** Snapshot of the ring buffer, oldest first. A copy, not a live view — so
 *  logging while iterating a snapshot (e.g. Copy All) can't grow it underfoot. */
export function entries(): readonly LogEntry[] {
  return [...buffer];
}

export function clear(): void {
  buffer.length = 0;
}

/** Subscribe to new entries as they land. Returns an unsubscribe function. */
export function onLog(fn: (entry: LogEntry) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

let installed = false;

/** Wrap console.log/warn/error and capture global error events. Call once at
 *  app startup, before any other module has a chance to log something. */
export function installLogCapture(): void {
  if (installed) return;
  installed = true;

  const origLog = console.log.bind(console);
  const origWarn = console.warn.bind(console);
  const origError = console.error.bind(console);

  console.log = (...args: unknown[]) => {
    push("log", fmt(args));
    origLog(...args);
  };
  console.warn = (...args: unknown[]) => {
    push("warn", fmt(args));
    origWarn(...args);
  };
  console.error = (...args: unknown[]) => {
    push("error", fmt(args));
    origError(...args);
  };

  window.addEventListener("error", (e: ErrorEvent) => {
    const where = e.filename ? ` (${e.filename}:${e.lineno})` : "";
    push("error", `${e.message}${where}`);
  });
  window.addEventListener("unhandledrejection", (e: PromiseRejectionEvent) => {
    const reason = e.reason;
    const message = reason instanceof Error ? reason.stack || reason.message : String(reason);
    push("error", `Unhandled rejection: ${message}`);
  });
}
