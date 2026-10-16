/* One sender per session. A is frozen once, B is sent only after A's verified receipt. */
"use strict";
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory;
  else root.createStagedDelivery = factory;
})(globalThis, function ({ store, encode, send, onState = () => {}, online = () => navigator.onLine !== false,
  setTimer = setTimeout, clearTimer = clearTimeout, random = Math.random }) {
  const running = new Map(), timers = new Map(), attempts = new Map(), wire = new Map();
  function cancelTimer(id) { if (timers.has(id)) { clearTimer(timers.get(id)); timers.delete(id); } }
  function notify(id, state, extra = {}) { onState(id, { state, attempt: attempts.get(id) || 1, ...extra }); }
  async function request(payload, id, stage) {
    const key = id + ":" + stage;
    if (!wire.has(key)) wire.set(key, await encode(payload));
    const encoded = wire.get(key), result = await send(payload, encoded);
    const expected = result && (stage === "tasks" ? result.tasksDigest : result.finalDigest);
    if (!result || result.protocol == null || !result.sessionId || !result.state || typeof expected !== "string") {
      const error = new Error("collector did not return a complete save receipt"); error.code = "incomplete_receipt"; error.retryable = true; throw error;
    }
    if (result.protocol !== payload.protocol || result.sessionId !== id || expected !== encoded.digest ||
        !(stage === "tasks" ? ["tasks_received", "completed", "partial"] : ["completed", "partial"]).includes(result.state)) {
      const error = new Error("collector receipt does not match the saved stage"); error.code = "receipt_mismatch"; error.retryable = false; throw error;
    }
    return result;
  }
  async function pump(id) {
    let entry = store.read(id);
    if (!entry?.delivery?.tasks || ["held", "sent"].includes(entry.state)) return;
    if (entry.delivery.blocked || entry.state === "blocked") { notify(id, "blocked"); return; }
    try {
      await store.flush();
      if (!online()) { notify(id, "offline"); return; }
      attempts.set(id, (attempts.get(id) || 0) + 1);
      if (!entry.delivery.tasksReceipt) {
        notify(id, "tasks");
        const receipt = await request(entry.delivery.tasks, id, "tasks");
        store.stage(id, d => ({ ...d, tasksReceipt: receipt })); await store.flush();
        wire.delete(id + ":tasks"); attempts.set(id, 0);
      }
      entry = store.read(id);
      if (entry.state !== "queued") { notify(id, "waiting_for_survey"); return; }
      if (!entry.delivery.finalRequest) {
        const payload = { kind: "finalize", protocol: entry.delivery.tasks.protocol, device: entry.payload.device, trials: [], tasksDigest: entry.delivery.tasksReceipt.tasksDigest };
        store.stage(id, d => ({ ...d, finalRequest: payload })); await store.flush();
      }
      entry = store.read(id); notify(id, "finalize");
      const receipt = await request(entry.delivery.finalRequest, id, "finalize");
      store.sent(id, receipt); await store.flush();
      wire.delete(id + ":finalize"); attempts.delete(id); notify(id, "sent");
    } catch (error) {
      if (error.retryable === false) {
        store.stage(id, d => ({ ...d, blocked: error.code || "invalid_payload" }));
        if (store.read(id)?.state === "queued") store.blocked(id, error.code || "invalid_payload");
        await store.flush(); notify(id, "blocked", { error }); return;
      }
      notify(id, online() ? "retry" : "offline", { error });
      if (online()) {
        const schedule = [2000, 5000, 10000, 20000, 30000], n = attempts.get(id) || 1;
        const delay = schedule[Math.min(n - 1, schedule.length - 1)] + Math.floor(random() * 1000);
        timers.set(id, setTimer(() => { timers.delete(id); kick(id); }, delay));
      }
    }
  }
  function kick(id) {
    if (running.has(id)) return running.get(id);
    cancelTimer(id);
    const task = pump(id).finally(() => running.delete(id));
    running.set(id, task); return task;
  }
  async function start(id, payload) {
    const old = store.read(id);
    if (!old.delivery?.tasks) { store.stage(id, d => ({ ...d, tasks: payload })); await store.flush(); }
    return kick(id);
  }
  return { start, kick, busy: id => running.has(id), stop(id) { cancelTimer(id); } };
});
