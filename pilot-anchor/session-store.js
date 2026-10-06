/* Session-local durable storage. One copy of each payload, including while queued. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory;
  else root.createSessionStore = factory;
})(typeof globalThis !== "undefined" ? globalThis : this, function (storage, options) {
  "use strict";
  options = options || {};
  const PREFIX = "pilotSession_v2_", LOCK_PREFIX = "pilot-anchor:session:";
  const LEGACY_BACKUP = "pilotAnchorBackup_v1", LEGACY_OUTBOX = "pilotAnchorOutbox_v1";
  const locks = Object.prototype.hasOwnProperty.call(options, "locks") ? options.locks : (typeof navigator !== "undefined" && navigator.locks);
  const crypt = Object.prototype.hasOwnProperty.call(options, "crypto") ? options.crypto : (typeof crypto !== "undefined" && crypto);
  const heldLocks = new Map(), pendingLocks = new Map();
  const clone = (v) => JSON.parse(JSON.stringify(v));
  function failure(code, message) { const err = new Error(message); err.code = code; return err; }
  function checkId(id) { if (typeof id !== "string" || !id) throw failure("INVALID_SESSION", "sessionId is required"); }
  function requireLock(id) {
    checkId(id);
    if (!heldLocks.has(id)) throw failure("LOCK_REQUIRED", "Acquire the session Web Lock before changing stored data");
  }
  function read(id) { const raw = storage.getItem(PREFIX + id); return raw ? JSON.parse(raw) : null; }
  function write(entry) {
    requireLock(entry.id);
    const previous = read(entry.id);
    // Wall-clock timestamps can repeat within a millisecond. The lock serializes this counter.
    entry.revision = (previous && Number.isSafeInteger(previous.revision) && previous.revision >= 0 ? previous.revision : 0) + 1;
    entry.updatedAt = new Date().toISOString();
    storage.setItem(PREFIX + entry.id, JSON.stringify(entry));
    return entry;
  }
  function all() {
    const keys = [];
    for (let i = 0; i < storage.length; i++) { const k = storage.key(i); if (k && k.startsWith(PREFIX)) keys.push(k); }
    return keys.map((k) => JSON.parse(storage.getItem(k))).filter(Boolean);
  }
  function checkpoint(payload, search) {
    const id = payload.device.sessionId; requireLock(id); const old = read(id);
    if (old && old.state !== "active") return old; // A queued request is immutable, even on later UI events.
    return write({ id, state: "active", search, payload: clone(payload), ...(old && old.legacy ? { legacy: old.legacy } : {}) });
  }
  function enqueue(payload, search, held) {
    const id = payload.device.sessionId; requireLock(id); const old = read(id);
    if (old && old.state !== "active") return old;
    return write({ id, state: held ? "held" : "queued", search, payload: clone(payload), ...(old && old.legacy ? { legacy: old.legacy } : {}) });
  }
  function release(id) {
    requireLock(id);
    const e = read(id); if (e && e.state === "held") { e.state = "queued"; write(e); } return e;
  }
  function blocked(id, error) {
    requireLock(id);
    const e = read(id); if (e && e.state === "queued") { e.state = "blocked"; e.error = error; write(e); }
    return e;
  }
  function sent(id, response) {
    requireLock(id);
    const e = read(id); if (!e || e.state === "sent") return e;
    if (e.state !== "queued") throw failure("INVALID_STATE", "Only explicitly queued data may become sent");
    const d = e.payload.device;
    // Atomic replacement: the receipt survives reload before the large payload is removed.
    return write({ id, state: "sent", search: e.search, ...(e.legacy ? { legacy: e.legacy } : {}), receipt: {
      sessionId: id, completionCode: d.completionCode, participantId: d.participantId,
      exportedAt: d.exportedAt, partial: d.partial, kiosk: d.kiosk,
      file: response && response.file, receivedAt: new Date().toISOString(),
    } });
  }
  function remove(id) { requireLock(id); storage.removeItem(PREFIX + id); }
  function owns(id, owner) { const held = heldLocks.get(id); return !!held && held.owner === owner; }
  // Compatibility aliases: a synchronous localStorage lease cannot acquire cross-tab exclusivity.
  // claim only confirms a previously acquired real lock; unclaim releases it.
  function claim(id, owner) { return owns(id, owner); }
  function unclaim(id, owner) { return unlock(id, owner); }
  function lock(id, owner) {
    checkId(id);
    if (typeof owner !== "string" || !owner) return Promise.reject(failure("INVALID_OWNER", "owner is required"));
    if (heldLocks.has(id)) return Promise.resolve(owns(id, owner));
    const pending = pendingLocks.get(id);
    if (pending) return pending.owner === owner ? pending.promise : Promise.resolve(false);
    if (!locks || typeof locks.request !== "function") return Promise.reject(failure("LOCK_UNAVAILABLE", "Web Locks are unavailable; keep existing data and do not start another writer"));
    let resolveReady, rejectReady;
    const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
    pendingLocks.set(id, { owner, promise: ready });
    let request;
    try {
      request = locks.request(LOCK_PREFIX + id, { mode: "exclusive", ifAvailable: true }, async (granted) => {
        if (!granted) { resolveReady(false); return; }
        let releaseLock;
        const released = new Promise((resolve) => { releaseLock = resolve; });
        const held = { owner, releaseLock, done: null };
        heldLocks.set(id, held); resolveReady(true);
        try { await released; } finally { if (heldLocks.get(id) === held) heldLocks.delete(id); }
      });
    } catch (err) { pendingLocks.delete(id); rejectReady(err); return ready; }
    const done = Promise.resolve(request).catch((err) => { heldLocks.delete(id); rejectReady(err); });
    // request settles only when the callback releases the lock (or acquisition failed).
    ready.then((granted) => { pendingLocks.delete(id); if (granted && heldLocks.has(id)) heldLocks.get(id).done = done; }, () => pendingLocks.delete(id));
    return ready;
  }
  async function unlock(id, owner) {
    const held = heldLocks.get(id);
    if (!held || held.owner !== owner) return false;
    heldLocks.delete(id); held.releaseLock();
    if (held.done) await held.done;
    return true;
  }
  async function digest(text) {
    if (!crypt || !crypt.subtle) throw failure("CRYPTO_UNAVAILABLE", "Web Crypto is required to migrate legacy data safely");
    const bytes = await crypt.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
  }
  // Deterministic UUIDv8 derived from the legacy source. Interrupted migration retries reuse the same ID.
  function migrationId(hash) {
    return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-8${hash.slice(13, 16)}-${((parseInt(hash[16], 16) & 3) | 8).toString(16)}${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
  }
  async function migrateLegacy({ owner, search = "" } = {}) {
    const result = { migrated: [], retained: [], busy: false };
    const keep = (key, err) => result.retained.push({ key, code: err.code || err.name || "STORAGE_ERROR", error: err.message || String(err) });
    const migrationLock = "__legacy_migration__";
    let acquired;
    try { acquired = await lock(migrationLock, owner); }
    catch (err) { keep("legacy", err); return result; }
    if (!acquired) { result.busy = true; return result; }
    async function migrateOne(rawPayload, kind, sourceId, fallbackSearch) {
      if (!rawPayload || !rawPayload.device || typeof rawPayload.device !== "object" || Array.isArray(rawPayload.device) || !Array.isArray(rawPayload.trials)) throw failure("LEGACY_INVALID", "Legacy payload has invalid device/trials; original retained");
      const fingerprint = await digest(kind + ":" + sourceId + ":" + JSON.stringify(rawPayload));
      const id = rawPayload.device.sessionId || migrationId(fingerprint);
      const wasOwned = owns(id, owner);
      if (!await lock(id, owner)) throw failure("SESSION_BUSY", "Legacy session is active in another tab");
      try {
        const old = read(id);
        if (old && old.legacy && old.legacy.includes(fingerprint)) return id;
        const migratedPayload = clone(rawPayload); migratedPayload.device.sessionId = id;
        const state = kind === "backup" ? "active" : (migratedPayload.device.kiosk ? "held" : "queued");
        if (old) {
          if (!old.payload || JSON.stringify(old.payload) !== JSON.stringify(migratedPayload)) throw failure("MIGRATION_CONFLICT", "Existing session differs; original legacy data retained");
          if (old.state === "active" && kind === "outbox") old.state = state;
          old.legacy = (old.legacy || []).concat(fingerprint); write(old); return id;
        }
        // Legacy kiosk outbox had no durable 'approved to send' bit. Preserve it as held until explicit release.
        const entry = { id, state, search: fallbackSearch, payload: migratedPayload, legacy: [fingerprint] };
        write(entry);
        // Verify persisted content before removing the source; failed/quota writes leave the old key untouched.
        const saved = read(id);
        if (!saved || !saved.legacy || !saved.legacy.includes(fingerprint)) throw failure("MIGRATION_VERIFY", "Could not verify migrated data");
        return id;
      } finally { if (!wasOwned) await unlock(id, owner); }
    }
    try {
      const backupRaw = storage.getItem(LEGACY_BACKUP);
      if (backupRaw) {
        try {
          const backup = JSON.parse(backupRaw);
          const id = await migrateOne(backup, "backup", "backup", (backup.resume && backup.resume.search) || search);
          if (storage.getItem(LEGACY_BACKUP) !== backupRaw) throw failure("LEGACY_CHANGED", "Legacy backup changed during migration; retained");
          storage.removeItem(LEGACY_BACKUP); result.migrated.push(id);
        } catch (err) { keep(LEGACY_BACKUP, err); }
      }
      const outboxRaw = storage.getItem(LEGACY_OUTBOX);
      if (outboxRaw) {
        try {
          const outbox = JSON.parse(outboxRaw);
          if (!Array.isArray(outbox)) throw failure("LEGACY_INVALID", "Legacy outbox is not an array");
          const remaining = [];
          for (let i = 0; i < outbox.length; i++) {
            const item = outbox[i];
            try {
              const id = await migrateOne(item && item.payload, "outbox", item && item.id || "", search);
              result.migrated.push(id);
            } catch (err) { remaining.push(item); keep(LEGACY_OUTBOX + "[" + i + "]", err); }
          }
          if (storage.getItem(LEGACY_OUTBOX) !== outboxRaw) throw failure("LEGACY_CHANGED", "Legacy outbox changed during migration; retained");
          if (!remaining.length) storage.removeItem(LEGACY_OUTBOX);
          else if (remaining.length !== outbox.length) storage.setItem(LEGACY_OUTBOX, JSON.stringify(remaining));
        } catch (err) { keep(LEGACY_OUTBOX, err); }
      }
    } catch (err) { keep("legacy", err); }
    finally { await unlock(migrationLock, owner); }
    return result;
  }
  return { all, read, checkpoint, enqueue, release, blocked, sent, remove, claim, unclaim, owns, lock, unlock, migrateLegacy };
});
