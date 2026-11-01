// UI28: observed page exposure and interactions, never a reading/understanding score.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.PilotExplanationTelemetry = factory();
})(typeof window === "object" ? window : globalThis, function () {
  "use strict";
  const SCHEMA = "explanation-interactions-v1";
  const identifier = value => typeof value === "string" && /^[a-zA-Z0-9_.:-]{1,100}$/.test(value) ? value : null;
  const number = value => Number.isFinite(value) ? Math.max(0, Math.round(value)) : null;
  function contextFields(context) {
    const out = {};
    for (const key of ["screen", "page", "phase", "block"]) {
      const value = identifier(context[key]); if (value != null) out[key] = value;
    }
    if (number(context.trial) != null) out.trial = number(context.trial);
    out.review = context.review === true;
    return out;
  }
  function create(options) {
    const now = options.now, wallNow = options.wallNow || (() => new Date().toISOString());
    let active = null, activeKey = null, contextKey = null, contextAt = now(), previousAt = now();
    let visible = true, visibleAccum = 0;
    const changed = () => options.changed?.();
    function data() {
      const device = options.getDevice();
      if (!device.explanationTelemetry || device.explanationTelemetry.schema !== SCHEMA) {
        device.explanationTelemetry = { schema: SCHEMA, version: options.version, startedAt: wallNow(), visits: [], interactions: [] };
      }
      return device.explanationTelemetry;
    }
    const keyOf = context => JSON.stringify(contextFields(context));
    function checkpoint(at = now()) {
      if (active) {
        active.elapsedMs = number(at - active._startedAt);
        if (visible) visibleAccum += Math.max(0, at - previousAt);
        active.visibleMs = Math.round(visibleAccum);
      }
      previousAt = at;
    }
    function close(reason, at = now()) {
      checkpoint(at);
      if (active) { active.status = "closed"; active.endReason = reason; delete active._startedAt; }
      active = null; activeKey = null;
    }
    function sync(context = options.getContext(), at = now()) {
      context = context || {};
      checkpoint(at);
      const key = keyOf(context);
      if (key !== contextKey) { contextKey = key; contextAt = at; }
      if (!context.explanation || context.finished) { if (active) close("page_change", at); return null; }
      if (key === activeKey) return active;
      close("page_change", at);
      const store = data();
      active = { visit: store.visits.length + 1, ...contextFields(context), version: options.version,
        shownAt: wallNow(), elapsedMs: 0, visibleMs: 0, advanceCount: 0, nonInteractiveTapCount: 0,
        initialWaitMs: number(context.waitRemainingMs) || 0, status: "open" };
      // The monotonic clock is runtime-only; checkpoint writes durations into the public row.
      Object.defineProperty(active, "_startedAt", { value: at, configurable: true });
      store.visits.push(active); activeKey = key; previousAt = at; visibleAccum = 0;
      return active;
    }
    function advance(context, control, source) {
      const row = sync(context), at = now(); checkpoint(at);
      const event = { event: "advance", ...contextFields(context), control: identifier(control), source,
        at: wallNow(), elapsedMs: row ? row.elapsedMs : number(at - contextAt),
        visibleMs: row ? row.visibleMs : null, visit: row?.visit || null,
        attempt: row ? ++row.advanceCount : null, remainingWaitMs: number(context.waitRemainingMs) || 0,
        outcome: context.blockedReason ? "blocked" : "pending", reason: identifier(context.blockedReason), gateAtActivation: identifier(context.blockedReason) };
      data().interactions.push(event);
      return event;
    }
    function resolve(event, after) {
      if (keyOf(after || {}) !== JSON.stringify(contextFields(event))) { event.outcome = "page_changed"; event.reason = null; }
      else if (event.outcome === "pending") event.outcome = "no_page_change";
      sync(after); changed();
    }
    function tap(context, kind, durationMs) {
      const row = sync(context); checkpoint();
      if (row) row.nonInteractiveTapCount++;
      data().interactions.push({ event: kind, ...contextFields(context), visit: row?.visit || null,
        at: wallNow(), elapsedMs: row ? row.elapsedMs : number(now() - contextAt),
        visibleMs: row ? row.visibleMs : null, gestureMs: number(durationMs) });
      changed();
    }
    function setVisible(value) { checkpoint(); visible = value; }
    function restore(saved) {
      active = null; activeKey = null; contextKey = null; previousAt = contextAt = now();
      const value = saved && saved.schema === SCHEMA ? JSON.parse(JSON.stringify(saved)) : null;
      if (value) for (const visit of value.visits || []) {
        if (visit.status === "open") { visit.status = "interrupted"; visit.endReason = "reload"; }
      }
      options.getDevice().explanationTelemetry = value;
    }
    function finish() { close("session_end"); }
    function install(document, window) {
      let gesture = null, scheduled = false;
      const controls = 'button,input,select,textarea,a[href],label,[role="button"],[role="link"],[contenteditable="true"],[data-tap-action]';
      const choiceTargets = '#choiceA,#choiceB';
      const visibleElement = element => element && element.getClientRects().length && window.getComputedStyle(element).visibility !== "hidden";
      function progressButton(target, context, point) {
        const explicit = target?.closest?.(controls);
        if (explicit && !(context.nextIds || []).includes(explicit.id)) return null;
        if (explicit) return explicit;
        // Disabled controls can have pointer-events:none. Recover only a visible, known Next rectangle.
        if (point) for (const id of context.nextIds || []) {
          const element = document.getElementById(id);
          if (!visibleElement(element) || !element.disabled) continue;
          const r = element.getBoundingClientRect();
          if (point.x >= r.left && point.x <= r.right && point.y >= r.top && point.y <= r.bottom) return element;
        }
        return null;
      }
      function scheduleSync() {
        if (scheduled) return; scheduled = true;
        Promise.resolve().then(() => { scheduled = false; sync(); });
      }
      document.addEventListener("click", event => {
        const context = options.getContext() || {};
        if (context.finished) return;
        const button = progressButton(event.target, context);
        if (!button || button.disabled) return;
        const recorded = advance(context, button.id, event.detail === 0 ? "keyboard_or_programmatic" : "click");
        // Observe the result after existing handlers. Never prevent/default, synthesize a click or change UI.
        // A microtask can run between native event listeners, before the app's target handler.
        window.setTimeout(() => resolve(recorded, options.getContext()), 0);
      }, true);
      document.addEventListener("pointerdown", event => {
        if (event.isPrimary === false) { gesture = null; return; }
        const context = options.getContext() || {};
        const idleTask = context.screen === "task" && !context.explanation && context.canStart === true;
        if (context.finished || context.recording || document.hidden || event.target?.closest?.('#start') ||
            (!idleTask && event.target?.closest?.(choiceTargets))) { gesture = null; return; }
        const button = progressButton(event.target, context, { x: event.clientX, y: event.clientY });
        if (!button && event.target?.closest?.(controls)) { gesture = null; return; }
        if (button && !button.disabled) { gesture = null; return; }
        sync(context);
        gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, at: now(), context, key: keyOf(context), button: button?.id || null };
      }, true);
      document.addEventListener("pointermove", event => {
        if (gesture && event.pointerId === gesture.id && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 12) gesture = null;
      }, true);
      document.addEventListener("pointerup", event => {
        const started = gesture; gesture = null;
        const context = options.getContext() || {};
        if (!started || started.id !== event.pointerId || document.hidden || context.finished || context.recording || now() - started.at > 1000 ||
            started.key !== keyOf(context) || Math.hypot(event.clientX - started.x, event.clientY - started.y) > 12) return;
        if (started.button) {
          const blocked = { ...started.context, blockedReason: started.context.blockedReason || "disabled_control" };
          const recorded = advance(blocked, started.button, "disabled_pointer_tap");
          resolve(recorded, context);
        } else {
          const outsideStart = context.screen === "task" && !context.explanation && context.canStart === true;
          tap(context, outsideStart ? "outside_start_before_recording" : "nonInteractiveTap", now() - started.at);
        }
      }, true);
      for (const name of ["pointercancel", "scroll", "contextmenu"]) document.addEventListener(name, () => { gesture = null; }, true);
      window.addEventListener("blur", () => { gesture = null; });
      document.addEventListener("visibilitychange", () => { gesture = null; setVisible(!document.hidden); changed(); });
      window.addEventListener("pagehide", () => { gesture = null; setVisible(false); changed(); });
      window.addEventListener("pageshow", () => { setVisible(!document.hidden); sync(); });
      const observer = new window.MutationObserver(scheduleSync);
      observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "hidden", "disabled"] });
      visible = !document.hidden; sync();
      return () => observer.disconnect();
    }
    return { sync, checkpoint, advance, resolve, tap, setVisible, restore, finish, install };
  }
  return { create, schema: SCHEMA };
});
