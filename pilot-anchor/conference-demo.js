/* Conference experience: no session store, network, persistence, or research recovery. */
(function (root) {
  "use strict";
  const ITEM_IDS = ["honesty-clear", "honesty-mid", "care-conflict-2"];
  const plain = value => String(value || "").replace(/\|/g, "");
  function start() {
    const $ = id => document.getElementById(id);
    const items = ITEM_IDS.map(id => root.PILOT_BANK?.moral?.bank.find(item => (item.id || item.mtype + "-" + item.level) === id));
    if (root.pilotAssetLoadFailed || root.conferenceDemoAssetLoadFailed || items.some(item => !item) || typeof root.PilotTrialRecorder?.create !== "function" ||
        !Array.isArray(root.PilotRatingContent?.items) || typeof root.PilotChoiceControls?.create !== "function") {
      $("wcBody").innerHTML = "<h1>読み込みが完了していません</h1><p>通信を確認して、もう一度読み込んでください。</p>";
      $("wcNext").textContent = "再読み込み"; $("wcNext").onclick = () => location.reload();
      return;
    }
    document.title = "指の動きと選択を体験する";
    document.body.classList.add("conference-demo", "block-moral");
    const recorder = root.PilotTrialRecorder.create({ STOP_MIN_MS: 500, STOP_NOTICE_MS: 3000, STOP_EPS_PX: 6, LATE_START_MS: 3000, EARLY_CPS: 25 });
    const controls = root.PilotChoiceControls.create({ $ });
    const surface = $("surface"), startButton = $("start"), choiceA = $("choiceA"), choiceB = $("choiceB");
    let records = [], index = 0, currentTrial = null, activePointerId = null, screen = "task", stemShownT = 0, aborts = 0, ratingPage = 0, ratingShownT = 0;
    const inside = (r, e) => e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    const node = (tag, className, text) => { const n = document.createElement(tag); if (className) n.className = className; if (text != null) n.textContent = text; return n; };
    const reset = node("button", "conference-reset", "はじめから"); reset.id = "conferenceReset"; reset.type = "button";
    document.body.append(reset); reset.addEventListener("click", restart);
    const results = node("section", "screen"); results.id = "conferenceResults"; results.setAttribute("aria-labelledby", "conferenceResultsTitle"); document.body.append(results);
    $("phaseLabel").textContent = "体験"; $("ratingPhaseLabel").textContent = "体験";
    $("progress").classList.add("on"); $("ratingProgress").classList.add("on"); $("ratingTopbar").classList.add("on");
    $("rating").classList.add("with-progress");
    $("taskMsg").setAttribute("role", "status"); $("taskMsg").setAttribute("aria-live", "polite");
    $("numA").className = "txt"; $("numB").className = "txt";
    function show(name) {
      screen = name;
      for (const element of document.querySelectorAll(".screen")) element.classList.toggle("active", element.id === name);
      reset.hidden = name === "conferenceResults";
    }
    function releaseCapture() {
      const pointer = activePointerId; activePointerId = null;
      if (pointer != null) { try { surface.releasePointerCapture(pointer); } catch (_) {} }
      $("dragPosition").hidden = true;
      choiceA.classList.remove("drag-inside"); choiceB.classList.remove("drag-inside");
    }
    function present() {
      releaseCapture(); currentTrial = null; aborts = 0;
      const item = items[index];
      $("stem").replaceChildren(); const text = node("div");
      item.stem.split("|").forEach(part => text.append(node("span", "nb", part)));
      $("stem").append(text); $("stem").style.visibility = "visible";
      $("numA").textContent = item.a.label; $("numB").textContent = item.b.label;
      $("numA").style.visibility = "hidden"; $("numB").style.visibility = "hidden";
      startButton.classList.remove("armed"); $("taskMsg").textContent = "";
      for (const id of ["counter", "ratingCounter"]) $(id).textContent = (index + 1) + " / " + items.length;
      for (const id of ["progressFill", "ratingProgressFill"]) $(id).style.width = (index / items.length * 100) + "%";
      show("task"); stemShownT = performance.now();
    }
    function restart() {
      releaseCapture(); records = []; index = 0; currentTrial = null; results.replaceChildren(); present();
    }
    function retry(message) {
      releaseCapture(); currentTrial = null; aborts++;
      $("numA").style.visibility = "hidden"; $("numB").style.visibility = "hidden";
      startButton.classList.remove("armed"); $("taskMsg").textContent = message + "。スタートからもう一度";
    }
    function feedback(e) {
      const rect = surface.getBoundingClientRect(), marker = $("dragPosition");
      marker.hidden = false; marker.style.left = (e.clientX - rect.left) + "px"; marker.style.top = (e.clientY - rect.top) + "px";
      choiceA.classList.toggle("drag-inside", inside(choiceA.getBoundingClientRect(), e));
      choiceB.classList.toggle("drag-inside", inside(choiceB.getBoundingClientRect(), e));
    }
    surface.addEventListener("pointerdown", e => {
      if (screen !== "task" || activePointerId != null || (e.pointerType === "mouse" && e.button !== 0)) return;
      if (!inside(startButton.getBoundingClientRect(), e)) { $("taskMsg").textContent = "スタートから選択肢まで運んでください"; return; }
      e.preventDefault(); activePointerId = e.pointerId;
      try { surface.setPointerCapture(e.pointerId); } catch (_) {}
      const item = items[index];
      currentTrial = recorder.begin({ e, phase: "main", trialIndex: index, instrIndex: 0, recordsLength: records.length, aborts,
        cell: item, block: "moral", stimulusType: "text-choice", meta: { itemId: ITEM_IDS[index], stem: plain(item.stem), leftLabel: item.a.label, rightLabel: item.b.label },
        resumePending: false, stemShownT, stopNoticeShown: false, sRect: surface.getBoundingClientRect(), stRect: startButton.getBoundingClientRect(),
        aRect: choiceA.getBoundingClientRect(), bRect: choiceB.getBoundingClientRect(), timeOrigin: performance.timeOrigin, dpr: devicePixelRatio || 1 });
      recorder.pushEvent(currentTrial, e, "down");
      currentTrial.events.push({ seq: currentTrial.events.length, t: e.timeStamp, ...currentTrial.revealXY, type: "reveal" });
      $("numA").style.visibility = "visible"; $("numB").style.visibility = "visible";
      startButton.classList.add("armed"); $("taskMsg").textContent = ""; feedback(e);
    }, { passive: false });
    surface.addEventListener("pointermove", e => {
      if (screen !== "task" || e.pointerId !== activePointerId || !currentTrial) return;
      e.preventDefault();
      if (typeof e.getCoalescedEvents === "function") for (const point of e.getCoalescedEvents()) recorder.pushEvent(currentTrial, point, "coalesced");
      recorder.pushEvent(currentTrial, e, "dispatched");
      if (currentTrial.initiationT == null && recorder.hasLeftStart(currentTrial._stRect, e)) currentTrial.initiationT = e.timeStamp;
      feedback(e);
    }, { passive: false });
    surface.addEventListener("pointerup", e => {
      if (screen !== "task" || e.pointerId !== activePointerId || !currentTrial) return;
      e.preventDefault(); recorder.pushEvent(currentTrial, e, "up");
      const side = inside(choiceA.getBoundingClientRect(), e) ? "left" : inside(choiceB.getBoundingClientRect(), e) ? "right" : null;
      const disp = currentTrial.events.filter(point => point.type === "dispatched");
      if (!side) { retry("選択肢の中で離してください"); return; }
      if (disp.length < 3) { retry("選択肢までゆっくり運んでください"); return; }
      recorder.complete(currentTrial, { disp, aborts, stemChars: plain(items[index].stem).length }); currentTrial.choiceSide = side;
      releaseCapture(); prepareRating();
    }, { passive: false });
    for (const type of ["pointercancel", "lostpointercapture"]) surface.addEventListener(type, e => {
      if (activePointerId === e.pointerId) retry("操作が中断されました");
    });
    document.addEventListener("visibilitychange", () => { if (document.hidden && activePointerId != null) retry("操作が中断されました"); });
    window.addEventListener("resize", () => {
      if (activePointerId == null || !currentTrial) return;
      const old = currentTrial._sRect, fresh = surface.getBoundingClientRect();
      if (Math.abs(fresh.width - old.width) > 2 || Math.abs(fresh.height - old.height) > 2) retry("画面の大きさが変わりました");
    });
    function prepareRating() {
      $("ratingHead").textContent = "回答について教えてください";
      $("ratingAnswer").hidden = false; $("ratingAnswer").replaceChildren(node("span", "", "あなたの回答: "), node("b", "", currentTrial.choiceSide === "left" ? currentTrial.leftLabel : currentTrial.rightLabel));
      const host = $("ratingItems"); host.replaceChildren();
      for (const item of root.PilotRatingContent.items) {
        const wrap = node("div", "qitem"); wrap.id = "qitem-" + item.key;
        const question = node("div", "qi-text", item.q); question.id = "rating-label-" + item.key;
        const group = node("div", "likert"); group.setAttribute("aria-labelledby", question.id);
        for (let value = 1; value <= 5; value++) {
          const button = node("button"); button.type = "button"; button.dataset.val = String(value);
          button.append(node("b", "", value), node("span", "", item.labels[value - 1]));
          button.addEventListener("click", () => {
            currentTrial.ratings[item.key] = { value, rt_ms: +(performance.now() - ratingShownT).toFixed(1) };
            for (const peer of group.children) peer.classList.toggle("sel", peer === button);
            controls.syncChoiceState(group); updateRatingButtons();
          }); group.append(button);
        }
        controls.initChoiceGroup(group, false); wrap.append(question, group); host.append(wrap);
      }
      show("rating"); showRatingPage(0);
    }
    function updateRatingButtons() {
      $("ratingNext").disabled = !currentTrial?.ratings.hesitation;
      $("ratingSubmit").disabled = !currentTrial?.ratings.hesitation || !currentTrial?.ratings.confidence;
    }
    function showRatingPage(page) {
      ratingPage = page; ratingShownT = performance.now();
      root.PilotRatingContent.items.forEach((item, at) => { $("qitem-" + item.key).hidden = at !== page; });
      $("ratingBack").style.display = page ? "" : "none";
      $("ratingBackNote").hidden = !page;
      $("ratingNext").style.display = page ? "none" : ""; $("ratingSubmit").style.display = page ? "" : "none";
      $("ratingSubmit").textContent = index === items.length - 1 ? "結果を見る" : "決定して次へ";
      $("ratBtnRow").classList.toggle("with-back", page === 1); updateRatingButtons();
      $("rating").querySelector(".qwrap").scrollTop = 0;
    }
    $("ratingNext").addEventListener("click", () => { if (screen === "rating" && ratingPage === 0 && currentTrial.ratings.hesitation) showRatingPage(1); });
    $("ratingBack").addEventListener("click", () => { if (screen === "rating" && ratingPage === 1) showRatingPage(0); });
    $("ratingSubmit").addEventListener("click", () => {
      if (screen !== "rating" || ratingPage !== 1 || !currentTrial.ratings.hesitation || !currentTrial.ratings.confidence) return;
      const { _sRect, _stRect, ...completed } = currentTrial; records.push(completed); index++;
      if (index < items.length) present(); else showResults();
    });
    function trajectory(record, at) {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"), geom = record.geom;
      const labelSize = Math.max(20, geom.surface.h * 12 / 250);
      svg.classList.add("conference-plot"); svg.setAttribute("viewBox", `0 0 ${geom.surface.w} ${geom.surface.h}`);
      svg.setAttribute("role", "img"); svg.setAttribute("aria-label", `第${at + 1}問でスタートから${record.choiceSide === "left" ? "左" : "右"}の選択肢まで動かした経路`);
      function add(tag, attrs, text) {
        const element = document.createElementNS(svg.namespaceURI, tag);
        for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, String(value));
        if (text != null) element.textContent = text; svg.append(element); return element;
      }
      for (const [key, side, label] of [["A", "left", "左"], ["B", "right", "右"]]) {
        const box = geom[key];
        add("rect", { x: box.cx - box.w / 2, y: box.cy - box.h / 2, width: box.w, height: box.h, rx: 12, fill: side === record.choiceSide ? "#dcefe4" : "#ffffff", stroke: "#12855a", "stroke-width": 2 });
        add("text", { x: box.cx, y: box.cy, "dominant-baseline": "central", "text-anchor": "middle", fill: "#256647", "font-size": labelSize }, label);
      }
      const points = record.events.filter(point => ["down", "dispatched", "up"].includes(point.type));
      if (points.length) {
        add("polyline", { points: points.map(p => `${p.x},${p.y}`).join(" "), fill: "none", stroke: "#1668c4", "stroke-width": 3, "vector-effect": "non-scaling-stroke", "stroke-linejoin": "round", "stroke-linecap": "round" });
        for (const p of [points[0], points[points.length - 1]]) add("circle", { cx: p.x, cy: p.y, r: 6, fill: "#1668c4" });
      }
      add("text", { x: geom.start.cx, y: Math.min(geom.surface.h - labelSize / 2, geom.start.cy + labelSize * 1.4), "text-anchor": "middle", fill: "#685044", "font-size": labelSize }, "スタート");
      return svg;
    }
    function showResults() {
      const wrap = node("div", "conference-results-wrap"), title = node("h1", "", "あなたの回答の軌跡"); title.id = "conferenceResultsTitle"; title.tabIndex = -1;
      wrap.append(title, node("p", "conference-results-note", "3問で動かした経路と、あなたが選んだ迷い・自信を見比べられます。"));
      const cards = node("div", "conference-cards");
      records.forEach((record, at) => {
        const card = node("article", "conference-card"); card.dataset.itemId = record.itemId;
        card.append(node("h2", "", `第${at + 1}問`), node("p", "conference-stem", record.stem), trajectory(record, at));
        const answer = node("p", "conference-answer", "あなたの回答"); answer.append(node("b", "", record.choiceSide === "left" ? record.leftLabel : record.rightLabel)); card.append(answer);
        const metrics = node("dl", "conference-metrics");
        for (const [label, ms] of [["問題表示から押すまで", record.preStartMs], ["押してから動き出すまで", record.rt_ms], ["動き出してから離すまで", record.mt_proxy_ms], ["押してから離すまで（合計）", record.total_ms]]) {
          metrics.append(node("dt", "", label), node("dd", "", (ms / 1000).toFixed(2) + " 秒"));
        }
        card.append(metrics); const ratings = node("div", "conference-ratings");
        for (const item of root.PilotRatingContent.items) {
          const value = record.ratings[item.key].value;
          ratings.append(node("p", "", (item.key === "hesitation" ? "迷い" : "自信") + ` ${value} / 5 — ` + item.labels[value - 1]));
        }
        card.append(ratings); cards.append(card);
      });
      const again = node("button", "btn primary", "もう一度試す"); again.id = "conferenceRestart"; again.type = "button"; again.addEventListener("click", restart);
      wrap.append(cards, again, node("p", "conference-data-note", "回答はこの画面だけに表示されます。もう一度試すか、ページを開き直すと消えます。"));
      results.replaceChildren(wrap); show("conferenceResults"); results.scrollTop = 0; title.focus({ preventScroll: true });
    }
    if (new URLSearchParams(location.search).get("debug") === "1") root.__conferenceDemo = Object.freeze({
      snapshot: () => JSON.parse(JSON.stringify({ screen, index, itemIds: ITEM_IDS, records, currentTrial, activePointerId })),
    });
    restart();
  }
  root.PilotConferenceDemo = Object.freeze({ start });
})(window);
