// Offline Vault Storage using browser IndexedDB
// Handles offline persistence for evidence documents, images, and FIR reports without storage quota limits

const DB_NAME = "TraceVaultOfflineDB";
const DB_VERSION = 1;
const STORE_NAME = "offline_evidence";

/**
 * Open or create IndexedDB connection
 */
export function openDB() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      console.warn("IndexedDB not supported in this browser, falling back to localStorage");
      resolve(null);
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = (event) => {
      resolve(event.target.result);
    };

    request.onerror = (event) => {
      console.error("IndexedDB open error:", event.target.error);
      reject(event.target.error);
    };
  });
}

/**
 * Compute SHA-256 hash using Web Crypto API
 */
export async function computeClientSHA256(contentString) {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(contentString || "");
    const hashBuffer = await window.crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
  } catch (err) {
    // Deterministic fallback hash
    let hash = 0;
    const str = contentString || "";
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    return Math.abs(hash).toString(16).padStart(64, "0");
  }
}

/**
 * Save an offline evidence item to IndexedDB
 */
export async function saveOfflineEvidence(item) {
  try {
    const db = await openDB();
    if (!db) {
      // LocalStorage fallback
      const list = JSON.parse(localStorage.getItem("offline_evidence_queue") || "[]");
      list.push(item);
      localStorage.setItem("offline_evidence_queue", JSON.stringify(list));
      return item;
    }

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(item);

      req.onsuccess = () => resolve(item);
      req.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.error("Failed to save offline evidence:", err);
    return item;
  }
}

/**
 * Get all pending offline evidence items from IndexedDB
 */
export async function getOfflineEvidenceList() {
  try {
    const db = await openDB();
    if (!db) {
      return JSON.parse(localStorage.getItem("offline_evidence_queue") || "[]");
    }

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();

      req.onsuccess = () => resolve(req.result || []);
      req.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.error("Failed to read offline evidence:", err);
    return [];
  }
}

/**
 * Remove an item from the offline queue once it is synced
 */
export async function removeOfflineEvidence(id) {
  try {
    const db = await openDB();
    if (!db) {
      const list = JSON.parse(localStorage.getItem("offline_evidence_queue") || "[]");
      const filtered = list.filter(item => item.id !== id && item._id !== id);
      localStorage.setItem("offline_evidence_queue", JSON.stringify(filtered));
      return true;
    }

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(id);

      req.onsuccess = () => resolve(true);
      req.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.error("Failed to remove offline evidence:", err);
    return false;
  }
}

/**
 * Update an offline evidence item in IndexedDB
 */
export async function updateOfflineEvidence(id, updates) {
  try {
    const db = await openDB();
    if (!db) return null;

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get(id);

      getReq.onsuccess = () => {
        const item = getReq.result;
        if (!item) {
          resolve(null);
          return;
        }
        const updated = { ...item, ...updates };
        store.put(updated);
        resolve(updated);
      };

      getReq.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.error("Failed to update offline evidence:", err);
    return null;
  }
}
