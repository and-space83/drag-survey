/* Cached session API backed by IndexedDB in a dedicated Worker.
 * Recorded event arrays are append-only while a drag is active and immutable once
 * inserted into records. Repeated checkpoints only send newly encountered arrays.
 */
(function (root) {
  "use strict";
  function clone(value, key) {
    if (!value || typeof value !== "object") return value;
    if (key === "events" && Array.isArray(value)) return value;
    if (Array.isArray(value)) return value.map(v => clone(v));
    const out = {}; for (const k of Object.keys(value)) out[k] = clone(value[k], k); return out;
  }
  root.PilotDurable = { clone, async open(onError) {
    const worker = new Worker("storage-worker.js");
    const pending = new Map(), cache = new Map(), known = new WeakMap(), dirty = new Map(), removed = new Set();
    let seq = 0, eventSeq = 0, failure = null, fatal = null;
    worker.onmessage = ({ data: m }) => {
      const p = pending.get(m.seq); if (!p) return; pending.delete(m.seq);
      if (m.error) { const error = Object.assign(new Error(m.error.message), m.error); p.reject(error); }
      else p.resolve(m.value);
    };
    worker.onerror = () => {
      failure = new Error("storage worker stopped");
      fatal = failure;
      for (const p of pending.values()) p.reject(failure); pending.clear(); onError(failure);
    };
    function call(type, data = {}) {
      if (fatal) return Promise.reject(fatal);
      return new Promise((resolve, reject) => {
        const n = ++seq; pending.set(n, { resolve, reject });
        try { worker.postMessage({ seq: n, type, ...data }); } catch (error) { pending.delete(n); reject(error); }
      });
    }
    function packet(value) {
      const arrays = [];
      function pack(v, key) {
        if (!v || typeof v !== "object") return v;
        if (key === "events" && Array.isArray(v)) {
          let old = known.get(v);
          if (!old || old.length !== v.length) {
            old = { id: "events-" + (++eventSeq), length: v.length }; known.set(v, old); arrays.push([old.id, v]);
          }
          return { __pilotEventsRef: old.id };
        }
        if (Array.isArray(v)) return v.map(i => pack(i));
        const out = {}; for (const k of Object.keys(v)) out[k] = pack(v[k], k); return out;
      }
      return { value: pack(value), arrays };
    }
    function report(error) { failure = error; onError(error); }
    function persist(entry) {
      const p = packet(entry); dirty.set(entry.id, entry);
      return call("save", { entry: p.value, arrays: p.arrays }).then(() => { if (dirty.get(entry.id) === entry) dirty.delete(entry.id); });
    }
    function remove(id) {
      removed.add(id);
      return call("remove", { id }).then(() => removed.delete(id));
    }
    const backend = {
      clone,
      read: id => cache.has(id) ? clone(cache.get(id)) : null,
      all: () => Array.from(cache.values(), e => clone(e)),
      write(entry) { const snapshot = clone(entry); cache.set(entry.id, snapshot); persist(snapshot).catch(report); },
      remove(id) { cache.delete(id); dirty.delete(id); remove(id).catch(report); },
      async refresh(id) {
        if (dirty.has(id) || removed.has(id)) { await backend.flush(); return; }
        const entry = await call("read", { id }); if (entry) cache.set(id, entry); else cache.delete(id);
      },
      async flush() { await call("flush"); if (failure) throw failure; },
      async retry() {
        failure = null;
        for (const id of removed) await remove(id);
        for (const entry of dirty.values()) await persist(entry);
        await backend.flush();
      },
      async wire(payload) {
        const p = packet(payload); return call("wire", { payload: p.value, arrays: p.arrays });
      },
      close() { worker.terminate(); },
    };
    for (const entry of await call("load")) cache.set(entry.id, entry);
    return backend;
  } };
})(globalThis);
