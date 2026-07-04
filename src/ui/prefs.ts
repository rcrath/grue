// Tiny localStorage-backed preference store (wave 3). Holds UI-only state:
// panel open/position, recent files, and the few real preferences. Nothing in
// here is part of the document or the undo history.

const PREFIX = "grue.";

export function getPref<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function setPref(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // storage unavailable (private mode etc.) — preferences just don't persist
  }
}

export function removePref(key: string): void {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    // ignore
  }
}
