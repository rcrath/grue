// Browser-side storage for maps that have no web address (opened from the user's
// computer, or new): a combined link carries only a short key, and the map's text
// is kept here in IndexedDB. Nothing leaves the browser, and it only works in the
// same browser on the same site.

const DB_NAME = "grue-stored-maps";
const STORE = "maps";

export interface StoredMap {
  name: string;
  text: string;
  savedAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Short random key for a new stored map. */
export function newStoreKey(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

/** Write (or replace) the stored copy under this key. */
export async function putStored(key: string, name: string, text: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({ name, text, savedAt: Date.now() } satisfies StoredMap, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function getStored(key: string): Promise<StoredMap | null> {
  const db = await openDb();
  const found = await new Promise<StoredMap | null>((resolve, reject) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
    req.onsuccess = () => resolve((req.result as StoredMap | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return found;
}
