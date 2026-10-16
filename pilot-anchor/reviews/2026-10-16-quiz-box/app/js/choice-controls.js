// 選択部品の見た目・ARIA・キーボード操作。回答の保存と画面進行は呼び出し側で行う。
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.PilotChoiceControls = factory();
})(typeof window === "object" ? window : globalThis, function () {
  "use strict";
  function create({ $ }) {
    function syncChoiceState(c) {
      if (!c) return;
      const buttons = [...c.querySelectorAll("button")];
      const single = c.getAttribute("role") === "radiogroup";
      const tabStop = buttons.find((b) => b.classList.contains("sel")) || buttons[0];
      for (const b of buttons) {
        b.setAttribute("aria-checked", String(b.classList.contains("sel")));
        b.tabIndex = single && b !== tabStop ? -1 : 0;
      }
    }
    function initChoiceGroup(c, multiple) {
      c.setAttribute("role", multiple ? "group" : "radiogroup");
      if (!c.hasAttribute("aria-labelledby")) {
        const field = c.closest(".field"), label = field && field.querySelector("label");
        if (label) { if (!label.id) label.id = c.id + "-label"; c.setAttribute("aria-labelledby", label.id); }
      }
      for (const b of c.querySelectorAll("button")) b.setAttribute("role", multiple ? "checkbox" : "radio");
      syncChoiceState(c);
      if (!multiple) c.addEventListener("keydown", (e) => {
        if (!["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"].includes(e.key)) return;
        const buttons = [...c.querySelectorAll("button")].filter((b) => !b.disabled && b.getClientRects().length);
        const at = buttons.indexOf(e.target);
        if (at < 0) return;
        e.preventDefault();
        const next = e.key === "Home" ? 0 : e.key === "End" ? buttons.length - 1 :
          (at + (["ArrowRight", "ArrowDown"].includes(e.key) ? 1 : buttons.length - 1)) % buttons.length;
        buttons[next].focus({ preventScroll: true }); buttons[next].click();
      });
    }
    function wireSeg(containerId, onPick) {
      const c = $(containerId);
      initChoiceGroup(c, false);
      for (const b of c.querySelectorAll("button")) {
        b.addEventListener("click", () => {
          for (const o of c.children) o.classList.toggle("sel", o === b);
          syncChoiceState(c);
          onPick(b.dataset.val);
        }, { passive: true });
      }
    }
    function wireChecks(containerId, onChange) {
      const c = $(containerId);
      initChoiceGroup(c, true);
      for (const b of c.querySelectorAll("button")) {
        b.addEventListener("click", () => {
          const peers = [...c.querySelectorAll("button")].filter(o => o.dataset.part === b.dataset.part);
          if (b.dataset.none === "1") {
            const willSel = !b.classList.contains("sel");
            for (const o of peers) o.classList.toggle("sel", o === b && willSel);
          } else {
            b.classList.toggle("sel");
            for (const o of peers) if (o.dataset.none === "1") o.classList.remove("sel");
          }
          syncChoiceState(c);
          onChange([...c.querySelectorAll("button.sel")].map((o) => o.dataset.val));
        }, { passive: true });
      }
    }
    return { syncChoiceState, initChoiceGroup, wireSeg, wireChecks };
  }
  return { create };
});
