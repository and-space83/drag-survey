/* Versioned participant information. Store this snapshot with each consent. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.PilotConsent = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const documentVersion = "2026-10-12-v3";
  const title = "スマートフォンのドラッグ軌道を用いたアンケート回答時の迷いの推定と不注意回答の検出";
  const statement = "私は、上記の研究の意義、目的、方法、危険性などを理解し、この研究への協力承諾が私自身の自由意思であること、同意後も随時その同意を撤回できることを理解した上で、被験者として参加・協力することを承諾します。";
  const description = [
    { heading: "研究の目的", text: "スマートフォンで2つの選択肢から1つをドラッグして回答するときの指の軌跡や回答にかかった時間を用いて、回答時の迷いを推定できるか、また、十分に注意を払わずに行われた回答を検出できるかを調べます。各回答の後にご自身で振り返って答えていただく迷いと自信の程度は、推定結果を比較・検証するために用います。" },
    { heading: "実施することと所要時間", text: "事前の質問、短い文章を読む時間の計測、画面と操作の説明、練習の後に、道徳的な判断を含む仮想的な場面について2つの選択肢から回答していただきます。場面への回答の後には、迷いと自信を5段階で振り返ります。問題文や指示を確認しているかを確かめる項目もあります。その後、画面の指示に従って操作する追加の課題を行い、最後に事後アンケートと研究の説明を行います。全体で40分ほど（35〜50分）を見込んでいます。途中に休憩もあります。" },
    { heading: "記録する情報", text: "入力した氏名・年齢・性別・利き手・機種名、画面に触れた指の位置と時刻、その軌跡、選択結果、迷いと自信の評定、回答をやり直したときの操作、画面の切り替えと中断・再開、文章を読む時間、説明・課題・振り返り・休憩等にかかった時間、端末・ブラウザと画面表示に関する情報、参加や実施を区別する識別番号、事後アンケートの回答を記録します。性別は「回答しない」を選べます。" },
    { heading: "氏名とプライバシー", text: "氏名は、参加確認と謝礼のお支払いに関する照合に使用します。研究の分析には、氏名を研究用IDに置き換えたデータを使用します。研究成果に氏名を掲載することはありません。情報は本研究とその連絡に使用し、研究責任者と研究補助者が管理します。" },
    { heading: "保存と送信", text: "「同意して実験に進む」を押すと、氏名・実施日・同意日時・同意した内容をサーバへ保存し、保存を確認してから実験を始めます。課題の回答データは追加の課題が終わった後に送信を始め、最後のアンケートの回答はその回答を終えた後に送信します。途中でやめた場合も、それまでに届いた同意や回答の記録は残ります。中断からの再開や通信失敗時の再送のため、入力情報と回答の途中経過をこの端末にも一時保存します。通信状況によっては、終了後の送信に時間がかかることがあります。" },
    { heading: "負担と参加・辞退の自由", text: "生死や家族・人間関係などに関わる仮想的な場面があり、人によっては不快に感じる可能性があります。参加は任意です。いつでも回答を中止でき、同意後も撤回を申し出ることができます。参加しないことや撤回自体によって不利益を受けることはありません。謝礼の支払条件は募集時の案内をご確認ください。気分がすぐれないときは中止し、必要に応じて下記へご相談ください。ご希望に応じて学生相談室等の窓口をご案内します。" },
    { heading: "質問・同意撤回の連絡先", text: "名古屋市立大学大学院理学研究科 教授 渡邊裕司（研究実施責任者）／ 電話：052-872-5037 ／ メール：yuji@nsc.nagoya-cu.ac.jp。研究補助者：同研究科 修士2年 安藤大翔。質問や同意撤回は、氏名と実施日を添えてご連絡ください。" },
  ];
  function studyDate(at) { return new Date(Date.parse(at) + 9 * 3600000).toISOString().slice(0, 10); }
  function create(name, at = new Date().toISOString()) {
    return { schemaVersion: 1, documentVersion, title, description: JSON.parse(JSON.stringify(description)), statement,
      name: name.trim(), studyDate: studyDate(at), consentedAt: at, method: "checkbox", accepted: true, scrolledToEnd: true };
  }
  // Non-overlapping screen-level totals. Unobserved intervals are explicit, not inferred as task time.
  function timeline(saved, wall = () => Date.now(), mono = () => performance.now()) {
    const state = saved ? JSON.parse(JSON.stringify(saved)) : { byScreen: {}, startedAt: wall(), lastWall: wall(), unobservedMs: 0 };
    if (saved) state.unobservedMs += Math.max(0, wall() - saved.lastWall);
    let screen = "consent-save", last = mono(), finished = false;
    function flush() { if (finished) return; const t = mono(); state.byScreen[screen] = (state.byScreen[screen] || 0) + Math.max(0, t-last); last=t; state.lastWall=wall(); }
    return {
      change(next) { flush(); screen=next; },
      snapshot() { flush(); return JSON.parse(JSON.stringify(state)); },
      finish() { flush(); finished=true; const accounted = Object.values(state.byScreen).reduce((a,b)=>a+b,0) + state.unobservedMs; return { ...state, elapsedMs: state.lastWall-state.startedAt, accountedMs: accounted, differenceMs: state.lastWall-state.startedAt-accounted }; },
    };
  }
  return { documentVersion, title, statement, description, create, timeline, studyDate };
});
