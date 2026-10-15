/* IndexedDB and compression run off the measurement/UI thread. No network access. */
"use strict";
importScripts("vendor/pako.min.js", "data-codec.js");
let db, chain = Promise.resolve();
const arrays = new Map(), entries = new Map();
function request(req) { return new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); }); }
async function open() {
  if (db) return;
  const req = indexedDB.open("pilot-anchor-v3", 1);
  req.onupgradeneeded = () => req.result.createObjectStore("sessions", { keyPath: "id" });
  db = await request(req);
}
function transaction(mode, run) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("sessions", mode);
    tx.oncomplete = () => resolve(); tx.onerror = tx.onabort = () => reject(tx.error || new Error("storage transaction aborted"));
    run(tx.objectStore("sessions"));
  });
}
function unpack(value) {
  if (!value || typeof value !== "object") return value;
  if (value.__pilotEventsRef) {
    const found = arrays.get(value.__pilotEventsRef);
    if (!found) throw new Error("missing event snapshot");
    return found;
  }
  if (Array.isArray(value)) return value.map(unpack);
  const out = {}; for (const k of Object.keys(value)) out[k] = unpack(value[k]); return out;
}
async function handle(m) {
  await open();
  if (m.type === "load") {
    const result = await request(db.transaction("sessions").objectStore("sessions").getAll());
    for (const entry of result) entries.set(entry.id, entry);
    return result;
  }
  if (m.type === "read") {
    const entry = await request(db.transaction("sessions").objectStore("sessions").get(m.id));
    if (entry) entries.set(m.id, entry); else entries.delete(m.id);
    return entry || null;
  }
  for (const [id, points] of m.arrays || []) arrays.set(id, points);
  if (m.type === "save") {
    const entry = unpack(m.entry);
    await transaction("readwrite", store => store.put(entry));
    entries.set(entry.id, entry);
    return true;
  }
  if (m.type === "remove") {
    await transaction("readwrite", store => store.delete(m.id)); entries.delete(m.id); return true;
  }
  if (m.type === "wire") {
    const raw = JSON.stringify(unpack(m.payload));
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
    return { body: PilotCodec.wire(raw), digest: Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, "0")).join("") };
  }
  if (m.type === "flush") return true;
  throw new Error("unknown storage operation");
}
self.onmessage = ({ data: m }) => {
  const task = chain.then(() => handle(m));
  chain = task.catch(() => {});
  task.then(value => self.postMessage({ seq: m.seq, value }), error => self.postMessage({ seq: m.seq, error: { message: error.message, code: error.code || error.name, retryable: error.retryable } }));
};
