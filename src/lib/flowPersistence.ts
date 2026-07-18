// Level-1 resume: persist the in-progress design flow to the browser so an
// accidental close/refresh on the same device restores where the user left off.
// Photos are large (base64), so we use IndexedDB, not localStorage. This is
// device-local only — cross-device / background completion is Level 2.

import type {
  AppMode,
  EventConfig,
  MakeoverConfig,
  PersonAnalysis,
  RoomAnalysis,
  SuggestedProduct,
  ProductResult,
  Hotspot,
  FlowStep,
} from "@/lib/types";

const DB_NAME = "noosho";
const STORE = "flow";
const KEY = "activeFlow";
const SNAPSHOT_VERSION = 1;
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // ignore stale snapshots after 24h

export interface FlowSnapshot {
  v: number;
  savedAt: number;
  step: FlowStep;
  mode: AppMode;
  eventConfig: EventConfig | null;
  makeoverConfig: MakeoverConfig | null;
  maxBudget?: number;
  noBudget: boolean;
  image: string | null;
  baseImage: string | null;
  roomAnalysis: RoomAnalysis | null;
  personAnalysis: PersonAnalysis | null;
  selectedItems: SuggestedProduct[];
  products: ProductResult[];
  hotspots: Hotspot[];
  generatedImage: string | null;
  designNarrative: string;
  designId: string | null;
  isUnlocked: boolean;
}

function hasIDB(): boolean {
  return typeof window !== "undefined" && "indexedDB" in window;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const store = db.transaction(STORE, mode).objectStore(STORE);
        const req = run(store);
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => reject(req.error);
      })
  );
}

/** Persist the current flow. Best-effort — swallows errors (private mode, quota). */
export async function saveFlowSnapshot(
  snapshot: Omit<FlowSnapshot, "v" | "savedAt">
): Promise<void> {
  if (!hasIDB()) return;
  try {
    await tx("readwrite", (s) =>
      s.put({ ...snapshot, v: SNAPSHOT_VERSION, savedAt: Date.now() }, KEY)
    );
  } catch {
    /* ignore */
  }
}

/** Load a fresh, version-matched snapshot, or null. */
export async function loadFlowSnapshot(): Promise<FlowSnapshot | null> {
  if (!hasIDB()) return null;
  try {
    const snap = await tx<FlowSnapshot | undefined>("readonly", (s) => s.get(KEY));
    if (!snap || snap.v !== SNAPSHOT_VERSION) return null;
    if (Date.now() - snap.savedAt > MAX_AGE_MS) {
      await clearFlowSnapshot();
      return null;
    }
    return snap;
  } catch {
    return null;
  }
}

export async function clearFlowSnapshot(): Promise<void> {
  if (!hasIDB()) return;
  try {
    await tx("readwrite", (s) => s.delete(KEY));
  } catch {
    /* ignore */
  }
}

// ─── Pending upload (deferred sign-in) ───
// When an anonymous user uploads a photo, we gate on "sign in to see your
// design". Google OAuth is a full-page redirect, so we stash the upload + its
// setup here (separate key from the main snapshot, to avoid touching the
// resume/paid-gen logic) and replay it once they're signed in.

const PENDING_KEY = "pendingUpload";

export interface PendingUpload {
  v: number;
  savedAt: number;
  base64: string;
  mode: AppMode;
  eventConfig: EventConfig | null;
  makeoverConfig: MakeoverConfig | null;
  maxBudget?: number;
  noBudget: boolean;
}

export async function savePendingUpload(
  pending: Omit<PendingUpload, "v" | "savedAt">
): Promise<void> {
  if (!hasIDB()) return;
  try {
    await tx("readwrite", (s) =>
      s.put({ ...pending, v: SNAPSHOT_VERSION, savedAt: Date.now() }, PENDING_KEY)
    );
  } catch {
    /* ignore */
  }
}

export async function loadPendingUpload(): Promise<PendingUpload | null> {
  if (!hasIDB()) return null;
  try {
    const p = await tx<PendingUpload | undefined>("readonly", (s) =>
      s.get(PENDING_KEY)
    );
    if (!p || p.v !== SNAPSHOT_VERSION) return null;
    if (Date.now() - p.savedAt > MAX_AGE_MS) {
      await clearPendingUpload();
      return null;
    }
    return p;
  } catch {
    return null;
  }
}

export async function clearPendingUpload(): Promise<void> {
  if (!hasIDB()) return;
  try {
    await tx("readwrite", (s) => s.delete(PENDING_KEY));
  } catch {
    /* ignore */
  }
}
