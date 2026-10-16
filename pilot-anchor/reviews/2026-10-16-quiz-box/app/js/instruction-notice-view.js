// 練習確認・注意画面のDOM。確認条件・時刻・記録・保存・次画面は呼び出し側で扱う。
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.PilotInstructionNoticeView = factory();
})(typeof window === "object" ? window : globalThis, function () {
  "use strict";
  function create({ $, document }) {
    function renderPracticeCheck({ keys, checked, rules, onCheckedChange }) {
      $("practiceCheckItems").replaceChildren();
      for (const key of keys) {
        const rule = rules[key], label = document.createElement("label");
        label.className = "rule-check";
        const input = document.createElement("input"); input.type = "checkbox"; input.dataset.rule = key; input.checked = checked.includes(key);
        const text = document.createElement("span"); text.innerHTML = '<b class="rule-title">' + rule.title + '</b><span>' + rule.html + '</span>';
        label.append(input, text); $("practiceCheckItems").appendChild(label);
        input.addEventListener("change", () => {
          onCheckedChange([...$("practiceCheckItems").querySelectorAll("input:checked")].map(e => e.dataset.rule));
        });
      }
    }
    function setPracticeCheckEnabled(enabled) { $("practiceCheckGo").disabled = !enabled; }
    function setNoticeKind(kind) { $("notice").dataset.kind = kind; }
    function setNoticeBody(html) { $("noticeText").innerHTML = html; }
    function resetNoticeScroll() { $("notice").querySelector(".pad").scrollTop = 0; $("noticeText").scrollTop = 0; }
    return { renderPracticeCheck, setPracticeCheckEnabled, setNoticeKind, setNoticeBody, resetNoticeScroll };
  }
  return { create };
});
