(function (root) {
  "use strict";
  // Shared instruction timing. These are presentation gates/cues, not a reading-completion measurement.
  function create(options) {
    const enabled = options.minReadEnabled;
    const getBaseline = options.getBaseline;
    function minReadMs(text) {
      if (!enabled) return 0;
      const chars = String(text || "").replace(/<[^>]*>/g, "").replace(/\|/g, "").length;
      return Math.round(0.8 * Math.max(1200, Math.min(7000, Math.round((chars / 22) * 1000) + 500)));
    }
    function readCueDelay(text) {
      const chars = String(text || "").replace(/<[^>]*>/g, "").replace(/\|/g, "").length;
      const baseline = getBaseline();
      const base = (baseline && baseline.charsPerSec) || null;
      const cps = base ? Math.max(3, base * 0.45) : 5;
      return Math.max(3500, Math.min(11000, Math.round((chars / cps) * 1000) + 1200));
    }
    return { minReadMs, readCueDelay };
  }
  root.PilotReadingPolicy = { create };
})(window);
